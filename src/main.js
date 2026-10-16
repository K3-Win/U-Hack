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

  // 2. Check if user's spoken query is a walking navigation command (e.g., "ต้องการไปหน้าเวที", "พาไปประตู")
  const isQuestionIntent = /(คืออะไร|มีอะไร|สีอะไร|อ่าน|แปล|เขียนว่า|เท่าไหร่|เท่าไร|ไหม|มั้ย|หรือเปล่า|อธิบาย|รายละเอียด|what|read|translate|describe)/i.test(trimmed);
  const isNavIntent = !isQuestionIntent && (
    /(พาไป|นำทาง|เดินไป|พาเดิน|อยากไป|ต้องการไป|ไปที่|ไปหน้า|ไปตรง|ไปหา|ช่วยพา|เดินตรง|พาผมไป|พาฉันไป|มุ่งหน้า|ไปทาง|หน้าเวที|ไปเวที|ทางออก|walk to|guide me|navigate to|go to|take me)/i.test(trimmed) ||
    (isWalkingMode && trimmed.length <= 35)
  );
  if (isNavIntent) {
    userQuestionEcho.textContent = `🎯 เป้าหมาย: "${trimmed}"`;
    userQuestionEcho.classList.add('visible');
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

// Audio playback: Strictly serialized + guaranteed timeout so Walk Mode NEVER hangs waiting for audio
let activeSpeechId = 0;

async function speakAnswer(text) {
  if (!text) return;

  const mySpeechId = ++activeSpeechId;
  speech.stopSpeaking();
  if (elevenLabs && elevenLabs.stop) {
    elevenLabs.stop();
  }

  setAppState('SPEAKING');

  const maxWaitMs = Math.max(5500, Math.min(12000, text.length * 160 + 3000));
  const timeoutPromise = new Promise(resolve => setTimeout(resolve, maxWaitMs));

  const runTts = async () => {
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

    if (!res.success && !res.cancelled && mySpeechId === activeSpeechId) {
      console.warn('⚠️ [ElevenLabs Fallback -> Browser TTS]:', res.reason || res.error);
      ttsProviderLabel.textContent = '🔊 AUDIO: BROWSER_FALLBACK';
      ttsProviderLabel.style.color = '#10b981';
      await speech.speak(text);
    }
  };

  try {
    await Promise.race([runTts(), timeoutPromise]);
  } finally {
    if (mySpeechId === activeSpeechId && currentState === 'SPEAKING') {
      setAppState('IDLE');
    }
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
    pttHelperText.textContent = 'แตะไมค์เพื่อถามสิ่งของตรงหน้า • แตะจอ 2 ครั้งเพื่อเปิด/ปิดโหมดเดิน';
    if (walkModeLabel) walkModeLabel.textContent = isWalkingMode ? 'โหมดเดิน: เปิด' : 'โหมดเดิน: ปิด';
    speakAnswer('เปลี่ยนเป็นภาษาไทยแล้วครับ วิชั่นบอทพร้อมรับคำสั่ง');
  }
}

// ---------------------------------------------------------------------------
// Active Walking Navigation System (Continuous Loop + Dynamic Distance)
// ---------------------------------------------------------------------------

let walkingLoopTimer = null;
let missionPromptTimer = null;
let isWalkingStepActive = false;
let isAwaitingMissionGoal = false;
let currentNavigationMission = '';
let lastSpokenGuidance = '';
let lastSpokenGuidanceAt = 0;
let walkingSessionId = 0;
let walkStepCounter = 0;

async function handleScene() {
  // Visual bounding boxes are drawn by detector.js on the canvas without interrupting Walk Mode
}

async function runWalkingGuideStep() {
  if (!isWalkingMode || isAwaitingMissionGoal) return;

  if (isWalkingStepActive || currentState === 'LISTENING') {
    clearTimeout(walkingLoopTimer);
    walkingLoopTimer = setTimeout(runWalkingGuideStep, 800);
    return;
  }

  if (!hub.isLive() && !camera.isUsingCustomImage) {
    clearTimeout(walkingLoopTimer);
    walkingLoopTimer = setTimeout(runWalkingGuideStep, 1000);
    return;
  }

  isWalkingStepActive = true;
  const stepSessionId = walkingSessionId;
  let nextWalkDelayMs = 1300;
  let missionFinished = false;

  try {
    walkStepCounter++;
    const frame = hub.getWalkingSnapshot();
    const isEn = currentAppLang === 'en-US';
    const hasSpecificGoal = Boolean(currentNavigationMission && !/เดินหลบสิ่งกีดขวาง|Walk safely/i.test(currentNavigationMission));
    const missionLabel = currentNavigationMission || (isEn ? 'Walk forward' : 'เดินนำทาง');

    statusBadge.textContent = `🚶‍♂️ ${missionLabel} (#${walkStepCounter})`;

    const prevHint = lastSpokenGuidance ? ` (รอบก่อนหน้าคุณบอกไปว่า: "${lastSpokenGuidance}" ตอนนี้ผู้ใช้เดินขยับมาแล้ว ให้ดูภาพใหม่ล่าสุดนี้แล้วบอกคำสั่งก้าวต่อไปได้เลย)` : '';

    const query = isEn
      ? (hasSpecificGoal
        ? `Target destination: "${currentNavigationMission}". Estimate real distance from the image (if far >5m say 6-10 steps, medium 3-5 steps, close 1-2 steps) and give 1 short walking command (< 14 words) toward "${currentNavigationMission}".${prevHint}`
        : `Guide the user walking forward along the open path. Estimate real distance (1-2 steps if close, 3-5 medium, 6-10 if far clear corridor) in 1 short sentence.${prevHint}`)
      : (hasSpecificGoal
        ? `จุดหมายที่ต้องการเดินไป: "${currentNavigationMission}"${prevHint} ดูภาพใหม่นี้แล้วกะระยะห่างจริง (ถ้าอยู่ไกลหลายเมตรให้สั่งเดิน 6-10 ก้าว ถ้าระยะกลาง 3-5 ก้าว ถ้าระยะใกล้หรือเบี่ยงหลบของ 1-2 ก้าว ห้ามตอบ 4 ก้าวซ้ำๆ) สั่งการเดิน 1 ประโยคสั้นๆ เพื่อมุ่งหน้าไป "${currentNavigationMission}"`
        : `ผู้ใช้กำลังเดินต่อเนื่อง (รอบสแกนที่ ${walkStepCounter})${prevHint} ดูช่องทางเดินในภาพใหม่นี้แล้วกะระยะจริง (ถ้าทางโล่งยาวสั่งเดิน 6-10 ก้าว ถ้าระยะกลาง 3-5 ก้าว ถ้าใกล้สิ่งกีดขวางให้สั่งเบี่ยงซ้าย/ขวา 1-2 ก้าวแล้วเดินต่อ) ตอบ 1 ประโยคสั้นๆ`);

    const result = await aiService.askUbot({
      imageBase64: frame.base64Data,
      question: query,
      mimeType: frame.mimeType,
      mode: 'walking',
      detections: ''
    });

    if (!isWalkingMode || isAwaitingMissionGoal || stepSessionId !== walkingSessionId) return;

    if (result && result.text) {
      const guidance = result.text.trim();
      ubotResponseText.textContent = guidance;
      if (viewportContainer) viewportContainer.classList.remove('hazard-detected');

      const isCompleted = /ถึงจุดหมาย|ถึงเป้าหมาย|ภารกิจเสร็จสิ้น|mission complete|arrived at destination/i.test(guidance);
      if (isCompleted && hasSpecificGoal) {
        missionFinished = true;
        triggerHaptic([100, 50, 100, 50, 300]);
        playResponseSound();
        statusBadge.textContent = isEn ? '✅ MISSION COMPLETE' : '✅ ถึงจุดหมายแล้ว';
        await speakAnswer(guidance);
        if (isWalkingMode && stepSessionId === walkingSessionId) {
          toggleWalkingMode(false);
        }
        return;
      }

      lastSpokenGuidance = guidance;
      lastSpokenGuidanceAt = Date.now();
      await speakAnswer(guidance);

      // Pause 1.2s after speaking finishes before capturing the next frame while user walks
      nextWalkDelayMs = 1200;
    }
  } catch (err) {
    console.warn('Walking guide step error:', err);
    nextWalkDelayMs = 1500;
  } finally {
    isWalkingStepActive = false;
    // GUARANTEE continuous loop: as long as Walk Mode is active, ALWAYS schedule the next scan!
    if (!missionFinished && isWalkingMode && !isAwaitingMissionGoal && stepSessionId === walkingSessionId) {
      clearTimeout(walkingLoopTimer);
      walkingLoopTimer = setTimeout(runWalkingGuideStep, nextWalkDelayMs);
    }
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
  walkStepCounter = 0;

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
    speech.stopListening();
    stopAllSpeech();
    playChirpSound();
    triggerHaptic([150, 80, 150]);

    isAwaitingMissionGoal = false;
    if (targetMission) {
      currentNavigationMission = targetMission;
    } else if (!currentNavigationMission) {
      currentNavigationMission = '';
    }

    const missionText = currentNavigationMission || (currentAppLang === 'en-US' ? 'Walk Mode: ON' : 'กำลังนำทาง');
    statusBadge.textContent = `🚶‍♂️ ${missionText}`;
    ubotResponseText.textContent = currentNavigationMission
      ? `กำลังนำทางต่อเนื่องไปที่ "${currentNavigationMission}" ครับ...`
      : 'กำลังนำทางต่อเนื่องครับ (พูดบอกจุดหมาย เช่น "ต้องการไปหน้าเวที" ได้ทุกเมื่อ)';

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
