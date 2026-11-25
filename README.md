# Coach

A laptop prototype for reviewing side-view squat sets. Record a webcam set or open a local video, select a numbered rep, and replay it at half speed with a hip–knee–ankle overlay. The webcam captures video only. Clips stay in the browser until you save them.

## Run locally

Use Node.js 22.12+ and Chrome or Edge. In the repository directory run:

```sh
npm ci
npm run dev
```

Open the localhost URL printed in the terminal. First launch downloads Google's versioned Pose Landmarker Lite model and verifies its SHA-256. The application serves inference assets from your computer. Use `npm test` for the counter tests and `npm run build` for the static production bundle.

## First workout

1. Frame your full body from the side. Start standing, record a set, then select **End set**. **Open video** also accepts clips supported by your browser.
2. Analysis samples eight frames per second. Keep the tab open until the recap appears. Click a rep to seek or mark a missed rep at the playhead.
3. Use **Half speed** and **Pose overlay** to inspect the movement. **Save clip** downloads the original video. Opening another clip or leaving the page clears the review and markers.

The counter uses the more visible leg, starts at a knee angle of at least 158 degrees, and looks for flexion to 112 degrees or less followed by a return to standing. These are initial detection thresholds for side-view squats. A rep takes at least 0.45 seconds from the last standing sample to the return. Each observed phase requires an in-frame hip, knee and ankle with visibility of at least 0.65. Up to 0.4 seconds between reliable measurements preserves the current phase. Longer gaps reset it. Descent timing is approximate to the sampling interval. Validate with manually labeled normal, slow and partly obscured sets before using these metrics for workout feedback.

For new webcam sets, Coach captures timestamped images alongside the video and analyzes those images directly. If playback fails, the replay controls use the captured images at about eight frames per second. Save Clip still exports the browser recording.

When an imported clip fails to decode or seek, Coach tries to convert it locally to a silent WebM replay using FFmpeg. Save Clip downloads the original file, including when conversion fails.

The first milestone covers recording and replay. Voice food logging and target-hardware benchmarks are future milestones.

Pose inference uses [MediaPipe Pose Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker).
