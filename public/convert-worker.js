importScripts("/codec/ffmpeg-core.js");

self.onmessage = async ({ data: clip }) => {
  try {
    const response = await fetch("/codec/ffmpeg-core.wasm");
    if (!response.ok) throw new Error("Video converter assets unavailable");
    const core = await createFFmpegCore({
      wasmBinary: await response.arrayBuffer(),
    });
    core.FS.writeFile("input", new Uint8Array(await clip.arrayBuffer()));
    const code = core.exec(
      "-i",
      "input",
      "-map",
      "0:V:0",
      "-an",
      "-vf",
      "scale=w='min(1280,iw)':h=-2",
      "-pix_fmt",
      "yuv420p",
      "-c:v",
      "libvpx",
      "-deadline",
      "realtime",
      "-cpu-used",
      "8",
      "-b:v",
      "2M",
      "review.webm",
    );
    if (code !== 0) throw new Error("Conversion failed");
    const bytes = core.FS.readFile("review.webm");
    self.postMessage({ bytes }, [bytes.buffer]);
  } catch (error) {
    self.postMessage({ error: error.message });
  }
};
