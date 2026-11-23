// Екран ведучого (великий екран у класі): лобі з кодом, питання, статистика, лідери, подіум.
(function (global) {
  const { $, $$, esc, ANSWER_STYLE, TYPE_LABEL, toast, confetti } = FX;
  let socket = null;
  let root = null;
  let st = null; // стан гри на екрані ведучого
  let raf = null;
  let clockOffset = 0;
  let onExit = () => {};

  const HKEY = 'rs-host';

  function stop() {
    cancelAnimationFrame(raf);
    SFX.lobbyStop();
    if (socket) { socket.disconnect(); socket = null; }
    st = null;
  }

  async function start(quizId, token, exitCb, opts = {}) {
    stop();
    onExit = exitCb || (() => {});
    root = $('#v-host');
    root.innerHTML = `<div class="center"><div class="spinner"></div></div>`;
    st = { quizId, token, players: [], auto: false, locked: false, joinUrl: '', mode: opts.mode || 'classic', teamCount: opts.teams || 2, teams: [], prev: {} };
    st.joinBase = await joinBase();
    socket = io({ transports: ['websocket', 'polling'] });
    bind();
    let saved = null;
    try { saved = JSON.parse(sessionStorage.getItem(HKEY) || 'null'); } catch (_) {}
    socket.on('connect', () => {
      if (st.pin) {
        socket.emit('host:resume', { token, pin: st.pin }, r => {
          if (!r || r.error) { if (st.phase !== 'end') gameGone(); return; }
          if ((r.state === 'reveal' || r.state === 'leaderboard') && (st.phase === 'question' || st.phase === 'ready')) waitingNext();
        });
        return;
      }
      if (saved && saved.quizId === quizId) {
        socket.emit('host:resume', { token, pin: saved.pin }, r => {
          if (r && !r.error) { Object.assign(st, { pin: r.pin, title: r.title, cover: r.cover, total: r.total, mode: r.mode || st.mode, teams: r.teams || [] }); if (r.state === 'lobby') lobby(); else waitingNext(); }
          else create();
        });
      } else create();
    });
  }

  function create() {
    socket.emit('host:create', { token: st.token, quizId: st.quizId, auto: st.auto, mode: st.mode, teams: st.teamCount }, r => {
      if (!r || r.error) { toast(r ? r.error : 'Помилка', 'bad'); onExit(); return; }
      Object.assign(st, { pin: r.pin, title: r.title, cover: r.cover, total: r.total, players: [], mode: r.mode, teams: r.teams || [], prev: {} });
      try { sessionStorage.setItem(HKEY, JSON.stringify({ pin: r.pin, quizId: st.quizId })); } catch (_) {}
      lobby();
    });
  }

  async function joinBase() {
    let base = location.origin;
    if (/^(localhost|127\.|\[::1\])/.test(location.hostname)) {
      try {
        const n = await (await fetch('/api/network')).json();
        if (n.addresses && n.addresses.length) base = `${location.protocol}//${n.addresses[0]}:${location.port || n.port}`;
      } catch (_) {}
    }
    return base;
  }

  function bar(extra = '') {
    const m = Art.MODES[st.mode] || Art.MODES.classic;
    return `<div class="host-bar"><a class="logo" href="#/">${Art.logoHTML()}</a>
      <div class="head" style="font-size:18px;opacity:.9">${esc(st.cover || '')} ${esc(st.title || '')}</div><span class="mode-banner" style="font-size:14px;padding:6px 12px">${m.emoji} ${esc(m.name)}</span><div class="spacer"></div>${extra}</div>`;
  }

  // ── Лобі ──
  function lobby() {
    st.phase = 'lobby';
    const url = `${st.joinBase}/?pin=${st.pin}`;
    const shown = st.joinBase.replace(/^https?:\/\//, '');
    root.innerHTML = `${bar(`
        <label class="toggle"><input type="checkbox" id="h-auto" ${st.auto ? 'checked' : ''}> Авто-режим</label>
        <label class="toggle"><input type="checkbox" id="h-lock" ${st.locked ? 'checked' : ''}> Закрити вхід</label>
        <button class="btn btn-sm btn-ghost" id="h-cancel">✕ Скасувати</button>`)}
      <div class="pin-box anim-up">
        <div class="pin-card"><div class="lbl2">1. Відкрийте сайт:</div><div class="url">${esc(shown)}</div>
          <div class="lbl2" style="margin-top:10px">2. Введіть код гри:</div><div class="pin">${st.pin.slice(0, 3)} ${st.pin.slice(3)}</div></div>
        <div class="pin-card qr"><img src="/api/qr?data=${encodeURIComponent(url)}" alt="QR-код для входу"><div class="lbl2" style="font-size:13px">або скануйте 📱</div></div>
      </div>
      <div class="lobby-info">
        <div class="count-pill">👥 <span id="h-count">0</span> гравців</div>
        <div class="white" style="font-weight:800;max-width:520px;text-align:center">${(Art.MODES[st.mode] || Art.MODES.classic).emoji} ${esc((Art.MODES[st.mode] || Art.MODES.classic).desc)}</div>
        <button class="btn btn-lg" id="h-start" disabled>▶ Почати гру</button>
      </div>
      <div class="players-wall" id="h-wall"></div>`;
    $('#h-auto').onchange = e => { st.auto = e.target.checked; socket.emit('host:auto', st.auto); };
    $('#h-lock').onchange = e => { st.locked = e.target.checked; socket.emit('host:lock', st.locked); };
    $('#h-start').onclick = () => { SFX.lobbyStop(); socket.emit('host:start'); };
    $('#h-cancel').onclick = () => { if (confirm('Скасувати гру? Учні повернуться на головну.')) { socket.emit('host:end'); clearSaved(); onExit(); } };
    $('#h-wall').onclick = e => {
      const p = e.target.closest('.pl'); if (!p || !p.dataset.id) return;
      if (confirm(`Прибрати гравця «${p.dataset.name}» з гри?`)) socket.emit('host:kick', p.dataset.id);
    };
    drawPlayers();
    if (!SFX.isMuted()) SFX.lobbyStart();
  }

  function drawPlayers() {
    const wall = $('#h-wall'); if (!wall) return;
    $('#h-count').textContent = st.players.length;
    $('#h-start').disabled = !st.players.length;
    if (!st.players.length) {
      wall.className = 'players-wall'; wall.style.gridTemplateColumns = '';
      wall.innerHTML = `<div class="waiting-robots"><div style="width:170px;margin:0 auto">${Art.mascot({ pose: 'wave' })}</div>Чекаємо на гравців<span class="dots"></span></div>`;
      return;
    }
    const existing = new Set($$('.pl', wall).map(x => x.dataset.id));
    // перемальовуємо, але анімуємо лише нових
    const card = p => `<div class="pl ${p.connected ? '' : 'off'}" data-id="${esc(p.id)}" data-name="${esc(p.nickname)}" style="${existing.has(p.id) ? 'animation:none' : ''}">${Robot.svg(p.avatar)}<span>${esc(p.nickname)}</span></div>`;
    if (st.mode === 'towers' && st.teams.length) {
      wall.className = 'team-cols'; wall.style.gridTemplateColumns = `repeat(${st.teams.length}, 1fr)`;
      wall.innerHTML = st.teams.map((t, i) => {
        const ps = st.players.filter(p => p.team === i);
        return `<div class="team-col" style="border-color:${t.color}"><h3><span>${t.emoji}</span>${esc(t.name)} <span class="count-pill" style="font-size:14px;padding:4px 10px">${ps.length}</span></h3>
          <div style="display:flex;justify-content:center"><span style="width:64px;display:block">${Art.brick(t.color)}</span></div><div class="players-wall">${ps.map(card).join('')}</div></div>`;
      }).join('');
      return;
    }
    wall.className = 'players-wall'; wall.style.gridTemplateColumns = '';
    wall.innerHTML = st.players.map(card).join('');
  }

  // ── Події сервера ──
  function bind() {
    socket.on('host:players', list => {
      const before = st.players.length;
      st.players = list;
      if (st.phase === 'lobby') { drawPlayers(); if (list.length > before) SFX.join(); }
    });
    socket.on('host:question', q => { clockOffset = q.serverNow - Date.now(); st.q = q; st.answered = 0; getReady(q); });
    socket.on('host:answered', d => { st.answered = d.count; const el = $('#h-answered'); if (el) { el.textContent = d.count; el.classList.remove('anim-pop'); void el.offsetWidth; el.classList.add('anim-pop'); } });
    socket.on('host:reveal', reveal);
    socket.on('host:leaderboard', leaderboard);
    socket.on('host:end', end);
    socket.on('disconnect', () => { if (st && st.phase !== 'end') toast('Перепідключаюсь до сервера…'); });
  }

  function gameGone() { clearSaved(); toast('Гру завершено', 'bad'); onExit(); }
  function clearSaved() { try { sessionStorage.removeItem(HKEY); } catch (_) {} }

  function waitingNext() {
    st.phase = 'wait';
    root.innerHTML = bar() + `<div class="center"><div class="big-emoji">⏳</div><h2>Зв'язок відновлено</h2><button class="btn btn-lg" id="h-next">Далі ➜</button></div>`;
    $('#h-next').onclick = () => socket.emit('host:next');
  }

  // ── Приготуйся ──
  function getReady(q) {
    st.phase = 'ready';
    cancelAnimationFrame(raf);
    SFX.lobbyStop();
    const t = TYPE_LABEL[q.type];
    root.innerHTML = bar(`<div class="count-pill" style="font-size:16px">${q.index + 1} / ${q.total}</div>`) + `
      <div class="center" style="text-align:center">
        <div class="qtype-pill">${t.icon} ${t.name}</div>
        ${q.points === 'double' ? '<div class="double-badge">⚡ ПОДВІЙНІ БАЛИ ⚡</div>' : ''}
        <div class="head anim-zoom" style="font-size:clamp(28px,4vw,54px);max-width:1100px">${esc(q.emoji || '')} ${esc(q.text)}</div>
        <div class="countdown" id="h-cd" style="font-size:90px">3</div>
      </div>`;
    const startsIn = q.startsAt - clockOffset - Date.now();
    let n = Math.max(1, Math.ceil(startsIn / 1000));
    const tick = () => {
      const el = $('#h-cd'); if (!el || st.phase !== 'ready') return;
      el.textContent = n; el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
      SFX.count(n); n--;
      if (n > 0) setTimeout(tick, 1000);
    };
    tick();
    setTimeout(() => { if (st.q === q && st.phase === 'ready') question(q); }, Math.max(0, startsIn));
  }

  // ── Питання ──
  function optionsHtml(q, reveal) {
    if (q.type === 'order') {
      const order = reveal ? reveal.answer.order : q.options;
      return `<div class="order-show">${order.map((o, i) => `<div class="oi" style="animation-delay:${i * 120}ms"><b>${reveal ? i + 1 : '?'}</b>${esc(o)}</div>`).join('')}</div>`;
    }
    if (q.type === 'input') {
      if (!reveal) return `<div class="center"><div class="big-emoji">⌨️</div><div class="head" style="font-size:28px">Учні вписують відповідь на своїх пристроях</div></div>`;
      return `<div class="center" style="gap:12px"><div class="head" style="font-size:22px;opacity:.85">Правильна відповідь:</div>
        <div class="pin-card"><div class="pin" style="font-size:54px;letter-spacing:0">${esc(reveal.answer.answers[0] || '')}</div>${reveal.answer.answers.length > 1 ? `<div class="lbl2">також: ${esc(reveal.answer.answers.slice(1).join(', '))}</div>` : ''}</div>
        ${reveal.stats.inputs.length ? `<div class="row wrap" style="justify-content:center">${reveal.stats.inputs.map(([t, c]) => `<span class="count-pill" style="font-size:18px">«${esc(t)}» × ${c}</span>`).join('')}</div>` : ''}</div>`;
    }
    return `<div class="host-answers">${q.options.map((o, i) => {
      const s = q.type === 'truefalse' ? { cls: i ? 'tf-false' : 'tf-true', icon: i ? '👎' : '👍' } : ANSWER_STYLE[i];
      const cls = reveal ? (reveal.answer.correct.includes(i) ? 'right' : 'wrong') : '';
      return `<div class="ans ${s.cls} ${cls}"><span class="ic">${s.icon}</span><span>${esc(o)}</span>${reveal ? `<span class="cnt">${reveal.stats.counts[i] || 0}</span>` : ''}</div>`;
    }).join('')}</div>`;
  }

  function question(q) {
    st.phase = 'question';
    const C = 2 * Math.PI * 64;
    root.innerHTML = bar(`<div class="count-pill" style="font-size:16px">${q.index + 1} / ${q.total}</div><button class="btn btn-sm btn-white" id="h-skip">⏭ Завершити питання</button>`) + `
      <div class="host-q">
        <div class="qcard anim-up">${q.emoji ? `<span class="em">${esc(q.emoji)}</span>` : ''}<span>${esc(q.text)}</span></div>
        <div class="mid">
          <div class="ring" id="h-ring"><svg viewBox="0 0 150 150"><circle cx="75" cy="75" r="64" stroke="rgba(255,255,255,.2)" stroke-width="12" fill="none"/>
            <circle id="h-arc" cx="75" cy="75" r="64" stroke="#FFC93C" stroke-width="12" fill="none" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="0"/></svg><div class="num" id="h-sec">${q.time}</div></div>
          <div class="big-emoji-host">${esc(q.emoji || '🤖')}</div>
          <div class="answered-box"><div class="n" id="h-answered">${st.answered || 0}</div><div class="head">відповідей<br>з ${st.players.length}</div></div>
        </div>
        ${optionsHtml(q)}
      </div>`;
    $('#h-skip').onclick = () => socket.emit('host:skip');
    const end = q.endsAt - clockOffset; const total = q.time * 1000; let last = -1;
    const step = () => {
      if (st.phase !== 'question') return;
      const left = Math.max(0, end - Date.now());
      const arc = $('#h-arc'); if (!arc) return;
      arc.setAttribute('stroke-dashoffset', String(C * (1 - left / total)));
      const s = Math.ceil(left / 1000);
      $('#h-sec').textContent = s;
      $('#h-ring').classList.toggle('hurry', s <= 5);
      if (s !== last && s <= 5 && s > 0) SFX.tick();
      last = s;
      if (left > 0) raf = requestAnimationFrame(step);
    };
    step();
  }

  // ── Розкриття відповіді ──
  function reveal(r) {
    st.phase = 'reveal';
    cancelAnimationFrame(raf);
    const q = st.q;
    SFX.reveal();
    const pct = r.total ? Math.round(r.stats.correct / r.total * 100) : 0;
    let bars = '';
    if (q.type === 'quiz' || q.type === 'multi' || q.type === 'truefalse') {
      const max = Math.max(1, ...r.stats.counts);
      bars = `<div class="bars">${q.options.map((o, i) => {
        const s = q.type === 'truefalse' ? { cls: i ? 'tf-false' : 'tf-true', icon: i ? '👎' : '👍' } : ANSWER_STYLE[i];
        const ok = r.answer.correct.includes(i);
        return `<div class="b"><span>${r.stats.counts[i] || 0}</span><i class="${s.cls}" data-h="${(r.stats.counts[i] || 0) / max * 100}" style="height:0;${ok ? '' : 'opacity:.45'}"></i><span class="lab">${s.icon}${ok ? '✔' : ''}</span></div>`;
      }).join('')}</div>`;
    }
    root.innerHTML = bar(`<div class="count-pill" style="font-size:16px">✅ ${pct}% правильно</div>${st.auto ? '<span class="count-pill" style="font-size:14px">Авто ⏩</span>' : ''}<button class="btn" id="h-next">Далі ➜</button>`) + `
      <div class="host-q">
        <div class="qcard">${q.emoji ? `<span class="em">${esc(q.emoji)}</span>` : ''}<span>${esc(q.text)}</span></div>
        ${bars}
        ${optionsHtml(q, r)}
        ${r.fact ? `<div class="fact-box"><span class="fi">💡</span><span>${esc(r.fact)}</span></div>` : ''}
      </div>`;
    requestAnimationFrame(() => $$('.bars i').forEach(i => { i.style.height = i.dataset.h + '%'; }));
    $('#h-next').onclick = () => socket.emit('host:next');
  }

  // ── Таблиця лідерів ──
  function leaderboard(d) {
    st.phase = 'leaderboard';
    if (d.mode && d.mode !== 'classic' && d.scene) return modeScene(d, false);
    root.innerHTML = bar(`<div class="count-pill" style="font-size:16px">Після ${d.index + 1} з ${d.total}</div><button class="btn" id="h-next">Наступне питання ➜</button>`) + `
      <div class="center" style="justify-content:flex-start;padding-top:10px">
        <h1 style="font-size:44px">🏆 Таблиця лідерів</h1>
        <div class="leader">${d.top.map((p, i) => `<div class="lrow ${i === 0 ? 'first' : ''}" style="animation-delay:${(d.top.length - i) * 150}ms">
          <span class="pos">${i + 1}</span>${Robot.svg(p.avatar)}<span class="nm">${esc(p.nickname)}</span>${p.streak >= 2 ? `<span class="st">🔥${p.streak}</span>` : ''}<span>${p.score}</span></div>`).join('') || '<div class="waiting-robots">Поки ніхто не набрав балів</div>'}</div>
      </div>`;
    SFX.join();
    $('#h-next').onclick = () => socket.emit('host:next');
  }

  // ── Фінал ──
  function end(d) {
    st.phase = 'end';
    cancelAnimationFrame(raf);
    clearSaved();
    if (d.mode === 'towers' && d.scene) return modeScene(d, true);
    const [p1, p2, p3] = d.podium;
    const pod = (p, n) => p ? `<div class="pod p${n}"><div class="who">${Robot.svg(p.avatar)}<div class="nm">${esc(p.nickname)}</div><div class="sc">${p.score} балів</div></div><div class="step">${n}</div></div>` : `<div class="pod p${n}"><div class="step" style="opacity:.3">${n}</div></div>`;
    const extraLine = d.mode === 'bug' && d.scene ? ` · 🏃 Втекли від Бага: ${d.players - d.scene.caught} з ${d.players}` : d.mode === 'race' ? ' · 🚀 Перші на Марсі:' : '';
    root.innerHTML = bar(`<button class="btn btn-white" id="h-again">🔁 Зіграти ще раз</button><button class="btn" id="h-home">🏠 До квізів</button>`) + `
      <div class="center" style="justify-content:flex-start;padding-top:0"><h1 style="font-size:46px" class="anim-zoom">🎉 Вітаємо переможців!</h1>
        <div class="white" style="font-weight:800">Грало: ${d.players}${extraLine}. Дані гравців видалено із сервера.</div></div>
      <div class="podium">${pod(p2, 2)}${pod(p1, 1)}${pod(p3, 3)}</div>
      ${d.podium.length > 3 ? `<div class="row" style="justify-content:center;gap:12px;padding:14px">${d.podium.slice(3).map((p, i) => `<span class="count-pill" style="font-size:16px">${i + 4}. ${esc(p.nickname)} — ${p.score}</span>`).join('')}</div>` : ''}`;
    SFX.fanfare();
    setTimeout(() => confetti(6000), 1500);
    $('#h-home').onclick = () => onExit();
    $('#h-again').onclick = () => { st.pin = null; st.players = []; create(); };
  }

  // ── Сцени ігрових режимів ──
  function modeScene(d, final) {
    const sc = d.scene;
    const nextBtn = final
      ? `<button class="btn btn-white" id="h-again">🔁 Зіграти ще раз</button><button class="btn" id="h-home">🏠 До квізів</button>`
      : `<div class="count-pill" style="font-size:16px">Після ${d.index + 1} з ${d.total}</div><button class="btn" id="h-next">Наступне питання ➜</button>`;
    let body = '';
    if (d.mode === 'race') body = raceScene(sc);
    else if (d.mode === 'bug') body = bugScene(sc);
    else if (d.mode === 'towers') body = towersScene(sc, final);
    root.innerHTML = bar(nextBtn) + `<div class="scene">${body}</div>`;
    // анімація: спершу старі позиції, потім нові
    requestAnimationFrame(() => requestAnimationFrame(() => {
      $$('[data-to]').forEach(el => { el.style.left = el.dataset.to; });
      $$('[data-wto]').forEach(el => { el.style.width = el.dataset.wto; });
    }));
    if (d.mode === 'race' || d.mode === 'bug') sc.players.forEach(p => { st.prev[p.id] = p.progress; });
    if (d.mode === 'bug') st.prev.__bug = sc.bug;
    if (d.mode === 'towers') sc.teams.forEach(t => { st.prev['t' + t.id] = t.bricks; });
    if (final) {
      SFX.fanfare(); setTimeout(() => confetti(6000), 1200);
      $('#h-home').onclick = () => onExit();
      $('#h-again').onclick = () => { st.pin = null; st.players = []; st.prev = {}; create(); };
    } else {
      SFX.join();
      $('#h-next').onclick = () => socket.emit('host:next');
    }
  }

  function raceScene(sc) {
    const pos = p => `calc((100% - 230px) * ${p.toFixed(3)})`;
    return `<h1>🚀 Космічні перегони до Марса</h1>
      <div class="race-track"><div class="finish"><div class="planet"></div><b>МАРС</b></div>
      ${sc.players.map((p, i) => `<div class="lane" style="margin-left:34px"><span class="pos">${i + 1}</span>
        <div class="racer" style="left:${pos(st.prev[p.id] || 0)}" data-to="${pos(p.progress)}">${Art.rocket(['#FF5A5F', '#FFB020', '#2ED3A0', '#9B6CFF', '#3EC5FF'][i % 5])}<span class="av">${Robot.svg(p.avatar)}</span><span class="nm">${esc(p.nickname)} · ${p.score}</span></div></div>`).join('')}
      ${sc.others ? `<div class="white" style="text-align:center;font-weight:800">…і ще ${sc.others} ракет у дорозі 🛰️</div>` : ''}</div>`;
  }

  function bugScene(sc) {
    const x = p => `calc(6% + ${(p * 86).toFixed(2)}%)`;
    const buckets = {};
    const runners = sc.players.map(p => {
      const b = Math.round(p.progress * 40);
      const k = buckets[b] = (buckets[b] || 0) + 1;
      const row = (k - 1) % 4, shift = Math.floor((k - 1) / 4);
      const to = `calc(6% + ${(p.progress * 86).toFixed(2)}% + ${shift * 34}px)`;
      const from = `calc(6% + ${((st.prev[p.id] || 0) * 86).toFixed(2)}% + ${shift * 34}px)`;
      return `<div class="runner ${p.caught ? 'caught' : ''}" style="left:${from};bottom:${44 + row * 82}px" data-to="${to}">
        ${p.caught ? '<span class="net"></span>' : ''}<span class="av">${Robot.svg(p.avatar, { noBg: true })}</span><span class="nm">${esc(p.nickname)}</span>
        ${p.justEscaped ? '<span class="tag2 esc">Втік! 🎉</span>' : p.justCaught ? '<span class="tag2 got">Спійманий!</span>' : ''}</div>`;
    }).join('');
    const safe = sc.players.length - sc.caught;
    return `<h1>🐛 Втеча від Бага</h1>
      <div class="bug-stats"><span class="count-pill">🏃 Тікають: ${safe}</span><span class="count-pill" style="background:rgba(124,58,237,.5)">🕸️ У Бага: ${sc.caught}</span></div>
      <div class="bug-track"><div class="ground"></div><div class="safe">🏁</div>
        <div class="bug-zone" style="width:${x(st.prev.__bug || 0)}" data-wto="${x(sc.bug)}"></div>
        <div class="bug-monster-wrap">${Art.bugMonster().replace('class="bug-monster"', `class="bug-monster" style="left:${x(st.prev.__bug || 0)}" data-to="${x(sc.bug)}"`)}</div>
        ${runners}</div>
      ${sc.caught ? '<div class="white" style="text-align:center;font-weight:800">Спіймані роботи можуть вирватися — для цього треба відповісти правильно! 💪</div>' : ''}`;
  }

  function towersScene(sc, final) {
    const max = Math.max(1, ...sc.teams.map(t => Math.ceil(t.bricks / 2)));
    const rowH = Math.max(10, Math.min(56, 400 / max));
    const bw = Math.round(rowH * 60 / 32);
    const leader = [...sc.teams].sort((a, b) => b.avg - a.avg)[0];
    const towers = sc.teams.map(t => {
      const prev = st.prev['t' + t.id] || 0;
      let bricks = '';
      for (let r = 0; r < Math.ceil(t.bricks / 2); r++) {
        const inRow = Math.min(2, t.bricks - r * 2);
        bricks += `<div class="row">${Array.from({ length: inRow }, (_, j) => {
          const idx = r * 2 + j; const isNew = idx >= prev;
          return `<span style="width:${bw}px;display:block;${isNew ? `animation-delay:${(idx - prev) * 0.08}s` : ''}" class="${isNew ? 'nb' : ''}">${Art.brick(t.color).replace('class="tbrick ', `class="tbrick ${isNew ? 'new' : ''} `)}</span>`;
        }).join('')}</div>`;
      }
      const win = final && t.id === leader.id;
      return `<div class="tower">${win ? '<div class="crown">👑</div>' : ''}<div class="flag">${t.emoji}</div><div class="stack">${bricks}</div><div class="base" style="width:${bw * 2 + 30}px"></div>
        <div class="tname">${esc(t.name)}</div><div class="tscore">⭐ ${t.avg} · 🧱 ${t.bricks}</div>
        <div class="mvp">👥 ${t.members}${t.mvp ? ` · MVP: ${esc(t.mvp.nickname)}` : ''}</div></div>`;
    }).join('');
    return `<h1>${final ? `🏆 Перемогла команда «${esc(leader.name)}»!` : '🧱 Битва веж'}</h1>
      <div class="white" style="text-align:center;font-weight:800">Висота вежі = середній бал команди, тож неважливо, скільки в ній учнів</div>
      <div class="towers">${towers}</div>`;
  }

  global.Host = { start, stop };
})(window);
