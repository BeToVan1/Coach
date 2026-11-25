import { captureFrames, frameAt, framePlayer } from "./webcam.js";
import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";
import { fixWebmDuration } from "@fix-webm-duration/fix";
import { countReps, visibleLeg } from "./reps.js";

const el = (id) => document.getElementById(id);
const video = el("video");
const canvas = el("overlay");
const status = (message) => {
  el("status").textContent = message;
};
const interval = 0.125;
let stream,
  recorder,
  clipUrl,
  modelPromise,
  samples = [],
  markers = [];
let generation = 0;
let replay;
let convertedUrl;
let session = new AbortController();

class ClipDecodeError extends Error {}

function convertClip(clip, signal) {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const worker = new Worker("/convert-worker.js");
    const cancel = () =>
      finish(null, new DOMException("Set replaced", "AbortError"));
    function finish(blob, error) {
      worker.terminate();
      signal.removeEventListener("abort", cancel);
      if (error) reject(error);
      else resolve(blob);
    }
    signal.addEventListener("abort", cancel, { once: true });
    worker.onerror = () =>
      finish(
        null,
        new Error(
          "Local video converter failed to start. Restart the app and retry.",
        ),
      );
    worker.onmessage = ({ data }) => {
      if (data.error)
        finish(
          null,
          new Error(
            "Could not convert the video. Try exporting the original as H.264 MP4.",
          ),
        );
      else finish(new Blob([data.bytes], { type: "video/webm" }));
    };
    worker.postMessage(clip);
  });
}

function reset() {
  generation++;
  video.onerror = null;
  replay?.dispose();
  replay = null;
  video.hidden = false;
  el("frame-controls").hidden = el("frame").hidden = true;
  session.abort();
  session = new AbortController();
  if (convertedUrl) URL.revokeObjectURL(convertedUrl);
  convertedUrl = null;
  stream?.getTracks().forEach((track) => track.stop());
  stream = null;
  video.pause();
  video.srcObject = null;
  video.removeAttribute("src");
  video.load();
  video.controls = false;
  if (clipUrl) URL.revokeObjectURL(clipUrl);
  clipUrl = null;
  samples = [];
  markers = [];
  el("review").hidden =
    el("save").hidden =
    el("record").hidden =
    el("stop").hidden =
      true;
  el("camera").hidden = false;
  el("open").disabled = false;
  el("speed").textContent = "Half speed";
  el("placeholder").hidden = false;
  video.playbackRate = 1;
  draw();
}

async function camera() {
  reset();
  const id = generation;
  status("Waiting for camera access…");
  try {
    const device = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
    if (id !== generation) {
      device.getTracks().forEach((t) => t.stop());
      return;
    }
    stream = device;
    video.srcObject = device;
    await video.play();
    el("placeholder").hidden = el("camera").hidden = true;
    el("record").hidden = false;
    status("Frame your whole body from the side, then start the set.");
  } catch (e) {
    if (id === generation) {
      reset();
      status("Camera unavailable. Open a video or retry. " + e.message);
    }
  }
}

function record() {
  try {
    const mimeType = ["video/webm;codecs=vp8", "video/webm"].find(
      (type) => MediaRecorder.isTypeSupported(type) && video.canPlayType(type),
    );
    recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const chunks = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    let finishCapture;
    const start = performance.now();
    recorder.onstop = async () => {
      const duration = performance.now() - start;
      const capture = finishCapture();
      try {
        let blob = new Blob(chunks, { type: recorder.mimeType });
        if (blob.type.includes("webm"))
          blob = await fixWebmDuration(blob, duration, { logger: false }).catch(
            () => blob,
          );
        await review(
          blob,
          blob.type.includes("mp4") ? "squat-set.mp4" : "squat-set.webm",
          capture,
        );
      } catch (e) {
        reset();
        status("Recording could not be opened. " + e.message);
      }
    };
    recorder.start();
    finishCapture = captureFrames(video, interval);
    el("open").disabled = true;
    el("record").hidden = true;
    el("stop").hidden = false;
    status("Recording set…");
  } catch (e) {
    status(
      "Recording unavailable. Try Chrome or Edge, or import a clip. " +
        e.message,
    );
  }
}

function waitForMedia(target, event, action) {
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    const finish = (error) => {
      clearTimeout(timer);
      controller.abort();
      if (error) reject(error);
      else resolve();
    };
    const timer = setTimeout(
      () => finish(new ClipDecodeError("Video timed out.")),
      15000,
    );
    target.addEventListener(event, () => finish(), {
      signal: controller.signal,
    });
    target.addEventListener(
      "error",
      () =>
        finish(new ClipDecodeError("The browser could not decode the video.")),
      { signal: controller.signal },
    );
    action();
  });
}

function getModel() {
  modelPromise ??= FilesetResolver.forVisionTasks("/wasm")
    .then((files) =>
      PoseLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: "/pose.task" },
        runningMode: "IMAGE",
        numPoses: 1,
      }),
    )
    .catch((error) => {
      modelPromise = null;
      throw error;
    });
  return modelPromise;
}

async function review(blob, name, capture) {
  reset();
  const id = generation;
  clipUrl = URL.createObjectURL(blob);
  const signal = session.signal;
  el("save").hidden = false;
  el("save").href = clipUrl;
  el("save").download = name;
  try {
    if (capture?.frames.length) {
      await reviewCamera(capture, id, clipUrl);
      return;
    }
    try {
      await analyze(clipUrl);
    } catch (error) {
      if (id !== generation || !(error instanceof ClipDecodeError)) throw error;
      status("Converting the clip on this device...");
      const compatible = await convertClip(blob, signal);
      if (id !== generation) return;
      convertedUrl = URL.createObjectURL(compatible);
      await analyze(convertedUrl);
    }
  } catch (error) {
    if (id !== generation) return;
    status("Could not finish analysis. " + error.message);
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      el("summary").textContent = "Use the playhead to mark reps manually.";
    }
  } finally {
    if (id === generation) el("mark").disabled = false;
  }

  async function analyze(source) {
    const reader = document.createElement("video");
    reader.muted = reader.playsInline = true;
    reader.preload = "auto";
    status("Opening clip…");
    try {
      await waitForMedia(video, "loadeddata", () => {
        video.src = source;
      });
      if (id !== generation) return;
      if (!video.videoWidth)
        throw new ClipDecodeError("No playable video track.");
      el("placeholder").hidden = true;
      video.controls = true;
      el("review").hidden = el("save").hidden = false;

      el("summary").textContent = "You can play the clip while analysis runs.";
      renderMarkers();
      el("mark").disabled = true;
      status("Loading pose model…");
      const model = await getModel();
      if (id !== generation) return;
      await waitForMedia(reader, "loadeddata", () => {
        reader.src = source;
      });
      if (!Number.isFinite(reader.duration))
        throw new ClipDecodeError("Clip has no finite duration.");
      const frames = [];
      for (let index = 0; index * interval < reader.duration; index++) {
        if (id !== generation) return;
        const time = index * interval;
        if (index)
          await waitForMedia(reader, "seeked", () => {
            reader.currentTime = time;
          });
        const result = model.detect(reader);
        frames.push({
          time,
          leg: visibleLeg(
            result.landmarks[0],
            reader.videoWidth,
            reader.videoHeight,
          ),
        });
        if (index % 8 === 0)
          status(
            "Analyzing set · " +
              Math.floor((100 * time) / reader.duration) +
              "%",
          );
      }
      if (id !== generation) return;
      finishAnalysis(frames);
    } finally {
      reader.removeAttribute("src");
      reader.load();
    }
  }
}

function finishAnalysis(frames) {
  samples = frames;
  markers = countReps(samples);
  const missed = samples.filter((sample) => !sample.leg).length;
  const tempos = markers
    .map((rep) => rep.bottom - rep.start)
    .sort((a, b) => a - b);
  const mid = Math.floor(tempos.length / 2);
  const median =
    tempos.length % 2 ? tempos[mid] : (tempos[mid - 1] + tempos[mid]) / 2;
  el("summary").textContent =
    markers.length +
    " complete reps." +
    (markers.length ? " Median descent " + median.toFixed(1) + " s." : "") +
    (missed
      ? " Leg unclear in " +
        Math.round((missed / frames.length) * 100) +
        "% of samples."
      : "");
  renderMarkers();
  draw();
  status("Set ready for replay.");
}

async function reviewCamera(capture, id, source) {
  el("review").hidden = false;
  el("placeholder").hidden = true;
  el("mark").disabled = true;
  el("summary").textContent = "Analyzing captured camera frames.";
  renderMarkers();
  function useFrames() {
    if (id !== generation || replay) return;
    video.hidden = true;
    video.pause();
    el("frame").hidden = el("frame-controls").hidden = false;
    canvas.width = capture.width;
    canvas.height = capture.height;
    replay = framePlayer(
      capture.frames,
      el("frame"),
      el("frame-seek"),
      el("frame-play"),
      draw,
    );
    replay.setRate(video.playbackRate);
    draw();
  }
  // Native playback and pose analysis are independent. A failed decoder can
  // switch to image replay even after the native player initially loaded.
  video.onerror = useFrames;
  video.controls = true;
  video.src = source;
  status("Analyzing captured camera frames...");
  const model = await getModel();
  const image = new Image();
  const frames = [];
  for (const frame of capture.frames) {
    if (id !== generation) return;
    image.src = frame.image;
    await image.decode();
    if (id !== generation) return;
    const result = model.detect(image);
    frames.push({
      time: frame.time,
      leg: visibleLeg(result.landmarks[0], capture.width, capture.height),
    });
  }
  finishAnalysis(frames);
  if (
    video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
    !Number.isFinite(video.duration)
  )
    useFrames();
}

function renderMarkers() {
  el("markers").replaceChildren(
    ...markers.map((rep, index) => {
      const button = document.createElement("button");
      button.textContent = "Rep " + (index + 1);
      button.title = rep.manual
        ? "Manual marker"
        : "Descent " + (rep.bottom - rep.start).toFixed(1) + " s";
      button.onclick = () => {
        if (replay) {
          replay.seek(rep.start);
          replay.play();
          return;
        }
        video.currentTime = rep.start;
        video.play().catch(() => {});
      };
      return button;
    }),
  );
}

function draw() {
  const ctx = canvas.getContext("2d");
  if (
    !replay &&
    video.videoWidth &&
    (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight)
  ) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
  }
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!samples.length || !el("pose").checked) return;
  const sample = samples[frameAt(samples, replay?.time ?? video.currentTime)];
  if (!sample?.leg) {
    ctx.fillStyle = "#fff";
    ctx.font = Math.max(16, canvas.height / 25) + "px sans-serif";
    ctx.fillText("Leg unclear", 15, canvas.height / 12);
    return;
  }
  ctx.beginPath();
  sample.leg.points.forEach(([x, y], i) => {
    if (i) ctx.lineTo(x * canvas.width, y * canvas.height);
    else ctx.moveTo(x * canvas.width, y * canvas.height);
  });
  ctx.strokeStyle = "#b2ff8f";
  ctx.lineWidth = Math.max(3, canvas.width / 180);
  ctx.stroke();
}

el("camera").onclick = camera;
el("record").onclick = record;
el("stop").onclick = () => {
  el("stop").hidden = true;
  recorder.stop();
};
el("open").onclick = () => el("file").click();
el("file").onchange = (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (file) review(file, file.name);
};
el("mark").onclick = () => {
  markers.push({ start: replay?.time ?? video.currentTime, manual: true });
  markers.sort((a, b) => a.start - b.start);
  renderMarkers();
};
el("speed").onclick = () => {
  video.playbackRate = video.playbackRate === 1 ? 0.5 : 1;
  replay?.setRate(video.playbackRate);
  el("speed").textContent =
    video.playbackRate === 1 ? "Half speed" : "Normal speed";
};
el("pose").onchange = draw;
video.addEventListener("seeked", draw);
video.addEventListener("timeupdate", draw);
if (video.requestVideoFrameCallback) {
  const frame = () => {
    draw();
    video.requestVideoFrameCallback(frame);
  };
  video.requestVideoFrameCallback(frame);
}
