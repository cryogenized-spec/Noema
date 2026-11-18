/** One-use secret link, bound to the long-lived public guest app origin. */
export function makePublicGuestInvite(base:string,token:string,secret:string):string{
  if(!/^[A-Za-z0-9_-]{12,90}$/.test(token) ||
     !/^[A-Za-z0-9_-]{43}$/.test(secret))throw Error("Invalid invitation capability.");
  const origin=new URL(base);
  if(origin.protocol!=="https:")throw Error("Guest invitations require HTTPS.");
  // Never put secret or invitation token in URL path or query string.
  origin.pathname="/";origin.search="";
  origin.hash=new URLSearchParams({invite:token,k:secret}).toString();
  return origin.toString();
}
