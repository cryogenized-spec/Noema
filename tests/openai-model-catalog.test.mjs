import { test } from "node:test";
import assert from "node:assert/strict";
import { PROVIDER_CATALOG } from "../src/lib/providers/catalog.ts";

test("NOEMA OpenAI selector includes the documented flagship and low-cost GPT-6 tiers", () => {
  const openai = PROVIDER_CATALOG.find((provider) => provider.id === "openai");
  assert.ok(openai, "OpenAI provider should exist");
  const modelIds = openai.models.map((model) => model.modelId);
  assert.equal(new Set(modelIds).size, modelIds.length, "duplicate model IDs");
  for (const modelId of ["gpt-6-astra", "gpt-6.1-sol", "gpt-6.1-terra", "gpt-6-luna",
    "gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna", "gpt-5.4"]) {
    assert.ok(modelIds.includes(modelId), modelId + " missing");
  }
  for (const model of openai.models) {
    assert.ok(model.modelId.startsWith("gpt-"), "Only chat-capable GPT IDs belong in this selector");
    assert.match(model.modelDocsUrl ?? "", /^https:\/\/developers\.openai\.com\/api\/docs\/models\//);
    assert.ok(model.inputPricePer1M === null || model.inputPricePer1M >= 0);
    assert.ok(model.outputPricePer1M === null || model.outputPricePer1M >= 0);
    assert.ok(model.lifecycle, model.modelId + " requires a lifecycle label");
  }
});

test("documented OpenAI GPT-6 standard token reference prices are not accidentally regressed", () => {
  const openai = PROVIDER_CATALOG.find((provider) => provider.id === "openai");
  assert.ok(openai);
  const expected = [
    ["gpt-6-luna", 0.1, 0.5],
    ["gpt-6.1-terra", 1, 5],
    ["gpt-6.1-sol", 2, 10],
    ["gpt-6-astra", 10, 50],
  ];
  for (const [id, input, output] of expected) {
    const model = openai.models.find((m) => m.modelId === id);
    assert.equal(model?.inputPricePer1M, input);
    assert.equal(model?.outputPricePer1M, output);
    assert.equal(model?.lifecycle, "current");
  }
});
