import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Simple .env parser without external dependencies
function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    content.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [k, ...v] = trimmed.split('=');
        if (k && v.length) {
          process.env[k.trim()] = v.join('=').trim().replace(/^["']|["']$/g, '');
        }
      }
    });
  }
}
loadEnv();

const PORT = process.env.PORT || 5173;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || '';
const DEFAULT_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'H9eYlNHpm1vah6PPgYAk';
const DEFAULT_TTS_MODEL = process.env.ELEVENLABS_MODEL || 'eleven_v3';

// Auto-managed Native Thai Voice state
let activeThaiVoice = {
  voiceId: DEFAULT_VOICE_ID,
  name: 'Ekkarat',
  isNativeThai: true
};

// Automatically find or add top authentic Thai voice from ElevenLabs
async function autoDiscoverThaiVoice() {
  if (!ELEVENLABS_API_KEY) return;
  try {
    // 1. Check if user's account already has a Thai voice
    const voicesRes = await fetch('https://api.elevenlabs.io/v1/voices', {
      headers: { 'xi-api-key': ELEVENLABS_API_KEY }
    });
    if (voicesRes.ok) {
      const data = await voicesRes.json();
      const voices = data.voices || [];
      // Prioritize configured default voice or Ekkarat/Preecha first, then any Thai voice
      const existingThai =
        voices.find(v => v.voice_id === DEFAULT_VOICE_ID) ||
        voices.find(v => v.voice_id === 'H9eYlNHpm1vah6PPgYAk') ||
        voices.find(v => v.voice_id === 'FaUQoAqt8WX5mfvrvb3A') ||
        voices.find(v =>
          v.labels?.language === 'th' ||
          v.labels?.accent === 'thai' ||
          /thai|ไทย|ekkarat|preecha|somchai|niran|kanya|thanawat|phu|mali/i.test(v.name)
        );
      if (existingThai) {
        activeThaiVoice = { voiceId: existingThai.voice_id, name: existingThai.name, isNativeThai: true };
        console.log(`🎙️ [ElevenLabs] Found native Thai voice in your account: "${existingThai.name}" (${existingThai.voice_id})`);
        return;
      }
    }

    // 2. Query Voice Library (shared-voices) for authentic Thai voices
    console.log('🔍 [ElevenLabs] Searching Voice Library for authentic Thai community voice...');
    const sharedRes = await fetch('https://api.elevenlabs.io/v1/shared-voices?language=th&page_size=10', {
      headers: { 'xi-api-key': ELEVENLABS_API_KEY }
    });
    if (sharedRes.ok) {
      const sharedData = await sharedRes.json();
      const thaiVoices = sharedData.voices || [];
      if (thaiVoices.length > 0) {
        const best = thaiVoices[0];
        console.log(`✨ [ElevenLabs] Found top Thai voice: "${best.name}". Adding to your Creator account...`);

        // Automatically add to user's collection if owner ID exists
        const ownerId = best.public_user_id || best.public_owner_id;
        if (ownerId && best.voice_id) {
          try {
            const addRes = await fetch(`https://api.elevenlabs.io/v1/voices/add/${ownerId}/${best.voice_id}`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'xi-api-key': ELEVENLABS_API_KEY
              },
              body: JSON.stringify({
                new_name: `${best.name} (Thai AI)`
              })
            });

            if (addRes.ok) {
              const addedData = await addRes.json();
              const newVoiceId = addedData.voice_id || best.voice_id;
              activeThaiVoice = { voiceId: newVoiceId, name: best.name, isNativeThai: true };
              console.log(`✅ [ElevenLabs] Successfully added Thai voice "${best.name}" (${newVoiceId}) to your account!`);
              return;
            }
          } catch (addErr) {
            console.warn('Could not add shared voice to collection:', addErr.message);
          }
        }

        activeThaiVoice = { voiceId: best.voice_id, name: best.name, isNativeThai: true };
        console.log(`✅ [ElevenLabs] Active Thai voice set to: "${best.name}" (${best.voice_id})`);
      }
    }
  } catch (err) {
    console.warn('Auto Thai voice discovery error:', err.message);
  }
}

// Automatically free port 5173 if an older node instance was left running
function freePortIfBusy(port) {
  if (process.platform !== 'win32') return;
  try {
    const stdout = execSync(`netstat -ano -p tcp | findstr :${port}`, { stdio: ['pipe', 'pipe', 'ignore'] }).toString();
    const lines = stdout.trim().split('\n');
    for (const line of lines) {
      if (line.includes('LISTENING')) {
        const parts = line.trim().split(/\s+/);
        const pid = parseInt(parts[parts.length - 1], 10);
        if (pid && pid !== process.pid) {
          console.log(`🧹 [Port Cleanup] Releasing occupied port ${port} (Killing old PID: ${pid})...`);
          execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
        }
      }
    }
  } catch (e) {
    // Port was clean or error non-fatal
  }
}

const DEFAULT_SYSTEM_INSTRUCTION = `You are VisionBot, a friendly and empathetic AI companion integrated into smart eyewear for a visually impaired user. You receive a first-person camera snapshot synchronized with the user's spoken voice query.
CORE OPERATIONAL RULES:
1. SPEECH-ONLY FORMAT:
   - Your response is fed directly into ElevenLabs TTS.
   - Output purely plain, spoken text.
   - NEVER use markdown, asterisks, bullet points, numbered lists, hashtags, emojis, or code snippets.
2. DYNAMIC LANGUAGE & TONE:
   - Always respond in the exact language the user used to speak to you (match Thai with natural spoken Thai, English with English, etc.).
   - Sound like a warm, supportive, and dependable companion—natural, conversational, and calm.
   - Keep answers between 2 to 3 short sentences. Avoid rambling or reading unnecessary walls of text.
3. SAFETY FIRST (SOFT DUAL-RESPONSE):
   - Check the snapshot for immediate navigation hazards (steps, drop-offs, curbs, low-hanging obstacles, oncoming vehicles, or tripping hazards).
   - If a hazard is present, announce it immediately in your first words, then proceed to answer the user's question (e.g., "Watch out for the drop-down curb right in front of you. That shop on your right is the pharmacy.").
4. SPATIAL POSITIONING (CLOCK ORIENTATION):
   - Never use vague terms like "over there", "here", or "nearby".
   - Ground all objects, obstacles, and people using clock-face directions and approximate steps or meters (e.g., "at your 11 o'clock, two steps ahead" or "on the table at your 2 o'clock").
5. PHYSICAL RE-FRAMING GUIDANCE:
   - If the subject of the question is blurry, truncated, obscured, or poorly lit, do not give a generic error.
   - Give gentle, actionable physical instructions to help the user re-frame (e.g., "The text is cut off on the left. Tilt your head slightly down and bring the package about ten centimeters closer, then try again.").
6. SUMMARIZING & OCR:
   - When reading medicine bottles, packages, documents, or signs, summarize the crucial, practical information first (name, dosage, key warnings, or dates) rather than reciting raw text verbatim unless specifically asked.
   - For currency or bills, only announce financial values and denominations when the user explicitly asks.
7. SOCIAL CONTEXT & MCP GROUNDING:
   - When MCP tools provide recognized face data, identify the person naturally.
   - Include helpful visual social context if visible, such as expressions, gestures, or actions (e.g., "Doctor Somchai is standing at your 12 o'clock, smiling and waving at you.").
`;

const WALKING_SYSTEM_INSTRUCTION = `You are VisionBot, an expert visual navigation guide for a visually impaired user walking with closed eyes.
You are given the user's ongoing Navigation Mission (e.g. "เดินไปที่ประตู", "เดินตรงไปข้างหน้าอย่างปลอดภัย", "พาไปที่โต๊ะ") along with real-time POV snapshots and sensor object hints.
YOUR SOLE PURPOSE IS TO GUIDE AND DIRECT THE USER STEP-BY-STEP UNTIL THE MISSION IS COMPLETED.

STRICT NAVIGATION DIRECTIVES:
1. GROUND PLANE & CLEARANCE FIRST:
   - Carefully inspect the ground plane right in front of the user (bottom of frame up to 2-3 meters).
   - Tell the user CLEARLY what they should do or what they can do next.
   - Use direct imperative action verbs with concrete steps or degrees:
     * "ทางตรงหน้าโล่ง เดินตรงไปได้ [จำนวน] ก้าวครับ" (e.g. 2, 3, 4 ก้าว)
     * "มี[วัตถุ]ตรงหน้า ให้เบี่ยงซ้าย/เบี่ยงขวา 1 ก้าวแล้วเดินต่อ"
     * "ข้างหน้าติดกำแพง ให้หันซ้าย/หันขวา 90 องศา"
     * "หยุดก่อน มีสิ่งกีดขวางขวางทางเต็มความกว้าง"
2. MISSION PROGRESSION & COMPLETION:
   - Track progress toward the user's target destination.
   - When the user has safely arrived at the target (within reach of the door/table/destination):
     You MUST state clearly: "ถึงเป้าหมายเรียบร้อยแล้วครับ ภารกิจเสร็จสิ้น"
3. CONCISENESS & SPEED (< 12 words in Thai):
   - Output EXACTLY 1 short, actionable spoken sentence.
   - Plain spoken text only. No markdown, no asterisks, no bullets.
`;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.webm': 'video/webm'
};

// Stateless Gemini call. Every request is ONE user turn with at most ONE image:
// no conversation history is kept anywhere, so images never accumulate in context.
async function callGemini({ question, imageBase64, mimeType = 'image/jpeg', apiKey, model, mode, detections }) {
  const key = apiKey || GEMINI_API_KEY;
  const useModel = model || GEMINI_MODEL;
  if (!key) {
    const e = new Error('GEMINI_API_KEY is not configured on server or client.');
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
    console.warn(`Gemini API (${candidateModel}) status ${lastStatus}, trying next fallback if transient...`);

    if (lastStatus !== 503 && lastStatus !== 429 && lastStatus !== 404) {
      break;
    }
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

// Handle Gemini API Call from Server (browser path)
async function handleGeminiChat(req, res) {
  try {
    const body = JSON.parse((await readBody(req)) || '{}');
    const result = await callGemini({
      question: (body.question || 'ช่วยดูรูปนี้ให้หน่อยว่าคืออะไร').trim(),
      imageBase64: body.imageBase64 || '',
      mimeType: body.mimeType || 'image/jpeg',
      apiKey: body.apiKey,
      model: body.model,
      mode: body.mode,
      detections: typeof body.detections === 'string' ? body.detections.slice(0, 500) : ''
    });
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(JSON.stringify({ text: result.text, provider: `Gemini (${result.model})`, isFallback: false }));
  } catch (err) {
    console.error('Server /api/chat error:', err);
    res.writeHead(err.status || 500, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: err.message, details: err.details }));
  }
}

// Server Proxy for ElevenLabs TTS (Guarantees zero-CORS / network fail-safety)
async function handleElevenLabsTts(req, res) {
  try {
    const body = JSON.parse((await readBody(req)) || '{}');
    const text = (body.text || '').trim();
    const apiKey = (body.apiKey || ELEVENLABS_API_KEY).trim();

    if (!text) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'No text provided' }));
      return;
    }

    if (!apiKey) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'ELEVENLABS_API_KEY is not configured' }));
      return;
    }

    const isThai = /[\u0E00-\u0E7F]/.test(text);

    // Use requested voiceId directly, or fallback to discovered voice if empty
    let effectiveVoiceId = (body.voiceId || '').trim();
    if (!effectiveVoiceId) {
      effectiveVoiceId = (isThai && activeThaiVoice.isNativeThai) ? activeThaiVoice.voiceId : DEFAULT_VOICE_ID;
    }

    // eleven_v3 is the official ElevenLabs model supporting Thai natively (language_code: 'th')
    const payload = {
      text,
      model_id: DEFAULT_TTS_MODEL,
      ...(isThai ? { language_code: 'th' } : {}),
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.8,
        style: 0.0,
        use_speaker_boost: true
      }
    };

    let elevenRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${effectiveVoiceId}`, {
      method: 'POST',
      headers: {
        'Accept': 'audio/mpeg',
        'Content-Type': 'application/json',
        'xi-api-key': apiKey
      },
      body: JSON.stringify(payload)
    });

    // Fallback if language_code is rejected
    if (!elevenRes.ok && elevenRes.status === 400) {
      delete payload.language_code;
      elevenRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${effectiveVoiceId}`, {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': apiKey
        },
        body: JSON.stringify(payload)
      });
    }

    if (!elevenRes.ok) {
      const err = await elevenRes.text();
      res.writeHead(elevenRes.status, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: err }));
      return;
    }

    const arrayBuffer = await elevenRes.arrayBuffer();
    res.writeHead(200, {
      'Content-Type': 'audio/mpeg',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(Buffer.from(arrayBuffer));
  } catch (err) {
    console.error('Server /api/tts error:', err);
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: err.message }));
  }
}

// Fetch available voices from user's ElevenLabs account
async function handleElevenLabsVoices(req, res) {
  try {
    const apiKey = ELEVENLABS_API_KEY;
    if (!apiKey) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'No ElevenLabs API Key configured on server' }));
      return;
    }
    const elevenRes = await fetch('https://api.elevenlabs.io/v1/voices', {
      headers: { 'xi-api-key': apiKey }
    });
    if (!elevenRes.ok) {
      res.writeHead(elevenRes.status, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Failed to fetch voices from ElevenLabs' }));
      return;
    }
    const data = await elevenRes.json();
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(data));
  } catch (err) {
    console.error('Server /api/voices error:', err);
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: err.message }));
  }
}

// ---------------------------------------------------------------------------
// Camera hub bridge: the browser owns the camera (CameraHub). When the MCP tool
// is called, the server asks the open page (via SSE) for ONE native-res frame.
// Frames are held in memory only for the duration of the request.
// ---------------------------------------------------------------------------
const hubClients = new Set();
const pendingCaptures = new Map(); // id -> { resolve, reject, timer }
let captureSeq = 0;

function handleHubEvents(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive'
  });
  res.write('retry: 2000\n\n');
  hubClients.add(res);
  req.on('close', () => hubClients.delete(res));
}

async function handleHubFrame(req, res) {
  try {
    const body = JSON.parse((await readBody(req)) || '{}');
    const pending = pendingCaptures.get(body.id);
    if (pending) {
      clearTimeout(pending.timer);
      pendingCaptures.delete(body.id);
      if (body.error) pending.reject(new Error(body.error));
      else pending.resolve(body);
    }
    res.writeHead(204);
    res.end();
  } catch (err) {
    res.writeHead(400);
    res.end();
  }
}

function requestFrameFromBrowser(timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    if (hubClients.size === 0) {
      reject(new Error('No U-Vision page is open with a live camera.'));
      return;
    }
    const id = String(++captureSeq);
    const timer = setTimeout(() => {
      pendingCaptures.delete(id);
      reject(new Error('Timed out waiting for camera frame.'));
    }, timeoutMs);
    pendingCaptures.set(id, { resolve, reject, timer });
    // Ask the most recently connected page only
    const client = [...hubClients].pop();
    client.write(`event: capture\ndata: ${JSON.stringify({ id })}\n\n`);
  });
}

// Path B: inspect_current_scene (on-demand only)
async function inspectCurrentScene(userPrompt) {
  const frame = await requestFrameFromBrowser();
  const result = await callGemini({
    question: userPrompt,
    imageBase64: frame.imageBase64, // native-resolution JPEG, not rescaled
    mimeType: frame.mimeType || 'image/jpeg',
    detections: frame.detections || ''
  });
  return result.text;
}

const MCP_TOOLS = [
  {
    name: 'inspect_current_scene',
    description: 'Captures ONE full native-resolution frame from the live camera and asks Gemini 3.1 Flash-Lite about it. Use only when the user explicitly asks about what the camera sees (read a sign, check if a shop is open, etc.).',
    inputSchema: {
      type: 'object',
      properties: { user_prompt: { type: 'string', description: 'What to look for / question about the scene.' } },
      required: ['user_prompt']
    }
  }
];

// Minimal MCP (JSON-RPC 2.0 over HTTP POST /mcp)
async function handleMcp(req, res) {
  const send = (obj, status = 200) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(obj));
  };
  let msg;
  try {
    msg = JSON.parse((await readBody(req)) || '{}');
  } catch {
    return send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, 400);
  }
  if (msg.id === undefined) { // notification
    res.writeHead(202);
    res.end();
    return;
  }
  const ok = result => send({ jsonrpc: '2.0', id: msg.id, result });
  switch (msg.method) {
    case 'initialize':
      return ok({
        protocolVersion: msg.params?.protocolVersion || '2025-03-26',
        capabilities: { tools: {} },
        serverInfo: { name: 'u-vision-mcp', version: '1.0.0' }
      });
    case 'ping':
      return ok({});
    case 'tools/list':
      return ok({ tools: MCP_TOOLS });
    case 'tools/call': {
      if (msg.params?.name !== 'inspect_current_scene') {
        return send({ jsonrpc: '2.0', id: msg.id, error: { code: -32602, message: 'Unknown tool' } });
      }
      try {
        const prompt = String(msg.params?.arguments?.user_prompt || '').trim() || 'Describe what you see.';
        const text = await inspectCurrentScene(prompt);
        return ok({ content: [{ type: 'text', text }] });
      } catch (err) {
        return ok({ content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true });
      }
    }
    default:
      return send({ jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: 'Method not found' } });
  }
}

const server = http.createServer((req, res) => {
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    res.end();
    return;
  }

  // API Endpoint: /api/chat
  if (req.url === '/api/chat' && req.method === 'POST') {
    handleGeminiChat(req, res);
    return;
  }

  // Camera hub bridge + MCP tool endpoint
  if (req.url === '/api/hub/events' && req.method === 'GET') {
    handleHubEvents(req, res);
    return;
  }
  if (req.url === '/api/hub/frame' && req.method === 'POST') {
    handleHubFrame(req, res);
    return;
  }
  if (req.url === '/api/tts' && req.method === 'POST') {
    handleElevenLabsTts(req, res);
    return;
  }
  if (req.url === '/api/voices' && req.method === 'GET') {
    handleElevenLabsVoices(req, res);
    return;
  }
  if (req.url === '/api/config' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ thaiVoice: activeThaiVoice, isConfigured: Boolean(ELEVENLABS_API_KEY) }));
    return;
  }
  if (req.url === '/mcp' && req.method === 'POST') {
    handleMcp(req, res);
    return;
  }

  // Normalize URL for static files
  let reqPath = decodeURI(req.url.split('?')[0]);
  if (reqPath === '/') reqPath = '/index.html';

  const safePath = path.normalize(reqPath).replace(/^(\.\.[/\\])+/, '');
  const filePath = path.join(__dirname, safePath);

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(`404 Not Found: ${reqPath}`);
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Access-Control-Allow-Origin': '*'
    });

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n❌ Error: Port ${PORT} is in use by an existing process.`);
    console.error(`👉 To free port ${PORT}, run this in PowerShell:`);
    console.error(`   Stop-Process -Id (Get-NetTCPConnection -LocalPort ${PORT}).OwningProcess -Force\n`);
    process.exit(1);
  } else {
    console.error('Server error:', err);
  }
});

// Auto-cleanup any hung process on port 5173 before binding
freePortIfBusy(PORT);

server.listen(PORT, () => {
  console.log(`\n🚀 U-Vision (VisionBot) Server is running at: http://localhost:${PORT}`);
  console.log(`📡 Ready for Camera, Microphone & AI Vision interaction.`);
  console.log(`🔑 Gemini Server Proxy: ${GEMINI_API_KEY ? 'Active (Ready)' : 'No server key (Client fallback)'}`);
  // Asynchronously discover and prepare top authentic Thai voice
  autoDiscoverThaiVoice();
});
