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
  currentCapturedFrame = camera.captureFrame(768, 0.74);

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
    const ack = isEn ? `Mission set: ${currentNavigationMission}. Starting guide.` : `รับทราบครับ กำลังพานำทาง${currentNavigationMission}`;
    ubotResponseText.textContent = ack;
    statusBadge.textContent = isEn ? `🚶‍♂️ ${currentNavigationMission}` : `🚶‍♂️ ${currentNavigationMission}`;
    await speakAnswer(ack);
    if (isWalkingMode) {
      clearTimeout(walkingLoopTimer);
      walkingLoopTimer = setTimeout(runWalkingGuideStep, 1200);
    }
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

  // Pause Walk Mode loop while answering the user's explicit question, then resume afterwards
  const pauseWalkSessionId = ++walkingSessionId;
  clearTimeout(walkingLoopTimer);
  walkingLoopTimer = null;

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
  } finally {
    // Clear captured frame so next query always takes a fresh snapshot
    currentCapturedFrame = null;
    // If user was in Walk Mode, resume guiding after 2.5s
    if (isWalkingMode && !isAwaitingMissionGoal && pauseWalkSessionId === walkingSessionId) {
      statusBadge.textContent = `🚶‍♂️ ${currentNavigationMission || 'กำลังนำทาง'}`;
      clearTimeout(walkingLoopTimer);
      walkingLoopTimer = setTimeout(runWalkingGuideStep, 2500);
    }
  }
}

// Audio playback: Strictly serialized so two voices NEVER play at the same time
let activeSpeechId = 0;

async function speakAnswer(text) {
  if (!text) return;

  // Cancel any previous ongoing speech (both Browser TTS and ElevenLabs) immediately
  const mySpeechId = ++activeSpeechId;
  speech.stopSpeaking();
  if (elevenLabs && elevenLabs.stop) {
    elevenLabs.stop();
  }

  setAppState('SPEAKING');

  const engine = localStorage.getItem('uvision_tts_engine') || 'browser';

  if (engine === 'browser' || !elevenLabs.isUsable()) {
    await speech.speak(text);
    return;
  }

  ttsProviderLabel.textContent = '⏳ AUDIO: ELEVENLABS...';
  ttsProviderLabel.style.color = '#f59e0b';

  const res = await elevenLabs.speak(text, {
    onStart: () => {
      if (mySpeechId === activeSpeechId) {
        setAppState('SPEAKING');
        ttsProviderLabel.textContent = '⚡ AUDIO: ELEVENLABS';
        ttsProviderLabel.style.color = '#00f2fe';
      }
    },
    onEnd: () => {
      if (mySpeechId === activeSpeechId) {
        setAppState('IDLE');
        ttsProviderLabel.textContent = '⚡ AUDIO: ELEVENLABS';
        ttsProviderLabel.style.color = '#00f2fe';
      }
    },
    onError: () => {}
  });

  // Only fall back to Browser TTS if this request wasn't cancelled by a newer speech call
  if (!res.success && !res.cancelled && mySpeechId === activeSpeechId) {
    console.warn('⚠️ [ElevenLabs Fallback -> Browser TTS]:', res.reason || res.error);
    ttsProviderLabel.textContent = '🔊 AUDIO: BROWSER_FALLBACK';
    ttsProviderLabel.style.color = '#10b981';
    await speech.speak(text);
  }
}

// Stop all ongoing speech and sound
function stopAllSpeech() {
  activeSpeechId++;
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
// Active Walking Navigation System
//  - Primary Brain: Gemini evaluates POV snapshots ONLY after the previous
//    spoken instruction has finished playing + a natural walking pause.
//  - Safety Net / Emergency Brake: Local TFJS COCO-SSD detector catches
//    sudden close-range hazards and pauses the normal walking loop while warning.
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
let lastSpokenGuidance = '';
let lastSpokenGuidanceAt = 0;
let walkingSessionId = 0;
const EMERGENCY_COOLDOWN_MS = 6500;

// Path A: Emergency Brake (local detector catches sudden movement/intrusion between snapshots)
async function handleScene({ emergency }) {
  if (!isWalkingMode || isAwaitingMissionGoal || !emergency) return;
  const now = Date.now();
  if (now - lastEmergencyAlertAt < EMERGENCY_COOLDOWN_MS) return;
  lastEmergencyAlertAt = now;

  // Pause scheduled walking step so it doesn't collide with emergency alert
  clearTimeout(walkingLoopTimer);
  walkingLoopTimer = null;
  const sessionAtAlert = ++walkingSessionId;

  // Interrupt TTS immediately for safety
  stopAllSpeech();
  triggerHaptic([300, 100, 300, 100, 500]);
  playHazardAlertSound();

  if (viewportContainer) {
    viewportContainer.classList.add('hazard-detected');
    setTimeout(() => viewportContainer.classList.remove('hazard-detected'), 1800);
  }

  const isEn = currentAppLang === 'en-US';
  const thName = TH_LABELS[emergency.label] || emergency.label || 'สิ่งกีดขวาง';
  const alertMsg = isEn
    ? (emergency.suddenMotion ? `Watch out! ${emergency.label} moving ahead!` : `Stop! ${emergency.label} right ahead!`)
    : (emergency.suddenMotion ? `ระวังครับ มี${thName}เคลื่อนไหวข้างหน้า` : `หยุดก่อนครับ มี${thName}อยู่ข้างหน้า`);

  ubotResponseText.textContent = alertMsg;
  lastSpokenGuidance = alertMsg;
  lastSpokenGuidanceAt = Date.now();
  await speakAnswer(alertMsg);

  // Resume normal walking evaluation after user has heard the warning and had 3.5s to react
  if (isWalkingMode && !isAwaitingMissionGoal && sessionAtAlert === walkingSessionId) {
    clearTimeout(walkingLoopTimer);
    walkingLoopTimer = setTimeout(runWalkingGuideStep, 3500);
  }
}

// Path B: Goal-Oriented Mission Navigation Step
async function runWalkingGuideStep() {
  if (!isWalkingMode || isWalkingStepActive || isAwaitingMissionGoal || document.hidden) return;
  if (currentState === 'LISTENING' || currentState === 'SPEAKING') {
    // Wait until current speech/listening finishes before taking next snapshot
    clearTimeout(walkingLoopTimer);
    walkingLoopTimer = setTimeout(runWalkingGuideStep, 1200);
    return;
  }
  if (!hub.isLive() && !camera.isUsingCustomImage) return;

  isWalkingStepActive = true;
  const stepSessionId = walkingSessionId;

  try {
    const frame = hub.getWalkingSnapshot();
    const isEn = currentAppLang === 'en-US';
    const mission = currentNavigationMission || (isEn ? 'Walk safely' : 'เดินหลบสิ่งกีดขวาง');

    const query = isEn
      ? `Mission: "${mission}". Inspect floor path ahead. Output 1 short action (< 10 words).`
      : `ภารกิจ: "${mission}" ดูทางเดินข้างหน้า ตอบสั้นกระชับ 1 ประโยค (< 10 คำ) ว่าทางโล่งเดินได้กี่ก้าว หรือให้เบี่ยงหลบอะไรทางไหน`;

    statusBadge.textContent = `🚶‍♂️ ${mission}`;

    const result = await aiService.askUbot({
      imageBase64: frame.base64Data,
      question: query,
      mimeType: frame.mimeType,
      mode: 'walking',
      detections: hub.getDetectionsSummary()
    });

    // Abort if walking mode was turned off or interrupted by an emergency alert while Gemini was thinking
    if (!isWalkingMode || isAwaitingMissionGoal || stepSessionId !== walkingSessionId) return;

    if (result && result.text) {
      const guidance = result.text.trim();
      ubotResponseText.textContent = guidance;
      if (viewportContainer) viewportContainer.classList.remove('hazard-detected');

      // Check if mission reached completion
      const isCompleted = /ถึงเป้าหมาย|ภารกิจเสร็จสิ้น|mission complete|arrived at destination/i.test(guidance);
      if (isCompleted) {
        triggerHaptic([100, 50, 100, 50, 300]);
        playResponseSound();
        statusBadge.textContent = isEn ? '✅ MISSION COMPLETE' : '✅ สำเร็จภารกิจ';
        await speakAnswer(guidance);
        if (isWalkingMode) toggleWalkingMode(false);
        return;
      }

      // Avoid repeating the exact same sentence back-to-back within 5.5 seconds
      const now = Date.now();
      const isDuplicate = guidance === lastSpokenGuidance && (now - lastSpokenGuidanceAt < 5500);
      if (!isDuplicate) {
        lastSpokenGuidance = guidance;
        lastSpokenGuidanceAt = now;
        // Wait until TTS audio has COMPLETELY finished playing before starting the next walk timer!
        await speakAnswer(guidance);
      }

      if (!isWalkingMode || isAwaitingMissionGoal || stepSessionId !== walkingSessionId) return;

      // Short post-speech pause (since next Gemini + TTS call takes ~1.8s of network time anyway)
      const stepMatch = guidance.match(/(\d+)\s*ก้าว/) || guidance.match(/(\d+)\s*step/i);
      const steps = stepMatch ? Math.min(4, parseInt(stepMatch[1], 10)) : 2;
      const walkPacingDelay = Math.max(1000, steps * 650);

      clearTimeout(walkingLoopTimer);
      walkingLoopTimer = setTimeout(runWalkingGuideStep, walkPacingDelay);
    }
  } catch (err) {
    console.warn('Walking guide step error:', err);
    if (isWalkingMode && stepSessionId === walkingSessionId) {
      clearTimeout(walkingLoopTimer);
      walkingLoopTimer = setTimeout(runWalkingGuideStep, 2200);
    }
  } finally {
    isWalkingStepActive = false;
  }
}

async function toggleWalkingMode(forceState, targetMission) {
  isWalkingMode = typeof forceState === 'boolean' ? forceState : !isWalkingMode;
  const mySessionId = ++walkingSessionId;

  clearTimeout(walkingLoopTimer);
  clearTimeout(missionPromptTimer);
  walkingLoopTimer = null;
  missionPromptTimer = null;
  isWalkingStepActive = false;
  lastSpokenGuidance = '';
  lastSpokenGuidanceAt = 0;

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
    stopAllSpeech();
    playChirpSound();
    triggerHaptic([150, 80, 150]);

    isAwaitingMissionGoal = false;
    currentNavigationMission = targetMission || (currentAppLang === 'en-US'
      ? 'Walk safely and avoid obstacles'
      : 'เดินหลบสิ่งกีดขวาง');

    statusBadge.textContent = currentAppLang === 'en-US' ? '🚶‍♂️ WALK MODE: ON' : '🚶‍♂️ กำลังนำทาง';
    ubotResponseText.textContent = currentAppLang === 'en-US'
      ? 'Scanning path ahead...'
      : 'กำลังสแกนทางเดินข้างหน้าให้ทันทีครับ...';

    // Start scanning the path IMMEDIATELY (no 5-second intro speech delay!)
    if (mySessionId === walkingSessionId) {
      walkingLoopTimer = setTimeout(runWalkingGuideStep, 50);
    }
  } else {
    isAwaitingMissionGoal = false;
    currentNavigationMission = '';
    speech.stopListening();
    stopAllSpeech();
    playResponseSound();
    triggerHaptic([100]);
    statusBadge.textContent = currentAppLang === 'en-US' ? 'READY' : 'พร้อมรับคำสั่ง';
    const stopMsg = currentAppLang === 'en-US' ? 'Walking mode deactivated.' : 'ปิดโหมดเดินนำทางแล้วครับ';
    ubotResponseText.textContent = stopMsg;
    await speakAnswer(stopMsg);
  }
}

// Unlock mobile audio (iOS Safari / Android Chrome) on first user touch/click anywhere
function unlockMobileAudioOnce() {
  elevenLabs.unlockAudio();
}
window.addEventListener('touchstart', unlockMobileAudioOnce, { once: true, passive: true });
window.addEventListener('click', unlockMobileAudioOnce, { once: true });

// Push-To-Talk Toggle
async function triggerPtt() {
  elevenLabs.unlockAudio();

  if (currentState === 'LISTENING') {
    speech.stopListening();
    if (activeQuestion.trim()) {
      handleUserQuerySubmit(activeQuestion);
    } else {
      setAppState('IDLE');
      if (isWalkingMode) {
        clearTimeout(walkingLoopTimer);
        walkingLoopTimer = setTimeout(runWalkingGuideStep, 1500);
      }
    }
  } else {
    // Pause any ongoing speech or Walk Mode timer while user asks a question
    clearTimeout(walkingLoopTimer);
    walkingLoopTimer = null;
    walkingSessionId++;
    stopAllSpeech();

    // Snap frame immediately upon pressing talk!
    captureFrameSnapshot();
    playChirpSound();
    activeQuestion = '';
    userQuestionEcho.textContent = '';
    const res = await speech.startListening();
    if (!res.supported) {
      const defaultQuestion = currentAppLang === 'en-US' ? 'What is in front of me? Describe in detail.' : 'ตรงหน้านี้คืออะไร ช่วยบอกรายละเอียดหน่อย';
      const manualPrompt = prompt(currentAppLang === 'en-US' ? 'Ask VisionBot about this view:' : 'พิมพ์คำถามถึง VisionBot สำหรับภาพตรงหน้านี้:', defaultQuestion);
      if (manualPrompt) {
        handleUserQuerySubmit(manualPrompt);
      } else if (isWalkingMode) {
        clearTimeout(walkingLoopTimer);
        walkingLoopTimer = setTimeout(runWalkingGuideStep, 1500);
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

setupQuickChip(chipIdentify, 'ตรงหน้านี้คืออะไร ช่วยอธิบายรายละเอียดให้ฟังหน่อย');
setupQuickChip(chipAllergy, 'ทางข้างหน้าโล่งไหม มีสิ่งกีดขวางอะไรต้องระวังบ้าง');
setupQuickChip(chipTranslate, 'อ่านหรือแปลข้อความที่เห็นตรงหน้าให้ฟังหน่อย');
setupQuickChip(chipHardware, 'ช่วยอธิบายสิ่งของและสภาพแวดล้อมรอบตัวในภาพนี้ให้ละเอียดหน่อย');

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
