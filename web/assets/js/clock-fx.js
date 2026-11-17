// 시계 문자판 날씨 효과 (맑음 햇살 · 구름 · 비 · 눈 · 천둥 · 안개 · 밤하늘 별)
// 숫자 · 바늘 아래, 문자판 모양 안에서만 은은하게 움직입니다. 흐림 · 비 · 눈일 때 문자판 색은 app.css에서 바꿉니다.
// 움직임 줄이기 설정을 켠 기기에서는 멈춘 그림으로 보입니다 (app.css).

/** 같은 날씨면 늘 같은 배치가 나오도록 하는 간단한 난수 */
function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const f1 = (n) => Math.round(n * 10) / 10;
const anim = (duration, delay) => `style="animation-duration:${f1(duration)}s;animation-delay:${f1(delay)}s"`;

const CLOUD = '<path d="M-28 8h50a11 11 0 0 0 1-22 15 15 0 0 0-29-5 11 11 0 0 0-21 8 9.5 9.5 0 0 0-1 19Z"/>';

function clouds(count, { top = 26, gap = 40, seed = 7 } = {}) {
  const r = seeded(seed);
  let out = '';
  for (let i = 0; i < count; i++) {
    const y = top + i * gap + r() * 12;
    const scale = 0.85 + r() * 0.6;
    const duration = 42 + r() * 30;
    out += `<g class="fx-drift" ${anim(duration, -r() * duration)}><g transform="translate(${f1(40 + r() * 120)} ${f1(y)}) scale(${f1(scale)})">${CLOUD}</g></g>`;
  }
  return `<g class="fx-clouds" filter="url(#kg-fx-soft)">${out}</g>`;
}

function rain(count, { heavy = false, seed = 3 } = {}) {
  const r = seeded(seed);
  const length = heavy ? 15 : 10;
  let out = '';
  for (let i = 0; i < count; i++) {
    const x = 12 + r() * 180;
    const y = 30 + r() * 140;
    const duration = (heavy ? 0.55 : 0.85) + r() * 0.35;
    out += `<line class="fx-drop" x1="${f1(x)}" y1="${f1(y)}" x2="${f1(x - 3)}" y2="${f1(y + length)}" ${anim(duration, -r() * duration)}/>`;
  }
  return `<g class="fx-rain${heavy ? ' is-heavy' : ''}">${out}</g>`;
}

function snow(count, { seed = 11 } = {}) {
  const r = seeded(seed);
  let out = '';
  for (let i = 0; i < count; i++) {
    const fall = 6 + r() * 5;
    const sway = 2.4 + r() * 1.8;
    out += `<g class="fx-fall" ${anim(fall, -r() * fall)}><circle class="fx-flake" cx="${f1(10 + r() * 180)}" cy="${f1(20 + r() * 160)}" r="${f1(1.6 + r() * 1.8)}" ${anim(sway, -r() * sway)}/></g>`;
  }
  return `<g class="fx-snow">${out}</g>`;
}

function stars(count, { seed = 5 } = {}) {
  const r = seeded(seed);
  let out = '';
  for (let i = 0; i < count; i++) {
    // 숫자가 있는 가운데 십자 부분을 피해 네 귀퉁이 쪽에 둡니다.
    const qx = i % 2 ? 1 : -1;
    const qy = i % 4 < 2 ? -1 : 1;
    const x = 100 + qx * (34 + r() * 52);
    const y = 100 + qy * (34 + r() * 52);
    const s = 1.6 + r() * 2.2;
    const duration = 2.2 + r() * 2.6;
    out += `<path class="fx-star" d="M${f1(x)} ${f1(y - s)}Q${f1(x)} ${f1(y)} ${f1(x + s)} ${f1(y)}Q${f1(x)} ${f1(y)} ${f1(x)} ${f1(y + s)}Q${f1(x)} ${f1(y)} ${f1(x - s)} ${f1(y)}Q${f1(x)} ${f1(y)} ${f1(x)} ${f1(y - s)}Z" ${anim(duration, -r() * duration)}/>`;
  }
  return `<g class="fx-stars">${out}</g>`;
}

function sun({ small = false } = {}) {
  let rays = '';
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const b = a + 0.09;
    const R = small ? 70 : 110;
    rays += `<path d="M162 38L${f1(162 + Math.cos(a) * R)} ${f1(38 + Math.sin(a) * R)}L${f1(162 + Math.cos(b) * R)} ${f1(38 + Math.sin(b) * R)}Z"/>`;
  }
  return `
    <circle class="fx-sun__glow" cx="162" cy="38" r="${small ? 46 : 64}" fill="url(#kg-fx-glow)"/>
    <g class="fx-sun__rays">${rays}</g>`;
}

const moon = () => `
  <circle class="fx-moon__glow" cx="160" cy="40" r="42" fill="url(#kg-fx-moon)"/>
  <path class="fx-moon" d="M166 30a10 10 0 1 0 6 16 8 8 0 1 1-6-16Z"/>`;

/**
 * 날씨 효과 SVG 조각
 * @param {{kind: string, severity: number, isDay: boolean}|null} weather
 */
export function weatherFx(weather) {
  if (!weather) return '';
  const { kind, severity = 0, isDay = true } = weather;
  switch (kind) {
    case 'sun':
      return isDay ? sun() : moon() + stars(12);
    case 'partly':
      return isDay ? sun({ small: true }) + clouds(2, { top: 70, gap: 50 }) : moon() + stars(8) + clouds(2, { top: 70, gap: 50 });
    case 'cloud':
      return clouds(3);
    case 'fog':
      return `<g class="fx-fog" filter="url(#kg-fx-soft)">${[58, 100, 142].map((y, i) => `<rect class="fx-fog__band" x="-20" y="${y - 7}" width="170" height="14" rx="7" ${anim(10 + i * 3, -i * 4)}/>`).join('')}</g>`;
    case 'rain':
      return clouds(2, { top: 22, gap: 26, seed: 9 }) + rain(severity >= 5 ? 26 : severity <= 3 ? 12 : 18, { heavy: severity >= 5 });
    case 'storm':
      return clouds(2, { top: 22, gap: 26, seed: 9 }) + rain(24, { heavy: true }) + '<rect class="fx-flash" width="200" height="200"/>';
    case 'snow':
      return snow(severity >= 6 ? 22 : 16);
    default:
      return '';
  }
}

/** 효과에 쓰는 그라데이션 (시계 <defs> 안에 넣습니다) */
export const FX_DEFS = `
  <radialGradient id="kg-fx-glow">
    <stop offset="0" stop-color="#fff" stop-opacity="0.85"/>
    <stop offset="0.45" stop-color="#fff6c8" stop-opacity="0.35"/>
    <stop offset="1" stop-color="#fff6c8" stop-opacity="0"/>
  </radialGradient>
  <radialGradient id="kg-fx-moon">
    <stop offset="0" stop-color="#fff3c4" stop-opacity="0.45"/>
    <stop offset="1" stop-color="#fff3c4" stop-opacity="0"/>
  </radialGradient>
  <filter id="kg-fx-soft" x="-30%" y="-30%" width="160%" height="160%">
    <feGaussianBlur stdDeviation="1.4"/>
  </filter>`;
