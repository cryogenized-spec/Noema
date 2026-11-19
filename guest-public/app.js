import {
  base64url,deviceFingerprint,importSecret,inviteKeyFromHash,
  deviceProofBytes,seal,open,
} from "./crypto.mjs";
import {createTimelineGuard,createDraftBuffer} from "./timeline.mjs";
import {mergeMessagePages} from "./history.mjs";
import {outboxKey,validOutboxRecord,permanentDeliveryFailure} from "./outbox.mjs";

const RELAY="https://noema-contact-relay-staging.cryogenized.workers.dev";
const DB_NAME="noema-guest-identity-v1";
const STORE="entries";
const byId=(id)=>document.getElementById(id);
const ui=Object.fromEntries([
  "threads","onboarding","empty","chat","alias","accept","recipient","messages",
  "composer","message","send","status","footer","refresh","invite-title","invite-description","notification-toggle",
].map(k=>[k,byId(k)]));

const invitationToken=()=>{
  // Invitation token and AES key travel in the URL fragment only: never in
  // Vercel request paths, web access logs, or HTTP referrer headers.
  const candidate=new URLSearchParams(window.location.hash.replace(/^#/,"")).get("invite")||"";
  return /^[A-Za-z0-9_-]{12,90}$/.test(candidate)?candidate:"";
};
let token=invitationToken(),inviteSecret=inviteKeyFromHash(location.hash);
let device=null,session=null,allThreads=[],selected="",busy=false,pollBusy=false;
let lastRendered="";
let queued=[],queueBusy=false,lastQueueAttempt=0;
let historyThread="",messageCache=[],hasOlder=false,olderBusy=false;
const timeline=createTimelineGuard(), drafts=createDraftBuffer();
let reauth=null,pushConfiguration=null,pushBusy=false;
const supportsPush=()=>window.isSecureContext && "Notification" in window &&
  "serviceWorker" in navigator && "PushManager" in window;
const pushKeyBytes=(key)=>{
  if(!/^[A-Za-z0-9_-]{80,100}$/.test(key))throw Error("Invalid notification server key.");
  const raw=atob(key.replace(/-/g,"+").replace(/_/g,"/")+"=".repeat((4-key.length%4)%4));
  const bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));
  if(bytes.length!==65||bytes[0]!==4)throw Error("Invalid notification server key.");
  return bytes;
};
function renderPush(){
  const button=ui["notification-toggle"];
  const available=supportsPush() && !!pushConfiguration?.available && allThreads.length>0;
  button.hidden=!available;
  if(!available)return;
  const enabled=!!pushConfiguration.enabled && Notification.permission==="granted";
  button.textContent=enabled?"🔕":"🔔";
  button.title=enabled?"Disable notifications":"Enable notifications";
  button.setAttribute("aria-label",button.title);
  button.setAttribute("aria-pressed",String(enabled));
  button.disabled=pushBusy;
}
async function refreshPush(){
  if(!supportsPush()||!session||!allThreads.length)return;
  try{pushConfiguration=await api("/v1/push/config");}catch{pushConfiguration=null;}
  renderPush();
}
async function togglePush(){
  if(pushBusy||!pushConfiguration?.available)return;
  const enabling=!(pushConfiguration.enabled && Notification.permission==="granted");
  // Browsers require a direct tap. Start the permission request before any await.
  const requested=enabling?Notification.requestPermission():null;
  pushBusy=true;renderPush();
  try{
    if(enabling){
      if(await requested!=="granted")throw Error("Allow notifications in browser settings to enable.");
      const config=await api("/v1/push/config");
      if(!config.available||!config.publicKey)throw Error("Notifications are unavailable.");
      const key=pushKeyBytes(config.publicKey);
      const registration=await navigator.serviceWorker.register("/noema-push-sw.js",{scope:"/"});
      let subscription=await registration.pushManager.getSubscription();
      if(subscription){
        const previous=new Uint8Array(subscription.options.applicationServerKey||new ArrayBuffer(0));
        if(previous.length!==key.length||previous.some((v,i)=>v!==key[i])){
          await subscription.unsubscribe();subscription=null;
        }
      }
      if(!subscription)subscription=await registration.pushManager.subscribe({
        userVisibleOnly:true,applicationServerKey:key,
      });
      try{await api("/v1/push/subscribe","POST",{subscription:subscription.toJSON()});}
      catch(e){await subscription.unsubscribe().catch(()=>{});throw e;}
    }else{
      await api("/v1/push/unsubscribe","POST",{});
      const registration=await navigator.serviceWorker.getRegistration("/");
      const subscription=await registration?.pushManager.getSubscription();
      if(subscription)await subscription.unsubscribe();
    }
    pushConfiguration=await api("/v1/push/config");
    status("");
  }catch(e){status(serverError(e));}
  finally{pushBusy=false;renderPush();}
}

const show=(name,yes)=>{ui[name].hidden=!yes;};
const status=(message)=>{ui.status.textContent=message||"";ui.footer.hidden=!message;};
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
const erase=(id)=>withStore("readwrite",s=>{s.delete(id);});
const getEntries=(prefix)=>withStore("readonly",store=>{
  const found=[];
  const range=IDBKeyRange.bound(prefix,prefix+"\uffff");
  const req=store.openCursor(range);
  req.onsuccess=()=>{
    const cursor=req.result;
    if(cursor){found.push(cursor.value);cursor.continue();}
  };
  return found;
});
async function readQueued(){
  if(!device)return [];
  const rows=await getEntries("outbox:"+device.deviceId+":");
  queued=rows.filter(validOutboxRecord).sort((a,b)=>a.createdAt.localeCompare(b.createdAt));
  return queued;
}
async function saveQueue(item){
  if(!validOutboxRecord(item)||item.deviceId!==device?.deviceId)
    throw Error("Encrypted outbox record invalid");
  const all=await readQueued();
  if(all.some(x=>x.id===item.id)){
    const existing=all.find(x=>x.id===item.id);
    if(existing.ciphertext!==item.ciphertext)throw Error("Message ID collision");
    return;
  }
  if(all.length>=32)throw Error("Encrypted outbox full; retry or discard queued messages");
  await put(item);
  await readQueued();
}
async function deliverQueued(item){
  if(!device||!session||item.deviceId!==device.deviceId) return "pending";
  try{
    await api("/v1/threads/"+encodeURIComponent(item.threadId)+"/messages","POST",{
      clientMessageId:item.clientMessageId,content:item.ciphertext,
    });
    await erase(item.id);
    return "sent";
  }catch(e){
    if(permanentDeliveryFailure(e.status)){
      await put({...item,blocked:true});
      return "blocked";
    }
    return "pending";
  }
}
async function flushQueue(force=false){
  if(queueBusy||!device||!session||!navigator.onLine||document.visibilityState!=="visible"||
      (!force&&Date.now()-lastQueueAttempt<15000))return;
  queueBusy=true;lastQueueAttempt=Date.now();
  try{
    for(const item of (await readQueued()).filter(x=>!x.blocked).slice(0,4)){
      const result=await deliverQueued(item);
      if(result==="pending")break;
    }
  }finally{queueBusy=false;await readQueued();paintMessageHistory();}
}
async function restoreCachedThreads(){
  if(!device)return;
  const rows=await getEntries("thread:");
  const restored=rows.filter(x=>validID(x.threadId)&&validID(x.keyId))
    .map(x=>x.thread||{
      id:x.threadId,keyId:x.keyId,ownerAlias:"Private contact",
      guest:device.deviceId,owner:"",nextSeq:0,
    }).filter(x=>validID(x.id)&&validID(x.keyId));
  if(restored.length && !allThreads.length){
    allThreads=restored;
    if(!selected)selectThread(restored[0].id);
    renderTabs();renderPanels();
  }
}
async function cacheThreadRoster(items){
  await withStore("readwrite",store=>{
    for(const thread of items){
      if(validID(thread.id)&&validID(thread.keyId))
        store.put({id:"thread:"+thread.id,threadId:thread.id,keyId:thread.keyId,thread});
    }
  });
}


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
async function api(path,method="GET",payload,auth=true,retry=true){
  const response=await fetch(RELAY+path,{
    method,headers:{"Content-Type":"application/json",
      ...(auth && session?.token?{Authorization:"Bearer "+session.token}:{})},
    ...(payload!==undefined?{body:JSON.stringify(payload)}:{}),
    mode:"cors",cache:"no-store",referrerPolicy:"no-referrer",
  });
  // Signed sessions expire; renew once without asking the visitor to reload.
  if(auth && retry && response.status===401){
    if(!reauth)reauth=authenticate(true).finally(()=>{reauth=null;});
    await reauth;
    return api(path,method,payload,auth,false);
  }
  let result;
  try{result=await response.json();}catch{throw Error("NOEMA relay is not responding");}
  if(!response.ok){const error=Error(String(result.error||"NOEMA request was rejected"));error.status=response.status;throw error;}
  return result;
}
async function authenticate(force=false){
  const restored=force?null:(()=>{try{return JSON.parse(sessionStorage.getItem("noema-guest-session")||"null");}catch{return null;}})();
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
function selectThread(id){
  if(selected)drafts.set(selected,ui.message.value);
  selected=id;
  timeline.select(id);
  ui.message.value=drafts.get(id);
  lastRendered="";
  historyThread=id;
  messageCache=[];
  hasOlder=false;
  olderBusy=false;
  paintMessageHistory();
}
function renderTabs(){
  ui.threads.replaceChildren();
  show("threads",allThreads.length>1);
  for(const thread of allThreads){
    const tab=document.createElement("button");
    tab.type="button";tab.className="thread"+(thread.id===selected?" active":"");
    tab.textContent=word(thread.ownerAlias)||"Private contact";
    tab.title="Open "+tab.textContent;
tab.addEventListener("click",()=>{selectThread(thread.id);renderTabs();void loadMessages().catch(e=>status(serverError(e)));});
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
async function decryptPage(thread,messages){
  const key=await threadSecret(thread);
  return Promise.all(messages.map(async m=>{
    try{return {...m,text:await open(key,thread.id,m.clientMessageId,m.content)};}
    catch{return {...m,text:"[Unable to decrypt on this device]"};}
  }));
}
function paintMessageHistory(prepend=false){
  const beforeHeight=ui.messages.scrollHeight, beforeTop=ui.messages.scrollTop;
  const nearBottom=beforeHeight-beforeTop-ui.messages.clientHeight<100;
  ui.messages.replaceChildren();
  if(hasOlder){
    const more=document.createElement("button");
    more.type="button";more.className="older-messages";
    more.textContent=olderBusy?"Loading…":"Load older messages";
    more.disabled=olderBusy;
    more.addEventListener("click",()=>void loadOlderMessages());
    ui.messages.append(more);
  }
  for(const message of messageCache){
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
  for(const item of queued.filter(x=>x.threadId===selected)){
    const row=document.createElement("div");row.className="queued-row";
    const label=document.createElement("span");
    label.textContent=item.blocked?"Not delivered":"Queued · encrypted";
    const retry=document.createElement("button");retry.type="button";retry.textContent="Retry";
    retry.setAttribute("aria-label","Retry queued message");
    retry.addEventListener("click",async()=>{
      retry.disabled=true;
      try{
        const result=await deliverQueued(item);
        await readQueued();paintMessageHistory();
        if(result==="sent"){lastRendered="";if(session)await loadMessages();}
        else status(result==="blocked"?"Delivery rejected; message retained.":"Message remains queued.");
      }catch(e){status(serverError(e));}finally{retry.disabled=false;}
    });
    const discard=document.createElement("button");discard.type="button";discard.textContent="Discard";
    discard.setAttribute("aria-label","Discard queued message");
    discard.addEventListener("click",async()=>{
      try{await erase(item.id);await readQueued();paintMessageHistory();}
      catch(e){status(serverError(e));}
    });
    row.append(label,retry,discard);ui.messages.append(row);
  }
  if(prepend)ui.messages.scrollTop=beforeTop+(ui.messages.scrollHeight-beforeHeight);
  else if(nearBottom || lastRendered==="")ui.messages.scrollTop=ui.messages.scrollHeight;
  else ui.messages.scrollTop=beforeTop;
}
async function loadOlderMessages(){
  const thread=allThreads.find(x=>x.id===selected);
  const before=messageCache[0]?.seq;
  if(!thread||!hasOlder||olderBusy||!Number.isSafeInteger(before)||before<=1)return;
  olderBusy=true;
  const current=timeline.begin(thread.id);
  paintMessageHistory();
  try{
    const page=await api("/v1/threads/"+encodeURIComponent(thread.id)+
      "/messages?before="+encodeURIComponent(String(before)));
    if(!current())return;
    const older=await decryptPage(thread,page.messages);
    if(!current()||historyThread!==thread.id)return;
    messageCache=mergeMessagePages(messageCache,older);
    hasOlder=page.hasMore===true;
    olderBusy=false;
    paintMessageHistory(true);
  }catch(e){if(current())status(serverError(e));}
  finally{
    olderBusy=false;
    if(current())paintMessageHistory();
  }
}
async function loadMessages(){
  if(olderBusy)return; // Do not invalidate a pending older-page load with a routine poll.
  const thread=allThreads.find(x=>x.id===selected);
  if(!thread)return;
  const current=timeline.begin(thread.id);
  const result=await api("/v1/threads/"+encodeURIComponent(thread.id)+"/messages?after=0");
  if(!current())return;
  const stamp=thread.id+":"+result.nextSeq;
  if(stamp===lastRendered)return;
  const fragments=await decryptPage(thread,result.messages);
  if(!current())return;
  const sameThread=historyThread===thread.id;
  messageCache=mergeMessagePages(sameThread?messageCache:[],fragments);
  if(!sameThread){historyThread=thread.id;hasOlder=result.hasMore===true;}
  else if(messageCache.length===fragments.length)
    hasOlder=result.hasMore===true;
  ui.recipient.textContent=word(thread.ownerAlias)||"Your contact";
  paintMessageHistory();
  lastRendered=stamp;
}
async function refresh(){
  if(pollBusy||document.visibilityState==="hidden"||!session||token)return;
  pollBusy=true;
  try{
    if(!session)await authenticate();
    const next=await remoteThreads();
    allThreads=next;
    await cacheThreadRoster(next);
    if(!selected||!next.some(x=>x.id===selected)){
      selectThread(next[0]?.id||"");
    }
    renderTabs();renderPanels();renderPush();
    if(selected)await loadMessages();
    await flushQueue();
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
    // Commit the encrypted chat key and thread pointer together. A browser
    // storage failure must not leave only one half of the saved conversation.
    await withStore("readwrite",store=>{
      store.put({id:"key:"+thread.keyId,key,createdAt:new Date().toISOString()});
      store.put({id:"thread:"+thread.id,threadId:thread.id,keyId:thread.keyId,thread});
      store.delete("pending:"+token);
    });
    token="";inviteSecret="";history.replaceState(null,"","/");
    selectThread(thread.id);
    await refresh();
    renderPanels();
    void refreshPush();
    status("");
  }catch(e){status(serverError(e));}
  finally{busy=false;renderPanels();}
}
async function send(event){
  event.preventDefault();
  if(busy||!device||!selected)return;
  const txt=ui.message.value.trim();
  if(!txt)return;
  const thread=allThreads.find(t=>t.id===selected);
  if(!thread)return;
  busy=true;ui.send.disabled=true;
  try{
    const id="message-"+crypto.randomUUID().replaceAll("-","");
    const ciphertext=await seal(await threadSecret(thread),thread.id,id,txt);
    const item={
      id:outboxKey(device.deviceId,thread.id,id),
      deviceId:device.deviceId,threadId:thread.id,keyId:thread.keyId,
      clientMessageId:id,ciphertext,createdAt:new Date().toISOString(),
    };
    // Persist ciphertext first; never send if local durable storage failed.
    await saveQueue(item);
    if(drafts.clearIfUnchanged(thread.id,txt) && selected===thread.id)ui.message.value="";
    const result=await deliverQueued(item);
    await readQueued();
    paintMessageHistory();
    if(result==="sent"){
      if(selected===thread.id){lastRendered="";await loadMessages();}
      status("");
    }else status(result==="blocked"?"Delivery rejected; retry or discard queued message."
      :"Encrypted message queued until online.");
  }catch(e){status(serverError(e));}
  finally{busy=false;ui.send.disabled=false;}
}
async function init(){
  renderPanels();
  try{
    device=await identity();
    await restoreCachedThreads();
    await readQueued();
    paintMessageHistory();
    await authenticate();
    ui.accept.disabled=false;
    if(token&&!inviteSecret)status("Invitation decryption key is missing.");
    if(!token){
      // Clean up URL fragments that may have come from accidental navigation.
      if(location.hash)history.replaceState(null,"",location.pathname+location.search);
      await refresh();
      void refreshPush();
    }else renderPanels();
  }catch(e){status(serverError(e));ui.accept.disabled=true;}
}
ui.accept.addEventListener("click",()=>void accept());
ui["notification-toggle"].addEventListener("click",()=>void togglePush());
ui.composer.addEventListener("submit",e=>void send(e));
ui.message.addEventListener("input",()=>drafts.set(selected,ui.message.value));
ui.refresh.addEventListener("click",()=>void refresh());
window.addEventListener("focus",()=>void refresh());
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")void refresh();});
window.setInterval(()=>{void refresh();},5000);
// Mobile keyboards can resize only the visual viewport. Keep the conversation
// and composer within its actual height instead of scrolling the whole page.
const viewport=window.visualViewport;
if(viewport){
  const fitViewport=()=>{
    if(viewport.scale!==1){
      document.documentElement.style.removeProperty("--noema-viewport-height");
      return;
    }
    document.documentElement.style.setProperty("--noema-viewport-height",
      Math.max(1,Math.floor(viewport.height))+"px");
  };
  viewport.addEventListener("resize",fitViewport);
  window.addEventListener("resize",fitViewport);
  fitViewport();
}
void init();
