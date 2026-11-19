import {
  LIMITS, randomToken, sha256, fingerprint, alias, messageText,
  verifyDeviceProof, sameOrigin, isId,
} from "./protocol.mjs";
import { AccountRegistry } from "./account-registry.mjs";
import {classifyBrowserOrigin,allowedGuestRoute} from "./guest-origin.mjs";
import {pushConfigured,normalizePushSubscription,sendWebPush} from "./web-push.mjs";

const now = () => Date.now();
const iso = () => new Date().toISOString();
const json = (data, status=200) => new Response(JSON.stringify(data), {
  status, headers: {"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"},
});
const fail = (status, message, code="") => json({error:message, ...(code ? {code}: {})}, status);
const threadKey = (id) => "thread:" + id;
const msgKey = (id, seq) => "msg:" + id + ":" + String(seq).padStart(12,"0");
const msgPrefix = (id) => "msg:" + id + ":";
const claimKey = (id, seq) => "claim:" + id + ":" + seq;
const tokenHash = (token) => sha256(token);
const day = () => new Date().toISOString().slice(0,10);
const policyDefault = () => ({enabled:false, enabledAt:0, maxDailyCalls:4, maxThreadCalls:2});

async function body(req) {
  const length = Number(req.headers.get("content-length") || 0);
  if (length > 16000) throw Error("Request exceeds fixed size limit.");
  const raw = await req.text();
  if (raw.length > 16000) throw Error("Request exceeds fixed size limit.");
  const parsed = JSON.parse(raw);
  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") throw Error("JSON object required.");
  return parsed;
}
const validAlias = (raw) => alias(raw) || "NOEMA contact";
const validId = (v) => isId(v);

export class NoemaRelayRoom {
  constructor(state, env) { this.state=state; this.env=env; }

  async limit(req) {
    const ip = String(req.headers.get("CF-Connecting-IP") || "unknown").slice(0,80);
    const key = "rate:" + ip + ":" + Math.floor(now()/60000);
    return this.state.storage.transaction(async (txn) => {
      const count = Number(await txn.get(key) || 0) + 1;
      await txn.put(key, count);
      return count <= LIMITS.maxRequestsPerMinute;
    });
  }
  async user(req) {
    const auth = req.headers.get("Authorization");
    if (!auth || !/^Bearer [A-Za-z0-9_-]{40,90}$/.test(auth)) return null;
    const session = await this.state.storage.get("session:" + await tokenHash(auth.slice(7)));
    return session?.expiresAt > now() ? session : null;
  }
  owner(session) {
    // This env variable must be set to the locally generated signed device ID.
    // Deploying without it must not enable self-service public invite issuance.
    return !!this.env.OWNER_DEVICE_ID && this.env.OWNER_DEVICE_ID === session?.deviceId;
  }
  async policy(deviceId) {
    return await this.state.storage.get("policy:" + deviceId) || policyDefault();
  }
  async thread(id, session) {
    if (!validId(id)) return null;
    const entry = await this.state.storage.get(threadKey(id));
    return entry && (entry.owner === session.deviceId || entry.guest === session.deviceId) ? entry : null;
  }
  async notifyRecipient(deviceId) {
    if(!pushConfigured(this.env))return;
    const record=await this.state.storage.get("push:"+deviceId);
    if(!record)return;
    const expectedOrigin=this.env.OWNER_DEVICE_ID===deviceId
      ? this.env.APP_ORIGIN : this.env.GUEST_ORIGIN;
    if(record.origin!==expectedOrigin)return;
    const result=await sendWebPush(record.subscription,this.env);
    if(result.kind==="gone") {
      const current=await this.state.storage.get("push:"+deviceId);
      if(current?.subscription.endpoint===record.subscription.endpoint)
        await this.state.storage.delete("push:"+deviceId);
    }
  }
  async messages(id, after=0, through=Number.MAX_SAFE_INTEGER) {
    const all = await this.state.storage.list({prefix:msgPrefix(id)});
    return [...all.values()].filter((m) => m.seq > after && m.seq <= through)
      .sort((a,b) => a.seq-b.seq).slice(-LIMITS.maxHistory);
  }
  async messagePage(id, after=0, before=Number.MAX_SAFE_INTEGER) {
    // A page is bounded to the existing 60-envelope response limit.
    // Strictly-exclusive 'before' prevents duplicates between pages.
    const all=await this.state.storage.list({prefix:msgPrefix(id)});
    const matching=[...all.values()].filter(m=>m.seq>after && m.seq<before)
      .sort((a,b)=>a.seq-b.seq);
    return {messages:matching.slice(-LIMITS.maxHistory),
      hasMore:matching.length>LIMITS.maxHistory};
  }
  async fetch(req) {
    if (!(await this.limit(req))) return fail(429,"Too many requests.");
    const url = new URL(req.url);
    // Fail closed in a deployed but not yet owner-bound staging environment.
    // Avoid creating DO sessions or charging storage when OWNER_DEVICE_ID is absent.
    if (!this.env.OWNER_DEVICE_ID) return fail(503,"Private messaging is not activated.");
    if (req.method === "POST" && url.pathname === "/v1/auth/challenge") {
      const input = await body(req);
      const deviceId = await fingerprint(input.publicJwk);
      if (deviceId !== input.deviceId) return fail(400,"Device identity mismatch.");
      const challenge = randomToken();
      await this.state.storage.put("challenge:" + deviceId,{
        hash:await tokenHash(challenge), expiresAt:now() + LIMITS.challengeLifetimeMs,
      });
      return json({challenge, expiresInSeconds:120});
    }
    if (req.method === "POST" && url.pathname === "/v1/auth/verify") {
      const input = await body(req);
      const issuedAt = Date.parse(input.issuedAt);
      if (!Number.isFinite(issuedAt) || Math.abs(now()-issuedAt)>LIMITS.challengeLifetimeMs ||
          !sameOrigin(input.audience,url.origin)) return fail(401,"Invalid proof origin or timestamp.");
      const saved = await this.state.storage.get("challenge:" + input.deviceId);
      if (!saved || saved.expiresAt<=now() || saved.hash!==await tokenHash(input.challenge) ||
          !(await verifyDeviceProof(input))) return fail(401,"Device proof invalid, used, or expired.");
      const token = randomToken();
      const authenticated = await this.state.storage.transaction(async (txn)=>{
        const latest = await txn.get("challenge:" + input.deviceId);
        if (!latest || latest.hash!==saved.hash || latest.expiresAt<=now()) return false;
        const registered=await txn.get("device:" + input.deviceId);
        if (registered && JSON.stringify(registered)!==JSON.stringify(input.publicJwk)) return false;
        await txn.delete("challenge:" + input.deviceId);
        await txn.put("device:" + input.deviceId,input.publicJwk);
        await txn.put("session:" + await tokenHash(token),{
          deviceId:input.deviceId,expiresAt:now()+LIMITS.sessionLifetimeMs,
        });
        return true;
      });
      return authenticated ? json({token,deviceId:input.deviceId,
        expiresAt:new Date(now()+LIMITS.sessionLifetimeMs).toISOString()})
        : fail(401,"Device challenge was already used.");
    }

    const session=await this.user(req);
    if (!session) return fail(401,"Authenticated device session required.");

    if(url.pathname==="/v1/push/config" && req.method==="GET"){
      const enabled=pushConfigured(this.env);
      const saved=await this.state.storage.get("push:"+session.deviceId);
      return json({available:enabled,publicKey:enabled?this.env.VAPID_PUBLIC_KEY:null,
        enabled:!!enabled&&!!saved,
        scope:this.owner(session)?"owner":"guest"});
    }
    if(url.pathname==="/v1/push/unsubscribe" && req.method==="POST"){
      await this.state.storage.delete("push:"+session.deviceId);
      return json({enabled:false});
    }
    if(url.pathname==="/v1/push/subscribe" && req.method==="POST"){
      if(!pushConfigured(this.env))return fail(503,"Push notifications are not configured.");
      const expected=this.owner(session)?this.env.APP_ORIGIN:this.env.GUEST_ORIGIN;
      const origin=req.headers.get("Origin");
      if(origin!==expected)return fail(403,"Device origin does not match its account.");
      if(!this.owner(session)){
        const threadList=await this.state.storage.list({prefix:"thread:"});
        if(![...threadList.values()].some(t=>t.guest===session.deviceId))
          return fail(403,"Join a conversation before enabling notifications.");
      }
      const input=await body(req);
      let subscription;
      try{subscription=normalizePushSubscription(input.subscription);}
      catch{return fail(400,"Unsupported push subscription endpoint or keys.");}
      const rateKey="push-register:"+session.deviceId+":"+day();
      const current=await this.state.storage.get("push:"+session.deviceId);
      if(current?.subscription.endpoint===subscription.endpoint &&
        current?.subscription.keys.p256dh===subscription.keys.p256dh &&
        current?.subscription.keys.auth===subscription.keys.auth)
        return json({enabled:true});
      const allowed=await this.state.storage.transaction(async txn=>{
        const count=Number(await txn.get(rateKey)||0);
        if(count>=10)return false;
        await txn.put(rateKey,count+1);
        await txn.put("push:"+session.deviceId,{subscription,origin,registeredAt:iso()});
        return true;
      });
      return allowed?json({enabled:true}):fail(429,"Too many notification registrations.");
    }

    // The independent account protocol remains disabled until reviewed.
    // This cannot grant owner privileges in the existing guest-contact pilot.
    if (url.pathname==="/v1/accounts" || url.pathname.startsWith("/v1/accounts/")) {
      if (this.env.ACCOUNT_REGISTRATION_ENABLED!=="true")
        return fail(503,"Multi-user account enrollment is not activated.");
      const registry=new AccountRegistry(this.state.storage,
        deviceId=>this.state.storage.get("device:"+deviceId),
        Date.now,{mailEnabled:this.env.ACCOUNT_MAILBOX_ENABLED==="true"});
      return registry.route(req,session);
    }
    if (req.method==="GET" && url.pathname==="/v1/identity") {
      return json({deviceId:session.deviceId,owner:this.owner(session)});
    }
    if (req.method==="GET" && url.pathname==="/v1/threads") {
      const all=await this.state.storage.list({prefix:"thread:"});
      const threads=[...all.values()].filter((t)=>
        t.owner===session.deviceId || t.guest===session.deviceId)
        .sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).slice(0,80);
      return json({threads});
    }
    if (url.pathname==="/v1/reception/policy") {
      if (!this.owner(session)) return fail(403,"Only the configured owner controls reception.");
      if (req.method==="GET") return json({policy:await this.policy(session.deviceId)});
      if (req.method==="POST") {
        const input=await body(req);
        if (typeof input.enabled!=="boolean" ||
            !Number.isInteger(input.maxDailyCalls) || input.maxDailyCalls<1 ||
            input.maxDailyCalls>LIMITS.agentCallsPerDay ||
            !Number.isInteger(input.maxThreadCalls) || input.maxThreadCalls<1 ||
            input.maxThreadCalls>LIMITS.agentCallsPerThreadPerDay)
          return fail(400,"Invalid reception budget or switch.");
        const previous=await this.policy(session.deviceId);
        const next={enabled:input.enabled, enabledAt:input.enabled&&!previous.enabled?now():previous.enabledAt,
          maxDailyCalls:input.maxDailyCalls,maxThreadCalls:input.maxThreadCalls};
        await this.state.storage.put("policy:" + session.deviceId,next);
        return json({policy:next});
      }
      return fail(405,"Unsupported policy method.");
    }
    if (req.method==="POST" && url.pathname==="/v1/invites") {
      if (!this.owner(session)) return fail(403,"Only the configured owner can invite guests.");
      const input=await body(req);
      if (!validId(input.keyId) || input.secret || input.key || input.apiKey)
        return fail(400,"Invite requires only a non-secret key identifier.");
      const countKey="invites:" + session.deviceId + ":" + day();
      const token=randomToken();
      const record=await this.state.storage.transaction(async (txn)=>{
        const used=Number(await txn.get(countKey) || 0);
        if (used>=20) return null;
        await txn.put(countKey, used+1);
        const invite={id:randomToken(), owner:session.deviceId,
          ownerAlias:validAlias(input.alias),keyId:input.keyId,
          expiresAt:now()+LIMITS.inviteLifetimeMs};
        await txn.put("invite:" + await tokenHash(token),invite);
        return invite;
      });
      return record ? json({token,keyId:record.keyId,expiresAt:new Date(record.expiresAt).toISOString()},201)
        : fail(429,"Daily invitation limit reached.");
    }
    if (req.method==="POST" && url.pathname==="/v1/invites/revoke") {
      if (!this.owner(session)) return fail(403,"Only owner may revoke invitations.");
      const input=await body(req);
      if (!validId(input.token)) return fail(400,"Invalid invitation.");
      const key="invite:" + await tokenHash(input.token);
      const removed=await this.state.storage.transaction(async (txn)=>{
        const invite=await txn.get(key);
        if (!invite || invite.owner!==session.deviceId) return false;
        await txn.delete(key);return true;
      });
      return removed?json({revoked:true}):fail(404,"Invitation no longer active.");
    }
    if (req.method==="POST" && url.pathname==="/v1/invites/redeem") {
      const input=await body(req);
      if (!validId(input.token)) return fail(400,"Invalid invitation.");
      const key="invite:" + await tokenHash(input.token);
      const threadId=randomToken();
      const redeemed=await this.state.storage.transaction(async (txn)=>{
        const invite=await txn.get(key);
        if (!invite || invite.expiresAt<=now() || invite.owner===session.deviceId) return null;
        await txn.delete(key);
        const thread={id:threadId,keyId:invite.keyId,owner:invite.owner,
          guest:session.deviceId,ownerAlias:invite.ownerAlias,guestAlias:validAlias(input.alias),
          receptionEnabled:false,receptionEnabledFromSeq:0,nextSeq:0,updatedAt:iso()};
        await txn.put(threadKey(threadId),thread);
        return thread;
      });
      return redeemed?json({thread:redeemed},201):fail(410,"Invitation expired, revoked, or already redeemed.");
    }

    if (req.method==="GET" && url.pathname==="/v1/reception/pending") {
      if (!this.owner(session)) return fail(403,"Only owner may collect reception work.");
      const policy=await this.policy(session.deviceId);
      if (!policy.enabled) return json({pending:[]});
      const all=await this.state.storage.list({prefix:"thread:"});
      const owned=[...all.values()].filter((t)=>t.owner===session.deviceId && t.receptionEnabled)
        .sort((a,b)=>a.id.localeCompare(b.id));
      const cursorKey="reception-cursor:" + session.deviceId;
      const current=Number(await this.state.storage.get(cursorKey) || 0);
      const offset=owned.length?current % owned.length:0;
      const batch=Array.from({length:Math.min(20,owned.length)},(_,i)=>owned[(offset+i)%owned.length]);
      if (owned.length) await this.state.storage.put(cursorKey,
        (offset+batch.length)%owned.length);
      const pending=[];
      for (const thread of batch) {
        const messages=await this.messages(thread.id);
        for (const message of messages) {
          if (message.sender!=="guest" || message.seq<=thread.receptionEnabledFromSeq ||
              Date.parse(message.createdAt)<policy.enabledAt) continue;
          const claimed=await this.state.storage.get(claimKey(thread.id,message.seq));
          if (claimed) continue; // Failed or billed attempts never silently repeat.
          pending.push({threadId:thread.id,message});
          if (pending.length>=5) break;
        }
        if (pending.length>=5) break;
      }
      return json({pending});
    }

    const match=url.pathname.match(/^\/v1\/threads\/([A-Za-z0-9_-]{12,90})(?:\/(messages|reception|agent-claim))?$/);
    if (!match) return fail(404,"Unknown endpoint.");
    const id=match[1],action=match[2]||"";
    const thread=await this.thread(id,session);
    if (!thread) return fail(404,"Conversation unavailable.");
    if (req.method==="GET"&&!action) return json({thread});
    if (req.method==="GET"&&action==="messages") {
      const afterRaw=url.searchParams.get("after")||"0";
      const beforeRaw=url.searchParams.get("before");
      if(!/^(0|[1-9][0-9]*)$/.test(afterRaw) ||
        (beforeRaw!==null && !/^[1-9][0-9]*$/.test(beforeRaw)))
        return fail(400,"Invalid message cursor.");
      const after=Number(afterRaw),before=beforeRaw===null?Number.MAX_SAFE_INTEGER:Number(beforeRaw);
      if(!Number.isSafeInteger(after) || !Number.isSafeInteger(before) ||
        after>=before)return fail(400,"Invalid message cursor.");
      const page=await this.messagePage(id,after,before);
      return json({...page,nextSeq:thread.nextSeq});
    }
    if (req.method==="POST"&&action==="reception") {
      if (thread.owner!==session.deviceId || !this.owner(session))
        return fail(403,"Only the configured owner controls the conversation.");
      const input=await body(req);
      if (typeof input.enabled!=="boolean") return fail(400,"Invalid switch.");
      const result=await this.state.storage.transaction(async (txn)=>{
        const current=await txn.get(threadKey(id));
        if (!current || current.owner!==session.deviceId) return null;
        const updated={...current,receptionEnabled:input.enabled,
          receptionEnabledFromSeq:input.enabled?current.nextSeq:current.receptionEnabledFromSeq,
          updatedAt:iso()};
        await txn.put(threadKey(id),updated);
        return updated;
      });
      return result?json({thread:result}):fail(404,"Conversation vanished.");
    }
    if (req.method==="POST"&&action==="agent-claim") {
      if (thread.owner!==session.deviceId || !this.owner(session))
        return fail(403,"Owner permission required.");
      const input=await body(req),seq=Number(input.seq);
      if (!Number.isSafeInteger(seq)||seq<=0) return fail(400,"Invalid message sequence.");
      const result=await this.state.storage.transaction(async (txn)=>{
        const fresh=await txn.get(threadKey(id));
        const policy=await txn.get("policy:" + session.deviceId)||policyDefault();
        const source=await txn.get(msgKey(id,seq));
        if (!fresh?.receptionEnabled || !policy.enabled ||
            fresh.owner!==session.deviceId || source?.sender!=="guest" ||
            seq<=fresh.receptionEnabledFromSeq || Date.parse(source.createdAt)<policy.enabledAt)
          return {code:"RECEPTION_OFF"};
        if (await txn.get(claimKey(id,seq))) return {code:"CLAIM_UNAVAILABLE"};
        const ownerCountKey="budget:"+session.deviceId+":"+day();
        const threadCountKey="thread-budget:"+id+":"+day();
        const daily=Number(await txn.get(ownerCountKey)||0);
        const perThread=Number(await txn.get(threadCountKey)||0);
        if (daily>=policy.maxDailyCalls||perThread>=policy.maxThreadCalls)
          return {code:"AGENT_BUDGET_EXHAUSTED"};
        const claimToken=randomToken();
        // Consumed *before* a provider request, preventing duplicate billable calls
        // after a browser crash or uncertain network status.
        await txn.put(claimKey(id,seq),{hash:await tokenHash(claimToken),
          state:"claimed",owner:session.deviceId,responded:false,createdAt:now()});
        await txn.put(ownerCountKey,daily+1);
        await txn.put(threadCountKey,perThread+1);
        return {claimToken};
      });
      if (result.claimToken) return json({claimToken:result.claimToken,
        remainingNote:"One provider attempt is now reserved and counted."});
      return fail(result.code==="AGENT_BUDGET_EXHAUSTED"?429:403,
        result.code==="AGENT_BUDGET_EXHAUSTED"?"Reception budget exhausted.":"Reception is off or message already claimed.",
        result.code);
    }
    if (req.method==="POST"&&action==="messages") {
      const input=await body(req);
      let content;
      try { content=messageText(input.content); }
      catch { return fail(400,"Only bounded encrypted message envelopes are accepted."); }
      if (!validId(input.clientMessageId)) return fail(400,"Unique message ID required.");
      const asAgent=input.asAgent===true;
      if (asAgent && (!this.owner(session)||session.deviceId!==thread.owner))
        return fail(403,"Only the owner can send AI replies.");
      const seq=Number(input.sourceSeq);
      if (asAgent && (!validId(input.claimToken)||!Number.isSafeInteger(seq)||seq<=0))
        return fail(400,"Agent source proof required.");
      const result=await this.state.storage.transaction(async (txn)=>{
        const fresh=await txn.get(threadKey(id));
        if (!fresh || ![fresh.owner,fresh.guest].includes(session.deviceId)) return {code:"NO_THREAD"};
        const dedupe="dedupe:"+id+":"+session.deviceId+":"+input.clientMessageId;
        const previous=await txn.get(dedupe);
        if (previous) {
          if (previous.content!==content || (previous.sender==="agent")!==asAgent)
            return {code:"ID_CONFLICT"};
          return {message:previous,newMessage:false};
        }
        if (asAgent) {
          const policy=await txn.get("policy:"+session.deviceId)||policyDefault();
          const claim=await txn.get(claimKey(id,seq));
          if (!policy.enabled||!fresh.receptionEnabled||!claim||
              claim.owner!==session.deviceId||claim.state!=="claimed"||claim.responded||
              claim.hash!==await tokenHash(input.claimToken))
            return {code:"CLAIM_INVALID"};
          await txn.put(claimKey(id,seq),{...claim,responded:true});
        }
        const nextSeq=fresh.nextSeq+1;
        const message={id:id+":"+nextSeq,seq:nextSeq,
          clientMessageId:input.clientMessageId,content,
          sender:asAgent?"agent":session.deviceId===fresh.owner?"owner":"guest",
          createdAt:iso(),status:"stored"};
        await txn.put(msgKey(id,nextSeq),message);
        await txn.put(dedupe,message);
        await txn.put(threadKey(id),{...fresh,nextSeq,updatedAt:message.createdAt});
        return {message,newMessage:true};
      });
      if(result.code) return fail(result.code==="ID_CONFLICT"?409:403,
        "Message rejected by conversation permissions.",result.code);
      if(result.newMessage && pushConfigured(this.env)) {
        const other=session.deviceId===thread.owner?thread.guest:thread.owner;
        const task=this.notifyRecipient(other).catch(()=>{ /* no content in logs */ });
        if(typeof this.state.waitUntil==="function")this.state.waitUntil(task);
        else await task;
      }
      return json({message:result.message},201);
    }
    return fail(405,"Unsupported method.");
  }
}

export default {
  async fetch(req, env) {
    const origin=req.headers.get("Origin");
    const role=classifyBrowserOrigin(origin,String(env.APP_ORIGIN||""),
      String(env.GUEST_ORIGIN||""));
    const pathname=new URL(req.url).pathname;
    const actualMethod=req.method==="OPTIONS"
      ?req.headers.get("Access-Control-Request-Method")||"GET"
      :req.method;
    const headers={"Cache-Control":"no-store","Vary":"Origin",
      "Referrer-Policy":"no-referrer","X-Content-Type-Options":"nosniff"};
    if (!role)
      return new Response("Origin not allowed.",{status:403,headers});
    // Public browser origins are limited to guest-only operations. This is
    // defense-in-depth, not a substitute for signed device authorisation.
    if(role==="guest"&&!allowedGuestRoute(actualMethod,pathname))
      return new Response("Guest operation not allowed.",{status:403,headers});
    if (origin) {
      headers["Access-Control-Allow-Origin"]=origin;
      headers["Access-Control-Allow-Headers"]="Authorization, Content-Type";
      headers["Access-Control-Allow-Methods"]="GET, POST, OPTIONS";
    }
    const decorate=(response)=>{
      const next=new Response(response.body,response);
      for(const [k,v] of Object.entries(headers))next.headers.set(k,v);
      return next;
    };
    if(req.method==="OPTIONS")return decorate(new Response(null,{status:204}));
    if(!["GET","POST"].includes(req.method))return decorate(fail(405,"Unsupported method."));
    try{
      if(!new URL(req.url).pathname.startsWith("/v1/"))return decorate(fail(404,"Unknown API route."));
      // No Durable Object is instantiated while staging has no registered owner.
      if(!env.OWNER_DEVICE_ID)return decorate(fail(503,"Private messaging is not activated."));
      const instance=env.NOEMA_ROOM.idFromName("noema-e2ee-pilot-v1");
      return decorate(await env.NOEMA_ROOM.get(instance).fetch(req));
    }catch{
      // No request bodies, secrets or token material logged.
      return decorate(fail(400,"Malformed contact request."));
    }
  },
};
