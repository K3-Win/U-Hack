/**
 * CameraHub - single shared producer for both vision paths.
 *
 * The physical camera is opened EXACTLY ONCE (CameraManager -> one getUserMedia).
 * The browser's <video> element is the continuously-updated frame buffer, so the
 * browser itself plays the role of the "daemon read thread" (no stale buffer).
 *
 *  - Path A (detector.js) reads downscaled copies via getDetectionFrame()
 *  - Path B (Gemini / MCP) reads pristine native frames via getNativeSnapshot()
 *  - Latest detections are cached here so Path B can use them as context.
 *
 * No second getUserMedia / VideoCapture is ever created.
 */
export class CameraHub {
  constructor(cameraManager) {
    this.camera = cameraManager;
    this.detections = []; // [{ label, score, bbox:[x,y,w,h] in native-video px }]
    this.detectionsAt = 0;
    this.es = null;
  }

  get video() {
    return this.camera.video;
  }

  isLive() {
    return this.camera.isUsingCustomImage || (this.video.readyState >= 2 && this.video.videoWidth > 0);
  }

  /** Full native-resolution JPEG (no downscale, in memory only). */
  getNativeSnapshot() {
    return this.camera.captureFrame(0);
  }

  setDetections(list) {
    this.detections = list;
    this.detectionsAt = performance.now();
  }

  /** Formats detections with spatial position hints for Gemini reasoning. */
  getDetectionsSummary(maxAgeMs = 2500) {
    if (!this.detections.length || performance.now() - this.detectionsAt > maxAgeMs) return '';
    const vw = this.video?.videoWidth || 1920;
    const vh = this.video?.videoHeight || 1080;

    const items = this.detections.slice(0, 5).map(d => {
      let pos = '';
      if (d.bbox && d.bbox.length === 4) {
        const [x, y, bw, bh] = d.bbox;
        const cx = (x + bw / 2) / vw;
        const bottom = (y + bh) / vh;
        const hPos = cx < 0.35 ? 'ทางซ้าย' : cx > 0.65 ? 'ทางขวา' : 'ตรงกลาง';
        const vPos = bottom > 0.78 ? 'ระยะใกล้' : bottom > 0.48 ? 'ระยะกลาง' : 'ระยะไกล';
        pos = ` (${hPos}, ${vPos})`;
      }
      return `${d.label}${pos}`;
    });
    return `เซนเซอร์ตรวจพบ: [${items.join(', ')}]`;
  }

  /**
   * Bridge for the MCP tool (server.js /mcp). Server pushes 'capture' events over SSE;
   * we answer with ONE native-res frame + detections. Purely on-demand, never polled.
   */
  connectMcpBridge() {
    if (this.es || typeof EventSource === 'undefined') return;
    this.es = new EventSource('/api/hub/events');
    this.es.addEventListener('capture', async (ev) => {
      let id;
      try {
        id = JSON.parse(ev.data).id;
        if (!this.isLive()) throw new Error('Camera not live');
        const frame = this.getNativeSnapshot();
        await fetch('/api/hub/frame', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id,
            imageBase64: frame.base64Data,
            mimeType: frame.mimeType,
            width: frame.width,
            height: frame.height,
            detections: this.getDetectionsSummary(5000)
          })
        });
      } catch (err) {
        if (id) {
          fetch('/api/hub/frame', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, error: err.message })
          }).catch(() => {});
        }
      }
    });
  }
}
