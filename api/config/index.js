const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || process.env.elevenlab || process.env.elevenlabs || '';
const DEFAULT_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'H9eYlNHpm1vah6PPgYAk';

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({
    thaiVoice: { voiceId: DEFAULT_VOICE_ID, name: 'Ekkarat', isNativeThai: true },
    isConfigured: Boolean(ELEVENLABS_API_KEY)
  }));
}
