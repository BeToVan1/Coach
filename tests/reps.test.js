import test from "node:test";
import assert from "node:assert/strict";
import { countReps, visibleLeg } from "../src/reps.js";
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
  assert.ok(Math.abs(visibleLeg(lm, 200, 100).angle - 90) < 1e-6);
  lm[25].visibility = 0.2;
  assert.equal(visibleLeg(lm, 200, 100), null);
});
