// Robot School Quiz — сервер онлайн-вікторин.
// Запуск: npm install && npm start  →  http://localhost:3000
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const QRCode = require('qrcode');

// Підхоплюємо .env, якщо він є (без додаткових залежностей)
try {
  const fs = require('fs');
  const envFile = path.join(__dirname, '.env');
  if (fs.existsSync(envFile)) {
    for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
} catch (_) { /* ignore */ }

const store = require('./lib/store');
const ai = require('./lib/ai');

const PORT = parseInt(process.env.PORT, 10) || 3000;
// Фіксовані облікові дані адміністратора (за вимогою)
const ADMIN_LOGIN = 'robotschool';
const ADMIN_PASSWORD = 'bender2015';

const app = express();
app.set('trust proxy', 1); // коректні IP за проксі хостингу (Render тощо)
app.get('/healthz', (req, res) => res.json({ ok: true }));
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));
app.use('/fonts/montserrat', express.static(path.join(__dirname, 'node_modules/@fontsource/montserrat')));
app.use('/fonts/nunito', express.static(path.join(__dirname, 'node_modules/@fontsource/nunito')));

// ───────────── Авторизація адміністратора ─────────────
const tokens = new Map(); // token -> expiresAt
const TOKEN_TTL = 1000 * 60 * 60 * 12;
const loginAttempts = new Map(); // ip -> {count, until}

function isAdmin(token) {
  const exp = token && tokens.get(token);
  if (!exp) return false;
  if (exp < Date.now()) { tokens.delete(token); return false; }
  return true;
}
function requireAdmin(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!isAdmin(token)) return res.status(401).json({ error: 'Потрібен вхід адміністратора' });
  next();
}
function safeEqual(a, b) {
  const ba = Buffer.from(String(a)); const bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

app.post('/api/login', (req, res) => {
  const ip = req.ip;
  const att = loginAttempts.get(ip) || { count: 0, until: 0 };
  if (att.until > Date.now()) return res.status(429).json({ error: 'Забагато спроб. Зачекайте хвилину.' });
  const { login, password } = req.body || {};
  if (safeEqual(String(login || '').trim().toLowerCase(), ADMIN_LOGIN) && safeEqual(password || '', ADMIN_PASSWORD)) {
    loginAttempts.delete(ip);
    const token = crypto.randomBytes(24).toString('hex');
    tokens.set(token, Date.now() + TOKEN_TTL);
    return res.json({ token });
  }
  att.count += 1;
  if (att.count >= 5) { att.until = Date.now() + 60000; att.count = 0; }
  loginAttempts.set(ip, att);
  res.status(401).json({ error: 'Невірний логін або пароль' });
});
app.post('/api/logout', requireAdmin, (req, res) => {
  tokens.delete((req.headers.authorization || '').replace(/^Bearer\s+/i, ''));
  res.json({ ok: true });
});
app.get('/api/me', requireAdmin, (req, res) => res.json({ ok: true, ai: ai.hasKey() }));

// ───────────── Квізи ─────────────
app.get('/api/quizzes', requireAdmin, (req, res) => {
  res.json(store.list().map(q => ({
    id: q.id, title: q.title, description: q.description, direction: q.direction, cover: q.cover,
    count: q.questions.length, ai: q.ai, updatedAt: q.updatedAt, createdAt: q.createdAt,
  })));
});
app.get('/api/quizzes/:id', requireAdmin, (req, res) => {
  const q = store.get(req.params.id);
  if (!q) return res.status(404).json({ error: 'Квіз не знайдено' });
  res.json(q);
});
app.post('/api/quizzes', requireAdmin, (req, res) => res.json(store.save(req.body)));
app.put('/api/quizzes/:id', requireAdmin, (req, res) => res.json(store.save({ ...req.body, id: req.params.id })));
app.delete('/api/quizzes/:id', requireAdmin, (req, res) => res.json({ ok: store.remove(req.params.id) }));
app.post('/api/quizzes/:id/duplicate', requireAdmin, (req, res) => {
  const q = store.get(req.params.id);
  if (!q) return res.status(404).json({ error: 'Квіз не знайдено' });
  const copy = JSON.parse(JSON.stringify(q));
  copy.id = store.uid(); copy.title = q.title + ' (копія)'; copy.createdAt = null;
  copy.questions.forEach(x => { x.id = store.uid(); });
  res.json(store.save(copy));
});

// ───────────── ШІ-помічник ─────────────
app.post('/api/generate', requireAdmin, async (req, res) => {
  try { res.json(await ai.generateQuiz(req.body || {})); }
  catch (e) { console.error(e); res.status(500).json({ error: 'Не вдалося згенерувати квіз: ' + e.message }); }
});
app.post('/api/regenerate-question', requireAdmin, async (req, res) => {
  try { res.json(await ai.regenerateQuestion(req.body || {})); }
  catch (e) { console.error(e); res.status(500).json({ error: 'Не вдалося згенерувати питання: ' + e.message }); }
});

// ───────────── Допоміжне ─────────────
app.get('/api/qr', async (req, res) => {
  try {
    const svg = await QRCode.toString(String(req.query.data || '').slice(0, 300), {
      type: 'svg', margin: 1, color: { dark: '#0A2A8A', light: '#FFFFFF' },
    });
    res.type('image/svg+xml').send(svg);
  } catch (e) { res.status(400).end(); }
});
function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push(a.address);
  }
  return out;
}
app.get('/api/network', (req, res) => res.json({ port: PORT, addresses: lanAddresses() }));
app.get('/api/game/:pin', (req, res) => {
  const room = rooms.get(String(req.params.pin));
  if (!room || room.state === 'ended') return res.status(404).json({ error: 'Гру з таким кодом не знайдено' });
  res.json({ ok: true, title: room.quiz.title, cover: room.quiz.cover, locked: room.locked, started: room.state !== 'lobby' });
});

// ───────────── Ігрові кімнати (лише в пам'яті!) ─────────────
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: false } });
const rooms = new Map(); // pin -> room

const AVATAR_LIMITS = { body: 5, color: 12, eyes: 8, mouth: 7, antenna: 6, hat: 10, glasses: 7, neck: 7, hand: 6, bg: 10 };
function cleanAvatar(a) {
  const out = {};
  for (const [k, max] of Object.entries(AVATAR_LIMITS)) {
    const n = parseInt(a && a[k], 10);
    out[k] = Number.isInteger(n) && n >= 0 && n < max ? n : 0;
  }
  return out;
}
const BAD_WORDS = ['хуй', 'хуя', 'пизд', 'бля', 'єба', 'еба', 'їба', 'сука', 'нахуй', 'fuck', 'shit', 'bitch', 'дебіл', 'дурак', 'дурень', 'лох', 'гівно', 'говно', 'жоп'];
function cleanNick(n) {
  n = String(n || '').replace(/[\u0000-\u001F<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16);
  return n;
}
function isBadNick(n) {
  const low = n.toLowerCase().replace(/[^a-zа-яіїєґ]/g, '');
  return BAD_WORDS.some(w => low.includes(w));
}
function makePin() {
  let pin;
  do { pin = String(Math.floor(100000 + Math.random() * 900000)); } while (rooms.has(pin));
  return pin;
}
function shuffledPerm(n) {
  if (n < 2) return [0];
  let p;
  do {
    p = [...Array(n).keys()];
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  } while (p.every((v, i) => v === i));
  return p;
}
const norm = s => String(s || '').toLowerCase().replace(/[’'`ʼ"«»().,!?]/g, '').replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();

function publicPlayer(p) {
  return { id: p.id, nickname: p.nickname, avatar: p.avatar, score: p.score, streak: p.streak, connected: !!p.socketId };
}
function ranking(room) {
  return [...room.players.values()].sort((a, b) => b.score - a.score || a.joinedAt - b.joinedAt);
}
function questionForClients(room) {
  const q = room.quiz.questions[room.qIndex];
  const base = {
    index: room.qIndex, total: room.quiz.questions.length, type: q.type, text: q.text, emoji: q.emoji,
    time: q.time, points: q.points, endsAt: room.qEndsAt, serverNow: Date.now(),
  };
  if (q.type === 'order') base.options = room.perm.map(i => q.options[i]);
  else if (q.type !== 'input') base.options = q.options;
  if (q.type === 'multi') base.needed = q.correct.length;
  return base;
}
function correctAnswerView(q) {
  if (q.type === 'input') return { answers: q.answers };
  if (q.type === 'order') return { order: q.options };
  return { correct: q.correct, options: q.options };
}

function emitLobby(room) {
  io.to(room.hostRoom).emit('host:players', [...room.players.values()].map(publicPlayer));
}

function startQuestion(room) {
  clearTimeout(room.timer);
  const q = room.quiz.questions[room.qIndex];
  room.state = 'question';
  room.answers = new Map();
  room.perm = q.type === 'order' ? shuffledPerm(q.options.length) : null;
  room.qStartedAt = Date.now() + 3000; // 3 секунди на «Приготуйся!»
  room.qEndsAt = room.qStartedAt + q.time * 1000;
  const payload = questionForClients(room);
  payload.startsAt = room.qStartedAt;
  io.to(room.hostRoom).emit('host:question', payload);
  io.to(room.playersRoom).emit('game:question', payload);
  room.timer = setTimeout(() => revealQuestion(room), room.qEndsAt - Date.now() + 400);
}

function checkAnswer(room, q, answer) {
  if (q.type === 'quiz' || q.type === 'truefalse') return Number(answer) === q.correct[0];
  if (q.type === 'multi') {
    const sel = Array.isArray(answer) ? [...new Set(answer.map(Number))].sort() : [];
    const cor = [...q.correct].sort();
    return sel.length === cor.length && sel.every((v, i) => v === cor[i]);
  }
  if (q.type === 'order') {
    if (!Array.isArray(answer) || answer.length !== q.options.length) return false;
    return answer.every((displayIdx, pos) => room.perm[Number(displayIdx)] === pos);
  }
  if (q.type === 'input') {
    const a = norm(answer);
    return !!a && q.answers.some(x => norm(x) === a);
  }
  return false;
}

function revealQuestion(room) {
  if (room.state !== 'question') return;
  clearTimeout(room.timer);
  room.state = 'reveal';
  const q = room.quiz.questions[room.qIndex];
  const base = q.points === 'double' ? 2000 : q.points === 'none' ? 0 : 1000;
  const total = q.time * 1000;
  const stats = { counts: q.type === 'input' || q.type === 'order' ? [0, 0] : q.options.map(() => 0), correct: 0, answered: 0, inputs: {} };

  for (const p of room.players.values()) {
    const a = room.answers.get(p.id);
    let ok = false; let gained = 0;
    if (a) {
      stats.answered += 1;
      ok = checkAnswer(room, q, a.answer);
      if (q.type === 'quiz' || q.type === 'truefalse') { const i = Number(a.answer); if (stats.counts[i] != null) stats.counts[i] += 1; }
      else if (q.type === 'multi') (Array.isArray(a.answer) ? a.answer : []).forEach(i => { if (stats.counts[i] != null) stats.counts[i] += 1; });
      else stats.counts[ok ? 0 : 1] += 1;
      if (q.type === 'input') { const k = String(a.answer).trim().slice(0, 30); if (k) stats.inputs[k] = (stats.inputs[k] || 0) + 1; }
      if (ok) {
        const t = Math.min(Math.max(a.at - room.qStartedAt, 0), total);
        gained = Math.round(base * (1 - 0.5 * (t / total)));
        p.streak += 1;
        if (p.streak >= 2 && base > 0) gained += Math.min(100 * (p.streak - 1), 500);
        stats.correct += 1;
      } else p.streak = 0;
    } else p.streak = 0;
    p.score += gained;
    p.last = { ok, gained, answered: !!a };
  }
  const rank = ranking(room);
  rank.forEach((p, i) => { p.rank = i + 1; });
  const view = correctAnswerView(q);
  // топ «вписаних» відповідей для вчителя
  stats.inputs = Object.entries(stats.inputs).sort((a, b) => b[1] - a[1]).slice(0, 6);
  io.to(room.hostRoom).emit('host:reveal', { index: room.qIndex, stats, answer: view, fact: q.fact, total: room.players.size });
  for (const p of room.players.values()) {
    if (!p.socketId) continue;
    const ahead = p.rank > 1 ? rank[p.rank - 2] : null;
    io.to(p.socketId).emit('game:result', {
      ok: p.last.ok, answered: p.last.answered, gained: p.last.gained, score: p.score, streak: p.streak, rank: p.rank,
      players: room.players.size, behind: ahead ? { nickname: ahead.nickname, diff: ahead.score - p.score } : null,
      answer: view, fact: q.fact, type: q.type,
    });
  }
  if (room.auto) room.timer = setTimeout(() => showLeaderboard(room), 7000);
}

function showLeaderboard(room) {
  clearTimeout(room.timer);
  if (room.qIndex >= room.quiz.questions.length - 1) return finishGame(room);
  room.state = 'leaderboard';
  io.to(room.hostRoom).emit('host:leaderboard', { top: ranking(room).slice(0, 5).map(publicPlayer), index: room.qIndex, total: room.quiz.questions.length });
  io.to(room.playersRoom).emit('game:wait', { text: 'Дивись на екран — таблиця лідерів!' });
  if (room.auto) room.timer = setTimeout(() => { room.qIndex += 1; startQuestion(room); }, 5000);
}

function finishGame(room) {
  clearTimeout(room.timer);
  room.state = 'ended';
  const rank = ranking(room);
  const podium = rank.slice(0, 5).map(publicPlayer);
  io.to(room.hostRoom).emit('host:end', { podium, players: room.players.size });
  rank.forEach((p, i) => {
    if (p.socketId) io.to(p.socketId).emit('game:end', { rank: i + 1, score: p.score, players: rank.length, podium: podium.slice(0, 3) });
  });
  destroyRoom(room, 1500);
}

// Повністю видаляємо кімнату: нікнейми, аватари й бали ніде не залишаються
function destroyRoom(room, delay = 0) {
  setTimeout(() => {
    clearTimeout(room.timer); clearTimeout(room.hostGone);
    io.in(room.playersRoom).socketsLeave(room.playersRoom);
    io.in(room.hostRoom).socketsLeave(room.hostRoom);
    room.players.clear();
    rooms.delete(room.pin);
  }, delay);
}

io.on('connection', socket => {
  // ── Вчитель ──
  socket.on('host:create', ({ token, quizId, auto } = {}, ack = () => {}) => {
    if (!isAdmin(token)) return ack({ error: 'Потрібен вхід адміністратора' });
    const quiz = store.get(quizId);
    if (!quiz) return ack({ error: 'Квіз не знайдено' });
    const playable = quiz.questions.filter(q => q.text.trim());
    if (!playable.length) return ack({ error: 'У квізі немає жодного питання' });
    const pin = makePin();
    const room = {
      pin, quiz: { ...quiz, questions: playable }, players: new Map(), state: 'lobby', qIndex: 0, auto: !!auto,
      locked: false, hostSocket: socket.id, hostRoom: 'h:' + pin, playersRoom: 'p:' + pin, createdAt: Date.now(),
    };
    rooms.set(pin, room);
    socket.join(room.hostRoom);
    socket.data.hostPin = pin;
    ack({ pin, title: quiz.title, cover: quiz.cover, total: playable.length });
  });

  socket.on('host:resume', ({ token, pin } = {}, ack = () => {}) => {
    const room = rooms.get(String(pin));
    if (!room || !isAdmin(token)) return ack({ error: 'Гру не знайдено' });
    clearTimeout(room.hostGone);
    room.hostSocket = socket.id; socket.join(room.hostRoom); socket.data.hostPin = room.pin;
    ack({ pin: room.pin, title: room.quiz.title, cover: room.quiz.cover, total: room.quiz.questions.length, state: room.state });
    emitLobby(room);
    // після обриву зв'язку повертаємо вчителю поточне питання
    if (room.state === 'question') {
      socket.emit('host:question', { ...questionForClients(room), startsAt: room.qStartedAt });
      socket.emit('host:answered', { count: room.answers.size, total: room.players.size });
    }
  });

  const hostRoomOf = () => {
    const room = rooms.get(socket.data.hostPin);
    return room && room.hostSocket === socket.id ? room : null;
  };

  socket.on('host:start', () => {
    const room = hostRoomOf();
    if (!room || room.state !== 'lobby' || !room.players.size) return;
    room.qIndex = 0; startQuestion(room);
  });
  socket.on('host:skip', () => { const room = hostRoomOf(); if (room) revealQuestion(room); });
  socket.on('host:next', () => {
    const room = hostRoomOf(); if (!room) return;
    if (room.state === 'reveal') showLeaderboard(room);
    else if (room.state === 'leaderboard') { room.qIndex += 1; startQuestion(room); }
  });
  socket.on('host:auto', v => { const room = hostRoomOf(); if (room) room.auto = !!v; });
  socket.on('host:lock', v => { const room = hostRoomOf(); if (room) { room.locked = !!v; } });
  socket.on('host:kick', playerId => {
    const room = hostRoomOf(); if (!room) return;
    const p = room.players.get(playerId); if (!p) return;
    if (p.socketId) { io.to(p.socketId).emit('game:kicked'); io.sockets.sockets.get(p.socketId)?.leave(room.playersRoom); }
    room.players.delete(playerId);
    emitLobby(room);
  });
  socket.on('host:end', () => {
    const room = hostRoomOf(); if (!room) return;
    if (room.state === 'lobby') { io.to(room.playersRoom).emit('game:closed'); destroyRoom(room); }
    else finishGame(room);
  });

  // ── Учень ──
  socket.on('player:join', ({ pin, nickname, avatar } = {}, ack = () => {}) => {
    const room = rooms.get(String(pin || '').trim());
    if (!room || room.state === 'ended') return ack({ error: 'Гру з таким кодом не знайдено 🙁' });
    if (room.locked) return ack({ error: 'Учитель закрив вхід до гри' });
    const nick = cleanNick(nickname);
    if (nick.length < 2) return ack({ error: 'Нікнейм має містити хоча б 2 символи' });
    if (isBadNick(nick)) return ack({ error: 'Обери, будь ласка, інший нікнейм 🙂' });
    if ([...room.players.values()].some(p => p.nickname.toLowerCase() === nick.toLowerCase())) return ack({ error: 'Такий нікнейм уже є в грі — додай до нього щось своє!' });
    if (room.players.size >= 200) return ack({ error: 'У грі вже забагато гравців' });
    const id = crypto.randomBytes(8).toString('hex');
    const player = { id, nickname: nick, avatar: cleanAvatar(avatar), score: 0, streak: 0, joinedAt: Date.now(), socketId: socket.id };
    room.players.set(id, player);
    socket.join(room.playersRoom);
    socket.data.pin = room.pin; socket.data.playerId = id;
    ack({ ok: true, playerId: id, title: room.quiz.title, cover: room.quiz.cover, state: room.state });
    emitLobby(room);
    if (room.state === 'question') socket.emit('game:question', { ...questionForClients(room), startsAt: room.qStartedAt });
    else if (room.state !== 'lobby') socket.emit('game:wait', { text: 'Ти в грі! Наступне питання вже скоро…' });
  });

  // Повернення після обриву зв'язку (дані лише в пам'яті сервера на час гри)
  socket.on('player:rejoin', ({ pin, playerId } = {}, ack = () => {}) => {
    const room = rooms.get(String(pin));
    const p = room && room.players.get(playerId);
    if (!p || room.state === 'ended') return ack({ error: 'gone' });
    p.socketId = socket.id;
    socket.join(room.playersRoom);
    socket.data.pin = room.pin; socket.data.playerId = p.id;
    ack({ ok: true, nickname: p.nickname, avatar: p.avatar, score: p.score, title: room.quiz.title, cover: room.quiz.cover, state: room.state });
    emitLobby(room);
    if (room.state === 'question' && !room.answers.has(p.id)) socket.emit('game:question', { ...questionForClients(room), startsAt: room.qStartedAt });
    else if (room.state !== 'lobby') socket.emit('game:wait', { text: 'З поверненням! Чекаємо наступне питання…' });
  });

  socket.on('player:avatar', avatar => {
    const room = rooms.get(socket.data.pin);
    const p = room && room.players.get(socket.data.playerId);
    if (!p) return;
    p.avatar = cleanAvatar(avatar);
    emitLobby(room);
  });

  socket.on('player:answer', ({ answer } = {}, ack = () => {}) => {
    const room = rooms.get(socket.data.pin);
    if (!room || room.state !== 'question') return ack({ error: 'late' });
    const p = room.players.get(socket.data.playerId);
    if (!p || room.answers.has(p.id)) return ack({ error: 'dup' });
    const now = Date.now();
    if (now > room.qEndsAt + 500) return ack({ error: 'late' });
    const q = room.quiz.questions[room.qIndex];
    if (q.type === 'input') answer = String(answer || '').slice(0, 80);
    else if (Array.isArray(answer)) answer = answer.slice(0, 8).map(Number);
    else answer = Number(answer);
    room.answers.set(p.id, { answer, at: now });
    ack({ ok: true });
    io.to(room.hostRoom).emit('host:answered', { count: room.answers.size, total: room.players.size });
    const connected = [...room.players.values()].filter(x => x.socketId).length;
    if (room.answers.size >= connected) setTimeout(() => revealQuestion(room), 600);
  });

  socket.on('player:leave', () => leavePlayer(true));
  socket.on('disconnect', () => {
    leavePlayer(false);
    const room = rooms.get(socket.data.hostPin);
    if (room && room.hostSocket === socket.id) {
      // даємо вчителю 2 хвилини, щоб повернутися (наприклад, після оновлення сторінки)
      room.hostGone = setTimeout(() => {
        io.to(room.playersRoom).emit('game:closed');
        destroyRoom(room);
      }, 120000);
    }
  });

  function leavePlayer(forever) {
    const room = rooms.get(socket.data.pin);
    const p = room && room.players.get(socket.data.playerId);
    if (!p || p.socketId !== socket.id) return;
    if (forever || room.state === 'lobby') room.players.delete(p.id);
    else p.socketId = null;
    socket.data.pin = null;
    emitLobby(room);
  }
});

// Страховка: прибираємо «завислі» кімнати старші за 4 години
setInterval(() => {
  for (const room of rooms.values()) if (Date.now() - room.createdAt > 4 * 3600 * 1000) destroyRoom(room);
}, 10 * 60 * 1000);

store.init().finally(() => server.listen(PORT, () => {
  const lan = lanAddresses();
  console.log('\n🤖 Robot School Quiz запущено!');
  console.log(`   На цьому комп'ютері:   http://localhost:${PORT}`);
  lan.forEach(a => console.log(`   Для учнів у мережі:    http://${a}:${PORT}`));
  console.log(`   Адмін-панель:          http://localhost:${PORT}/admin`);
  console.log(`   Сховище квізів: ${store.storageInfo()}`);
  console.log(`   ШІ-генерація: ${ai.hasKey() ? 'Claude API ✅' : 'офлайн-база (додайте ANTHROPIC_API_KEY у файл .env для ШІ)'}\n`);
}));
