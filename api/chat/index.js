const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.gemini || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';

const DEFAULT_SYSTEM_INSTRUCTION = `You are VisionBot, a fast, friendly AI assistant for a visually impaired user. You receive a camera snapshot and the user's question.
RULES:
1. Plain spoken text ONLY (fed directly to TTS). No markdown, no bullets, no emojis.
2. Respond in natural spoken Thai (unless asked in English).
3. Be concise and direct: 1 to 2 short sentences maximum (< 35 words total) so TTS audio plays quickly.
4. Clearly state what is in front of the user, its color/details/text, and position (e.g. "ตรงหน้าคุณคือ...", "ด้านซ้ายมี...").`;

const WALKING_SYSTEM_INSTRUCTION = `You are VisionBot, a real-time indoor/outdoor walking guide for a visually impaired user.
RULES:
1. Inspect the floor path 0.5 to 3 meters ahead.
2. Path clear: "ทางตรงหน้าโล่ง เดินตรงไปได้ 2 ก้าวครับ"
3. Obstacle ahead (chair, table, person, bag, door frame): name it and give direction, e.g. "มีเก้าอี้ขวางข้างหน้า ให้เบี่ยงซ้าย 1 ก้าวครับ"
4. Wall or corner ahead: tell which way to turn, e.g. "ข้างหน้าใกล้กำแพง ให้หันขวาเพื่อเดินต่อครับ"
5. Output EXACTLY 1 short sentence (< 12 words in Thai). Plain spoken text only.`;

function buildGenerationConfig(modelName, isWalking) {
  const isGemini35OrNewer = /gemini-3\.[5-9]|gemini-3-flash/i.test(modelName);
  return {
    maxOutputTokens: isWalking ? 70 : 220,
    temperature: isWalking ? 0.15 : 0.3,
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

  let promptText = `คำถามจากผู้ใช้: ${question}`;
  if (detections) promptText += `\n${detections}`;
  const parts = [{ text: promptText }];
  if (imageBase64) {
    parts.push({ inlineData: { mimeType, data: imageBase64 } });
  }

  const isWalking = mode === 'walking';
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
