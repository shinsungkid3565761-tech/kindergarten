// 아날로그 시계 위젯 (노란 스퀘클 문자판 + 요일·날짜 / 날씨 표시 + 디지털 시각)

import { icon } from './icons.js';
import * as U from './util.js';

const C = 100;
const SUPER_N = 4;

/** 스퀘클(초타원) 위에서 각도 θ 방향의 반지름 */
function squircleRadius(theta, a) {
  const s = Math.abs(Math.sin(theta)) ** SUPER_N;
  const c = Math.abs(Math.cos(theta)) ** SUPER_N;
  return a / (s + c) ** (1 / SUPER_N);
}

function polar(theta, r) {
  return [C + r * Math.sin(theta), C - r * Math.cos(theta)];
}

const f1 = (n) => Math.round(n * 10) / 10;

function squirclePath(a) {
  const points = [];
  for (let i = 0; i < 144; i++) {
    const theta = (i / 144) * Math.PI * 2;
    points.push(polar(theta, squircleRadius(theta, a)).map(f1).join(' '));
  }
  return `M${points.join('L')}Z`;
}

function ticks() {
  let out = '';
  for (let i = 0; i < 60; i++) {
    if (i % 15 === 0) continue; // 12 · 3 · 6 · 9 자리는 숫자
    const hour = i % 5 === 0;
    const theta = (i / 60) * Math.PI * 2;
    const outer = squircleRadius(theta, 92);
    const [x1, y1] = polar(theta, outer - (hour ? 13 : 4.5));
    const [x2, y2] = polar(theta, outer);
    out += `<line class="clock__tick${hour ? ' is-hour' : ''}" x1="${f1(x1)}" y1="${f1(y1)}" x2="${f1(x2)}" y2="${f1(y2)}"/>`;
  }
  return out;
}

function numerals() {
  return [[12, 0], [3, 90], [6, 180], [9, 270]].map(([n, deg]) => {
    const theta = (deg / 180) * Math.PI;
    const [x, y] = polar(theta, squircleRadius(theta, 71));
    return `<text class="clock__num" x="${f1(x)}" y="${f1(y)}">${n}</text>`;
  }).join('');
}

const FACE = squirclePath(99);

function template() {
  return `
    <div class="clock">
      <div class="clock__face">
        <svg viewBox="0 0 200 200" role="img" aria-label="시계">
          <defs>
            <linearGradient id="kg-clock-fill" x1="0" y1="0" x2="0.35" y2="1">
              <stop offset="0" class="clock__stop1"/>
              <stop offset="1" class="clock__stop2"/>
            </linearGradient>
            <radialGradient id="kg-clock-sheen" cx="0.3" cy="0.12" r="0.75">
              <stop offset="0" stop-color="#fff" stop-opacity="0.55"/>
              <stop offset="0.55" stop-color="#fff" stop-opacity="0"/>
            </radialGradient>
            <filter id="kg-hand-shadow" x="-50%" y="-50%" width="200%" height="200%">
              <feDropShadow dx="0" dy="1.4" stdDeviation="1.3" flood-color="#3b2a00" flood-opacity="0.32"/>
            </filter>
          </defs>
          <path class="clock__bg" d="${FACE}" fill="url(#kg-clock-fill)"/>
          <path d="${FACE}" fill="url(#kg-clock-sheen)"/>
          <path class="clock__rim" d="${FACE}"/>
          <g>${ticks()}</g>
          <g>${numerals()}</g>
          <text class="clock__cx" x="62" y="101"><tspan class="clock__wd"></tspan><tspan class="clock__day" dx="3"></tspan></text>
          <g class="clock__wx" hidden>
            <g class="clock__wx-icon"></g>
            <text class="clock__cx clock__temp" x="137" y="101"></text>
          </g>
          <g filter="url(#kg-hand-shadow)">
            <g class="clock__hand" data-hand="hour">
              <line x1="100" y1="100" x2="100" y2="86" class="clock__stem"/>
              <rect x="95.6" y="50" width="8.8" height="40" rx="4.4" class="clock__body"/>
            </g>
            <g class="clock__hand" data-hand="minute">
              <line x1="100" y1="100" x2="100" y2="86" class="clock__stem"/>
              <rect x="96.1" y="27" width="7.8" height="63" rx="3.9" class="clock__body"/>
            </g>
            <circle cx="100" cy="100" r="5" class="clock__cap"/>
            <g class="clock__hand" data-hand="second">
              <line x1="100" y1="119" x2="100" y2="21" class="clock__sec-line"/>
              <circle cx="100" cy="100" r="3.8" class="clock__sec-cap"/>
              <circle cx="100" cy="100" r="1.5" fill="#fff"/>
            </g>
          </g>
        </svg>
      </div>
      <p class="clock__digital" aria-hidden="true"><span class="clock__hm"></span><span class="clock__s"></span></p>
      <p class="clock__meta"></p>
      <p class="clock__dust" hidden></p>
    </div>`;
}

const AMPM = (h) => (h < 12 ? '오전' : '오후');

/**
 * 시계를 만듭니다. start()로 움직이고, stop()으로 멈춥니다.
 * onMinute(now): 분이 바뀔 때마다 불립니다 (인사말 · 날씨 새로 고침용).
 */
export function createClock({ onMinute } = {}) {
  const root = U.el(template());
  const svg = root.querySelector('svg');
  const hands = {
    hour: root.querySelector('[data-hand="hour"]'),
    minute: root.querySelector('[data-hand="minute"]'),
    second: root.querySelector('[data-hand="second"]')
  };
  const hm = root.querySelector('.clock__hm');
  const sec = root.querySelector('.clock__s');
  const wd = root.querySelector('.clock__wd');
  const day = root.querySelector('.clock__day');
  const wx = root.querySelector('.clock__wx');
  const wxIcon = root.querySelector('.clock__wx-icon');
  const temp = root.querySelector('.clock__temp');
  const meta = root.querySelector('.clock__meta');
  const dust = root.querySelector('.clock__dust');
  let timer = 0;
  let lastMinute = -1;
  let weatherLabel = '';
  let labelDirty = false;

  const rotate = (el, deg) => el.setAttribute('transform', `rotate(${f1(deg)} 100 100)`);

  function draw() {
    const now = new Date();
    const h = now.getHours();
    const m = now.getMinutes();
    const s = now.getSeconds();
    rotate(hands.second, s * 6);
    rotate(hands.minute, m * 6 + s * 0.1);
    rotate(hands.hour, (h % 12) * 30 + m * 0.5);
    hm.textContent = `${U.pad2(h)}:${U.pad2(m)}`;
    sec.textContent = U.pad2(s);

    const minuteKey = h * 60 + m;
    if (minuteKey !== lastMinute || labelDirty) {
      labelDirty = false;
      wd.textContent = U.weekdayName(U.ymd(now));
      day.textContent = String(now.getDate());
      svg.setAttribute('aria-label', `지금 ${AMPM(h)} ${h % 12 || 12}시 ${m}분${weatherLabel ? `, ${weatherLabel}` : ''}`);
    }
    if (minuteKey !== lastMinute) {
      const first = lastMinute === -1;
      lastMinute = minuteKey;
      if (onMinute && !first) onMinute(now);
    }
  }

  function loop() {
    draw();
    timer = setTimeout(loop, 1000 - (Date.now() % 1000) + 8);
  }

  return {
    root,
    start() {
      if (!timer) loop();
    },
    stop() {
      clearTimeout(timer);
      timer = 0;
    },
    /** 지금 날씨 표시. current: weather.currentWeather() 결과 (없으면 숨김) */
    setWeather(current, place) {
      if (!current) {
        wx.setAttribute('hidden', '');
        meta.textContent = '';
        dust.hidden = true;
        weatherLabel = '';
        return;
      }
      const hasTemp = Number.isFinite(current.temp);
      wx.toggleAttribute('hidden', !hasTemp);
      if (hasTemp) {
        const text = `${current.temp}°`;
        temp.textContent = text;
        // 아이콘 + 온도를 한 덩어리로 가운데(137) 정렬
        const width = 15 + 2 + text.length * 7.4;
        const left = 137 - width / 2;
        wxIcon.setAttribute('transform', `translate(${f1(left)} 93)`);
        wxIcon.innerHTML = icon(current.info.icon, 15).replace('<svg', '<svg x="0" y="0"');
        temp.setAttribute('x', f1(left + 17));
      }
      const parts = [place, current.info.label, [
        Number.isFinite(current.max) ? `최고 ${current.max}°` : '',
        Number.isFinite(current.min) ? `최저 ${current.min}°` : ''
      ].filter(Boolean).join(' ')].filter(Boolean);
      meta.textContent = parts.join(' · ');
      dust.hidden = !current.dust;
      if (current.dust) {
        dust.innerHTML = `<i class="dust-dot tone-${current.dust.tone}"></i>미세먼지 ${current.dust.label}`;
      }
      weatherLabel = `${place} ${current.info.label}${hasTemp ? ` ${current.temp}도` : ''}`;
      labelDirty = true; // 다음 그리기 때 화면 읽기 문구도 새로 고칩니다.
    }
  };
}
