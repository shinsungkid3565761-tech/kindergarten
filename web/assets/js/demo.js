// 데모 모드: 실제 서버 대신 브라우저 안에서 같은 API를 흉내 냅니다.
// (주소 뒤에 ?demo 를 붙였을 때만 사용되며, 데이터는 이 브라우저에만 저장됩니다.)

import { ymd, pad2 } from './util.js';

const STORAGE_KEY = 'kg-demo-data-v2';
const FIELDS = {
  schedule: ['date', 'category', 'title', 'detail', 'target'],
  meal: ['date', 'type', 'menu', 'allergy', 'note']
};
const REQUIRED = { schedule: ['title', '행사명'], meal: ['menu', '메뉴'] };
const DEFAULT_CATEGORY = { schedule: ['category', '교육일정'], meal: ['type', '급식'] };

const MORNING = [['우유, 바나나', '2'], ['두유, 찐감자', '5'], ['요구르트, 사과', '2'], ['우유, 시리얼', '2.6'], ['보리차, 떡', '6'], ['우유, 고구마', '2']];
const LUNCH = [
  ['현미밥, 쇠고기미역국, 닭갈비, 시금치나물, 배추김치', '5.6.9.13.15.16'],
  ['차조밥, 감자국, 돈육불고기, 콩나물무침, 깍두기', '5.6.10.13'],
  ['카레라이스, 달걀국, 오이무침, 단무지, 배추김치', '1.2.5.6.13'],
  ['보리밥, 된장찌개, 생선까스, 브로콜리볶음, 백김치', '1.5.6.7'],
  ['짜장덮밥, 유부장국, 군만두, 열무김치, 귤', '5.6.10'],
  ['흑미밥, 어묵국, 닭다리찜, 애호박볶음, 배추김치', '1.5.6.15']
];
const AFTERNOON = [['떡볶이, 보리차', '5.6'], ['고구마맛탕, 우유', '2'], ['옥수수, 요구르트', '2'], ['찐빵, 보리차', '6'], ['과일샐러드, 두유', '1.5'], ['감자전, 보리차', '6']];
// 예시용 공휴일 (날짜가 고정된 국경일만)
const FIXED_HOLIDAYS = {
  '01-01': '신정', '03-01': '삼일절', '05-05': '어린이날', '06-06': '현충일',
  '08-15': '광복절', '10-03': '개천절', '10-09': '한글날', '12-25': '성탄절'
};
const DEMO_CLASSES = ['햇님반', '달님반', '별님반'];
const EVENTS = [
  [2, '교육일정', '이달의 주제 활동 시작', '반별 주제 탐색 놀이'],
  [6, '행사', '이달의 생일잔치', '생일 친구 축하 파티 · 고깔모자 준비'],
  [10, '교육일정', '안전교육 (교통안전)', '횡단보도 건너기 체험'],
  [14, '부모참여', '부모참여수업', '오전 10시 · 각 반 교실'],
  [17, '체험학습', '현장체험학습', '도시락 · 물병 지참', '햇님반, 달님반'],
  [19, '교육일정', '숲 체험', '편한 운동화', '별님반'],
  [22, '교육일정', '소방 대피 훈련', ''],
  [27, '휴원', '재량휴업일', '가정 보육 부탁드립니다']
];

function seed() {
  const data = { schedule: [], meal: [] };
  const now = new Date();

  for (let offset = -1; offset <= 1; offset++) {
    const first = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const y = first.getFullYear();
    const m = first.getMonth() + 1;
    const days = new Date(y, m, 0).getDate();

    EVENTS.forEach(([day, category, title, detail, target = '']) => {
      const d = new Date(y, m - 1, Math.min(day, days));
      while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
      if (d.getMonth() !== m - 1) return;
      data.schedule.push({ date: ymd(d), category, title, detail, target });
    });

    let n = 0;
    for (let day = 1; day <= days; day++) {
      const d = new Date(y, m - 1, day);
      if (d.getDay() === 0 || d.getDay() === 6) continue;
      const date = `${y}-${pad2(m)}-${pad2(day)}`;
      if (data.schedule.some((s) => s.date === date && s.category === '휴원')) continue;
      if (FIXED_HOLIDAYS[date.slice(5)]) continue;
      const pick = (list) => list[(n + day) % list.length];
      data.meal.push({ date, type: '오전간식', menu: pick(MORNING)[0], allergy: pick(MORNING)[1], note: '' });
      data.meal.push({ date, type: '점심', menu: pick(LUNCH)[0], allergy: pick(LUNCH)[1], note: day % 9 === 0 ? '친환경 식재료 사용' : '' });
      data.meal.push({ date, type: '오후간식', menu: pick(AFTERNOON)[0], allergy: pick(AFTERNOON)[1], note: '' });
      n++;
    }
  }
  return data;
}

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (saved && Array.isArray(saved.schedule) && Array.isArray(saved.meal)) return saved;
  } catch (err) {
    // 저장소를 쓸 수 없으면 새 예시 데이터를 씁니다.
  }
  return seed();
}

function fail(code, message) {
  const err = new Error(message);
  err.code = code;
  throw err;
}

function isValidDate(text) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text || '')) return false;
  const [y, m, d] = text.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

export function createDemoBackend() {
  const data = load();

  const persist = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (err) {
      // 무시: 새로고침하면 예시 데이터로 돌아갑니다.
    }
  };

  const withRows = (kind) => data[kind].map((item, index) => ({ ...item, row: index + 2 }));

  const normalize = (kind, item = {}) => {
    const record = {};
    FIELDS[kind].forEach((key) => {
      record[key] = String(item[key] ?? '').trim();
    });
    if (!isValidDate(record.date)) fail('INVALID', '날짜 형식이 올바르지 않습니다. (예: 2026-03-02)');
    const [reqKey, reqLabel] = REQUIRED[kind];
    if (!record[reqKey]) fail('INVALID', `${reqLabel}을(를) 입력해 주세요.`);
    const [catKey, catDefault] = DEFAULT_CATEGORY[kind];
    if (!record[catKey]) record[catKey] = catDefault;
    return record;
  };

  const findRow = (kind, row, original = {}) => {
    const index = Number(row) - 2;
    const current = data[kind][index];
    const same = current && FIELDS[kind].every((key) => String(original[key] ?? '') === String(current[key]));
    if (!same) fail('CONFLICT', '다른 곳에서 내용이 바뀌었습니다. 새로고침 후 다시 시도해 주세요.');
    return index;
  };

  const handlers = {
    month({ year, month }) {
      const prefix = `${year}-${pad2(month)}`;
      const byDate = (a, b) => a.date.localeCompare(b.date);
      return {
        schedules: withRows('schedule').filter((s) => s.date.startsWith(prefix)).sort(byDate),
        meals: withRows('meal').filter((s) => s.date.startsWith(prefix)).sort(byDate),
        classes: DEMO_CLASSES,
        holidays: Object.entries(FIXED_HOLIDAYS)
          .filter(([md]) => md.startsWith(pad2(month)))
          .map(([md, name]) => ({ date: `${year}-${md}`, name }))
      };
    },
    login({ password }) {
      if (!String(password || '').trim()) fail('UNAUTHORIZED', '비밀번호를 입력해 주세요.');
      return { token: 'demo-token', expiresAt: Date.now() + 12 * 3600 * 1000 };
    },
    save({ kind, row, original, item }) {
      const record = normalize(kind, item);
      if (row) {
        data[kind][findRow(kind, row, original)] = record;
        persist();
        return { item: { ...record, row: Number(row) } };
      }
      data[kind].push(record);
      persist();
      return { item: { ...record, row: data[kind].length + 1 } };
    },
    delete({ kind, row, original }) {
      data[kind].splice(findRow(kind, row, original), 1);
      persist();
      return { row };
    },
    bulkAdd({ kind, items }) {
      if (!Array.isArray(items) || !items.length) fail('INVALID', '등록할 항목이 없습니다.');
      const records = items.map((item, index) => {
        try {
          return normalize(kind, item);
        } catch (err) {
          err.message = `${index + 1}번째 줄: ${err.message}`;
          throw err;
        }
      });
      data[kind].push(...records);
      persist();
      return { count: records.length };
    }
  };

  return {
    async handle(method, payload) {
      await new Promise((resolve) => setTimeout(resolve, 220));
      try {
        const handler = handlers[payload.action];
        if (!handler) fail('INVALID', `알 수 없는 요청입니다: ${payload.action}`);
        if (payload.action !== 'month' && payload.action !== 'login' && payload.token !== 'demo-token') {
          fail('UNAUTHORIZED', '로그인이 만료되었습니다. 다시 로그인해 주세요.');
        }
        return structuredClone(handler(payload));
      } catch (err) {
        const { ApiError } = await import('./api.js');
        throw new ApiError(err.code || 'SERVER', err.message);
      }
    }
  };
}
