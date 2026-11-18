import {test} from "node:test";
import assert from "node:assert/strict";
import {createTimelineGuard,createDraftBuffer} from "../guest-public/timeline.mjs";

test("late decryption results cannot paint another selected conversation", async () => {
  const timeline=createTimelineGuard();
  timeline.select("thread-A");
  const first=timeline.begin("thread-A");
  timeline.select("thread-B");
  const second=timeline.begin("thread-B");
  await Promise.resolve();
  assert.equal(first(),false,"stale thread-A completion must be rejected");
  assert.equal(second(),true);
  const third=timeline.begin("thread-B");
  assert.equal(second(),false,"newer B request supersedes older B response");
  assert.equal(third(),true);
  timeline.select("");
  assert.equal(third(),false,"clearing selection invalidates a pending fetch");
});

test("drafts never jump between contacts or erase later edits", () => {
  const drafts=createDraftBuffer();
  drafts.set("A","Unsent message for A");
  drafts.set("B","Unsent for B");
  assert.equal(drafts.get("A"),"Unsent message for A");
  assert.equal(drafts.get("B"),"Unsent for B");
  assert.equal(drafts.clearIfUnchanged("A","Unsent message for A"),true);
  assert.equal(drafts.get("A"),"");
  assert.equal(drafts.get("B"),"Unsent for B");
  drafts.set("A","New text typed while a send is in flight");
  assert.equal(drafts.clearIfUnchanged("A","Old message"),false);
  assert.equal(drafts.get("A"),"New text typed while a send is in flight");
});
