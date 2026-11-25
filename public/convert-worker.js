importScripts("/codec/ffmpeg-core.js");

self.onmessage = async ({ data: { clip, framesPerSecond } }) => {
  try {
    const response = await fetch("/codec/ffmpeg-core.wasm");
    if (!response.ok) throw new Error("Video converter assets unavailable");
    const core = await createFFmpegCore({
      wasmBinary: await response.arrayBuffer(),
    });
    core.FS.writeFile("input", new Uint8Array(await clip.arrayBuffer()));
    if (framesPerSecond) {
      const code = core.exec(
        "-i",
        "input",
        "-map",
        "0:V:0",
        "-an",
        "-vf",
        "fps=" + framesPerSecond + ":start_time=0,scale=w='min(640,iw)':h=-2",
        "-c:v",
        "mjpeg",
        "-threads",
        "1",
        "-q:v",
        "4",
        "frame-%08d.jpg",
      );
      if (code !== 0) throw new Error("Frame extraction failed");
      const names = core.FS.readdir(".")
        .filter((name) => /^frame-\d+\.jpg$/.test(name))
        .sort();
      if (!names.length) throw new Error("No readable video frames");
      const images = names.map((name) => {
        const image = new Blob([core.FS.readFile(name)], {
          type: "image/jpeg",
        });
        core.FS.unlink(name);
        return image;
      });
      self.postMessage({ images });
      return;
    }
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
