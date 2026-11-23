// Кабінет учителя: вхід, список квізів, ШІ-генератор, редактор.
(() => {
  const { $, $$, esc, ANSWER_STYLE, TYPE_LABEL, toast } = FX;
  const DIRS = {
    '3d': { name: '3D-графіка', e: '🧊' }, robotics: { name: 'Робототехніка', e: '🤖' },
    programming: { name: 'Програмування', e: '💻' }, other: { name: 'Інше', e: '🚀' },
  };
  const TOPIC_TAGS = {
    '3d': ['Інтерфейс Blender', 'Гарячі клавіші', 'Моделювання', 'Модифікатори', 'Матеріали і текстури', 'UV-розгортка', 'Освітлення', 'Рендер', 'Анімація', 'Частинки'],
    robotics: ['Датчики', 'Мотори і сервоприводи', 'Arduino', 'Електроніка', 'Механіка і передачі', 'Історія роботів', 'Роботи в космосі'],
    programming: ['Алгоритми', 'Scratch', 'Python', 'Змінні', 'Цикли', 'Умови', 'Інформатика', 'Історія IT'],
  };
  const TYPE_NAMES = { quiz: '🎯 Одна відповідь', truefalse: '⚖️ Правда / неправда', multi: '✅ Кілька відповідей', order: '🔢 Розстав по порядку', input: '⌨️ Вписати відповідь' };

  let token = localStorage.getItem('rs-admin-token');
  let aiOn = false;
  let aiName = '';
  let quizzes = [];
  let filter = 'all';
  let draft = null; // квіз, що редагується
  let curQ = 0;
  let dirty = false;
  let pendingDraft = null;

  // ── API ──
  async function api(url, opts = {}) {
    const r = await fetch(url, {
      ...opts,
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token, ...(opts.headers || {}) },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    if (r.status === 401) { logout(true); throw new Error('Сесія завершилась, увійдіть знову'); }
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || 'Помилка сервера');
    return d;
  }

  function view(id) {
    $$('body > section').forEach(s => s.classList.toggle('hidden', s.id !== id));
    window.scrollTo(0, 0);
  }

  // ── Маршрутизація ──
  async function route() {
    const h = location.hash.replace(/^#\/?/, '');
    if (!token) { view('v-login'); setTimeout(() => $('#lg-login').focus(), 50); return; }
    try { const me = await api('/api/me'); aiOn = me.ai; aiName = me.aiName || ''; } catch (_) { return; }
    const [page, id, mode, teams] = h.split('/');
    if (page === 'edit' && id) return openEditor(id);
    if (page === 'host' && id) { view('v-host'); return Host.start(id, token, () => { location.hash = '#/'; }, { mode: mode || 'classic', teams: +teams || 2 }); }
    Host.stop();
    loadDash();
  }
  let lastHash = location.hash;
  let ignoreHash = false;
  window.addEventListener('hashchange', () => {
    if (ignoreHash) { ignoreHash = false; lastHash = location.hash; return; }
    if (dirty && !location.hash.startsWith('#/edit') && !confirm('Є незбережені зміни. Вийти без збереження?')) {
      ignoreHash = true; location.hash = lastHash; return;
    }
    if (!location.hash.startsWith('#/edit')) dirty = false;
    lastHash = location.hash;
    route();
  });
  window.addEventListener('beforeunload', e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

  // ── Вхід ──
  $('#f-login').addEventListener('submit', async e => {
    e.preventDefault();
    $('#lg-err').textContent = '';
    try {
      const r = await fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ login: $('#lg-login').value, password: $('#lg-pass').value }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      token = d.token; localStorage.setItem('rs-admin-token', token);
      $('#lg-pass').value = '';
      SFX.join();
      route();
    } catch (err) { $('#lg-err').textContent = err.message; SFX.wrong(); }
  });
  function logout(silent) {
    if (token && !silent) fetch('/api/logout', { method: 'POST', headers: { authorization: 'Bearer ' + token } });
    token = null; localStorage.removeItem('rs-admin-token');
    dirty = false;
    view('v-login');
  }
  $('#btn-logout').addEventListener('click', () => logout(false));

  // ── Список квізів ──
  async function loadDash() {
    view('v-dash');
    try { quizzes = await api('/api/quizzes'); } catch (e) { toast(e.message, 'bad'); quizzes = []; }
    renderDash();
  }
  function renderDash() {
    const list = quizzes.filter(q => filter === 'all' || q.direction === filter);
    $('#dash-count').textContent = quizzes.length;
    $$('#dash-filter .chip').forEach(c => c.classList.toggle('on', c.dataset.f === filter));
    if (!list.length) {
      $('#quiz-grid').innerHTML = `<div class="empty"><div style="width:140px;margin:0 auto">${Art.mascot({ pose: 'wave', prop: 'magnifier' })}</div><h2 style="margin:10px 0">Тут поки порожньо</h2>
        <p>Натисніть «✨ Згенерувати з ШІ» — і помічник складе цікавий квіз за хвилину!</p>
        <button class="btn btn-lg" onclick="document.getElementById('btn-gen').click()">✨ Згенерувати перший квіз</button></div>`;
      return;
    }
    $('#quiz-grid').innerHTML = list.map((q, i) => `
      <div class="quiz-card" style="animation-delay:${i * 40}ms" data-id="${esc(q.id)}">
        <div class="cover d${esc(q.direction)}">${esc(q.cover || '🤖')}
          <span class="badge">${DIRS[q.direction]?.e || ''} ${DIRS[q.direction]?.name || ''}</span>
          ${q.ai ? '<span class="badge ai">✨ ШІ</span>' : ''}</div>
        <div class="body"><h3>${esc(q.title)}</h3>
          <div class="meta">${q.count} ${plural(q.count, 'питання', 'питання', 'питань')} · оновлено ${new Date(q.updatedAt).toLocaleDateString('uk-UA')}</div>
          ${q.description ? `<div class="meta">${esc(q.description)}</div>` : ''}</div>
        <div class="acts">
          <button class="btn btn-green btn-sm btn-play" data-act="play">▶ Запустити</button>
          <button class="icon-btn" data-act="edit" title="Редагувати">✏️</button>
          <button class="icon-btn" data-act="dup" title="Дублювати">📄</button>
          <button class="icon-btn danger" data-act="del" title="Видалити">🗑️</button>
        </div>
      </div>`).join('');
  }
  function plural(n, one, few, many) { const m10 = n % 10, m100 = n % 100; return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20) ? few : many; }
  $('#dash-filter').addEventListener('click', e => { const c = e.target.closest('.chip'); if (c) { filter = c.dataset.f; renderDash(); } });
  $('#quiz-grid').addEventListener('click', async e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const id = b.closest('.quiz-card').dataset.id;
    const q = quizzes.find(x => x.id === id);
    if (b.dataset.act === 'play') openModePicker(id, q.title);
    if (b.dataset.act === 'edit') location.hash = '#/edit/' + id;
    if (b.dataset.act === 'dup') { await api(`/api/quizzes/${id}/duplicate`, { method: 'POST' }); toast('Копію створено', 'ok'); loadDash(); }
    if (b.dataset.act === 'del' && confirm(`Видалити квіз «${q.title}»? Цю дію не можна скасувати.`)) { await api('/api/quizzes/' + id, { method: 'DELETE' }); toast('Квіз видалено'); loadDash(); }
  });
  $('#btn-new').addEventListener('click', () => {
    pendingDraft = { title: 'Новий квіз', direction: '3d', cover: '🧊', defaultTime: 20, questions: [blankQuestion('quiz', 20)] };
    location.hash = '#/edit/new';
  });

  // ── ШІ-генератор ──
  $('#btn-gen').addEventListener('click', () => openGenerator());
  function openGenerator(prefill) {
    const st = Object.assign({ source: aiOn ? 'ai' : 'bank', direction: '3d', count: 10, time: 20, topics: [], age: '10–12 років', difficulty: 'середня', types: Object.keys(TYPE_NAMES), extra: '' }, prefill || {});
    const m = document.createElement('div');
    m.className = 'modal-bg';
    m.innerHTML = `<div class="modal" role="dialog" aria-modal="true">
      <div class="row"><h2 class="grow">✨ Створити квіз</h2><button class="icon-btn" data-close>✕</button></div>
      <p class="sub">Вкажіть параметри — після створення квіз можна змінити як завгодно.</p>
      <form id="gen-form" class="gen-grid" autocomplete="off">
        <div class="full"><label class="lbl">Звідки взяти питання</label>
          <div class="src-pick">
            <label><input type="radio" name="source" value="ai" ${st.source === 'ai' ? 'checked' : ''}><div class="sp"><span class="e">✨</span><b>ШІ складе нові питання</b><small>Унікальні питання саме на ваші теми</small><span class="ai-status" id="ai-status"><span class="spinner dark"></span> перевіряю ШІ…</span></div></label>
            <label><input type="radio" name="source" value="bank" ${st.source === 'bank' ? 'checked' : ''}><div class="sp"><span class="e">📚</span><b>З бази Robot School</b><small>Перевірені питання, ~20 на кожен напрямок. Працює без інтернету</small></div></label>
          </div></div>
        <div class="full"><label class="lbl">Напрямок</label>
          <div class="dir-pick">
            ${[['3d', '🧊', '3D-графіка'], ['robotics', '🤖', 'Робототехніка'], ['programming', '💻', 'Програмування']].map(([v, e, n]) => `<label><input type="radio" name="dir" value="${v}" ${st.direction === v ? 'checked' : ''}><div class="dp"><span class="e">${e}</span>${n}</div></label>`).join('')}
          </div></div>
        <div><label class="lbl">Кількість питань</label>
          <div class="range-row"><input type="range" name="count" min="3" max="30" value="${st.count}"><output></output></div></div>
        <div><label class="lbl">Час на кожне питання</label>
          <div class="range-row"><input type="range" name="time" min="5" max="120" step="5" value="${st.time}"><output></output></div></div>
        <div class="full"><label class="lbl" for="topic-in">Теми для питань — напишіть свою і натисніть Enter</label>
          <div class="tag-input" id="tag-box"><span id="tag-chips"></span><input id="topic-in" placeholder="Напр.: моделювання меча, освітлення сцени…" maxlength="80"></div>
          <div class="hint">Можна писати кілька тем через кому. Або натисніть підказку нижче:</div>
          <div class="tags" id="gen-tags"></div></div>
        <div><label class="lbl">Вік учнів</label>
          <select class="select" name="age">${['7–9 років', '10–12 років', '13–15 років', '16+ років'].map(v => `<option ${v === st.age ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
        <div><label class="lbl">Складність</label>
          <select class="select" name="difficulty">${['легка', 'середня', 'складна'].map(v => `<option ${v === st.difficulty ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
        <div class="full"><label class="lbl">Типи питань</label>
          <div class="type-pick">${Object.entries(TYPE_NAMES).map(([k, v]) => `<label><input type="checkbox" name="types" value="${k}" ${st.types.includes(k) ? 'checked' : ''}><span>${v}</span></label>`).join('')}</div></div>
        <div class="full ai-only"><label class="lbl">Додаткові побажання для ШІ (необов'язково)</label>
          <input class="input" name="extra" style="font-size:16px" value="${esc(st.extra)}" placeholder="Напр.: питання про проєкт «Електрогітара», з гумором"></div>
        <div class="full row" style="justify-content:flex-end"><button type="button" class="btn btn-ghost" data-close>Скасувати</button><button class="btn btn-blue btn-lg" id="gen-go">✨ Створити квіз</button></div>
      </form></div>`;
    document.body.appendChild(m);
    const f = $('#gen-form', m);
    const close = () => m.remove();
    $$('[data-close]', m).forEach(b => b.onclick = close);
    m.addEventListener('mousedown', e => { if (e.target === m) close(); });
    $$('input[type=range]', f).forEach(r => {
      const o = r.nextElementSibling;
      const upd = () => o.textContent = r.value + (r.name === 'time' ? ' с' : '');
      r.oninput = upd; upd();
    });

    // ── Теми: введення з клавіатури ──
    let topics = st.topics.slice();
    const chips = $('#tag-chips', m), tin = $('#topic-in', m);
    const drawChips = () => {
      chips.innerHTML = topics.map((t, i) => `<span class="chip-t">${esc(t)}<button type="button" data-del="${i}" aria-label="Прибрати">×</button></span>`).join('');
      drawTags();
    };
    const addTopics = text => {
      String(text).split(/[,;\n]+/).map(t => t.trim()).filter(Boolean).forEach(t => {
        if (!topics.some(x => x.toLowerCase() === t.toLowerCase()) && topics.length < 12) topics.push(t.slice(0, 80));
      });
      drawChips();
    };
    tin.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTopics(tin.value); tin.value = ''; }
      else if (e.key === 'Backspace' && !tin.value && topics.length) { topics.pop(); drawChips(); }
    });
    tin.addEventListener('blur', () => { if (tin.value.trim()) { addTopics(tin.value); tin.value = ''; } });
    tin.addEventListener('paste', () => setTimeout(() => { if (/[,;\n]/.test(tin.value)) { addTopics(tin.value); tin.value = ''; } }, 0));
    $('#tag-box', m).addEventListener('click', e => {
      const d = e.target.closest('[data-del]');
      if (d) { topics.splice(+d.dataset.del, 1); drawChips(); } else tin.focus();
    });
    function drawTags() {
      const dir = f.dir.value;
      $('#gen-tags', m).innerHTML = (TOPIC_TAGS[dir] || []).filter(t => !topics.some(x => x.toLowerCase() === t.toLowerCase())).map(t => `<button type="button">+ ${esc(t)}</button>`).join('');
    }
    $('#gen-tags', m).addEventListener('click', e => { const b = e.target.closest('button'); if (b) addTopics(b.textContent.replace(/^\+\s*/, '')); });
    drawChips();

    // ── Джерело питань і стан ШІ ──
    const syncSource = () => {
      const ai = f.source.value === 'ai';
      $$('.ai-only', m).forEach(el => el.classList.toggle('hidden', !ai));
      $('#gen-go', m).textContent = ai ? '✨ Створити через ШІ' : '📚 Зібрати з бази';
    };
    f.addEventListener('change', e => { if (e.target.name === 'dir') drawTags(); if (e.target.name === 'source') syncSource(); });
    syncSource();
    const aiBox = $('#ai-status', m);
    api('/api/ai-status').then(r => {
      if (!document.body.contains(m)) return;
      aiBox.className = 'ai-status ' + (r.ok ? 'ok' : 'bad');
      aiBox.textContent = r.ok ? `✅ Працює: ${r.model || r.provider}` : `⚠️ ${r.message || 'ШІ недоступний'}`;
      aiBox.title = r.message || '';
      if (!r.ok && f.source.value === 'ai' && !r.configured) { f.source.value = 'bank'; syncSource(); }
    }).catch(() => { aiBox.className = 'ai-status bad'; aiBox.textContent = '⚠️ Не вдалося перевірити ШІ'; });

    f.addEventListener('submit', async e => {
      e.preventDefault();
      if (tin.value.trim()) { addTopics(tin.value); tin.value = ''; }
      const types = $$('input[name=types]:checked', f).map(i => i.value);
      if (!types.length) { toast('Оберіть хоча б один тип питань', 'bad'); return; }
      const params = { source: f.source.value, direction: f.dir.value, count: +f.count.value, time: +f.time.value, topics: topics.join(', '), age: f.age.value, difficulty: f.difficulty.value, types, extra: f.extra.value };
      const keep = { ...params, topics: topics.slice() };
      const modal = $('.modal', m);
      if (params.source === 'ai') {
        modal.innerHTML = `<div class="thinking"><div class="robot-think" style="background:var(--blue);border-radius:50%;padding:14px">${Art.mascot({ pose: 'idle', prop: 'laptop' })}</div>
          <h2>ШІ-помічник складає квіз…</h2><div class="sub" id="think-line">Підбираю найцікавіші питання</div><div class="bar"><i></i></div>
          <div class="hint">На безкоштовному тарифі це може тривати до 1–2 хвилин</div></div>`;
      } else modal.innerHTML = `<div class="thinking"><div class="spinner dark" style="width:44px;height:44px"></div><h2>Збираю квіз із бази…</h2></div>`;
      const lines = ['Підбираю найцікавіші питання', 'Вигадую хитрі варіанти відповідей', 'Додаю цікаві факти', 'Перевіряю правильні відповіді', 'Розставляю бонусні раунди ⚡'];
      let li = 0;
      const iv = setInterval(() => { const el = $('#think-line', m); if (el) el.textContent = lines[++li % lines.length]; }, 1800);
      try {
        const res = await api('/api/generate', { method: 'POST', body: params });
        clearInterval(iv);
        close();
        pendingDraft = res.quiz;
        SFX.correct();
        toast(res.source === 'ai' ? '✨ ШІ склав квіз! Перевірте й збережіть' : '📚 Квіз зібрано з бази. Перевірте й збережіть', 'ok');
        if (res.warning) setTimeout(() => toast(res.warning), 600);
        location.hash = '#/edit/new';
      } catch (err) {
        clearInterval(iv);
        SFX.wrong();
        modal.innerHTML = `<div class="thinking"><div class="big-emoji">😵‍💫</div><h2>Не вдалося створити квіз</h2>
          <div class="ai-note" style="max-width:560px;text-align:left">${esc(err.message)}</div>
          <div class="row wrap" style="justify-content:center"><button class="btn btn-ghost" data-close>Закрити</button>
          <button class="btn btn-blue" id="gen-retry">🔁 Спробувати ще раз</button><button class="btn" id="gen-bank">📚 Взяти з бази</button></div></div>`;
        $$('[data-close]', m).forEach(b => b.onclick = close);
        $('#gen-retry', m).onclick = () => { close(); openGenerator(keep); };
        $('#gen-bank', m).onclick = () => { close(); openGenerator({ ...keep, source: 'bank' }); };
      }
    });
    setTimeout(() => tin.focus(), 100);
  }

  // ── Редактор ──
  function blankQuestion(type = 'quiz', time = 20) {
    const q = { id: Math.random().toString(36).slice(2, 10), type, text: '', emoji: '❓', time, points: 'standard', fact: '', options: [], correct: [0], answers: [] };
    return setType(q, type);
  }
  function setType(q, type) {
    const old = q.type; q.type = type;
    if (type === 'truefalse') { q.options = ['Правда', 'Неправда']; q.correct = [q.correct && q.correct[0] === 1 ? 1 : 0]; }
    else if (type === 'input') { if (!q.answers || !q.answers.length || q.answers[0] === '') q.answers = old && old !== 'input' && q.options[q.correct?.[0]] ? [q.options[q.correct[0]]] : ['']; }
    else {
      if (old === 'truefalse' || !q.options || q.options.length < 2) q.options = ['', '', '', ''];
      if (type === 'order' && q.options.length < 3) q.options.push('');
      if (type === 'quiz') q.correct = [q.correct?.[0] ?? 0];
      if (!q.correct || !q.correct.length) q.correct = [0];
    }
    return q;
  }

  async function openEditor(id) {
    view('v-editor');
    if (id === 'new') {
      if (!pendingDraft) { location.hash = '#/'; return; }
      draft = JSON.parse(JSON.stringify(pendingDraft)); draft.id = draft.id || undefined; draft.__new = true;
      dirty = true;
    } else {
      try { draft = await api('/api/quizzes/' + id); } catch (e) { toast(e.message, 'bad'); location.hash = '#/'; return; }
      dirty = false;
    }
    if (!draft.questions.length) draft.questions.push(blankQuestion('quiz', draft.defaultTime || 20));
    curQ = 0;
    $('#ed-title').value = draft.title || '';
    $('#ed-dir').value = draft.direction || 'other';
    $('#ed-time').value = draft.defaultTime || 20;
    $('#ed-cover').value = draft.cover || '🤖';
    $('#ed-desc').value = draft.description || '';
    $('#ed-topics').textContent = draft.topics ? '🏷️ Теми: ' + draft.topics : '';
    renderList(); renderQ(); status();
  }
  function status() { $('#ed-status').textContent = dirty ? '● Є незбережені зміни' : '✔ Усе збережено'; }
  function touch() { dirty = true; status(); }

  ['ed-title', 'ed-dir', 'ed-time', 'ed-cover', 'ed-desc'].forEach(id => $('#' + id).addEventListener('input', () => {
    draft.title = $('#ed-title').value; draft.direction = $('#ed-dir').value; draft.defaultTime = +$('#ed-time').value || 20;
    draft.cover = $('#ed-cover').value; draft.description = $('#ed-desc').value; touch();
  }));
  $('#ed-apply-time').addEventListener('click', () => {
    const t = Math.max(5, Math.min(240, +$('#ed-time').value || 20));
    draft.questions.forEach(q => q.time = t); renderQ(); touch(); toast(`Час ${t} с застосовано до всіх питань`, 'ok');
  });

  function problems(q) {
    if (!q.text.trim()) return 'Немає тексту питання';
    if (q.type === 'input') return q.answers.some(a => a.trim()) ? '' : 'Немає правильної відповіді';
    if (q.type !== 'truefalse' && q.options.filter(o => o.trim()).length < (q.type === 'order' ? 3 : 2)) return 'Замало варіантів';
    if (q.type !== 'truefalse' && q.type !== 'order' && q.options.some(o => !o.trim())) return 'Є порожній варіант';
    return '';
  }

  function renderList() {
    $('#q-list').innerHTML = draft.questions.map((q, i) => `
      <li class="q-item ${i === curQ ? 'active' : ''} ${problems(q) ? 'warn' : ''}" data-i="${i}" title="${esc(problems(q))}">
        <span class="n">${i + 1}</span><span class="e">${esc(q.emoji || '❓')}</span>
        <span style="flex:1;min-width:0"><span class="t">${esc(q.text || '(без тексту)')}</span><span class="ty">${TYPE_NAMES[q.type]}${q.points === 'double' ? ' · ⚡x2' : ''}</span></span>
      </li>`).join('');
  }
  $('#q-list').addEventListener('click', e => { const li = e.target.closest('.q-item'); if (li) { curQ = +li.dataset.i; renderList(); renderQ(); } });
  $('#q-add').addEventListener('click', () => {
    draft.questions.splice(curQ + 1, 0, blankQuestion('quiz', draft.defaultTime || 20));
    curQ++; renderList(); renderQ(); touch();
    setTimeout(() => $('#qe-text')?.focus(), 50);
  });
  $('#q-add-ai').addEventListener('click', async () => {
    const b = $('#q-add-ai'); b.disabled = true; b.innerHTML = '<span class="spinner"></span>';
    try {
      const r = await api('/api/regenerate-question', { method: 'POST', body: { direction: draft.direction, topics: draft.topics || draft.title, time: draft.defaultTime, avoid: draft.questions.map(q => q.text).join(' | ').slice(0, 380) } });
      draft.questions.splice(curQ + 1, 0, r.question); curQ++; renderList(); renderQ(); touch();
      toast('✨ Нове питання додано', 'ok');
    } catch (e) { toast(e.message, 'bad'); }
    b.disabled = false; b.textContent = '✨ ШІ-питання';
  });

  function renderQ() {
    const q = draft.questions[curQ];
    const el = $('#q-editor');
    if (!q) { el.innerHTML = ''; return; }
    let optsHtml = '';
    if (q.type === 'quiz' || q.type === 'multi') {
      optsHtml = `<label class="lbl">Варіанти відповідей — позначте ${q.type === 'multi' ? 'ВСІ правильні' : 'правильний'} кнопкою ✔</label>
        <div class="opt-edit">${q.options.map((o, i) => `<div class="opt-row ${ANSWER_STYLE[i].cls}">
          <span class="ic">${ANSWER_STYLE[i].icon}</span><input type="text" data-opt="${i}" value="${esc(o)}" maxlength="120" placeholder="Варіант ${i + 1}">
          <button type="button" class="mark ${q.correct.includes(i) ? 'on' : ''}" data-mark="${i}" title="Правильна відповідь">✔</button>
          ${q.options.length > 2 ? `<button type="button" class="del" data-delopt="${i}" title="Видалити варіант">✕</button>` : ''}</div>`).join('')}</div>
        ${q.options.length < 6 ? '<button type="button" class="btn btn-sm btn-ghost" id="opt-add" style="margin-top:10px">➕ Варіант</button>' : ''}`;
    } else if (q.type === 'truefalse') {
      optsHtml = `<label class="lbl">Правильна відповідь</label><div class="opt-edit">
        ${['Правда', 'Неправда'].map((o, i) => `<div class="opt-row" style="background:${i ? 'var(--a0)' : 'var(--a3)'}"><span class="ic">${i ? '👎' : '👍'}</span><b style="flex:1;font-size:18px">${o}</b>
        <button type="button" class="mark ${q.correct[0] === i ? 'on' : ''}" data-mark="${i}">✔</button></div>`).join('')}</div>`;
    } else if (q.type === 'order') {
      optsHtml = `<label class="lbl">Кроки у ПРАВИЛЬНОМУ порядку (учні побачать їх перемішаними)</label>
        <div class="opt-edit order-edit" style="grid-template-columns:1fr">${q.options.map((o, i) => `<div class="opt-row">
          <span class="ic" style="font-family:var(--head)">${i + 1}</span><input type="text" data-opt="${i}" value="${esc(o)}" maxlength="120" placeholder="Крок ${i + 1}">
          <button type="button" class="del" data-up="${i}" title="Вище" ${i === 0 ? 'disabled' : ''}>▲</button>
          ${q.options.length > 3 ? `<button type="button" class="del" data-delopt="${i}" title="Видалити">✕</button>` : ''}</div>`).join('')}</div>
        ${q.options.length < 6 ? '<button type="button" class="btn btn-sm btn-ghost" id="opt-add" style="margin-top:10px">➕ Крок</button>' : ''}`;
    } else if (q.type === 'input') {
      optsHtml = `<label class="lbl">Прийнятні відповіді (регістр і лапки не враховуються)</label>
        <div class="opt-edit" style="grid-template-columns:1fr">${q.answers.map((a, i) => `<div class="opt-row" style="background:var(--a1)">
          <span class="ic">✍️</span><input type="text" data-ans="${i}" value="${esc(a)}" maxlength="80" placeholder="Відповідь">
          ${q.answers.length > 1 ? `<button type="button" class="del" data-delans="${i}">✕</button>` : ''}</div>`).join('')}</div>
        <button type="button" class="btn btn-sm btn-ghost" id="ans-add" style="margin-top:10px">➕ Інший варіант написання</button>
        <div class="hint">Додайте варіанти: «Suzanne», «Сюзанна» тощо.</div>`;
    }
    el.innerHTML = `
      <div class="ed-q-top">
        <div style="flex:1;min-width:200px"><label class="lbl">Тип питання</label>
          <select class="select" id="qe-type">${Object.entries(TYPE_NAMES).map(([k, v]) => `<option value="${k}" ${q.type === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
        <div style="width:110px"><label class="lbl">Час, с</label><input class="input" id="qe-time" type="number" min="5" max="240" value="${q.time}"></div>
        <div style="width:170px"><label class="lbl">Бали</label>
          <select class="select" id="qe-points"><option value="standard" ${q.points === 'standard' ? 'selected' : ''}>Звичайні</option><option value="double" ${q.points === 'double' ? 'selected' : ''}>⚡ Подвійні</option><option value="none" ${q.points === 'none' ? 'selected' : ''}>Без балів</option></select></div>
        <div style="width:80px;min-width:80px"><label class="lbl">Емодзі</label><input class="input emoji-in" id="qe-emoji" maxlength="4" value="${esc(q.emoji)}"></div>
      </div>
      <div style="margin-top:14px"><label class="lbl">Питання ${curQ + 1} з ${draft.questions.length}</label>
        <textarea class="input" id="qe-text" maxlength="400" placeholder="Напишіть питання…">${esc(q.text)}</textarea></div>
      <div style="margin-top:14px" id="qe-opts">${optsHtml}</div>
      <div style="margin-top:14px"><label class="lbl">💡 Цікавий факт / пояснення (покажемо після відповіді)</label>
        <textarea class="input" id="qe-fact" maxlength="400" style="font-size:16px;font-family:var(--body);min-height:60px">${esc(q.fact)}</textarea></div>
      <div class="row wrap" style="margin-top:16px">
        <button type="button" class="btn btn-sm" id="qe-regen">✨ Замінити питання (ШІ)</button>
        <div class="grow"></div>
        <button type="button" class="icon-btn" id="qe-up" title="Перемістити вище">⬆️</button>
        <button type="button" class="icon-btn" id="qe-down" title="Перемістити нижче">⬇️</button>
        <button type="button" class="icon-btn" id="qe-dup" title="Дублювати">📄</button>
        <button type="button" class="icon-btn danger" id="qe-del" title="Видалити питання">🗑️</button>
      </div>
      <div class="err" id="qe-warn" style="color:#B26B00">${problems(q) ? '⚠️ ' + problems(q) : ''}</div>`;

    const refreshMeta = () => { renderList(); $('#qe-warn').textContent = problems(q) ? '⚠️ ' + problems(q) : ''; touch(); };
    $('#qe-type').onchange = e => { setType(q, e.target.value); renderQ(); renderList(); touch(); };
    $('#qe-time').oninput = e => { q.time = Math.max(5, Math.min(240, +e.target.value || 20)); touch(); };
    $('#qe-points').onchange = e => { q.points = e.target.value; refreshMeta(); };
    $('#qe-emoji').oninput = e => { q.emoji = e.target.value; refreshMeta(); };
    $('#qe-text').oninput = e => { q.text = e.target.value; refreshMeta(); };
    $('#qe-fact').oninput = e => { q.fact = e.target.value; touch(); };
    const opts = $('#qe-opts');
    opts.oninput = e => {
      if (e.target.dataset.opt != null) q.options[+e.target.dataset.opt] = e.target.value;
      if (e.target.dataset.ans != null) q.answers[+e.target.dataset.ans] = e.target.value;
      refreshMeta();
    };
    opts.onclick = e => {
      const t = e.target.closest('button'); if (!t) return;
      if (t.dataset.mark != null) {
        const i = +t.dataset.mark;
        if (q.type === 'multi') { q.correct = q.correct.includes(i) ? q.correct.filter(x => x !== i) : [...q.correct, i].sort(); if (!q.correct.length) q.correct = [i]; }
        else q.correct = [i];
      }
      if (t.dataset.delopt != null) {
        const i = +t.dataset.delopt; q.options.splice(i, 1);
        q.correct = q.correct.filter(x => x !== i).map(x => x > i ? x - 1 : x); if (!q.correct.length) q.correct = [0];
      }
      if (t.dataset.up != null) { const i = +t.dataset.up; [q.options[i - 1], q.options[i]] = [q.options[i], q.options[i - 1]]; }
      if (t.dataset.delans != null) q.answers.splice(+t.dataset.delans, 1);
      if (t.id === 'opt-add') q.options.push('');
      if (t.id === 'ans-add') q.answers.push('');
      renderQ(); renderList(); touch();
    };
    $('#qe-up').onclick = () => move(-1);
    $('#qe-down').onclick = () => move(1);
    $('#qe-dup').onclick = () => { const c = JSON.parse(JSON.stringify(q)); c.id = Math.random().toString(36).slice(2, 10); draft.questions.splice(curQ + 1, 0, c); curQ++; renderList(); renderQ(); touch(); };
    $('#qe-del').onclick = () => {
      if (draft.questions.length === 1) { toast('У квізі має бути хоча б одне питання'); return; }
      if (q.text && !confirm('Видалити це питання?')) return;
      draft.questions.splice(curQ, 1); curQ = Math.max(0, curQ - 1); renderList(); renderQ(); touch();
    };
    $('#qe-regen').onclick = async () => {
      const b = $('#qe-regen'); b.disabled = true; b.innerHTML = '<span class="spinner" style="border-color:rgba(0,0,0,.2);border-top-color:#000"></span> Генерую…';
      try {
        const r = await api('/api/regenerate-question', { method: 'POST', body: { direction: draft.direction, topics: draft.topics || draft.title, time: q.time, type: q.type, avoid: q.text } });
        r.question.id = q.id;
        draft.questions[curQ] = r.question; renderList(); renderQ(); touch();
        toast('✨ Питання оновлено', 'ok');
      } catch (e) { toast(e.message, 'bad'); b.disabled = false; b.textContent = '✨ Замінити питання (ШІ)'; }
    };
  }
  function move(d) {
    const j = curQ + d; if (j < 0 || j >= draft.questions.length) return;
    [draft.questions[curQ], draft.questions[j]] = [draft.questions[j], draft.questions[curQ]];
    curQ = j; renderList(); renderQ(); touch();
  }

  async function save() {
    const bad = draft.questions.map((q, i) => problems(q) ? i + 1 : 0).filter(Boolean);
    if (bad.length && !confirm(`Питання ${bad.join(', ')} не заповнені до кінця. Все одно зберегти?`)) return null;
    const body = { ...draft }; delete body.__new;
    const isNew = draft.__new || !draft.id;
    const saved = isNew ? await api('/api/quizzes', { method: 'POST', body }) : await api('/api/quizzes/' + draft.id, { method: 'PUT', body });
    draft = saved; dirty = false; status();
    pendingDraft = null;
    if (isNew) { history.replaceState(null, '', '#/edit/' + saved.id); lastHash = location.hash; }
    toast('💾 Квіз збережено', 'ok');
    return saved;
  }
  $('#ed-save').addEventListener('click', () => save().catch(e => toast(e.message, 'bad')));
  $('#ed-play').addEventListener('click', async () => {
    try { const s = await save(); if (s) openModePicker(s.id, s.title); } catch (e) { toast(e.message, 'bad'); }
  });
  $('#ed-back').addEventListener('click', () => { location.hash = '#/'; });

  // ── Вибір ігрового режиму ──
  function modeArt(k) {
    if (k === 'classic') return `<div style="width:92px">${Art.mascot({ pose: 'cheer', prop: 'trophy' })}</div>`;
    if (k === 'race') return `${Art.rocket('#FF5A5F')}<span style="font-size:22px">✨</span><div class="planet"></div>`;
    if (k === 'bug') return `<div style="width:54px">${Robot.svg({ body: 1, color: 4, eyes: 1, mouth: 3, antenna: 1 }, { noBg: true })}</div><div style="width:120px">${Art.bugMonster()}</div>`;
    return `<div style="display:flex;align-items:flex-end;gap:10px">${['#2F6BFF', '#FFB020', '#18B95C'].map((c, i) => `<div style="display:flex;flex-direction:column-reverse">${Array.from({ length: 2 + i }, () => `<div style="width:42px;margin-top:-3px">${Art.brick(c)}</div>`).join('')}</div>`).join('')}</div><span style="font-size:34px;align-self:flex-start;margin-top:8px">🚩</span>`;
  }
  function openModePicker(id, title) {
    let mode = sessionStorage.getItem('rs-last-mode') || 'classic';
    let teams = +sessionStorage.getItem('rs-last-teams') || 2;
    const m = document.createElement('div');
    m.className = 'modal-bg';
    m.innerHTML = `<div class="modal" role="dialog" aria-modal="true" style="max-width:900px">
      <div class="row"><h2 class="grow">🎮 Обери режим гри</h2><button class="icon-btn" data-close>✕</button></div>
      <p class="sub">«${esc(title || '')}» — питання ті самі, змінюється спосіб гри.</p>
      <div class="mode-grid">${Object.entries(Art.MODES).map(([k, v]) => `
        <button type="button" class="mode-card ${k === mode ? 'sel' : ''}" data-mode="${k}">
          <div class="art art-${k}">${modeArt(k)}${k === 'towers' ? '<span class="tag">👥 Команди</span>' : '<span class="tag">👤 Кожен сам</span>'}</div>
          <div class="txt"><h3>${v.emoji} ${esc(v.name)}</h3><p>${esc(v.desc)}</p></div>
        </button>`).join('')}</div>
      <div class="team-pick ${mode === 'towers' ? '' : 'hidden'}"><b>Кількість команд:</b>${[2, 3, 4].map(n => `<button type="button" data-teams="${n}" class="${n === teams ? 'on' : ''}">${n}</button>`).join('')}<span class="hint">Учні розподіляться автоматично й порівну</span></div>
      <div class="row" style="justify-content:flex-end;margin-top:18px"><button class="btn btn-ghost" data-close>Скасувати</button><button class="btn btn-green btn-lg" id="mp-go">▶ Почати</button></div>
    </div>`;
    document.body.appendChild(m);
    const close = () => m.remove();
    $$('[data-close]', m).forEach(b => b.onclick = close);
    m.addEventListener('mousedown', e => { if (e.target === m) close(); });
    m.addEventListener('click', e => {
      const c = e.target.closest('.mode-card');
      if (c) { mode = c.dataset.mode; $$('.mode-card', m).forEach(x => x.classList.toggle('sel', x === c)); $('.team-pick', m).classList.toggle('hidden', mode !== 'towers'); SFX.pop(); }
      const t = e.target.closest('[data-teams]');
      if (t) { teams = +t.dataset.teams; $$('[data-teams]', m).forEach(x => x.classList.toggle('on', x === t)); SFX.click(); }
    });
    m.addEventListener('dblclick', e => { if (e.target.closest('.mode-card')) $('#mp-go', m).click(); });
    $('#mp-go', m).onclick = () => {
      try { sessionStorage.setItem('rs-last-mode', mode); sessionStorage.setItem('rs-last-teams', teams); } catch (_) {}
      close();
      location.hash = `#/host/${id}/${mode}/${teams}`;
    };
  }

  FX.muteButton();
  Art.background();
  $('#login-mascot').innerHTML = Art.mascot({ pose: 'wave', prop: 'laptop', light: true });
  document.addEventListener('pointerdown', () => SFX.unlock(), { once: true });
  route();
})();
