/**
 * Undeployed, opt-in account-scoped ciphertext mailbox.
 *
 * This layer is deliberately separate from the single-owner pilot inbox.
 * The registry MUST validate a signed browser session AND active membership
 * on every request. This module refuses plaintext and never decrypts.
 * Not yet a production E2EE messenger: it does not distribute keys.
 */
import { isId, messageText } from "./protocol.mjs";

const stamp=()=>new Date().toISOString();
const ok=(value,status=200)=>new Response(JSON.stringify(value),{
  status,headers:{"content-type":"application/json","cache-control":"no-store"},
});
const fail=(status,error)=>ok({error},status);
const MAX_ACCOUNT_MESSAGES=240;
const MAX_DAILY_MESSAGES=40;
const MAX_PAGE=50;
const keys={
  meta:(accountId)=>"account-mail:meta:"+accountId,
  messagePrefix:(accountId)=>"account-mail:message:"+accountId+":",
  message:(accountId,seq)=>keys.messagePrefix(accountId)+String(seq).padStart(12,"0"),
  dedupe:(accountId,deviceId,id)=>"account-mail:dedupe:"+accountId+":"+deviceId+":"+id,
  quota:(accountId,date)=>"account-mail:daily:"+accountId+":"+date,
};
const validCursor=(value)=>{
  if(value===null||value==="")return 0;
  if(!/^\d{1,12}$/.test(value))return null;
  const n=Number(value);
  return Number.isSafeInteger(n)&&n>=0?n:null;
};

/** Single-account routing is only a prototype:
 * production should put each account into its own Durable Object, with an
 * authenticated gateway enforcing membership and per-account quotas.
 */
export class AccountMailbox {
  constructor(storage, membership,clock=Date.now) {
    this.storage=storage;
    this.membership=membership;
    this.clock=clock;
  }
  async route(req,session,accountId,action,body) {
    if(!isId(accountId)||!isId(session?.deviceId))return fail(401,"Device session required.");
    if(action==="messages"&&req.method==="GET")
      return this.list(req,session,accountId);
    if(action==="messages"&&req.method==="POST")
      return this.post(session,accountId,body);
    return fail(404,"Unknown mailbox action.");
  }
  async list(req,session,accountId) {
    if(!await this.membership(accountId,session.deviceId))
      return fail(404,"Account mailbox unavailable.");
    const cursor=validCursor(new URL(req.url).searchParams.get("after"));
    if(cursor===null)return fail(400,"Invalid message cursor.");
    const meta=await this.storage.get(keys.meta(accountId))||{lastSeq:0,count:0};
    const entries=await this.storage.list({prefix:keys.messagePrefix(accountId)});
    const messages=[...entries.values()].filter(m=>m.seq>cursor)
      .sort((a,b)=>a.seq-b.seq).slice(0,MAX_PAGE);
    return ok({messages,nextSeq:meta.lastSeq,hasMore:messages.length===MAX_PAGE &&
      messages.at(-1).seq<meta.lastSeq});
  }
  async post(session,accountId,body) {
    if(!await this.membership(accountId,session.deviceId))
      return fail(404,"Account mailbox unavailable.");
    if(!isId(body?.clientMessageId))return fail(400,"Invalid idempotency ID.");
    let content;
    try{content=messageText(body?.content);}
    catch{return fail(400,"Only encrypted message envelopes may be stored.");}
    const today=new Date(this.clock()).toISOString().slice(0,10);
    const result=await this.storage.transaction(async tx=>{
      // Check again IN the write transaction; revocation may have happened
      // between the initial read and the actual message write.
      const member=await tx.get("accounts:member:"+accountId+":"+session.deviceId);
      const acct=await tx.get("accounts:entry:"+accountId);
      if(acct?.status!=="active"||member?.status!=="active"||!member.approvedAt||
        member.accountId!==accountId||member.deviceId!==session.deviceId)
        return {error:404,message:"Account mailbox unavailable."};
      const duplicate=await tx.get(keys.dedupe(accountId,session.deviceId,body.clientMessageId));
      if(duplicate) {
        if(duplicate.content!==content)return {error:409,message:"Conflicting message ID."};
        return {message:duplicate,replayed:true};
      }
      const meta=await tx.get(keys.meta(accountId))||{lastSeq:0,count:0};
      if(meta.count>=MAX_ACCOUNT_MESSAGES)
        return {error:507,message:"Staging account mailbox is full."};
      const daily=Number(await tx.get(keys.quota(accountId,today))||0);
      if(daily>=MAX_DAILY_MESSAGES)
        return {error:429,message:"Daily account message limit reached."};
      const seq=meta.lastSeq+1;
      const message={id:accountId+":"+seq,seq,clientMessageId:body.clientMessageId,
        senderDeviceId:session.deviceId,content,createdAt:stamp(),status:"stored"};
      await tx.put(keys.message(accountId,seq),message);
      await tx.put(keys.dedupe(accountId,session.deviceId,body.clientMessageId),message);
      await tx.put(keys.meta(accountId),{lastSeq:seq,count:meta.count+1});
      await tx.put(keys.quota(accountId,today),daily+1);
      return {message,replayed:false};
    });
    return result.error?fail(result.error,result.message):ok({
      message:result.message,replayed:result.replayed,
    },result.replayed?200:201);
  }
}
