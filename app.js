/*************************************************
 * Storage Keys
 *************************************************/
const SRS_KEY = "srs_v5";
const DAILY_KEY = "daily_v5";

/*************************************************
 * Time constants (ms)
 *************************************************/
const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

function now() {
  return Date.now();
}

/*************************************************
 * SRS interval (5 grades)
 * 1 AGAIN : 5 min
 * 2 HARD  : 6 hours
 * 3 OK    : 12 hours
 * 4 GOOD  : 72 hours (3 days)
 * 5 EASY  : 12 days
 *************************************************/
function nextIntervalMs(grade) {
  switch (grade) {
    case 1: return 5 * MIN;
    case 2: return 6 * HOUR;
    case 3: return 12 * HOUR;
    case 4: return 3 * DAY;
    case 5: return 12 * DAY;
    default: return 3 * DAY;
  }
}

/*************************************************
 * Load / Save SRS
 *************************************************/
function loadSrs() {
  return JSON.parse(localStorage.getItem(SRS_KEY)) || {};
}
function saveSrs() {
  localStorage.setItem(SRS_KEY, JSON.stringify(srs));
}
let srs = loadSrs();

/*************************************************
 * Daily goal
 *************************************************/
function loadDaily() {
  return JSON.parse(localStorage.getItem(DAILY_KEY)) || {
    day: new Date().toDateString(),
    goodCount: 0,
    goal: 10
  };
}
function saveDaily() {
  localStorage.setItem(DAILY_KEY, JSON.stringify(daily));
}
let daily = loadDaily();

function ensureDaily() {
  const today = new Date().toDateString();
  if (daily.day !== today) {
    daily = { day: today, goodCount: 0, goal: daily.goal || 10 };
    saveDaily();
  }
}

/*************************************************
 * State
 *************************************************/
let cards = [];
let cardsByMode = [];
let index = 0;

let revealed = false;
let showNote = false;
let currentAnswer = "";

/*************************************************
 * DOM
 *************************************************/
// Views
const homeView  = document.getElementById("homeView");
const studyView = document.getElementById("studyView");

// Home buttons
const homeDueBtn   = document.getElementById("homeDue");
const homeVideoBtn= document.getElementById("homeVideo");

// Study elements
const jpEl   = document.getElementById("jp");
const enEl   = document.getElementById("en");
const cardEl = document.getElementById("card");
const noteEl = document.getElementById("noteText");

// Nav
const backHomeBtn = document.getElementById("backHome");
const videoBtn = document.getElementById("videoOrder");
const nextBtn  = document.getElementById("next");
const reviewBtn = document.getElementById("review");

// SRS buttons
const g1 = document.getElementById("g1");
const g2 = document.getElementById("g2");
const g3 = document.getElementById("g3");
const g4 = document.getElementById("g4");
const g5 = document.getElementById("g5");

/*************************************************
 * View switching
 *************************************************/
function showHome() {
  homeView.classList.remove("hidden");
  studyView.classList.add("hidden");
  renderProgress();
  renderDaily();
  renderBlockButtons();
  renderSceneButtons();
}

function showStudy() {
  homeView.classList.add("hidden");
  studyView.classList.remove("hidden");
  render();
}

/*************************************************
 * CSV Loader
 * header:
 * no,jp,en,slots,video,lv,note,scene
 *************************************************/
async function loadCSV() {
  const res = await fetch("data.csv");
  const text = await res.text();
  cards = parseCSV(text);

  cardsByMode = getCardsByBlock(1);
  index = 0;
  resetCardView();

  renderBlockButtons();
  renderSceneButtons();
  showHome();
}

function parseCSV(text) {
  const lines = text.trim().split("\n");
  lines.shift(); // header

  return lines.map(line => {
    const cols = splitCSV(line);

    const no = Number(cols[0]);
    const jp = cols[1] || "";
    const en = cols[2] || "";
    const slotsRaw = cols[3] || "";
    const video = cols[4] || "";
    const lv = Number(cols[5] || "1");
    const note = cols[6] || "";
    const scene = cols[7] || "";

    let slots = null;
    if (slotsRaw) {
      slots = slotsRaw.split("|").map(s => {
        const [jpSlot, enSlot] = s.split("=");
        return { jp: jpSlot, en: enSlot };
      });
    }

    return { no, jp, en, slots, video, lv, note, scene };
  });
}

function splitCSV(line) {
  const result = [];
  let cur = "";
  let inQuotes = false;

  for (let c of line) {
    if (c === '"') inQuotes = !inQuotes;
    else if (c === "," && !inQuotes) {
      result.push(cur);
      cur = "";
    } else cur += c;
  }
  result.push(cur);
  return result.map(s => s.replace(/^"|"$/g, ""));
}

/*************************************************
 * Helpers
 *************************************************/
function resetCardView() {
  revealed = false;
  showNote = false;
}

function getBlockIndex(no) {
  return Math.floor((no - 1) / 30) + 1;
}

function getCardsByBlock(blockIndex) {
  return cards
    .filter(c => getBlockIndex(c.no) === blockIndex)
    .sort((a, b) => a.no - b.no);
}

function getMaxBlock() {
  if (!cards.length) return 1;
  return Math.ceil(Math.max(...cards.map(c => c.no)) / 30);
}

/*************************************************
 * Progress (block-based)
 *************************************************/
function getBlockProgress(blockIndex) {
  const list = getCardsByBlock(blockIndex);
  const total = list.length;
  const learned = list.filter(c => {
    const s = srs[c.no];
    return s && s.intervalMs >= 12 * HOUR; // OK以上を「学習済み」扱い
  }).length;
  return { learned, total };
}

function getCurrentBlockIndex() {
  if (!cardsByMode.length) return 1;
  return getBlockIndex(cardsByMode[0].no);
}

function renderProgress() {
  const textEl = document.getElementById("progressText");
  const barEl  = document.getElementById("progressBar");
  if (!textEl || !barEl) return;

  const { learned, total } = getBlockProgress(getCurrentBlockIndex());
  textEl.textContent = `進捗：${learned} / ${total}`;
  barEl.style.width = total ? `${Math.round((learned / total) * 100)}%` : "0%";
}

/*************************************************
 * Daily
 *************************************************/
function renderDaily() {
  ensureDaily();
  const textEl = document.getElementById("dailyText");
  const barEl  = document.getElementById("dailyBar");
  if (!textEl || !barEl) return;

  const done = daily.goodCount || 0;
  const goal = daily.goal || 10;
  textEl.textContent = `今日: ${Math.min(done, goal)} / ${goal}`;
  barEl.style.width = goal ? `${Math.min(100, Math.round((done / goal) * 100))}%` : "0%";
}

/*************************************************
 * Scene
 *************************************************/
function getScenes() {
  return [...new Set(cards.map(c => c.scene).filter(Boolean))];
}

function startScene(scene) {
  cardsByMode = cards.filter(c => c.scene === scene).sort((a,b)=>a.no-b.no);
  index = 0;
  resetCardView();
  showStudy();
}

function renderSceneButtons() {
  const wrap = document.getElementById("scenes");
  if (!wrap) return;
  wrap.innerHTML = "";

  const allBtn = document.createElement("button");
  allBtn.textContent = "ALL";
  allBtn.onclick = () => startVideoOrder(true);
  wrap.appendChild(allBtn);

  getScenes().forEach(sc => {
    const btn = document.createElement("button");
    btn.textContent = sc;
    btn.onclick = () => startScene(sc);
    wrap.appendChild(btn);
  });
}

/*************************************************
 * Block buttons
 *************************************************/
function renderBlockButtons() {
  const wrap = document.getElementById("blocks");
  if (!wrap) return;

  wrap.innerHTML = "";
  const max = getMaxBlock();

  for (let b = 1; b <= max; b++) {
    const { learned, total } = getBlockProgress(b);
    const percent = total ? Math.round((learned / total) * 100) : 0;

    const btn = document.createElement("button");
    btn.textContent = `${(b-1)*30+1}-${b*30} ${percent}%`;
    btn.onclick = () => {
      cardsByMode = getCardsByBlock(b);
      index = 0;
      resetCardView();
      showStudy();
    };
    wrap.appendChild(btn);
  }
}

/*************************************************
 * Study modes
 *************************************************/
function startVideoOrder(goStudy=false) {
  cardsByMode = [...cards].sort((a,b)=>a.no-b.no);
  index = 0;
  resetCardView();
  if (goStudy) showStudy();
  else render();
}

function startReviewDue(goStudy=false) {
  const due = cards.filter(c => {
    const d = srs[c.no]?.dueAt ?? Infinity;
    return d <= now();
  });

  if (!due.length) {
    alert("復習（Due）はありません");
    return;
  }

  cardsByMode = due.sort((a,b)=>a.no-b.no);
  index = 0;
  resetCardView();
  if (goStudy) showStudy();
  else render();
}

/*************************************************
 * Card rendering
 *************************************************/
function pickSlot(card) {
  if (!card.slots) return null;
  return card.slots[Math.floor(Math.random() * card.slots.length)];
}

function renderNote(card) {
  if (!noteEl) return;
  noteEl.textContent = (showNote && card.note) ? `💡 ${card.note}` : "";
}

function render() {
  if (!cardsByMode.length) return;

  const card = cardsByMode[index];
  const slot = pickSlot(card);

  if (slot) {
    jpEl.textContent = card.jp.replace("{x}", slot.jp);
    currentAnswer = card.en.replace("{x}", slot.en);
    enEl.textContent = revealed ? currentAnswer : card.en.replace("{x}", "___");
  } else {
    jpEl.textContent = card.jp;
    currentAnswer = card.en;
    enEl.textContent = revealed ? currentAnswer : "タップして答え";
  }

  renderNote(card);
  renderProgress();
  renderDaily();
}

/*************************************************
 * Grade (5-step SRS)
 *************************************************/
function gradeCard(grade) {
  const card = cardsByMode[index];
  const intervalMs = nextIntervalMs(grade);

  srs[card.no] = {
    intervalMs,
    dueAt: now() + intervalMs
  };
  saveSrs();

  if (grade >= 3) {
    ensureDaily();
    daily.goodCount++;
    saveDaily();
  }

  renderBlockButtons();
  goNext();
}

function goNext() {
  index = (index + 1) % cardsByMode.length;
  resetCardView();
  render();
}

/*************************************************
 * Events
 *************************************************/
// Home
homeDueBtn.onclick   = () => startReviewDue(true);
homeVideoBtn.onclick = () => startVideoOrder(true);

// Study
backHomeBtn.onclick = showHome;
videoBtn.onclick = () => startVideoOrder(false);
reviewBtn.onclick = () => startReviewDue(false);
nextBtn.onclick = goNext;

g1.onclick = () => gradeCard(1);
g2.onclick = () => gradeCard(2);
g3.onclick = () => gradeCard(3);
g4.onclick = () => gradeCard(4);
g5.onclick = () => gradeCard(5);

cardEl.onclick = () => {
  revealed = !revealed;
  showNote = revealed;
  enEl.textContent = revealed ? currentAnswer : "タップして答え";
  renderNote(cardsByMode[index]);
};

/*************************************************
 * Init
 *************************************************/
loadCSV();
