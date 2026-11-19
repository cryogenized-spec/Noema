import {test} from "node:test";
import assert from "node:assert/strict";
import {
  sameDeviceSession,newerSameDeviceSession,mayRenewRelayAuth,singleFlight,
} from "../src/lib/network/session-recovery.ts";

test("session renewal never uses another device's cached token",()=>{
  const old={deviceId:"owner-a",token:"previous"};
  const next={deviceId:"owner-a",token:"fresh"};
  const other={deviceId:"owner-b",token:"unrelated"};
  assert.deepEqual(sameDeviceSession(old,next),next);
  assert.deepEqual(sameDeviceSession(old,other),old);
  assert.equal(sameDeviceSession(undefined,next),undefined);
  assert.deepEqual(newerSameDeviceSession(old,next),next);
  assert.equal(newerSameDeviceSession(next,next),null);
  assert.equal(newerSameDeviceSession(old,other),null);
  assert.equal(newerSameDeviceSession(undefined,next),null);
});
test("auth retry is limited to a non-aborted, signed request with first 401",()=>{
  assert.equal(mayRenewRelayAuth(401,true,false,false),true);
  for(const scenario of [[200,true,false,false],[403,true,false,false],
    [401,false,false,false],[401,true,true,false],[401,true,false,true]])
    assert.equal(mayRenewRelayAuth(...scenario),false,JSON.stringify(scenario));
});
test("concurrent expired requests share a renewal and failures can retry later",async()=>{
  let attempts=0;
  const renew=singleFlight(async()=>{
    attempts++;
    await Promise.resolve();
    return {deviceId:"owner-a",token:"fresh-"+attempts};
  });
  const [a,b,c]=await Promise.all([renew(),renew(),renew()]);
  assert.equal(attempts,1);
  assert.strictEqual(a,b);
  assert.strictEqual(b,c);
  const next=await renew();
  assert.equal(next.token,"fresh-2");
  let failed=0;
  const another=singleFlight(async()=>{
    failed++;
    if(failed===1)throw Error("challenge unavailable");
    return "recovered";
  });
  await assert.rejects(Promise.all([another(),another()]),/challenge unavailable/);
  assert.equal(await another(),"recovered");
  assert.equal(failed,2);
});
test("owner relay fetch uses only signed-device token rotation and one retry",async()=>{
  const {readFileSync}=await import("node:fs");
  const src=readFileSync(new URL("../src/lib/network/relay-client.ts",import.meta.url),"utf8");
  assert.match(src,/sameDeviceSession\(options\.session,readCachedRelaySession\(\)\)/);
  assert.match(src,/newerSameDeviceSession\(session,readCachedRelaySession\(\)\)/);
  assert.match(src,/const renewSignedSessionOnce=singleFlight/);
  assert.match(src,/relayFetch<T>\(path,\{\.\.\.options,session:renewed\},true\)/);
});
