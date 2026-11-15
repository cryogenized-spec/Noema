import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateCropPlacement as crop } from "../src/lib/profile/crop-geometry.ts";

test("square avatar crop covers without blank corners", () => {
  const centered = crop(1600, 900, 512, 512, 1, {x:0,y:0});
  assert.equal(centered.imageHeight, 512);
  assert.ok(centered.imageWidth >= 512);
  assert.ok(centered.dx < 0);
  assert.equal(centered.dy,0);
  const left = crop(1600,900,512,512,1,{x:1,y:0});
  const right = crop(1600,900,512,512,1,{x:-1,y:0});
  assert.equal(left.dx,0);
  assert.equal(right.dx,512-right.imageWidth);
});
test("landscape banner crop from portrait photograph stays fully covered", () => {
  const p = crop(900,1600,1200,400,1.7,{x:0.5,y:-0.6});
  assert.ok(p.dx<=0 && p.dx+p.imageWidth>=1200);
  assert.ok(p.dy<=0 && p.dy+p.imageHeight>=400);
});
test("zoom, pan and invalid data have deterministic bounds", () => {
  const p = crop(1200,400,1200,400,2,{x:10,y:-10});
  assert.equal(p.dx,0);
  assert.equal(p.dy,400-p.imageHeight);
  assert.throws(()=>crop(0,400,1200,400,1,{x:0,y:0}));
});
