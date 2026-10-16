/**
 * ElevenLabs Text-to-Speech (TTS) Integration with Smart Fallback
 */

export class ElevenLabsManager {
  constructor({ apiKey = '', voiceId = 'H9eYlNHpm1vah6PPgYAk' } = {}) {
    this.apiKey = apiKey || '';
    this.voiceId = voiceId || 'H9eYlNHpm1vah6PPgYAk';
    this.currentAudio = null;
    this.available = null; // null = unchecked, true = usable, false = unusable
    this.isPlaying = false;
    this.serverConfigured = false;
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
   * Generates and plays audio from ElevenLabs API (via secure server proxy or direct client key)
   * @param {string} text - Text to synthesize
   * @param {object} callbacks - { onStart, onEnd, onError }
   * @returns {Promise<{ success: boolean, fallbackNeeded: boolean }>}
   */
  async speak(text, { onStart = () => {}, onEnd = () => {}, onError = () => {} } = {}) {
    this.stop();

    if (!this.isUsable()) {
      return { success: false, fallbackNeeded: true, reason: 'ElevenLabs ไม่พร้อมใช้งาน' };
    }

    let audioBlob = null;
    let lastErrorDetails = '';
    const formattedText = (text || '').trim();
    const isThai = /[\u0E00-\u0E7F]/.test(formattedText);

    // 1. Try Direct ElevenLabs API only if user explicitly entered a client-side API key
    if (this.apiKey && this.apiKey.length > 10) {
      try {
        const url = `https://api.elevenlabs.io/v1/text-to-speech/${this.voiceId}`;
        // eleven_v3 is the ONLY ElevenLabs model that natively supports Thai (language_code: 'th')
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

        console.log(`📡 [ElevenLabs Direct] POST /v1/text-to-speech/${this.voiceId} [model: ${payload.model_id}, lang: ${payload.language_code || 'auto'}] (${formattedText.length} chars)`);
        let response = await fetch(url, {
          method: 'POST',
          headers: {
            'Accept': 'audio/mpeg',
            'Content-Type': 'application/json',
            'xi-api-key': this.apiKey
          },
          body: JSON.stringify(payload)
        });

        // Fallback if eleven_v3 fails for any reason
        if (!response.ok && response.status === 400) {
          delete payload.language_code;
          response = await fetch(url, {
            method: 'POST',
            headers: {
              'Accept': 'audio/mpeg',
              'Content-Type': 'application/json',
              'xi-api-key': this.apiKey
            },
            body: JSON.stringify(payload)
          });
        }

        lastErrorDetails = '';

        if (response.ok) {
          audioBlob = await response.blob();
          console.log('✅ [ElevenLabs Direct] Audio received! (Native Thai eleven_v3)');
        } else {
          const errBody = await response.text();
          lastErrorDetails = `Direct API Status ${response.status}: ${errBody}`;
          console.warn('❌ [ElevenLabs Direct] API returned status:', response.status, errBody);
        }
      } catch (err) {
        console.warn('⚠️ [ElevenLabs Direct] CORS or network blocked, trying server proxy:', err.message);
      }
    }

    // 2. Use Server Proxy (/api/tts) which securely uses process.env.ELEVENLABS_API_KEY
    if (!audioBlob) {
      try {
        console.log(`📡 [ElevenLabs Proxy] Sending via /api/tts (${formattedText.length} chars)...`);
        const proxyRes = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: formattedText,
            voiceId: this.voiceId,
            apiKey: this.apiKey || undefined
          })
        });
        if (proxyRes.ok) {
          audioBlob = await proxyRes.blob();
          console.log('✅ [ElevenLabs Proxy] Audio received via proxy! Characters consumed from your ElevenLabs quota.');
        } else {
          const proxyErr = await proxyRes.text();
          lastErrorDetails = `Proxy Status ${proxyRes.status}: ${proxyErr}`;
          console.error('❌ [ElevenLabs Proxy] Server error:', proxyRes.status, proxyErr);
        }
      } catch (proxyErr) {
        lastErrorDetails = `Connection failed: ${proxyErr.message}`;
        console.warn('❌ [ElevenLabs Proxy] Connection failed:', proxyErr.message);
      }
    }

    if (!audioBlob) {
      return { success: false, fallbackNeeded: true, error: lastErrorDetails, reason: lastErrorDetails || 'ElevenLabs synthesis failed' };
    }

    try {
      const audioUrl = URL.createObjectURL(audioBlob);
      this.currentAudio = new Audio(audioUrl);

      this.currentAudio.onplay = () => {
        this.isPlaying = true;
        onStart();
      };

      this.currentAudio.onended = () => {
        this.isPlaying = false;
        URL.revokeObjectURL(audioUrl);
        onEnd();
      };

      this.currentAudio.onerror = (e) => {
        this.isPlaying = false;
        URL.revokeObjectURL(audioUrl);
        onError(e);
      };

      await this.currentAudio.play();
      return { success: true, fallbackNeeded: false };
    } catch (err) {
      return { success: false, fallbackNeeded: true, reason: err.message };
    }
  }

  stop() {
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio.currentTime = 0;
      this.currentAudio = null;
    }
    this.isPlaying = false;
  }
}
