export function captureFrames(video, interval) {
  const canvas = document.createElement("canvas");
  const scale = Math.min(
    1,
    640 / Math.max(video.videoWidth, video.videoHeight),
  );
  canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
  canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
  const ctx = canvas.getContext("2d");
  const frames = [];
  const start = performance.now();
  function capture() {
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    frames.push({
      time: (performance.now() - start) / 1000,
      image: canvas.toDataURL("image/jpeg", 0.75),
    });
  }
  capture();
  const timer = setInterval(capture, interval * 1000);
  return () => {
    clearInterval(timer);
    return { frames, width: canvas.width, height: canvas.height };
  };
}

// Locate the frame at or immediately before the playhead, even when capture
// intervals vary because the browser was busy.
export function frameAt(frames, time) {
  let low = 0,
    high = frames.length - 1;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (frames[mid].time <= time) low = mid;
    else high = mid - 1;
  }
  return low;
}

export function framePlayer(frames, image, slider, toggle, onSeek) {
  const duration = frames.at(-1).time;
  let playhead = 0,
    rate = 1,
    animation = 0,
    previousIndex = -1;
  let lastTick = 0;
  slider.max = String(duration);
  function seek(time) {
    playhead = Math.min(duration, Math.max(0, time));
    slider.value = String(playhead);
    const index = frameAt(frames, playhead);
    if (index !== previousIndex) image.src = frames[index].image;
    previousIndex = index;
    onSeek();
  }
  function pause() {
    cancelAnimationFrame(animation);
    animation = 0;
    toggle.textContent = "Play";
  }
  function tick(now) {
    seek(playhead + (rate * (now - lastTick)) / 1000);
    lastTick = now;
    if (playhead >= duration) pause();
    else animation = requestAnimationFrame(tick);
  }
  function play() {
    if (animation) return;
    if (playhead >= duration) seek(0);
    lastTick = performance.now();
    toggle.textContent = "Pause";
    animation = requestAnimationFrame(tick);
  }
  toggle.onclick = () => (animation ? pause() : play());
  slider.oninput = () => seek(Number(slider.value));
  seek(0);
  return {
    get time() {
      return playhead;
    },
    setRate(value) {
      rate = value;
    },
    seek,
    play,
    dispose() {
      pause();
      image.removeAttribute("src");
      slider.oninput = toggle.onclick = null;
    },
  };
}
