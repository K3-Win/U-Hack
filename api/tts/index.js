const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || process.env.elevenlab || process.env.elevenlabs || '';
const DEFAULT_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'H9eYlNHpm1vah6PPgYAk';
const DEFAULT_TTS_MODEL = process.env.ELEVENLABS_MODEL || 'eleven_v3';

// Warm in-memory LRU cache on serverless instance for repeated phrases
const ttsCache = new Map();
const MAX_CACHE_ENTRIES = 60;

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
    const effectiveVoiceId = (body.voiceId || '').trim() || DEFAULT_VOICE_ID;
    const cacheKey = `${effectiveVoiceId}:${text}`;

    if (ttsCache.has(cacheKey)) {
      const cachedBuf = ttsCache.get(cacheKey);
      res.writeHead(200, {
        'Content-Type': 'audio/mpeg',
        'Content-Length': cachedBuf.length,
        'Cache-Control': 'public, max-age=3600'
      });
      res.end(cachedBuf);
      return;
    }

    const payload = {
      text,
      model_id: DEFAULT_TTS_MODEL,
      ...(isThai ? { language_code: 'th' } : {}),
      voice_settings: { stability: 0.5, similarity_boost: 0.78, style: 0.0, use_speaker_boost: false }
    };

    // Standard endpoint with lightweight mp3_22050_32 keeps proper MP3 headers so mobile audio.onended always fires
    const ttsUrl = `https://api.elevenlabs.io/v1/text-to-speech/${effectiveVoiceId}?output_format=mp3_22050_32`;

    let elevenRes = await fetch(ttsUrl, {
      method: 'POST',
      headers: { 'Accept': 'audio/mpeg', 'Content-Type': 'application/json', 'xi-api-key': apiKey },
      body: JSON.stringify(payload)
    });

    if (!elevenRes.ok && elevenRes.status === 400) {
      delete payload.language_code;
      elevenRes = await fetch(ttsUrl, {
        method: 'POST',
        headers: { 'Accept': 'audio/mpeg', 'Content-Type': 'application/json', 'xi-api-key': apiKey },
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
    const audioBuffer = Buffer.from(arrayBuffer);

    if (text.length <= 160) {
      if (ttsCache.size >= MAX_CACHE_ENTRIES) {
        const firstKey = ttsCache.keys().next().value;
        ttsCache.delete(firstKey);
      }
      ttsCache.set(cacheKey, audioBuffer);
    }

    res.writeHead(200, {
      'Content-Type': 'audio/mpeg',
      'Content-Length': audioBuffer.length,
      'Cache-Control': 'public, max-age=3600'
    });
    res.end(audioBuffer);
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: err.message }));
  }
}
