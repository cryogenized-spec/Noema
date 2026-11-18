import {test} from "node:test";
import assert from "node:assert/strict";
import {makePairingLink,parsePairingFragment} from "../src/lib/identity/pairing-link.ts";

const id="abc_def_1234567890";
const token="A".repeat(43);
test("pairing link contains capability only in URL fragment",()=>{
  const u=makePairingLink("https://noema.example/other?auth=xyz",id,token);
  const parsed=new URL(u);
  assert.equal(parsed.pathname,"/identity");
  assert.equal(parsed.search,"");
  assert.equal(parsed.origin,"https://noema.example");
  assert.ok(parsed.hash.includes("pair="+token));
  assert.equal(parsed.href.includes("?pair="),false);
  assert.deepEqual(parsePairingFragment(parsed.hash),{accountId:id,token});
});
test("no ambiguous, short, untrusted, or insecure pairing links",()=>{
  assert.equal(parsePairingFragment("#pair=bad&account="+id),null);
  assert.equal(parsePairingFragment("#account=bad&pair="+token),null);
  assert.equal(parsePairingFragment(""),null);
  assert.throws(()=>makePairingLink("http://example.com",id,token));
  assert.throws(()=>makePairingLink("https://noema.example",id,"weak"));
});
