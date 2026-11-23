// Звуки (генеруються WebAudio, без файлів), конфеті та дрібні помічники.
(function (global) {
  let ctx = null;
  let muted = false;
  try { muted = sessionStorage.getItem('rs-muted') === '1'; } catch (_) {}
  function ac() {
    if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) { return null; } }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  function tone(freq, dur = 0.12, type = 'sine', vol = 0.15, delay = 0, slide = 0) {
    if (muted) return;
    const c = ac(); if (!c) return;
    const t = c.currentTime + delay;
    const o = c.createOscillator(); const g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(c.destination);
    o.start(t); o.stop(t + dur + 0.05);
  }
  let loop = null;
  const SFX = {
    click: () => tone(660, 0.05, 'square', 0.05),
    pop: () => { tone(520, 0.08, 'triangle', 0.15, 0, 1.8); },
    whoosh: () => { tone(300, 0.25, 'sawtooth', 0.05, 0, 3); },
    join: () => { tone(523, 0.1, 'triangle', 0.15); tone(784, 0.15, 'triangle', 0.15, 0.08); },
    tick: () => tone(1200, 0.03, 'square', 0.04),
    count: n => tone(n ? 440 : 880, n ? 0.15 : 0.35, 'triangle', 0.2),
    send: () => { tone(700, 0.08, 'sine', 0.15); tone(1050, 0.12, 'sine', 0.12, 0.06); },
    correct: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, 'triangle', 0.18, i * 0.08)),
    wrong: () => { tone(300, 0.25, 'sawtooth', 0.08, 0, 0.6); tone(220, 0.35, 'sawtooth', 0.08, 0.18, 0.6); },
    fanfare: () => [523, 523, 523, 659, 784, 659, 784, 1047].forEach((f, i) => tone(f, i === 7 ? 0.6 : 0.16, 'triangle', 0.2, [0, .14, .28, .42, .62, .78, .92, 1.1][i])),
    reveal: () => { tone(392, 0.15, 'triangle', 0.15); tone(587, 0.3, 'triangle', 0.15, 0.12); },
    lobbyStart() {
      if (loop) return;
      const notes = [262, 330, 392, 523, 392, 330, 294, 349, 440, 587, 440, 349];
      let i = 0;
      loop = setInterval(() => { tone(notes[i % notes.length], 0.18, 'triangle', 0.05); if (i % 4 === 0) tone(notes[i % notes.length] / 2, 0.3, 'sine', 0.06); i++; }, 260);
    },
    lobbyStop() { clearInterval(loop); loop = null; },
    isMuted: () => muted,
    toggle() {
      muted = !muted;
      try { sessionStorage.setItem('rs-muted', muted ? '1' : '0'); } catch (_) {}
      if (muted) SFX.lobbyStop();
      return muted;
    },
    unlock: () => ac(),
  };

  // ── Конфеті ──
  function confetti(duration = 3500) {
    const cv = document.createElement('canvas');
    cv.className = 'confetti-canvas';
    document.body.appendChild(cv);
    const c = cv.getContext('2d');
    const resize = () => { cv.width = innerWidth; cv.height = innerHeight; };
    resize(); addEventListener('resize', resize);
    const cols = ['#0A44DC', '#FFC93C', '#FF5A5F', '#2ED3A0', '#3EC5FF', '#FF7EC7', '#9B6CFF'];
    const parts = Array.from({ length: 180 }, () => ({
      x: Math.random() * cv.width, y: -20 - Math.random() * cv.height * 0.6,
      w: 6 + Math.random() * 8, h: 8 + Math.random() * 10, vy: 2 + Math.random() * 4, vx: -2 + Math.random() * 4,
      r: Math.random() * 6, vr: -0.2 + Math.random() * 0.4, col: cols[Math.floor(Math.random() * cols.length)],
    }));
    const start = performance.now();
    (function frame(t) {
      c.clearRect(0, 0, cv.width, cv.height);
      parts.forEach(p => {
        p.x += p.vx; p.y += p.vy; p.r += p.vr; p.vy += 0.03;
        c.save(); c.translate(p.x, p.y); c.rotate(p.r); c.fillStyle = p.col; c.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); c.restore();
      });
      if (t - start < duration) requestAnimationFrame(frame);
      else { removeEventListener('resize', resize); cv.remove(); }
    })(start);
  }

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  // Кольори і фігури варіантів відповідей (як у Kahoot, але в стилі Robot School)
  const ANSWER_STYLE = [
    { cls: 'a0', icon: '▲' }, { cls: 'a1', icon: '◆' }, { cls: 'a2', icon: '●' },
    { cls: 'a3', icon: '■' }, { cls: 'a4', icon: '★' }, { cls: 'a5', icon: '⬟' },
  ];
  const TYPE_LABEL = {
    quiz: { name: 'Обери відповідь', icon: '🎯' },
    truefalse: { name: 'Правда чи ні?', icon: '⚖️' },
    multi: { name: 'Обери ВСІ правильні', icon: '✅' },
    order: { name: 'Розстав по порядку', icon: '🔢' },
    input: { name: 'Напиши відповідь', icon: '⌨️' },
  };

  function toast(msg, kind = '') {
    let box = $('.toasts');
    if (!box) { box = document.createElement('div'); box.className = 'toasts'; document.body.appendChild(box); }
    const t = document.createElement('div');
    t.className = 'toast ' + kind; t.textContent = msg;
    box.appendChild(t);
    setTimeout(() => t.classList.add('out'), 2800);
    setTimeout(() => t.remove(), 3300);
  }

  function muteButton() {
    const b = document.createElement('button');
    b.className = 'mute-btn'; b.type = 'button';
    const upd = () => { b.textContent = SFX.isMuted() ? '🔇' : '🔊'; b.title = SFX.isMuted() ? 'Увімкнути звук' : 'Вимкнути звук'; };
    upd();
    b.onclick = () => { SFX.toggle(); upd(); };
    document.body.appendChild(b);
  }

  global.SFX = SFX;
  global.FX = { confetti, esc, $, $$, ANSWER_STYLE, TYPE_LABEL, toast, muteButton };
})(window);
