import { createHash } from "node:crypto";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";

const url =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";
const digest =
  "59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a";
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
await mkdir("public", { recursive: true });
let model;
try {
  model = await readFile("public/pose.task");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
if (!model || hash(model) !== digest) {
  const response = await fetch(url);
  if (!response.ok)
    throw new Error("Pose model download failed: " + response.status);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (hash(bytes) !== digest) throw new Error("Pose model checksum mismatch");
  await writeFile("public/pose.task", bytes);
}
await cp("node_modules/@mediapipe/tasks-vision/wasm", "public/wasm", {
  recursive: true,
});

await cp("node_modules/@ffmpeg/core/dist/umd", "public/codec", {
  recursive: true,
});
