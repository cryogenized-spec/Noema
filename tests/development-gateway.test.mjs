import { test } from "node:test";
import assert from "node:assert/strict";
import { isLocalDevelopmentGatewayRequest } from "../src/lib/security/development-gateway.ts";
test("development gateway cannot run from a public hostname", () => {
  const previousMode = process.env.NODE_ENV;
  const previousFlag = process.env.NOEMA_ENABLE_BYOK_AGENT_PROXY;
  try {
    process.env.NODE_ENV = "development";
    process.env.NOEMA_ENABLE_BYOK_AGENT_PROXY = "true";
    const make = (url, origin) => new Request(url, {
      headers: origin ? { Origin: origin } : {},
    });
    assert.equal(isLocalDevelopmentGatewayRequest(make("https://noema.app/api/agent","https://noema.app")), false);
    assert.equal(isLocalDevelopmentGatewayRequest(make("http://localhost:3000/api/agent",null)), false);
    assert.equal(isLocalDevelopmentGatewayRequest(make("http://localhost:3000/api/agent","http://evil.local")), false);
    assert.equal(isLocalDevelopmentGatewayRequest(make("http://localhost:3000/api/agent","http://localhost:3000")), true);
    process.env.NODE_ENV = "production";
    assert.equal(isLocalDevelopmentGatewayRequest(make("http://localhost:3000/api/agent","http://localhost:3000")), false);
  } finally {
    if (previousMode === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousMode;
    if (previousFlag === undefined) delete process.env.NOEMA_ENABLE_BYOK_AGENT_PROXY;
    else process.env.NOEMA_ENABLE_BYOK_AGENT_PROXY = previousFlag;
  }
});
