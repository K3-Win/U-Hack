/**
 * ElevenLabs Text-to-Speech (TTS) Integration with Reliable Mobile Completion & Caching
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
    this.available = null;
    this.isPlaying = false;
    this.serverConfigured = false;
    this.requestId = 0;
    this.abortController = null;
    this.currentResolve = null;
    this.playbackSafetyTimer = null;
    this.audioCache = new Map();
  }

  unlockAudio() {
    if (this.audioUnlocked || !this.currentAudio) return;
    try {
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

  isUsable() {
    return this.isConfigured() && this.available !== false;
  }

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
      // Server not reachable
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

  splitIntoChunks(text) {
    const cleaned = (text || '').replace(/\s+/g, ' ').trim();
    if (cleaned.length <= 85) return [cleaned];

    const rawParts = cleaned
      .split(/(?<=(?:ครับ|ค่ะ|นะคะ|นะครับ|เลยครับ|เลยค่ะ|[.!?]))\s+/)
      .map(s => s.trim())
      .filter(Boolean);

    if (rawParts.length <= 1) return [cleaned];

    const chunks = [];
    let current = '';
    for (const part of rawParts) {
      if (!current) {
        current = part;
      } else if ((current + ' ' + part).length <= 85) {
        current += ' ' + part;
      } else {
        chunks.push(current);
        current = part;
      }
    }
    if (current) chunks.push(current);
    return chunks;
  }

  async fetchChunkBlob(chunkText, signal, myReqId) {
    const cacheKey = `${this.voiceId}:${chunkText}`;
    if (this.audioCache.has(cacheKey)) {
      return { blob: this.audioCache.get(cacheKey) };
    }

    const isThai = /[\u0E00-\u0E7F]/.test(chunkText);
    let audioBlob = null;
    let lastErrorDetails = '';

    // 1. Direct ElevenLabs API call if client key is provided
    if (this.apiKey && this.apiKey.length > 10) {
      try {
        const url = `https://api.elevenlabs.io/v1/text-to-speech/${this.voiceId}?output_format=mp3_22050_32`;
        const payload = {
          text: chunkText,
          model_id: 'eleven_v3',
          ...(isThai ? { language_code: 'th' } : {}),
          voice_settings: { stability: 0.5, similarity_boost: 0.78, style: 0.0, use_speaker_boost: false }
        };

        let response = await fetch(url, {
          method: 'POST',
          headers: {
            'Accept': 'audio/mpeg',
            'Content-Type': 'application/json',
            'xi-api-key': this.apiKey
          },
          body: JSON.stringify(payload),
          signal
        });

        if (myReqId !== this.requestId) return { cancelled: true };

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
            signal
          });
        }

        if (myReqId !== this.requestId) return { cancelled: true };

        if (response.ok) {
          audioBlob = await response.blob();
        } else {
          lastErrorDetails = `Direct API Status ${response.status}`;
        }
      } catch (err) {
        if (err.name === 'AbortError' || myReqId !== this.requestId) {
          return { cancelled: true };
        }
      }
    }

    // 2. Server Proxy (/api/tts)
    if (!audioBlob && myReqId === this.requestId) {
      try {
        const proxyRes = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: chunkText,
            voiceId: this.voiceId,
            apiKey: this.apiKey || undefined
          }),
          signal
        });

        if (myReqId !== this.requestId) return { cancelled: true };

        if (proxyRes.ok) {
          audioBlob = await proxyRes.blob();
        } else {
          const proxyErr = await proxyRes.text();
          lastErrorDetails = `Proxy Status ${proxyRes.status}: ${proxyErr}`;
        }
      } catch (proxyErr) {
        if (proxyErr.name === 'AbortError' || myReqId !== this.requestId) {
          return { cancelled: true };
        }
        lastErrorDetails = proxyErr.message;
      }
    }

    if (audioBlob && chunkText.length <= 160) {
      if (this.audioCache.size >= 50) {
        const firstKey = this.audioCache.keys().next().value;
        this.audioCache.delete(firstKey);
      }
      this.audioCache.set(cacheKey, audioBlob);
    }

    return { blob: audioBlob, error: lastErrorDetails };
  }

  /**
   * Plays a single Blob on the shared HTMLAudioElement and guarantees resolution
   * even if mobile browser drops `onended`.
   */
  playBlob(audioBlob, chunkText, myReqId, onFirstStart) {
    return new Promise((resolve) => {
      if (myReqId !== this.requestId) {
        resolve({ success: true, cancelled: true });
        return;
      }

      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = this.currentAudio || new Audio();
      this.currentAudio = audio;

      let settled = false;
      const finish = (result) => {
        if (settled) return;
        settled = true;
        clearTimeout(this.playbackSafetyTimer);
        this.playbackSafetyTimer = null;
        if (this.currentResolve === finish) this.currentResolve = null;
        this.isPlaying = false;
        audio.onloadedmetadata = null;
        audio.ontimeupdate = null;
        audio.onplay = null;
        audio.onended = null;
        audio.onerror = null;
        URL.revokeObjectURL(audioUrl);
        resolve(result);
      };
      this.currentResolve = finish;

      // Fallback safety timeout based on text length so playback NEVER hangs forever on mobile
      const estimatedMaxMs = Math.max(4500, Math.min(12000, (chunkText || '').length * 150 + 2500));
      this.playbackSafetyTimer = setTimeout(() => {
        finish({ success: true });
      }, estimatedMaxMs);

      audio.onloadedmetadata = () => {
        if (Number.isFinite(audio.duration) && audio.duration > 0) {
          clearTimeout(this.playbackSafetyTimer);
          this.playbackSafetyTimer = setTimeout(() => {
            finish({ success: true });
          }, Math.ceil(audio.duration * 1000) + 500);
        }
      };

      audio.ontimeupdate = () => {
        if (Number.isFinite(audio.duration) && audio.duration > 0 && audio.currentTime >= audio.duration - 0.08) {
          finish({ success: true });
        }
      };

      audio.onplay = () => {
        if (myReqId !== this.requestId) {
          audio.pause();
          finish({ success: true, cancelled: true });
          return;
        }
        this.isPlaying = true;
        this.audioUnlocked = true;
        if (onFirstStart) onFirstStart();
      };

      audio.onended = () => {
        finish({ success: true });
      };

      audio.onerror = () => {
        finish({ success: false, reason: 'Audio decode error' });
      };

      audio.src = audioUrl;
      audio.play().catch((err) => {
        if (myReqId !== this.requestId || err.name === 'AbortError') {
          finish({ success: true, cancelled: true });
        } else {
          finish({ success: false, reason: err.message });
        }
      });
    });
  }

  async speak(text, { onStart = () => {}, onEnd = () => {}, onError = () => {} } = {}) {
    this.stop();

    if (!this.isUsable()) {
      return { success: false, fallbackNeeded: true, reason: 'ElevenLabs ไม่พร้อมใช้งาน' };
    }

    const formattedText = (text || '').trim();
    if (!formattedText) return { success: true, fallbackNeeded: false };

    const myReqId = ++this.requestId;
    const controller = new AbortController();
    this.abortController = controller;

    const chunks = this.splitIntoChunks(formattedText);
    const chunkPromises = chunks.map(chunk => this.fetchChunkBlob(chunk, controller.signal, myReqId));

    let started = false;
    for (let i = 0; i < chunkPromises.length; i++) {
      const fetched = await chunkPromises[i];
      if (myReqId !== this.requestId || fetched.cancelled) {
        return { success: true, cancelled: true, fallbackNeeded: false };
      }
      if (!fetched.blob) {
        onError(fetched.error);
        return { success: false, fallbackNeeded: !started, error: fetched.error, reason: fetched.error || 'ElevenLabs synthesis failed' };
      }

      const playRes = await this.playBlob(fetched.blob, chunks[i], myReqId, () => {
        if (!started) {
          started = true;
          onStart();
        }
      });

      if (myReqId !== this.requestId || playRes.cancelled) {
        return { success: true, cancelled: true, fallbackNeeded: false };
      }
      if (!playRes.success) {
        onError(playRes.reason);
        return { success: false, fallbackNeeded: !started, reason: playRes.reason };
      }
    }

    onEnd();
    return { success: true, fallbackNeeded: false };
  }

  stop() {
    this.requestId++;
    clearTimeout(this.playbackSafetyTimer);
    this.playbackSafetyTimer = null;
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
        this.currentAudio.onloadedmetadata = null;
        this.currentAudio.ontimeupdate = null;
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
