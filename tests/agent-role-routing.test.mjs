import { test } from "node:test";
import assert from "node:assert/strict";
import { AGENT_ROLE_DEFINITIONS, normalizeAgentRoles, roleTransferPlan } from "../src/lib/agents/role-routing.ts";

test("RADIX's six colour roles are unique, readable and maintain stable identifiers", () => {
  assert.deepEqual(AGENT_ROLE_DEFINITIONS.map(({ id }) => id),
    ["primary", "organizer", "feed", "channeler", "workbench", "media"]);
  assert.equal(new Set(AGENT_ROLE_DEFINITIONS.map(({ color }) => color)).size, 6);
});
test("bad or repeated role pins cannot be saved", () => {
  assert.deepEqual(normalizeAgentRoles(["primary", "primary", "workbench", "not-a-role", null]), ["primary", "workbench"]);
  assert.deepEqual(normalizeAgentRoles(null), []);
});
test("transferring roles strips only conflicting assignments from other agents", () => {
  const changes = roleTransferPlan([
    { id: 1, roleAssignments: ["primary", "feed"] },
    { id: 2, roleAssignments: ["organizer", "workbench"] },
    { id: 3, roleAssignments: ["media"] },
  ], 3, ["primary", "organizer"]);
  assert.deepEqual(changes, [
    { id: 1, roleAssignments: ["feed"] },
    { id: 2, roleAssignments: ["workbench"] },
  ]);
});
test("updating the same agent does not revoke its roles", () => {
  assert.deepEqual(roleTransferPlan([{id:1,roleAssignments:["primary"]}],1,["primary"]),[]);
});
