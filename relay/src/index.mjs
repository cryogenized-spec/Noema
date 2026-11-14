import {
  LIMITS, randomToken, sha256, fingerprint, alias, messageText,
  verifyDeviceProof, sameOrigin, contextHistory, isId,
} from "./protocol.mjs";

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
});
const fail = (status, error) => json({ error }, status);
const threadKey = (id) => "thread:" + id;
const messageKey = (id, seq) => "msg:" + id + ":" + String(seq).padStart(12, "0");
const inboxPrefix = (id) => "msg:" + id + ":";
const dedupeKey = (id, sender, key) => "dedupe:" + id + ":" + sender + ":" + key;
const now = () => Date.now();
async function body(req) {
  if (Number(req.headers.get("content-length") || "0") > 16000) throw Error("Payload too large.");
  const raw = await req.text();
  if (raw.length > 16000) throw Error("Payload too large.");
  const data = JSON.parse(raw);
  if (!data || Array.isArray(data) || typeof data !== "object") throw Error("JSON object expected.");
  return data;
}

export class NoemaRelayRoom {
  constructor(state, env) { this.state = state; this.env = env; }
  async limit(req) {
    const ip = String(req.headers.get("CF-Connecting-IP") || "unknown").slice(0, 80);
    const key = "rate:" + ip + ":" + Math.floor(now() / 60000);
    return this.state.storage.transaction(async (txn) => {
      const count = Number(await txn.get(key) || 0) + 1;
      await txn.put(key, count);
      return count <= LIMITS.maxRequestsPerMinute;
    });
  }
  async user(req) {
    const auth = req.headers.get("Authorization");
    if (!auth || !/^Bearer [A-Za-z0-9_-]{40,90}$/.test(auth)) return null;
    const session = await this.state.storage.get("session:" + await sha256(auth.slice(7)));
    return session?.expiresAt > now() ? session : null;
  }
  async thread(id, session) {
    if (!isId(id)) return null;
    const thread = await this.state.storage.get(threadKey(id));
    if (!thread || (thread.owner !== session.deviceId && thread.guest !== session.deviceId)) return null;
    return thread;
  }
  async messages(id, after = 0) {
    const all = await this.state.storage.list({ prefix: inboxPrefix(id) });
    return Array.from(all.values()).filter((m) => m.seq > after).sort((a,b) => a.seq - b.seq)
      .slice(-LIMITS.maxHistory);
  }
  async fetch(req) {
    if (!(await this.limit(req))) return fail(429, "Rate limit reached.");
    const url = new URL(req.url);
    if (req.method === "POST" && url.pathname === "/v1/auth/challenge") {
      const data = await body(req);
      const id = await fingerprint(data.publicJwk);
      if (id !== data.deviceId) return fail(400, "Device fingerprint mismatch.");
      const challenge = randomToken();
      await this.state.storage.put("challenge:" + id, {
        challengeHash: await sha256(challenge), expiresAt: now() + LIMITS.challengeLifetimeMs,
      });
      return json({ challenge, expiresInSeconds: 120 });
    }
    if (req.method === "POST" && url.pathname === "/v1/auth/verify") {
      const proof = await body(req);
      const issuedAt = Date.parse(proof.issuedAt);
      if (!Number.isFinite(issuedAt) || Math.abs(now() - issuedAt) > LIMITS.challengeLifetimeMs ||
          !sameOrigin(proof.audience, url.origin)) return fail(401, "Invalid challenge origin or timestamp.");
      const saved = await this.state.storage.get("challenge:" + proof.deviceId);
      if (!saved || saved.expiresAt <= now() || saved.challengeHash !== await sha256(proof.challenge))
        return fail(401, "Challenge expired or used.");
      if (!(await verifyDeviceProof(proof))) return fail(401, "Device signature invalid.");
      const token = randomToken();
      const timestamp = now();
      const authenticated = await this.state.storage.transaction(async (txn) => {
        const live = await txn.get("challenge:" + proof.deviceId);
        if (!live || live.expiresAt <= timestamp || live.challengeHash !== saved.challengeHash) return false;
        // Never replace a previously registered device key with a different key.
        const existing = await txn.get("device:" + proof.deviceId);
        if (existing && JSON.stringify(existing.publicJwk) !== JSON.stringify(proof.publicJwk)) return false;
        await txn.delete("challenge:" + proof.deviceId);
        await txn.put("device:" + proof.deviceId, { publicJwk: proof.publicJwk });
        await txn.put("session:" + await sha256(token), {
          deviceId: proof.deviceId, expiresAt: timestamp + LIMITS.sessionLifetimeMs,
        });
        return true;
      });
      return authenticated ? json({
        token, deviceId:proof.deviceId,
        expiresAt: new Date(timestamp + LIMITS.sessionLifetimeMs).toISOString(),
      }) : fail(401, "Challenge already redeemed.");
    }

    const session = await this.user(req);
    if (!session) return fail(401, "Device session required.");
    if (req.method === "GET" && url.pathname === "/v1/threads") {
      const all = await this.state.storage.list({ prefix: "thread:" });
      const threads = Array.from(all.values())
        .filter((t) => t.owner === session.deviceId || t.guest === session.deviceId)
        .sort((a,b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, 80);
      return json({ threads });
    }
    if (req.method === "GET" && url.pathname === "/v1/reception/pending") {
      // One bounded poll covers every enabled owner conversation, selected or not.
      const all = await this.state.storage.list({ prefix:"thread:" });
      const owned = Array.from(all.values()).filter((t) =>
        t.owner === session.deviceId && t.receptionEnabled).slice(0, 20);
      const pending = [];
      for (const thread of owned) {
        const messages = await this.messages(thread.id);
        for (const message of messages) {
          if (message.sender !== "guest") continue;
          const claim = await this.state.storage.get("claim:" + thread.id + ":" + message.seq);
          if (claim?.state === "consumed" ||
              (claim?.state === "leased" && claim.expiresAt > now())) continue;
          pending.push({ threadId:thread.id, message });
          if (pending.length >= 5) break;
        }
        if (pending.length >= 5) break;
      }
      return json({ pending });
    }
    if (req.method === "POST" && url.pathname === "/v1/invites") {
      const input = await body(req);
      const token = randomToken();
      const expiresAt = now() + LIMITS.inviteLifetimeMs;
      await this.state.storage.put("invite:" + await sha256(token), {
        owner:session.deviceId, ownerAlias:alias(input.alias) || "NOEMA Contact", expiresAt,
      });
      return json({ token, expiresAt: new Date(expiresAt).toISOString() }, 201);
    }
    if (req.method === "POST" && url.pathname === "/v1/invites/redeem") {
      const input = await body(req);
      if (!isId(input.token)) return fail(400, "Invalid invite.");
      const inviteKey = "invite:" + await sha256(input.token);
      const newId = randomToken();
      const result = await this.state.storage.transaction(async (txn) => {
        const invite = await txn.get(inviteKey);
        if (!invite || invite.expiresAt <= now() || invite.owner === session.deviceId) return null;
        await txn.delete(inviteKey);
        const createdAt = new Date().toISOString();
        const thread = { id:newId, owner:invite.owner, guest:session.deviceId,
          ownerAlias:invite.ownerAlias, guestAlias:alias(input.alias) || "Guest",
          receptionEnabled:false, nextSeq:0, updatedAt:createdAt };
        await txn.put(threadKey(newId), thread);
        return thread;
      });
      return result ? json({ thread:result }, 201) : fail(410, "Invitation expired, revoked or used.");
    }

    const match = url.pathname.match(/^\/v1\/threads\/([A-Za-z0-9_-]{12,90})(?:\/(messages|reception|agent-claim|agent-response))?$/);
    if (!match) return fail(404, "Route not found.");
    const id = match[1], action = match[2] || "";
    const thread = await this.thread(id, session);
    if (!thread) return fail(404, "Conversation unavailable.");
    if (req.method === "GET" && !action) return json({ thread });
    if (req.method === "GET" && action === "messages") {
      const after = Number.parseInt(url.searchParams.get("after") || "0", 10) || 0;
      return json({ messages: await this.messages(id, Math.max(0, after)), nextSeq: thread.nextSeq });
    }
    if (req.method === "POST" && action === "reception") {
      if (thread.owner !== session.deviceId) return fail(403, "Only the owner controls reception.");
      const input = await body(req);
      if (typeof input.enabled !== "boolean") return fail(400, "Boolean setting required.");
      const next = await this.state.storage.transaction(async (txn) => {
        const current = await txn.get(threadKey(id));
        if (!current || current.owner !== session.deviceId) return null;
        current.receptionEnabled = input.enabled;
        current.updatedAt = new Date().toISOString();
        await txn.put(threadKey(id), current);
        return current;
      });
      return next ? json({ receptionEnabled:next.receptionEnabled }) : fail(404, "Thread missing.");
    }
    if (req.method === "POST" && action === "messages") {
      const input = await body(req);
      const content = messageText(input.content);
      if (!isId(input.clientMessageId)) return fail(400, "A unique message ID is required.");
      const asAgent = input.asAgent === true;
      if (asAgent && (session.deviceId !== thread.owner || !thread.receptionEnabled))
        return fail(403, "Agent replies require active owner consent.");
      const record = await this.state.storage.transaction(async (txn) => {
        const fresh = await txn.get(threadKey(id));
        if (!fresh || (fresh.owner !== session.deviceId && fresh.guest !== session.deviceId))
          return null;
        if (asAgent && (!fresh.receptionEnabled || fresh.owner !== session.deviceId)) return null;
        const dedupe = dedupeKey(id, session.deviceId, input.clientMessageId);
        const previous = await txn.get(dedupe);
        if (previous) return previous;
        const seq = fresh.nextSeq + 1;
        const createdAt = new Date().toISOString();
        const item = { id:id + ":" + seq, seq, clientMessageId:input.clientMessageId,
          sender:asAgent ? "agent" : session.deviceId === fresh.owner ? "owner" : "guest",
          content, createdAt, status:"stored" };
        await txn.put(messageKey(id, seq), item);
        await txn.put(dedupe, item);
        await txn.put(threadKey(id), { ...fresh, nextSeq:seq, updatedAt:createdAt });
        return item;
      });
      return record ? json({ message:record }, 201) : fail(403, "Cannot deliver message.");
    }
    if (req.method === "POST" && action === "agent-claim") {
      if (session.deviceId !== thread.owner || !thread.receptionEnabled)
        return fail(403, "Owner reception not enabled.");
      const input = await body(req), seq = Number(input.seq);
      if (!Number.isSafeInteger(seq) || seq <= 0) return fail(400, "Invalid message sequence.");
      const source = await this.state.storage.get(messageKey(id, seq));
      if (!source || source.sender !== "guest") return fail(403, "Only guest messages wake the agent.");
      const claim = await this.state.storage.transaction(async (txn) => {
        const fresh = await txn.get(threadKey(id));
        if (!fresh?.receptionEnabled || fresh.owner !== session.deviceId) return null;
        const claimKey = "claim:" + id + ":" + seq;
        const prior = await txn.get(claimKey);
        if (prior?.state === "consumed" ||
            (prior?.state === "leased" && prior.expiresAt > now())) return null;
        const dayKey = "budget:" + fresh.owner + ":" + new Date().toISOString().slice(0,10);
        if (Number(await txn.get(dayKey) || 0) >= LIMITS.agentCallsPerDay) return null;
        const token = randomToken();
        await txn.put(claimKey, { state:"leased", hash:await sha256(token),
          owner:fresh.owner, expiresAt:now() + 90000 });
        // A lease that expires before billing does not consume the daily budget.
        return token;
      });
      return claim ? json({ claimToken:claim }) :
        fail(429, "Already handled, actively leased, or agent budget exhausted.");
    }
    if (req.method === "POST" && action === "agent-response") {
      if (session.deviceId !== thread.owner || !thread.receptionEnabled)
        return fail(403, "Owner reception not enabled.");
      const input = await body(req), seq = Number(input.seq);
      if (!Number.isSafeInteger(seq) || !isId(input.claimToken) ||
          typeof input.apiKey !== "string" || input.apiKey.length < 12 || input.apiKey.length > 256)
        return fail(400, "Invalid claim or API key.");
      const claimKey = "claim:" + id + ":" + seq;
      const valid = await this.state.storage.transaction(async (txn) => {
        const live = await txn.get(claimKey);
        const fresh = await txn.get(threadKey(id));
        if (!live || live.state !== "leased" || live.owner !== session.deviceId ||
            live.expiresAt <= now() || live.hash !== await sha256(input.claimToken) ||
            !fresh?.receptionEnabled || fresh.owner !== session.deviceId) return false;
        const dayKey = "budget:" + fresh.owner + ":" + new Date().toISOString().slice(0,10);
        const used = Number(await txn.get(dayKey) || 0);
        if (used >= LIMITS.agentCallsPerDay) return false;
        // Durable terminal marker stays after the first billable attempt.
        await txn.put(claimKey, { state:"consumed", owner:fresh.owner, consumedAt:now() });
        await txn.put(dayKey, used + 1);
        return true;
      });
      if (!valid) return fail(401, "Claim expired or already consumed.");
      const source = await this.state.storage.get(messageKey(id, seq));
      if (!source || source.sender !== "guest") return fail(403, "Invalid source message.");
      const messages = await this.messages(id, Math.max(0, seq - LIMITS.agentContextTurns));
      const model = typeof input.model === "string" && /^gpt-[A-Za-z0-9.-]{1,60}$/.test(input.model)
        ? input.model : "gpt-4.1-mini";
      const upstream = await fetch("https://api.openai.com/v1/responses", {
        method:"POST",
        headers:{ Authorization:"Bearer " + input.apiKey, "Content-Type":"application/json" },
        body:JSON.stringify({
          model, store:false, stream:true, tools:[], max_output_tokens:LIMITS.agentMaxOutputTokens,
          instructions:"You are NOEMA's disclosed AI receptionist. Briefly and politely answer the visitor. You have no access to private files or tools. Offer human handoff when necessary.",
          input:contextHistory(messages.filter((m) => m.seq <= seq)),
        }),
        signal:req.signal,
      });
      if (!upstream.ok || !upstream.body) return fail(502, "The provider refused the reception request.");
      return new Response(upstream.body, { headers:{
        "Content-Type":"text/event-stream; charset=utf-8",
        "Cache-Control":"no-store, no-transform", "X-Content-Type-Options":"nosniff",
      } });
    }
    return fail(405, "Method unsupported.");
  }
}

export default {
  async fetch(req, env) {
    const origin = req.headers.get("Origin"), allowed = String(env.APP_ORIGIN || "");
    const headers = { "Cache-Control":"no-store", "Vary":"Origin",
      "Referrer-Policy":"no-referrer", "X-Content-Type-Options":"nosniff" };
    if (!allowed || (origin && !sameOrigin(origin, allowed)))
      return new Response("Origin not allowed.", { status:403, headers });
    if (origin) {
      headers["Access-Control-Allow-Origin"] = origin;
      headers["Access-Control-Allow-Headers"] = "Authorization, Content-Type";
      headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
    }
    const decorate = (response) => {
      const output = new Response(response.body, response);
      for (const [k,v] of Object.entries(headers)) output.headers.set(k,v);
      return output;
    };
    if (req.method === "OPTIONS") return decorate(new Response(null, { status:204 }));
    if (!["GET","POST"].includes(req.method)) return decorate(fail(405, "Unsupported method."));
    try {
      if (!new URL(req.url).pathname.startsWith("/v1/")) return decorate(fail(404, "Route not found."));
      const id = env.NOEMA_ROOM.idFromName("noema-pilot-v1");
      return decorate(await env.NOEMA_ROOM.get(id).fetch(req));
    } catch {
      return decorate(fail(400, "Invalid request."));
    }
  },
};
