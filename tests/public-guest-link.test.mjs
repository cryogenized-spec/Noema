import {test} from "node:test";
import assert from "node:assert/strict";
import {makePublicGuestInvite} from "../src/lib/network/public-guest-link.ts";
test("public beta guest QR has permanent host and fragment-only capabilities",()=>{
 const token="A".repeat(43),key="B".repeat(43);
 const link=makePublicGuestInvite("https://noema-guest.vercel.app/",token,key);
 const url=new URL(link);
 assert.equal(url.origin,"https://noema-guest.vercel.app");
 assert.equal(url.pathname,"/");
 assert.equal(url.search,"");
 assert.equal(new URLSearchParams(url.hash.slice(1)).get("invite"),token);
 assert.equal(new URLSearchParams(url.hash.slice(1)).get("k"),key);
 assert.equal(url.href.split("#")[0],"https://noema-guest.vercel.app/");
});
test("insecure origins and weak invite capabilities cannot make public links",()=>{
 assert.throws(()=>makePublicGuestInvite("http://other.site","A".repeat(43),"B".repeat(43)));
 assert.throws(()=>makePublicGuestInvite("https://noema-guest.vercel.app","bad","B".repeat(43)));
 assert.throws(()=>makePublicGuestInvite("https://noema-guest.vercel.app","A".repeat(43),"bad"));
});
