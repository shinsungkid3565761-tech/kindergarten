// 날짜 · 텍스트 · 식단 관련 공통 도구

export const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

// 식품의약품안전처 알레르기 유발식품 표시 번호 (1~19)
export const ALLERGENS = [
  '난류', '우유', '메밀', '땅콩', '대두', '밀', '고등어', '게', '새우', '돼지고기',
  '복숭아', '토마토', '아황산류', '호두', '닭고기', '쇠고기', '오징어', '조개류', '잣'
];

export const MEAL_TYPE_PRESETS = ['오전간식', '점심', '오후간식'];
export const SCHEDULE_CATEGORY_PRESETS = ['교육일정', '행사', '체험학습', '부모참여', '생일잔치', '휴원'];

const MEAL_TYPE_ORDER = ['아침', '조식', '오전간식', '오전 간식', '급식', '점심', '중식', '오후간식', '오후 간식', '간식', '저녁', '석식'];

export function pad2(n) {
  return String(n).padStart(2, '0');
}

export function ymd(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function parseYmd(text) {
  const [y, m, d] = text.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function todayYmd() {
  return ymd(new Date());
}

export function monthKey(year, month) {
  return `${year}-${pad2(month)}`;
}

export function shiftMonth(year, month, delta) {
  const d = new Date(year, month - 1 + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

export function addDays(text, days) {
  const d = parseYmd(text);
  d.setDate(d.getDate() + days);
  return ymd(d);
}

export function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

export function weekdayIndex(text) {
  return parseYmd(text).getDay();
}

export function weekdayName(text) {
  return WEEKDAYS[weekdayIndex(text)];
}

/** '10월 29일 (목)' */
export function formatDateLabel(text, { weekday = true, year = false } = {}) {
  const [y, m, d] = text.split('-').map(Number);
  const head = year ? `${y}년 ${m}월 ${d}일` : `${m}월 ${d}일`;
  return weekday ? `${head} (${weekdayName(text)})` : head;
}

export function formatMonthLabel(year, month) {
  return `${year}년 ${month}월`;
}

export function dayDiff(fromText, toText) {
  return Math.round((parseYmd(toText) - parseYmd(fromText)) / 86400000);
}

export function relativeDayLabel(text, today = todayYmd()) {
  const diff = dayDiff(today, text);
  if (diff === 0) return '오늘';
  if (diff === 1) return '내일';
  if (diff === 2) return '모레';
  if (diff > 0) return `${diff}일 후`;
  if (diff === -1) return '어제';
  return `${-diff}일 전`;
}

/** 해당 날짜가 속한 주(월요일 시작)의 월요일 */
export function weekStart(text) {
  const d = parseYmd(text);
  const offset = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - offset);
  return ymd(d);
}

/** 해당 달 기준 몇째 주인지 (월요일 시작 기준) */
export function weekOfMonth(text) {
  const [y, m, d] = text.split('-').map(Number);
  const firstOffset = (new Date(y, m - 1, 1).getDay() + 6) % 7;
  return Math.floor((d + firstOffset - 1) / 7) + 1;
}

/**
 * 다양한 날짜 입력을 YYYY-MM-DD 로 바꿉니다. (엑셀 붙여넣기용)
 * 2026-03-02, 2026.3.2, 2026. 3. 2., 2026/3/2, 3/2, 3.2, 3월 2일, 20260302
 */
export function normalizeDateInput(raw, fallbackYear) {
  const text = String(raw || '').trim().replace(/\(.*?\)/g, '').replace(/[.\s]+$/, '').trim();
  if (!text) return '';

  let y;
  let m;
  let d;
  let match;

  if ((match = text.match(/^(\d{4})\s*[-./년]\s*(\d{1,2})\s*[-./월]\s*(\d{1,2})\s*일?$/))) {
    [, y, m, d] = match;
  } else if ((match = text.match(/^(\d{4})(\d{2})(\d{2})$/))) {
    [, y, m, d] = match;
  } else if ((match = text.match(/^(\d{1,2})\s*[-./월]\s*(\d{1,2})\s*일?$/))) {
    y = fallbackYear;
    [, m, d] = match;
  } else {
    return '';
  }

  y = Number(y);
  m = Number(m);
  d = Number(d);
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return '';
  return ymd(date);
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 알레르기 정보 문자열에서 번호(1~19)를 뽑습니다. '1.2.5', '①②', '난류, 우유' 모두 지원 */
export function parseAllergyNumbers(text) {
  const raw = String(text || '');
  const numbers = new Set();

  (raw.match(/\d+/g) || []).forEach((n) => {
    const num = Number(n);
    if (num >= 1 && num <= ALLERGENS.length) numbers.add(num);
  });

  ALLERGENS.forEach((name, index) => {
    if (raw.includes(name)) numbers.add(index + 1);
  });

  return [...numbers].sort((a, b) => a - b);
}

export function formatAllergyNumbers(numbers) {
  return numbers.length ? numbers.join('.') : '';
}

/**
 * 메뉴 문자열을 항목 배열로 나눕니다.
 * '쌀밥, 쇠고기미역국5.6.16.' → [{ name: '쌀밥', allergens: [] }, { name: '쇠고기미역국', allergens: [5, 6, 16] }]
 */
export function splitMenu(text) {
  return String(text || '')
    .split(/\r?\n|,|，|·/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const match = part.match(/^(.*?[^\d.\s(])\s*\(?((?:\d{1,2}\.?)+)\)?$/);
      if (match) {
        const nums = (match[2].match(/\d+/g) || []).map(Number);
        if (nums.every((n) => n >= 1 && n <= ALLERGENS.length)) {
          return { name: match[1].trim(), allergens: nums };
        }
      }
      return { name: part, allergens: [] };
    });
}

export function mealTypeRank(type) {
  const index = MEAL_TYPE_ORDER.indexOf(String(type).trim());
  return index === -1 ? 50 : index;
}

export function sortMeals(meals) {
  return [...meals].sort((a, b) =>
    a.date.localeCompare(b.date) || mealTypeRank(a.type) - mealTypeRank(b.type));
}

export function mealTone(type) {
  const t = String(type);
  if (t.includes('오전') || t.includes('아침') || t.includes('조식')) return 'orange';
  if (t.includes('오후') || t === '간식') return 'pink';
  if (t.includes('저녁') || t.includes('석식')) return 'purple';
  return 'green';
}

export function mealIcon(type) {
  const tone = mealTone(type);
  if (tone === 'orange') return 'sunrise';
  if (tone === 'pink') return 'cookie';
  if (tone === 'purple') return 'moon';
  return 'bowl';
}

const CATEGORY_TONES = [
  [/휴원|휴업|방학|휴일|공휴/, 'red'],
  [/행사|축제|발표|잔치|생일/, 'pink'],
  [/체험|소풍|견학|나들이|현장/, 'green'],
  [/부모|학부모|상담|참여/, 'purple'],
  [/안전|대피|훈련|보건|건강/, 'orange'],
  [/교육|수업|활동|놀이/, 'blue']
];
const FALLBACK_TONES = ['teal', 'yellow', 'blue', 'purple', 'green'];

export function categoryTone(category) {
  const text = String(category || '');
  for (const [pattern, tone] of CATEGORY_TONES) {
    if (pattern.test(text)) return tone;
  }
  let hash = 0;
  for (const ch of text) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return FALLBACK_TONES[hash % FALLBACK_TONES.length];
}

export function groupBy(items, keyFn) {
  const map = new Map();
  items.forEach((item) => {
    const key = keyFn(item);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  });
  return map;
}

/** 엑셀·구글시트에서 복사한 탭 구분 텍스트를 2차원 배열로 바꿉니다 (따옴표·줄바꿈 셀 지원). */
export function parseTsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  const src = String(text || '').replace(/\r\n?/g, '\n');

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"' && cell === '') {
      quoted = true;
    } else if (ch === '\t') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }
  row.push(cell);
  rows.push(row);

  return rows
    .map((r) => r.map((c) => c.trim()))
    .filter((r) => r.some((c) => c !== ''));
}

export function el(html) {
  const template = document.createElement('template');
  template.innerHTML = html.trim();
  return template.content.firstElementChild;
}

/** '햇님반, 별님반' → ['햇님반', '별님반'] (비어 있으면 전체 반 대상) */
export function parseTargets(text) {
  return String(text || '')
    .split(/[,，·/\n]/)
    .map((name) => name.trim())
    .filter(Boolean);
}

/** 반을 고르지 않았거나, 대상 반이 비어 있거나(전체), 우리 반이 포함된 일정이면 true */
export function isForClass(event, className) {
  if (!className) return true;
  const targets = parseTargets(event.target);
  return !targets.length || targets.includes(className);
}
