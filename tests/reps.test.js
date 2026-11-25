import test from "node:test";
import assert from "node:assert/strict";
import { countReps, measureLeg } from "../src/reps.js";
const trace = (angles) =>
  angles.map((angle, i) => ({
    time: i / 4,
    leg: angle === null ? null : { angle },
  }));
test("counts complete cycles and timestamps the deepest sample", () => {
  assert.deepEqual(
    countReps(trace([170, 140, 105, 95, 120, 165, 140, 95, 170])),
    [
      { start: 0, bottom: 0.75, end: 1.25 },
      { start: 1.25, bottom: 1.75, end: 2 },
    ],
  );
});
test("partial cycles and occlusion never complete a rep across the gap", () => {
  assert.deepEqual(
    countReps(trace([100, 165, 150, 165, 130, 90, null, 100, 165, 130, 100])),
    [],
  );
});
test("angle uses pixel aspect ratio and rejects weak landmarks", () => {
  const lm = [];
  for (const [i, x, y] of [
    [23, 0.25, 0],
    [25, 0.5, 0.5],
    [27, 0.75, 0],
  ])
    lm[i] = { x, y, visibility: 1 };
  assert.ok(Math.abs(measureLeg(lm, 200, 100).leg.angle - 90) < 1e-6);
  lm[25].visibility = 0.2;
  assert.equal(measureLeg(lm, 200, 100).reason, "Low landmark visibility");
});

test("brief dropouts preserve observed phases without inventing the bottom", () => {
  const gaps = (angles) => trace(angles).map((s, i) => ({ ...s, time: i / 8 }));
  assert.equal(
    countReps(gaps([158, 132, null, 112, null, 140, 158])).length,
    1,
  );
  assert.equal(countReps(gaps([158, 132, null, 135, 158])).length, 0);
  assert.equal(countReps(gaps([158, 112, null, null, null, 158])).length, 0);
});
test("accepts a visible leg when the higher confidence leg is clipped", () => {
  const lm = [];
  for (const [i, x, y] of [
    [23, 1.1, 0],
    [25, 0.8, 0.5],
    [27, 0.9, 1],
    [24, 0.3, 0],
    [26, 0.4, 0.5],
    [28, 0.5, 1],
  ]) {
    lm[i] = { x, y, visibility: i % 2 ? 1 : 0.8 };
  }
  assert.ok(measureLeg(lm, 200, 100).leg);
  assert.equal(measureLeg([], 200, 100).reason, "No pose detected");
});
