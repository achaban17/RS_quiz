// Зберігання квізів адміністратора.
// • Локально — у файлі data/quizzes.json.
// • На хостингу без постійного диска (напр. Render Free) — у вашому GitHub-репозиторії
//   (окрема гілка quiz-data), якщо задано GITHUB_TOKEN і GITHUB_REPO.
// Дані учнів (нікнейми, аватари, бали) сюди НЕ потрапляють — вони живуть лише в пам'яті під час гри.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const FILE = path.join(DATA_DIR, 'quizzes.json');

const GH = {
  token: process.env.GITHUB_TOKEN || '',
  repo: process.env.GITHUB_REPO || '', // формат: користувач/назва-репозиторію
  branch: process.env.GITHUB_DATA_BRANCH || 'quiz-data',
  path: 'data/quizzes.json',
  sha: null,
};
const ghEnabled = () => !!(GH.token && GH.repo);

let cache = null;
let meta = { seededIds: [] }; // які стартові квізи курсів уже імпортовано (щоб видалені не поверталися)
const META_FILE = path.join(DATA_DIR, 'meta.json');
const SEED_FILE = path.join(__dirname, '..', 'data', 'course-quizzes.json');

function readJson(file, def) {
  try { return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : def; } catch (e) { return def; }
}
function writeMetaFile() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(META_FILE, JSON.stringify(meta, null, 2), 'utf8');
  } catch (e) { console.error('Не вдалося записати meta.json:', e.message); }
}

function readFileList() {
  try {
    if (!fs.existsSync(FILE)) return [];
    const list = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    return Array.isArray(list) ? list : [];
  } catch (e) {
    console.error('Не вдалося прочитати quizzes.json:', e.message);
    return [];
  }
}
function writeFileList(list) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(list, null, 2), 'utf8');
    fs.renameSync(tmp, FILE);
  } catch (e) { console.error('Не вдалося записати quizzes.json:', e.message); }
}

// ── GitHub ──
async function gh(method, url, body) {
  const res = await fetch('https://api.github.com' + url, {
    method,
    headers: {
      authorization: 'Bearer ' + GH.token,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      'user-agent': 'robot-school-quiz',
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function ensureBranch() {
  const r = await gh('GET', `/repos/${GH.repo}/git/ref/heads/${encodeURIComponent(GH.branch)}`);
  if (r.status === 200) return;
  const repo = await gh('GET', `/repos/${GH.repo}`);
  if (repo.status !== 200) throw new Error(`Репозиторій ${GH.repo} недоступний (${repo.status}). Перевірте GITHUB_REPO і права токена.`);
  const base = await gh('GET', `/repos/${GH.repo}/git/ref/heads/${encodeURIComponent(repo.data.default_branch)}`);
  const c = await gh('POST', `/repos/${GH.repo}/git/refs`, { ref: 'refs/heads/' + GH.branch, sha: base.data.object.sha });
  if (c.status >= 300) throw new Error('Не вдалося створити гілку ' + GH.branch + ': ' + (c.data.message || c.status));
  console.log(`   GitHub: створено гілку «${GH.branch}» для зберігання квізів`);
}

async function ghLoad() {
  await ensureBranch();
  const r = await gh('GET', `/repos/${GH.repo}/contents/${GH.path}?ref=${encodeURIComponent(GH.branch)}`);
  if (r.status === 404) return null;
  if (r.status !== 200) throw new Error('GitHub: ' + (r.data.message || r.status));
  GH.sha = r.data.sha;
  let text;
  if (r.data.content) text = Buffer.from(r.data.content, 'base64').toString('utf8');
  else { // великі файли (>1 МБ) віддаються без content
    const raw = await fetch(r.data.download_url, { headers: { authorization: 'Bearer ' + GH.token } });
    text = await raw.text();
  }
  const list = JSON.parse(text);
  return Array.isArray(list) ? list : [];
}

async function ghLoadMeta() {
  const r = await gh('GET', `/repos/${GH.repo}/contents/data/meta.json?ref=${encodeURIComponent(GH.branch)}`);
  if (r.status !== 200) return null;
  GH.metaSha = r.data.sha;
  try { return JSON.parse(Buffer.from(r.data.content, 'base64').toString('utf8')); } catch (e) { return null; }
}
async function ghPushMeta(retry = true) {
  const content = Buffer.from(JSON.stringify(meta, null, 2), 'utf8').toString('base64');
  const r = await gh('PUT', `/repos/${GH.repo}/contents/data/meta.json`, {
    message: 'Оновлено службові дані квізів', content, branch: GH.branch, ...(GH.metaSha ? { sha: GH.metaSha } : {}),
  });
  if (r.status === 200 || r.status === 201) { GH.metaSha = r.data.content.sha; return; }
  if ((r.status === 409 || r.status === 422) && retry) {
    const cur = await gh('GET', `/repos/${GH.repo}/contents/data/meta.json?ref=${encodeURIComponent(GH.branch)}`);
    GH.metaSha = cur.status === 200 ? cur.data.sha : null;
    return ghPushMeta(false);
  }
  throw new Error(r.data.message || 'статус ' + r.status);
}

// Додає стартові квізи курсів (data/course-quizzes.json), яких ще не було імпортовано.
// Відредаговані чи видалені вчителем квізи не перезаписуються і не повертаються.
function importSeeds() {
  const seeds = readJson(SEED_FILE, []);
  if (!Array.isArray(seeds) || !seeds.length) return 0;
  const done = new Set(meta.seededIds || []);
  const have = new Set(cache.map(q => q.id));
  let added = 0;
  for (const sq of seeds) {
    if (!sq || !sq.id || done.has(sq.id)) continue;
    if (!have.has(sq.id)) { cache.push(normalizeQuiz(sq)); added++; }
    done.add(sq.id);
  }
  meta.seededIds = [...done];
  return added;
}

let pushTimer = null;
let pushing = Promise.resolve();
function schedulePush() {
  if (!ghEnabled()) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => { pushing = pushing.then(ghPush).catch(e => console.error('GitHub-збереження:', e.message)); }, 1500);
}
async function ghPush(retry = true) {
  const content = Buffer.from(JSON.stringify(cache, null, 2), 'utf8').toString('base64');
  const r = await gh('PUT', `/repos/${GH.repo}/contents/${GH.path}`, {
    message: `Оновлено квізи (${new Date().toISOString().slice(0, 16).replace('T', ' ')})`,
    content, branch: GH.branch, ...(GH.sha ? { sha: GH.sha } : {}),
  });
  if (r.status === 200 || r.status === 201) { GH.sha = r.data.content.sha; return; }
  if ((r.status === 409 || r.status === 422) && retry) {
    const cur = await gh('GET', `/repos/${GH.repo}/contents/${GH.path}?ref=${encodeURIComponent(GH.branch)}`);
    GH.sha = cur.status === 200 ? cur.data.sha : null;
    return ghPush(false);
  }
  throw new Error(r.data.message || 'статус ' + r.status);
}

async function init() {
  const local = readFileList();
  meta = Object.assign({ seededIds: [] }, readJson(META_FILE, {}));
  if (ghEnabled()) {
    try {
      const remote = await ghLoad();
      const remoteMeta = await ghLoadMeta();
      if (remoteMeta) meta = Object.assign({ seededIds: [] }, remoteMeta);
      if (remote) cache = remote;
      else { cache = local; await ghPush(); console.log('   GitHub: стартові квізи збережено в репозиторій'); }
      const added = importSeeds();
      if (added || !remoteMeta) {
        if (added) await ghPush();
        await ghPushMeta();
        if (added) console.log(`   Додано стартових квізів курсів: ${added}`);
      }
      writeFileList(cache); writeMetaFile();
      console.log(`   Квізи зберігаються в GitHub: ${GH.repo} (гілка ${GH.branch}) ✅`);
      return;
    } catch (e) {
      console.error('⚠️  Не вдалося підключитися до GitHub-сховища:', e.message);
      console.error('    Квізи зберігатимуться лише локально і можуть зникнути після перезапуску хостингу!');
    }
  }
  cache = local;
  const added = importSeeds();
  if (added) { writeFileList(cache); console.log(`   Додано стартових квізів курсів: ${added}`); }
  writeMetaFile();
}

function persist() { writeFileList(cache); schedulePush(); }

const uid = () => crypto.randomBytes(6).toString('hex');

const TYPES = ['quiz', 'truefalse', 'multi', 'order', 'input'];
const DIRECTIONS = ['3d', 'robotics', 'programming', 'other'];

function clampInt(v, min, max, def) {
  const n = parseInt(v, 10);
  if (Number.isNaN(n)) return def;
  return Math.max(min, Math.min(max, n));
}

function str(v, max = 300) {
  return String(v == null ? '' : v).slice(0, max);
}

// Приводить питання до коректної структури (захист від зламаних даних з ШІ чи редактора)
function normalizeQuestion(q, defaultTime = 20) {
  q = q || {};
  let type = TYPES.includes(q.type) ? q.type : 'quiz';
  const out = {
    id: q.id ? str(q.id, 40) : uid(),
    type,
    text: str(q.text, 400),
    emoji: str(q.emoji || '', 16),
    time: clampInt(q.time, 5, 240, defaultTime),
    points: ['standard', 'double', 'none'].includes(q.points) ? q.points : 'standard',
    fact: str(q.fact || '', 400),
    options: [],
    correct: [],
    answers: [],
  };
  if (type === 'truefalse') {
    out.options = ['Правда', 'Неправда'];
    let c = Array.isArray(q.correct) ? q.correct[0] : q.correct;
    if (c === true || c === 'true') c = 0;
    if (c === false || c === 'false') c = 1;
    out.correct = [c === 1 ? 1 : 0];
  } else if (type === 'input') {
    const ans = Array.isArray(q.answers) ? q.answers : (q.answers ? [q.answers] : []);
    out.answers = ans.map(a => str(a, 80).trim()).filter(Boolean).slice(0, 8);
    if (!out.answers.length) out.answers = [''];
  } else if (type === 'order') {
    const opts = Array.isArray(q.options) ? q.options : [];
    out.options = opts.map(o => str(o, 120)).filter(o => o.trim()).slice(0, 6);
    while (out.options.length < 3) out.options.push('');
    // для order правильний порядок = порядок options
  } else {
    const opts = Array.isArray(q.options) ? q.options : [];
    out.options = opts.map(o => str(o, 120)).slice(0, 6);
    while (out.options.length < 2) out.options.push('');
    let corr = Array.isArray(q.correct) ? q.correct : (q.correct != null ? [q.correct] : [0]);
    corr = [...new Set(corr.map(n => parseInt(n, 10)).filter(n => n >= 0 && n < out.options.length))];
    if (!corr.length) corr = [0];
    if (type === 'quiz') corr = [corr[0]];
    out.correct = corr;
  }
  return out;
}

function normalizeQuiz(q) {
  q = q || {};
  const defTime = clampInt(q.defaultTime, 5, 240, 20);
  return {
    id: q.id ? str(q.id, 40) : uid(),
    title: str(q.title || 'Новий квіз', 120),
    description: str(q.description || '', 400),
    direction: DIRECTIONS.includes(q.direction) ? q.direction : 'other',
    cover: str(q.cover || '🤖', 16),
    defaultTime: defTime,
    topics: str(q.topics || '', 400),
    course: str(q.course || '', 80).trim(),
    courseOrder: clampInt(q.courseOrder, 0, 9999, 9999),
    quizOrder: clampInt(q.quizOrder, 0, 9999, 0),
    lessons: str(q.lessons || '', 40),
    age: str(q.age || '', 40),
    ai: !!q.ai,
    createdAt: q.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    questions: (Array.isArray(q.questions) ? q.questions : []).slice(0, 100).map(x => normalizeQuestion(x, defTime)),
  };
}

const all = () => { if (!cache) cache = readFileList(); return cache; };

module.exports = {
  init,
  storageInfo: () => (ghEnabled() ? `GitHub (${GH.repo}, гілка ${GH.branch})` : 'локальний файл data/quizzes.json'),
  list() { return all(); },
  get(id) { return all().find(q => q.id === id) || null; },
  save(quiz) {
    const list = all();
    const norm = normalizeQuiz(quiz);
    const i = list.findIndex(q => q.id === norm.id);
    if (i >= 0) { norm.createdAt = list[i].createdAt; list[i] = norm; } else list.unshift(norm);
    persist();
    return norm;
  },
  remove(id) {
    const list = all();
    const i = list.findIndex(q => q.id === id);
    if (i < 0) return false;
    list.splice(i, 1);
    persist();
    return true;
  },
  normalizeQuiz,
  normalizeQuestion,
  uid,
};
