/** Pairing tokens never belong in query strings, logs, referrers or server HTML. */
const id=(value:unknown)=>typeof value==="string" && /^[A-Za-z0-9_-]{12,90}$/.test(value);
export interface PairingLink { accountId:string; token:string; }
export function parsePairingFragment(fragment:string):PairingLink|null {
  const query=new URLSearchParams(fragment.replace(/^#/,""));
  const accountId=query.get("account"),token=query.get("pair");
  if(!id(accountId)||!token||!/^[A-Za-z0-9_-]{40,90}$/.test(token))return null;
  return {accountId:accountId!,token};
}
export function makePairingLink(baseUrl:string,accountId:string,token:string):string {
  if(!id(accountId)||!/^[A-Za-z0-9_-]{40,90}$/.test(token))
    throw new Error("Invalid pairing URL fields.");
  const url=new URL("/identity",baseUrl);
  if(url.protocol!=="https:"&&!(url.protocol==="http:"&&url.hostname==="localhost"))
    throw new Error("Pairing links require HTTPS.");
  url.search="";
  url.hash=new URLSearchParams({account:accountId,pair:token}).toString();
  return url.toString();
}
