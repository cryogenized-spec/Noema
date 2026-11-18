import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read=(name)=>readFileSync(new URL("../"+name,import.meta.url),"utf8");

test("all primary menu entries share one navigation list and visual treatment",()=>{
  const nav=read("src/components/layout/workspace-navigation.tsx");
  const labels=["AI Chat","Signals","AI Studio","Organizer","Settings","Contacts / Inbox","Identity & Devices"];
  for(const label of labels)assert.ok(nav.includes('label: "'+label+'"'),label);
  assert.equal((nav.match(/kind: "route"/g)||[]).length,3,"route typing and exactly two route items");
  assert.match(nav,/key: "contacts", href: "\/connect", label: "Contacts \/ Inbox", icon: "solar:inbox-bold"/);
  assert.match(nav,/key: "identity", href: "\/identity", label: "Identity & Devices", icon: "solar:devices-bold"/);
  assert.doesNotMatch(nav,/invitationEntry|my-2 h-px/,"do not separate menu entries with a divider");
  assert.match(nav,/const classes/,"all destinations share a single styling rule");
});
test("Contact inbox uses a scrollable list on desktop and a single-view chat on mobile",()=>{
  const contact=read("src/components/network/secure-contact.tsx");
  assert.match(contact,/aria-label="Contact list"/);
  assert.match(contact,/role="listitem"/);
  assert.match(contact,/aria-label="Back to contacts"/);
  assert.match(contact,/mobileContactsRef\.current=true/);
  assert.match(contact,/md:flex md:w-\[var\(--noema-contact-sidebar-width\)\]/);
  assert.doesNotMatch(contact,/aria-label="Select conversation"/);
  assert.match(contact,/!mobileContactsRef\.current/,"mobile list must not mark hidden thread as read");
});
test("nonessential caution on Contact Bridge removed without changing the working inbox route",()=>{
  const share=read("src/app/share/page.tsx");
  assert.doesNotMatch(share,/This development preview has no Cloudflare relay/);
  assert.doesNotMatch(share,/This private staging service still requires Vercel access/);
  assert.match(share,/stableContactUrl/);
});
