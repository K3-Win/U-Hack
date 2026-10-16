const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.gemini || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';

const DEFAULT_SYSTEM_INSTRUCTION = `You are VisionBot, a fast, friendly AI assistant for a visually impaired user. You receive a camera snapshot and the user's question.
RULES:
1. Plain spoken text ONLY (fed directly to TTS). No markdown, no bullets, no emojis.
2. Respond in natural spoken Thai (unless asked in English).
3. Be concise and direct: 1 to 2 short sentences maximum (< 35 words total) so TTS audio plays quickly.
4. Clearly state what is in front of the user, its color/details/text, and position (e.g. "ตรงหน้าคุณคือ...", "ด้านซ้ายมี...").`;

const WALKING_SYSTEM_INSTRUCTION = `คุณคือ VisionBot ผู้นำทางเดินเท้าแบบเรียลไทม์สำหรับผู้พิการทางสายตา ระบบจะส่งภาพใหม่ให้คุณต่อเนื่องทุกๆ ไม่กี่วินาทีขณะที่ผู้ใช้กำลังเดิน

กฎเหล็กในการนำทาง:
1. ห้ามล็อกจำนวนก้าวตายตัว ให้กะระยะจริงจากความลึกของภาพตรงหน้า:
   - ถ้าทางข้างหน้าโล่งยาว หรือจุดหมายอยู่ไกล (เกิน 4-5 เมตร): สั่งให้เดินตรงต่อเนื่องยาวๆ ตามระยะจริง เช่น 6 ถึง 10 ก้าว หรือบอกว่าเดินตรงไปยาวๆ ได้เลย
   - ถ้าระยะกลาง (2-3 เมตร): สั่งให้เดินประมาณ 3 ถึง 5 ก้าวตามจริง
   - ถ้าระยะใกล้ (1 เมตร) หรือต้องก้าวหลบสิ่งกีดขวาง: สั่ง 1 ถึง 2 ก้าวตามจริง
2. กรณีมีจุดหมาย (เช่น หน้าเวที, ประตู, โต๊ะ):
   - มองหาจุดหมายในภาพ แล้วบอกทิศทาง (ตรงหน้า / เยื้องซ้าย / เยื้องขวา) พร้อมระยะก้าวตามความไกลจริง
   - ถ้ามีคนหรือเก้าอี้ขวางทางไปจุดหมาย: สั่งให้เบี่ยงซ้ายหรือขวาเพื่ออ้อมผ่าน แล้วเดินมุ่งหน้าไปจุดหมายต่อทันที
   - ถ้าในมุมกล้องนี้ยังไม่เห็นจุดหมาย: สั่งให้หันซ้ายหรือขวาเพื่อกวาดกล้องหาจุดหมาย
   - เมื่อเดินมาถึงหน้าจุดหมายในระยะประชิด (เอื้อมมือถึง/อยู่ตรงหน้าใกล้มาก) แล้วเท่านั้น ให้พูดว่า "ถึงจุดหมายเรียบร้อยแล้วครับ ภารกิจเสร็จสิ้น"
3. ห้ามพูดเตือนแค่ว่า "ระวัง" หรือบอกให้หยุดเฉยๆ ต้องบอกทิศทางให้ก้าวเดินหรือหันตัวไปต่อเสมอ
4. ตอบเป็นประโยคพูดสั้นกระชับ 1 ประโยค (< 18 คำ) ห้ามใช้เครื่องหมายดอกจันหรือสัญลักษณ์พิเศษ`;

function buildGenerationConfig(modelName, isWalking) {
  const isGemini35OrNewer = /gemini-3\.[5-9]|gemini-3-flash/i.test(modelName);
  return {
    maxOutputTokens: isWalking ? 80 : 220,
    temperature: isWalking ? 0.35 : 0.35,
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
