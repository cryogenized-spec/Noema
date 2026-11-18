import {
  base64url,deviceFingerprint,importSecret,inviteKeyFromHash,
  deviceProofBytes,seal,open,
} from "./crypto.mjs";

const RELAY="https://noema-contact-relay-staging.cryogenized.workers.dev";
const DB_NAME="noema-guest-identity-v1";
const STORE="entries";
const byId=(id)=>document.getElementById(id);
const ui=Object.fromEntries([
  "threads","onboarding","empty","chat","alias","accept","recipient","messages",
  "composer","message","send","status","refresh","invite-title","invite-description",
].map(k=>[k,byId(k)]));

const invitationToken=()=>{
  // Invitation token and AES key travel in the URL fragment only: never in
  // Vercel request paths, web access logs, or HTTP referrer headers.
  const candidate=new URLSearchParams(window.location.hash.replace(/^#/,"")).get("invite")||"";
  return /^[A-Za-z0-9_-]{12,90}$/.test(candidate)?candidate:"";
};
let token=invitationToken(),inviteSecret=inviteKeyFromHash(location.hash);
let device=null,session=null,allThreads=[],selected="",busy=false,pollBusy=false;
let pendingSend=null,lastRendered="";
const show=(name,yes)=>{ui[name].hidden=!yes;};
const status=(message)=>{ui.status.textContent=message||"";};
const word=(v)=>String(v??"").trim().slice(0,80);
const serverError=(value)=>value instanceof Error?value.message:"Cannot connect to NOEMA";
const validID=(v)=>typeof v==="string"&&/^[A-Za-z0-9_-]{12,90}$/.test(v);

function withStore(mode,callback){
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB_NAME,1);
    req.onupgradeneeded=()=>{
      if(!req.result.objectStoreNames.contains(STORE))
        req.result.createObjectStore(STORE,{keyPath:"id"});
    };
    req.onerror=()=>reject(req.error||Error("Secure browser storage unavailable"));
    req.onblocked=()=>reject(Error("Close other NOEMA guest tabs and retry"));
    req.onsuccess=()=>{
      const db=req.result;
      const transaction=db.transaction(STORE,mode);
      const s=transaction.objectStore(STORE);
      let result;
      try{result=callback(s);}catch(e){db.close();reject(e);return;}
      transaction.oncomplete=()=>{db.close();resolve(result);};
      transaction.onerror=()=>{db.close();reject(transaction.error||Error("Browser storage error"));};
      transaction.onabort=()=>{db.close();reject(transaction.error||Error("Browser storage was interrupted"));};
    };
  });
}
async function get(id){
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB_NAME,1);
    req.onupgradeneeded=()=>{
      if(!req.result.objectStoreNames.contains(STORE))
        req.result.createObjectStore(STORE,{keyPath:"id"});
    };
    req.onerror=()=>reject(req.error||Error("Browser storage unavailable"));
    req.onsuccess=()=>{
      const db=req.result;
      const transaction=db.transaction(STORE,"readonly");
      const value=transaction.objectStore(STORE).get(id);
      value.onsuccess=()=>resolve(value.result);
      value.onerror=()=>reject(value.error||Error("Cannot read browser data"));
      transaction.oncomplete=()=>db.close();
      transaction.onerror=()=>{db.close();reject(transaction.error);};
    };
  });
}
const put=(v)=>withStore("readwrite",s=>{s.put(v);});
const del=(id)=>withStore("readwrite",s=>{s.delete(id);});

async function identity(){
  const saved=await get("device");
  if(saved){
    if(saved.privateKey?.extractable!==false ||
      saved.deviceId!==await deviceFingerprint(saved.publicJwk))
      throw Error("Stored device identity is damaged. No replacement was generated.");
    return saved;
  }
  const pair=await crypto.subtle.generateKey({name:"ECDSA",namedCurve:"P-256"},false,["sign","verify"]);
  const publicJwk=await crypto.subtle.exportKey("jwk",pair.publicKey);
  const record={id:"device",deviceId:await deviceFingerprint(publicJwk),
    publicJwk,privateKey:pair.privateKey,createdAt:new Date().toISOString()};
  await put(record);
  return record;
}
async function api(path,method="GET",payload,auth=true){
  const response=await fetch(RELAY+path,{
    method,headers:{"Content-Type":"application/json",
      ...(auth && session?.token?{Authorization:"Bearer "+session.token}:{})},
    ...(payload!==undefined?{body:JSON.stringify(payload)}:{}),
    mode:"cors",cache:"no-store",referrerPolicy:"no-referrer",
  });
  let result;
  try{result=await response.json();}catch{throw Error("NOEMA relay is not responding");}
  if(!response.ok)throw Error(String(result.error||"NOEMA request was rejected"));
  return result;
}
async function authenticate(){
  const restored=(()=>{try{return JSON.parse(sessionStorage.getItem("noema-guest-session")||"null");}catch{return null;}})();
  if(restored?.token && restored.deviceId===device.deviceId &&
     Date.parse(restored.expiresAt)-Date.now()>60000){
    session=restored;
    return;
  }
  const first=await api("/v1/auth/challenge","POST",{
    deviceId:device.deviceId,publicJwk:device.publicJwk,
  },false);
  const issuedAt=new Date().toISOString();
  const audience=RELAY;
  const proof=await crypto.subtle.sign({name:"ECDSA",hash:"SHA-256"},
    device.privateKey,deviceProofBytes(device.deviceId,first.challenge,audience,issuedAt));
  session=await api("/v1/auth/verify","POST",{
    deviceId:device.deviceId,publicJwk:device.publicJwk,createdAt:device.createdAt,
    challenge:first.challenge,audience,issuedAt,signature:base64url(new Uint8Array(proof)),
  },false);
  try{sessionStorage.setItem("noema-guest-session",JSON.stringify(session));}catch{}
}
async function remoteThreads(){
  const answer=await api("/v1/threads");
  return answer.threads.filter(t=>t.guest===device.deviceId);
}
function renderTabs(){
  ui.threads.replaceChildren();
  show("threads",allThreads.length>0);
  for(const thread of allThreads){
    const tab=document.createElement("button");
    tab.type="button";tab.className="thread"+(thread.id===selected?" active":"");
    tab.textContent=word(thread.ownerAlias)||"Private contact";
    tab.title="Open "+tab.textContent;
    tab.addEventListener("click",()=>{selected=thread.id;lastRendered="";renderTabs();void loadMessages();});
    ui.threads.append(tab);
  }
}
function renderPanels(){
  const joining=Boolean(token);
  show("onboarding",joining);
  show("chat",!joining && Boolean(selected));
  show("empty",!joining && !selected);
  if(joining){
    ui["invite-title"].textContent="Private invitation";
    ui["invite-description"].textContent=inviteSecret
      ? "Choose a name to appear in this conversation."
      : "This invitation is incomplete. Ask for a fresh QR or complete link.";
    ui.accept.disabled=!inviteSecret||!session||busy;
  }
}
async function threadSecret(thread){
  const stored=await get("key:"+thread.keyId);
  if(!stored?.key)throw Error("This device has no key for this conversation");
  return stored.key;
}
async function loadMessages(){
  const thread=allThreads.find(x=>x.id===selected);
  if(!thread)return;
  const result=await api("/v1/threads/"+encodeURIComponent(thread.id)+"/messages?after=0");
  const stamp=thread.id+":"+result.nextSeq;
  if(stamp===lastRendered)return;
  const key=await threadSecret(thread);
  const fragments=await Promise.all(result.messages.map(async m=>{
    try{return {...m,text:await open(key,thread.id,m.clientMessageId,m.content)};}
    catch{return {...m,text:"[Unable to decrypt on this device]"};}
  }));
  const nearBottom=ui.messages.scrollHeight-ui.messages.scrollTop-ui.messages.clientHeight<100;
  ui.messages.replaceChildren();
  for(const message of fragments){
    const bubble=document.createElement("div");
    bubble.className="bubble"+(message.sender==="guest"?" mine":"");
    const text=document.createElement("span");
    text.textContent=message.text;
    const date=document.createElement("span");
    date.className="date";
    date.textContent=new Date(message.createdAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});
    bubble.append(text,date);
    ui.messages.append(bubble);
  }
  ui.recipient.textContent=word(thread.ownerAlias)||"Your contact";
  if(nearBottom || lastRendered==="")ui.messages.scrollTop=ui.messages.scrollHeight;
  lastRendered=stamp;
}
async function refresh(){
  if(pollBusy||document.visibilityState==="hidden"||!session||token)return;
  pollBusy=true;
  try{
    const next=await remoteThreads();
    allThreads=next;
    if(!selected||!next.some(x=>x.id===selected)){
      selected=next[0]?.id||"";lastRendered="";
    }
    renderTabs();renderPanels();
    if(selected)await loadMessages();
    status("");
  }catch(e){status(serverError(e));}
  finally{pollBusy=false;}
}
async function accept(){
  if(busy||!token||!inviteSecret||!session)return;
  busy=true;ui.accept.disabled=true;status("Joining conversation…");
  try{
    const key=await importSecret(inviteSecret);
    // Prove non-extractable key can be persisted BEFORE spending the invitation.
    await put({id:"pending:"+token,key,at:new Date().toISOString()});
    const alias=word(ui.alias.value).slice(0,32)||"NOEMA guest";
    const response=await api("/v1/invites/redeem","POST",{token,alias});
    const thread=response.thread;
    await put({id:"key:"+thread.keyId,key,createdAt:new Date().toISOString()});
    await put({id:"thread:"+thread.id,threadId:thread.id,keyId:thread.keyId});
    await del("pending:"+token);
    token="";inviteSecret="";history.replaceState(null,"","/");
    selected=thread.id;lastRendered="";
    await refresh();
    renderPanels();
    status("You're connected.");
  }catch(e){status(serverError(e));}
  finally{busy=false;renderPanels();}
}
async function send(event){
  event.preventDefault();
  if(busy||!session||!selected)return;
  const txt=ui.message.value.trim();
  if(!txt)return;
  const thread=allThreads.find(t=>t.id===selected);
  if(!thread)return;
  busy=true;ui.send.disabled=true;
  try{
    const same=pendingSend&&pendingSend.threadId===thread.id&&pendingSend.text===txt;
    const id=same?pendingSend.id:"message-"+crypto.randomUUID().replaceAll("-","");
    const ciphertext=same?pendingSend.ciphertext:
      await seal(await threadSecret(thread),thread.id,id,txt);
    pendingSend={threadId:thread.id,text:txt,id,ciphertext};
    await api("/v1/threads/"+encodeURIComponent(thread.id)+"/messages",
      "POST",{clientMessageId:id,content:ciphertext});
    pendingSend=null;ui.message.value="";
    lastRendered="";
    await loadMessages();
    status("Sent");
  }catch(e){status(serverError(e));}
  finally{busy=false;ui.send.disabled=false;}
}
async function init(){
  renderPanels();
  try{
    device=await identity();
    await authenticate();
    ui.accept.disabled=false;
    if(token&&!inviteSecret)status("Invitation decryption key is missing.");
    if(!token){
      // Clean up URL fragments that may have come from accidental navigation.
      if(location.hash)history.replaceState(null,"",location.pathname+location.search);
      await refresh();
    }else renderPanels();
  }catch(e){status(serverError(e));ui.accept.disabled=true;}
}
ui.accept.addEventListener("click",()=>void accept());
ui.composer.addEventListener("submit",e=>void send(e));
ui.refresh.addEventListener("click",()=>void refresh());
window.addEventListener("focus",()=>void refresh());
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")void refresh();});
window.setInterval(()=>{void refresh();},5000);
void init();
