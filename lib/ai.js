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

function hasKey() { return !!process.env.ANTHROPIC_API_KEY; }

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

async function callClaude(prompt, maxTokens = 8000) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5',
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error('Claude API: ' + res.status + ' ' + t.slice(0, 300));
  }
  const data = await res.json();
  return (data.content || []).map(c => c.text || '').join('');
}

function shuffleOrderOk(q) {
  // перемішування для order відбувається під час гри; тут нічого не робимо
  return q;
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

  let raw;
  let source = 'offline';
  if (hasKey()) {
    try {
      const text = await callClaude(buildPrompt(p));
      raw = extractJson(text);
      source = 'ai';
    } catch (e) {
      console.error('Помилка генерації ШІ, використовую вбудовану базу:', e.message);
      raw = null;
    }
  }
  if (!raw) raw = bank.compose(p);

  const questions = (raw.questions || []).slice(0, p.count).map(q => shuffleOrderOk(normalizeQuestion(q, p.time)));
  return {
    source,
    quiz: {
      id: uid(),
      title: raw.title || 'Новий квіз',
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
  if (hasKey()) {
    try {
      const prompt = `${buildPrompt({ ...p, count: 1, types: p.type ? [p.type] : [] })}

Склади лише ОДНЕ нове питання${p.type ? ' типу "' + p.type + '"' : ''}, яке відрізняється від цього: "${p.avoid}".`;
      const raw = extractJson(await callClaude(prompt, 1500));
      const q = (raw.questions || [raw])[0];
      return { source: 'ai', question: normalizeQuestion(q, p.time) };
    } catch (e) {
      console.error('Помилка регенерації ШІ:', e.message);
    }
  }
  const raw = bank.compose({ ...p, count: 1, types: p.type ? [p.type] : [], avoidText: p.avoid });
  return { source: 'offline', question: normalizeQuestion(raw.questions[0], p.time) };
}

module.exports = { generateQuiz, regenerateQuestion, hasKey };
