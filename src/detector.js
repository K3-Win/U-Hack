/**
 * Path A - continuous local detector (0 tokens, no network after model load).
 *
 * Each iteration: take latest frame from the shared <video> buffer (CameraHub),
 * downscale a COPY to 640px wide, run COCO-SSD (TF.js, WebGL), draw green boxes,
 * publish detections to the hub and emit local obstacle / interest events.
 * The Gemini API is never called from this loop.
 */

const TFJS_URL = 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js';
const COCO_URL = 'https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd@2.2.3/dist/coco-ssd.min.js';

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}

export class Detector {
  constructor({ hub, overlayCanvas, onScene, onFps, inputWidth = 640 }) {
    this.hub = hub;
    this.overlay = overlayCanvas;
    this.octx = overlayCanvas.getContext('2d');
    this.onScene = onScene || (() => {});
    this.onFps = onFps || (() => {});
    this.inputWidth = inputWidth;
    this.small = document.createElement('canvas');
    this.sctx = this.small.getContext('2d', { willReadFrequently: false });
    this.model = null;
    this.running = false;
    this.ready = false;
    this.frames = 0;
    this.fpsStamp = performance.now();
    this.motionCanvas = document.createElement('canvas');
    this.motionCanvas.width = 32;
    this.motionCanvas.height = 18;
    this.mctx = this.motionCanvas.getContext('2d', { willReadFrequently: true });
    this.prevLuma = null;
    this.motion = 0; // smoothed mean abs luma diff (0-255); ~>4 means camera is moving

    this.rawMinScore = 0.30;
    this.obstacleStreak = 0;

    // Small hand-held / tabletop items: never treated as walking obstacles
    this.nonObstacleLabels = new Set([
      'cell phone', 'book', 'remote', 'cup', 'bottle', 'wine glass',
      'fork', 'knife', 'spoon', 'bowl', 'mouse', 'keyboard', 'laptop',
      'toothbrush', 'scissors', 'tie', 'clock'
    ]);
  }

  async load() {
    try {
      if (!window.tf) await loadScript(TFJS_URL);
      if (!window.cocoSsd) await loadScript(COCO_URL);
      this.model = await window.cocoSsd.load({ base: 'lite_mobilenet_v2' });
      this.ready = true;
      return { success: true };
    } catch (err) {
      console.warn('Detector failed to load:', err);
      return { success: false, error: err.message };
    }
  }

  start() {
    if (this.running || !this.ready) return;
    this.running = true;
    this.loop();
  }

  stop() {
    this.running = false;
    this.clearOverlay();
  }

  clearOverlay() {
    this.octx.clearRect(0, 0, this.overlay.width, this.overlay.height);
  }

  async loop() {
    while (this.running) {
      const t0 = performance.now();
      try {
        if (!document.hidden && this.hub.isLive() && !this.hub.camera.isUsingCustomImage) {
          await this.step();
        } else {
          this.clearOverlay();
          this.hub.setDetections([]);
        }
      } catch (err) {
        console.warn('Detector step error:', err);
      }
      // Yield to the browser; target <=33ms per iteration when inference allows.
      const spent = performance.now() - t0;
      await new Promise(r => (spent < 33 ? setTimeout(r, 33 - spent) : requestAnimationFrame(r)));
    }
  }

  async step() {
    const video = this.hub.video;
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) return;

    // Downscaled COPY for inference; the native frame is untouched.
    const w = this.inputWidth;
    const h = Math.round((w * vh) / vw);
    if (this.small.width !== w || this.small.height !== h) {
      this.small.width = w;
      this.small.height = h;
    }
    this.sctx.drawImage(video, 0, 0, w, h);
    this.updateMotion(video);

    const preds = await this.model.detect(this.small, 20, this.rawMinScore);
    const scale = vw / w;
    const dets = preds.map(p => ({
      label: p.class,
      score: p.score,
      bbox: p.bbox.map(v => v * scale) // native-video pixels
    }));

    this.hub.setDetections(dets);
    this.draw(dets, vw, vh);
    this.analyze(dets, vw, vh);

    this.frames++;
    const now = performance.now();
    if (now - this.fpsStamp >= 1000) {
      this.onFps((this.frames * 1000) / (now - this.fpsStamp));
      this.frames = 0;
      this.fpsStamp = now;
    }
  }

  updateMotion(video) {
    this.mctx.drawImage(video, 0, 0, 32, 18);
    const px = this.mctx.getImageData(0, 0, 32, 18).data;
    const luma = new Uint8Array(32 * 18);
    for (let i = 0, j = 0; i < px.length; i += 4, j++) {
      luma[j] = (px[i] * 77 + px[i + 1] * 150 + px[i + 2] * 29) >> 8;
    }
    if (this.prevLuma) {
      let sum = 0;
      for (let k = 0; k < luma.length; k++) sum += Math.abs(luma[k] - this.prevLuma[k]);
      this.motion = this.motion * 0.8 + (sum / luma.length) * 0.2;
    }
    this.prevLuma = luma;
    this.hub.motion = this.motion;
  }

  draw(dets, vw, vh) {
    const rect = this.overlay.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const cw = Math.round(rect.width * dpr);
    const ch = Math.round(rect.height * dpr);
    if (this.overlay.width !== cw || this.overlay.height !== ch) {
      this.overlay.width = cw;
      this.overlay.height = ch;
    }
    const ctx = this.octx;
    ctx.clearRect(0, 0, cw, ch);

    // Map native-video coords -> displayed coords (video uses object-fit: cover)
    const s = Math.max(cw / vw, ch / vh);
    const offX = (cw - vw * s) / 2;
    const offY = (ch - vh * s) / 2;

    ctx.lineWidth = 2 * dpr;
    ctx.font = `${13 * dpr}px Inter, sans-serif`;
    ctx.textBaseline = 'top';
    for (const d of dets) {
      const [x, y, bw, bh] = d.bbox;
      const dx = x * s + offX;
      const dy = y * s + offY;
      const dw = bw * s;
      const dh = bh * s;
      ctx.strokeStyle = '#22ff66';
      ctx.strokeRect(dx, dy, dw, dh);
      const text = `${d.label} ${Math.round(d.score * 100)}%`;
      const tw = ctx.measureText(text).width + 8 * dpr;
      ctx.fillStyle = '#22ff66';
      ctx.fillRect(dx, Math.max(0, dy - 18 * dpr), tw, 18 * dpr);
      ctx.fillStyle = '#04210e';
      ctx.fillText(text, dx + 4 * dpr, Math.max(0, dy - 18 * dpr) + 3 * dpr);
    }
  }

  /**
   * Local detector monitors visual boxes and acts strictly as an Emergency Brake
   * for sudden movement or close-range impacts (< 0.5m) that occur between Gemini's 1-2s snapshots.
   */
  analyze(dets, vw, vh) {
    const frameArea = vw * vh;
    let emergency = null;
    const isHighMotion = (this.motion || 0) > 8;

    for (const d of dets) {
      if (this.nonObstacleLabels.has(d.label)) continue;

      const [x, y, bw, bh] = d.bbox;
      const bottom = (y + bh) / vh;
      const area = (bw * bh) / frameArea;
      const centerX = (x + bw / 2) / vw;
      const inWalkingCorridor = centerX >= 0.22 && centerX <= 0.78;

      // 1. Sudden movement intrusion (someone or something moves quickly in path between snapshots)
      const suddenMovementHazard = isHighMotion && inWalkingCorridor && area >= 0.14 && bottom >= 0.65;

      // 2. Immediate proximity hazard (object right in front of chest/feet < 0.5m)
      const proximityHazard = area >= 0.35 || (bottom >= 0.85 && area >= 0.20);

      if (suddenMovementHazard || proximityHazard) {
        if (!emergency || area > emergency.area) {
          emergency = {
            label: d.label,
            area,
            veryClose: proximityHazard,
            suddenMotion: suddenMovementHazard
          };
        }
      }
    }

    // Emergency brake streak (needs 2 consecutive frames to prevent light flicker)
    if (emergency) {
      this.obstacleStreak++;
      if (this.obstacleStreak >= 2) {
        this.onScene({ emergency });
        return;
      }
    } else {
      this.obstacleStreak = Math.max(0, this.obstacleStreak - 1);
    }

    this.onScene({ emergency: null });
  }
}
