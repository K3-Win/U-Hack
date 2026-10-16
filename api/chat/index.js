const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.gemini || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';

const DEFAULT_SYSTEM_INSTRUCTION = `You are VisionBot, a friendly and empathetic AI companion integrated into smart eyewear for a visually impaired user. You receive a first-person camera snapshot synchronized with the user's spoken voice query.
CORE OPERATIONAL RULES:
1. SPEECH-ONLY FORMAT:
   - Your response is fed directly into TTS.
   - Output purely plain, spoken text.
   - NEVER use markdown, asterisks, bullet points, numbered lists, hashtags, emojis, or code snippets.
2. DYNAMIC LANGUAGE & TONE:
   - Always respond in the exact language the user used to speak to you (match Thai with natural spoken Thai, English with English).
   - Sound like a warm, supportive, and dependable companion—natural, conversational, and clear.
   - Keep answers between 2 to 3 concise, informative sentences.
3. DETAILED OBJECT & SCENE IDENTIFICATION:
   - Clearly identify what is in front of the user, including brand names, colors, text on labels, object state, and practical details.
   - Ground positions using clock-face directions or left/right/center and approximate distance (e.g., "ตรงหน้าคุณระยะ 1 เมตรคือ...", "ด้านซ้ายที่ 10 นาฬิกามี...").
4. SAFETY FIRST:
   - If an immediate hazard is visible in the frame, warn the user first before answering their question.
`;

const WALKING_SYSTEM_INSTRUCTION = `You are VisionBot, an expert real-time visual navigation guide for a visually impaired user walking indoors or around a room.
STRICT NAVIGATION DIRECTIVES:
1. GROUND PLANE & OBSTACLE AVOIDANCE:
   - Carefully inspect the floor and immediate path in front of the user (0.5 to 3 meters).
   - If the path ahead is clear: "ทางตรงหน้าโล่ง เดินตรงไปได้ [2-3] ก้าวครับ"
   - If there is an obstacle (chair, table, bag, person, cords, door frame): name the obstacle and tell the user which way to sidestep or turn, e.g. "มี[เก้าอี้/โต๊ะ]ขวางข้างหน้า ให้เบี่ยงซ้าย 1 ก้าวแล้วเดินต่อครับ"
   - If approaching a wall, corner, or dead-end: tell them to turn to follow the open room space, e.g. "ข้างหน้าใกล้กำแพง ให้หันขวาประมาณ 90 องศาเพื่อเดินต่อครับ"
2. MISSION COMPLETION:
   - Only say "ถึงเป้าหมายเรียบร้อยแล้วครับ ภารกิจเสร็จสิ้น" if the user had a specific target (like a door or table) AND is now right in front of it within arm's reach. For continuous room walking ("เดินตรงไปข้างหน้าอย่างปลอดภัย" or "เดินรอบห้อง"), keep guiding them around corners and obstacles without ending prematurely.
3. CONCISENESS:
   - Output EXACTLY 1 short, natural spoken sentence (< 15 words in Thai). Plain spoken text only, no markdown.
`;

async function callGemini({ question, imageBase64, mimeType = 'image/jpeg', apiKey, model, mode, detections }) {
  const key = apiKey || GEMINI_API_KEY;
  const useModel = model || GEMINI_MODEL;
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

  const geminiPayload = {
    systemInstruction: { parts: [{ text: systemText }] },
    contents: [{ role: 'user', parts }],
    generationConfig: {
      maxOutputTokens: isWalking ? 150 : 1024,
      temperature: isWalking ? 0.2 : 0.4,
      thinkingConfig: { thinkingBudget: 0 }
    }
  };

  const fallbackModels = [useModel, 'gemini-2.5-flash', 'gemini-2.0-flash'].filter((m, i, a) => a.indexOf(m) === i);
  let lastStatus = 500;
  let lastErrText = '';

  for (const candidateModel of fallbackModels) {
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
    if (lastStatus !== 503 && lastStatus !== 429 && lastStatus !== 404) break;
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
