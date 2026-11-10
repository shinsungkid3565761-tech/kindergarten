// 날씨 · 미세먼지: Open-Meteo 무료 예보 (키 없이 브라우저에서 바로 받습니다)
// - 위치는 config.js 의 WEATHER (기본: 당진시)
// - 20분 안에 받은 날씨는 이 기기에 저장해 두고 다시 쓰므로 요청이 많지 않습니다.

import { CONFIG } from './config.js';

const CACHE_KEY = 'kg-weather-v1';
const FRESH_MS = 20 * 60 * 1000;
const STALE_OK_MS = 18 * 3600 * 1000; // 인터넷이 잠시 안 될 때 쓸 수 있는 예전 날씨
const TIMEOUT_MS = 10000;

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const AIR_URL = 'https://air-quality-api.open-meteo.com/v1/air-quality';

// 유치원에 있는 시간 (등원 ~ 하원)
export const SCHOOL_HOURS = { from: 8, to: 17 };

// WMO 날씨 코드 → 이름 · 문장 · 아이콘 · 심한 정도
const WMO = [
  [[0], '맑음', '맑고', 'sun', 0],
  [[1], '대체로 맑음', '대체로 맑고', 'sun', 0],
  [[2], '구름 조금', '구름이 조금 끼고', 'partly', 0],
  [[3], '흐림', '흐리고', 'cloud', 1],
  [[45, 48], '안개', '안개가 끼고', 'fog', 2],
  [[51, 53, 55], '이슬비', '이슬비가 내리고', 'rain', 3],
  [[56, 57, 66, 67], '어는 비', '어는 비가 내리고', 'rain', 4],
  [[61, 63], '비', '비가 오고', 'rain', 4],
  [[65], '강한 비', '비가 많이 오고', 'rain', 5],
  [[80, 81], '소나기', '소나기가 오고', 'rain', 4],
  [[82], '강한 소나기', '소나기가 세차게 오고', 'rain', 5],
  [[71, 73, 77, 85], '눈', '눈이 오고', 'snow', 6],
  [[75, 86], '많은 눈', '눈이 많이 오고', 'snow', 6],
  [[95], '뇌우', '천둥 · 번개가 치고', 'storm', 7],
  [[96, 99], '뇌우 · 우박', '천둥 · 번개가 치고', 'storm', 7]
];

export function weatherInfo(code, isDay = true) {
  const row = WMO.find(([codes]) => codes.includes(Number(code)));
  if (!row) return { label: '', clause: '', icon: 'cloud', severity: 0, kind: 'cloud' };
  const [, label, clause, kind, severity] = row;
  const iconName = !isDay && kind === 'sun' ? 'moon' : !isDay && kind === 'partly' ? 'moonCloud' : kind;
  return { label, clause, icon: iconName, severity, kind };
}

export function isRainCode(code) {
  return weatherInfo(code).kind === 'rain' || weatherInfo(code).kind === 'storm';
}

export function isSnowCode(code) {
  return weatherInfo(code).kind === 'snow';
}

// 환경부 미세먼지 예보 등급 (㎍/㎥)
const PM10_STEPS = [30, 80, 150];
const PM25_STEPS = [15, 35, 75];
const DUST_LABELS = ['좋음', '보통', '나쁨', '매우 나쁨'];
const DUST_TONES = ['blue', 'green', 'orange', 'red'];

function stepOf(value, steps) {
  if (!Number.isFinite(value)) return -1;
  const index = steps.findIndex((limit) => value <= limit);
  return index === -1 ? steps.length : index;
}

/** PM10 · PM2.5 중 더 나쁜 쪽 등급 */
export function dustGrade(pm10, pm25) {
  const level = Math.max(stepOf(pm10, PM10_STEPS), stepOf(pm25, PM25_STEPS));
  if (level < 0) return null;
  return { level, label: DUST_LABELS[level], tone: DUST_TONES[level] };
}

// ─── 받아오기 ──────────────────────────────────

function readCache() {
  try {
    const saved = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    if (saved && saved.fetchedAt && Array.isArray(saved.hourly) && saved.place === place()) return saved;
  } catch (err) {
    // 저장소를 쓸 수 없으면 새로 받습니다.
  }
  return null;
}

function writeCache(data) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch (err) {
    // 저장하지 못해도 이번 화면에는 그대로 씁니다.
  }
}

function place() {
  const w = CONFIG.WEATHER || {};
  return `${w.PLACE || ''}@${w.LATITUDE},${w.LONGITUDE}`;
}

async function getJson(base, params) {
  const url = new URL(base);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`날씨 서버 응답 ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

const num = (value) => (value === null || value === undefined || value === '' ? null : Number(value));

/** { time: [...], a: [...], b: [...] } → [{ time, a, b }] */
function rows(block, mapping) {
  if (!block || !Array.isArray(block.time)) return [];
  return block.time.map((time, i) => {
    const row = { time };
    Object.entries(mapping).forEach(([key, source]) => {
      row[key] = num(block[source] && block[source][i]);
    });
    return row;
  });
}

function normalize(forecast, air) {
  const current = forecast.current || {};
  return {
    fetchedAt: Date.now(),
    place: place(),
    current: {
      time: current.time || '',
      temp: num(current.temperature_2m),
      feels: num(current.apparent_temperature),
      code: num(current.weather_code),
      isDay: current.is_day === undefined ? null : Boolean(current.is_day),
      wind: num(current.wind_speed_10m)
    },
    daily: rows(forecast.daily, {
      code: 'weather_code',
      max: 'temperature_2m_max',
      min: 'temperature_2m_min',
      pop: 'precipitation_probability_max',
      rain: 'precipitation_sum',
      uv: 'uv_index_max'
    }).map((row) => ({ ...row, date: row.time })),
    hourly: rows(forecast.hourly, {
      temp: 'temperature_2m',
      feels: 'apparent_temperature',
      pop: 'precipitation_probability',
      rain: 'precipitation',
      code: 'weather_code',
      wind: 'wind_speed_10m',
      uv: 'uv_index'
    }),
    air: air ? {
      current: air.current ? { pm10: num(air.current.pm10), pm25: num(air.current.pm2_5) } : null,
      hourly: rows(air.hourly, { pm10: 'pm10', pm25: 'pm2_5' })
    } : null
  };
}

async function download() {
  const w = CONFIG.WEATHER;
  const where = { latitude: w.LATITUDE, longitude: w.LONGITUDE, timezone: 'Asia/Seoul' };
  const [forecast, air] = await Promise.all([
    getJson(FORECAST_URL, {
      ...where,
      forecast_days: 7,
      wind_speed_unit: 'ms',
      current: 'temperature_2m,apparent_temperature,weather_code,is_day,wind_speed_10m',
      hourly: 'temperature_2m,apparent_temperature,precipitation_probability,precipitation,weather_code,wind_speed_10m,uv_index',
      daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,uv_index_max'
    }),
    // 미세먼지는 없어도 날씨는 보여 줍니다.
    getJson(AIR_URL, { ...where, forecast_days: 5, current: 'pm10,pm2_5', hourly: 'pm10,pm2_5' }).catch(() => null)
  ]);
  if (!forecast || !forecast.hourly) throw new Error('날씨 정보를 읽지 못했어요.');
  return normalize(forecast, air);
}

let pending = null;

/**
 * 날씨를 돌려줍니다. 20분 안에 받은 것이 있으면 그대로 쓰고,
 * 새로 받지 못하면 예전 것(18시간 이내)이라도 돌려줍니다.
 */
export function getWeather({ force = false } = {}) {
  if (!CONFIG.WEATHER) return Promise.reject(new Error('날씨 위치가 설정되지 않았어요.'));
  const cached = readCache();
  if (!force && cached && Date.now() - cached.fetchedAt < FRESH_MS) return Promise.resolve(cached);
  if (!pending) {
    pending = download()
      .then((data) => {
        writeCache(data);
        return data;
      })
      .catch((err) => {
        if (cached && Date.now() - cached.fetchedAt < STALE_OK_MS) return cached;
        throw err;
      })
      .finally(() => {
        pending = null;
      });
  }
  return pending;
}

export function isStale(data, maxAge = 30 * 60 * 1000) {
  return !data || Date.now() - data.fetchedAt > maxAge;
}

// ─── 해석 ─────────────────────────────────────

const hourOf = (time) => Number(String(time).slice(11, 13));
const round = (value) => (Number.isFinite(value) ? Math.round(value) : null);

function average(values) {
  const list = values.filter(Number.isFinite);
  return list.length ? list.reduce((a, b) => a + b, 0) / list.length : null;
}

function maxOf(values) {
  const list = values.filter(Number.isFinite);
  return list.length ? Math.max(...list) : null;
}

function minOf(values) {
  const list = values.filter(Number.isFinite);
  return list.length ? Math.min(...list) : null;
}

/** 지금 날씨 (시계 옆 표시용) */
export function currentWeather(data, today) {
  if (!data) return null;
  const day = data.daily.find((d) => d.date === today);
  const nowHour = data.current.time ? data.current.time.slice(0, 13) : '';
  const airHour = data.air && data.air.hourly.find((h) => h.time.slice(0, 13) === nowHour);
  const air = (data.air && data.air.current) || airHour || null;
  const temp = Number.isFinite(data.current.temp) ? data.current.temp : null;
  if (temp === null && !day) return null;
  return {
    temp: round(temp),
    info: weatherInfo(data.current.code, data.current.isDay !== false),
    max: day ? round(day.max) : null,
    min: day ? round(day.min) : null,
    dust: air ? dustGrade(air.pm10, air.pm25) : null
  };
}

/**
 * 유치원에 있는 시간(8시~17시) 기준으로 그날 날씨를 정리합니다.
 * fromHour를 주면 그 시각부터 하원까지만 봅니다(오늘 오전에 볼 때). 예보 범위를 벗어나면 null.
 */
export function dayForecast(data, date, { fromHour = SCHOOL_HOURS.from } = {}) {
  if (!data) return null;
  const from = Math.max(SCHOOL_HOURS.from, Math.min(fromHour, SCHOOL_HOURS.to - 3));
  const hours = data.hourly.filter((h) => h.time.startsWith(date)
    && hourOf(h.time) >= from && hourOf(h.time) <= SCHOOL_HOURS.to);
  if (hours.length < 4 || !hours.some((h) => Number.isFinite(h.temp))) return null;

  const day = data.daily.find((d) => d.date === date) || {};
  const at = (from, to) => hours.filter((h) => hourOf(h.time) >= from && hourOf(h.time) <= to);
  const feel = (h) => (Number.isFinite(h.feels) ? h.feels : h.temp);

  // 비 · 눈이 한 시간이라도 있으면 그것을, 아니면 가장 흔한 하늘 상태를 대표로 씁니다.
  const wet = hours.filter((h) => weatherInfo(h.code).severity >= 3);
  let code;
  if (wet.length) {
    code = wet.reduce((a, b) => (weatherInfo(b.code).severity > weatherInfo(a.code).severity ? b : a)).code;
  } else {
    const counts = new Map();
    hours.forEach((h) => counts.set(h.code, (counts.get(h.code) || 0) + 1));
    code = [...counts].sort((a, b) => b[1] - a[1] || weatherInfo(b[0]).severity - weatherInfo(a[0]).severity)[0][0];
  }

  const rainHours = hours.filter((h) => isRainCode(h.code) || (h.rain >= 0.2 && !isSnowCode(h.code) && h.temp > 1)).length;
  const snowHours = hours.filter((h) => isSnowCode(h.code) || (h.rain >= 0.2 && h.temp <= 1)).length;
  const airHours = data.air ? data.air.hourly.filter((h) => h.time.startsWith(date)
    && hourOf(h.time) >= 9 && hourOf(h.time) <= SCHOOL_HOURS.to) : [];

  // 비 · 눈이 오전에만 / 오후에만 오는지
  const wetPart = !wet.length ? ''
    : wet.every((h) => hourOf(h.time) >= 12) ? 'pm'
      : wet.every((h) => hourOf(h.time) < 12) ? 'am' : '';

  return {
    date,
    code,
    wetPart,
    info: weatherInfo(code, true),
    morning: round(average(at(8, 9).map((h) => h.temp))),
    afternoon: round(average(at(14, 16).map((h) => h.temp))),
    max: round(Number.isFinite(day.max) ? day.max : maxOf(hours.map((h) => h.temp))),
    min: round(Number.isFinite(day.min) ? day.min : minOf(hours.map((h) => h.temp))),
    high: round(maxOf(hours.map((h) => h.temp))),
    coldFeel: round(minOf(hours.map(feel))),
    afternoonFeel: round(minOf(at(14, 16).map(feel))),
    chill: maxOf(hours.map((h) => (Number.isFinite(h.feels) && Number.isFinite(h.temp) ? h.temp - h.feels : null))),
    warmFeel: round(maxOf(hours.map(feel))),
    pop: round(maxOf(hours.map((h) => h.pop))),
    rainHours,
    snowHours,
    wind: maxOf(hours.map((h) => h.wind)),
    uv: maxOf([day.uv, ...hours.map((h) => h.uv)]),
    dust: airHours.length >= 3
      ? dustGrade(average(airHours.map((h) => h.pm10)), average(airHours.map((h) => h.pm25)))
      : null
  };
}
