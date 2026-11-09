// 관리자 페이지: 교육일정 · 급간식 등록 / 수정 / 삭제 / 엑셀 붙여넣기

import { CONFIG } from './config.js';
import { api, IS_DEMO } from './api.js';
import { icon } from './icons.js';
import { initNavbar, createSegmented, openSheet, confirmDialog, toast, renderEmpty, renderError } from './ui.js';
import { buildWorkbook, cellText, cellToDate, downloadBlob, readSpreadsheetFile } from './excel.js';
import * as U from './util.js';

const SESSION_KEY = 'kg-admin-session';
const KIND_KEY = 'kg-admin-kind';
const MAX_RANGE_DAYS = 62;
const MAX_BULK_ROWS = 500;

const KINDS = {
  schedule: {
    label: '교육일정',
    listKey: 'schedules',
    fields: ['date', 'category', 'title', 'detail', 'target'],
    columns: ['날짜', '구분', '행사명', '내용', '대상 반'],
    categoryKey: 'category',
    defaultCategory: '교육일정',
    presets: U.SCHEDULE_CATEGORY_PRESETS,
    requiredKey: 'title',
    requiredLabel: '행사명',
    example: '2026-03-03\t행사\t입학식\t오전 10시 · 유희실\t\n2026-03-10\t체험학습\t고구마 캐기\t긴 옷 · 장갑\t햇님반, 달님반'
  },
  meal: {
    label: '급간식',
    listKey: 'meals',
    fields: ['date', 'type', 'menu', 'allergy', 'note'],
    columns: ['날짜', '구분', '메뉴', '알레르기 정보', '비고'],
    categoryKey: 'type',
    defaultCategory: '점심',
    presets: U.MEAL_TYPE_PRESETS,
    requiredKey: 'menu',
    requiredLabel: '메뉴',
    example: '2026-03-03\t오전간식\t우유, 바나나\t2\t\n2026-03-03\t점심\t쌀밥, 쇠고기미역국, 불고기\t5.6.16\t\n2026-03-03\t오후간식\t떡, 보리차\t6\t'
  }
};

const today = U.todayYmd();
const [thisYear, thisMonth] = today.split('-').map(Number);

const state = {
  year: thisYear,
  month: thisMonth,
  kind: readStorage(localStorage, KIND_KEY) === 'meal' ? 'meal' : 'schedule',
  data: null,
  session: null
};

const $ = (selector) => document.querySelector(selector);
const esc = U.escapeHtml;
const listEl = $('#admin-list');
const statsEl = $('#admin-stats');

let loadSeq = 0;
let toolbarReady = false;
let kindControl = null;

// ─── 저장소 · 세션 ────────────────────────────

function readStorage(storage, key) {
  try {
    return storage.getItem(key);
  } catch (err) {
    return null;
  }
}

function writeStorage(storage, key, value) {
  try {
    if (value == null) storage.removeItem(key);
    else storage.setItem(key, value);
  } catch (err) {
    // 개인정보 보호 모드 등에서는 저장 없이 진행합니다.
  }
}

function loadSession() {
  try {
    const session = JSON.parse(readStorage(sessionStorage, SESSION_KEY) || 'null');
    if (session && session.token && session.expiresAt > Date.now() + 60 * 1000) return session;
  } catch (err) {
    // 손상된 값은 무시합니다.
  }
  return null;
}

// ─── 로그인 ───────────────────────────────────

const loginForm = $('#login-form');
const loginError = $('#login-error');
const loginSubmit = $('#login-submit');

function setLoginError(message) {
  loginError.textContent = message;
  loginError.hidden = !message;
}

function showLogin(message = '') {
  state.session = null;
  writeStorage(sessionStorage, SESSION_KEY, null);
  $('#admin').hidden = true;
  $('#login').hidden = false;
  document.title = `관리자 로그인 · ${CONFIG.SCHOOL_NAME}`;
  setLoginError(message);
  setTimeout(() => loginForm.elements.password.focus(), 60);
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const password = loginForm.elements.password.value;
  if (!password) {
    setLoginError('비밀번호를 입력해 주세요.');
    return;
  }

  loginSubmit.disabled = true;
  loginSubmit.innerHTML = '<span class="spinner" aria-hidden="true"></span>확인 중…';
  setLoginError('');

  try {
    const session = await api.login(password);
    state.session = session;
    writeStorage(sessionStorage, SESSION_KEY, JSON.stringify(session));
    loginForm.reset();
    showAdmin();
  } catch (err) {
    setLoginError(err.message);
    loginForm.elements.password.select();
  } finally {
    loginSubmit.disabled = false;
    loginSubmit.textContent = '로그인';
  }
});

// ─── 관리 화면 ────────────────────────────────

function showAdmin() {
  $('#login').hidden = true;
  $('#admin').hidden = false;
  document.title = `관리자 · ${CONFIG.SCHOOL_NAME}`;
  if (!toolbarReady) buildToolbar();
  load();
}

function buildToolbar() {
  toolbarReady = true;
  const toolbar = $('#admin-toolbar');

  toolbar.innerHTML = `
    <div class="month-switcher glass">
      <button type="button" class="btn icon-btn" data-month="-1" aria-label="이전 달">${icon('chevronLeft', 20)}</button>
      <span class="month-switcher__label" id="month-label" aria-live="polite"></span>
      <button type="button" class="btn icon-btn" data-month="1" aria-label="다음 달">${icon('chevronRight', 20)}</button>
    </div>`;

  kindControl = createSegmented(
    Object.entries(KINDS).map(([value, def]) => ({ value, label: def.label })),
    state.kind,
    (value) => {
      state.kind = value;
      writeStorage(localStorage, KIND_KEY, value);
      renderList();
    },
    { label: '관리할 항목' }
  );
  toolbar.append(kindControl.el);

  toolbar.addEventListener('click', (event) => {
    const button = event.target.closest('[data-month]');
    if (!button) return;
    const next = U.shiftMonth(state.year, state.month, Number(button.dataset.month));
    state.year = next.year;
    state.month = next.month;
    load();
  });

  const actions = $('#admin-actions');
  actions.innerHTML = `
    <button type="button" class="btn btn--tint" data-act="add">${icon('plus', 18)}새로 추가</button>
    <button type="button" class="btn" data-act="excel">${icon('table', 18)}엑셀</button>
    <button type="button" class="btn" data-act="print">${icon('print', 18)}월간 인쇄</button>
    <button type="button" class="btn icon-btn" data-act="refresh" aria-label="새로고침" title="새로고침">${icon('refresh', 18)}</button>`;

  actions.addEventListener('click', (event) => {
    const act = event.target.closest('[data-act]')?.dataset.act;
    if (act === 'add') openEditor(null);
    if (act === 'excel') openExcelHub();
    if (act === 'print') printMonth();
    if (act === 'refresh') load({ force: true });
  });
}

async function load({ force = false } = {}) {
  const seq = ++loadSeq;
  $('#month-label').textContent = U.formatMonthLabel(state.year, state.month);
  statsEl.textContent = '';
  listEl.innerHTML = '<div class="skeleton-stack" aria-hidden="true"><div class="skeleton" style="height:140px"></div><div class="skeleton" style="height:140px"></div></div>';

  try {
    const data = await api.getMonth(state.year, state.month, { force });
    if (seq !== loadSeq) return;
    state.data = data;
    renderList();
  } catch (err) {
    if (seq !== loadSeq) return;
    state.data = null;
    listEl.innerHTML = renderError(err);
  }
}

function itemSummary(kind, item) {
  if (kind === 'meal') {
    const menu = U.splitMenu(item.menu).map((m) => m.name).join(', ');
    const sub = [item.allergy ? `알레르기 ${item.allergy}` : '', item.note].filter(Boolean).join(' · ');
    return { tone: U.mealTone(item.type), category: item.type, title: menu || item.menu, sub };
  }
  return {
    tone: U.categoryTone(item.category),
    category: item.category,
    title: item.title,
    sub: item.detail,
    targets: U.parseTargets(item.target)
  };
}

function renderList() {
  if (!state.data) return;
  const def = KINDS[state.kind];
  const items = state.kind === 'meal' ? U.sortMeals(state.data.meals) : state.data.schedules;

  statsEl.textContent = `${U.formatMonthLabel(state.year, state.month)} · ${def.label} ${items.length}건`;

  if (!items.length) {
    listEl.innerHTML = `
      <section class="card glass fade-in">
        ${renderEmpty({ iconName: state.kind === 'meal' ? 'bowl' : 'calendar', title: `등록된 ${def.label}이 없어요`, text: '새로 추가하거나 엑셀에서 복사한 표를 붙여넣어 한 번에 등록할 수 있어요.' })}
      </section>`;
    return;
  }

  const groups = U.groupBy(items, (item) => item.date);
  listEl.innerHTML = `<div class="admin-days fade-in">${[...groups].map(([date, dayItems]) => {
    const wd = U.weekdayIndex(date);
    return `
      <article class="card glass admin-day">
        <header class="admin-day__head">
          <h2 class="admin-day__date${wd === 0 ? ' is-sun' : wd === 6 ? ' is-sat' : ''}">${U.formatDateLabel(date)}${date === today ? ' · 오늘' : ''}</h2>
          <button type="button" class="btn btn--plain btn--sm" data-add-date="${date}" aria-label="${U.formatDateLabel(date)}에 추가">${icon('plus', 16)}추가</button>
        </header>
        ${dayItems.map((item) => {
          const s = itemSummary(state.kind, item);
          return `
            <button type="button" class="admin-item" data-row="${item.row}">
              <span class="admin-item__main">
                <span class="admin-item__meta"><span class="chip tone-${s.tone}">${esc(s.category)}</span>${
                  s.targets && s.targets.length ? `<span class="chip tone-gray">${icon('users', 12)}${esc(s.targets.join(' · '))}</span>` : ''}</span>
                <span class="admin-item__title">${esc(s.title)}</span>
                ${s.sub ? `<span class="admin-item__sub">${esc(s.sub)}</span>` : ''}
              </span>
              <span class="admin-item__chevron">${icon('chevronRight', 18)}</span>
            </button>`;
        }).join('')}
      </article>`;
  }).join('')}</div>`;
}

listEl.addEventListener('click', (event) => {
  if (event.target.closest('[data-retry]')) {
    load({ force: true });
    return;
  }
  const addButton = event.target.closest('[data-add-date]');
  if (addButton) {
    openEditor(null, { date: addButton.dataset.addDate });
    return;
  }
  const row = event.target.closest('[data-row]');
  if (row) {
    const def = KINDS[state.kind];
    const item = state.data[def.listKey].find((i) => String(i.row) === row.dataset.row);
    if (item) openEditor(item);
  }
});

// ─── 쓰기 공통 ────────────────────────────────

function handleWriteError(err, sheet, errorEl) {
  if (err.code === 'UNAUTHORIZED') {
    sheet.close();
    showLogin(err.message);
    return;
  }
  if (err.code === 'CONFLICT') {
    sheet.close();
    toast(err.message, { tone: 'error' });
    api.clearCache();
    load({ force: true });
    return;
  }
  errorEl.textContent = err.message;
  errorEl.hidden = false;
}

async function afterWrite(message, date) {
  api.clearCache();
  if (date) {
    const [y, m] = date.split('-').map(Number);
    state.year = y;
    state.month = m;
  }
  toast(message);
  await load({ force: true });
}

function defaultDate() {
  return state.year === thisYear && state.month === thisMonth ? today : `${U.monthKey(state.year, state.month)}-01`;
}

function dateRange(start, end, skipWeekend) {
  const dates = [];
  for (let d = start; d <= end; d = U.addDays(d, 1)) {
    const wd = U.weekdayIndex(d);
    if (skipWeekend && (wd === 0 || wd === 6)) continue;
    dates.push(d);
  }
  return dates;
}

// ─── 편집 시트 ────────────────────────────────

function choiceChips(name, values) {
  return `<div class="choice-chips">${values.map((value) =>
    `<button type="button" class="choice-chip" data-chip-for="${name}" data-value="${esc(value)}" aria-pressed="false">${esc(value)}</button>`).join('')}</div>`;
}

function bindChoiceChips(form, name) {
  const input = form.elements[name];
  const chips = [...form.querySelectorAll(`[data-chip-for="${name}"]`)];
  const sync = () => chips.forEach((chip) => chip.setAttribute('aria-pressed', String(chip.dataset.value === input.value.trim())));
  chips.forEach((chip) => chip.addEventListener('click', () => {
    input.value = chip.dataset.value;
    sync();
  }));
  input.addEventListener('input', sync);
  sync();
}

function bindAllergenPicker(form) {
  const input = form.elements.allergy;
  const chips = [...form.querySelectorAll('[data-allergen]')];
  const sync = () => {
    const numbers = U.parseAllergyNumbers(input.value);
    chips.forEach((chip) => chip.setAttribute('aria-pressed', String(numbers.includes(Number(chip.dataset.allergen)))));
  };
  chips.forEach((chip) => chip.addEventListener('click', () => {
    const numbers = new Set(U.parseAllergyNumbers(input.value));
    const n = Number(chip.dataset.allergen);
    if (numbers.has(n)) numbers.delete(n);
    else numbers.add(n);
    input.value = U.formatAllergyNumbers([...numbers].sort((a, b) => a - b));
    sync();
  }));
  input.addEventListener('input', sync);
  sync();
}

function targetField(item, classes) {
  return `
    <div class="field">
      <span class="field__label">대상 반</span>
      ${classes.length ? `<div class="choice-chips">${classes.map((name) =>
        `<button type="button" class="choice-chip" data-target-class="${esc(name)}" aria-pressed="false">${esc(name)}</button>`).join('')}</div>` : ''}
      <input class="input" name="target" value="${esc(item.target || '')}" maxlength="100" placeholder="비워 두면 전체 반" aria-label="대상 반">
      <span class="field__hint">${classes.length
        ? '여러 반을 고를 수 있어요. 아무 반도 고르지 않으면 모든 반에 보이는 일정이에요.'
        : '구글시트 [설정] 탭의 \'반 목록\'에 반 이름을 적으면 여기서 눌러서 고를 수 있어요. 비워 두면 전체 반 일정이에요.'}</span>
    </div>`;
}

function bindTargetChips(form) {
  const input = form.elements.target;
  const chips = [...form.querySelectorAll('[data-target-class]')];
  const sync = () => {
    const selected = U.parseTargets(input.value);
    chips.forEach((chip) => chip.setAttribute('aria-pressed', String(selected.includes(chip.dataset.targetClass))));
  };
  chips.forEach((chip) => chip.addEventListener('click', () => {
    const selected = U.parseTargets(input.value);
    const name = chip.dataset.targetClass;
    input.value = (selected.includes(name) ? selected.filter((n) => n !== name) : [...selected, name]).join(', ');
    sync();
  }));
  input.addEventListener('input', sync);
  sync();
}

function scheduleFields(item, editing, categories, classes) {
  return `
    <div class="form-row form-row--2">
      <label class="field"><span class="field__label" data-date-label>날짜</span>
        <input class="input" type="date" name="date" value="${esc(item.date)}" required></label>
      <label class="field" data-range hidden><span class="field__label">종료일</span>
        <input class="input" type="date" name="endDate" value="${esc(item.date)}"></label>
    </div>
    ${editing ? '' : `
      <div class="field"><label class="toggle-row">여러 날에 걸친 일정 (방학·행사 기간)
        <input type="checkbox" class="switch" name="multi"></label></div>
      <div class="field" data-range hidden><label class="toggle-row">주말(토·일) 제외
        <input type="checkbox" class="switch" name="skipWeekend" checked></label></div>`}
    <div class="field">
      <span class="field__label">구분</span>
      ${choiceChips('category', categories)}
      <input class="input" name="category" value="${esc(item.category || '')}" maxlength="30" placeholder="직접 입력 (예: 행사)" aria-label="구분 직접 입력">
    </div>
    <label class="field"><span class="field__label">행사명</span>
      <input class="input" name="title" value="${esc(item.title || '')}" maxlength="100" placeholder="예: 가을 소풍" required></label>
    <label class="field"><span class="field__label">내용</span>
      <textarea class="input" name="detail" maxlength="1000" placeholder="시간, 장소, 준비물 등">${esc(item.detail || '')}</textarea></label>
    ${targetField(item, classes)}`;
}

function mealFields(item, categories) {
  return `
    <label class="field"><span class="field__label">날짜</span>
      <input class="input" type="date" name="date" value="${esc(item.date)}" required></label>
    <div class="field">
      <span class="field__label">구분</span>
      ${choiceChips('type', categories)}
      <input class="input" name="type" value="${esc(item.type || '')}" maxlength="30" placeholder="직접 입력 (예: 오후간식)" aria-label="구분 직접 입력">
    </div>
    <label class="field"><span class="field__label">메뉴</span>
      <textarea class="input" name="menu" maxlength="500" placeholder="쌀밥&#10;쇠고기미역국&#10;닭갈비" required>${esc(item.menu || '')}</textarea>
      <span class="field__hint">한 줄에 하나씩, 또는 쉼표(,)로 구분해 입력하세요.</span></label>
    <div class="field">
      <span class="field__label">알레르기 정보</span>
      <input class="input" name="allergy" value="${esc(item.allergy || '')}" maxlength="200" placeholder="예: 1.2.5.6" aria-label="알레르기 번호">
      <div class="allergen-picker">${U.ALLERGENS.map((name, i) =>
        `<button type="button" class="choice-chip" data-allergen="${i + 1}" aria-pressed="false"><b>${i + 1}</b>${name}</button>`).join('')}</div>
      <span class="field__hint">번호를 누르면 자동으로 입력돼요.</span>
    </div>
    <label class="field"><span class="field__label">비고</span>
      <input class="input" name="note" value="${esc(item.note || '')}" maxlength="300" placeholder="예: 친환경 식재료 사용"></label>`;
}

/**
 * @param {object|null} original 수정할 항목 (없으면 새로 추가)
 * @param {object} prefill 새로 추가할 때 미리 채울 값
 */
function openEditor(original, prefill = {}) {
  const kind = state.kind;
  const def = KINDS[kind];
  const editing = Boolean(original);
  const item = editing ? { ...original } : { date: defaultDate(), [def.categoryKey]: def.defaultCategory, ...prefill };
  const used = state.data ? state.data[def.listKey].map((i) => i[def.categoryKey]) : [];
  const categories = [...new Set([...def.presets, ...used])].slice(0, 10);

  const form = U.el(`
    <form class="editor" novalidate>
      ${kind === 'meal' ? mealFields(item, categories) : scheduleFields(item, editing, categories, (state.data && state.data.classes) || [])}
      <p class="form-error" role="alert" hidden></p>
      <div class="sheet-footer">
        <button type="submit" class="btn btn--tint btn--block">${icon('check', 18)}저장</button>
        ${editing ? `
          <button type="button" class="btn btn--block" data-duplicate>${icon('copy', 18)}다른 날짜로 복제</button>
          <button type="button" class="btn btn--block btn--danger-text" data-delete>${icon('trash', 18)}삭제</button>` : ''}
      </div>
    </form>`);
  const errorEl = form.querySelector('.form-error');

  const sheet = openSheet({
    title: editing ? `${def.label} 수정` : prefill.copy ? `${def.label} 복제` : `${def.label} 추가`,
    content: form,
    primary: { label: '저장', onClick: () => form.requestSubmit() }
  });

  bindChoiceChips(form, def.categoryKey);
  if (kind === 'meal') bindAllergenPicker(form);
  else bindTargetChips(form);

  const multi = form.elements.multi;
  if (multi) {
    multi.addEventListener('change', () => {
      form.querySelectorAll('[data-range]').forEach((node) => { node.hidden = !multi.checked; });
      form.querySelector('[data-date-label]').textContent = multi.checked ? '시작일' : '날짜';
      if (multi.checked && form.elements.endDate.value < form.elements.date.value) {
        form.elements.endDate.value = form.elements.date.value;
      }
    });
  }

  form.querySelector('[data-duplicate]')?.addEventListener('click', () => {
    sheet.close();
    const copy = {};
    def.fields.forEach((key) => { copy[key] = original[key]; });
    setTimeout(() => openEditor(null, { ...copy, copy: true }), 320);
  });

  form.querySelector('[data-delete]')?.addEventListener('click', async () => {
    const summary = itemSummary(kind, original);
    const ok = await confirmDialog({
      title: '삭제할까요?',
      message: `${U.formatDateLabel(original.date)} · ${summary.category}\n${summary.title}`,
      confirmLabel: '삭제',
      destructive: true
    });
    if (!ok) return;
    sheet.setBusy(true);
    try {
      await api.remove(state.session.token, kind, original);
      sheet.close();
      await afterWrite('삭제했어요');
    } catch (err) {
      handleWriteError(err, sheet, errorEl);
    } finally {
      sheet.setBusy(false);
    }
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    errorEl.hidden = true;

    const data = new FormData(form);
    const record = {};
    def.fields.forEach((key) => { record[key] = String(data.get(key) ?? '').trim(); });
    if (!record[def.categoryKey]) record[def.categoryKey] = def.defaultCategory;

    const fail = (message, field) => {
      errorEl.textContent = message;
      errorEl.hidden = false;
      if (field) form.elements[field].focus();
    };

    if (!record.date) return fail('날짜를 선택해 주세요.', 'date');
    if (!record[def.requiredKey]) return fail(`${def.requiredLabel}을(를) 입력해 주세요.`, def.requiredKey);

    let dates = [record.date];
    if (multi && multi.checked) {
      const end = form.elements.endDate.value;
      if (!end || end < record.date) return fail('종료일은 시작일과 같거나 뒤여야 해요.', 'endDate');
      if (U.dayDiff(record.date, end) > MAX_RANGE_DAYS) return fail(`기간은 최대 ${MAX_RANGE_DAYS}일까지 등록할 수 있어요.`, 'endDate');
      dates = dateRange(record.date, end, form.elements.skipWeekend.checked);
      if (!dates.length) return fail('선택한 기간에 등록할 날짜가 없어요. (주말 제외 설정을 확인해 주세요)');
    }

    sheet.setBusy(true);
    try {
      if (dates.length > 1) {
        await api.bulkAdd(state.session.token, kind, dates.map((date) => ({ ...record, date })));
      } else {
        await api.save(state.session.token, kind, record, editing ? original : null);
      }
      sheet.close();
      await afterWrite(editing ? '수정했어요' : dates.length > 1 ? `${dates.length}일에 등록했어요` : '등록했어요', record.date);
    } catch (err) {
      handleWriteError(err, sheet, errorEl);
    } finally {
      sheet.setBusy(false);
    }
  });
}

// ─── 월간 인쇄 ────────────────────────────────

/**
 * 지금 보고 있는 달을 A4 가로 한 장짜리 표로 인쇄합니다.
 * (급간식 → 식단표, 교육일정 → 일정표 / 주말 일정이 있으면 토·일 칸도 넣습니다)
 */
function printMonth() {
  if (!state.data) {
    toast('먼저 이번 달 내용을 불러와 주세요.', { tone: 'error' });
    return;
  }

  const kind = state.kind;
  const { year, month } = state;
  const items = kind === 'meal' ? U.sortMeals(state.data.meals) : state.data.schedules;
  const byDate = U.groupBy(items, (item) => item.date);
  const holidays = new Map((state.data.holidays || []).map((h) => [h.date, h.name]));
  const fullWeek = items.some((item) => [0, 6].includes(U.weekdayIndex(item.date)));
  const columns = fullWeek ? [0, 1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5];

  // 주(행) 단위로 날짜를 모읍니다. 월~금 표는 월요일, 일~토 표는 일요일이 주의 시작입니다.
  const weeks = new Map();
  for (let day = 1; day <= U.daysInMonth(year, month); day++) {
    const date = `${U.monthKey(year, month)}-${U.pad2(day)}`;
    const wd = U.weekdayIndex(date);
    if (!columns.includes(wd)) continue;
    const key = fullWeek ? U.addDays(date, -wd) : U.weekStart(date);
    if (!weeks.has(key)) weeks.set(key, {});
    weeks.get(key)[wd] = date;
  }

  const cell = (date) => {
    if (!date) return '<td class="is-empty"></td>';
    const wd = U.weekdayIndex(date);
    const holiday = holidays.get(date);
    const list = byDate.get(date) || [];
    const body = kind === 'meal'
      ? list.map((meal) => {
          const parts = U.splitMenu(meal.menu);
          const numbers = new Set(U.parseAllergyNumbers(meal.allergy));
          parts.forEach((p) => p.allergens.forEach((n) => numbers.add(n)));
          return `<div class="pc-item"><span class="pc-type">${esc(meal.type)}</span>${esc(parts.map((p) => p.name).join(', '))}${
            numbers.size ? ` <span class="pc-allergy">(${[...numbers].sort((a, b) => a - b).join('.')})</span>` : ''}</div>`;
        }).join('')
      : list.map((e) => {
          const targets = U.parseTargets(e.target);
          return `<div class="pc-item"><span class="pc-type">${esc(e.category)}</span>${esc(e.title)}${
            targets.length ? ` <span class="pc-allergy">(${esc(targets.join(', '))})</span>` : ''}</div>`;
        }).join('');
    return `
      <td class="${wd === 0 ? 'is-sun' : wd === 6 ? 'is-sat' : ''}${holiday ? ' is-holiday' : ''}">
        <div class="pc-date"><b>${Number(date.slice(8))}</b>${holiday ? `<span class="pc-holiday">${esc(holiday)}</span>` : ''}</div>
        ${body}
      </td>`;
  };

  const title = kind === 'meal' ? '급·간식 식단표' : '교육일정표';
  let root = document.getElementById('print-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'print-root';
    document.body.append(root);
  }

  root.innerHTML = `
    <header class="pc-head">
      <div>
        <p class="pc-school">${esc(CONFIG.SCHOOL_NAME)}</p>
        <h1>${year}년 ${month}월 ${title}</h1>
      </div>
      <p class="pc-printed">출력 ${U.formatDateLabel(today, { year: true })}</p>
    </header>
    <table class="pc-table">
      <thead><tr>${columns.map((wd) => `<th class="${wd === 0 ? 'is-sun' : wd === 6 ? 'is-sat' : ''}">${U.WEEKDAYS[wd]}</th>`).join('')}</tr></thead>
      <tbody>${[...weeks.values()].map((week) => `<tr>${columns.map((wd) => cell(week[wd])).join('')}</tr>`).join('')}</tbody>
    </table>
    ${kind === 'meal' ? `
      <p class="pc-foot">알레르기 유발식품 · ${U.ALLERGENS.map((name, i) => `${i + 1}.${name}`).join(' ')}</p>
      <p class="pc-foot">※ 식단은 식재료 수급 등 유치원 사정에 따라 바뀔 수 있습니다.</p>` : ''}`;

  window.print();
}

// ─── 엑셀 공통: 줄 확인 · 미리보기 ─────────────

/**
 * 한 줄(엑셀 행 · 붙여넣은 줄) 확인
 * → { skip } 날짜 · 구분 말고는 비어 있는 줄(양식의 빈 칸)
 * → { item, error, dateText }
 */
function validateRecord(kind, values, fallbackYear) {
  const def = KINDS[kind];
  const item = {};
  def.fields.forEach((key) => { item[key] = key === 'date' ? '' : cellText(values[key]); });

  const filled = def.fields.some((key) => key !== 'date' && key !== def.categoryKey && item[key]);
  if (!filled) return { skip: true };

  item.date = cellToDate(values.date, fallbackYear);
  if (!item[def.categoryKey]) item[def.categoryKey] = def.defaultCategory;

  let error = '';
  if (!item.date) error = `날짜 형식 확인: ${cellText(values.date) || '(비어 있음)'}`;
  else if (!item[def.requiredKey]) error = `${def.requiredLabel} 없음`;
  return { item, error, dateText: cellText(values.date) };
}

function previewTable(kind, rows, { limit = 60, where = false } = {}) {
  const def = KINDS[kind];
  return `
    <table>
      <thead><tr><th>상태</th>${where ? '<th>위치</th>' : ''}${def.columns.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead>
      <tbody>${rows.slice(0, limit).map((p) => `
        <tr class="${p.error ? 'is-invalid' : ''}">
          <td class="nw">${p.error ? esc(p.error) : '✓'}</td>
          ${where ? `<td class="nw">${esc(p.sheet)} ${p.rowNumber}행</td>` : ''}
          ${def.fields.map((key) => `<td${key === 'date' || key === def.categoryKey ? ' class="nw"' : ''}>${esc(key === 'date' ? (p.item.date ? U.formatDateLabel(p.item.date) : p.dateText) : p.item[key])}</td>`).join('')}
        </tr>`).join('')}</tbody>
    </table>`;
}

const monthsOf = (items) => [...new Set(items.map((item) => item.date.slice(0, 7)))].sort();
const monthLabel = (ym) => U.formatMonthLabel(...ym.split('-').map(Number));

// ─── 엑셀 붙여넣기 ────────────────────────────

function parseBulk(kind, text) {
  const def = KINDS[kind];
  const rows = U.parseTsv(text);
  if (rows.length && rows[0][0].replace(/\s/g, '') === '날짜') rows.shift();

  return rows
    .map((cells) => {
      if (cells.length < 2) return { item: {}, error: '열 구분(탭)이 없어요', dateText: cells[0] || '' };
      const values = Object.fromEntries(def.fields.map((key, i) => [key, cells[i] || '']));
      return validateRecord(kind, values, state.year);
    })
    .filter((p) => !p.skip);
}

function openBulk() {
  const kind = state.kind;
  const def = KINDS[kind];
  let parsed = [];

  const content = U.el(`
    <div class="bulk">
      <p class="bulk-guide">
        엑셀·구글시트에서 아래 순서의 열을 선택해 복사(⌘/Ctrl + C)한 뒤 붙여넣으세요. 첫 줄의 제목행은 자동으로 건너뜁니다.<br>
        <code>${def.columns.join(' │ ')}</code>${kind === 'schedule' ? ' (대상 반은 비워도 돼요)' : ''}<br>
        날짜는 <code>2026-03-03</code>, <code>2026. 3. 3.</code>, <code>3/3</code> 등을 모두 인식해요.
      </p>
      <label class="field"><span class="field__label">붙여넣기</span>
        <textarea class="input mono" name="bulk" spellcheck="false" placeholder="${esc(def.example)}" autofocus></textarea></label>
      <div class="bulk-preview" hidden></div>
      <p class="bulk-summary" aria-live="polite"></p>
      <p class="form-error" role="alert" hidden></p>
      <div class="sheet-footer">
        <button type="button" class="btn btn--tint btn--block" data-submit disabled>${icon('check', 18)}등록하기</button>
        <button type="button" class="btn btn--block" data-example>${icon('sparkles', 18)}예시 넣어 보기</button>
      </div>
    </div>`);

  const textarea = content.querySelector('textarea');
  const preview = content.querySelector('.bulk-preview');
  const summary = content.querySelector('.bulk-summary');
  const errorEl = content.querySelector('.form-error');
  const submitButton = content.querySelector('[data-submit]');

  const update = () => {
    parsed = parseBulk(kind, textarea.value);
    errorEl.hidden = true;
    const invalid = parsed.filter((p) => p.error).length;

    if (!parsed.length) {
      preview.hidden = true;
      summary.textContent = '';
      submitButton.disabled = true;
      return;
    }

    preview.hidden = false;
    preview.innerHTML = previewTable(kind, parsed);

    summary.textContent = invalid
      ? `${parsed.length}줄 중 ${invalid}줄에 오류가 있어요. 고친 뒤 다시 붙여넣어 주세요.`
      : `${parsed.length}건을 등록할 수 있어요.${parsed.length > 60 ? ' (미리보기는 60줄까지)' : ''}`;
    submitButton.disabled = invalid > 0 || parsed.length > MAX_BULK_ROWS;
    if (parsed.length > MAX_BULK_ROWS) summary.textContent = `한 번에 최대 ${MAX_BULK_ROWS}건까지 등록할 수 있어요.`;
  };

  textarea.addEventListener('input', update);
  content.querySelector('[data-example]').addEventListener('click', () => {
    textarea.value = def.example;
    update();
    textarea.focus();
  });

  const sheet = openSheet({ title: `엑셀 붙여넣기 · ${def.label}`, content });

  submitButton.addEventListener('click', async () => {
    if (!parsed.length || parsed.some((p) => p.error)) return;
    submitButton.disabled = true;
    submitButton.innerHTML = '<span class="spinner" aria-hidden="true"></span>등록 중…';
    try {
      const items = parsed.map((p) => p.item);
      const result = await api.bulkAdd(state.session.token, kind, items);
      sheet.close();
      await afterWrite(`${result.count}건 등록했어요`, items[0].date);
    } catch (err) {
      handleWriteError(err, sheet, errorEl);
      submitButton.disabled = false;
      submitButton.innerHTML = `${icon('check', 18)}등록하기`;
    }
  });
}

// ─── 엑셀 파일: 양식 받기 · 내려받기 · 올리기 ──

function excelFilename(suffix) {
  return `${CONFIG.SCHOOL_NAME}_${U.monthKey(state.year, state.month)}_${suffix}.xlsx`;
}

function openExcelHub() {
  const m = state.month;
  const content = U.el(`
    <div>
      <p class="sheet-lead">구글시트를 열지 않아도 엑셀 파일로 한 달 치를 한 번에 올리고 내려받을 수 있어요.</p>
      <div class="option-list">
        <button type="button" class="option glass glass--thin" data-opt="template">
          <span class="option__icon tone-green">${icon('download', 22)}</span>
          <span class="option__text"><b>빈 양식 받기</b><small>${m}월 평일 날짜와 오전간식 · 점심 · 오후간식 칸이 채워진 엑셀 양식</small></span>
        </button>
        <button type="button" class="option glass glass--thin" data-opt="export">
          <span class="option__icon tone-blue">${icon('table', 22)}</span>
          <span class="option__text"><b>이 달 내용 내려받기</b><small>지금 등록된 ${m}월 교육일정 · 급간식 — 고쳐서 다시 올릴 수 있어요</small></span>
        </button>
        <label class="option glass glass--thin" data-opt="upload">
          <span class="option__icon tone-purple">${icon('upload', 22)}</span>
          <span class="option__text"><b>엑셀 파일 올리기</b><small>.xlsx 또는 .csv · 올리기 전에 미리보기로 확인해요</small></span>
          <input type="file" accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" hidden>
        </label>
        <button type="button" class="option glass glass--thin" data-opt="paste">
          <span class="option__icon tone-orange">${icon('paste', 22)}</span>
          <span class="option__text"><b>복사해서 붙여넣기</b><small>엑셀에서 칸을 복사해 ${esc(KINDS[state.kind].label)}에 바로 붙여넣기</small></span>
        </button>
      </div>
    </div>`);
  const sheet = openSheet({ title: '엑셀로 관리', content });

  const busy = (option, on) => {
    option.classList.toggle('is-busy', on);
    option.querySelector('.option__icon').innerHTML = on ? '<span class="spinner" aria-hidden="true"></span>' : option.dataset.icon;
  };
  content.querySelectorAll('.option').forEach((option) => { option.dataset.icon = option.querySelector('.option__icon').innerHTML; });

  const download = async (option, prefill) => {
    if (option.classList.contains('is-busy')) return;
    if (!state.data) {
      toast('먼저 이번 달 내용을 불러와 주세요.', { tone: 'error' });
      return;
    }
    busy(option, true);
    try {
      const blob = await buildWorkbook({
        schoolName: CONFIG.SCHOOL_NAME,
        year: state.year,
        month: state.month,
        schedules: state.data.schedules,
        meals: state.data.meals,
        holidays: state.data.holidays || [],
        classes: state.data.classes || [],
        prefill
      });
      downloadBlob(blob, excelFilename(prefill ? '양식' : '내용'));
      toast(prefill ? `${state.month}월 양식을 내려받았어요` : `${state.month}월 내용을 내려받았어요`);
    } catch (err) {
      toast(err.message, { tone: 'error' });
    } finally {
      busy(option, false);
    }
  };

  content.querySelector('[data-opt="template"]').addEventListener('click', (e) => download(e.currentTarget, true));
  content.querySelector('[data-opt="export"]').addEventListener('click', (e) => download(e.currentTarget, false));
  content.querySelector('[data-opt="paste"]').addEventListener('click', () => {
    sheet.close();
    setTimeout(openBulk, 320);
  });

  const uploadOption = content.querySelector('[data-opt="upload"]');
  const fileInput = uploadOption.querySelector('input');
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    fileInput.value = '';
    if (!file) return;
    busy(uploadOption, true);
    try {
      const parsed = await readSpreadsheetFile(file);
      sheet.close();
      setTimeout(() => openUploadPreview(file.name, parsed), 320);
    } catch (err) {
      toast(err.message, { tone: 'error' });
    } finally {
      busy(uploadOption, false);
    }
  });
}

/** 올린 파일 미리보기 → 추가하기 / 해당 달 바꾸기 */
function openUploadPreview(fileName, parsed) {
  const groups = ['schedule', 'meal'].map((kind) => {
    let skipped = 0;
    const rows = parsed[kind]
      .map((record) => ({ ...validateRecord(kind, record.values, state.year), sheet: record.sheet, rowNumber: record.rowNumber }))
      .filter((p) => (p.skip ? (skipped++, false) : true));
    const items = rows.filter((p) => !p.error).map((p) => p.item);
    return { kind, rows, items, skipped, invalid: rows.length - items.length, months: monthsOf(items) };
  });

  const total = groups.reduce((n, g) => n + g.rows.length, 0);
  if (!total) {
    const found = parsed.sheets.length;
    toast(found ? '올릴 내용이 없어요. 메뉴나 행사명이 적힌 줄이 있는지 확인해 주세요.' : '양식을 찾지 못했어요. 첫 줄에 "날짜, 구분, 메뉴(또는 행사명)" 제목이 있는지 확인해 주세요.', { tone: 'error' });
    return;
  }

  const invalid = groups.reduce((n, g) => n + g.invalid, 0);
  const tooMany = groups.some((g) => g.items.length > MAX_BULK_ROWS * 4);
  const content = U.el(`
    <div class="upload">
      <div class="upload-summary">
        ${groups.filter((g) => g.rows.length || g.skipped).map((g) => `
          <div class="upload-summary__item glass glass--thin">
            <b>${KINDS[g.kind].label}</b>
            <span>${g.items.length}건${g.months.length ? ` · ${g.months.map(monthLabel).join(', ')}` : ''}</span>
            ${g.invalid ? `<span class="is-error">오류 ${g.invalid}줄</span>` : ''}
            ${g.skipped ? `<small>빈 줄 ${g.skipped}개는 건너뛰어요</small>` : ''}
          </div>`).join('')}
      </div>

      <fieldset class="mode-picker">
        <legend class="field__label">올리는 방법</legend>
        <label class="mode glass glass--thin">
          <input type="radio" name="mode" value="add" checked>
          <span><b>추가하기</b><small>기존 내용은 그대로 두고 파일 내용을 더해요.</small></span>
        </label>
        <label class="mode glass glass--thin">
          <input type="radio" name="mode" value="replace">
          <span><b>해당 달 바꾸기</b><small>파일에 들어 있는 달(${[...new Set(groups.flatMap((g) => g.months))].map(monthLabel).join(', ') || '-'})의 기존 ${groups.filter((g) => g.items.length).map((g) => KINDS[g.kind].label).join(' · ')}을 지우고 파일 내용으로 바꿔요. "이 달 내용 내려받기"로 받은 파일을 고쳐서 올릴 때 쓰세요.</small></span>
        </label>
      </fieldset>

      ${groups.filter((g) => g.rows.length).map((g) => `
        <h3 class="mini-title">${KINDS[g.kind].label} 미리보기${g.rows.length > 60 ? ' (60줄까지)' : ''}</h3>
        <div class="bulk-preview">${previewTable(g.kind, g.rows, { where: true })}</div>`).join('')}

      <p class="bulk-summary">${invalid
        ? `오류가 있는 ${invalid}줄을 엑셀에서 고친 뒤 다시 올려 주세요.`
        : tooMany ? '한 번에 올리기에는 너무 많아요. 몇 달씩 나눠서 올려 주세요.' : `모두 ${total}건을 올릴 수 있어요.`}</p>
      <p class="form-error" role="alert" hidden></p>
      <div class="sheet-footer">
        <button type="button" class="btn btn--tint btn--block" data-submit ${invalid || tooMany ? 'disabled' : ''}>${icon('upload', 18)}올리기</button>
      </div>
    </div>`);

  const errorEl = content.querySelector('.form-error');
  const submitButton = content.querySelector('[data-submit]');
  const sheet = openSheet({ title: `엑셀 올리기 · ${fileName}`, content });

  submitButton.addEventListener('click', async () => {
    const replace = content.querySelector('input[name="mode"]:checked').value === 'replace';
    const work = groups.filter((g) => g.items.length);
    if (!work.length) return;

    if (replace) {
      const ok = await confirmDialog({
        title: '해당 달 내용을 바꿀까요?',
        message: work.map((g) => `${KINDS[g.kind].label} ${g.months.map(monthLabel).join(', ')}: 기존 내용 → 파일의 ${g.items.length}건`).join('\n') + '\n기존 내용은 지워지고 되돌릴 수 없어요.',
        confirmLabel: '바꾸기',
        destructive: true
      });
      if (!ok) return;
    }

    submitButton.disabled = true;
    submitButton.innerHTML = '<span class="spinner" aria-hidden="true"></span>올리는 중…';
    const done = [];
    try {
      for (const g of work) {
        if (replace) {
          let removed = 0;
          let added = 0;
          // 달마다 나눠 보내서 한 번에 보내는 양을 줄입니다.
          for (const ym of g.months) {
            const result = await api.replaceMonths(state.session.token, g.kind, [ym], g.items.filter((item) => item.date.startsWith(ym)));
            removed += result.removed;
            added += result.added;
          }
          done.push(`${KINDS[g.kind].label} ${removed}건 → ${added}건`);
        } else {
          let added = 0;
          for (let i = 0; i < g.items.length; i += MAX_BULK_ROWS) {
            const result = await api.bulkAdd(state.session.token, g.kind, g.items.slice(i, i + MAX_BULK_ROWS));
            added += result.count;
          }
          done.push(`${KINDS[g.kind].label} ${added}건`);
        }
      }
      sheet.close();
      const first = work.flatMap((g) => g.items.map((item) => item.date)).sort()[0];
      const shown = work.find((g) => g.kind === state.kind) ? state.kind : work[0].kind;
      if (shown !== state.kind) {
        state.kind = shown;
        writeStorage(localStorage, KIND_KEY, shown);
        kindControl.setValue(shown);
      }
      await afterWrite(`${replace ? '바꿨어요' : '올렸어요'} · ${done.join(', ')}`, first);
    } catch (err) {
      handleWriteError(err, sheet, errorEl);
      // 앞쪽 종류(예: 교육일정)는 이미 저장됐을 수 있으니 알려 줍니다.
      if (done.length) {
        if (!errorEl.hidden) errorEl.textContent = `${done.join(', ')}까지는 저장됐어요. ${err.message}`;
        else toast(`${done.join(', ')}까지는 저장됐어요.`, { tone: 'error' });
      }
      submitButton.disabled = false;
      submitButton.innerHTML = `${icon('upload', 18)}올리기`;
    }
  });
}

// ─── 시작 ─────────────────────────────────────

function init() {
  $('#school-name').textContent = CONFIG.SCHOOL_NAME;
  $('#login-text').textContent = `${CONFIG.SCHOOL_NAME} 교육일정 · 급간식 관리`;
  $('#login-icon').innerHTML = icon('lock', 30);
  $('#public-link').innerHTML = icon('external', 20);
  $('#logout').innerHTML = icon('logout', 20);

  if (IS_DEMO) {
    $('#login-hint').hidden = false;
    $('#demo-chip-slot').innerHTML = '<span class="chip tone-orange demo-chip">예시 데이터</span>';
    $('#public-link').href = './?demo';
    document.querySelector('.login__back').href = './?demo';
  }

  $('#logout').addEventListener('click', () => {
    showLogin('');
    toast('로그아웃했어요');
  });

  initNavbar($('#navbar'), $('#admin-title'));

  state.session = loadSession();
  if (state.session) showAdmin();
  else showLogin();
}

init();
