/**
 * U-Vision (VisionBot) Main Application Controller
 */

import { CameraManager } from './camera.js';
import { SpeechManager } from './speech.js';
import { ElevenLabsManager } from './elevenlabs.js';
import { AIService } from './ai.js';
import { CameraHub } from './camerahub.js';
import { Detector } from './detector.js';
import { PRESET_SCENARIOS } from './mockData.js';
import { 
  playCaptureSound, 
  playChirpSound, 
  playThinkingSound, 
  playResponseSound,
  playHazardAlertSound,
  triggerHaptic
} from './sfx.js';

// DOM Elements
const videoEl = document.getElementById('cameraFeed');
const customImageView = document.getElementById('customImageView');
const canvasEl = document.getElementById('offscreenCanvas');
const shutterFlash = document.getElementById('shutterFlash');
const viewportContainer = document.getElementById('viewportContainer');

const ubotOrbWrapper = document.getElementById('ubotOrbWrapper');
const statusBadge = document.getElementById('statusBadge');
const userQuestionEcho = document.getElementById('userQuestionEcho');
const ubotResponseText = document.getElementById('ubotResponseText');
const soundwaveBar = document.getElementById('soundwaveBar');
const snapshotBadge = document.getElementById('snapshotBadge');
const snapshotThumb = document.getElementById('snapshotThumb');
const snapshotResolution = document.getElementById('snapshotResolution');

const btnPtt = document.getElementById('btnPtt');
const pttHelperText = document.getElementById('pttHelperText');
const btnFlipCamera = document.getElementById('btnFlipCamera');
const btnStopSpeaking = document.getElementById('btnStopSpeaking');
const btnUploadImage = document.getElementById('btnUploadImage');
const fileInput = document.getElementById('fileInput');

// Walking Mode Controls
const btnToggleWalkMode = document.getElementById('btnToggleWalkMode');
const walkModeLabel = document.getElementById('walkModeLabel');

// Language Switcher Controls
const btnToggleLang = document.getElementById('btnToggleLang');
const langLabel = document.getElementById('langLabel');
let currentAppLang = localStorage.getItem('uvision_lang') || 'th-TH';

// Quick Action Chips
const chipIdentify = document.getElementById('chipIdentify');
const chipAllergy = document.getElementById('chipAllergy');
const chipHardware = document.getElementById('chipHardware');
const chipTranslate = document.getElementById('chipTranslate');

// Header & Telemetry
const telemetryTime = document.getElementById('telemetryTime');
const aiProviderLabel = document.getElementById('aiProviderLabel');
const ttsProviderLabel = document.getElementById('ttsProviderLabel');
const camStatusLabel = document.getElementById('camStatusLabel');
const telemetryFps = document.getElementById('telemetryFps');
const detectionOverlay = document.getElementById('detectionOverlay');

// Drawers & Modals
const btnOpenScenarios = document.getElementById('btnOpenScenarios');
const btnCloseScenarios = document.getElementById('btnCloseScenarios');
const scenariosBackdrop = document.getElementById('scenariosBackdrop');
const demoScenario1 = document.getElementById('demoScenario1');
const demoScenario2 = document.getElementById('demoScenario2');
const demoScenario3 = document.getElementById('demoScenario3');
const btnResetToLiveCam = document.getElementById('btnResetToLiveCam');

const btnOpenSettings = document.getElementById('btnOpenSettings');
const btnCloseSettings = document.getElementById('btnCloseSettings');
const settingsModal = document.getElementById('settingsModal');
const btnSaveSettings = document.getElementById('btnSaveSettings');
const settingActiveProvider = document.getElementById('settingActiveProvider');
const settingUtopiaEndpoint = document.getElementById('settingUtopiaEndpoint');
const settingUtopiaToken = document.getElementById('settingUtopiaToken');
const settingTtsEngine = document.getElementById('settingTtsEngine');
const groupBrowserThaiVoices = document.getElementById('groupBrowserThaiVoices');
const settingThaiVoiceSelect = document.getElementById('settingThaiVoiceSelect');
const groupElevenLabsOptions = document.getElementById('groupElevenLabsOptions');
const settingElevenLabsKey = document.getElementById('settingElevenLabsKey');
const settingElevenLabsVoiceId = document.getElementById('settingElevenLabsVoiceId');
const settingElevenLabsPreset = document.getElementById('settingElevenLabsPreset');
const groupCustomVoiceId = document.getElementById('groupCustomVoiceId');
const btnTestVoice = document.getElementById('btnTestVoice');
const settingGeminiKey = document.getElementById('settingGeminiKey');

// State
let currentState = 'IDLE'; // 'IDLE' | 'LISTENING' | 'THINKING' | 'SPEAKING'
let currentCapturedFrame = null;
let activeQuestion = '';

// Walking / Blind Assist Mode State
let isWalkingMode = false;
let lastTapTimestamp = 0;

// Instantiate Services
const camera = new CameraManager(videoEl, canvasEl);
const aiService = new AIService();
const DEFAULT_ELEVEN_VOICE = 'H9eYlNHpm1vah6PPgYAk'; // Ekkarat (เสียงคนไทยแท้)

const initialVoice = localStorage.getItem('uvision_eleven_voice');
const effectiveVoice = (!initialVoice || initialVoice === '21m00Tcm4TlvDq8ikWAM' || initialVoice === 'nPczCjzI2devNBz1zQrb') ? DEFAULT_ELEVEN_VOICE : initialVoice;
localStorage.setItem('uvision_eleven_voice', effectiveVoice);

if (!localStorage.getItem('uvision_tts_engine')) {
  localStorage.setItem('uvision_tts_engine', 'elevenlabs');
}

const elevenLabs = new ElevenLabsManager({
  apiKey: localStorage.getItem('uvision_eleven_key') || '',
  voiceId: effectiveVoice
});

// Single camera producer shared by Path A (detector) and Path B (Gemini / MCP)
const hub = new CameraHub(camera);
const detector = new Detector({
  hub,
  overlayCanvas: detectionOverlay,
  onScene: (s) => handleScene(s),
  onFps: (fps) => { if (telemetryFps) telemetryFps.textContent = `${Math.round(fps)} FPS`; }
});

// Update Provider Badges
function updateProviderBadges() {
  const provider = aiService.config.activeProvider.toUpperCase();
  aiProviderLabel.textContent = `ENGINE: ${provider}`;

  const currentEngine = localStorage.getItem('uvision_tts_engine') || 'elevenlabs';
  if (currentEngine === 'browser') {
    ttsProviderLabel.textContent = '🔊 AUDIO: BROWSER_NATIVE';
    ttsProviderLabel.title = 'เสียงสังเคราะห์จากเบราว์เซอร์ในเครื่อง (ฟรี)';
    ttsProviderLabel.style.color = '#10b981';
  } else {
    ttsProviderLabel.textContent = '⚡ AUDIO: ELEVENLABS';
    ttsProviderLabel.title = `กำลังใช้เสียง ElevenLabs AI (Voice ID: ${elevenLabs.voiceId})`;
    ttsProviderLabel.style.color = '#00f2fe';
  }
}

// 1-Click Audio Engine Switcher directly from HUD
ttsProviderLabel.style.cursor = 'pointer';
ttsProviderLabel.addEventListener('click', () => {
  const current = localStorage.getItem('uvision_tts_engine') || 'browser';
  const next = current === 'browser' ? 'elevenlabs' : 'browser';
  localStorage.setItem('uvision_tts_engine', next);
  updateProviderBadges();
  if (next === 'browser') {
    speakAnswer('สลับมาใช้เสียงภาษาไทยแท้เรียบร้อยแล้วครับ เสียงคนไทยแท้ ฟังชัดเจน');
  } else {
    speakAnswer('สลับมาใช้เสียง ElevenLabs AI เรียบร้อยแล้วครับ');
  }
});

// Speech Manager Callbacks
const speech = new SpeechManager({
  lang: currentAppLang,
  onSpeechStart: () => {
    setAppState('LISTENING');
  },
  onSpeechResult: ({ transcript, isFinal }) => {
    activeQuestion = transcript;
    userQuestionEcho.textContent = `"${transcript}"`;
    userQuestionEcho.classList.add('visible');

    if (isFinal) {
      handleUserQuerySubmit(transcript);
    }
  },
  onSpeechEnd: ({ error }) => {
    if (isAwaitingMissionGoal) return;
    if (error && currentState === 'LISTENING') {
      if (activeQuestion.trim()) {
        handleUserQuerySubmit(activeQuestion);
      } else {
        setAppState('IDLE');
        ubotResponseText.textContent = 'ไม่ได้ยินเสียงคำถาม ลองกดปุ่มไมค์ใหม่อีกครั้ง หรือคลิกเลือกคำถามด้านล่างได้ครับ';
      }
    }
  },
  onSpeakStart: () => {
    setAppState('SPEAKING');
  },
  onSpeakEnd: () => {
    setAppState('IDLE');
  }
});

// Update UI State Machine
function setAppState(state) {
  currentState = state;
  ubotOrbWrapper.className = 'ubot-orb-wrapper';
  btnPtt.classList.remove('recording');
  soundwaveBar.classList.remove('active');

  switch (state) {
    case 'LISTENING':
      ubotOrbWrapper.classList.add('listening');
      btnPtt.classList.add('recording');
      statusBadge.textContent = 'กำลังฟัง...';
      statusBadge.style.color = '#f59e0b';
      pttHelperText.textContent = 'กำลังฟังเสียงของคุณ... (ปล่อยหรือพูดเสร็จเพื่อส่งคำถาม)';
      break;

    case 'THINKING':
      ubotOrbWrapper.classList.add('thinking');
      statusBadge.textContent = 'กำลังประมวลผล...';
      statusBadge.style.color = '#8b5cf6';
      pttHelperText.textContent = 'VisionBot กำลังวิเคราะห์ภาพและคำถาม...';
      break;

    case 'SPEAKING':
      ubotOrbWrapper.classList.add('speaking');
      soundwaveBar.classList.add('active');
      statusBadge.textContent = 'กำลังตอบ...';
      statusBadge.style.color = '#00f2fe';
      pttHelperText.textContent = 'VisionBot กำลังพูดตอบกลับ...';
      break;

    case 'IDLE':
    default:
      statusBadge.textContent = 'พร้อมรับคำสั่ง';
      statusBadge.style.color = '#10b981';
      pttHelperText.textContent = '[กดปุ่มไมค์เพื่อจับภาพมุมมองและพูดถาม VisionBot]';
      break;
  }
}

// Flash effect on camera shutter
function triggerShutterFlash() {
  playCaptureSound();
  shutterFlash.classList.add('active');
  setTimeout(() => {
    shutterFlash.classList.remove('active');
  }, 100);
}

// Capture current frame from live camera or custom image
function captureFrameSnapshot() {
  triggerShutterFlash();
  currentCapturedFrame = camera.captureFrame(0); // native resolution, no downscale

  // Update thumbnail badge in HUD
  snapshotThumb.src = currentCapturedFrame.dataUrl;
  snapshotResolution.textContent = `${currentCapturedFrame.width}x${currentCapturedFrame.height}`;
  snapshotBadge.classList.add('active');

  return currentCapturedFrame;
}

// Submit Question + Frame to VisionBot
async function handleUserQuerySubmit(questionText) {
  const trimmed = (questionText || '').trim();
  if (!trimmed) return;

  // 1. If system was actively waiting for a walking destination:
  if (isAwaitingMissionGoal) {
    isAwaitingMissionGoal = false;
    clearTimeout(missionPromptTimer);
    missionPromptTimer = null;
    currentNavigationMission = trimmed;
    const isEn = currentAppLang === 'en-US';
    const ack = isEn ? `Mission set: ${currentNavigationMission}. Starting guide...` : `รับทราบครับ กำลังพานำทาง${currentNavigationMission}...`;
    ubotResponseText.textContent = ack;
    statusBadge.textContent = isEn ? `🚶‍♂️ ${currentNavigationMission}` : `🚶‍♂️ ${currentNavigationMission}`;
    await speakAnswer(ack);
    setTimeout(runWalkingGuideStep, 1000);
    return;
  }

  // 2. Check if user's spoken query is a walking navigation command
  const isNavIntent = /(พาไป|นำทาง|เดินไป|พาเดิน|อยากไป|ไปที่|เดินตรง|พาผมไป|พาฉันไป|walk to|guide me|navigate to|go to)/i.test(trimmed);
  if (isNavIntent) {
    toggleWalkingMode(true, trimmed);
    return;
  }

  if (!currentCapturedFrame) {
    captureFrameSnapshot();
  }

  setAppState('THINKING');
  playThinkingSound();

  userQuestionEcho.textContent = `"${trimmed}"`;
  userQuestionEcho.classList.add('visible');
  ubotResponseText.textContent = 'กำลังวิเคราะห์มุมมองและตอบคำถาม...';

  try {
    const result = await aiService.askUbot({
      imageBase64: currentCapturedFrame.base64Data,
      question: questionText,
      mimeType: currentCapturedFrame.mimeType,
      detections: hub.getDetectionsSummary()
    });

    playResponseSound();
    ubotResponseText.textContent = result.text;
    statusBadge.textContent = result.provider;

    // Speak response using ElevenLabs (with Native TTS fallback)
    await speakAnswer(result.text);

  } catch (err) {
    console.error('Failed to get answer:', err);
    setAppState('IDLE');
    ubotResponseText.textContent = 'เกิดข้อผิดพลาดในการเชื่อมต่อ กรุณาลองใหม่อีกครั้ง';
  }
}

// Audio playback: Transparently routes to chosen engine
async function speakAnswer(text) {
  setAppState('SPEAKING');

  const engine = localStorage.getItem('uvision_tts_engine') || 'browser';
  console.log(`[TTS Engine Dispatch] Active engine: "${engine}", Text: "${text}"`);

  if (engine === 'browser') {
    console.log('[TTS] Mode: BROWSER_NATIVE (No ElevenLabs credits consumed).');
    speech.speak(text);
    return;
  }

  // ElevenLabs mode (with automatic browser TTS fallback if unconfigured or quota/network fails)
  if (!elevenLabs.isUsable()) {
    console.log('[TTS] ElevenLabs not configured, falling back to Browser Native TTS.');
    speech.speak(text);
    return;
  }

  console.log(`[TTS] Mode: ELEVENLABS_API (${text.length} chars, Voice: ${elevenLabs.voiceId})...`);
  ttsProviderLabel.textContent = '⏳ AUDIO: ELEVENLABS...';
  ttsProviderLabel.style.color = '#f59e0b';

  const res = await elevenLabs.speak(text, {
    onStart: () => {
      setAppState('SPEAKING');
      ttsProviderLabel.textContent = '⚡ AUDIO: ELEVENLABS';
      ttsProviderLabel.style.color = '#00f2fe';
    },
    onEnd: () => {
      setAppState('IDLE');
      ttsProviderLabel.textContent = '⚡ AUDIO: ELEVENLABS';
      ttsProviderLabel.style.color = '#00f2fe';
    },
    onError: () => {
      speech.speak(text);
    }
  });

  if (!res.success) {
    console.warn('⚠️ [ElevenLabs Fallback -> Browser TTS]:', res.reason || res.error);
    ttsProviderLabel.textContent = '🔊 AUDIO: BROWSER_FALLBACK';
    ttsProviderLabel.style.color = '#10b981';
    speech.speak(text);
  }
}

// Stop all ongoing speech and sound
function stopAllSpeech() {
  speech.stopSpeaking();
  if (elevenLabs && elevenLabs.stop) {
    elevenLabs.stop();
  }
  setAppState('IDLE');
}

// Language Toggle Handler
function toggleAppLanguage(forcedLang) {
  currentAppLang = forcedLang || (currentAppLang === 'th-TH' ? 'en-US' : 'th-TH');
  localStorage.setItem('uvision_lang', currentAppLang);

  speech.setLanguage(currentAppLang);

  if (langLabel) {
    langLabel.textContent = currentAppLang === 'en-US' ? 'EN' : 'TH';
  }

  if (currentAppLang === 'en-US') {
    pttHelperText.textContent = '[Press mic to talk | Double-tap screen for Walk Mode]';
    if (walkModeLabel) walkModeLabel.textContent = isWalkingMode ? 'WALK: ON' : 'WALK: OFF';
    speakAnswer('Switched to English. VisionBot is ready.');
  } else {
    pttHelperText.textContent = '[กดปุ่มไมค์เพื่อพูดคุย | แตะจอ 2 ครั้งเพื่อเปิด/ปิดโหมดเดินนำทาง]';
    if (walkModeLabel) walkModeLabel.textContent = isWalkingMode ? 'โหมดเดิน: เปิด' : 'โหมดเดิน: ปิด';
    speakAnswer('เปลี่ยนเป็นภาษาไทยแล้วครับ วิชั่นบอทพร้อมรับคำสั่ง');
  }
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Active Walking Navigation System
//  - Primary Brain: Gemini 3.1 Flash-Lite continuously evaluates native 1080p POV
//    snapshots every ~1.5 - 2.0 seconds, providing 1 short actionable navigation command.
//  - Safety Net / Emergency Brake: Local TFJS COCO-SSD detector runs silently in the background
//    to catch sudden rapid movement or immediate < 0.5m collision hazards between snapshots.
// ---------------------------------------------------------------------------

const TH_LABELS = {
  person: 'คน',
  chair: 'เก้าอี้',
  couch: 'โซฟา',
  'dining table': 'โต๊ะ',
  bench: 'ม้านั่ง',
  bed: 'เตียง',
  'potted plant': 'กระถางต้นไม้',
  'fire hydrant': 'หัวดับเพลิง',
  'stop sign': 'ป้ายหยุด',
  'traffic light': 'สัญญาณไฟ',
  'parking meter': 'เสามิเตอร์',
  bicycle: 'จักรยาน',
  motorcycle: 'มอเตอร์ไซค์',
  car: 'รถยนต์',
  bus: 'รถบัส',
  truck: 'รถบรรทุก',
  dog: 'สุนัข',
  cat: 'แมว',
  suitcase: 'กระเป๋าเดินทาง',
  backpack: 'กระเป๋าเป้',
  umbrella: 'ร่ม',
  box: 'กล่อง',
  refrigerator: 'ตู้'
};

let walkingLoopTimer = null;
let missionPromptTimer = null;
let isWalkingStepActive = false;
let isAwaitingMissionGoal = false;
let currentNavigationMission = '';
let lastEmergencyAlertAt = 0;
const EMERGENCY_COOLDOWN_MS = 2500;

// Path A: Emergency Brake (local detector catches sudden movement/intrusion between snapshots)
function handleScene({ emergency }) {
  if (!isWalkingMode || !emergency) return;
  const now = Date.now();
  if (now - lastEmergencyAlertAt < EMERGENCY_COOLDOWN_MS) return;
  lastEmergencyAlertAt = now;

  // Interrupt TTS immediately for safety
  stopAllSpeech();
  triggerHaptic([300, 100, 300, 100, 500]);
  playHazardAlertSound();

  if (viewportContainer) {
    viewportContainer.classList.add('hazard-detected');
    setTimeout(() => viewportContainer.classList.remove('hazard-detected'), 1500);
  }

  const isEn = currentAppLang === 'en-US';
  const thName = TH_LABELS[emergency.label] || emergency.label || 'สิ่งกีดขวาง';
  const alertMsg = isEn
    ? (emergency.suddenMotion ? `Watch out! Sudden movement ahead: ${emergency.label}!` : `Stop! ${emergency.label} right ahead!`)
    : (emergency.suddenMotion ? `ระวัง! มี${thName}เคลื่อนไหวตัดหน้า หยุดก่อน` : `หยุดก่อน! มี${thName}อยู่ตรงหน้ากระทันหัน`);

  ubotResponseText.textContent = alertMsg;
  speakAnswer(alertMsg);
}

// Path B: Goal-Oriented Mission Navigation Step
async function runWalkingGuideStep() {
  if (!isWalkingMode || isWalkingStepActive || isAwaitingMissionGoal || document.hidden) return;
  if (currentState === 'LISTENING') return; // User is speaking via push-to-talk
  if (!hub.isLive() && !camera.isUsingCustomImage) return;

  isWalkingStepActive = true;
  try {
    const frame = hub.getNativeSnapshot();
    const isEn = currentAppLang === 'en-US';
    const mission = currentNavigationMission || (isEn ? 'Walk straight ahead safely' : 'เดินตรงไปข้างหน้าอย่างปลอดภัย');

    const query = isEn
      ? `User's Navigation Mission: "${mission}". Carefully inspect floor path and clearance. Output 1 direct imperative action (< 12 words) telling user what to do next. If destination is reached, say: "Mission complete, arrived at destination."`
      : `ภารกิจนำทางของผู้ใช้: "${mission}"\nจงดูภาพและลานพื้นทางเดินตรงหน้า บอกคำสั่งปฏิบัติการ 1 ประโยคสั้นมาก (< 12 คำ) บอกชัดเจนว่าให้คนทำอะไรเพื่อมุ่งหน้าสู่เป้าหมาย (เช่น "ทางตรงหน้าโล่ง เดินตรงไปได้ 3 ก้าวครับ", "มีเก้าอี้ตรงหน้า ให้เบี่ยงซ้าย 1 ก้าว", "ข้างหน้าติดกำแพง ให้หันขวา 90 องศา") หากพามาถึงเป้าหมายแล้ว ให้บอกว่า "ถึงเป้าหมายเรียบร้อยแล้วครับ ภารกิจเสร็จสิ้น"`;

    statusBadge.textContent = isEn ? `🚶‍♂️ ${mission}` : `🚶‍♂️ ${mission}`;

    const result = await aiService.askUbot({
      imageBase64: frame.base64Data,
      question: query,
      mimeType: frame.mimeType,
      mode: 'walking',
      detections: hub.getDetectionsSummary()
    });

    if (!isWalkingMode || isAwaitingMissionGoal) return;

    if (result && result.text) {
      const guidance = result.text.trim();
      ubotResponseText.textContent = guidance;
      if (viewportContainer) viewportContainer.classList.remove('hazard-detected');
      await speakAnswer(guidance);

      // Check if mission reached completion
      const isCompleted = /ถึงเป้าหมาย|ภารกิจเสร็จสิ้น|mission complete|arrived at destination/i.test(guidance);
      if (isCompleted) {
        triggerHaptic([100, 50, 100, 50, 300]);
        playResponseSound();
        statusBadge.textContent = isEn ? '✅ MISSION COMPLETE' : '✅ สำเร็จภารกิจ';
        setTimeout(() => {
          if (isWalkingMode) toggleWalkingMode(false);
        }, 2800);
        return;
      }

      // Step-aware pacing: adapt next evaluation delay to how many steps human needs to walk
      const stepMatch = guidance.match(/(\d+)\s*ก้าว/) || guidance.match(/(\d+)\s*step/i);
      const steps = stepMatch ? parseInt(stepMatch[1], 10) : 2;
      const walkPacingDelay = Math.max(1800, steps * 800 + 1200);

      clearTimeout(walkingLoopTimer);
      walkingLoopTimer = setTimeout(runWalkingGuideStep, walkPacingDelay);
    }
  } catch (err) {
    console.warn('Walking guide step error:', err);
    if (isWalkingMode) {
      clearTimeout(walkingLoopTimer);
      walkingLoopTimer = setTimeout(runWalkingGuideStep, 2000);
    }
  } finally {
    isWalkingStepActive = false;
  }
}

function toggleWalkingMode(forceState, targetMission) {
  isWalkingMode = typeof forceState === 'boolean' ? forceState : !isWalkingMode;

  clearTimeout(walkingLoopTimer);
  clearTimeout(missionPromptTimer);
  walkingLoopTimer = null;
  missionPromptTimer = null;
  isWalkingStepActive = false;

  if (btnToggleWalkMode) {
    btnToggleWalkMode.classList.toggle('active', isWalkingMode);
    btnToggleWalkMode.setAttribute('aria-pressed', isWalkingMode ? 'true' : 'false');
  }
  if (walkModeLabel) {
    if (currentAppLang === 'en-US') {
      walkModeLabel.textContent = isWalkingMode ? 'WALK: ON' : 'WALK: OFF';
    } else {
      walkModeLabel.textContent = isWalkingMode ? 'โหมดเดิน: เปิด' : 'โหมดเดิน: ปิด';
    }
  }
  if (viewportContainer) {
    viewportContainer.classList.toggle('walking-active', isWalkingMode);
    viewportContainer.classList.remove('hazard-detected');
  }

  if (isWalkingMode) {
    playChirpSound();
    triggerHaptic([150, 80, 150]);

    if (targetMission) {
      // Direct mission received via voice command
      isAwaitingMissionGoal = false;
      currentNavigationMission = targetMission;
      const isEn = currentAppLang === 'en-US';
      const ack = isEn ? `Starting mission: ${currentNavigationMission}...` : `รับทราบครับ กำลังพานำทาง${currentNavigationMission}...`;
      statusBadge.textContent = isEn ? `🚶‍♂️ ${currentNavigationMission}` : `🚶‍♂️ ${currentNavigationMission}`;
      ubotResponseText.textContent = ack;
      speakAnswer(ack);
      setTimeout(runWalkingGuideStep, 1200);
    } else {
      // Solicit navigation goal from the user
      isAwaitingMissionGoal = true;
      statusBadge.textContent = currentAppLang === 'en-US' ? '🚶‍♂️ AWAITING MISSION' : '🚶‍♂️ รอรับคำสั่งเป้าหมาย';
      const promptMsg = currentAppLang === 'en-US'
        ? 'Navigation ready. State your destination, such as to the door, or straight ahead.'
        : 'โหมดนำทางพร้อมแล้วครับ บอกเป้าหมายได้เลย เช่น "พาไปที่ประตู" หรือ "พาเดินตรงไปข้างหน้า" ครับ';
      ubotResponseText.textContent = promptMsg;
      speakAnswer(promptMsg);

      // Open mic to listen for the user's destination
      setTimeout(() => {
        if (isWalkingMode && isAwaitingMissionGoal) {
          speech.startListening();
        }
      }, 1200);

      // Auto-fallback: if user stays silent for 6s, default to walking straight ahead
      missionPromptTimer = setTimeout(() => {
        if (isWalkingMode && isAwaitingMissionGoal) {
          isAwaitingMissionGoal = false;
          currentNavigationMission = currentAppLang === 'en-US' ? 'Walk straight ahead safely' : 'เดินตรงไปข้างหน้าอย่างปลอดภัย';
          const startMsg = currentAppLang === 'en-US' ? 'Starting: Walk straight ahead...' : 'เริ่มภารกิจ: นำทางเดินตรงไปข้างหน้าครับ';
          ubotResponseText.textContent = startMsg;
          statusBadge.textContent = currentAppLang === 'en-US' ? '🚶‍♂️ WALK STRAIGHT' : '🚶‍♂️ เดินตรงไป';
          speakAnswer(startMsg);
          setTimeout(runWalkingGuideStep, 1000);
        }
      }, 6500);
    }
  } else {
    isAwaitingMissionGoal = false;
    currentNavigationMission = '';
    stopAllSpeech();
    playResponseSound();
    triggerHaptic([100]);
    statusBadge.textContent = currentAppLang === 'en-US' ? 'READY' : 'พร้อมรับคำสั่ง';
    const stopMsg = currentAppLang === 'en-US' ? 'Walking mode deactivated.' : 'ปิดโหมดเดินนำทางแล้วครับ';
    ubotResponseText.textContent = stopMsg;
    speakAnswer(stopMsg);
  }
}

// Push-To-Talk Toggle
async function triggerPtt() {
  if (currentState === 'LISTENING') {
    speech.stopListening();
    if (activeQuestion.trim()) {
      handleUserQuerySubmit(activeQuestion);
    } else {
      setAppState('IDLE');
    }
  } else {
    // Snap frame immediately upon pressing talk!
    captureFrameSnapshot();
    playChirpSound();
    activeQuestion = '';
    userQuestionEcho.textContent = '';
    const res = await speech.startListening();
    if (!res.supported) {
      if (res.reason === 'unsupported_browser') {
        ubotResponseText.textContent = 'เบราว์เซอร์นี้ไม่รองรับการแปลงเสียงพูด แนะนำให้เปิดด้วย Google Chrome หรือ Microsoft Edge นะครับ';
      }
      const defaultQuestion = currentAppLang === 'en-US' ? 'What is in front of me? Any hazards?' : 'นี่คืออะไร มีจุดไหนต้องระวังไหม?';
      const manualPrompt = prompt(currentAppLang === 'en-US' ? 'Enter question for U-bot (or use Chrome for voice):' : 'พิมพ์คำถามถึง Ubot สำหรับภาพนี้ (หรือใช้ Chrome/Edge เพื่อพูดได้โดยตรง):', defaultQuestion);
      if (manualPrompt) {
        handleUserQuerySubmit(manualPrompt);
      }
    }
  }
}

btnPtt.addEventListener('click', triggerPtt);

if (btnToggleWalkMode) {
  btnToggleWalkMode.addEventListener('click', () => toggleWalkingMode());
}

if (btnToggleLang) {
  btnToggleLang.addEventListener('click', () => toggleAppLanguage());
}

if (btnStopSpeaking) {
  btnStopSpeaking.addEventListener('click', stopAllSpeech);
}

// Blind-Friendly Full Screen Double-Tap & Gestures
document.addEventListener('touchend', (e) => {
  // If user tapped a button, form input, or link, don't trigger global gesture
  if (e.target.closest('button, input, select, textarea, .fail-safe-drawer, .settings-modal')) {
    return;
  }
  const now = Date.now();
  if (now - lastTapTimestamp < 380) {
    // Double tap detected!
    toggleWalkingMode();
    lastTapTimestamp = 0;
  } else {
    lastTapTimestamp = now;
  }
});

// Keyboard Accessibility Shortcuts
window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

  if (e.code === 'Space') {
    e.preventDefault();
    triggerPtt();
  } else if (e.key === 'w' || e.key === 'W') {
    e.preventDefault();
    toggleWalkingMode();
  } else if (e.key === 'l' || e.key === 'L') {
    e.preventDefault();
    toggleAppLanguage();
  } else if (e.key === 'Escape') {
    e.preventDefault();
    stopAllSpeech();
  }
});

// Quick Action Chips (Instant 1-Click with live snapshot)
function setupQuickChip(btn, question) {
  btn.addEventListener('click', () => {
    captureFrameSnapshot();
    handleUserQuerySubmit(question);
  });
}

setupQuickChip(chipIdentify, 'นี่คืออะไร ช่วยอธิบายให้ฟังหน่อย');
setupQuickChip(chipAllergy, 'อันนี้กินได้ไหม มีสารก่อภูมิแพ้หรือแคลอรีเท่าไร?');
setupQuickChip(chipHardware, 'พอร์ตตรงนี้คืออะไร ต้องเสียบสายไหน?');
setupQuickChip(chipTranslate, 'แปลข้อความในมุมมองนี้ให้ฟังหน่อย');

// Camera Controls
btnFlipCamera.addEventListener('click', async () => {
  camStatusLabel.textContent = 'CONNECTING CAM...';
  const res = await camera.flipCamera();
  if (res.success) {
    customImageView.style.display = 'none';
    videoEl.style.display = 'block';
    camStatusLabel.textContent = 'STATUS: ONLINE';
    ubotResponseText.textContent = 'เชื่อมต่อกล้องสำเร็จแล้วครับ';
  } else {
    camStatusLabel.textContent = 'CAM: OFFLINE';
    if (res.error) ubotResponseText.textContent = res.error;
  }
});

btnUploadImage.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (evt) => {
    const dataUrl = evt.target.result;
    await camera.setCustomImage(dataUrl);
    customImageView.src = dataUrl;
    customImageView.style.display = 'block';
    videoEl.style.display = 'none';
    camStatusLabel.textContent = `IMAGE: ${file.name.slice(0, 16)}`;
    captureFrameSnapshot();
  };
  reader.readAsDataURL(file);
});

// Fail-Safe Scenarios (Stage Presentation Mode)
function triggerScenario(index) {
  const scenario = PRESET_SCENARIOS[index];
  if (!scenario) return;

  scenariosBackdrop.classList.remove('open');

  // Load Scenario Mock View
  camera.setCustomImage(scenario.imageUrl).then(() => {
    customImageView.src = scenario.imageUrl;
    customImageView.style.display = 'block';
    videoEl.style.display = 'none';
    camStatusLabel.textContent = `MOCK: ${scenario.badge}`;
    
    // Simulate Instant Smart Glasses Response
    captureFrameSnapshot();
    userQuestionEcho.textContent = `"${scenario.userQuestion}"`;
    userQuestionEcho.classList.add('visible');
    ubotResponseText.textContent = scenario.ubotResponse;
    statusBadge.textContent = 'Fail-Safe Demo Mode';

    playResponseSound();
    speakAnswer(scenario.ubotResponse);
  });
}

demoScenario1.addEventListener('click', () => triggerScenario(0));
demoScenario2.addEventListener('click', () => triggerScenario(1));
demoScenario3.addEventListener('click', () => triggerScenario(2));

btnResetToLiveCam.addEventListener('click', async () => {
  scenariosBackdrop.classList.remove('open');
  customImageView.style.display = 'none';
  videoEl.style.display = 'block';
  camStatusLabel.textContent = 'STATUS: LIVE CAM';
  await camera.initCamera();
});

btnOpenScenarios.addEventListener('click', () => scenariosBackdrop.classList.add('open'));
btnCloseScenarios.addEventListener('click', () => scenariosBackdrop.classList.remove('open'));
scenariosBackdrop.addEventListener('click', (e) => {
  if (e.target === scenariosBackdrop) scenariosBackdrop.classList.remove('open');
});

// Settings Modal
const PRESET_VOICE_IDS = ['H9eYlNHpm1vah6PPgYAk', 'FaUQoAqt8WX5mfvrvb3A', 'B4NdgwdU97lHqA8Udh2D', 'nPczCjzI2devNBz1zQrb', 'EXAVITQu4vr4xnSDxMaL'];
let fetchedAccountVoices = false;

function syncVoicePresetUI(voiceId) {
  const currentEngine = localStorage.getItem('uvision_tts_engine') || 'elevenlabs';
  settingTtsEngine.value = currentEngine;
  groupBrowserThaiVoices.style.display = currentEngine === 'browser' ? 'block' : 'none';
  groupElevenLabsOptions.style.display = currentEngine === 'elevenlabs' ? 'block' : 'none';

  // Populate Browser Native Thai voice dropdown
  const thaiVoices = speech.getAvailableThaiVoices();
  settingThaiVoiceSelect.innerHTML = '<option value="auto">✨ อัตโนมัติ (เลือกเสียงคนไทยที่ชัดและเป็นธรรมชาติที่สุด)</option>';
  const activeVoiceName = localStorage.getItem('uvision_preferred_thai_voice') || 'auto';

  thaiVoices.forEach(v => {
    const opt = document.createElement('option');
    opt.value = v.name;
    let label = v.name;
    if (v.name.includes('Niwat')) label = '🇹🇭 คุณนิวัติ (เสียงผู้ชาย - Microsoft Natural Thai)';
    else if (v.name.includes('Premwadee')) label = '🇹🇭 คุณเปรมวดี (เสียงผู้หญิง - Microsoft Natural Thai)';
    else if (v.name.includes('Google')) label = '🇹🇭 Google ภาษาไทย';
    opt.textContent = label;
    if (v.name === activeVoiceName) opt.selected = true;
    settingThaiVoiceSelect.appendChild(opt);
  });

  if (PRESET_VOICE_IDS.includes(voiceId)) {
    settingElevenLabsPreset.value = voiceId;
    groupCustomVoiceId.style.display = 'none';
  } else {
    settingElevenLabsPreset.value = 'custom';
    groupCustomVoiceId.style.display = currentEngine === 'elevenlabs' ? 'block' : 'none';
  }
  settingElevenLabsVoiceId.value = voiceId;
}

settingTtsEngine.addEventListener('change', () => {
  const isBrowser = settingTtsEngine.value === 'browser';
  groupBrowserThaiVoices.style.display = isBrowser ? 'block' : 'none';
  groupElevenLabsOptions.style.display = isBrowser ? 'none' : 'block';
});

settingThaiVoiceSelect.addEventListener('change', () => {
  speech.setPreferredThaiVoice(settingThaiVoiceSelect.value);
  updateProviderBadges();
});

settingElevenLabsPreset.addEventListener('change', () => {
  if (settingElevenLabsPreset.value === 'custom') {
    groupCustomVoiceId.style.display = 'block';
    settingElevenLabsVoiceId.focus();
  } else {
    groupCustomVoiceId.style.display = 'none';
    settingElevenLabsVoiceId.value = settingElevenLabsPreset.value;
  }
});

// Load any custom voices added to the user's ElevenLabs account (e.g. Thai community voices)
async function loadAccountVoices() {
  if (fetchedAccountVoices) return;
  try {
    let voices = [];
    // 1. Try Direct fetch to ElevenLabs voices API
    try {
      const directRes = await fetch('https://api.elevenlabs.io/v1/voices', {
        headers: { 'xi-api-key': elevenLabs.apiKey }
      });
      if (directRes.ok) {
        const directData = await directRes.json();
        voices = directData.voices || [];
      }
    } catch (e) {
      // Direct CORS blocked, use server fallback
    }

    // 2. If direct didn't work, try server
    if (voices.length === 0) {
      const res = await fetch('/api/voices');
      if (res.ok) {
        const data = await res.json();
        voices = data.voices || [];
      }
    }

    if (voices.length > 0) {
      console.log('ElevenLabs account voices found:', voices.map(v => `${v.name} (${v.voice_id})`));
      const userVoices = voices.filter(v => !['21m00Tcm4TlvDq8ikWAM', ...PRESET_VOICE_IDS].includes(v.voice_id));
      userVoices.forEach(v => {
        const opt = document.createElement('option');
        opt.value = v.voice_id;
        const tag = (v.labels?.language === 'th' || v.labels?.accent === 'thai' || /thai|ไทย/i.test(v.name)) ? ' 🇹🇭 [เสียงไทย]' : '';
        opt.textContent = `👤 ${v.name}${tag} (จากบัญชีคุณ)`;
        settingElevenLabsPreset.insertBefore(opt, settingElevenLabsPreset.firstChild);
      });
      fetchedAccountVoices = true;
    }
  } catch (e) {
    console.warn('Could not load account voices:', e);
  }
}

btnTestVoice.addEventListener('click', async () => {
  btnTestVoice.disabled = true;
  btnTestVoice.textContent = '⏳ กำลังสร้างเสียงทดสอบ...';

  const testText = 'สวัสดีครับ ผม VisionBot ระบบนำทางอัจฉริยะ เสียงนี้ฟังชัดเจนและเข้าใจง่ายไหมครับ';

  // If user selected Browser Native Thai
  if (settingTtsEngine.value === 'browser') {
    speech.speak(testText);
    setTimeout(() => {
      btnTestVoice.disabled = false;
      btnTestVoice.textContent = '🔊 ทดสอบฟังเสียงนี้';
    }, 2000);
    return;
  }

  // ElevenLabs test
  const chosenVoice = (settingElevenLabsPreset.value === 'custom')
    ? settingElevenLabsVoiceId.value.trim()
    : settingElevenLabsPreset.value;

  const testKey = settingElevenLabsKey.value.trim() || elevenLabs.apiKey;

  try {
    const res = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: testText,
        voiceId: chosenVoice,
        apiKey: testKey
      })
    });

    if (res.ok) {
      const blob = await res.blob();
      const audio = new Audio(URL.createObjectURL(blob));
      btnTestVoice.textContent = '🔊 กำลังเล่นเสียง ElevenLabs (ตัดเครดิตแล้ว)...';
      audio.onended = () => {
        btnTestVoice.disabled = false;
        btnTestVoice.textContent = '🔊 ทดสอบฟังเสียงนี้';
      };
      await audio.play();
    } else {
      const errText = await res.text();
      btnTestVoice.disabled = false;
      btnTestVoice.textContent = `❌ ElevenLabs ผิดพลาด (${res.status})`;
      alert(`❌ การเชื่อมต่อ ElevenLabs ล้มเหลว (HTTP ${res.status}):\n${errText}`);
      setTimeout(() => { btnTestVoice.textContent = '🔊 ทดสอบฟังเสียงนี้'; }, 4000);
    }
  } catch (err) {
    console.error('Test voice error:', err);
    btnTestVoice.disabled = false;
    btnTestVoice.textContent = '❌ เครือข่ายผิดพลาด';
    alert(`❌ เชื่อมต่อ ElevenLabs ไม่ได้:\n${err.message}`);
    setTimeout(() => { btnTestVoice.textContent = '🔊 ทดสอบฟังเสียงนี้'; }, 4000);
  }
});

btnOpenSettings.addEventListener('click', () => {
  settingActiveProvider.value = aiService.config.activeProvider;
  settingUtopiaEndpoint.value = aiService.config.utopiaEndpoint;
  settingUtopiaToken.value = aiService.config.utopiaToken;
  settingElevenLabsKey.value = elevenLabs.apiKey;
  syncVoicePresetUI(elevenLabs.voiceId);
  settingGeminiKey.value = aiService.config.geminiKey;
  loadAccountVoices();
  settingsModal.classList.add('open');
});

btnCloseSettings.addEventListener('click', () => settingsModal.classList.remove('open'));
settingsModal.addEventListener('click', (e) => {
  if (e.target === settingsModal) settingsModal.classList.remove('open');
});

btnSaveSettings.addEventListener('click', () => {
  aiService.saveConfig({
    activeProvider: settingActiveProvider.value,
    utopiaEndpoint: settingUtopiaEndpoint.value.trim(),
    utopiaToken: settingUtopiaToken.value.trim(),
    geminiKey: settingGeminiKey.value.trim()
  });

  const finalEngine = settingTtsEngine.value;
  localStorage.setItem('uvision_tts_engine', finalEngine);

  const finalVoiceId = (settingElevenLabsPreset.value === 'custom')
    ? (settingElevenLabsVoiceId.value.trim() || DEFAULT_ELEVEN_VOICE)
    : settingElevenLabsPreset.value;

  elevenLabs.setCredentials(settingElevenLabsKey.value.trim(), finalVoiceId);
  localStorage.setItem('uvision_eleven_key', settingElevenLabsKey.value.trim());
  localStorage.setItem('uvision_eleven_voice', finalVoiceId);

  updateProviderBadges();
  elevenLabs.checkAvailability().then(updateProviderBadges);
  settingsModal.classList.remove('open');
  ubotResponseText.textContent = 'บันทึกการตั้งค่าเรียบร้อยแล้วครับ! VisionBot พร้อมทำงาน';
});

// Live Telemetry Clock
setInterval(() => {
  const d = new Date();
  telemetryTime.textContent = d.toTimeString().split(' ')[0];
}, 1000);

// Initialize App
async function initApp() {
  if (!localStorage.getItem('uvision_tts_engine')) {
    localStorage.setItem('uvision_tts_engine', 'elevenlabs');
  }

  // Ensure default native Thai male voice (Ekkarat) if none or legacy foreign voice was saved
  const savedVoice = localStorage.getItem('uvision_eleven_voice');
  if (!savedVoice || savedVoice === '21m00Tcm4TlvDq8ikWAM' || savedVoice === 'nPczCjzI2devNBz1zQrb') {
    localStorage.setItem('uvision_eleven_voice', DEFAULT_ELEVEN_VOICE);
    elevenLabs.voiceId = DEFAULT_ELEVEN_VOICE;
  }

  // Query server config (uses server's .env securely)
  try {
    const cfgRes = await fetch('/api/config');
    if (cfgRes.ok) {
      const cfg = await cfgRes.json();
      elevenLabs.serverConfigured = Boolean(cfg.isConfigured);
      if (!localStorage.getItem('uvision_eleven_voice') && cfg.thaiVoice && cfg.thaiVoice.voiceId) {
        elevenLabs.voiceId = cfg.thaiVoice.voiceId;
        localStorage.setItem('uvision_eleven_voice', cfg.thaiVoice.voiceId);
      }
      console.log(`🎙️ Active ElevenLabs Thai voice: ${elevenLabs.voiceId} (Server Key Configured: ${elevenLabs.serverConfigured})`);
    }
  } catch (e) {
    // Silently continue
  }

  updateProviderBadges();
  // Startup probe: use ElevenLabs only if reachable & key valid, else browser TTS
  elevenLabs.checkAvailability().then(updateProviderBadges);
  hub.connectMcpBridge();
  const camResult = await camera.initCamera();
  if (!camResult.success) {
    camStatusLabel.textContent = 'CAM: OFFLINE / MOCK';
    if (camResult.error) {
      ubotResponseText.textContent = camResult.error;
    }
    // Fall back to showing scenario 1 as default background image
    await camera.setCustomImage(PRESET_SCENARIOS[0].imageUrl);
    customImageView.src = PRESET_SCENARIOS[0].imageUrl;
    customImageView.style.display = 'block';
    videoEl.style.display = 'none';
  } else {
    camStatusLabel.textContent = 'STATUS: ONLINE';
    customImageView.style.display = 'none';
    videoEl.style.display = 'block';
  }

  // Path A: load local detector in the background, then run continuously
  detector.load().then((r) => {
    if (r.success) {
      detector.start();
    } else {
      console.warn('Local detection unavailable (walk-mode obstacle alerts disabled):', r.error);
      if (telemetryFps) telemetryFps.textContent = 'DETECT: OFF';
    }
  });
}

initApp();
