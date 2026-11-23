// Конструктор аватара-робота: усі частини малюються SVG-кодом, без зовнішніх картинок.
(function (global) {
  const COLORS = ['#2F6BFF', '#3EC5FF', '#2ED3A0', '#7BD94A', '#FFC93C', '#FF8A3D', '#FF5A5F', '#FF7EC7', '#9B6CFF', '#B8C2D6', '#4A5568', '#E8B04A'];
  const BGS = ['#DCE7FF', '#D8F6FF', '#D7FBEA', '#EAFBD3', '#FFF3CC', '#FFE3D1', '#FFE0E2', '#FFE3F4', '#EBE2FF', '#E9EDF5'];

  const OPTIONS = {
    body: ['Кубик', 'Кругляш', 'Телик', 'Капсула', 'Ведмедик'],
    color: COLORS,
    eyes: ['Точки', 'Великі очі', 'Радісні', 'LED-квадрати', 'Сердечка', 'Зірочки', 'Сонні', 'Підморг'],
    mouth: ['Усмішка', 'Регіт', 'Решітка', 'Ой!', 'Язичок', 'Котик :3', 'Зубастик'],
    antenna: ['Без антени', 'Кулька', 'Подвійна', 'Блискавка', 'Пружинка', 'Сердечко'],
    hat: ['Без шапки', 'Кепка', 'Корона', 'Циліндр', 'Чарівник', 'Святковий ковпак', 'Шапка з помпоном', 'Навушники', 'Кепка-пропелер', 'Шапка Санти'],
    glasses: ['Без окулярів', 'Круглі', 'Сонцезахисні', 'Окуляри-зірки', 'Монокль', 'VR-шолом', '3D-окуляри'],
    neck: ['Нічого', 'Метелик', 'Шарф', 'Медаль', 'Краватка', 'Плащ героя', 'Кулон-серце'],
    hand: ['Порожні руки', 'Гайковий ключ', 'Пензлик', 'Чарівна паличка', 'Повітряна кулька', 'Прапорець'],
    bg: BGS,
  };
  const TABS = [
    ['body', 'Корпус', '🤖'], ['color', 'Колір', '🎨'], ['eyes', 'Очі', '👀'], ['mouth', 'Рот', '😄'],
    ['antenna', 'Антена', '📡'], ['hat', 'Шапка', '🎩'], ['glasses', 'Окуляри', '🕶️'], ['neck', 'Прикраса', '🎀'],
    ['hand', 'У руці', '🔧'], ['bg', 'Фон', '🖼️'],
  ];

  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    const t = amt < 0 ? 0 : 255, p = Math.abs(amt);
    r = Math.round((t - r) * p + r); g = Math.round((t - g) * p + g); b = Math.round((t - b) * p + b);
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  const GLOW = '#7CF5FF';
  const SCREEN = '#16203F';
  const HEAD_TOP = [45, 38, 52, 35, 48];

  function heart(cx, cy, s, fill) {
    return `<path d="M${cx} ${cy + 6 * s} C ${cx - 12 * s} ${cy - 2 * s}, ${cx - 7 * s} ${cy - 10 * s}, ${cx} ${cy - 4 * s} C ${cx + 7 * s} ${cy - 10 * s}, ${cx + 12 * s} ${cy - 2 * s}, ${cx} ${cy + 6 * s} Z" fill="${fill}"/>`;
  }
  function star(cx, cy, r, fill, stroke) {
    let pts = [];
    for (let i = 0; i < 10; i++) {
      const rr = i % 2 ? r * 0.45 : r; const a = Math.PI / 5 * i - Math.PI / 2;
      pts.push((cx + rr * Math.cos(a)).toFixed(1) + ',' + (cy + rr * Math.sin(a)).toFixed(1));
    }
    return `<polygon points="${pts.join(' ')}" fill="${fill}" ${stroke ? `stroke="${stroke}" stroke-width="2" stroke-linejoin="round"` : ''}/>`;
  }

  function antennaSVG(t, top, dark) {
    if (!t) return '';
    const stem = (x1, x2) => `<line x1="${x1}" y1="${top + 4}" x2="${x2}" y2="${top - 16}" stroke="${dark}" stroke-width="5" stroke-linecap="round"/>`;
    switch (t) {
      case 1: return stem(100, 100) + `<circle cx="100" cy="${top - 20}" r="8" fill="#FFD23F" stroke="${dark}" stroke-width="3"/><circle cx="97" cy="${top - 23}" r="2.5" fill="#fff"/>`;
      case 2: return stem(86, 78) + stem(114, 122) + `<circle cx="78" cy="${top - 19}" r="6" fill="#FF5A5F" stroke="${dark}" stroke-width="3"/><circle cx="122" cy="${top - 19}" r="6" fill="#2ED3A0" stroke="${dark}" stroke-width="3"/>`;
      case 3: return stem(100, 100) + `<polygon points="104,${top - 40} 90,${top - 16} 100,${top - 16} 95,${top + 2} 112,${top - 24} 102,${top - 24}" fill="#FFD23F" stroke="${dark}" stroke-width="2.5" stroke-linejoin="round"/>`;
      case 4: return `<path d="M100 ${top + 4} l-8 -5 l16 -5 l-16 -5 l16 -5 l-8 -4" fill="none" stroke="${dark}" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/><circle cx="100" cy="${top - 23}" r="7" fill="#FF7EC7" stroke="${dark}" stroke-width="3"/>`;
      case 5: return stem(100, 100) + heart(100, top - 22, 1.1, '#FF5A5F');
    }
    return '';
  }

  function headSVG(b, c, dark, light) {
    const st = `fill="${c}" stroke="${dark}" stroke-width="4"`;
    switch (b) {
      case 1: return `<circle cx="100" cy="93" r="55" ${st}/><path d="M62 62 Q80 44 104 42" stroke="${light}" stroke-width="6" fill="none" stroke-linecap="round" opacity=".7"/>`;
      case 2: return `<rect x="35" y="52" width="130" height="86" rx="16" ${st}/><circle cx="30" cy="95" r="7" fill="${dark}"/><circle cx="170" cy="95" r="7" fill="${dark}"/><rect x="45" y="58" width="40" height="6" rx="3" fill="${light}" opacity=".7"/>`;
      case 3: return `<rect x="55" y="35" width="90" height="110" rx="45" ${st}/><path d="M70 60 Q82 42 100 40" stroke="${light}" stroke-width="6" fill="none" stroke-linecap="round" opacity=".7"/>`;
      case 4: return `<circle cx="54" cy="52" r="17" ${st}/><circle cx="54" cy="52" r="8" fill="${light}"/><circle cx="146" cy="52" r="17" ${st}/><circle cx="146" cy="52" r="8" fill="${light}"/><rect x="45" y="48" width="110" height="92" rx="32" ${st}/>`;
      default: return `<rect x="45" y="45" width="110" height="95" rx="22" ${st}/><circle cx="41" cy="95" r="6" fill="${dark}"/><circle cx="159" cy="95" r="6" fill="${dark}"/><rect x="55" y="51" width="36" height="6" rx="3" fill="${light}" opacity=".7"/>`;
    }
  }

  function eyesSVG(t) {
    const L = 82, R = 118, Y = 88;
    switch (t) {
      case 1: return [L, R].map(x => `<circle cx="${x}" cy="${Y}" r="12" fill="#fff"/><circle cx="${x + 2}" cy="${Y + 1}" r="7" fill="#1E3A8A"/><circle cx="${x + 4}" cy="${Y - 2}" r="2.6" fill="#fff"/>`).join('');
      case 2: return [L, R].map(x => `<path d="M${x - 9} ${Y + 4} Q${x} ${Y - 9} ${x + 9} ${Y + 4}" stroke="${GLOW}" stroke-width="5" fill="none" stroke-linecap="round"/>`).join('');
      case 3: return [L, R].map(x => `<rect x="${x - 7}" y="${Y - 7}" width="14" height="14" rx="2" fill="${GLOW}"/><rect x="${x - 4}" y="${Y - 4}" width="4" height="4" fill="#fff"/>`).join('');
      case 4: return heart(L, Y, 1, '#FF5A8A') + heart(R, Y, 1, '#FF5A8A');
      case 5: return star(L, Y, 10, '#FFD23F') + star(R, Y, 10, '#FFD23F');
      case 6: return [L, R].map(x => `<path d="M${x - 9} ${Y} Q${x} ${Y + 7} ${x + 9} ${Y}" stroke="${GLOW}" stroke-width="4.5" fill="none" stroke-linecap="round"/>`).join('') + `<text x="134" y="74" font-size="12" font-weight="800" fill="${GLOW}" font-family="sans-serif">z</text>`;
      case 7: return `<circle cx="${L}" cy="${Y}" r="7.5" fill="${GLOW}"/><circle cx="${L + 2}" cy="${Y - 2}" r="2.2" fill="#fff"/><path d="M${R - 9} ${Y + 1} Q${R} ${Y - 8} ${R + 9} ${Y + 1}" stroke="${GLOW}" stroke-width="4.5" fill="none" stroke-linecap="round"/>`;
      default: return [L, R].map(x => `<circle cx="${x}" cy="${Y}" r="7.5" fill="${GLOW}"/><circle cx="${x + 2}" cy="${Y - 2}" r="2.2" fill="#fff"/>`).join('');
    }
  }

  function mouthSVG(t) {
    const s = `stroke="${GLOW}" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"`;
    switch (t) {
      case 1: return `<path d="M86 104 Q100 104 114 104 Q113 118 100 118 Q87 118 86 104 Z" fill="${GLOW}"/><path d="M92 112 Q100 107 108 112 Q104 117 100 117 Q96 117 92 112Z" fill="#FF7EA8"/>`;
      case 2: return `<rect x="84" y="103" width="32" height="12" rx="3" fill="none" stroke="${GLOW}" stroke-width="3"/>` + [92, 100, 108].map(x => `<line x1="${x}" y1="104" x2="${x}" y2="114" stroke="${GLOW}" stroke-width="2.5"/>`).join('');
      case 3: return `<ellipse cx="100" cy="110" rx="6" ry="7" fill="none" stroke="${GLOW}" stroke-width="4"/>`;
      case 4: return `<path d="M87 105 Q100 116 113 105" ${s}/><path d="M101 110 q0 9 6 9 q6 0 5 -10" fill="#FF7EA8" stroke="#FF7EA8" stroke-width="1"/>`;
      case 5: return `<path d="M86 106 Q93 114 100 106 Q107 114 114 106" ${s}/>`;
      case 6: return `<path d="M84 105 L90 113 L96 105 L102 113 L108 105 L114 113" ${s}/>`;
      default: return `<path d="M87 105 Q100 117 113 105" ${s}/>`;
    }
  }

  function glassesSVG(t) {
    switch (t) {
      case 1: return `<g fill="rgba(255,255,255,.15)" stroke="#2B2B2B" stroke-width="3.5"><circle cx="82" cy="88" r="14"/><circle cx="118" cy="88" r="14"/></g><path d="M96 87 Q100 83 104 87" stroke="#2B2B2B" stroke-width="3.5" fill="none"/><line x1="68" y1="86" x2="56" y2="82" stroke="#2B2B2B" stroke-width="3.5"/><line x1="132" y1="86" x2="144" y2="82" stroke="#2B2B2B" stroke-width="3.5"/>`;
      case 2: return `<path d="M62 78 H138 V84 Q138 102 120 102 Q104 102 102 88 H98 Q96 102 80 102 Q62 102 62 84 Z" fill="#111827" stroke="#111827" stroke-width="2"/><path d="M70 84 L80 84" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".6"/><path d="M108 84 L118 84" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".6"/>`;
      case 3: return star(81, 88, 17, '#FF7EC7', '#B83280') + star(119, 88, 17, '#FF7EC7', '#B83280') + `<line x1="96" y1="86" x2="104" y2="86" stroke="#B83280" stroke-width="3"/>`;
      case 4: return `<circle cx="118" cy="88" r="15" fill="rgba(255,255,255,.15)" stroke="#D4A017" stroke-width="4"/><path d="M131 96 Q140 120 128 138" stroke="#D4A017" stroke-width="2" fill="none" stroke-dasharray="3 3"/>`;
      case 5: return `<defs><linearGradient id="vrg" x1="0" x2="1"><stop offset="0" stop-color="#9B6CFF"/><stop offset="1" stop-color="#3EC5FF"/></linearGradient></defs><rect x="52" y="73" width="96" height="30" rx="14" fill="url(#vrg)" stroke="#2D1B69" stroke-width="3"/><rect x="62" y="80" width="76" height="6" rx="3" fill="#fff" opacity=".45"/>`;
      case 6: return `<rect x="63" y="77" width="74" height="24" rx="5" fill="#fff" stroke="#E5E7EB" stroke-width="2"/><rect x="68" y="81" width="27" height="16" rx="3" fill="#FF3B4E" opacity=".85"/><rect x="105" y="81" width="27" height="16" rx="3" fill="#22D3EE" opacity=".85"/>`;
    }
    return '';
  }

  function hatSVG(t, c) {
    switch (t) {
      case 1: return `<path d="M54 52 Q56 14 100 12 Q144 14 146 52 Z" fill="#FF5A5F" stroke="#B91C1C" stroke-width="3"/><path d="M100 46 H172 Q176 56 162 57 H100 Z" fill="#E11D48" stroke="#B91C1C" stroke-width="3"/><circle cx="100" cy="13" r="4" fill="#B91C1C"/><path d="M78 24 Q88 18 100 18" stroke="#fff" stroke-width="4" fill="none" opacity=".5" stroke-linecap="round"/>`;
      case 2: return `<polygon points="60,52 58,16 80,34 100,8 120,34 142,16 140,52" fill="#FFC93C" stroke="#C98A0A" stroke-width="3" stroke-linejoin="round"/><circle cx="100" cy="40" r="5" fill="#FF5A5F"/><circle cx="78" cy="43" r="4" fill="#3EC5FF"/><circle cx="122" cy="43" r="4" fill="#2ED3A0"/>`;
      case 3: return `<rect x="68" y="6" width="64" height="42" rx="4" fill="#1F2937"/><rect x="68" y="33" width="64" height="8" fill="#FF5A5F"/><rect x="50" y="44" width="100" height="10" rx="5" fill="#111827"/>`;
      case 4: return `<path d="M52 54 Q100 40 148 54 L112 4 Q104 -2 100 12 Z" fill="#6D4AFF" stroke="#3B1E9E" stroke-width="3" stroke-linejoin="round"/>` + star(104, 34, 6, '#FFD23F') + star(86, 46, 4, '#FFD23F') + star(124, 47, 4, '#FFD23F');
      case 5: return `<polygon points="76,52 100,8 124,52" fill="#3EC5FF" stroke="#0369A1" stroke-width="3" stroke-linejoin="round"/><path d="M88 30 L112 30 M82 42 L118 42" stroke="#FFC93C" stroke-width="5"/><circle cx="100" cy="9" r="7" fill="#FF7EC7"/>`;
      case 6: return `<path d="M52 56 Q52 12 100 12 Q148 12 148 56 Z" fill="#FF8A3D"/><path d="M62 30 H138 M56 42 H144" stroke="#FFC93C" stroke-width="5" opacity=".8"/><rect x="48" y="48" width="104" height="14" rx="7" fill="#EA580C"/><circle cx="100" cy="10" r="11" fill="#fff" stroke="#E5E7EB" stroke-width="2"/>`;
      case 7: return `<path d="M42 92 Q42 22 100 22 Q158 22 158 92" stroke="#1F2937" stroke-width="9" fill="none" stroke-linecap="round"/><rect x="30" y="74" width="20" height="40" rx="9" fill="#FF5A5F" stroke="#1F2937" stroke-width="3"/><rect x="150" y="74" width="20" height="40" rx="9" fill="#FF5A5F" stroke="#1F2937" stroke-width="3"/>`;
      case 8: return `<path d="M56 52 Q56 16 100 16 Q144 16 144 52 Z" fill="#FFC93C"/><path d="M56 52 Q56 16 100 16 L100 52 Z" fill="#FF5A5F"/><path d="M100 16 Q144 16 144 52 L100 52 Z" fill="#2F6BFF" opacity=".9"/><rect x="50" y="46" width="100" height="10" rx="5" fill="#1F2937"/><line x1="100" y1="16" x2="100" y2="6" stroke="#1F2937" stroke-width="4"/><ellipse cx="82" cy="6" rx="18" ry="5" fill="#2ED3A0" stroke="#1F2937" stroke-width="2"/><ellipse cx="118" cy="6" rx="18" ry="5" fill="#FF7EC7" stroke="#1F2937" stroke-width="2"/><circle cx="100" cy="6" r="4" fill="#1F2937"/>`;
      case 9: return `<path d="M54 54 Q60 8 112 12 Q150 18 160 52 L148 52 Q140 30 122 28 Q140 38 146 54 Z" fill="#E11D48"/><rect x="48" y="46" width="104" height="14" rx="7" fill="#fff" stroke="#E5E7EB" stroke-width="2"/><circle cx="156" cy="54" r="9" fill="#fff" stroke="#E5E7EB" stroke-width="2"/>`;
    }
    return '';
  }

  function neckSVG(t, c, front) {
    if (!front) return t === 5 ? `<path d="M70 140 L40 196 L160 196 L130 140 Z" fill="#E11D48" stroke="#9F1239" stroke-width="3" stroke-linejoin="round"/>` : '';
    switch (t) {
      case 1: return `<path d="M100 145 L82 135 L82 155 Z M100 145 L118 135 L118 155 Z" fill="#FF5A5F" stroke="#B91C1C" stroke-width="2.5" stroke-linejoin="round"/><circle cx="100" cy="145" r="5" fill="#B91C1C"/>`;
      case 2: return `<path d="M64 138 Q100 152 136 138 L136 150 Q100 164 64 150 Z" fill="#2ED3A0" stroke="#047857" stroke-width="2.5"/><path d="M118 150 L124 180 L112 180 L108 152 Z" fill="#2ED3A0" stroke="#047857" stroke-width="2.5"/><path d="M114 168 H122 M113 174 H123" stroke="#047857" stroke-width="2"/>`;
      case 3: return `<path d="M86 138 L100 160 L114 138" stroke="#2F6BFF" stroke-width="5" fill="none"/><circle cx="100" cy="166" r="11" fill="#FFC93C" stroke="#C98A0A" stroke-width="3"/>` + star(100, 166, 6, '#C98A0A');
      case 4: return `<path d="M94 140 H106 L103 146 L110 178 L100 186 L90 178 L97 146 Z" fill="#9B6CFF" stroke="#5B21B6" stroke-width="2.5" stroke-linejoin="round"/>`;
      case 5: return `<rect x="70" y="137" width="60" height="9" rx="4" fill="#9F1239"/><circle cx="74" cy="142" r="5" fill="#FFC93C"/><circle cx="126" cy="142" r="5" fill="#FFC93C"/>`;
      case 6: return `<path d="M84 138 Q100 156 116 138" stroke="#C0C7D6" stroke-width="2.5" fill="none"/>` + heart(100, 158, 1, '#FF5A8A');
    }
    return '';
  }

  function handSVG(t) {
    switch (t) {
      case 1: return `<g transform="rotate(-25 160 170)"><rect x="156" y="130" width="9" height="44" rx="4" fill="#94A3B8" stroke="#475569" stroke-width="2.5"/><path d="M150 132 Q150 118 160 116 L160 126 L166 126 L166 116 Q176 118 176 132 Q172 140 160 138 Q152 138 150 132 Z" fill="#94A3B8" stroke="#475569" stroke-width="2.5"/></g>`;
      case 2: return `<g transform="rotate(20 160 170)"><rect x="157" y="128" width="7" height="44" rx="3" fill="#B45309"/><rect x="155" y="120" width="11" height="10" fill="#CBD5E1"/><path d="M155 120 Q160 100 166 120 Z" fill="#FF5A5F"/></g>`;
      case 3: return `<line x1="152" y1="176" x2="168" y2="132" stroke="#4B2E83" stroke-width="5" stroke-linecap="round"/>` + star(169, 128, 12, '#FFD23F', '#C98A0A') + `<circle cx="184" cy="118" r="2" fill="#FFD23F"/><circle cx="154" cy="116" r="1.6" fill="#FFD23F"/>`;
      case 4: return `<path d="M160 172 Q166 150 162 118" stroke="#64748B" stroke-width="1.5" fill="none"/><ellipse cx="164" cy="98" rx="17" ry="21" fill="#FF5A8A"/><path d="M158 118 L170 118 L164 124 Z" fill="#FF5A8A"/><ellipse cx="158" cy="90" rx="4" ry="7" fill="#fff" opacity=".6"/>`;
      case 5: return `<line x1="160" y1="178" x2="160" y2="112" stroke="#475569" stroke-width="4" stroke-linecap="round"/><path d="M162 112 H192 L184 124 L192 136 H162 Z" fill="#0A44DC"/><rect x="168" y="119" width="12" height="9" rx="2" fill="#fff"/><circle cx="172" cy="123" r="1.3" fill="#0A44DC"/><circle cx="176" cy="123" r="1.3" fill="#0A44DC"/>`;
    }
    return '';
  }

  function svg(a, opts) {
    a = Object.assign({ body: 0, color: 0, eyes: 0, mouth: 0, antenna: 1, hat: 0, glasses: 0, neck: 0, hand: 0, bg: 0 }, a || {});
    opts = opts || {};
    const c = COLORS[a.color] || COLORS[0];
    const dark = shade(c, -0.35), light = shade(c, 0.45);
    const top = HEAD_TOP[a.body] || 45;
    const uid = 'r' + Math.random().toString(36).slice(2, 8);
    const hatShift = top - 45;
    const showAntenna = a.hat === 0 || a.hat === 7;
    return `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" class="robot-svg" role="img" aria-label="Робот">
<defs><clipPath id="${uid}"><circle cx="100" cy="100" r="100"/></clipPath></defs>
<g clip-path="url(#${uid})">
${opts.noBg ? '' : `<circle cx="100" cy="100" r="100" fill="${BGS[a.bg] || BGS[0]}"/><circle cx="40" cy="40" r="6" fill="#fff" opacity=".6"/><circle cx="170" cy="60" r="4" fill="#fff" opacity=".6"/><circle cx="160" cy="180" r="8" fill="#fff" opacity=".4"/>`}
${neckSVG(a.neck, c, false)}
<rect x="44" y="146" width="20" height="34" rx="10" fill="${c}" stroke="${dark}" stroke-width="4" transform="rotate(12 54 150)"/>
<rect x="136" y="146" width="20" height="34" rx="10" fill="${c}" stroke="${dark}" stroke-width="4" transform="rotate(-12 146 150)"/>
<rect x="66" y="136" width="68" height="56" rx="16" fill="${c}" stroke="${dark}" stroke-width="4"/>
<rect x="82" y="152" width="36" height="24" rx="7" fill="${SCREEN}"/>
<circle cx="91" cy="164" r="3.5" fill="#FF5A5F"/><circle cx="100" cy="164" r="3.5" fill="#FFD23F"/><circle cx="109" cy="164" r="3.5" fill="#2ED3A0"/>
${showAntenna ? antennaSVG(a.antenna, top, dark) : ''}
${headSVG(a.body, c, dark, light)}
<rect x="60" y="64" width="80" height="58" rx="17" fill="${SCREEN}"/>
<circle cx="69" cy="108" r="5" fill="#FF7EA8" opacity=".55"/><circle cx="131" cy="108" r="5" fill="#FF7EA8" opacity=".55"/>
${eyesSVG(a.eyes)}
${mouthSVG(a.mouth)}
${glassesSVG(a.glasses)}
${neckSVG(a.neck, c, true)}
<g transform="translate(0 ${hatShift})">${hatSVG(a.hat, c)}</g>
${handSVG(a.hand)}
</g></svg>`;
  }

  function random() {
    const r = n => Math.floor(Math.random() * n);
    return {
      body: r(5), color: r(COLORS.length), eyes: r(8), mouth: r(7), antenna: r(6),
      hat: Math.random() < 0.6 ? r(10) : 0, glasses: Math.random() < 0.4 ? r(7) : 0,
      neck: Math.random() < 0.6 ? r(7) : 0, hand: Math.random() < 0.5 ? r(6) : 0, bg: r(BGS.length),
    };
  }

  // Рендер панелі конструктора в контейнер
  function mountEditor(root, initial, onChange) {
    let state = Object.assign({}, initial || random());
    let tab = 'body';
    root.innerHTML = `
      <div class="av-editor">
        <div class="av-preview-wrap"><div class="av-preview"></div>
          <button type="button" class="btn btn-ghost av-random">🎲 Випадковий робот</button></div>
        <div class="av-panel">
          <div class="av-tabs" role="tablist"></div>
          <div class="av-grid"></div>
        </div>
      </div>`;
    const prev = root.querySelector('.av-preview');
    const tabs = root.querySelector('.av-tabs');
    const grid = root.querySelector('.av-grid');
    tabs.innerHTML = TABS.map(([k, name, ic]) => `<button type="button" class="av-tab" data-k="${k}" role="tab"><span>${ic}</span>${name}</button>`).join('');
    function render() {
      prev.innerHTML = svg(state);
      prev.classList.remove('pop'); void prev.offsetWidth; prev.classList.add('pop');
      tabs.querySelectorAll('.av-tab').forEach(b => b.classList.toggle('active', b.dataset.k === tab));
      const list = OPTIONS[tab];
      if (tab === 'color' || tab === 'bg') {
        grid.className = 'av-grid swatches';
        grid.innerHTML = list.map((col, i) => `<button type="button" class="swatch ${state[tab] === i ? 'sel' : ''}" data-i="${i}" style="background:${col}" aria-label="Колір ${i + 1}"></button>`).join('');
      } else {
        grid.className = 'av-grid';
        grid.innerHTML = list.map((name, i) => {
          const s = Object.assign({}, state, { [tab]: i });
          return `<button type="button" class="av-opt ${state[tab] === i ? 'sel' : ''}" data-i="${i}" title="${name}">${svg(s, { noBg: tab !== 'body' && false })}<span>${name}</span></button>`;
        }).join('');
      }
      onChange && onChange(Object.assign({}, state));
    }
    tabs.addEventListener('click', e => { const b = e.target.closest('.av-tab'); if (b) { tab = b.dataset.k; render(); global.SFX && SFX.click(); } });
    grid.addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (b) { state[tab] = +b.dataset.i; render(); global.SFX && SFX.pop(); } });
    root.querySelector('.av-random').addEventListener('click', () => { state = random(); render(); global.SFX && SFX.whoosh(); });
    render();
    return { get: () => Object.assign({}, state), set: s => { state = Object.assign({}, s); render(); } };
  }

  global.Robot = { svg, random, mountEditor, OPTIONS, COLORS };
})(window);
