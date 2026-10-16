/**
 * Speech Interaction (STT & TTS) Manager for U-Vision (Ubot)
 */

export class SpeechManager {
  constructor({ onSpeechStart, onSpeechResult, onSpeechEnd, onSpeakStart, onSpeakEnd, lang = 'th-TH' } = {}) {
    this.onSpeechStart = onSpeechStart || (() => { });
    this.onSpeechResult = onSpeechResult || (() => { });
    this.onSpeechEnd = onSpeechEnd || (() => { });
    this.onSpeakStart = onSpeakStart || (() => { });
    this.onSpeakEnd = onSpeakEnd || (() => { });

    this.currentLang = lang; // 'th-TH' or 'en-US'
    this.recognition = null;
    this.isListening = false;
    this.synth = window.speechSynthesis || null;
    this.thaiVoice = null;
    this.englishVoice = null;
    this.voices = [];

    this.initRecognition();
    this.initVoices();
  }

  setLanguage(lang) {
    this.currentLang = lang;
    if (this.recognition) {
      this.recognition.lang = lang;
    }
  }

  initRecognition() {
    const SpeechRecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionClass) {
      console.warn('SpeechRecognition API is not supported in this browser.');
      return;
    }

    this.recognition = new SpeechRecognitionClass();
    this.recognition.lang = this.currentLang;
    this.recognition.interimResults = true;
    this.recognition.maxAlternatives = 1;
    this.recognition.continuous = false;

    this.recognition.onstart = () => {
      this.isListening = true;
      this.onSpeechStart();
    };

    this.recognition.onresult = (event) => {
      let interim = '';
      let final = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          final += transcript;
        } else {
          interim += transcript;
        }
      }

      this.onSpeechResult({
        transcript: final || interim,
        isFinal: Boolean(final)
      });
    };

    this.recognition.onerror = (event) => {
      console.warn('SpeechRecognition error:', event.error);
      this.isListening = false;
      this.onSpeechEnd({ error: event.error });
    };

    this.recognition.onend = () => {
      this.isListening = false;
      this.onSpeechEnd({ error: null });
    };
  }

  initVoices() {
    if (!this.synth) return;

    const pickVoices = () => {
      this.voices = this.synth.getVoices() || [];
      if (this.voices.length === 0) return;

      const savedName = localStorage.getItem('uvision_preferred_thai_voice');
      if (savedName) {
        this.thaiVoice = this.voices.find(v => v.name === savedName) || null;
      }

      if (!this.thaiVoice) {
        // 1. Prefer Microsoft Online (Natural) Niwat (male) or Premwadee (female)
        this.thaiVoice = 
          this.voices.find(v => (v.lang.toLowerCase().startsWith('th') || v.name.includes('Thai') || v.name.includes('ไทย')) && (v.name.includes('Natural') || v.name.includes('Online')))
          || this.voices.find(v => v.lang.toLowerCase().startsWith('th') && v.name.includes('Google'))
          || this.voices.find(v => v.lang.toLowerCase().startsWith('th') || v.name.includes('Thai') || v.name.includes('ไทย'))
          || null;
      }

      // 2. English Voice
      this.englishVoice = 
        this.voices.find(v => v.lang.toLowerCase().startsWith('en') && (v.name.includes('Natural') || v.name.includes('Online') || v.name.includes('Google')))
        || this.voices.find(v => v.lang.toLowerCase().startsWith('en'))
        || null;
    };

    pickVoices();
    if (this.synth.onvoiceschanged !== undefined) {
      this.synth.onvoiceschanged = pickVoices;
    }
  }

  getAvailableThaiVoices() {
    if (!this.synth) return [];
    const all = this.synth.getVoices() || [];
    return all.filter(v => v.lang.toLowerCase().startsWith('th') || v.name.includes('Thai') || v.name.includes('ไทย'));
  }

  setPreferredThaiVoice(voiceName) {
    if (!this.synth) return;
    const all = this.synth.getVoices() || [];
    const found = all.find(v => v.name === voiceName);
    if (found) {
      this.thaiVoice = found;
      localStorage.setItem('uvision_preferred_thai_voice', found.name);
    } else if (voiceName === 'auto') {
      localStorage.removeItem('uvision_preferred_thai_voice');
      this.initVoices();
    }
  }

  async requestMicrophonePermission() {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(t => t.stop());
        return true;
      } catch (e) {
        console.warn('Microphone permission not granted:', e);
        return false;
      }
    }
    return false;
  }

  async startListening() {
    // If speaking, cancel it first
    this.stopSpeaking();

    if (!this.recognition) {
      return {
        supported: false,
        reason: 'unsupported_browser',
        message: 'เบราว์เซอร์นี้ไม่รองรับ Web Speech Recognition แนะนำให้เปิดด้วย Google Chrome หรือ Microsoft Edge ครับ'
      };
    }

    if (this.isListening) {
      return { supported: true, alreadyRunning: true };
    }

    try {
      this.recognition.lang = this.currentLang;
      this.recognition.start();
      return { supported: true };
    } catch (err) {
      if (err.name === 'InvalidStateError') {
        return { supported: true };
      }

      // Attempt to prompt for mic permission via getUserMedia
      const granted = await this.requestMicrophonePermission();
      if (granted) {
        try {
          this.recognition.start();
          return { supported: true };
        } catch (e) {
          console.warn('Recognition retry after mic permission failed:', e);
        }
      }

      console.warn('Recognition start error:', err);
      return { supported: false, error: err };
    }
  }

  stopListening() {
    if (this.recognition && this.isListening) {
      try {
        this.recognition.stop();
      } catch (e) {
        // Ignored
      }
    }
    this.isListening = false;
  }

  speak(text, { rate = 1.0, pitch = 1.0 } = {}) {
    return new Promise((resolve) => {
      if (!this.synth || !text) {
        this.onSpeakStart();
        setTimeout(() => {
          this.onSpeakEnd();
          resolve();
        }, 1200);
        return;
      }

      this.stopSpeaking();

      if (!this.thaiVoice || this.voices.length === 0) {
        this.initVoices();
      }

      const isThai = /[\u0E00-\u0E7F]/.test(text);
      const selectedVoice = isThai
        ? (this.thaiVoice || this.voices.find(v => v.lang.toLowerCase().startsWith('th')) || null)
        : (this.englishVoice || this.thaiVoice || this.voices[0] || null);

      const utterance = new SpeechSynthesisUtterance(text);
      if (selectedVoice) {
        utterance.voice = selectedVoice;
        utterance.lang = selectedVoice.lang;
      } else {
        utterance.lang = isThai ? 'th-TH' : 'en-US';
      }
      utterance.rate = rate;
      utterance.pitch = pitch;

      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        clearTimeout(this.speechSafetyTimer);
        this.speechSafetyTimer = null;
        if (this.currentUtteranceResolve === done) this.currentUtteranceResolve = null;
        this.onSpeakEnd();
        resolve();
      };
      this.currentUtteranceResolve = done;

      const maxMs = Math.max(3500, Math.min(10000, text.length * 140 + 2000));
      this.speechSafetyTimer = setTimeout(done, maxMs);

      utterance.onstart = () => {
        this.onSpeakStart();
      };

      utterance.onend = done;
      utterance.onerror = done;

      this.synth.speak(utterance);
    });
  }

  stopSpeaking() {
    clearTimeout(this.speechSafetyTimer);
    this.speechSafetyTimer = null;
    if (this.synth && (this.synth.speaking || this.synth.pending)) {
      this.synth.cancel();
    }
    if (this.currentUtteranceResolve) {
      const fn = this.currentUtteranceResolve;
      this.currentUtteranceResolve = null;
      fn();
    } else {
      this.onSpeakEnd();
    }
  }
}
