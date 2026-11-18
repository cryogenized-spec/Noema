import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read = path => readFileSync(new URL("../"+path,import.meta.url),"utf8");
test("contact notification mounts once in root layout, not inside home-only header",()=>{
  const layout=read("src/app/layout.tsx");
  const topBar=read("src/components/layout/top-bar.tsx");
  const dock=read("src/components/layout/global-contact-notification.tsx");
  assert.match(layout,/<GlobalContactNotification\s*\/>/);
  assert.doesNotMatch(topBar,/<ContactCounter\s*\/>/);
  assert.match(dock,/<ContactCounter\s*\/>/);
  assert.match(dock,/fixed/);
  assert.match(dock,/top-/);
});
test("the notification opens the real owner inbox from any workspace deployment",()=>{
  const counter=read("src/components/layout/contact-counter.tsx");
  assert.match(counter,/relayAvailable\s*\?\s*"\/connect"/);
  assert.match(counter,/https:\/\/noema-contact-staging\.vercel\.app\/connect/);
  assert.match(counter,/unreadIncomingCount/);
});
