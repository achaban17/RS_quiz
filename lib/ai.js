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
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end < 0) throw new Error('ШІ не повернув JSON');
  return JSON.parse(text.slice(start, end + 1));
}

// ───────────── Постачальники ШІ ─────────────
// Порядок вибору: Claude (якщо є ключ) → Google Gemini (безкоштовно) → Groq (безкоштовно) → вбудована база.
const sleep = ms => new Promise(r => setTimeout(r, ms));

function providers() {
  const list = [];
  if (process.env.ANTHROPIC_API_KEY) list.push({ id: 'claude', name: 'Claude API', call: callClaude, chunk: 40 });
  if (process.env.GEMINI_API_KEY) list.push({ id: 'gemini', name: 'Google Gemini (безкоштовно)', call: callGemini, chunk: 15 });
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
          generationConfig: { responseMimeType: 'application/json', temperature: 0.9, maxOutputTokens: Math.max(maxTokens * 2, 4000) },
        }),
      }, 'Gemini ' + model);
      const text = ((data.candidates || [])[0]?.content?.parts || []).map(p => p.text || '').join('');
      if (!text) throw new Error('Gemini ' + model + ': порожня відповідь' + (data.promptFeedback ? ' (' + JSON.stringify(data.promptFeedback).slice(0, 120) + ')' : ''));
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
  while (questions.length < p.count) {
    const n = Math.min(provider.chunk, p.count - questions.length);
    let prompt = buildPrompt({ ...p, count: n });
    if (questions.length) prompt += `\n\nЦе продовження вікторини. Не повторюй ці питання: ${questions.map(q => '"' + q.text + '"').join('; ').slice(0, 1500)}. Почни з того типу, якого бракує.`;
    const raw = extractJson(await provider.call(prompt, Math.min(8000, 600 + n * 450)));
    if (!meta) meta = raw;
    const got = (raw.questions || []).filter(q => q && q.text);
    if (!got.length) throw new Error(provider.name + ': не повернув питань');
    questions.push(...got);
  }
  return { ...meta, questions: questions.slice(0, p.count) };
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
  for (const prov of providers()) {
    try {
      raw = await generateWith(prov, p);
      source = 'ai';
      console.log(`   Квіз згенеровано: ${prov.name}`);
      break;
    } catch (e) {
      console.error(`Помилка генерації (${prov.name}):`, e.message);
      warning = e.message;
    }
  }
  if (!raw) raw = bank.compose(p);

  const questions = (raw.questions || []).slice(0, p.count).map(q => normalizeQuestion(q, p.time));
  return {
    source,
    warning: source === 'offline' && warning ? 'ШІ зараз недоступний, тому квіз зібрано з вбудованої бази. ' + warning.slice(0, 160) : '',
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

module.exports = { generateQuiz, regenerateQuestion, hasKey, providerName };
