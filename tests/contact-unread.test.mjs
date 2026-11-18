import {test} from "node:test";
import assert from "node:assert/strict";
import {
  contactReadKey,unreadIncomingCount,latestIncomingSequence,
  lastReadIncoming,markIncomingRead,CONTACT_READ_EVENT,
} from "../src/lib/network/contact-unread.ts";

const messages=[
 {seq:1,sender:"owner"}, {seq:2,sender:"guest"}, {seq:3,sender:"agent"},
 {seq:4,sender:"guest"}, {seq:5,sender:"owner"},
];
test("outgoing owner replies and agent replies never count as unread",()=>{
  assert.equal(unreadIncomingCount(messages,0),2);
  assert.equal(unreadIncomingCount(messages,2),1);
  assert.equal(unreadIncomingCount(messages,4),0);
  assert.equal(unreadIncomingCount([{seq:1,sender:"owner"}],0),0);
  assert.equal(unreadIncomingCount([{seq:1,sender:"agent"}],0),0);
  assert.equal(latestIncomingSequence(messages),4);
  assert.equal(latestIncomingSequence([{seq:8,sender:"owner"}]),0);
});
test("read markers are scoped per owner device and conversation",()=>{
  assert.notEqual(contactReadKey("owner-a","thread-1"),contactReadKey("owner-a","thread-2"));
  assert.notEqual(contactReadKey("owner-a","thread-1"),contactReadKey("owner-b","thread-1"));
  const values=new Map();const listeners=[];
  const oldWindow=globalThis.window;
  globalThis.window={
    localStorage:{
      getItem:key=>values.get(key)??null,
      setItem:(key,value)=>{values.set(key,value);},
    },
    dispatchEvent:event=>{listeners.push(event.type);},
  };
  try {
    assert.equal(lastReadIncoming("owner-a","thread-1"),0);
    markIncomingRead("owner-a","thread-1",4);
    assert.equal(lastReadIncoming("owner-a","thread-1"),4);
    assert.equal(lastReadIncoming("owner-b","thread-1"),0);
    markIncomingRead("owner-a","thread-1",2);
    assert.equal(lastReadIncoming("owner-a","thread-1"),4,"must never regress a read cursor");
    markIncomingRead("owner-a","thread-1",5);
    assert.equal(lastReadIncoming("owner-a","thread-1"),5);
    assert.deepEqual(listeners,[CONTACT_READ_EVENT,CONTACT_READ_EVENT]);
  } finally { if(oldWindow===undefined)delete globalThis.window;else globalThis.window=oldWindow; }
});
