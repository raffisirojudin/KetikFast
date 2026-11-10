// ============================================================================
// app.js - Mesin Utama KetikFast Ultimate v2.0
// Biomechanical Telemetry, Smart Bigram AI, Ghost Pacemaker & RPG Boss Arena
// ============================================================================

/* ==========================================
   1. STATE APLIKASI & KONFIGURASI
   ========================================== */
let selectedMode = 'time';          // 'time' | 'words' | 'quote' | 'academy' | 'boss'
let selectedSubOption = 30;         // detik (time), jumlah kata (words), id level (academy), id boss (boss)
let selectedCategory = 'umum';      // 'umum' | 'teknologi' | 'inspirasi' | 'literatur' | 'koding' | 'custom' | 'adaptive'
let visualGuideMode = '3d';         // '3d' | '2d' | 'off'
let soundProfile = 'thocky';
let soundVolume = 0.7;

// Toggles Fitur Interaktif
let ghostEnabled = true;
let showFingerZones = true;
let showHeatmap = false;
let showHandDiagram = true;
let metronomeWpm = 0;               // 0 = Off, 40, 60, 80
let metronomeInterval = null;

// Status Sesi Ketik
let isTestArmed = false;            // Siap menerima ketukan pertama
let isTestRunning = false;          // Timer sedang berjalan setelah ketukan pertama
let timerInterval = null;
let ghostInterval = null;
let totalTimeElapsed = 0;
let testStartTimeMs = 0;
let timeRemaining = 30;
let targetWordCount = 25;

let words = [];
let currentWordIndex = 0;
let totalTypedChars = 0;
let correctTypedChars = 0;
let currentSecondErrors = 0;
let currentStreak = 0;
let maxStreak = 0;
let sentenceQueue = [];

// Telemetri Biometrik (IKI, Bigram, Per-Detik)
let lastKeystrokeTimeMs = 0;
let lastTypedChar = '';
let keystrokeIntervals = [];        // Untuk menghitung Konsistensi Ritme (%)
let sessionMistypedKeys = {};
let sessionBigramTimes = {};        // { 'ka': [120, 140], ... }
let telemetryHistory = [];          // [{ sec: 1, wpm: 45, raw: 50, errors: 0 }, ...]

// Ghost Pacemaker State
let ghostCharProgress = 0;
let ghostTargetWpm = 40;

// RPG Boss Battle State
let activeBoss = null;
let bossMaxHp = 250;
let bossCurrentHp = 250;
let playerMaxHp = 100;
let playerCurrentHp = 100;

// Replay State
let replayFrames = [];
let isReplaying = false;
let replayPlaybackInterval = null;
let replaySpeed = 1;

// WebAudio Context
let audioCtx = null;
let textInput = null;

const keyFingerMap = {
  '1':'L5', 'q':'L5', 'a':'L5', 'z':'L5',
  '2':'L4', 'w':'L4', 's':'L4', 'x':'L4',
  '3':'L3', 'e':'L3', 'd':'L3', 'c':'L3',
  '4':'L2', 'r':'L2', 'f':'L2', 'v':'L2',
  '5':'L2', 't':'L2', 'g':'L2', 'b':'L2',
  '6':'R2', 'y':'R2', 'h':'R2', 'n':'R2',
  '7':'R2', 'u':'R2', 'j':'R2', 'm':'R2',
  '8':'R3', 'i':'R3', 'k':'R3', ',':'R3',
  '9':'R4', 'o':'R4', 'l':'R4', '.':'R4',
  '0':'R5', 'p':'R5', ';':'R5', '/':'R5',
  '-':'R5', '[':'R5', ']':'R5', "'":'R5',
  'space':'R1'
};

const fingerNames = {
  'L5': 'Kelingking Kiri', 'L4': 'Jari Manis Kiri', 'L3': 'Jari Tengah Kiri', 'L2': 'Telunjuk Kiri', 'L1': 'Jempol Kiri',
  'R1': 'Jempol Kanan', 'R2': 'Telunjuk Kanan', 'R3': 'Jari Tengah Kanan', 'R4': 'Jari Manis Kanan', 'R5': 'Kelingking Kanan'
};

const noteFrequencies = [261.63, 293.66, 329.63, 392.00, 440.00, 523.25, 587.33, 659.25, 783.99, 880.00];

/* ==========================================
   2. INISIALISASI SAAT HALAMAN DIMUAT
   ========================================== */
window.addEventListener('DOMContentLoaded', () => {
  textInput = document.getElementById('text-input');
  if (textInput) {
    textInput.addEventListener('keydown', handleInputKeyDown);
    textInput.addEventListener('input', handleInputInput);
  }

  loadPersonalBest();
  updateAdaptivePreviewBadge();

  window.addEventListener('keydown', handleGlobalKeyDown);
  window.addEventListener('keyup', handleGlobalKeyUp);
  window.addEventListener('resize', () => {
    if (isTestArmed || isTestRunning) requestAnimationFrame(positionSmoothCaretAndKeyboard);
  });

  switchTheme('dark-slate');
  updateSubOptionsUI();
  refreshKeyboardHeatmapAttributes();
});

function getTextDB() {
  return window.TEXT_DATABASE || {};
}

/* ==========================================
   3. WEBAUDIO SYNTHESIZER & METRONOM RITME
   ========================================== */
function initAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

function playASMRSound(isSpaceOrEnter = false, charCode = 65, isError = false) {
  if (soundProfile === 'mute' || soundVolume <= 0) return;
  initAudioContext();
  if (!audioCtx) return;

  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  osc.connect(gain);
  gain.connect(audioCtx.destination);

  const vol = soundVolume;

  if (isError) {
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(130, now);
    osc.frequency.exponentialRampToValueAtTime(75, now + 0.08);
    gain.gain.setValueAtTime(vol * 0.45, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
    osc.start(now);
    osc.stop(now + 0.095);
    return;
  }

  const pitchMultiplier = 1 + Math.min(currentStreak * 0.006, 0.35);

  if (soundProfile === 'piano') {
    const noteIndex = Math.abs(charCode) % noteFrequencies.length;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(noteFrequencies[noteIndex], now);
    gain.gain.setValueAtTime(vol * 0.55, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.32);
    osc.start(now);
    osc.stop(now + 0.33);
  } else if (soundProfile === 'chiptune') {
    const noteIndex = Math.abs(charCode) % noteFrequencies.length;
    osc.type = 'square';
    osc.frequency.setValueAtTime(noteFrequencies[noteIndex] * 1.4, now);
    gain.gain.setValueAtTime(vol * 0.22, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.11);
    osc.start(now);
    osc.stop(now + 0.12);
  } else if (soundProfile === 'thocky') {
    osc.type = 'sine';
    const startFreq = (isSpaceOrEnter ? 145 : 225) * pitchMultiplier;
    const endFreq = (isSpaceOrEnter ? 42 : 62) * pitchMultiplier;
    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(endFreq, now + 0.042);
    gain.gain.setValueAtTime(vol * 0.85, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.048);
    osc.start(now);
    osc.stop(now + 0.05);
  } else if (soundProfile === 'clicky') {
    osc.type = 'triangle';
    osc.frequency.setValueAtTime((isSpaceOrEnter ? 850 : 1750) * pitchMultiplier, now);
    osc.frequency.exponentialRampToValueAtTime(280 * pitchMultiplier, now + 0.022);
    gain.gain.setValueAtTime(vol * 0.65, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.028);
    osc.start(now);
    osc.stop(now + 0.03);
  } else if (soundProfile === 'creamy') {
    osc.type = 'sine';
    osc.frequency.setValueAtTime((isSpaceOrEnter ? 270 : 410) * pitchMultiplier, now);
    osc.frequency.exponentialRampToValueAtTime(105 * pitchMultiplier, now + 0.038);
    gain.gain.setValueAtTime(vol * 0.75, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.042);
    osc.start(now);
    osc.stop(now + 0.045);
  }
}

function playMetronomeTick() {
  if (soundProfile === 'mute' || soundVolume <= 0) return;
  initAudioContext();
  if (!audioCtx) return;

  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);

  osc.type = 'sine';
  osc.frequency.setValueAtTime(620, now);
  osc.frequency.exponentialRampToValueAtTime(180, now + 0.025);
  gain.gain.setValueAtTime(soundVolume * 0.2, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
  osc.start(now);
  osc.stop(now + 0.032);
}

function cycleMetronome() {
  const speeds = [0, 40, 60, 80];
  const nextIdx = (speeds.indexOf(metronomeWpm) + 1) % speeds.length;
  metronomeWpm = speeds[nextIdx];

  const labelEl = document.getElementById('metronome-label');
  const btnEl = document.getElementById('metronome-btn');
  if (metronomeWpm === 0) {
    labelEl.innerText = 'Ritme: Off';
    btnEl.classList.remove('border-cyan-400', 'text-cyan-300');
  } else {
    labelEl.innerText = `Ritme: ${metronomeWpm}`;
    btnEl.classList.add('border-cyan-400', 'text-cyan-300');
    showToast(`⏱️ Metronom Ritme diatur ke ${metronomeWpm} WPM (${metronomeWpm * 5} ketukan/menit)`);
  }
  syncMetronomeTimer();
}

function syncMetronomeTimer() {
  if (metronomeInterval) {
    clearInterval(metronomeInterval);
    metronomeInterval = null;
  }
  if (isTestRunning && metronomeWpm > 0) {
    // 1 WPM = 5 karakter per menit
    const cpm = metronomeWpm * 5;
    const intervalMs = Math.round(60000 / cpm);
    metronomeInterval = setInterval(playMetronomeTick, intervalMs);
  }
}

/* ==========================================
   4. LOGIKA MENU UTAMA & PENGATURAN
   ========================================== */
function selectMode(m) {
  selectedMode = m;
  document.querySelectorAll('.mode-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.mode === m);
  });

  // Sembunyikan pilihan kategori jika mode adalah Akademi 10 Jari
  const catSection = document.getElementById('category-section');
  if (catSection) {
    catSection.classList.toggle('hidden', m === 'academy');
  }

  updateSubOptionsUI();
}

function updateSubOptionsUI() {
  const container = document.getElementById('sub-options-container');
  const label = document.getElementById('sub-option-label');
  const btnBox = document.getElementById('sub-option-buttons');
  if (!container || !label || !btnBox) return;

  if (selectedMode === 'quote') {
    container.classList.add('hidden');
    return;
  }
  container.classList.remove('hidden');

  if (selectedMode === 'time') {
    if (typeof selectedSubOption !== 'number' || ![15, 30, 60, 120].includes(selectedSubOption)) {
      selectedSubOption = 30;
    }
    label.innerText = 'Pilih Durasi Waktu (Detik)';
    btnBox.className = 'grid grid-cols-2 sm:grid-cols-4 gap-3';
    btnBox.innerHTML = [15, 30, 60, 120].map(sec => `
      <button onclick="selectSubOption(${sec})" class="option-card sub-btn p-3 rounded-xl border text-center font-bold text-sm transition-all ${selectedSubOption === sec ? 'active' : ''}" data-val="${sec}">${sec} Detik</button>
    `).join('');
  } else if (selectedMode === 'words') {
    if (typeof selectedSubOption !== 'number' || ![10, 25, 50, 100].includes(selectedSubOption)) {
      selectedSubOption = 25;
    }
    label.innerText = 'Pilih Target Jumlah Kata';
    btnBox.className = 'grid grid-cols-2 sm:grid-cols-4 gap-3';
    btnBox.innerHTML = [10, 25, 50, 100].map(cnt => `
      <button onclick="selectSubOption(${cnt})" class="option-card sub-btn p-3 rounded-xl border text-center font-bold text-sm transition-all ${selectedSubOption === cnt ? 'active' : ''}" data-val="${cnt}">${cnt} Kata</button>
    `).join('');
  } else if (selectedMode === 'academy') {
    const lessons = window.ACADEMY_LESSONS || [];
    if (!lessons.some(l => l.id === selectedSubOption)) {
      selectedSubOption = lessons[0] ? lessons[0].id : 'lvl1';
    }
    label.innerText = 'Pilih Modul Kurikulum 10 Jari Berjenjang';
    btnBox.className = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3';
    btnBox.innerHTML = lessons.map(item => `
      <button onclick="selectSubOption('${item.id}')" class="option-card sub-btn p-3.5 rounded-2xl border text-left transition-all ${selectedSubOption === item.id ? 'active' : ''}" data-val="${item.id}">
        <div class="flex justify-between items-center mb-1">
          <span class="text-xs font-black uppercase text-emerald-400">Level ${item.level} &bull; ${item.badge}</span>
          <span class="text-[10px] font-mono-custom theme-text-muted">Target ${item.targetWpm} WPM</span>
        </div>
        <div class="font-bold text-sm mb-1">${item.title}</div>
        <div class="text-[11px] theme-text-muted leading-snug">${item.desc}</div>
      </button>
    `).join('');
  } else if (selectedMode === 'boss') {
    const bosses = window.BOSS_PROFILES || [];
    if (!bosses.some(b => b.id === selectedSubOption)) {
      selectedSubOption = bosses[0] ? bosses[0].id : 'boss1';
    }
    label.innerText = 'Pilih Lawan RPG Boss Battle';
    btnBox.className = 'grid grid-cols-1 sm:grid-cols-2 gap-3';
    btnBox.innerHTML = bosses.map(boss => `
      <button onclick="selectSubOption('${boss.id}')" class="option-card sub-btn p-3.5 rounded-2xl border text-left flex items-start gap-3 transition-all ${selectedSubOption === boss.id ? 'active' : ''}" data-val="${boss.id}">
        <div class="text-3xl p-2 rounded-xl border theme-input-bg">${boss.avatar}</div>
        <div class="flex-1">
          <div class="flex justify-between items-center">
            <span class="font-bold text-sm">${boss.name}</span>
            <span class="text-[10px] font-mono-custom px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30">${boss.hp} HP &bull; ${boss.wpm} WPM</span>
          </div>
          <div class="text-[11px] font-semibold text-amber-400 mb-0.5">${boss.title}</div>
          <div class="text-[11px] theme-text-muted leading-snug">${boss.desc}</div>
        </div>
      </button>
    `).join('');
  }
}

function selectSubOption(val) {
  selectedSubOption = val;
  document.querySelectorAll('.sub-btn').forEach(b => {
    b.classList.toggle('active', String(b.dataset.val) === String(val));
  });
}

function selectCategory(cat) {
  selectedCategory = cat;
  document.querySelectorAll('.category-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.cat === cat);
  });
  const customBox = document.getElementById('custom-text-box');
  if (customBox) {
    customBox.classList.toggle('hidden', cat !== 'custom');
  }
}

function toggleGhostSetting(checked) {
  ghostEnabled = checked;
}

function changeSoundProfile(val) { soundProfile = val; }
function changeSoundVolume(val) { soundVolume = parseFloat(val); }

function switchTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  const sel = document.getElementById('theme-selector');
  if (sel) sel.value = t;
}

function cycleVisualGuideMode() {
  const modes = ['3d', '2d', 'off'];
  const icons = { '3d': '⌨️', '2d': '🖥️', 'off': '🚫' };
  const texts = { '3d': 'Keyboard 3D', '2d': 'Keyboard 2D', 'off': 'Sembunyi' };

  const nextIdx = (modes.indexOf(visualGuideMode) + 1) % modes.length;
  visualGuideMode = modes[nextIdx];

  document.getElementById('guide-mode-icon').innerText = icons[visualGuideMode];
  document.getElementById('guide-mode-text').innerText = texts[visualGuideMode];

  const guideBox = document.getElementById('visual-guide-container');
  const board = document.getElementById('keyboard-board');

  if (visualGuideMode === 'off') {
    guideBox.classList.add('hidden');
  } else {
    if (isTestArmed || isTestRunning) guideBox.classList.remove('hidden');
    board.classList.toggle('mode-3d', visualGuideMode === '3d');
    board.classList.toggle('mode-2d', visualGuideMode === '2d');
  }
  if (isTestArmed || isTestRunning) requestAnimationFrame(positionSmoothCaretAndKeyboard);
}

function toggleFingerZones() {
  showFingerZones = !showFingerZones;
  const board = document.getElementById('keyboard-board');
  const btn = document.getElementById('toggle-zones-btn');
  const legend = document.getElementById('finger-zone-legend');
  if (board) board.classList.toggle('show-finger-zones', showFingerZones);
  if (btn) btn.classList.toggle('border-blue-500/50', showFingerZones);
  if (btn) btn.classList.toggle('text-blue-300', showFingerZones);
  if (legend) legend.classList.toggle('hidden', !showFingerZones);
}

function toggleKeyboardHeatmap() {
  showHeatmap = !showHeatmap;
  const board = document.getElementById('keyboard-board');
  const btn = document.getElementById('toggle-heatmap-btn');
  if (board) board.classList.toggle('show-heatmap', showHeatmap);
  if (btn) btn.classList.toggle('border-rose-500/60', showHeatmap);
  if (btn) btn.classList.toggle('text-rose-300', showHeatmap);
  if (showHeatmap) {
    refreshKeyboardHeatmapAttributes();
    showToast("🔥 Heatmap Aktif: Merah = Sering Salah/Lambat, Hijau = Akurat & Cepat");
  }
}

function toggleHandDiagram() {
  showHandDiagram = !showHandDiagram;
  const leftPanel = document.getElementById('left-hand-panel');
  const rightPanel = document.getElementById('right-hand-panel');
  const btn = document.getElementById('toggle-hands-btn');
  if (leftPanel) leftPanel.classList.toggle('hidden', !showHandDiagram);
  if (rightPanel) rightPanel.classList.toggle('hidden', !showHandDiagram);
  if (btn) btn.classList.toggle('border-emerald-500/50', showHandDiagram);
  if (btn) btn.classList.toggle('text-emerald-300', showHandDiagram);
}

function toggleZenMode() {
  document.querySelector('header').classList.toggle('hidden');
  document.querySelector('footer').classList.toggle('hidden');
  showToast("🧘 Mode Zen Minimalis (Ctrl+Shift+Z)");
}

/* ==========================================
   5. GENERATOR MATERI & SMART BIGRAM AI
   ========================================== */
function buildAdaptiveSentenceList() {
  const weakKeys = getTopWeakKeys(5);
  const slowBigrams = getTopSlowBigrams(5).map(item => item.bigram);
  const wordBank = window.INDONESIAN_WORD_BANK || ["konsistensi", "kecepatan", "akurasi", "struktur", "algoritma"];

  const targetKeys = weakKeys.length > 0 ? weakKeys : ['k', 'p', 'r', 's', 't'];
  const targetBigrams = slowBigrams.length > 0 ? slowBigrams : ['pr', 'kr', 'st', 'tr', 'ng'];

  // Beri skor setiap kata asli Bahasa Indonesia berdasar kandungan huruf lemah & bigram lambat
  const scoredWords = wordBank.map(w => {
    const lower = w.toLowerCase();
    let score = 0;
    targetKeys.forEach(k => {
      if (lower.includes(k)) score += 3;
    });
    targetBigrams.forEach(bg => {
      if (lower.includes(bg)) score += 5;
    });
    return { word: w, score: score + Math.random() * 1.5 };
  });

  scoredWords.sort((a, b) => b.score - a.score);
  const topPool = scoredWords.slice(0, 65).map(item => item.word);

  const sentences = [];
  for (let s = 0; s < 10; s++) {
    const picked = shuffleArray(topPool).slice(0, 9);
    sentences.push(picked.join(' '));
  }
  return sentences;
}

function prepareSentenceQueue() {
  const db = getTextDB();

  if (selectedMode === 'academy') {
    const lessons = window.ACADEMY_LESSONS || [];
    const lesson = lessons.find(l => l.id === selectedSubOption) || lessons[0];
    sentenceQueue = lesson ? [...lesson.drills] : ["ff jj dd kk fj dk"];
    return;
  }

  if (selectedCategory === 'custom') {
    const rawCustom = (document.getElementById('custom-text-input')?.value || '').trim();
    if (rawCustom.split(/\s+/).length >= 3) {
      sentenceQueue = [rawCustom.replace(/\s+/g, ' ')];
      return;
    } else {
      showToast("⚠️ Teks kustom terlalu pendek, menggunakan kategori Umum.");
    }
  }

  if (selectedCategory === 'adaptive') {
    sentenceQueue = buildAdaptiveSentenceList();
    return;
  }

  const sourceArray = db[selectedCategory] ? [...db[selectedCategory]] : [...(db.umum || [])];
  sentenceQueue = shuffleArray(sourceArray);
}

function generateInitialWords() {
  prepareSentenceQueue();
  words = [];

  if (selectedMode === 'quote') {
    const quoteStr = sentenceQueue.shift() || "Konsistensi adalah kunci keberhasilan.";
    words = quoteStr.split(' ');
  } else if (selectedMode === 'words') {
    targetWordCount = Number(selectedSubOption) || 25;
    while (words.length < targetWordCount) {
      if (sentenceQueue.length === 0) prepareSentenceQueue();
      const nextLine = sentenceQueue.shift();
      words.push(...nextLine.split(' '));
    }
    words = words.slice(0, targetWordCount);
  } else {
    // Mode 'time', 'academy', atau 'boss' -> Muat minimal 45 kata awal
    while (words.length < 45) {
      if (sentenceQueue.length === 0) prepareSentenceQueue();
      const nextLine = sentenceQueue.shift();
      words.push(...nextLine.split(' '));
    }
  }
  currentWordIndex = 0;
}

function appendMoreWordsIfNeeded() {
  if (selectedMode === 'quote' || selectedMode === 'words') return;
  if (words.length - currentWordIndex < 22) {
    if (sentenceQueue.length === 0) prepareSentenceQueue();
    const nextLine = sentenceQueue.shift();
    const newWords = nextLine.split(' ');
    const startIdx = words.length;
    words.push(...newWords);

    const wrapper = document.getElementById('words-wrapper');
    if (wrapper) {
      newWords.forEach((wordStr, idx) => {
        const wIdx = startIdx + idx;
        const wordSpan = createWordSpanElement(wordStr, wIdx);
        wrapper.appendChild(wordSpan);
      });
    }
  }
}

/* ==========================================
   6. MEMULAI, MENGULANG & MENGHENTIKAN TES
   ========================================== */
function startTypingTest() {
  clearInterval(timerInterval);
  clearInterval(ghostInterval);
  if (metronomeInterval) clearInterval(metronomeInterval);

  isTestArmed = true;
  isTestRunning = false;
  totalTypedChars = 0;
  correctTypedChars = 0;
  currentSecondErrors = 0;
  totalTimeElapsed = 0;
  currentStreak = 0;
  maxStreak = 0;
  lastKeystrokeTimeMs = 0;
  lastTypedChar = '';
  keystrokeIntervals = [];
  sessionMistypedKeys = {};
  sessionBigramTimes = {};
  telemetryHistory = [];
  replayFrames = [];
  ghostCharProgress = 0;

  generateInitialWords();

  // Tampilkan Area Tes
  document.getElementById('setup-panel').classList.add('hidden');
  document.getElementById('typing-test-area').classList.remove('hidden');

  const standbyBadge = document.getElementById('timer-standby-badge');
  if (standbyBadge) standbyBadge.classList.remove('hidden');

  if (visualGuideMode !== 'off') {
    document.getElementById('visual-guide-container').classList.remove('hidden');
  }

  // Konfigurasi Mode Spesifik (Time / Words / Quote / Academy / Boss)
  const bossHud = document.getElementById('boss-hud');
  const targetTitle = document.getElementById('live-target-title');
  const targetDisplay = document.getElementById('live-target-display');

  if (selectedMode === 'boss') {
    const bosses = window.BOSS_PROFILES || [];
    activeBoss = bosses.find(b => b.id === selectedSubOption) || bosses[0];
    bossMaxHp = activeBoss.hp;
    bossCurrentHp = activeBoss.hp;
    playerMaxHp = 100;
    playerCurrentHp = 100;
    ghostTargetWpm = activeBoss.wpm;

    bossHud.classList.remove('hidden');
    document.getElementById('boss-avatar-icon').innerText = activeBoss.avatar;
    document.getElementById('boss-name-label').innerText = `${activeBoss.name} (${activeBoss.wpm} WPM)`;
    updateBossHudUI();

    targetTitle.innerText = 'Boss Battle';
    targetDisplay.innerText = `${bossCurrentHp} HP`;
  } else {
    bossHud.classList.add('hidden');
    activeBoss = null;

    const pb = getPersonalBest();
    ghostTargetWpm = pb > 15 ? pb : 40;

    if (selectedMode === 'time') {
      timeRemaining = Number(selectedSubOption) || 30;
      targetTitle.innerText = 'Sisa Waktu';
      targetDisplay.innerText = `${timeRemaining}s`;
    } else if (selectedMode === 'words') {
      targetWordCount = Number(selectedSubOption) || 25;
      targetTitle.innerText = 'Target Kata';
      targetDisplay.innerText = `0 / ${targetWordCount}`;
    } else if (selectedMode === 'academy') {
      const lessons = window.ACADEMY_LESSONS || [];
      const lesson = lessons.find(l => l.id === selectedSubOption) || lessons[0];
      timeRemaining = 60;
      ghostTargetWpm = lesson ? lesson.targetWpm : 25;
      targetTitle.innerText = `Level ${lesson ? lesson.level : 1}`;
      targetDisplay.innerText = `${timeRemaining}s`;
    } else {
      targetTitle.innerText = 'Kutipan';
      targetDisplay.innerText = `0 / ${words.length}`;
    }
  }

  // Reset UI Statistik Live
  document.getElementById('live-wpm').innerText = '0';
  document.getElementById('live-raw-wpm').innerText = '(Raw 0)';
  document.getElementById('live-accuracy').innerText = '100%';
  document.getElementById('live-streak').innerText = '0x';
  document.getElementById('live-rhythm').innerText = '100%';
  document.getElementById('test-progress-bar').style.width = '0%';
  document.getElementById('ghost-progress-bar').style.width = '0%';

  const wrapper = document.getElementById('words-wrapper');
  if (wrapper) wrapper.style.transform = 'translateY(0px)';

  textInput.disabled = false;
  textInput.value = '';
  textInput.focus();

  renderSentence();
  updateWordCounterBadge();
}

function restartCurrentTest() {
  closeResultModal();
  startTypingTest();
  showToast("🔄 Sesi latihan diulang!");
}

function focusTypingInput() {
  if ((isTestArmed || isTestRunning) && textInput) {
    textInput.focus();
  }
}

function beginActiveTimersOnFirstKey() {
  if (isTestRunning) return;
  isTestRunning = true;
  isTestArmed = false;
  testStartTimeMs = performance.now();

  const standbyBadge = document.getElementById('timer-standby-badge');
  if (standbyBadge) standbyBadge.classList.add('hidden');

  clearInterval(timerInterval);
  timerInterval = setInterval(gameTimerTick, 1000);

  clearInterval(ghostInterval);
  if (ghostEnabled) {
    document.getElementById('ghost-caret')?.classList.remove('hidden');
    ghostInterval = setInterval(updateGhostPacemaker, 150);
  } else {
    document.getElementById('ghost-caret')?.classList.add('hidden');
  }

  syncMetronomeTimer();
}

/* ==========================================
   7. RENDER KALIMAT, SMOOTH CARET & GHOST
   ========================================== */
function createWordSpanElement(wordStr, wIdx) {
  const wordSpan = document.createElement('span');
  wordSpan.className = `word-unit ${wIdx === currentWordIndex ? 'current-word' : ''}`;
  wordSpan.dataset.widx = wIdx;

  for (let cIdx = 0; cIdx < wordStr.length; cIdx++) {
    const charSpan = document.createElement('span');
    charSpan.className = 'char-unit font-mono-custom';
    charSpan.innerText = wordStr[cIdx];
    charSpan.dataset.cidx = cIdx;
    wordSpan.appendChild(charSpan);
  }
  return wordSpan;
}

function renderSentence() {
  const wrapper = document.getElementById('words-wrapper');
  if (!wrapper) return;
  wrapper.innerHTML = '';

  words.forEach((wordStr, wIdx) => {
    wrapper.appendChild(createWordSpanElement(wordStr, wIdx));
  });

  requestAnimationFrame(positionSmoothCaretAndKeyboard);
}

function positionSmoothCaretAndKeyboard() {
  const caret = document.getElementById('smooth-caret');
  const container = document.getElementById('sentence-display-container');
  const wrapper = document.getElementById('words-wrapper');
  const currentWordEl = container ? container.querySelector(`.word-unit[data-widx="${currentWordIndex}"]`) : null;
  if (!caret || !container || !wrapper || !currentWordEl) return;

  // Auto-scroll vertikal halus jika kata aktif pindah ke baris bawah
  const wordOffsetTop = currentWordEl.offsetTop;
  const lineScrollOffset = wordOffsetTop > 52 ? -(wordOffsetTop - 42) : 0;
  wrapper.style.transform = `translateY(${lineScrollOffset}px)`;

  const typedVal = textInput ? textInput.value : '';
  const charSpans = currentWordEl.querySelectorAll('.char-unit');
  let targetRect = null;

  if (typedVal.length < charSpans.length) {
    targetRect = charSpans[typedVal.length].getBoundingClientRect();
  } else if (charSpans.length > 0) {
    const lastRect = charSpans[charSpans.length - 1].getBoundingClientRect();
    targetRect = {
      left: lastRect.right,
      top: lastRect.top,
      height: lastRect.height
    };
  } else {
    targetRect = currentWordEl.getBoundingClientRect();
  }

  const containerRect = container.getBoundingClientRect();
  const x = targetRect.left - containerRect.left;
  const y = targetRect.top - containerRect.top;

  if (targetRect.height && targetRect.height > 0) {
    caret.style.height = `${targetRect.height}px`;
  }
  caret.style.transform = `translate3d(${x}px, ${y}px, 0)`;

  updateVisualHandGuide();
}

function updateGhostPacemaker() {
  if (!isTestRunning || !ghostEnabled) return;

  const elapsedMinutes = (performance.now() - testStartTimeMs) / 60000;
  ghostCharProgress = Math.floor(elapsedMinutes * ghostTargetWpm * 5);

  // Cari kata dan karakter yang sesuai dengan ghostCharProgress
  let accChars = 0;
  let ghostWordIdx = 0;
  let ghostCharIdx = 0;

  for (let i = 0; i < words.length; i++) {
    const wLen = words[i].length + 1;
    if (accChars + wLen > ghostCharProgress) {
      ghostWordIdx = i;
      ghostCharIdx = Math.min(ghostCharProgress - accChars, words[i].length - 1);
      break;
    }
    accChars += wLen;
    ghostWordIdx = i;
  }

  const container = document.getElementById('sentence-display-container');
  const ghostCaret = document.getElementById('ghost-caret');
  const wordEl = container?.querySelector(`.word-unit[data-widx="${ghostWordIdx}"]`);

  if (container && ghostCaret && wordEl) {
    const charSpans = wordEl.querySelectorAll('.char-unit');
    const targetSpan = charSpans[Math.max(0, ghostCharIdx)] || wordEl;
    const rect = targetSpan.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const gx = rect.left - containerRect.left;
    const gy = rect.top - containerRect.top;

    // Sembunyikan jika di luar kotak pandang
    if (gy < -10 || gy > containerRect.height) {
      ghostCaret.classList.add('hidden');
    } else {
      ghostCaret.classList.remove('hidden');
      ghostCaret.style.transform = `translate3d(${gx}px, ${gy}px, 0)`;
    }
  }

  // Update Ghost Progress Bar
  const totalExpectedChars = words.join(' ').length || 150;
  const ghostPct = Math.min(100, (ghostCharProgress / totalExpectedChars) * 100);
  const ghostBar = document.getElementById('ghost-progress-bar');
  if (ghostBar) ghostBar.style.width = `${ghostPct}%`;
}

/* ==========================================
   8. INPUT PENGETIKAN, TELEMETRI & BOSS COMBAT
   ========================================== */
function handleInputKeyDown(e) {
  if (!isTestArmed && !isTestRunning) return;

  // Shortcut Tab untuk Restart Cepat
  if (e.key === 'Tab') {
    e.preventDefault();
    restartCurrentTest();
    return;
  }

  if (e.key === ' ' || e.key === 'Enter') {
    e.preventDefault();
    const typedVal = textInput.value.trim();
    if (typedVal.length === 0) return;
    submitWord();
  }
}

function handleInputInput() {
  if (!isTestArmed && !isTestRunning) return;

  if (isTestArmed && !isTestRunning && textInput.value.length > 0) {
    beginActiveTimersOnFirstKey();
  }

  const nowMs = performance.now();
  const typedVal = textInput.value;
  const targetWord = words[currentWordIndex] || '';
  const currentWordEl = document.querySelector(`.word-unit[data-widx="${currentWordIndex}"]`);
  if (!currentWordEl) return;

  const caret = document.getElementById('smooth-caret');
  if (caret) caret.classList.remove('caret-idle');

  // Rekam IKI (Inter-Keystroke Interval) & Bigram Latency
  if (typedVal.length > 0) {
    const latestChar = typedVal[typedVal.length - 1].toLowerCase();
    const expectedChar = (targetWord[typedVal.length - 1] || '').toLowerCase();
    const isCharMatch = latestChar === expectedChar;

    if (lastKeystrokeTimeMs > 0) {
      const deltaMs = nowMs - lastKeystrokeTimeMs;
      if (deltaMs > 25 && deltaMs < 1800) {
        keystrokeIntervals.push(deltaMs);
        recordKeyLatency(expectedChar || latestChar, deltaMs, !isCharMatch);

        if (lastTypedChar && /^[a-z]$/.test(lastTypedChar) && /^[a-z]$/.test(latestChar) && isCharMatch) {
          const bg = lastTypedChar + latestChar;
          if (!sessionBigramTimes[bg]) sessionBigramTimes[bg] = [];
          sessionBigramTimes[bg].push(Math.round(deltaMs));
        }
      }
    }
    lastKeystrokeTimeMs = nowMs;
    lastTypedChar = latestChar;

    playASMRSound(false, latestChar.charCodeAt(0), !isCharMatch);
  }

  // Hapus karakter ekstra lama sebelum merender ulang status huruf
  currentWordEl.querySelectorAll('.extra-char').forEach(el => el.remove());

  const charSpans = currentWordEl.querySelectorAll('.char-unit');
  let isCurrentInputCorrect = true;

  for (let i = 0; i < charSpans.length; i++) {
    const span = charSpans[i];
    if (i < typedVal.length) {
      if (typedVal[i] === targetWord[i]) {
        span.style.color = 'var(--char-correct)';
        span.style.textDecoration = 'none';
      } else {
        span.style.color = 'var(--char-wrong)';
        span.style.textDecoration = 'underline';
        isCurrentInputCorrect = false;
        trackWeakKey(targetWord[i]);
        currentSecondErrors++;
      }
    } else {
      span.style.color = 'var(--char-pending)';
      span.style.textDecoration = 'none';
    }
  }

  // Jika user mengetik melebihi panjang kata target, tampilkan huruf berlebih
  if (typedVal.length > targetWord.length) {
    isCurrentInputCorrect = false;
    currentSecondErrors++;
    const extraStr = typedVal.slice(targetWord.length);
    for (let ch of extraStr) {
      const extraSpan = document.createElement('span');
      extraSpan.className = 'char-unit extra-char font-mono-custom';
      extraSpan.innerText = ch;
      currentWordEl.appendChild(extraSpan);
    }
  }

  // Visual border input box sesuai kebenaran ketikan
  textInput.style.borderColor = isCurrentInputCorrect ? 'var(--accent)' : 'var(--char-wrong)';

  if (isCurrentInputCorrect && typedVal.length > 0) {
    currentStreak++;
    if (currentStreak > maxStreak) maxStreak = currentStreak;
  } else if (!isCurrentInputCorrect) {
    currentStreak = 0;
    if (selectedMode === 'boss') {
      inflictPlayerDamage(4);
    }
  }
  updateStreakUI();

  replayFrames.push({
    time: totalTimeElapsed,
    wordTarget: targetWord,
    typedVal: typedVal,
    isCorrect: isCurrentInputCorrect
  });

  requestAnimationFrame(positionSmoothCaretAndKeyboard);
  updateLiveStats();
}

function submitWord() {
  const typedVal = textInput.value.trim();
  const targetWord = words[currentWordIndex] || '';

  const isWordExact = typedVal === targetWord;
  playASMRSound(true, 32, !isWordExact);

  totalTypedChars += typedVal.length + 1;
  if (isWordExact) {
    correctTypedChars += targetWord.length + 1;
    if (selectedMode === 'boss') {
      const isCrit = currentStreak >= 20;
      const dmg = Math.round(targetWord.length * 3 * (isCrit ? 1.6 : 1));
      inflictBossDamage(dmg, isCrit);
    }
  } else {
    // Hitung karakter yang benar di dalam kata yang sebagian salah
    let partialCorrect = 0;
    for (let i = 0; i < Math.min(typedVal.length, targetWord.length); i++) {
      if (typedVal[i] === targetWord[i]) partialCorrect++;
      else trackWeakKey(targetWord[i]);
    }
    correctTypedChars += partialCorrect;
    currentSecondErrors++;
    if (selectedMode === 'boss') {
      inflictPlayerDamage(8);
    }
  }

  const prevWordEl = document.querySelector(`.word-unit[data-widx="${currentWordIndex}"]`);
  if (prevWordEl) {
    prevWordEl.classList.remove('current-word');
    prevWordEl.style.opacity = isWordExact ? '0.42' : '0.75';
  }

  currentWordIndex++;
  textInput.value = '';
  textInput.style.borderColor = '';

  const nextWordEl = document.querySelector(`.word-unit[data-widx="${currentWordIndex}"]`);
  if (nextWordEl) {
    nextWordEl.classList.add('current-word');
  }

  // Update Progress Bar untuk Mode Words & Quote
  if (selectedMode === 'words') {
    document.getElementById('live-target-display').innerText = `${currentWordIndex} / ${targetWordCount}`;
    const pct = (currentWordIndex / targetWordCount) * 100;
    document.getElementById('test-progress-bar').style.width = `${pct}%`;

    if (currentWordIndex >= targetWordCount) {
      endGame(`Target ${targetWordCount} Kata Selesai!`);
      return;
    }
  } else if (selectedMode === 'quote') {
    document.getElementById('live-target-display').innerText = `${currentWordIndex} / ${words.length}`;
    const pct = (currentWordIndex / words.length) * 100;
    document.getElementById('test-progress-bar').style.width = `${pct}%`;

    if (currentWordIndex >= words.length) {
      endGame("Kutipan Utuh Selesai!");
      return;
    }
  } else {
    appendMoreWordsIfNeeded();
  }

  updateWordCounterBadge();
  requestAnimationFrame(positionSmoothCaretAndKeyboard);
  updateLiveStats();
}

function updateWordCounterBadge() {
  const badge = document.getElementById('input-word-counter');
  if (!badge) return;
  if (selectedMode === 'words') {
    badge.innerText = `Kata ${Math.min(currentWordIndex + 1, targetWordCount)}/${targetWordCount}`;
  } else if (selectedMode === 'quote') {
    badge.innerText = `Kata ${Math.min(currentWordIndex + 1, words.length)}/${words.length}`;
  } else {
    badge.innerText = `Kata #${currentWordIndex + 1}`;
  }
}

/* ==========================================
   9. LOGIKA RPG BOSS BATTLE & TIMER DETIK
   ========================================== */
function updateBossHudUI() {
  if (!activeBoss) return;
  const pPct = Math.max(0, Math.min(100, (playerCurrentHp / playerMaxHp) * 100));
  const bPct = Math.max(0, Math.min(100, (bossCurrentHp / bossMaxHp) * 100));

  document.getElementById('player-hp-text').innerText = `${playerCurrentHp} / ${playerMaxHp} HP`;
  document.getElementById('player-hp-bar').style.width = `${pPct}%`;

  document.getElementById('boss-hp-text').innerText = `${bossCurrentHp} / ${bossMaxHp} HP`;
  document.getElementById('boss-hp-bar').style.width = `${bPct}%`;
  document.getElementById('live-target-display').innerText = `${bossCurrentHp} HP`;

  const progressPct = 100 - bPct;
  document.getElementById('test-progress-bar').style.width = `${progressPct}%`;
}

function spawnFloatingDamage(text, isCrit = false, isPlayerHit = false) {
  const layer = document.getElementById('boss-damage-layer');
  if (!layer) return;

  const el = document.createElement('div');
  el.className = `dmg-popup font-mono-custom text-xs sm:text-sm ${isPlayerHit ? 'text-rose-400 left-1/4' : (isCrit ? 'text-amber-300 text-base right-1/4' : 'text-emerald-300 right-1/4')}`;
  el.style.top = '16px';
  el.innerText = text;
  layer.appendChild(el);

  setTimeout(() => el.remove(), 750);
}

function inflictBossDamage(dmg, isCrit) {
  if (!activeBoss || !isTestRunning) return;
  bossCurrentHp = Math.max(0, bossCurrentHp - dmg);
  updateBossHudUI();

  const avatar = document.getElementById('boss-avatar-icon');
  if (avatar) {
    avatar.classList.remove('boss-shake');
    void avatar.offsetWidth;
    avatar.classList.add('boss-shake');
  }

  spawnFloatingDamage(isCrit ? `💥 -${dmg} CRIT!` : `⚔️ -${dmg}`, isCrit, false);

  if (bossCurrentHp <= 0) {
    endGame(`🎉 VICTORY! ${activeBoss.name} Dikalahkan!`);
  }
}

function inflictPlayerDamage(dmg) {
  if (!activeBoss || !isTestRunning) return;
  playerCurrentHp = Math.max(0, playerCurrentHp - dmg);
  updateBossHudUI();
  spawnFloatingDamage(`🛡️ -${dmg} HP`, false, true);

  if (playerCurrentHp <= 0) {
    endGame(`💀 DEFEAT! Perisaimu Hancur oleh ${activeBoss.name}`);
  }
}

function gameTimerTick() {
  if (!isTestRunning) return;
  totalTimeElapsed++;

  const { netWpm, rawWpm } = calculateCurrentWPM();
  telemetryHistory.push({
    sec: totalTimeElapsed,
    wpm: netWpm,
    raw: rawWpm,
    errors: currentSecondErrors
  });
  currentSecondErrors = 0;

  if (selectedMode === 'time' || selectedMode === 'academy') {
    const totalDuration = selectedMode === 'academy' ? 60 : Number(selectedSubOption);
    timeRemaining--;
    document.getElementById('live-target-display').innerText = `${timeRemaining}s`;
    const pct = ((totalDuration - timeRemaining) / totalDuration) * 100;
    document.getElementById('test-progress-bar').style.width = `${pct}%`;

    if (timeRemaining <= 0) {
      endGame("Waktu Selesai!");
      return;
    }
  } else if (selectedMode === 'boss' && activeBoss) {
    // Boss menyerang secara periodik setiap 2 detik berdasarkan kecepatannya
    if (totalTimeElapsed % 2 === 0) {
      const periodicDmg = Math.max(2, Math.round(activeBoss.wpm / 14));
      inflictPlayerDamage(periodicDmg);
    }
  }

  updateLiveStats();
}

/* ==========================================
   10. KEYBOARD BERSINAR & PANDUAN 2 TANGAN SVG
   ========================================== */
function updateVisualHandGuide() {
  if (visualGuideMode === 'off') return;

  const targetWordStr = words[currentWordIndex] || '';
  const typedVal = textInput ? textInput.value : '';
  let nextChar = 'space';
  let bigramStr = '--';

  if (typedVal.length < targetWordStr.length) {
    nextChar = targetWordStr[typedVal.length].toLowerCase();
    const pair = targetWordStr.slice(typedVal.length, typedVal.length + 2);
    if (pair.length === 2) bigramStr = pair.toLowerCase();
  }

  const activeFingerId = keyFingerMap[nextChar] || 'R1';
  const fingerNameStr = fingerNames[activeFingerId] || 'Jempol Kanan';
  const charDisplay = nextChar === 'space' ? 'SPACEBAR' : nextChar.toUpperCase();

  const instructionEl = document.getElementById('finger-instruction-text');
  if (instructionEl) {
    instructionEl.innerText = `Tombol Target: '${charDisplay}' (Gunakan ${fingerNameStr})`;
  }

  const bigramBadge = document.getElementById('bigram-hint-badge');
  if (bigramBadge) {
    bigramBadge.innerText = `Transisi Bigram: ${bigramStr.toUpperCase()}`;
  }

  // Highlight Keycap di Keyboard Virtual
  document.querySelectorAll('.key-btn').forEach(k => k.classList.remove('next-key'));
  const lookupKey = nextChar === ' ' ? 'space' : nextChar;
  const activeKeyEl = document.querySelector(`.key-btn[data-key="${CSS.escape(lookupKey)}"]`);
  if (activeKeyEl) activeKeyEl.classList.add('next-key');

  // Highlight Jari di Diagram SVG 2 Tangan
  document.querySelectorAll('.hand-finger').forEach(f => f.classList.remove('active-finger'));
  const svgFinger = document.getElementById(`svg-finger-${activeFingerId}`);
  if (svgFinger) svgFinger.classList.add('active-finger');
}

function handleGlobalKeyDown(e) {
  if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    toggleZenMode();
    return;
  }

  let keyAttr = e.key.toLowerCase();
  if (e.key === ' ') keyAttr = 'space';

  const keyEl = document.querySelector(`.key-btn[data-key="${CSS.escape(keyAttr)}"]`);
  if (keyEl) keyEl.classList.add('pressed-key');
}

function handleGlobalKeyUp(e) {
  let keyAttr = e.key.toLowerCase();
  if (e.key === ' ') keyAttr = 'space';

  const keyEl = document.querySelector(`.key-btn[data-key="${CSS.escape(keyAttr)}"]`);
  if (keyEl) keyEl.classList.remove('pressed-key');
}

/* ==========================================
   11. KALKULASI STATISTIK, RITME & HEATMAP
   ========================================== */
function calculateCurrentWPM() {
  const elapsedSec = isTestRunning
    ? Math.max((performance.now() - testStartTimeMs) / 1000, 0.5)
    : Math.max(totalTimeElapsed, 1);
  const minutes = elapsedSec / 60;

  // Hitung karakter kata yang sedang diketik saat ini secara live
  const currentTyped = textInput ? textInput.value : '';
  const targetWord = words[currentWordIndex] || '';
  let liveCorrectInWord = 0;
  for (let i = 0; i < Math.min(currentTyped.length, targetWord.length); i++) {
    if (currentTyped[i] === targetWord[i]) liveCorrectInWord++;
  }

  const totalGross = totalTypedChars + currentTyped.length;
  const totalNet = correctTypedChars + liveCorrectInWord;

  const rawWpm = Math.round((totalGross / 5) / minutes);
  const netWpm = Math.round((totalNet / 5) / minutes);
  const accuracy = totalGross > 0 ? Math.min(100, Math.round((totalNet / totalGross) * 100)) : 100;

  return { netWpm, rawWpm, accuracy, totalGross };
}

function calculateRhythmConsistency() {
  if (keystrokeIntervals.length < 4) return 100;
  const recent = keystrokeIntervals.slice(-35);
  const mean = recent.reduce((a, b) => a + b, 0) / recent.length;
  if (mean <= 0) return 100;

  const variance = recent.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / recent.length;
  const stdDev = Math.sqrt(variance);
  const cv = stdDev / mean; // Coefficient of variation
  const consistency = Math.max(25, Math.min(100, Math.round((1 - cv * 0.85) * 100)));
  return consistency;
}

function updateLiveStats() {
  const { netWpm, rawWpm, accuracy } = calculateCurrentWPM();
  const rhythm = calculateRhythmConsistency();

  document.getElementById('live-wpm').innerText = netWpm;
  document.getElementById('live-raw-wpm').innerText = `(Raw ${rawWpm})`;
  document.getElementById('live-accuracy').innerText = `${accuracy}%`;
  document.getElementById('live-rhythm').innerText = `${rhythm}%`;
}

function updateStreakUI() {
  document.getElementById('live-streak').innerText = `${currentStreak}x`;
}

function trackWeakKey(char) {
  if (!char) return;
  const key = char.toLowerCase();
  if (/^[a-z0-9.,;\-\/]$/.test(key)) {
    sessionMistypedKeys[key] = (sessionMistypedKeys[key] || 0) + 1;
  }
}

function recordKeyLatency(key, deltaMs, isError) {
  if (!key || !/^[a-z0-9.,;\-\/]$/.test(key)) return;
  const stats = JSON.parse(localStorage.getItem('ketikfast_key_stats') || '{}');
  if (!stats[key]) {
    stats[key] = { hits: 0, errors: 0, avgMs: Math.round(deltaMs) };
  }
  stats[key].hits += 1;
  if (isError) stats[key].errors += 1;
  stats[key].avgMs = Math.round((stats[key].avgMs * 0.8) + (deltaMs * 0.2));
  localStorage.setItem('ketikfast_key_stats', JSON.stringify(stats));
}

function refreshKeyboardHeatmapAttributes() {
  const stats = JSON.parse(localStorage.getItem('ketikfast_key_stats') || '{}');
  document.querySelectorAll('.key-btn').forEach(btn => {
    const k = btn.dataset.key;
    btn.removeAttribute('data-heat');
    if (stats[k] && stats[k].hits >= 3) {
      const errRate = stats[k].errors / stats[k].hits;
      const ms = stats[k].avgMs;
      btn.title = `Tombol '${k.toUpperCase()}': Kecepatan rata-rata ${ms}ms | Akurasi ${Math.round((1 - errRate) * 100)}%`;
      if (errRate > 0.18 || ms > 310) {
        btn.setAttribute('data-heat', 'hot');
      } else if (errRate > 0.08 || ms > 210) {
        btn.setAttribute('data-heat', 'warm');
      } else {
        btn.setAttribute('data-heat', 'good');
      }
    }
  });
}

function flushSessionWeaknessesToStorage() {
  // Simpan Weak Keys
  const storedWeak = JSON.parse(localStorage.getItem('ketikfast_weak_keys') || '{}');
  for (let k in sessionMistypedKeys) {
    storedWeak[k] = (storedWeak[k] || 0) + sessionMistypedKeys[k];
  }
  localStorage.setItem('ketikfast_weak_keys', JSON.stringify(storedWeak));

  // Simpan Bigram Latency
  const storedBigrams = JSON.parse(localStorage.getItem('ketikfast_bigrams') || '{}');
  for (let bg in sessionBigramTimes) {
    const arr = sessionBigramTimes[bg];
    const avg = Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
    storedBigrams[bg] = storedBigrams[bg] ? Math.round((storedBigrams[bg] + avg) / 2) : avg;
  }
  localStorage.setItem('ketikfast_bigrams', JSON.stringify(storedBigrams));

  refreshKeyboardHeatmapAttributes();
  updateAdaptivePreviewBadge();
}

function getTopWeakKeys(limit = 4) {
  const stored = JSON.parse(localStorage.getItem('ketikfast_weak_keys') || '{}');
  const combined = { ...stored };
  for (let k in sessionMistypedKeys) {
    combined[k] = (combined[k] || 0) + sessionMistypedKeys[k];
  }
  return Object.keys(combined)
    .sort((a, b) => combined[b] - combined[a])
    .slice(0, limit);
}

function getTopSlowBigrams(limit = 4) {
  const stored = JSON.parse(localStorage.getItem('ketikfast_bigrams') || '{}');
  const combined = { ...stored };
  for (let bg in sessionBigramTimes) {
    const arr = sessionBigramTimes[bg];
    const avg = Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
    combined[bg] = combined[bg] ? Math.round((combined[bg] + avg) / 2) : avg;
  }
  return Object.keys(combined)
    .map(bg => ({ bigram: bg, ms: combined[bg] }))
    .sort((a, b) => b.ms - a.ms)
    .slice(0, limit);
}

function updateAdaptivePreviewBadge() {
  const badge = document.getElementById('adaptive-preview-badge');
  if (!badge) return;
  const topKeys = getTopWeakKeys(3).map(k => k.toUpperCase());
  const topBg = getTopSlowBigrams(2).map(b => b.bigram.toUpperCase());

  if (topKeys.length === 0 && topBg.length === 0) {
    badge.innerText = 'Siap meracik latihan adaptif';
  } else {
    const parts = [];
    if (topKeys.length > 0) parts.push(`Fokus Huruf: ${topKeys.join(', ')}`);
    if (topBg.length > 0) parts.push(`Bigram: ${topBg.join(', ')}`);
    badge.innerText = parts.join(' • ');
  }
}

/* ==========================================
   12. SELESAI TES & GRAFIK TELEMETRI SVG
   ========================================== */
function renderTelemetrySVGChart() {
  const box = document.getElementById('telemetry-chart-box');
  if (!box) return;

  if (telemetryHistory.length < 2) {
    const { netWpm, rawWpm } = calculateCurrentWPM();
    telemetryHistory = [
      { sec: 1, wpm: Math.max(5, Math.round(netWpm * 0.85)), raw: rawWpm, errors: 0 },
      { sec: 2, wpm: netWpm, raw: rawWpm, errors: 0 }
    ];
  }

  const width = 520;
  const height = 115;
  const padX = 28;
  const padY = 16;
  const maxWpm = Math.max(60, ...telemetryHistory.map(d => Math.max(d.wpm, d.raw))) + 10;

  const pts = telemetryHistory.map((d, idx) => {
    const x = padX + (idx / Math.max(1, telemetryHistory.length - 1)) * (width - padX * 2);
    const y = height - padY - (d.wpm / maxWpm) * (height - padY * 2);
    return { x, y, ...d };
  });

  const polylinePoints = pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const areaPoints = `${pts[0].x.toFixed(1)},${height - padY} ${polylinePoints} ${pts[pts.length - 1].x.toFixed(1)},${height - padY}`;

  const errorDots = pts
    .filter(p => p.errors > 0)
    .map(p => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4" fill="#f43f5e" stroke="#ffffff" stroke-width="1"><title>Detik ${p.sec}s: ${p.errors} kesalahan</title></circle>`)
    .join('');

  box.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" class="w-full h-full overflow-visible">
      <defs>
        <linearGradient id="wpmGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#10b981" stop-opacity="0.38"/>
          <stop offset="100%" stop-color="#10b981" stop-opacity="0.0"/>
        </linearGradient>
      </defs>
      <!-- Garis Grid Horizontal -->
      <line x1="${padX}" y1="${padY}" x2="${width - padX}" y2="${padY}" stroke="currentColor" stroke-opacity="0.1" stroke-dasharray="3 3" />
      <line x1="${padX}" y1="${height / 2}" x2="${width - padX}" y2="${height / 2}" stroke="currentColor" stroke-opacity="0.1" stroke-dasharray="3 3" />
      <line x1="${padX}" y1="${height - padY}" x2="${width - padX}" y2="${height - padY}" stroke="currentColor" stroke-opacity="0.2" />
      <!-- Label Sumbu Y -->
      <text x="2" y="${padY + 4}" fill="currentColor" opacity="0.5" font-size="9" font-family="monospace">${maxWpm}</text>
      <text x="2" y="${height / 2 + 3}" fill="currentColor" opacity="0.5" font-size="9" font-family="monospace">${Math.round(maxWpm / 2)}</text>
      <text x="2" y="${height - padY}" fill="currentColor" opacity="0.5" font-size="9" font-family="monospace">0</text>
      <!-- Area & Kurva WPM -->
      <polygon points="${areaPoints}" fill="url(#wpmGrad)" />
      <polyline fill="none" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" points="${polylinePoints}" />
      ${errorDots}
    </svg>
  `;
}

function endGame(reason = "Latihan Selesai") {
  isTestArmed = false;
  isTestRunning = false;
  clearInterval(timerInterval);
  clearInterval(ghostInterval);
  if (metronomeInterval) clearInterval(metronomeInterval);

  if (textInput) textInput.disabled = true;

  const { netWpm, rawWpm, accuracy, totalGross } = calculateCurrentWPM();
  const rhythm = calculateRhythmConsistency();

  flushSessionWeaknessesToStorage();
  saveSessionResult(netWpm, accuracy, rhythm);

  document.getElementById('result-modal-title').innerText = reason;
  document.getElementById('modal-wpm').innerText = `${netWpm} WPM`;
  document.getElementById('modal-raw-wpm').innerText = `Raw: ${rawWpm} WPM`;
  document.getElementById('modal-accuracy').innerText = `${accuracy}%`;
  document.getElementById('modal-chars').innerText = `${totalGross} Karakter (${maxStreak}x Max Streak)`;
  document.getElementById('modal-rhythm').innerText = `${rhythm}%`;
  document.getElementById('modal-time').innerText = `Durasi: ${Math.max(1, totalTimeElapsed)}s`;

  let rank = "Pemula Keyboard";
  if (netWpm >= 85) rank = "⚡ Grandmaster Singularity";
  else if (netWpm >= 65) rank = "🏎️ Pembalap Mekanikal Pro";
  else if (netWpm >= 45) rank = "🚀 Pengetik Sepuluh Jari Tangguh";
  else if (netWpm >= 25) rank = "👍 Pengetik Menengah Presisi";
  document.getElementById('result-rank-title').innerText = rank;

  // Render Weak Keys
  const weakKeys = getTopWeakKeys(5);
  const weakBox = document.getElementById('weak-keys-list');
  if (weakKeys.length > 0) {
    weakBox.innerHTML = weakKeys.map(k => `
      <span class="px-2.5 py-1 rounded-lg bg-rose-500/20 text-rose-300 border border-rose-500/30 uppercase">${k}</span>
    `).join('');
  } else {
    weakBox.innerHTML = `<span class="text-emerald-400">Sempurna! Tanpa kesalahan huruf.</span>`;
  }

  // Render Slowest Bigrams
  const slowBigrams = getTopSlowBigrams(4);
  const bgBox = document.getElementById('slow-bigrams-list');
  if (slowBigrams.length > 0) {
    bgBox.innerHTML = slowBigrams.map(item => `
      <span class="px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/30 uppercase">${item.bigram} <span class="opacity-70 text-[10px]">(${item.ms}ms)</span></span>
    `).join('');
  } else {
    bgBox.innerHTML = `<span class="theme-text-muted">Belum cukup data transisi 2-huruf.</span>`;
  }

  renderTelemetrySVGChart();

  document.getElementById('result-modal').classList.remove('hidden');
  showToast(`🏆 ${reason} • ${netWpm} WPM (${accuracy}%)`);
}

function trainWeaknessesNow() {
  closeResultModal();
  selectMode('words');
  selectSubOption(25);
  selectCategory('adaptive');
  startTypingTest();
  showToast("🧠 Smart Bigram & Weak-Keys AI diaktifkan khusus untukmu!");
}

function cancelTypingTest() {
  isTestArmed = false;
  isTestRunning = false;
  clearInterval(timerInterval);
  clearInterval(ghostInterval);
  if (metronomeInterval) clearInterval(metronomeInterval);

  document.getElementById('typing-test-area').classList.add('hidden');
  document.getElementById('visual-guide-container').classList.add('hidden');
  document.getElementById('setup-panel').classList.remove('hidden');
}

function closeResultModal() {
  document.getElementById('result-modal').classList.add('hidden');
  cancelTypingTest();
}

/* ==========================================
   13. REPLAY PLAYER & PENYIMPANAN HISTORI
   ========================================== */
function openReplayPlayer() {
  if (replayFrames.length === 0) {
    showToast("⚠️ Tidak ada rekaman sesi untuk diputar.");
    return;
  }
  document.getElementById('replay-modal').classList.remove('hidden');
  document.getElementById('replay-status').innerText = "Ready";
  renderReplayFrame(0);
}

function closeReplayModal() {
  if (replayPlaybackInterval) clearInterval(replayPlaybackInterval);
  isReplaying = false;
  document.getElementById('replay-modal').classList.add('hidden');
}

function setReplaySpeed(spd) {
  replaySpeed = spd;
  showToast(`Kecepatan Replay: ${spd}x`);
  if (isReplaying) {
    toggleReplayPlayback();
    toggleReplayPlayback();
  }
}

function renderReplayFrame(frameIndex) {
  const displayBox = document.getElementById('replay-display-box');
  if (!replayFrames[frameIndex]) return;

  const frame = replayFrames[frameIndex];
  displayBox.innerHTML = `
    <div class="w-full flex justify-between text-xs font-mono-custom opacity-60 mb-1">
      <span>Target Kata: "${escapeHTML(frame.wordTarget || '')}"</span>
      <span>Detik: ${frame.time}s | Frame: ${frameIndex + 1}/${replayFrames.length}</span>
    </div>
    <div class="p-4 rounded-xl border w-full font-mono-custom text-2xl flex items-center gap-1 theme-card">
      <span class="${frame.isCorrect ? 'text-emerald-400' : 'text-rose-400'}">${escapeHTML(frame.typedVal)}</span>
      <span class="w-0.5 h-6 bg-blue-500 animate-pulse"></span>
    </div>
  `;
}

function toggleReplayPlayback() {
  const playBtn = document.getElementById('replay-play-btn');
  const statusEl = document.getElementById('replay-status');

  if (isReplaying) {
    clearInterval(replayPlaybackInterval);
    isReplaying = false;
    playBtn.innerText = "▶️ Play Replay";
    statusEl.innerText = "Paused";
  } else {
    isReplaying = true;
    playBtn.innerText = "⏸️ Pause";
    statusEl.innerText = "Playing...";

    let frameIdx = 0;
    replayPlaybackInterval = setInterval(() => {
      if (frameIdx >= replayFrames.length) {
        clearInterval(replayPlaybackInterval);
        isReplaying = false;
        playBtn.innerText = "▶️ Replay Ulang";
        statusEl.innerText = "Selesai";
        return;
      }
      renderReplayFrame(frameIdx);
      frameIdx++;
    }, Math.max(35, 130 / replaySpeed));
  }
}

function getPersonalBest() {
  return parseInt(localStorage.getItem('ketikfast_pb_wpm') || '0', 10);
}

function loadPersonalBest() {
  const pb = getPersonalBest();
  const el = document.getElementById('pb-wpm');
  if (el) el.innerText = `${pb} WPM`;
}

function saveSessionResult(wpm, accuracy, rhythm) {
  const currentPb = getPersonalBest();
  if (wpm > currentPb && accuracy >= 80) {
    localStorage.setItem('ketikfast_pb_wpm', wpm.toString());
    loadPersonalBest();
    showToast(`🎉 REKOR PRIBADI BARU: ${wpm} WPM!`);
  }

  const history = JSON.parse(localStorage.getItem('ketikfast_history') || '[]');
  history.unshift({
    date: new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }),
    wpm: wpm,
    accuracy: accuracy,
    rhythm: rhythm || 100,
    mode: selectedMode,
    cat: selectedMode === 'academy' ? `Academy ${selectedSubOption}` : selectedCategory
  });
  localStorage.setItem('ketikfast_history', JSON.stringify(history.slice(0, 30)));
}

function openHistoryModal() {
  const history = JSON.parse(localStorage.getItem('ketikfast_history') || '[]');
  const container = document.getElementById('history-list-container');

  // Render Top Weak Keys & Slow Bigrams di Modal Analitik
  const weakKeys = getTopWeakKeys(5);
  const weakEl = document.getElementById('analytics-weak-keys');
  if (weakEl) {
    weakEl.innerHTML = weakKeys.length > 0
      ? weakKeys.map(k => `<span class="px-2.5 py-1 rounded-lg bg-rose-500/20 text-rose-300 border border-rose-500/30 font-bold uppercase">${k}</span>`).join('')
      : `<span class="theme-text-muted">Belum ada data kesalahan huruf.</span>`;
  }

  const slowBigrams = getTopSlowBigrams(5);
  const bgEl = document.getElementById('analytics-slow-bigrams');
  if (bgEl) {
    bgEl.innerHTML = slowBigrams.length > 0
      ? slowBigrams.map(b => `<span class="px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold uppercase">${b.bigram} (${b.ms}ms)</span>`).join('')
      : `<span class="theme-text-muted">Belum ada data transisi bigram.</span>`;
  }

  if (history.length === 0) {
    container.innerHTML = `<div class="text-center py-6 text-xs theme-text-muted">Belum ada riwayat latihan. Mulai tes pertamamu!</div>`;
  } else {
    container.innerHTML = history.map(item => `
      <div class="p-3 rounded-xl border flex justify-between items-center text-xs font-mono-custom theme-input-bg">
        <div>
          <div class="font-bold text-sm text-emerald-400">
            ${item.wpm} WPM
            <span class="text-xs text-purple-400 font-normal">(${item.accuracy}% Akurasi)</span>
            <span class="text-xs text-cyan-400 font-normal">&bull; ${item.rhythm || 100}% Ritme</span>
          </div>
          <div class="text-[10px] theme-text-muted">${item.date} &bull; Mode: ${item.mode.toUpperCase()}</div>
        </div>
        <span class="px-2.5 py-1 rounded-lg border text-[10px] font-bold uppercase theme-control-btn">${item.cat}</span>
      </div>
    `).join('');
  }

  document.getElementById('history-modal').classList.remove('hidden');
}

function closeHistoryModal() {
  document.getElementById('history-modal').classList.add('hidden');
}

function clearHistoryData() {
  localStorage.removeItem('ketikfast_history');
  localStorage.removeItem('ketikfast_weak_keys');
  localStorage.removeItem('ketikfast_bigrams');
  localStorage.removeItem('ketikfast_key_stats');
  localStorage.removeItem('ketikfast_pb_wpm');
  loadPersonalBest();
  refreshKeyboardHeatmapAttributes();
  updateAdaptivePreviewBadge();
  openHistoryModal();
  showToast("🗑️ Seluruh data analitik & histori berhasil direset.");
}

function exportData() {
  const data = {
    pb: getPersonalBest(),
    history: JSON.parse(localStorage.getItem('ketikfast_history') || '[]'),
    weakKeys: JSON.parse(localStorage.getItem('ketikfast_weak_keys') || '{}'),
    bigrams: JSON.parse(localStorage.getItem('ketikfast_bigrams') || '{}'),
    keyStats: JSON.parse(localStorage.getItem('ketikfast_key_stats') || '{}')
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `KetikFast_Ultimate2_Backup_${Date.now()}.json`;
  a.click();
  showToast("💾 Data biometrik & histori berhasil diekspor.");
}

function importData(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function (evt) {
    try {
      const parsed = JSON.parse(evt.target.result);
      if (parsed.pb !== undefined) localStorage.setItem('ketikfast_pb_wpm', parsed.pb.toString());
      if (parsed.history) localStorage.setItem('ketikfast_history', JSON.stringify(parsed.history));
      if (parsed.weakKeys) localStorage.setItem('ketikfast_weak_keys', JSON.stringify(parsed.weakKeys));
      if (parsed.bigrams) localStorage.setItem('ketikfast_bigrams', JSON.stringify(parsed.bigrams));
      if (parsed.keyStats) localStorage.setItem('ketikfast_key_stats', JSON.stringify(parsed.keyStats));

      loadPersonalBest();
      refreshKeyboardHeatmapAttributes();
      updateAdaptivePreviewBadge();
      openHistoryModal();
      showToast("📥 Data biometrik & histori berhasil diimpor!");
    } catch (err) {
      showToast("❌ File JSON tidak valid.");
    }
  };
  reader.readAsText(file);
}

/* ==========================================
   14. FUNGSI UTILITAS & NOTIFIKASI TOAST
   ========================================== */
function shuffleArray(arr) {
  const array = [...arr];
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function escapeHTML(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function showToast(msg) {
  const toast = document.getElementById('toast-notification');
  const msgEl = document.getElementById('toast-message');
  if (!toast || !msgEl) return;
  msgEl.innerText = msg;

  toast.classList.remove('opacity-0', 'pointer-events-none', 'translate-y-4');
  toast.classList.add('opacity-100', 'translate-y-0');

  setTimeout(() => {
    toast.classList.remove('opacity-100', 'translate-y-0');
    toast.classList.add('opacity-0', 'pointer-events-none', 'translate-y-4');
  }, 3200);
}
