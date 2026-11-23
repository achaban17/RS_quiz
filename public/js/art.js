// Ілюстрації Robot School: маскот «Брік» (цеглинка з логотипа), декор і динамічний фон.
(function (global) {
  const BLUE = '#0A44DC', DARK = '#062E9C';

  // ── Маскот Брік ──
  // pose: 'wave' | 'cheer' | 'idle';  prop: '' | 'laptop' | 'trophy' | 'flag' | 'magnifier'
  function mascot(opts = {}) {
    const pose = opts.pose || 'wave';
    const prop = opts.prop || '';
    // як у логотипі: білий блок, синя пляма-обличчя, білі очі й усмішка
    // light: true — для білих карток (синій блок, біле обличчя, сині очі, як в оригінальному лого)
    const L = !!opts.light;
    const c = opts.color || (L ? BLUE : '#FFFFFF');
    const d = opts.dark || (L ? DARK : '#C9D6FF');
    const face = opts.face || (L ? '#FFFFFF' : BLUE);
    const eye = L ? BLUE : '#fff', pupil = L ? '#fff' : face;
    const hs = opts.handStroke || (L ? BLUE : '#9DB4FF');
    const armL = pose === 'cheer'
      ? `<g class="m-arm m-arm-l2"><path d="M44 120 Q20 100 22 70" stroke="${c}" stroke-width="15" fill="none" stroke-linecap="round"/><circle cx="22" cy="66" r="12" fill="#fff" stroke="${hs}" stroke-width="5"/></g>`
      : `<g class="m-arm"><path d="M42 140 Q22 156 24 180" stroke="${c}" stroke-width="15" fill="none" stroke-linecap="round"/><circle cx="24" cy="184" r="12" fill="#fff" stroke="${hs}" stroke-width="5"/></g>`;
    const armR = pose === 'idle'
      ? `<g class="m-arm"><path d="M178 140 Q198 156 196 180" stroke="${c}" stroke-width="15" fill="none" stroke-linecap="round"/><circle cx="196" cy="184" r="12" fill="#fff" stroke="${hs}" stroke-width="5"/></g>`
      : `<g class="m-arm ${pose === 'wave' ? 'm-wave' : 'm-arm-r2'}"><path d="M176 120 Q200 100 198 70" stroke="${c}" stroke-width="15" fill="none" stroke-linecap="round"/><circle cx="198" cy="66" r="12" fill="#fff" stroke="${hs}" stroke-width="5"/></g>`;
    let propSvg = '';
    if (prop === 'laptop') propSvg = `<g><rect x="62" y="158" width="96" height="58" rx="6" fill="#1F2937"/><rect x="68" y="164" width="84" height="46" rx="3" fill="#3EC5FF"/><path d="M90 182 l-8 6 l8 6 M130 182 l8 6 l-8 6 M114 178 l-8 20" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round"/><rect x="50" y="214" width="120" height="8" rx="4" fill="#374151"/></g>`;
    if (prop === 'trophy') propSvg = `<g class="m-bob"><path d="M178 40 h40 v14 q0 26 -20 30 q-20 -4 -20 -30 z" fill="#FFC93C" stroke="#C98A0A" stroke-width="3"/><rect x="192" y="84" width="12" height="12" fill="#C98A0A"/><rect x="184" y="94" width="28" height="9" rx="3" fill="#C98A0A"/><path d="M178 46 q-12 0 -10 12 q2 10 12 10 M218 46 q12 0 10 12 q-2 10 -12 10" stroke="#C98A0A" stroke-width="3" fill="none"/></g>`;
    if (prop === 'flag') propSvg = `<g class="m-bob"><line x1="198" y1="72" x2="198" y2="6" stroke="#475569" stroke-width="4" stroke-linecap="round"/><path d="M200 8 h40 l-9 12 l9 12 h-40 z" fill="#FFC93C"/></g>`;
    if (prop === 'magnifier') propSvg = `<g class="m-bob"><circle cx="208" cy="44" r="20" fill="rgba(255,255,255,.5)" stroke="#1F2937" stroke-width="6"/><line x1="196" y1="60" x2="198" y2="66" stroke="#1F2937" stroke-width="8" stroke-linecap="round"/></g>`;
    return `<svg class="mascot" viewBox="0 0 250 240" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Маскот Robot School">
  <ellipse cx="110" cy="232" rx="70" ry="7" fill="rgba(0,0,0,.18)" class="m-shadow"/>
  <g class="m-body-wrap">
    <rect x="70" y="190" width="28" height="36" rx="11" fill="${d}"/><rect x="122" y="190" width="28" height="36" rx="11" fill="${d}"/>
    <ellipse cx="80" cy="226" rx="20" ry="9" fill="#1F2937"/><ellipse cx="140" cy="226" rx="20" ry="9" fill="#1F2937"/>
    ${armL}${armR}
    <rect x="56" y="26" width="42" height="28" rx="6" fill="${c}"/><rect x="122" y="26" width="42" height="28" rx="6" fill="${c}"/>
    <rect x="34" y="46" width="152" height="150" rx="16" fill="${c}"/>
    <rect x="34" y="46" width="152" height="150" rx="16" fill="none" stroke="${d}" stroke-width="3"/>
    <path d="M56 128 C50 104 92 96 130 94 C168 92 180 112 172 138 C164 164 122 172 92 168 C66 164 59 150 56 128 Z" fill="${face}"/>
    <g class="m-eyes"><circle cx="92" cy="126" r="9" fill="${eye}"/><circle cx="148" cy="124" r="9" fill="${eye}"/>
      <circle cx="${L ? 95 : 94}" cy="${L ? 123 : 127}" r="${L ? 3 : 3.6}" fill="${pupil}"/><circle cx="${L ? 151 : 150}" cy="${L ? 121 : 125}" r="${L ? 3 : 3.6}" fill="${pupil}"/></g>
    <path d="M113 142 Q120 149 127 142" stroke="${eye}" stroke-width="4" fill="none" stroke-linecap="round"/>
    <circle cx="76" cy="144" r="6" fill="#FF7EA8" opacity=".6"/><circle cx="164" cy="141" r="6" fill="#FF7EA8" opacity=".6"/>
    ${propSvg}
  </g>
</svg>`;
  }

  // ── Декоративні елементи фону ──
  function gearPath(cx, cy, r, teeth) {
    const pts = [];
    for (let i = 0; i < teeth * 2; i++) {
      const a = (Math.PI / teeth) * i;
      const rr = i % 2 ? r * 0.78 : r;
      const a1 = a - Math.PI / teeth / 2.6, a2 = a + Math.PI / teeth / 2.6;
      pts.push(`${(cx + rr * Math.cos(a1)).toFixed(1)},${(cy + rr * Math.sin(a1)).toFixed(1)}`, `${(cx + rr * Math.cos(a2)).toFixed(1)},${(cy + rr * Math.sin(a2)).toFixed(1)}`);
    }
    return `<polygon points="${pts.join(' ')}"/><circle cx="${cx}" cy="${cy}" r="${r * 0.32}" fill="var(--hole, #0A44DC)"/>`;
  }
  const DECOR = {
    brick: '<svg viewBox="0 0 60 44"><rect x="8" y="0" width="16" height="10" rx="2"/><rect x="36" y="0" width="16" height="10" rx="2"/><rect x="0" y="8" width="60" height="36" rx="5"/></svg>',
    gear: `<svg viewBox="0 0 60 60">${gearPath(30, 30, 28, 9)}</svg>`,
    cube: '<svg viewBox="0 0 60 60"><path d="M30 4 L54 17 L54 43 L30 56 L6 43 L6 17 Z" opacity=".9"/><path d="M30 30 L54 17 M30 30 L6 17 M30 30 L30 56" stroke="var(--hole,#0A44DC)" stroke-width="2.5" fill="none" opacity=".55"/></svg>',
    nut: '<svg viewBox="0 0 60 60"><polygon points="30,3 53,16.5 53,43.5 30,57 7,43.5 7,16.5"/><circle cx="30" cy="30" r="11" fill="var(--hole,#0A44DC)"/></svg>',
    star: '<svg viewBox="0 0 60 60"><polygon points="30,3 37,22 57,23 41,36 47,56 30,44 13,56 19,36 3,23 23,22"/></svg>',
    code: '<svg viewBox="0 0 80 50"><path d="M24 8 L6 25 L24 42 M56 8 L74 25 L56 42 M46 4 L34 46" stroke="#fff" stroke-width="7" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    bolt: '<svg viewBox="0 0 40 60"><polygon points="24,2 4,34 18,34 14,58 36,22 22,22"/></svg>',
    chip: '<svg viewBox="0 0 60 60"><rect x="14" y="14" width="32" height="32" rx="4"/><g stroke="#fff" stroke-width="4">' + [20, 30, 40].map(v => `<line x1="${v}" y1="4" x2="${v}" y2="14"/><line x1="${v}" y1="46" x2="${v}" y2="56"/><line x1="4" y1="${v}" x2="14" y2="${v}"/><line x1="46" y1="${v}" x2="56" y2="${v}"/>`).join('') + '</g></svg>',
  };

  function background() {
    if (document.querySelector('.bg-fx')) return;
    const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const box = document.createElement('div');
    box.className = 'bg-fx'; box.setAttribute('aria-hidden', 'true');
    let html = '<i class="glow g1"></i><i class="glow g2"></i><i class="glow g3"></i><div class="grid-fx"></div>';
    const kinds = Object.keys(DECOR);
    const n = reduce ? 10 : (innerWidth < 600 ? 12 : 22);
    for (let i = 0; i < n; i++) {
      const k = kinds[i % kinds.length];
      const size = 22 + Math.random() * 46;
      const dur = 22 + Math.random() * 28;
      const style = `left:${(Math.random() * 100).toFixed(1)}%;width:${size.toFixed(0)}px;--dx:${(-60 + Math.random() * 120).toFixed(0)}px;--rot:${(Math.random() < .5 ? -1 : 1) * (180 + Math.random() * 360).toFixed(0)}deg;animation-duration:${dur.toFixed(1)}s;animation-delay:${(-Math.random() * dur).toFixed(1)}s;opacity:${(0.10 + Math.random() * 0.16).toFixed(2)}`;
      html += `<span class="floater ${k}" style="${style}">${DECOR[k]}</span>`;
    }
    box.innerHTML = html;
    document.body.prepend(box);
    // легкий паралакс за курсором
    if (!reduce && matchMedia('(pointer:fine)').matches) {
      let raf = 0;
      addEventListener('pointermove', e => {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => {
          const x = (e.clientX / innerWidth - 0.5) * 30, y = (e.clientY / innerHeight - 0.5) * 30;
          box.style.setProperty('--px', x.toFixed(1) + 'px'); box.style.setProperty('--py', y.toFixed(1) + 'px');
        });
      });
    }
  }

  // ── Логотип з очима, що кліпають ──
  function logoHTML(cls = '') {
    return `<span class="rs-logo ${cls}"><img src="/img/logo-white.png" alt="Robot School"><i class="lid l"></i><i class="lid r"></i></span>`;
  }

  // ── Персонажі режимів ──
  function bugMonster() {
    return `<svg class="bug-monster" viewBox="0 0 160 130" xmlns="http://www.w3.org/2000/svg">
      <g class="bug-legs" stroke="#2D1B69" stroke-width="7" stroke-linecap="round" fill="none">
        <path d="M50 92 l-20 26"/><path d="M80 98 l0 28"/><path d="M110 92 l20 26"/>
        <path d="M44 70 l-30 -4"/><path d="M116 70 l30 -4"/></g>
      <ellipse cx="80" cy="74" rx="56" ry="38" fill="#7C3AED"/>
      <ellipse cx="80" cy="80" rx="42" ry="24" fill="#A78BFA" opacity=".55"/>
      <circle cx="58" cy="56" r="7" fill="#FDE047"/><circle cx="104" cy="64" r="6" fill="#FDE047"/><circle cx="82" cy="94" r="5" fill="#FDE047"/>
      <path d="M58 28 Q50 6 36 8 M102 28 Q110 6 124 8" stroke="#2D1B69" stroke-width="5" fill="none" stroke-linecap="round"/>
      <circle cx="36" cy="8" r="6" fill="#F43F5E"/><circle cx="124" cy="8" r="6" fill="#F43F5E"/>
      <circle cx="64" cy="44" r="14" fill="#fff"/><circle cx="98" cy="44" r="14" fill="#fff"/>
      <circle class="bug-pupil" cx="68" cy="46" r="6" fill="#111"/><circle class="bug-pupil" cx="102" cy="46" r="6" fill="#111"/>
      <path d="M54 30 l18 6 M108 30 l-18 6" stroke="#2D1B69" stroke-width="5" stroke-linecap="round"/>
      <path d="M58 70 Q80 86 102 70" fill="#2D1B69"/><path d="M66 72 l4 7 l4 -6 l4 7 l4 -7 l4 7 l4 -6" fill="#fff"/>
      <text x="80" y="122" text-anchor="middle" font-family="monospace" font-weight="700" font-size="14" fill="#FDE047" class="bug-err">ERROR 404</text>
    </svg>`;
  }
  function rocket(color = '#FF5A5F') {
    return `<svg class="rocket-svg" viewBox="0 0 80 40"><g class="flame"><path d="M14 20 L0 12 L4 20 L0 28 Z" fill="#FFB020"/><path d="M14 20 L6 15 L8 20 L6 25 Z" fill="#FFF3B0"/></g>
      <path d="M14 10 H54 Q72 10 78 20 Q72 30 54 30 H14 Z" fill="#fff" stroke="#1F2937" stroke-width="2"/>
      <path d="M54 10 Q72 10 78 20 Q72 30 54 30 Z" fill="${color}"/><circle cx="42" cy="20" r="6" fill="#3EC5FF" stroke="#1F2937" stroke-width="2"/>
      <path d="M18 10 L10 2 H24 L30 10 Z M18 30 L10 38 H24 L30 30 Z" fill="${color}"/></svg>`;
  }
  function brick(color, small) {
    return `<svg class="tbrick ${small ? 'sm' : ''}" viewBox="0 0 60 36"><rect x="8" y="0" width="14" height="8" rx="2" fill="${color}"/><rect x="38" y="0" width="14" height="8" rx="2" fill="${color}"/><rect x="0" y="6" width="60" height="30" rx="4" fill="${color}"/><rect x="5" y="10" width="20" height="4" rx="2" fill="#fff" opacity=".35"/></svg>`;
  }

  const MODES = {
    classic: { name: 'Класика', emoji: '🏆', short: 'Бали, серії й таблиця лідерів', desc: 'Відповідай швидко й правильно — потрап на подіум!', kid: 'Відповідай швидко й правильно, щоб потрапити на подіум!' },
    race: { name: 'Космічні перегони', emoji: '🚀', short: 'Ракети учнів летять до Марса', desc: 'Кожна правильна відповідь — це паливо для ракети. Хто першим долетить до Марса?', kid: 'Твоя ракета летить до Марса! Правильні відповіді = паливо 🚀' },
    bug: { name: 'Втеча від Бага', emoji: '🐛', short: 'Тікай від комп\'ютерного Бага', desc: 'Баг наздоганяє роботів! Відповідай правильно, щоб утекти, а спійманих можна звільнити правильною відповіддю.', kid: 'За тобою женеться Баг! Відповідай правильно й швидко, щоб він тебе не спіймав 🐛' },
    towers: { name: 'Битва веж', emoji: '🧱', short: 'Командна гра: будуйте вежу з цеглинок', desc: 'Учні діляться на команди. Кожна правильна відповідь додає цеглинки до вежі команди. Чия вежа буде найвищою?', kid: 'Ви — команда! Кожна правильна відповідь додає цеглинки до вашої вежі 🧱' },
  };

  global.Art = { MODES, mascot, background, logoHTML, bugMonster, rocket, brick, DECOR };
})(window);
