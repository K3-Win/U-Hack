/**
 * Camera & Frame Capture Manager for U-Vision (Ubot)
 */

export class CameraManager {
  constructor(videoElement, canvasElement) {
    this.video = videoElement;
    this.canvas = canvasElement;
    this.stream = null;
    this.currentFacingMode = 'environment'; // Default to world-facing (POV)
    this.customImage = null; // Stores uploaded image if used instead of live cam
    this.isUsingCustomImage = false;
  }

  async initCamera(facingMode = 'environment') {
    this.currentFacingMode = facingMode;
    this.isUsingCustomImage = false;
    this.customImage = null;

    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return { success: false, error: 'เบราว์เซอร์ไม่รองรับการเข้าถึงกล้อง (WebRTC)' };
    }

    let stream = null;

    // 1. Try with preferred facingMode constraints
    try {
      const constraints = {
        video: {
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          facingMode: { ideal: this.currentFacingMode }
        },
        audio: false
      };
      stream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      console.warn('Preferred camera constraints failed, attempting basic video constraints:', err);
      // 2. Fallback: simple video constraint (essential for Windows PC/Laptop webcams where environment fails)
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      } catch (fallbackErr) {
        console.error('All camera initialization attempts failed:', fallbackErr);
        return {
          success: false,
          error: fallbackErr.name === 'NotAllowedError' 
            ? 'กล้องถูกบล็อก โปรดคลิกไอคอนแม่กุญแจ 🔒 ที่แถบ URL ของ Edge เพื่ออนุญาตให้ใช้กล้อง' 
            : (fallbackErr.name === 'NotReadableError'
              ? 'กล้องกำลังถูกโปรแกรมอื่นใช้งานอยู่ (เช่น Zoom/Teams) หรือถูกปิดใน Windows Privacy'
              : 'ไม่สามารถเปิดกล้องได้ กำลังสลับไปใช้รูปภาพจำลองแทน')
        };
      }
    }

    try {
      this.stream = stream;
      this.video.srcObject = stream;
      await this.video.play().catch(e => console.warn('Video play warning:', e));
      return { success: true };
    } catch (playErr) {
      console.warn('Video element play error:', playErr);
      return { success: false, error: playErr.message };
    }
  }

  async flipCamera() {
    const nextMode = this.currentFacingMode === 'environment' ? 'user' : 'environment';
    return await this.initCamera(nextMode);
  }

  setCustomImage(imageSrc) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        this.customImage = img;
        this.isUsingCustomImage = true;
        resolve({ width: img.naturalWidth, height: img.naturalHeight });
      };
      img.onerror = reject;
      img.src = imageSrc;
    });
  }

  /**
   * Captures the current frame. Defaults to maxDimension = 1280 and JPEG quality 0.80
   * so mobile 4K cameras stay well under Vercel Serverless 4.5MB request limits and upload fast.
   */
  captureFrame(maxDimension = 1280) {
    const ctx = this.canvas.getContext('2d');
    let sourceWidth, sourceHeight;

    if (this.isUsingCustomImage && this.customImage) {
      sourceWidth = this.customImage.naturalWidth || 800;
      sourceHeight = this.customImage.naturalHeight || 600;
    } else {
      sourceWidth = this.video.videoWidth || 640;
      sourceHeight = this.video.videoHeight || 480;
    }

    let targetWidth = sourceWidth;
    let targetHeight = sourceHeight;

    const maxDim = maxDimension > 0 ? maxDimension : 1280;
    if (targetWidth > maxDim || targetHeight > maxDim) {
      if (targetWidth > targetHeight) {
        targetHeight = Math.round((targetHeight * maxDim) / targetWidth);
        targetWidth = maxDim;
      } else {
        targetWidth = Math.round((targetWidth * maxDim) / targetHeight);
        targetHeight = maxDim;
      }
    }

    this.canvas.width = targetWidth;
    this.canvas.height = targetHeight;

    if (this.isUsingCustomImage && this.customImage) {
      ctx.drawImage(this.customImage, 0, 0, targetWidth, targetHeight);
    } else {
      ctx.drawImage(this.video, 0, 0, targetWidth, targetHeight);
    }

    // In-memory JPEG, quality 0.82 (~150-250KB, fast over 4G/5G/WiFi and safe for Vercel Serverless)
    const dataUrl = this.canvas.toDataURL('image/jpeg', 0.82);
    const base64Data = dataUrl.split(',')[1];

    return {
      dataUrl,
      base64Data,
      mimeType: 'image/jpeg',
      width: targetWidth,
      height: targetHeight
    };
  }

  stop() {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
  }
}
