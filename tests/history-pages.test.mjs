import {test} from "node:test";
import assert from "node:assert/strict";
import {mergeMessagePages as mergeOwner} from "../src/lib/network/message-history.ts";
import {mergeMessagePages as mergeGuest} from "../guest-public/history.mjs";
import {readFileSync} from "node:fs";

const file=(path)=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
test("history pages remain chronological and duplicate-free across out-of-order polling",()=>{
  const earlier=[{seq:1,text:"one"},{seq:2,text:"two"}];
  const latest=[{seq:2,text:"two-updated"},{seq:3,text:"three"}];
  const expected=[{seq:1,text:"one"},{seq:2,text:"two-updated"},{seq:3,text:"three"}];
  for(const merge of [mergeOwner,mergeGuest]){
    assert.deepEqual(merge(earlier,latest),expected);
    assert.deepEqual(merge(latest,earlier).map(x=>x.seq),[1,2,3]);
    assert.deepEqual(merge([{seq:2},{seq:3}],[{seq:1}]).map(x=>x.seq),[1,2,3]);
    assert.deepEqual(merge([{seq:4},{seq:4},{seq:2}],[]).map(x=>x.seq),[2,4]);
    assert.deepEqual(merge([{seq:-1},{seq:0},{seq:4}],[]).map(x=>x.seq),[4]);
  }
});
test("owner history UI exposes pagination and preserves scroll while background polling continues",()=>{
  const source=file("src/components/network/secure-contact.tsx");
  assert.match(source,/Load older messages/);
  assert.match(source,/relayGetOlderMessages/);
  assert.match(source,/historyScrollRestore/);
  assert.match(source,/mergeMessagePages/);
  assert.match(source,/ref=\{historyViewportRef\}/);
});
test("guest history UI has matching load-more behavior and never writes message plaintext to persistent storage",()=>{
  const guest=file("guest-public/app.js");
  assert.match(guest,/async function loadOlderMessages\(\)/);
  assert.match(guest,/mergeMessagePages/);
  assert.match(guest,/paintMessageHistory\(true\)/);
  assert.match(guest,/before=\x22\+encodeURIComponent/);
  assert.doesNotMatch(guest,/put\(\{[^\n]*messageCache/);
});
