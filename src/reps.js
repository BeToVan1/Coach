// MediaPipe normalized coordinates have different scales on each axis.
export function visibleLeg(landmarks, width, height) {
  if (!landmarks?.length) return null;
  const sides = [
    [23, 25, 27],
    [24, 26, 28],
  ].map((ids) => ids.map((i) => landmarks[i]));
  const score = (leg) => Math.min(...leg.map((p) => p?.visibility ?? 0));
  const leg = sides.sort((a, b) => score(b) - score(a))[0];
  if (
    score(leg) < 0.65 ||
    leg.some((p) => p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1)
  )
    return null;
  const [hip, knee, ankle] = leg;
  const vector = (p) => [(p.x - knee.x) * width, (p.y - knee.y) * height];
  const [a, b] = [vector(hip), vector(ankle)];
  const length = Math.hypot(...a) * Math.hypot(...b);
  if (length < 1) return null;
  const cosine = (a[0] * b[0] + a[1] * b[1]) / length;
  return {
    points: leg.map((p) => [p.x, p.y]),
    angle: (Math.acos(Math.max(-1, Math.min(1, cosine))) * 180) / Math.PI,
  };
}

export function countReps(samples) {
  const reps = [];
  let phase = "unknown",
    start = 0,
    bottom = 0,
    lowest = Infinity;
  for (const { time, leg } of samples) {
    if (!leg) {
      phase = "unknown";
      continue;
    }
    const angle = leg.angle;
    if (angle >= 158) {
      if (phase === "bottom" && time - start >= 0.45)
        reps.push({ start, bottom, end: time });
      phase = "standing";
      start = time;
      lowest = Infinity;
    } else if (phase !== "unknown") {
      if (phase === "standing") phase = "descending";
      if (angle <= 112) phase = "bottom";
      if (angle < lowest) {
        lowest = angle;
        bottom = time;
      }
    }
  }
  return reps;
}
