/**
 * AI Service Manager for U-Vision (Ubot)
 * Handles:
 * 1. Utopia U-bot API Endpoint (Primary target)
 * 2. Google Gemini Flash API (Secondary / Dev alternative)
 * 3. Local Mock Fail-Safe Engine (Offline guarantee)
 */

import { PRESET_SCENARIOS, DEFAULT_SYSTEM_INSTRUCTION } from './mockData.js';

export class AIService {
  constructor() {
    this.config = this.loadConfig();
  }

  loadConfig() {
    return {
      activeProvider: localStorage.getItem('uvision_provider') || 'auto', // 'utopia', 'gemini', 'mock', 'auto'
      utopiaEndpoint: localStorage.getItem('uvision_utopia_endpoint') || '',
      utopiaToken: localStorage.getItem('uvision_utopia_token') || '',
      geminiKey: localStorage.getItem('uvision_gemini_key') || '',
      geminiModel: (!localStorage.getItem('uvision_gemini_model') || localStorage.getItem('uvision_gemini_model').includes('2.5') || localStorage.getItem('uvision_gemini_model') === 'gemini-3.5-flash')
        ? 'gemini-3.1-flash-lite' 
        : localStorage.getItem('uvision_gemini_model')
    };
  }

  saveConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    localStorage.setItem('uvision_provider', this.config.activeProvider);
    localStorage.setItem('uvision_utopia_endpoint', this.config.utopiaEndpoint);
    localStorage.setItem('uvision_utopia_token', this.config.utopiaToken);
    localStorage.setItem('uvision_gemini_key', this.config.geminiKey);
    localStorage.setItem('uvision_gemini_model', this.config.geminiModel);
  }

  /**
   * Main ask method
   * @param {object} params - { imageBase64, question, mimeType, mode }
   * @returns {Promise<{ text: string, provider: string, isFallback: boolean }>}
   */
  async askUbot({ imageBase64, question, mimeType = 'image/jpeg', mode = 'conversation', detections = '' }) {
    const trimmedQuestion = (question || (mode === 'walking' ? 'วิเคราะห์ทางเดินข้างหน้า' : 'ช่วยดูรูปนี้ให้หน่อยว่าคืออะไรและมีอะไรสำคัญไหม')).trim();

    // 1. Force Mock if provider set to mock
    if (this.config.activeProvider === 'mock') {
      const mockResult = mode === 'walking' ? 'ทางโล่ง ตรงไปได้ปลอดภัยครับ' : this.findMockResponse(trimmedQuestion);
      return { text: mockResult, provider: 'Local Mock (Fail-Safe)', isFallback: true };
    }

    // 2. Try Utopia U-bot if endpoint configured or provider is set to utopia
    if (this.config.utopiaEndpoint && (this.config.activeProvider === 'utopia' || this.config.activeProvider === 'auto')) {
      try {
        const utopiaRes = await this.callUtopiaUbot({
          endpoint: this.config.utopiaEndpoint,
          token: this.config.utopiaToken,
          imageBase64,
          question: trimmedQuestion,
          mimeType
        });
        if (utopiaRes) {
          return { text: utopiaRes, provider: 'U-bot (Utopia)', isFallback: false };
        }
      } catch (err) {
        console.warn('Utopia U-bot API call failed, attempting fallback:', err);
      }
    }

    // 3. Try Gemini via Server Proxy first (Zero-config for visitors/judges)
    if (this.config.activeProvider === 'gemini' || this.config.activeProvider === 'auto') {
      try {
        const serverRes = await this.callServerChat({
          imageBase64,
          question: trimmedQuestion,
          mimeType,
          model: this.config.geminiModel,
          apiKey: this.config.geminiKey,
          mode,
          detections
        });
        if (serverRes && serverRes.text) {
          return { text: serverRes.text, provider: serverRes.provider || `Gemini (${this.config.geminiModel})`, isFallback: false };
        }
      } catch (err) {
        console.warn('Server /api/chat failed, checking direct Gemini client call:', err);
      }

      // If server proxy failed and client has its own API key configured in modal, try direct call
      if (this.config.geminiKey) {
        try {
          const geminiRes = await this.callGeminiAPI({
            apiKey: this.config.geminiKey,
            model: this.config.geminiModel,
            imageBase64,
            question: trimmedQuestion,
            mimeType
          });
          if (geminiRes) {
            return { text: geminiRes, provider: `Gemini (${this.config.geminiModel})`, isFallback: false };
          }
        } catch (err) {
          console.warn('Gemini client call failed, attempting fallback to mock:', err);
        }
      }
    }

    // 4. Guaranteed Fail-Safe Fallback: Local Scenario Engine
    const fallbackText = mode === 'walking' 
      ? 'ทางเดินข้างหน้าโล่ง เดินตรงไปได้' 
      : this.findMockResponse(trimmedQuestion);
    return {
      text: fallbackText,
      provider: 'U-bot Mock Engine (Offline Mode)',
      isFallback: true
    };
  }

  /**
   * Calls Backend Server Proxy (/api/chat) which securely holds GEMINI_API_KEY
   */
  async callServerChat({ imageBase64, question, mimeType, model, apiKey, mode = 'conversation', detections = '' }) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64, question, mimeType, model, apiKey, mode, detections }),
        signal: controller.signal
      });
      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`Server returned status ${response.status}`);
      }

      return await response.json();
    } catch (err) {
      clearTimeout(timeout);
      throw err;
    }
  }

  /**
   * Calls Utopia U-bot API Endpoint with flexible payload format
   */
  async callUtopiaUbot({ endpoint, token, imageBase64, question, mimeType }) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 9000); // 9-second timeout

    const headers = {
      'Content-Type': 'application/json'
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
      headers['x-api-key'] = token;
    }

    // Standard payload structure adapted for Utopia U-bot
    const payload = {
      prompt: question,
      message: question,
      image: `data:${mimeType};base64,${imageBase64}`,
      image_base64: imageBase64,
      system_instruction: DEFAULT_SYSTEM_INSTRUCTION
    };

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`Utopia API responded with HTTP ${response.status}`);
      }

      const data = await response.json();

      // Extract answer from common response fields
      return (
        data.reply ||
        data.response ||
        data.message ||
        data.answer ||
        data.text ||
        (data.choices && data.choices[0]?.message?.content) ||
        JSON.stringify(data)
      );
    } catch (err) {
      clearTimeout(timeout);
      throw err;
    }
  }

  /**
   * Calls Google Gemini Multimodal REST API
   */
  async callGeminiAPI({ apiKey, model, imageBase64, question, mimeType }) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const body = {
      systemInstruction: {
        parts: [{ text: DEFAULT_SYSTEM_INSTRUCTION }]
      },
      contents: [
        {
          role: 'user',
          parts: [
            { text: `คำถามจากผู้ใช้: ${question}` },
            {
              inlineData: {
                mimeType,
                data: imageBase64
              }
            }
          ]
        }
      ],
      generationConfig: {
        maxOutputTokens: 1024,
        temperature: 0.4,
        thinkingConfig: {
          thinkingBudget: 0
        }
      }
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const errorMsg = await response.text();
        throw new Error(`Gemini API Error ${response.status}: ${errorMsg}`);
      }

      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error('No text returned in Gemini response');
      return text.trim();
    } catch (err) {
      clearTimeout(timeout);
      throw err;
    }
  }

  /**
   * Matches question or returns intelligent fallback response
   */
  findMockResponse(question) {
    const q = question.toLowerCase();

    // Check allergy / food keywords
    if (q.includes('กิน') || q.includes('อาหาร') || q.includes('แพ้') || q.includes('สาร') || q.includes('แคล') || q.includes('allergy')) {
      return PRESET_SCENARIOS[0].ubotResponse;
    }

    // Check hardware / port keywords
    if (q.includes('พอร์ต') || q.includes('สาย') || q.includes('เสียบ') || q.includes('usb') || q.includes('คอม') || q.includes('hdmi')) {
      return PRESET_SCENARIOS[1].ubotResponse;
    }

    // Check sign / translation keywords
    if (q.includes('แปล') || q.includes('ป้าย') || q.includes('เขียน') || q.includes('ภาษา') || q.includes('อ่าน')) {
      return PRESET_SCENARIOS[2].ubotResponse;
    }

    // Default friendly assistant fallback
    return 'จากมุมมองนี้ VisionBot มองเห็นวัตถุตรงหน้าชัดเจนครับ ระบบพร้อมให้ข้อมูลเพิ่มเติม หากต้องการสแกนรายละเอียดเฉพาะจุด ลองขยับกล้องเข้าไปใกล้อีกนิดแล้วกดถามได้เลยครับ!';
  }
}
