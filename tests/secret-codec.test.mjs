import { test } from "node:test";
import assert from "node:assert/strict";
import { secretCodec, unlockVault, lockVault } from "../src/lib/security/secret-codec.ts";
test("lockbox stores randomized AES-GCM ciphertext and fails closed", async () => {
  const cache = new Map();
  globalThis.window = { localStorage: { getItem: (k) => cache.get(k) ?? null, setItem: (k,v) => cache.set(k,v) }, navigator: { locks: { request: async (_name, _opts, cb) => cb() } } };
  await unlockVault("a long unique test passphrase");
  const a = await secretCodec.encode("secret");
  const b = await secretCodec.encode("secret");
  assert.notEqual(a,b);
  assert.equal(a.includes("secret"),false);
  assert.equal(await secretCodec.decode(a),"secret");
  lockVault();
  assert.throws(() => secretCodec.decode(a));
  await assert.rejects(() => unlockVault("the wrong passphrase"));
  await unlockVault("a long unique test passphrase");
  assert.equal(await secretCodec.decode(b),"secret");
  delete globalThis.window;
  lockVault();
});

test("explicit Lock invalidates an already queued unlock", async () => {
  const cache = new Map();
  let release;
  const blocked = new Promise((resolve) => {release = resolve;});
  globalThis.window = {
    localStorage: {getItem:(k)=>cache.get(k)??null,setItem:(k,v)=>cache.set(k,v)},
    navigator: {locks: {request:async (_name,_opts,callback)=>{
      await blocked;
      return callback();
    }}},
  };
  try {
    const stale = unlockVault("a long unique test passphrase");
    lockVault();
    release();
    await assert.rejects(stale,/cancelled/);
    assert.throws(()=>secretCodec.encode("secret"));
    assert.equal(cache.size,0);
  } finally { delete globalThis.window; lockVault(); }
});
