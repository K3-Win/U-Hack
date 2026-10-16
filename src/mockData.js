/**
 * Mock Data for U-Vision (Ubot) Fail-Safe Demo Mode
 * Contains 3 pre-baked scenarios with images, questions, and responses.
 * Works 100% offline with zero network dependency.
 */

// Helper to generate SVG Data URI for realistic mockup visuals
function createScenarioSvg({ badge, title, subtitle, details, color, accentColor, iconSvg }) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" width="800" height="600">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#0f172a" />
        <stop offset="100%" stop-color="#1e293b" />
      </linearGradient>
      <linearGradient id="cardGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${color}" stop-opacity="0.25" />
        <stop offset="100%" stop-color="${color}" stop-opacity="0.05" />
      </linearGradient>
      <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
        <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#334155" stroke-width="0.7" opacity="0.3"/>
      </pattern>
    </defs>
    
    <!-- Background -->
    <rect width="800" height="600" fill="url(#bg)" />
    <rect width="800" height="600" fill="url(#grid)" />
    
    <!-- Target Crosshairs / HUD Reticle -->
    <circle cx="400" cy="300" r="180" fill="none" stroke="${accentColor}" stroke-width="1.5" stroke-dasharray="8 6" opacity="0.4" />
    <circle cx="400" cy="300" r="90" fill="none" stroke="${accentColor}" stroke-width="1" opacity="0.6" />
    <line x1="380" y1="300" x2="420" y2="300" stroke="${accentColor}" stroke-width="2" />
    <line x1="400" y1="280" x2="400" y2="320" stroke="${accentColor}" stroke-width="2" />
    
    <!-- Subject Card Mockup -->
    <rect x="160" y="120" width="480" height="360" rx="16" fill="url(#cardGrad)" stroke="${accentColor}" stroke-width="2" />
    
    <!-- Badge -->
    <rect x="190" y="145" width="160" height="32" rx="16" fill="${accentColor}" fill-opacity="0.2" stroke="${accentColor}" stroke-width="1.5"/>
    <text x="270" y="166" fill="${accentColor}" font-family="system-ui, -apple-system, sans-serif" font-size="13" font-weight="bold" text-anchor="middle" letter-spacing="1">${badge}</text>
    
    <!-- Content Header -->
    <text x="190" y="220" fill="#f8fafc" font-family="system-ui, -apple-system, sans-serif" font-size="28" font-weight="bold">${title}</text>
    <text x="190" y="250" fill="#94a3b8" font-family="system-ui, -apple-system, sans-serif" font-size="16">${subtitle}</text>
    
    <!-- Key Details -->
    <rect x="190" y="280" width="420" height="150" rx="10" fill="#0b1120" fill-opacity="0.6" stroke="#334155" stroke-width="1" />
    ${details}
    
    <!-- Viewfinder Coordinates & Metadata -->
    <text x="30" y="40" fill="#64748b" font-family="monospace" font-size="12">VISIONBOT_SIM // POV_CAMERA_01</text>
    <text x="770" y="40" fill="${accentColor}" font-family="monospace" font-size="12" text-anchor="end">FPS: 60 | FOCUS: LOCKED</text>
    <text x="30" y="570" fill="#64748b" font-family="monospace" font-size="12">RES: 1920x1080 | FOV: 84°</text>
    <text x="770" y="570" fill="#64748b" font-family="monospace" font-size="12" text-anchor="end">ISO: 400 | EXP: AUTO</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export const PRESET_SCENARIOS = [
  {
    id: "snack-allergy",
    title: "ฉลากโภชนาการ & สารก่อภูมิแพ้",
    badge: "HEALTH & FOOD",
    userQuestion: "อันนี้กินได้ไหม มีสารก่อภูมิแพ้อะไรที่ต้องระวังบ้าง?",
    ubotResponse: "ตรวจพบส่วนผสมของถั่วลิสงและนมผงครับ! หากคุณมีประวัติแพ้ถั่ว แนะนำให้หลีกเลี่ยงทันที และมีปริมาณน้ำตาลค่อนข้างสูง (22 กรัม) ต่อหนึ่งหน่วยบริโภคครับ",
    category: "ความปลอดภัยอาหาร",
    imageUrl: createScenarioSvg({
      badge: "FOOD & ALLERGEN OCR",
      title: "Choco Crunch Bar (Nutrition Label)",
      subtitle: "วิเคราะห์ฉลากโภชนาการและสารก่อภูมิแพ้",
      color: "#ef4444",
      accentColor: "#f87171",
      details: `
        <text x="210" y="315" fill="#f87171" font-family="monospace" font-size="14" font-weight="bold">⚠️ ALLERGEN WARNING DETECTED:</text>
        <text x="210" y="340" fill="#f1f5f9" font-family="system-ui, sans-serif" font-size="15">• Contains Peanuts (ถั่วลิสง), Cow Milk (นมวัว)</text>
        <text x="210" y="365" fill="#f1f5f9" font-family="system-ui, sans-serif" font-size="15">• May contain traces of Soy & Wheat (กลูเตน)</text>
        <text x="210" y="400" fill="#38bdf8" font-family="system-ui, sans-serif" font-size="14">Calories: 260 kcal | Sugars: 22g | Sodium: 110mg</text>
      `
    })
  },
  {
    id: "hardware-port",
    title: "แนะนำพอร์ตเชื่อมต่อคอมพิวเตอร์",
    badge: "HARDWARE / I/O",
    userQuestion: "พอร์ตด้านหลังเครื่องนี้คืออะไร ต้องเสียบสายสีไหน?",
    ubotResponse: "พอร์ตสีน้ำเงินตรงกลางคือ USB 3.2 Gen 1 รองรับความเร็วสูง แนะนำให้เสียบ Flash Drive ช่องนี้ครับ ส่วนพอร์ตด้านขวาคือ HDMI สำหรับต่อออกจอภาพครับ",
    category: "ฮาร์ดแวร์ & อุปกรณ์",
    imageUrl: createScenarioSvg({
      badge: "HARDWARE I/O SCAN",
      title: "Mainboard Rear I/O Panel",
      subtitle: "สแกนพอร์ตเชื่อมต่อและคำแนะนำการเสียบสาย",
      color: "#06b6d4",
      accentColor: "#22d3ee",
      details: `
        <text x="210" y="315" fill="#22d3ee" font-family="monospace" font-size="14" font-weight="bold">🔍 DETECTED INTERFACES:</text>
        <text x="210" y="340" fill="#f1f5f9" font-family="system-ui, sans-serif" font-size="15">• [Port A] USB 3.2 Gen 1 (Blue) - High-Speed 5Gbps</text>
        <text x="210" y="365" fill="#f1f5f9" font-family="system-ui, sans-serif" font-size="15">• [Port B] USB Type-C DisplayPort Alternate</text>
        <text x="210" y="395" fill="#a78bfa" font-family="system-ui, sans-serif" font-size="14">• [Port C] HDMI 2.1 Video Output (4K/120Hz)</text>
      `
    })
  },
  {
    id: "foreign-sign",
    title: "แปลป้ายเตือนภาษาต่างประเทศ",
    badge: "TRANSLATION / OCR",
    userQuestion: "ป้ายนี้เขียนว่าอะไร ช่วยสรุปให้ฟังหน่อย",
    ubotResponse: "ป้ายนี้เป็นภาษาญี่ปุ่นระบุว่า 'ระวังพื้นต่างระดับและพื้นเปียกลื่น โปรดจับราวบันได' พร้อมเตือนให้ระวังเด็กเล็กขณะก้าวลงบันไดครับ",
    category: "การแปล & ป้ายเตือน",
    imageUrl: createScenarioSvg({
      badge: "LIVE OCR & TRANSLATION",
      title: "Warning Sign (Osaka Station)",
      subtitle: "ถอดรหัสข้อความและแปลภาษาแบบบริบทจริง",
      color: "#eab308",
      accentColor: "#facc15",
      details: `
        <text x="210" y="315" fill="#facc15" font-family="monospace" font-size="14" font-weight="bold">🈯 ORIGINAL TEXT (JA):</text>
        <text x="210" y="340" fill="#f8fafc" font-family="sans-serif" font-size="16">「足元注意・段差あり・手すりをご利用ください」</text>
        <text x="210" y="375" fill="#4ade80" font-family="monospace" font-size="13" font-weight="bold">✅ THAI TRANSLATION:</text>
        <text x="210" y="400" fill="#f1f5f9" font-family="system-ui, sans-serif" font-size="14">ระวังพื้นต่างระดับ พื้นเปียกลื่น โปรดจับราวบันได</text>
      `
    })
  }
];

export const DEFAULT_SYSTEM_INSTRUCTION = `คุณคือ "VisionBot" ผู้ช่วย AI อัจฉริยะประจำแว่นตา U-Vision
คุณมีหน้าที่ตอบคำถามของผู้ใช้โดยอิงจาก "ภาพมุมมองที่ผู้ใช้เห็น" และ "เสียงคำถามที่ผู้ใช้ถาม"
กฎสำคัญในการตอบ:
1. ตอบด้วยภาษาไทยที่สุภาพ เป็นกันเอง กระชับ ตรงประเด็น (ความยาวประมาณ 1-3 ประโยค) เพราะเป็นเสียงพูดผ่านแว่นตา
2. ตอบเฉพาะสิ่งที่มองเห็นในภาพจริง อย่าเดาเกินจริง หากภาพไม่ชัดเจนให้แจ้งสั้นๆ
3. เน้นข้อมูลที่เป็นประโยชน์ เช่น เตือนความปลอดภัย, ระบุชื่อวัตถุ, วิธีใช้งาน หรือการแปล`;
