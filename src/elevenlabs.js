/**
 * ElevenLabs Text-to-Speech (TTS) Integration with Smart Fallback
 */

export class ElevenLabsManager {
  constructor({ apiKey = '', voiceId = 'H9eYlNHpm1vah6PPgYAk' } = {}) {
    this.apiKey = apiKey || '';
    this.voiceId = voiceId || 'H9eYlNHpm1vah6PPgYAk';
    this.currentAudio = typeof Audio !== 'undefined' ? new Audio() : null;
    if (this.currentAudio) {
      this.currentAudio.playsInline = true;
      this.currentAudio.preload = 'auto';
    }
    this.audioUnlocked = false;
    this.available = null; // null = unchecked, true = usable, false = unusable
    this.isPlaying = false;
    this.serverConfigured = false;
    this.requestId = 0;
    this.abortController = null;
    this.currentResolve = null;
  }

  /**
   * Unlocks HTMLAudioElement on mobile browsers (iOS Safari / Android Chrome)
   * Must be called synchronously inside a user tap/click handler.
   */
  unlockAudio() {
    if (this.audioUnlocked || !this.currentAudio) return;
    try {
      // Tiny silent WAV data URI to prime the audio element on mobile user gesture
      this.currentAudio.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';
      const p = this.currentAudio.play();
      if (p && typeof p.then === 'function') {
        p.then(() => {
          this.currentAudio.pause();
          this.currentAudio.currentTime = 0;
          this.audioUnlocked = true;
        }).catch(() => {});
      }
    } catch (e) {
      // Ignored
    }
  }

  setCredentials(apiKey, voiceId) {
    if (apiKey !== undefined) this.apiKey = apiKey.trim();
    if (voiceId !== undefined && voiceId.trim()) this.voiceId = voiceId.trim();
    this.available = null;
  }

  isConfigured() {
    return Boolean((this.apiKey && this.apiKey.length > 10) || this.serverConfigured) && Boolean(this.voiceId);
  }

  /** Configured AND not known to be broken. Use this to choose ElevenLabs vs browser TTS. */
  isUsable() {
    return this.isConfigured() && this.available !== false;
  }

  /**
   * Startup probe (no characters consumed). Checks server /api/config first, or direct API if client key exists.
   */
  async checkAvailability() {
    try {
      const cfgRes = await fetch('/api/config');
      if (cfgRes.ok) {
        const cfg = await cfgRes.json();
        this.serverConfigured = Boolean(cfg.isConfigured);
        if (this.serverConfigured) {
          this.available = true;
          return true;
        }
      }
    } catch (e) {
      // Server not reachable, try client key if provided
    }

    if (!this.apiKey || this.apiKey.length <= 10) {
      this.available = false;
      return false;
    }

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4000);
      const res = await fetch('https://api.elevenlabs.io/v1/models', {
        headers: { 'xi-api-key': this.apiKey },
        signal: controller.signal
      });
      clearTimeout(timer);
      if (res.ok) {
        this.available = true;
      } else if (res.status === 401) {
        const body = await res.text();
        this.available = /missing_permissions/i.test(body);
      } else {
        this.available = res.status >= 500 ? false : res.status !== 403;
      }
    } catch (err) {
      this.available = true;
    }
    return this.available;
  }

  /**
   * Generates and plays audio from ElevenLabs API (via secure server proxy or direct client key).
   * Resolves ONLY when playback has finished (or was cancelled/failed) so callers never overlap speech.
   * @param {string} text - Text to synthesize
   * @param {object} callbacks - { onStart, onEnd, onError }
   * @returns {Promise<{ success: boolean, cancelled?: boolean, fallbackNeeded: boolean }>}
   */
  async speak(text, { onStart = () => {}, onEnd = () => {}, onError = () => {} } = {}) {
    this.stop();

    if (!this.isUsable()) {
      return { success: false, fallbackNeeded: true, reason: 'ElevenLabs ไม่พร้อมใช้งาน' };
    }

    const myReqId = ++this.requestId;
    const controller = new AbortController();
    this.abortController = controller;

    let audioBlob = null;
    let lastErrorDetails = '';
    const formattedText = (text || '').trim();
    const isThai = /[\u0E00-\u0E7F]/.test(formattedText);

    // 1. Try Direct ElevenLabs API only if user explicitly entered a client-side API key
    if (this.apiKey && this.apiKey.length > 10) {
      try {
        const url = `https://api.elevenlabs.io/v1/text-to-speech/${this.voiceId}`;
        const payload = {
          text: formattedText,
          model_id: 'eleven_v3',
          ...(isThai ? { language_code: 'th' } : {}),
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.8,
            style: 0.0,
            use_speaker_boost: true
          }
        };

        let response = await fetch(url, {
          method: 'POST',
          headers: {
            'Accept': 'audio/mpeg',
            'Content-Type': 'application/json',
            'xi-api-key': this.apiKey
          },
          body: JSON.stringify(payload),
          signal: controller.signal
        });

        if (myReqId !== this.requestId) {
          return { success: true, cancelled: true, fallbackNeeded: false };
        }

        if (!response.ok && response.status === 400) {
          delete payload.language_code;
          response = await fetch(url, {
            method: 'POST',
            headers: {
              'Accept': 'audio/mpeg',
              'Content-Type': 'application/json',
              'xi-api-key': this.apiKey
            },
            body: JSON.stringify(payload),
            signal: controller.signal
          });
        }

        if (myReqId !== this.requestId) {
          return { success: true, cancelled: true, fallbackNeeded: false };
        }

        if (response.ok) {
          audioBlob = await response.blob();
        } else {
          const errBody = await response.text();
          lastErrorDetails = `Direct API Status ${response.status}: ${errBody}`;
        }
      } catch (err) {
        if (err.name === 'AbortError' || myReqId !== this.requestId) {
          return { success: true, cancelled: true, fallbackNeeded: false };
        }
      }
    }

    // 2. Use Server Proxy (/api/tts) which securely uses process.env.ELEVENLABS_API_KEY
    if (!audioBlob && myReqId === this.requestId) {
      try {
        const proxyRes = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: formattedText,
            voiceId: this.voiceId,
            apiKey: this.apiKey || undefined
          }),
          signal: controller.signal
        });

        if (myReqId !== this.requestId) {
          return { success: true, cancelled: true, fallbackNeeded: false };
        }

        if (proxyRes.ok) {
          audioBlob = await proxyRes.blob();
        } else {
          const proxyErr = await proxyRes.text();
          lastErrorDetails = `Proxy Status ${proxyRes.status}: ${proxyErr}`;
        }
      } catch (proxyErr) {
        if (proxyErr.name === 'AbortError' || myReqId !== this.requestId) {
          return { success: true, cancelled: true, fallbackNeeded: false };
        }
        lastErrorDetails = `Connection failed: ${proxyErr.message}`;
      }
    }

    if (myReqId !== this.requestId) {
      return { success: true, cancelled: true, fallbackNeeded: false };
    }

    if (!audioBlob) {
      return { success: false, fallbackNeeded: true, error: lastErrorDetails, reason: lastErrorDetails || 'ElevenLabs synthesis failed' };
    }

    return new Promise((resolve) => {
      if (myReqId !== this.requestId) {
        resolve({ success: true, cancelled: true, fallbackNeeded: false });
        return;
      }

      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = this.currentAudio || new Audio();
      this.currentAudio = audio;

      let settled = false;
      const finish = (result) => {
        if (settled) return;
        settled = true;
        if (this.currentResolve === finish) this.currentResolve = null;
        this.isPlaying = false;
        URL.revokeObjectURL(audioUrl);
        resolve(result);
      };
      this.currentResolve = finish;

      audio.onplay = () => {
        if (myReqId !== this.requestId) {
          audio.pause();
          finish({ success: true, cancelled: true, fallbackNeeded: false });
          return;
        }
        this.isPlaying = true;
        this.audioUnlocked = true;
        onStart();
      };

      audio.onended = () => {
        onEnd();
        finish({ success: true, fallbackNeeded: false });
      };

      audio.onerror = (e) => {
        onError(e);
        finish({ success: false, fallbackNeeded: true, reason: 'Audio decode error' });
      };

      audio.src = audioUrl;
      audio.load();
      audio.play().catch((err) => {
        if (myReqId !== this.requestId || err.name === 'AbortError') {
          finish({ success: true, cancelled: true, fallbackNeeded: false });
        } else {
          finish({ success: false, fallbackNeeded: true, reason: err.message });
        }
      });
    });
  }

  stop() {
    this.requestId++;
    if (this.abortController) {
      try {
        this.abortController.abort();
      } catch (e) {
        // Ignored
      }
      this.abortController = null;
    }
    if (this.currentAudio) {
      try {
        this.currentAudio.onplay = null;
        this.currentAudio.onended = null;
        this.currentAudio.onerror = null;
        this.currentAudio.pause();
      } catch (e) {
        // Ignored
      }
    }
    if (this.currentResolve) {
      const fn = this.currentResolve;
      this.currentResolve = null;
      fn({ success: true, cancelled: true, fallbackNeeded: false });
    }
    this.isPlaying = false;
  }
}
