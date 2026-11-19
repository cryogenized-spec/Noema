/* NOEMA's notification-only service worker. No fetch handler, offline content
 * cache, secrets, conversation identifiers, or access-token storage. */
self.addEventListener("push",event=>{
  // The transport carries a deliberately generic encrypted wake message.
  event.waitUntil(self.registration.showNotification("New NOEMA message",{
    tag:"noema-private-message",icon:"/icons/icon-192.svg",
    data:{path:"/connect"},renotify:false,
  }));
});
self.addEventListener("notificationclick",event=>{
  event.notification.close();
  event.waitUntil((async()=>{
    const target=new URL("/connect",self.location.origin);
    const windows=await self.clients.matchAll({type:"window",includeUncontrolled:true});
    for(const candidate of windows){
      try{
        const url=new URL(candidate.url);
        if(url.origin!==target.origin)continue;
        if(url.pathname!==target.pathname && "navigate" in candidate)
          await candidate.navigate(target.href);
        if("focus" in candidate)return await candidate.focus();
      }catch{ /* Ignore closed/inaccessible clients. */ }
    }
    return self.clients.openWindow(target.href);
  })());
});
