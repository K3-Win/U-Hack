const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.gemini || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';

const DEFAULT_SYSTEM_INSTRUCTION = `You are VisionBot, a fast, friendly AI assistant for a visually impaired user. You receive a camera snapshot and the user's question.
RULES:
1. Plain spoken text ONLY (fed directly to TTS). No markdown, no bullets, no emojis.
2. Respond in natural spoken Thai (unless asked in English).
3. Be concise and direct: 1 to 2 short sentences maximum (< 35 words total) so TTS audio plays quickly.
4. Clearly state what is in front of the user, its color/details/text, and position (e.g. "ตรงหน้าคุณคือ...", "ด้านซ้ายมี...").`;

const WALKING_SYSTEM_INSTRUCTION = `คุณคือ VisionBot ผู้นำทางเดินเท้าแบบเรียลไทม์สำหรับผู้พิการทางสายตา
หน้าที่ของคุณคือ "สั่งให้เดินเคลื่อนที่ไปยังจุดหมาย" อย่างมั่นใจและใช้งานเดินได้จริง

กฎเหล็กในการนำทาง:
1. ห้ามเอาแต่เตือนว่า "ระวัง" หรือบอกให้หยุดเฉยๆ และห้ามบรรยายว่ามีอะไรเคลื่อนไหวในภาพ ให้สั่งการเคลื่อนที่เสมอว่า "เดินตรงไปกี่ก้าว" หรือ "เบี่ยงซ้าย/ขวาแล้วเดินต่อกี่ก้าว" หรือ "หันซ้าย/ขวาเพื่อไปต่อ"
2. กรณีผู้ใช้ระบุจุดหมาย (เช่น "ไปหน้าเวที", "ไปประตู", "ไปที่โต๊ะ"):
   - มองหาจุดหมายนั้นในภาพทันที
   - ถ้าเห็นจุดหมายอยู่ข้างหน้าหรือเยื้องซ้าย/ขวา: บอกทิศทางและสั่งให้เดินไปหาเลย เช่น "เห็นหน้าเวทีอยู่ตรงหน้าแล้ว เดินตรงไปได้เลย 4 ก้าวครับ" หรือ "หน้าเวทีอยู่ทางซ้าย ให้หันซ้ายเล็กน้อยแล้วเดินตรงไป 3 ก้าวครับ"
   - ถ้ามีคนหรือสิ่งของขวางระหว่างทางไปจุดหมาย: สั่งให้เบี่ยงหลบพร้อมเดินต่อทันที เช่น "มีเก้าอี้ขวางทางขวา ให้เบี่ยงซ้าย 1 ก้าวแล้วเดินตรงไปหน้าเวทีต่อได้เลยครับ"
   - ถ้าในมุมกล้องนี้ยังไม่เห็นจุดหมาย: สั่งให้หันตัวเพื่อกวาดกล้องหา เช่น "ยังไม่เห็นหน้าเวทีในมุมนี้ ลองหันขวาช้าๆ เพื่อหาทิศทางครับ"
   - เมื่อเดินมาถึงหน้าจุดหมายในระยะประชิดแล้วเท่านั้น ให้พูดว่า "ถึงจุดหมายเรียบร้อยแล้วครับ ภารกิจเสร็จสิ้น"
3. กรณีเดินทั่วไป (ไม่ได้ระบุจุดหมายเฉพาะ):
   - ถ้ามีช่องว่างให้เดินผ่านได้ (แม้จะมีคนหรือของอยู่ด้านข้าง): ให้สั่งเดินไปตามช่องว่างนั้นเลย เช่น "ทางตรงหน้าเดินได้ เดินตรงไปได้เลย 3 ก้าวครับ"
   - ถ้ามีสิ่งกีดขวางตรงกลาง: สั่งให้เบี่ยงซ้ายหรือขวาแล้วเดินต่อ เช่น "มีโต๊ะตรงหน้า ให้เบี่ยงขวาแล้วเดินตรงต่อไป 2 ก้าวครับ"
   - ถ้าเจอผนังหรือมุมห้อง: สั่งให้เลี้ยวไปทางที่โล่ง เช่น "สุดทางเดินด้านหน้า ให้เลี้ยวซ้ายแล้วเดินต่อได้เลยครับ"
4. ตอบสั้นกระชับเพียง 1 ประโยคพูด (< 16 คำ) ห้ามใช้ตัวหนาหรือสัญลักษณ์พิเศษ`;

function buildGenerationConfig(modelName, isWalking) {
  const isGemini35OrNewer = /gemini-3\.[5-9]|gemini-3-flash/i.test(modelName);
  return {
    maxOutputTokens: isWalking ? 80 : 220,
    temperature: isWalking ? 0.2 : 0.3,
    mediaResolution: isWalking ? 'MEDIA_RESOLUTION_LOW' : 'MEDIA_RESOLUTION_MEDIUM',
    thinkingConfig: isGemini35OrNewer
      ? { thinkingLevel: 'MINIMAL' }
      : { thinkingBudget: 0 }
  };
}

async function callGemini({ question, imageBase64, mimeType = 'image/jpeg', apiKey, model, mode, detections }) {
  const key = apiKey || GEMINI_API_KEY;
  const requestedModel = (model && !model.includes('3.1') && !model.includes('2.5')) ? model : GEMINI_MODEL;
  if (!key) {
    const e = new Error('GEMINI_API_KEY is not configured on server.');
    e.status = 500;
    throw e;
  }

  const isWalking = mode === 'walking';
  let promptText = isWalking ? question : `คำถามจากผู้ใช้: ${question}`;
  if (!isWalking && detections) {
    promptText += `\n${detections}`;
  }

  const parts = [{ text: promptText }];
  if (imageBase64) {
    parts.push({ inlineData: { mimeType, data: imageBase64 } });
  }

  const systemText = isWalking ? WALKING_SYSTEM_INSTRUCTION : DEFAULT_SYSTEM_INSTRUCTION;

  const fallbackModels = [requestedModel, 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-2.5-flash-lite']
    .filter((m, i, a) => Boolean(m) && a.indexOf(m) === i);

  let lastStatus = 500;
  let lastErrText = '';

  for (const candidateModel of fallbackModels) {
    const geminiPayload = {
      systemInstruction: { parts: [{ text: systemText }] },
      contents: [{ role: 'user', parts }],
      generationConfig: buildGenerationConfig(candidateModel, isWalking)
    };

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${candidateModel}:generateContent?key=${key}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(geminiPayload)
    });

    if (response.ok) {
      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      return { text: text.trim(), model: candidateModel };
    }

    lastStatus = response.status;
    lastErrText = await response.text();
    if (lastStatus !== 503 && lastStatus !== 429 && lastStatus !== 404 && lastStatus !== 400) break;
  }

  const e = new Error(`Gemini API Error ${lastStatus}`);
  e.status = lastStatus;
  e.details = lastErrText;
  throw e;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let bodyStr = '';
    req.on('data', chunk => { bodyStr += chunk; });
    req.on('end', () => resolve(bodyStr));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.end('Method Not Allowed');
    return;
  }

  try {
    const body = typeof req.body === 'object' && req.body !== null ? req.body : JSON.parse((await readBody(req)) || '{}');
    const result = await callGemini({
      question: (body.question || 'ช่วยดูรูปนี้ให้หน่อยว่าคืออะไร').trim(),
      imageBase64: body.imageBase64 || '',
      mimeType: body.mimeType || 'image/jpeg',
      apiKey: body.apiKey,
      model: body.model,
      mode: body.mode,
      detections: typeof body.detections === 'string' ? body.detections.slice(0, 500) : ''
    });
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ text: result.text, provider: `Gemini (${result.model})`, isFallback: false }));
  } catch (err) {
    res.writeHead(err.status || 500, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: err.message, details: err.details }));
  }
}
