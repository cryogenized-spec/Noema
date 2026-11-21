/** NOT DEPLOYED / NOT ENABLED.
 * One-use ciphertext-only key transfer after a signed account device approval.
 * The relay validates the signing identities; it NEVER learns the account root.
 * This does NOT implement key rotation, backup or browser-to-browser pairing UI.
 */
import {b64url,unb64url,utf8,fingerprint,isId} from "./protocol.mjs";
const nowIso=(now)=>new Date(now).toISOString();
const isB64=(v,min,max)=>typeof v==="string" && v.length>=min &&
  v.length<=max && /^[A-Za-z0-9_-]+$/.test(v);
const publicP256=(jwk)=>!!jwk && Object.keys(jwk).length===4 &&
  jwk.kty==="EC" && jwk.crv==="P-256" &&
  isB64(jwk.x,43,43)&&isB64(jwk.y,43,43) &&
  unb64url(jwk.x).length===32&&unb64url(jwk.y).length===32;
const noExtras=(x,names)=>!!x&&typeof x==="object"&&!Array.isArray(x)&&
  Object.keys(x).length===names.length &&
  names.every(name=>Object.prototype.hasOwnProperty.call(x,name));
const offerNames=["version","accountId","requestId","candidateDeviceId",
  "publicJwk","createdAt","expiresAt","signature"];
const pkgNames=["version","accountId","requestId","ownerDeviceId",
  "recipientDeviceId","offerHash","ephemeralPublicJwk","salt","nonce",
  "ciphertext","createdAt","expiresAt","signature"];
const offerFields=(o)=>[
  o.version,o.accountId,o.requestId,o.candidateDeviceId,
  o.publicJwk.x,o.publicJwk.y,o.createdAt,o.expiresAt,
];
const packageFields=(p)=>[
  p.version,p.accountId,p.requestId,p.ownerDeviceId,p.recipientDeviceId,
  p.offerHash,p.ephemeralPublicJwk.x,p.ephemeralPublicJwk.y,
  p.salt,p.nonce,p.ciphertext,p.createdAt,p.expiresAt,
];
const signed=(prefix,fields)=>utf8(prefix+"\n"+JSON.stringify(fields));
const verify=async(jwk,data,signature)=>{
  if(!publicP256(jwk)||!isB64(signature,80,100))return false;
  try{
    const key=await crypto.subtle.importKey("jwk",jwk,
      {name:"ECDSA",namedCurve:"P-256"},false,["verify"]);
    return crypto.subtle.verify({name:"ECDSA",hash:"SHA-256"},key,
      unb64url(signature),data);
  }catch{return false;}
};
const hashOffer=async(offer)=>b64url(new Uint8Array(await crypto.subtle.digest(
  "SHA-256",utf8(JSON.stringify([...offerFields(offer),offer.signature])))));
const fresh=(createdAt,expiresAt,clock)=>{
  const start=Date.parse(createdAt),end=Date.parse(expiresAt);
  return Number.isFinite(start)&&Number.isFinite(end)&&
    start<=clock+30_000 && clock<end &&
    end>start && end-start<=10*60_000;
};
const ok=(body,status=200)=>new Response(JSON.stringify(body),{
  status,headers:{"content-type":"application/json","cache-control":"no-store"},
});
const deny=(status,detail)=>ok({error:detail},status);
const keys={
  pair:id=>"accounts:pair:"+id,
  member:(account,device)=>"accounts:member:"+account+":"+device,
  offer:(account,id)=>"accounts:key-offer:"+account+":"+id,
  package:(account,id)=>"accounts:key-package:"+account+":"+id,
  claimed:(account,id)=>"accounts:key-claimed:"+account+":"+id,
};
const memberActive=(m,id,device,owner=false)=>
  m?.accountId===id&&m.deviceId===device&&m.status==="active"&&
  !!m.approvedAt&&(!owner||m.role==="owner");
export class AccountKeyTransfer {
  constructor(storage,getDeviceKey,clock=Date.now){
    this.storage=storage;
    this.getDeviceKey=getDeviceKey;
    this.clock=clock;
  }
  async eligibility(accountId,requestId){
    const pairing=await this.storage.get(keys.pair(requestId));
    if(pairing?.accountId!==accountId||pairing.status!=="approved")
      return null;
    const [member,owner]=await Promise.all([
      this.storage.get(keys.member(accountId,pairing.candidateDeviceId)),
      this.storage.get(keys.member(accountId,pairing.ownerDeviceId)),
    ]);
    if(!memberActive(member,accountId,pairing.candidateDeviceId) ||
       !memberActive(owner,accountId,pairing.ownerDeviceId,true) ||
       !Number.isFinite(Date.parse(member.approvedAt)) ||
       this.clock()>=Date.parse(member.approvedAt)+10*60_000)
      return null;
    return pairing;
  }
  async route(request,session,accountId,requestId,action,body){
    if(!isId(accountId)||!isId(requestId)||!isId(session?.deviceId))
      return deny(404,"Key exchange unavailable.");
    const pairing=await this.eligibility(accountId,requestId);
    if(!pairing)return deny(404,"Approved key transfer unavailable.");
    const candidate=pairing.candidateDeviceId,owner=pairing.ownerDeviceId;
    if(action==="offer" && request.method==="POST"){
      if(session.deviceId!==candidate)return deny(403,"Recipient only.");
      const offer=body?.offer;
      if(!noExtras(offer,offerNames)||offer.version!==1||
        offer.accountId!==accountId||offer.requestId!==requestId||
        offer.candidateDeviceId!==candidate||!publicP256(offer.publicJwk)||
        !fresh(offer.createdAt,offer.expiresAt,this.clock()))
        return deny(400,"Invalid recipient exchange offer.");
      const signing=await this.getDeviceKey(candidate);
      if(!signing||await fingerprint(signing)!==candidate||
        !await verify(signing,signed("NOEMA_DEVICE_KEY_OFFER_V1",offerFields(offer)),
          offer.signature))
        return deny(403,"Recipient exchange key signature invalid.");
      const result=await this.storage.transaction(async tx=>{
        if(await tx.get(keys.offer(accountId,requestId)) ||
           await tx.get(keys.claimed(accountId,requestId)))return false;
        const m=await tx.get(keys.member(accountId,candidate));
        if(!memberActive(m,accountId,candidate))return false;
        await tx.put(keys.offer(accountId,requestId),offer);
        return true;
      });
      return result?ok({stored:true},201):deny(409,"Exchange key already registered.");
    }
    if(action==="offer" && request.method==="GET"){
      if(session.deviceId!==owner)return deny(403,"Owner only.");
      const offer=await this.storage.get(keys.offer(accountId,requestId));
      const candidateSigningKey=await this.getDeviceKey(candidate);
      if(!offer || !candidateSigningKey || !publicP256(offer.publicJwk))
        return deny(404,"Recipient has not published an exchange key.");
      return ok({offer,candidateSigningKey});
    }
    if(action==="package" && request.method==="POST"){
      if(session.deviceId!==owner)return deny(403,"Owner only.");
      const pkg=body?.package,offer=await this.storage.get(keys.offer(accountId,requestId));
      if(!offer || !noExtras(pkg,pkgNames)||pkg.version!==1||
        pkg.accountId!==accountId||pkg.requestId!==requestId||
        pkg.ownerDeviceId!==owner||pkg.recipientDeviceId!==candidate||
        !publicP256(pkg.ephemeralPublicJwk) ||
        !isB64(pkg.offerHash,43,43) ||
        pkg.offerHash!==await hashOffer(offer) ||
        !isB64(pkg.salt,22,22)||unb64url(pkg.salt).length!==16 ||
        !isB64(pkg.nonce,16,16)||unb64url(pkg.nonce).length!==12 ||
        !isB64(pkg.ciphertext,64,160) ||
        !fresh(pkg.createdAt,pkg.expiresAt,this.clock()) ||
        Date.parse(pkg.expiresAt)>Date.parse(offer.expiresAt))
        return deny(400,"Invalid encrypted key package.");
      const ownerSigningKey=await this.getDeviceKey(owner);
      if(!ownerSigningKey||await fingerprint(ownerSigningKey)!==owner||
        !await verify(ownerSigningKey,
          signed("NOEMA_ACCOUNT_KEY_PACKAGE_V1",packageFields(pkg)),pkg.signature))
        return deny(403,"Owner key package signature invalid.");
      const result=await this.storage.transaction(async tx=>{
        if(await tx.get(keys.package(accountId,requestId)) ||
           await tx.get(keys.claimed(accountId,requestId)))return false;
        const recipient=await tx.get(keys.member(accountId,candidate));
        const source=await tx.get(keys.member(accountId,owner));
        if(!memberActive(recipient,accountId,candidate)||
           !memberActive(source,accountId,owner,true))return false;
        await tx.put(keys.package(accountId,requestId),pkg);
        return true;
      });
      return result?ok({stored:true},201):deny(409,"Key package already used.");
    }
    if(action==="claim"&&request.method==="POST"){
      if(session.deviceId!==candidate)return deny(403,"Recipient only.");
      const result=await this.storage.transaction(async tx=>{
        const membership=await tx.get(keys.member(accountId,candidate));
        if(!memberActive(membership,accountId,candidate))
          return {status:403};
        if(await tx.get(keys.claimed(accountId,requestId)))
          return {status:410};
        const pkg=await tx.get(keys.package(accountId,requestId));
        if(!pkg||this.clock()>=Date.parse(pkg.expiresAt))
          return {status:404};
        await tx.delete(keys.package(accountId,requestId));
        await tx.put(keys.claimed(accountId,requestId),{claimedAt:nowIso(this.clock())});
        return {package:pkg};
      });
      if(result.status)return deny(result.status,"Key package unavailable.");
      const ownerSigningKey=await this.getDeviceKey(owner);
      if(!ownerSigningKey)return deny(404,"Owner identity unavailable.");
      return ok({package:result.package,ownerSigningKey});
    }
    return deny(405,"Unsupported exchange action.");
  }
}
