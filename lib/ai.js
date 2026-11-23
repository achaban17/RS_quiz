// ШІ-помічник учителя: генерує квізи через Claude API (якщо задано ANTHROPIC_API_KEY),
// інакше — складає квіз з вбудованої бази питань (офлайн-режим).
const { normalizeQuestion, uid } = require('./store');
const bank = require('./bank');

const DIRECTION_NAMES = {
  '3d': '3D-графіка (Blender, моделювання, матеріали, освітлення, анімація, рендер)',
  robotics: 'Робототехніка (датчики, мотори, Arduino, LEGO, електроніка, механіка)',
  programming: 'Програмування (алгоритми, Scratch, Python, змінні, цикли, умови, логіка)',
  other: 'Загальні STEM-знання',
};

const TYPE_HINTS = {
  quiz: '"quiz" — 1 правильна з 4 варіантів',
  truefalse: '"truefalse" — правда/неправда (correct: [0] якщо правда, [1] якщо неправда)',
  multi: '"multi" — кілька правильних з 4–5 варіантів (correct: масив індексів)',
  order: '"order" — розстав по порядку: options у ПРАВИЛЬНОМУ порядку (3–5 кроків), учням вони перемішаються',
  input: '"input" — учень вписує коротку відповідь (1–2 слова або число); answers: всі прийнятні варіанти написання',
};


function buildPrompt(p) {
  const types = (p.types && p.types.length ? p.types : Object.keys(TYPE_HINTS)).filter(t => TYPE_HINTS[t]);
  return `Ти — креативний методист дитячої IT-школи Robot School. Склади захопливу онлайн-вікторину в стилі Kahoot українською мовою.

Параметри від учителя:
- Напрямок: ${DIRECTION_NAMES[p.direction] || DIRECTION_NAMES.other}
- Теми, з яких складати питання: ${p.topics || 'на твій розсуд у межах напрямку'}
- Кількість питань: рівно ${p.count}
- Вік учнів: ${p.age || '9–14 років'}
- Складність: ${p.difficulty || 'середня'}
- Час на відповідь: ${p.time} с (можеш дати ±10 с для складніших типів, але не менше 10)
- Дозволені типи питань: ${types.map(t => TYPE_HINTS[t]).join('; ')}
${p.extra ? '- Побажання вчителя: ' + p.extra : ''}

Як зробити вікторину максимально інтерактивною і цікавою:
- Чергуй типи питань, не став два однакові типи поспіль, якщо дозволено кілька типів.
- Пиши коротко і по-дитячому живо: міні-історії, "уяви, що…", ситуації з життя юного 3D-дизайнера / інженера / програміста, загадки, "знайди помилку", "що станеться, якщо…".
- Неправильні варіанти мають бути правдоподібними, іноді — кумедними, але не образливими.
- До кожного питання додай доречний емодзі та "fact" — цікавий факт або коротке пояснення правильної відповіді (1–2 речення), який покажемо після відповіді.
- Кожне 4–5 питання можна зробити "double" (подвійні бали) — бонусний раунд.
- Перевір фактичну правильність кожної відповіді. Терміни програм (Blender, Arduino, Python) пиши як в оригіналі.

Поверни ЛИШЕ JSON без пояснень, у форматі:
{"title":"коротка яскрава назва вікторини без емодзі","description":"1 речення","cover":"один емодзі","questions":[{"type":"quiz","text":"...","emoji":"🎨","time":${p.time},"points":"standard","options":["...","...","...","..."],"correct":[0],"answers":[],"fact":"..."}]}
Для "input" заповни "answers" і залиш options порожнім. Для "truefalse" options можна не вказувати.`;
}

function extractJson(text) {
  text = String(text || '').replace(/```(?:json)?/gi, '');
  let start = text.indexOf('{');
  const arrStart = text.indexOf('[');
  // іноді модель повертає одразу масив питань
  if (arrStart >= 0 && (start < 0 || arrStart < start)) {
    const arr = JSON.parse(text.slice(arrStart, text.lastIndexOf(']') + 1));
    return { questions: arr };
  }
  const end = text.lastIndexOf('}');
  if (start < 0 || end < 0) throw new Error('ШІ не повернув JSON');
  let body = text.slice(start, end + 1);
  try { return JSON.parse(body); } catch (e) {
    body = body.replace(/,\s*([}\]])/g, '$1'); // прибираємо зайві коми
    return JSON.parse(body);
  }
}

// ───────────── Постачальники ШІ ─────────────
// Порядок вибору: Claude (якщо є ключ) → Google Gemini (безкоштовно) → Groq (безкоштовно) → вбудована база.
const sleep = ms => new Promise(r => setTimeout(r, ms));

function providers() {
  const list = [];
  if (process.env.ANTHROPIC_API_KEY) list.push({ id: 'claude', name: 'Claude API', call: callClaude, chunk: 40 });
  if (process.env.GEMINI_API_KEY) list.push({ id: 'gemini', name: 'Google Gemini (безкоштовно)', call: callGemini, chunk: 8 });
  if (process.env.GROQ_API_KEY) list.push({ id: 'groq', name: 'Groq (безкоштовно)', call: callGroq, chunk: 6 });
  return list;
}
function hasKey() { return providers().length > 0; }
function providerName() { const p = providers(); return p.length ? p.map(x => x.name).join(' → ') : ''; }

async function httpJson(url, opts, label) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, opts);
    if (res.status === 429 || res.status === 503) {
      // ліміт безкоштовного тарифу: чекаємо й пробуємо ще раз
      const ra = parseFloat(res.headers.get('retry-after')) || 0;
      const wait = Math.min(Math.max(ra * 1000, 8000 * (attempt + 1)), 60000);
      console.log(`   ${label}: ліміт запитів, чекаю ${Math.round(wait / 1000)} с…`);
      await sleep(wait);
      continue;
    }
    if (!res.ok) throw new Error(`${label}: ${res.status} ${(await res.text()).slice(0, 300)}`);
    return res.json();
  }
  throw new Error(label + ': перевищено ліміт безкоштовних запитів, спробуйте за хвилину');
}

async function callClaude(prompt, maxTokens = 8000) {
  const data = await httpJson('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5', max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] }),
  }, 'Claude API');
  return (data.content || []).map(c => c.text || '').join('');
}

let lastModel = '';
async function callGemini(prompt, maxTokens = 8000) {
  const models = (process.env.GEMINI_MODEL || 'gemini-3.8-flash,gemini-3.5-flash-lite').split(',').map(m => m.trim()).filter(Boolean);
  let lastErr;
  for (const model of models) {
    try {
      const data = await httpJson(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          // великий запас: «думаючі» моделі витрачають частину ліміту на роздуми
          generationConfig: { responseMimeType: 'application/json', temperature: 1, maxOutputTokens: 32768 },
        }),
      }, 'Gemini ' + model);
      const cand = (data.candidates || [])[0] || {};
      const text = (cand.content?.parts || []).filter(p => !p.thought).map(p => p.text || '').join('');
      if (cand.finishReason && !['STOP', 'FINISH_REASON_UNSPECIFIED'].includes(cand.finishReason) && cand.finishReason !== 'MAX_TOKENS') {
        throw new Error(`Gemini ${model}: відповідь зупинено (${cand.finishReason})`);
      }
      if (!text) throw new Error('Gemini ' + model + ': порожня відповідь' + (data.promptFeedback ? ' (' + JSON.stringify(data.promptFeedback).slice(0, 120) + ')' : ''));
      lastModel = model.replace(/^gemini-/, 'Gemini ').replace(/-/g, ' ');
      return text;
    } catch (e) { lastErr = e; console.error('   ' + e.message); }
  }
  throw lastErr;
}

async function callGroq(prompt, maxTokens = 4000) {
  const data = await httpJson('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + process.env.GROQ_API_KEY },
    body: JSON.stringify({
      model: process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
      messages: [{ role: 'system', content: 'Відповідай лише валідним JSON.' }, { role: 'user', content: prompt }],
      temperature: 0.9,
      max_completion_tokens: maxTokens,
    }),
  }, 'Groq');
  return data.choices?.[0]?.message?.content || '';
}

// Генерує питання частинами (безкоштовні тарифи мають ліміти на розмір відповіді)
async function generateWith(provider, p) {
  let meta = null;
  const questions = [];
  let chunk = provider.chunk;
  let fails = 0;
  while (questions.length < p.count) {
    const n = Math.min(chunk, p.count - questions.length);
    let prompt = buildPrompt({ ...p, count: n });
    if (questions.length) prompt += `\n\nЦе продовження вікторини. Не повторюй ці питання: ${questions.map(q => '"' + q.text + '"').join('; ').slice(0, 1500)}. Почни з того типу, якого бракує.`;
    try {
      const raw = extractJson(await provider.call(prompt, Math.min(8000, 600 + n * 450)));
      const got = (raw.questions || []).filter(q => q && q.text);
      if (!got.length) throw new Error('не повернув жодного питання');
      if (!meta) meta = raw;
      questions.push(...got);
      fails = 0;
    } catch (e) {
      // обрізана чи зіпсована відповідь — пробуємо меншою порцією
      fails += 1;
      console.error(`   ${provider.name}: ${e.message} (спроба ${fails})`);
      if (fails >= 3) throw new Error(provider.name + ': ' + e.message);
      chunk = Math.max(2, Math.ceil(chunk / 2));
    }
  }
  return { ...meta, questions: questions.slice(0, p.count) };
}

// Зрозумілі пояснення типових помилок
function friendly(msg) {
  const m = String(msg || '');
  if (/fetch failed|ENOTFOUND|ECONNRESET|ETIMEDOUT|network/i.test(m)) return 'немає зв\'язку із сервісом ШІ. Спробуйте ще раз за хвилину.';
  if (/API key not valid|API_KEY_INVALID|invalid.*key|401/i.test(m)) return 'ключ недійсний. Перевірте значення GEMINI_API_KEY у Render → Environment (без пробілів).';
  if (/PERMISSION_DENIED|403|location is not supported|User location/i.test(m)) return 'доступ заборонено (ключ без дозволу або регіон не підтримується). Створіть новий ключ на aistudio.google.com/apikey.';
  if (/429|ліміт|RESOURCE_EXHAUSTED|quota/i.test(m)) return 'вичерпано безкоштовний ліміт запитів. Зачекайте кілька хвилин або спробуйте завтра.';
  if (/404|not found|NOT_FOUND/i.test(m)) return 'модель не знайдено. Якщо задано GEMINI_MODEL — видаліть цю змінну в Render.';
  if (/JSON|Unexpected token|не повернув/i.test(m)) return 'ШІ відповів у неправильному форматі. Спробуйте ще раз або зменште кількість питань.';
  return m.slice(0, 200);
}

// Перевірка, чи працює ШІ (результат кешується на 5 хвилин)
let statusCache = null;
async function status(force) {
  if (!force && statusCache && Date.now() - statusCache.at < 5 * 60 * 1000) return statusCache.data;
  const list = providers();
  let data;
  if (!list.length) data = { ok: false, configured: false, message: 'Ключ ШІ не підключено. Додайте GEMINI_API_KEY у налаштуваннях Render (Environment).' };
  else {
    const errors = [];
    for (const prov of list) {
      try {
        const raw = extractJson(await prov.call('Поверни лише JSON: {"ok": true, "word": "робот"}', 200));
        if (raw && raw.ok) { data = { ok: true, configured: true, provider: prov.name, model: prov.id === 'gemini' ? lastModel : prov.name }; break; }
        errors.push(prov.name + ': дивна відповідь');
      } catch (e) { errors.push(e.message); }
    }
    if (!data) data = { ok: false, configured: true, message: 'ШІ недоступний: ' + friendly(errors.join(' | ')) };
  }
  statusCache = { at: Date.now(), data };
  return data;
}

async function generateQuiz(params) {
  const p = {
    direction: params.direction || '3d',
    count: Math.max(1, Math.min(40, parseInt(params.count, 10) || 10)),
    time: Math.max(5, Math.min(240, parseInt(params.time, 10) || 20)),
    topics: String(params.topics || '').slice(0, 600),
    age: String(params.age || '').slice(0, 40),
    difficulty: String(params.difficulty || '').slice(0, 40),
    types: Array.isArray(params.types) ? params.types : [],
    extra: String(params.extra || '').slice(0, 400),
  };

  let raw = null;
  let source = 'offline';
  let warning = '';
  if (params.source === 'bank') {
    raw = bank.compose(p);
    if (raw.questions.length < p.count) warning = `У базі знайшлося лише ${raw.questions.length} питань для цього напрямку.`;
  } else {
    if (!providers().length) throw Object.assign(new Error('ШІ не підключено: додайте GEMINI_API_KEY у налаштуваннях Render (Environment) або оберіть «З бази».'), { code: 'no_ai' });
    const errors = [];
    for (const prov of providers()) {
      try {
        raw = await generateWith(prov, p);
        source = 'ai';
        statusCache = { at: Date.now(), data: { ok: true, configured: true, provider: prov.name, model: prov.id === 'gemini' ? lastModel : prov.name } };
        console.log(`   Квіз згенеровано: ${prov.name}`);
        break;
      } catch (e) {
        console.error(`Помилка генерації (${prov.name}):`, e.message);
        errors.push(e.message);
      }
    }
    if (!raw) {
      statusCache = null;
      throw Object.assign(new Error('ШІ не зміг скласти квіз: ' + friendly(errors.join(' | '))), { code: 'ai_failed' });
    }
  }

  const questions = (raw.questions || []).slice(0, p.count).map(q => normalizeQuestion(q, p.time));
  return {
    source,
    warning,
    quiz: {
      id: uid(),
      title: String(raw.title || 'Новий квіз').replace(/^[^\p{L}\p{N}]+/u, '') || 'Новий квіз',
      description: raw.description || '',
      cover: raw.cover || '🤖',
      direction: p.direction,
      defaultTime: p.time,
      topics: p.topics,
      ai: true,
      questions,
    },
  };
}

async function regenerateQuestion(params) {
  const p = {
    direction: params.direction || '3d',
    topics: String(params.topics || '').slice(0, 600),
    time: Math.max(5, Math.min(240, parseInt(params.time, 10) || 20)),
    type: params.type,
    avoid: String(params.avoid || '').slice(0, 400),
  };
  for (const prov of providers()) {
    try {
      const prompt = `${buildPrompt({ ...p, count: 1, types: p.type ? [p.type] : [] })}

Склади лише ОДНЕ нове питання${p.type ? ' типу "' + p.type + '"' : ''}, яке відрізняється від цього: "${p.avoid}".`;
      const raw = extractJson(await prov.call(prompt, 1500));
      const q = (raw.questions || [raw])[0];
      if (!q || !q.text) throw new Error('порожнє питання');
      return { source: 'ai', question: normalizeQuestion(q, p.time) };
    } catch (e) {
      console.error(`Помилка регенерації (${prov.name}):`, e.message);
    }
  }
  const raw = bank.compose({ ...p, count: 1, types: p.type ? [p.type] : [], avoidText: p.avoid });
  return { source: 'offline', question: normalizeQuestion(raw.questions[0], p.time) };
}

module.exports = { generateQuiz, regenerateQuestion, hasKey, providerName, status };
