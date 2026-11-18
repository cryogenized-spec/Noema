/** Exact-origin browser access to the public guest-only NOEMA API surface.
 * Origin headers are CORS boundaries, NOT authentication; signed sessions,
 * one-use invites, and conversation membership remain mandatory at the relay.
 */
import {sameOrigin} from "./protocol.mjs";

export function classifyBrowserOrigin(origin,ownerOrigin,guestOrigin){
  if(!ownerOrigin || !/^https:\/\//.test(ownerOrigin))return null;
  if(!origin)return "server"; // Signed non-browser clients are still authenticated separately.
  if(sameOrigin(origin,ownerOrigin))return "owner";
  if(guestOrigin && /^https:\/\//.test(guestOrigin) && sameOrigin(origin,guestOrigin))
    return "guest";
  return null;
}
export function allowedGuestRoute(method,path){
  if(method==="POST" &&
    ["/v1/auth/challenge","/v1/auth/verify","/v1/invites/redeem"].includes(path))
    return true;
  if(method==="GET" && ["/v1/identity","/v1/threads"].includes(path))return true;
  const thread=/^\/v1\/threads\/[A-Za-z0-9_-]{12,90}(?:\/messages)?$/.exec(path);
  if(!thread)return false;
  if(method==="GET")return true;
  return method==="POST" && path.endsWith("/messages");
}
