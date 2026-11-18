/**
 * NOT DEPLOYED: future NOEMA account + pairing registry.
 * Every endpoint below assumes a pre-authenticated, signed device session.
 * The live Worker must use ACCOUNT_REGISTRATION_ENABLED=true to reach it.
 * Do not use this single Durable Object as a production multi-tenant message store.
 */
import {
  alias, isId, randomToken, sha256, verifyDeviceProof, sameOrigin,
} from "./protocol.mjs";

const lifetime = { offer: 5 * 60_000, request: 10 * 60_000, proof: 2 * 60_000 };
const utcDay = () => new Date().toISOString().slice(0, 10);
const encode = (value) => JSON.stringify(value);
const ok = (value, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { "content-type":"application/json", "cache-control":"no-store" },
});
const reject = (status, message) => ok({ error:message },status);
const key = {
  account: (id) => "accounts:entry:" + id,
  handle: (h) => "accounts:handle:" + h,
  owner: (device) => "accounts:owner:" + device,
  member: (id,device) => "accounts:member:" + id + ":" + device,
  offer: (tokenHash) => "accounts:offer:" + tokenHash,
  request: (id) => "accounts:pair:" + id,
  proof: (id,device) => "accounts:approval:" + id + ":" + device,
  inviteBudget: (id) => "accounts:invite-budget:" + id + ":" + utcDay(),
};
const active = (membership,account,device,role) =>
  membership?.accountId===account && membership.deviceId===device &&
  membership.status==="active" && membership.approvedAt &&
  (role!=="owner" || membership.role==="owner");

export const canonicalHandle = (raw) => {
  if (typeof raw !== "string") return "";
  const candidate=raw.trim().replace(/^@/,"").toLowerCase();
  return /^[a-z][a-z0-9_]{2,23}$/.test(candidate) ? candidate : "";
};
const validLabel = (raw) => typeof raw==="string" ? alias(raw).slice(0,32) : "";
const parseJSON = async (request) => {
  const raw=await request.text();
  if(raw.length>4000)throw Error("Request too large.");
  const result=JSON.parse(raw);
  if(!result || Array.isArray(result)||typeof result!=="object")
    throw Error("Invalid body.");
  return result;
};

/** All writes are atomic and scoped to a specific member's signed device.
 * Client UI claims such as 'role=owner' and 'approved=true' are ignored.
 */
export class AccountRegistry {
  constructor(storage, getDeviceKey, clock=Date.now) {
    this.storage=storage;
    this.getDeviceKey=getDeviceKey;
    this.clock=clock;
  }
  async membership(accountId,deviceId,role="member") {
    const account=await this.storage.get(key.account(accountId));
    if(!account || account.status!=="active")return null;
    const m=await this.storage.get(key.member(accountId,deviceId));
    return active(m,accountId,deviceId,role)?m:null;
  }
  async route(request,session) {
    if(!session?.deviceId||!isId(session.deviceId))return reject(401,"Device session required.");
    const pathname=new URL(request.url).pathname;
    const method=request.method;
    let body;
    if(method==="POST") {
      try{body=await parseJSON(request);}catch{return reject(400,"Invalid request.");}
    }
    if(pathname==="/v1/accounts"&&method==="POST")return this.create(session,body);
    if(pathname==="/v1/accounts"&&method==="GET")return this.owned(session);
    const endpoint=pathname.match(/^\/v1\/accounts\/([A-Za-z0-9_-]{12,90})(?:\/(.*))?$/);
    if(!endpoint)return reject(404,"Unknown account action.");
    const accountId=endpoint[1],rest=endpoint[2]||"";
    if(method==="GET"&&rest==="")return this.getAccount(session,accountId);
    if(method==="GET"&&rest==="devices")return this.devices(session,accountId);
    if(method==="POST"&&rest==="pair-offers")return this.offer(session,accountId);
    if(method==="POST"&&rest==="pair-requests")return this.requestPair(session,accountId,body);
    if(method==="GET"&&rest==="pair-requests")return this.pending(session,accountId);
    const pair=rest.match(/^pair-requests\/([A-Za-z0-9_-]{12,90})(?:\/(status|challenge|approve))?$/);
    if(pair) {
      if(method==="GET"&&pair[2]==="status")return this.pairStatus(session,accountId,pair[1]);
      if(method==="POST"&&pair[2]==="challenge")return this.challenge(session,accountId,pair[1]);
      if(method==="POST"&&pair[2]==="approve")return this.approve(session,accountId,pair[1],body,request.url);
    }
    const revoke=rest.match(/^devices\/([A-Za-z0-9_-]{12,90})\/revoke$/);
    if(method==="POST"&&revoke)return this.revoke(session,accountId,revoke[1]);
    return reject(404,"Unknown account action.");
  }
  async create(session,body) {
    const handle=canonicalHandle(body?.handle);
    const display=validLabel(body?.displayName);
    if(!handle || !display)return reject(400,"A valid handle and display name are required.");
    const id=randomToken(),stamp=new Date(this.clock()).toISOString();
    const result=await this.storage.transaction(async tx=>{
      if(await tx.get(key.handle(handle)))return {status:409,error:"Handle unavailable."};
      if(await tx.get(key.owner(session.deviceId)))return {status:409,error:"This device already owns an account."};
      const account={id,handle,displayName:display,status:"active",createdAt:stamp};
      const membership={accountId:id,deviceId:session.deviceId,role:"owner",
        status:"active",approvedAt:stamp,approvedBy:session.deviceId,revokedAt:null};
      await tx.put(key.account(id),account);
      await tx.put(key.handle(handle),id);
      await tx.put(key.owner(session.deviceId),id);
      await tx.put(key.member(id,session.deviceId),membership);
      return {account};
    });
    return result.status?reject(result.status,result.error):ok(result,201);
  }
  async owned(session) {
    const id=await this.storage.get(key.owner(session.deviceId));
    if(!id)return ok({accounts:[]});
    const m=await this.membership(id,session.deviceId,"owner");
    const account=m&&await this.storage.get(key.account(id));
    return ok({accounts:account?[account]:[]});
  }
  async getAccount(session,id) {
    if(!await this.membership(id,session.deviceId))return reject(404,"Account unavailable.");
    const account=await this.storage.get(key.account(id));
    return ok({account});
  }
  async devices(session,id) {
    if(!await this.membership(id,session.deviceId,"owner"))return reject(403,"Account owner required.");
    const entries=await this.storage.list({prefix:"accounts:member:"+id+":"});
    return ok({devices:[...entries.values()].map(m=>({
      deviceId:m.deviceId,role:m.role,status:m.status,
      approvedAt:m.approvedAt,revokedAt:m.revokedAt,
    })).slice(0,30)});
  }
  async offer(session,id) {
    if(!await this.membership(id,session.deviceId,"owner"))return reject(403,"Account owner required.");
    const token=randomToken(),tokenDigest=await sha256(token);
    const result=await this.storage.transaction(async tx=>{
      const quota=key.inviteBudget(id),used=Number(await tx.get(quota)||0);
      if(used>=6)return null;
      await tx.put(quota,used+1);
      await tx.put(key.offer(tokenDigest),{accountId:id,ownerDeviceId:session.deviceId,
        expiresAt:this.clock()+lifetime.offer,consumed:false});
      return {token,expiresAt:new Date(this.clock()+lifetime.offer).toISOString()};
    });
    return result?ok(result,201):reject(429,"Pairing offer limit reached.");
  }
  async requestPair(session,id,body) {
    if(!isId(body?.token))return reject(400,"Invalid pairing offer.");
    const hashed=await sha256(body.token),requestId=randomToken(),stamp=this.clock();
    // The six-digit challenge is shown ONLY to the candidate, not on the owner's
    // pending-request listing. Owner compares it with the phone out-of-band.
    const code=String(crypto.getRandomValues(new Uint32Array(1))[0]%1_000_000).padStart(6,"0");
    const codeHash=await sha256(requestId+":"+code);
    const result=await this.storage.transaction(async tx=>{
      const offer=await tx.get(key.offer(hashed));
      if(!offer || offer.accountId!==id || offer.expiresAt<=stamp || offer.consumed)
        return {status:410,error:"Pairing offer unavailable."};
      if(offer.ownerDeviceId===session.deviceId)return {status:403,error:"Cannot pair the same device."};
      if(await tx.get(key.member(id,session.deviceId)))
        return {status:409,error:"This device already has an account membership record."};
      const request={id:requestId,accountId:id,candidateDeviceId:session.deviceId,
        requestedAt:new Date(stamp).toISOString(),expiresAt:stamp+lifetime.request,
        status:"pending",codeHash,ownerDeviceId:offer.ownerDeviceId};
      await tx.put(key.offer(hashed),{...offer,consumed:true});
      await tx.put(key.request(requestId),request);
      return {requestId,verificationCode:code,expiresAt:new Date(request.expiresAt).toISOString()};
    });
    return result.status?reject(result.status,result.error):ok(result,201);
  }
  async pending(session,id) {
    if(!await this.membership(id,session.deviceId,"owner"))return reject(403,"Owner permission required.");
    const all=await this.storage.list({prefix:"accounts:pair:"});
    return ok({requests:[...all.values()].filter(x=>x.accountId===id&&x.status==="pending"&&
      x.expiresAt>this.clock()).map(x=>({
        id:x.id,candidateDeviceId:x.candidateDeviceId,requestedAt:x.requestedAt,
        expiresAt:new Date(x.expiresAt).toISOString(),
      })).slice(0,15)});
  }
  async pairStatus(session,id,requestId) {
    const request=await this.storage.get(key.request(requestId));
    if(!request || request.accountId!==id ||
      (session.deviceId!==request.candidateDeviceId &&
       !await this.membership(id,session.deviceId,"owner")))
      return reject(404,"Pairing request unavailable.");
    return ok({status:request.expiresAt<=this.clock()&&request.status==="pending"?
      "expired":request.status});
  }
  async challenge(session,id,requestId) {
    if(!await this.membership(id,session.deviceId,"owner"))return reject(403,"Owner permission required.");
    const request=await this.storage.get(key.request(requestId));
    if(!request || request.accountId!==id || request.status!=="pending"||
      request.expiresAt<=this.clock())return reject(410,"Pairing request expired.");
    const nonce=randomToken(),digest=await sha256(nonce);
    await this.storage.put(key.proof(requestId,session.deviceId),{
      hash:digest,accountId:id,candidateDeviceId:request.candidateDeviceId,
      expiresAt:this.clock()+lifetime.proof,
    });
    return ok({challenge:nonce,expiresInSeconds:120});
  }
  async approve(session,id,requestId,body,requestUrl) {
    const code=body?.verificationCode,proof=body?.proof;
    if(!/^[0-9]{6}$/.test(code)||!proof || proof.deviceId!==session.deviceId ||
      !sameOrigin(proof.audience,requestUrl) ||
      Math.abs(this.clock()-Date.parse(proof.issuedAt))>lifetime.proof ||
      !Number.isFinite(Date.parse(proof.issuedAt)))
      return reject(401,"Approval verification failed.");
    const known=await this.getDeviceKey(session.deviceId);
    if(!known || known.x!==proof.publicJwk?.x || known.y!==proof.publicJwk?.y ||
      !await verifyDeviceProof(proof))return reject(401,"Owner signature invalid.");
    const nonceHash=await sha256(proof.challenge),codeHash=await sha256(requestId+":"+code);
    const result=await this.storage.transaction(async tx=>{
      const account=await tx.get(key.account(id)),owner=await tx.get(key.member(id,session.deviceId));
      if(account?.status!=="active"||!active(owner,id,session.deviceId,"owner"))
        return {status:403,error:"Account owner required."};
      const pairing=await tx.get(key.request(requestId));
      const challenge=await tx.get(key.proof(requestId,session.deviceId));
      if(!pairing||pairing.accountId!==id||pairing.status!=="pending"||
        pairing.ownerDeviceId!==session.deviceId||pairing.expiresAt<=this.clock()||
        pairing.codeHash!==codeHash||!challenge||challenge.hash!==nonceHash||
        challenge.accountId!==id||challenge.candidateDeviceId!==pairing.candidateDeviceId||
        challenge.expiresAt<=this.clock())
        return {status:403,error:"Pairing approval denied or already used."};
      const memberKey=key.member(id,pairing.candidateDeviceId);
      if(await tx.get(memberKey))return {status:409,error:"Device already registered."};
      const when=new Date(this.clock()).toISOString();
      await tx.put(memberKey,{accountId:id,deviceId:pairing.candidateDeviceId,
        role:"member",status:"active",approvedAt:when,
        approvedBy:session.deviceId,revokedAt:null});
      await tx.put(key.request(requestId),{...pairing,status:"approved",codeHash:null});
      await tx.delete(key.proof(requestId,session.deviceId));
      return {memberDeviceId:pairing.candidateDeviceId,status:"approved"};
    });
    // The successful reply contains status:"approved", which is a domain
    // state, not an HTTP status code. Only numeric error codes denote failure.
    return typeof result.status==="number"
      ? reject(result.status,result.error)
      : ok(result);
  }
  async revoke(session,id,deviceId) {
    if(!await this.membership(id,session.deviceId,"owner"))return reject(403,"Owner permission required.");
    if(deviceId===session.deviceId)return reject(403,"Cannot revoke the sole account owner.");
    const result=await this.storage.transaction(async tx=>{
      const record=await tx.get(key.member(id,deviceId));
      if(!record||record.role==="owner"||record.status!=="active")
        return false;
      await tx.put(key.member(id,deviceId),{...record,status:"revoked",
        revokedAt:new Date(this.clock()).toISOString()});
      return true;
    });
    return result?ok({revoked:true}):reject(404,"Active device unavailable.");
  }
}
