import { test } from "node:test";
import assert from "node:assert/strict";
import { verifiedHttpsUrl, splitWorkshopTags } from "../src/lib/profile/validators.ts";
import { NEW_WORKSHOP_PROFILE } from "../src/types/profile.ts";

test("workshop proofs accept HTTPS only, rejecting active-content and malformed URLs", () => {
  assert.equal(verifiedHttpsUrl("javascript:alert(1)"), "");
  assert.equal(verifiedHttpsUrl("data:text/html,hello"), "");
  assert.equal(verifiedHttpsUrl("http://example.com"), "");
  assert.equal(verifiedHttpsUrl("not a URL"), "");
  assert.equal(verifiedHttpsUrl(" https://github.com/example/noema "), "https://github.com/example/noema");
});

test("tags are trimmed, deduplicated and bounded", () => {
  assert.deepEqual(splitWorkshopTags("React, Linux, React, , CNC"), ["React", "Linux", "CNC"]);
  assert.equal(splitWorkshopTags(Array.from({length:50}, (_, i) => "skill-" + i).join(",")).length, 24);
  assert.equal(splitWorkshopTags("x".repeat(150))[0].length, 48);
});

test("workshop schema supports RADIX-derived sections without public state", () => {
  assert.equal(NEW_WORKSHOP_PROFILE.id, "self");
  for (const field of ["builds", "proficiencies", "inventory", "contributions", "gallery", "links"]) {
    assert.ok(Array.isArray(NEW_WORKSHOP_PROFILE[field]), field + " should start empty");
  }
  assert.equal(NEW_WORKSHOP_PROFILE.collaboration, "selective");
  assert.equal(NEW_WORKSHOP_PROFILE.identityType, "human");
});
