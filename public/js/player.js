// Сторінка учня: код → нікнейм → робот → гра. Нічого не зберігається після гри.
(() => {
  const { $, $$, esc, ANSWER_STYLE, TYPE_LABEL, toast, confetti } = FX;
  const socket = io({ transports: ['websocket', 'polling'] });

  const me = { pin: null, playerId: null, nickname: '', avatar: Robot.random(), joined: false, score: 0 };
  let editor = null;
  let clockOffset = 0;
  let timerRaf = null;
  let current = null; // поточне питання
  let answered = false;

  // ── Перемикання екранів ──
  function show(id) {
    $$('.screen').forEach(s => s.classList.toggle('hidden', s.id !== id));
    window.scrollTo(0, 0);
  }
  FX.muteButton();
  document.addEventListener('pointerdown', () => SFX.unlock(), { once: true });

  // Тимчасові дані для повернення після обриву зв'язку (лише в цій вкладці, видаляються після гри)
  const RJ = 'rs-rejoin';
  const saveRejoin = () => { try { sessionStorage.setItem(RJ, JSON.stringify({ pin: me.pin, playerId: me.playerId })); } catch (_) {} };
  const clearRejoin = () => { try { sessionStorage.removeItem(RJ); } catch (_) {} };

  // ── 1. Код гри ──
  const pinInput = $('#pin');
  const urlPin = new URLSearchParams(location.search).get('pin');
  if (urlPin) pinInput.value = urlPin.replace(/\D/g, '').slice(0, 6);
  pinInput.addEventListener('input', () => { pinInput.value = pinInput.value.replace(/\D/g, '').slice(0, 6); $('#pin-err').textContent = ''; });

  $('#f-pin').addEventListener('submit', async e => {
    e.preventDefault();
    const pin = pinInput.value.trim();
    if (pin.length !== 6) { $('#pin-err').textContent = 'Код складається з 6 цифр'; shake('#f-pin'); return; }
    try {
      const r = await fetch('/api/game/' + pin);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      if (d.locked) throw new Error('Учитель закрив вхід до цієї гри');
      me.pin = pin;
      $('.quiz-title-line').innerHTML = `Гра: <b>${esc(d.cover)} ${esc(d.title)}</b>`;
      SFX.pop();
      show('s-nick');
      setTimeout(() => $('#nick').focus(), 200);
    } catch (err) {
      $('#pin-err').textContent = err.message || 'Гру не знайдено';
      shake('#f-pin'); SFX.wrong();
    }
  });

  function shake(sel) { const el = $(sel); el.classList.remove('bad-anim'); void el.offsetWidth; el.style.animation = 'shake .45s'; setTimeout(() => el.style.animation = '', 500); }

  // ── 2. Нікнейм ──
  const ADJ = ['Швидкий', 'Хитрий', 'Веселий', 'Сміливий', 'Мудрий', 'Яскравий', 'Турбо', 'Мега', 'Кібер', 'Супер', 'Неон', 'Лазерний', 'Хмарний', 'Зірковий', 'Ніндзя'];
  const NOUN = ['Болтик', 'Піксель', 'Чіп', 'Гвинтик', 'Байт', 'Робокіт', 'Вертекс', 'Кубик', 'Датчик', 'Шуруп', 'Мікробот', 'Рендер', 'Курсор', 'Гаджет'];
  $('#nick-rand').addEventListener('click', () => {
    let n;
    do { n = ADJ[Math.floor(Math.random() * ADJ.length)] + ' ' + NOUN[Math.floor(Math.random() * NOUN.length)]; } while (n.length > 16);
    $('#nick').value = n; SFX.pop();
  });
  $('#f-nick').addEventListener('submit', e => {
    e.preventDefault();
    const n = $('#nick').value.trim();
    if (n.length < 2) { $('#nick-err').textContent = 'Напиши хоча б 2 символи 🙂'; shake('#f-nick'); return; }
    me.nickname = n;
    $('#nick-err').textContent = '';
    openEditor(false);
  });

  // ── 3. Конструктор ──
  function openEditor(inGame) {
    show('s-avatar');
    $('#av-cancel').classList.toggle('hidden', !inGame);
    $('#av-done').textContent = inGame ? '💾 Зберегти робота' : '🚀 Готово! У гру';
    $('#av-err').textContent = '';
    editor = Robot.mountEditor($('#av-editor'), me.avatar, a => { me.avatar = a; });
  }
  $('#av-cancel').addEventListener('click', () => show('s-lobby'));
  $('#av-done').addEventListener('click', () => {
    me.avatar = editor.get();
    if (me.joined) {
      socket.emit('player:avatar', me.avatar);
      renderLobby(); show('s-lobby'); SFX.pop();
      return;
    }
    const btn = $('#av-done'); btn.disabled = true;
    socket.emit('player:join', { pin: me.pin, nickname: me.nickname, avatar: me.avatar }, res => {
      btn.disabled = false;
      if (!res || res.error) {
        $('#av-err').textContent = res ? res.error : 'Немає зв\'язку із сервером';
        SFX.wrong();
        if (res && /нікнейм/i.test(res.error)) { setTimeout(() => { show('s-nick'); $('#nick-err').textContent = res.error; }, 1200); }
        if (res && /не знайдено|закрив/i.test(res.error)) setTimeout(resetAll, 1800);
        return;
      }
      me.joined = true; me.playerId = res.playerId; me.score = 0;
      saveRejoin();
      SFX.join();
      if (res.state === 'lobby') { renderLobby(); show('s-lobby'); }
    });
  });

  function robotInto(sel) { $(sel).innerHTML = Robot.svg(me.avatar); }
  function renderLobby() { robotInto('#lobby-robot'); $('#lobby-name').textContent = me.nickname; }
  $('#change-robot').addEventListener('click', () => openEditor(true));

  // ── Повернення після обриву зв'язку ──
  socket.on('connect', () => {
    let saved = null;
    try { saved = JSON.parse(sessionStorage.getItem(RJ) || 'null'); } catch (_) {}
    const ref = me.joined ? { pin: me.pin, playerId: me.playerId } : saved;
    if (!ref || !ref.playerId) return;
    socket.emit('player:rejoin', ref, res => {
      if (res && res.ok) {
        Object.assign(me, { pin: ref.pin, playerId: ref.playerId, nickname: res.nickname, avatar: res.avatar, score: res.score, joined: true });
        if (res.state === 'lobby') { renderLobby(); show('s-lobby'); }
      } else if (me.joined) {
        toast('Гра вже завершилась', 'bad'); resetAll();
      } else clearRejoin();
    });
  });

  // ── 5–6. Питання ──
  socket.on('game:question', q => {
    clockOffset = q.serverNow - Date.now();
    current = q; answered = false;
    cancelAnimationFrame(timerRaf);
    const local = t => t - clockOffset;
    const startIn = local(q.startsAt) - Date.now();
    if (startIn > 400) {
      show('s-ready');
      $('#ready-n').textContent = `Питання ${q.index + 1} з ${q.total}`;
      $('#ready-type').textContent = `${TYPE_LABEL[q.type].icon} ${TYPE_LABEL[q.type].name}`;
      $('#ready-double').classList.toggle('hidden', q.points !== 'double');
      let n = Math.ceil(startIn / 1000);
      const tick = () => {
        const el = $('#ready-count'); el.textContent = n; el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
        SFX.count(n);
        n--; if (n > 0) setTimeout(tick, 1000);
      };
      tick();
      setTimeout(() => renderQuestion(q), startIn);
    } else renderQuestion(q);
  });

  function renderQuestion(q) {
    if (current !== q || answered) return;
    show('s-question');
    $('#q-num').textContent = `${q.index + 1}/${q.total}`;
    $('#q-emoji').textContent = q.emoji || '';
    $('#q-text').textContent = q.text;
    $('#q-hint').textContent = q.type === 'multi' ? `Обери всі правильні (їх ${q.needed}) і натисни «Відповісти»` : (q.points === 'double' ? '⚡ Подвійні бали!' : '');
    const body = $('#q-body');
    body.innerHTML = '';

    if (q.type === 'quiz' || q.type === 'truefalse') {
      const grid = document.createElement('div');
      grid.className = 'answers' + (q.options.length === 2 ? ' n2' : '');
      grid.innerHTML = q.options.map((o, i) => {
        if (q.type === 'truefalse') return `<button class="ans tf ${i === 0 ? 'tf-true' : 'tf-false'}" data-i="${i}"><span class="ic">${i === 0 ? '👍' : '👎'}</span>${esc(o)}</button>`;
        const s = ANSWER_STYLE[i]; return `<button class="ans ${s.cls}" data-i="${i}"><span class="ic">${s.icon}</span><span>${esc(o)}</span></button>`;
      }).join('');
      grid.addEventListener('click', e => {
        const b = e.target.closest('.ans'); if (!b || answered) return;
        $$('.ans', grid).forEach(x => x.classList.toggle('dim', x !== b));
        b.classList.add('sel');
        send(+b.dataset.i);
      });
      body.appendChild(grid);
    } else if (q.type === 'multi') {
      const grid = document.createElement('div');
      grid.className = 'answers';
      grid.innerHTML = q.options.map((o, i) => { const s = ANSWER_STYLE[i]; return `<button class="ans ${s.cls}" data-i="${i}"><span class="ic">${s.icon}</span><span>${esc(o)}</span></button>`; }).join('');
      grid.addEventListener('click', e => { const b = e.target.closest('.ans'); if (!b || answered) return; b.classList.toggle('sel'); SFX.click(); });
      body.appendChild(grid);
      const w = document.createElement('div'); w.className = 'submit-wrap';
      w.innerHTML = '<button class="btn btn-lg btn-block">Відповісти ✔</button>';
      w.firstChild.onclick = () => {
        const sel = $$('.ans.sel', grid).map(b => +b.dataset.i);
        if (!sel.length) { toast('Обери хоча б один варіант'); return; }
        send(sel);
      };
      body.appendChild(w);
    } else if (q.type === 'order') {
      let order = q.options.map((_, i) => i);
      const ul = document.createElement('ul'); ul.className = 'order-list';
      const draw = (flash) => {
        ul.innerHTML = order.map((oi, pos) => `<li class="order-item ${flash === pos ? 'flash' : ''}" data-pos="${pos}"><span class="n">${pos + 1}</span><span class="t">${esc(q.options[oi])}</span>
          <button class="mv" data-d="-1" ${pos === 0 ? 'disabled style="opacity:.3"' : ''} aria-label="Вгору">▲</button>
          <button class="mv" data-d="1" ${pos === order.length - 1 ? 'disabled style="opacity:.3"' : ''} aria-label="Вниз">▼</button></li>`).join('');
      };
      ul.addEventListener('click', e => {
        const b = e.target.closest('.mv'); if (!b || answered) return;
        const pos = +b.closest('li').dataset.pos; const to = pos + +b.dataset.d;
        if (to < 0 || to >= order.length) return;
        [order[pos], order[to]] = [order[to], order[pos]]; draw(to); SFX.click();
      });
      draw();
      body.appendChild(ul);
      const w = document.createElement('div'); w.className = 'submit-wrap';
      w.innerHTML = '<button class="btn btn-lg btn-block">Готово ✔</button>';
      w.firstChild.onclick = () => send(order.slice());
      body.appendChild(w);
    } else if (q.type === 'input') {
      const box = document.createElement('form'); box.className = 'input-answer';
      box.innerHTML = `<input class="input input-big" style="letter-spacing:0" maxlength="60" placeholder="Твоя відповідь…" autocomplete="off"><button class="btn btn-lg btn-block">Відповісти ✔</button>`;
      box.addEventListener('submit', e => {
        e.preventDefault();
        const v = box.querySelector('input').value.trim();
        if (!v) { toast('Напиши відповідь 🙂'); return; }
        send(v);
      });
      body.appendChild(box);
      setTimeout(() => box.querySelector('input').focus(), 100);
    }
    runTimer(q);
  }

  function runTimer(q) {
    const end = q.endsAt - clockOffset;
    const total = q.time * 1000;
    let lastSec = -1;
    const step = () => {
      const left = Math.max(0, end - Date.now());
      $('#q-bar').style.transform = `scaleX(${left / total})`;
      const sec = Math.ceil(left / 1000);
      $('#q-timer').textContent = sec;
      if (sec !== lastSec && sec <= 5 && sec > 0) SFX.tick();
      lastSec = sec;
      if (left > 0 && !answered) timerRaf = requestAnimationFrame(step);
    };
    step();
  }

  const QUIPS = ['Мій процесор аж гріється від нетерпіння…', 'Біп-буп! Чекаємо інших гравців', 'Сподіваюсь, ти не забув змастити шестерні 😄', 'Рахую бали зі швидкістю світла…', 'Тримай антену рівно — зараз буде результат!'];
  function send(answer) {
    if (answered) return;
    answered = true;
    cancelAnimationFrame(timerRaf);
    SFX.send();
    socket.emit('player:answer', { answer }, res => {
      if (res && res.error === 'late') toast('Ой, час вийшов ⏰', 'bad');
    });
    setTimeout(() => {
      robotInto('#sent-robot');
      $('#sent-quip').textContent = QUIPS[Math.floor(Math.random() * QUIPS.length)];
      show('s-sent');
    }, 450);
  }

  // ── 8. Результат ──
  socket.on('game:result', r => {
    cancelAnimationFrame(timerRaf);
    answered = true;
    me.score = r.score;
    const sc = $('#s-result');
    sc.classList.remove('ok', 'bad', 'none');
    sc.classList.add(r.ok ? 'ok' : r.answered ? 'bad' : 'none');
    $('#r-icon').textContent = r.ok ? '✅' : r.answered ? '❌' : '⏰';
    const okWords = ['Правильно!', 'Супер!', 'Так тримати!', 'Геніально!', 'Бінго!'];
    const badWords = ['Не цього разу', 'Майже!', 'Ой-ой!', 'Наступне — твоє!'];
    $('#r-title').textContent = r.ok ? okWords[Math.floor(Math.random() * okWords.length)] : r.answered ? badWords[Math.floor(Math.random() * badWords.length)] : 'Час вийшов!';
    $('#r-points').textContent = r.ok ? `+${r.gained} балів` : `Разом: ${r.score}`;
    const st = $('#r-streak');
    st.classList.toggle('hidden', r.streak < 2);
    st.textContent = `🔥 Серія правильних: ${r.streak}`;
    let info = `<div><b>Ти на ${r.rank} місці</b> з ${r.players} · ${r.score} балів</div>`;
    if (r.behind) info += `<div class="small">До «${esc(r.behind.nickname)}» лишилось ${r.behind.diff} балів — наздоганяй!</div>`;
    else if (r.rank === 1) info += `<div class="small">👑 Ти лідер! Не здавай позиції!</div>`;
    if (!r.ok) info += `<div style="margin-top:8px">Правильна відповідь: <b>${esc(answerText(r))}</b></div>`;
    if (r.fact) info += `<div class="small" style="margin-top:8px">💡 ${esc(r.fact)}</div>`;
    $('#r-info').innerHTML = info;
    show('s-result');
    if (r.ok) { SFX.correct(); if (r.streak >= 3) confetti(1800); } else SFX.wrong();
    $('#r-icon').classList.remove('anim-zoom'); void $('#r-icon').offsetWidth; $('#r-icon').classList.add('anim-zoom');
  });

  function answerText(r) {
    const a = r.answer || {};
    if (r.type === 'input') return (a.answers || []).join(' / ');
    if (r.type === 'order') return (a.order || []).join(' → ');
    return (a.correct || []).map(i => (a.options || [])[i]).join(', ');
  }

  socket.on('game:wait', ({ text }) => {
    robotInto('#wait-robot');
    $('#wait-text').textContent = text;
    show('s-wait');
  });

  // ── 10. Фінал ──
  socket.on('game:end', r => {
    clearRejoin();
    const medals = { 1: '🥇', 2: '🥈', 3: '🥉' };
    $('#end-medal').textContent = medals[r.rank] || '🤖';
    $('#end-title').textContent = r.rank <= 3 ? `${r.rank} місце! Ти зірка!` : `${r.rank} місце з ${r.players}`;
    $('#end-score').textContent = `${r.score} балів`;
    $('#end-podium').innerHTML = (r.podium || []).map((p, i) => `<div class="pm">${Robot.svg(p.avatar)}<div>${medals[i + 1]} ${esc(p.nickname)}</div></div>`).join('');
    show('s-end');
    if (r.rank <= 3) { SFX.fanfare(); confetti(5000); } else SFX.correct();
    // Видаляємо все з пам'яті сторінки
    me.joined = false; me.playerId = null; me.pin = null;
  });

  socket.on('game:kicked', () => { toast('Учитель прибрав тебе з гри', 'bad'); resetAll(); });
  socket.on('game:closed', () => { toast('Гру завершено вчителем', 'bad'); resetAll(); });

  function resetAll() {
    clearRejoin();
    Object.assign(me, { pin: null, playerId: null, nickname: '', avatar: Robot.random(), joined: false, score: 0 });
    $('#pin').value = ''; $('#nick').value = '';
    show('s-pin');
  }
  $('#play-again').addEventListener('click', () => { resetAll(); history.replaceState(null, '', '/'); });

})();
