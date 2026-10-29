// 공개 페이지: 오늘 · 달력 · 교육일정 · 급간식

import { CONFIG } from './config.js';
import { api, IS_DEMO } from './api.js';
import { icon } from './icons.js';
import { initNavbar, initTabBar, openSheet, onSwipe, renderEmpty, renderError, toast } from './ui.js';
import * as U from './util.js';

const TABS = {
  home: { title: '오늘' },
  calendar: { title: '달력', subtitle: '날짜를 누르면 그날의 일정과 식단이 보여요' },
  schedule: { title: '교육일정', subtitle: '행사 · 교육 · 휴원 안내' },
  meal: { title: '급간식', subtitle: '오전간식 · 점심 · 오후간식' }
};
const ALL = '전체';

const today = U.todayYmd();
const [thisYear, thisMonth] = today.split('-').map(Number);

const state = {
  tab: 'home',
  year: thisYear,
  month: thisMonth,
  selected: today,
  homeYear: thisYear,
  homeMonth: thisMonth,
  scheduleFilter: ALL,
  mealFilter: ALL
};

const $ = (selector) => document.querySelector(selector);
const view = $('#view');
const toolbar = $('#toolbar');
const esc = U.escapeHtml;

let renderSeq = 0;
let monthData = { schedules: [], meals: [] };
let homeCalendarData = { schedules: [], meals: [] };
let homeCalendarSeq = 0;
let tabbar;
let scrollToTodayPending = true;

// ─── 공통 렌더링 조각 ─────────────────────────

function mealAllergyNumbers(meal, items) {
  const numbers = new Set(U.parseAllergyNumbers(meal.allergy));
  items.forEach((item) => item.allergens.forEach((n) => numbers.add(n)));
  return [...numbers].sort((a, b) => a - b);
}

function renderMealRow(meal) {
  const tone = U.mealTone(meal.type);
  const items = U.splitMenu(meal.menu);
  const numbers = mealAllergyNumbers(meal, items);
  const allergyText = numbers.length
    ? numbers.map((n) => `${U.ALLERGENS[n - 1]}<span class="allergy-num">${n}</span>`).join(' · ')
    : esc(meal.allergy);

  return `
    <div class="meal-row tone-${tone}">
      <span class="meal-row__icon">${icon(U.mealIcon(meal.type), 20)}</span>
      <div class="meal-row__body">
        <p class="meal-row__type">${esc(meal.type)}</p>
        <p class="meal-row__menu">${items.map((item) => `<span class="menu-item">${esc(item.name)}${
          item.allergens.length ? `<sup>${item.allergens.join('.')}</sup>` : ''}</span>`).join('')}</p>
        ${allergyText ? `<p class="allergy-line">${icon('info', 13)}<span>${allergyText}</span></p>` : ''}
        ${meal.note ? `<p class="note-line">${esc(meal.note)}</p>` : ''}
      </div>
    </div>`;
}

function renderEventRow(event, { showDate = false } = {}) {
  const tone = U.categoryTone(event.category);
  return `
    <div class="event-row tone-${tone}">
      <span class="event-row__bar" aria-hidden="true"></span>
      <div class="event-row__body">
        <div class="event-row__meta">
          <span class="chip tone-${tone}">${esc(event.category)}</span>
          ${showDate ? `<span class="event-row__date">${U.formatDateLabel(event.date)} · ${U.relativeDayLabel(event.date, today)}</span>` : ''}
        </div>
        <p class="event-row__title">${esc(event.title)}</p>
        ${event.detail ? `<p class="event-row__detail">${esc(event.detail)}</p>` : ''}
      </div>
    </div>`;
}

/** 공휴일 목록 (예전 서버 응답에는 holidays가 없을 수 있습니다) */
function holidaysOf(data) {
  return (data && data.holidays) || [];
}

function holidayName(data, date) {
  const holiday = holidaysOf(data).find((h) => h.date === date);
  return holiday ? holiday.name : '';
}

function cardTitle(iconName, text, meta = '') {
  return `<header class="card-head"><h2 class="card-title">${icon(iconName, 20)}${esc(text)}</h2>${meta ? `<span class="card-meta">${meta}</span>` : ''}</header>`;
}

function skeleton() {
  const block = (h) => `<div class="skeleton" style="height:${h}px"></div>`;
  return `<div class="skeleton-stack" aria-hidden="true">${block(120)}${block(220)}${block(160)}</div>`;
}

function filterChips(values, current, action) {
  if (values.length < 2) return '';
  return `
    <div class="filter-chips" role="group" aria-label="분류">
      ${[ALL, ...values].map((value) => `
        <button type="button" class="filter-chip glass glass--thin${value === current ? ' is-active' : ''}"
          data-action="${action}" data-value="${esc(value)}" aria-pressed="${value === current}">${esc(value)}</button>`).join('')}
    </div>`;
}

// ─── 오늘 ─────────────────────────────────────

async function viewHome() {
  const next = U.shiftMonth(thisYear, thisMonth, 1);
  const [current, upcomingMonth, calendarMonth] = await Promise.all([
    api.getMonth(thisYear, thisMonth),
    api.getMonth(next.year, next.month).catch(() => ({ schedules: [], meals: [] })),
    api.getMonth(state.homeYear, state.homeMonth)
  ]);
  homeCalendarData = calendarMonth;
  const schedules = [...current.schedules, ...upcomingMonth.schedules];
  const meals = [...current.meals, ...upcomingMonth.meals];
  const holidays = [...holidaysOf(current), ...holidaysOf(upcomingMonth)];
  const todayHoliday = holidayName(current, today);

  const todayMeals = U.sortMeals(meals.filter((m) => m.date === today));
  const todayEvents = schedules.filter((s) => s.date === today);
  // 다가오는 일정에는 공휴일도 함께 보여줍니다 (같은 날이면 공휴일 먼저).
  const upcoming = [
    ...holidays.map((h) => ({ date: h.date, category: '공휴일', title: h.name, detail: '', holiday: true })),
    ...schedules
  ]
    .filter((s) => s.date > today && U.dayDiff(today, s.date) <= 45)
    .sort((a, b) => a.date.localeCompare(b.date) || Number(Boolean(b.holiday)) - Number(Boolean(a.holiday)))
    .slice(0, 6);
  const nextMealDate = meals.map((m) => m.date).filter((d) => d > today).sort()[0];
  const nextMeals = nextMealDate && U.dayDiff(today, nextMealDate) <= 7
    ? U.sortMeals(meals.filter((m) => m.date === nextMealDate))
    : [];

  const [, m, d] = today.split('-').map(Number);
  const weekend = [0, 6].includes(U.weekdayIndex(today));
  const summary = [
    todayHoliday,
    todayEvents.length ? `일정 ${todayEvents.length}개` : '',
    todayMeals.length ? `식단 ${todayMeals.length}개` : ''
  ].filter(Boolean).join(' · ') || (weekend ? '즐거운 주말 보내세요' : '오늘 등록된 안내가 없어요');

  // 앞으로 7일 안에 등록된 식단이 없으면 nextMealDate가 비어 있습니다.
  const nextLabel = !nextMeals.length ? ''
    : U.dayDiff(today, nextMealDate) === 1 ? '내일의' : U.formatDateLabel(nextMealDate);

  // 가로줄 단위로 배치해 PC에서도 나란히 놓인 카드의 높이가 맞도록 합니다.
  return `
    <div class="home fade-in">
      <section class="card glass today-hero">
        <div class="today-hero__date">
          <div class="date-tile" aria-hidden="true">
            <span class="date-tile__month">${m}월</span>
            <span class="date-tile__day">${d}</span>
          </div>
          <div>
            <p class="today-hero__weekday">${U.weekdayName(today)}요일</p>
            <p class="today-hero__summary">${esc(summary)}</p>
          </div>
        </div>
        <div class="today-hero__events">
          <h2 class="mini-title">${icon('calendar', 16)}오늘 일정</h2>
          ${todayEvents.length
            ? todayEvents.map((e) => renderEventRow(e)).join('')
            : '<p class="muted-line">오늘은 특별한 일정이 없어요</p>'}
        </div>
      </section>

      <section class="card glass calendar home-calendar" id="home-calendar" aria-label="${U.formatMonthLabel(state.homeYear, state.homeMonth)} 달력">
        ${homeCalendarCard()}
      </section>

      <div class="home-meals${nextMeals.length ? ' home-meals--pair' : ''}">
        <section class="card glass meal-card">
          ${cardTitle('meal', '오늘의 급간식')}
          ${todayMeals.length
            ? todayMeals.map(renderMealRow).join('')
            : renderEmpty({ iconName: 'bowl', title: todayHoliday ? '공휴일에는 급간식이 없어요' : weekend ? '주말에는 급간식이 없어요' : '오늘 등록된 식단이 없어요' })}
        </section>
        ${nextMeals.length ? `
          <section class="card glass meal-card">
            ${cardTitle('bowl', `${nextLabel} 급간식`)}
            ${nextMeals.map(renderMealRow).join('')}
          </section>` : ''}
      </div>

      <section class="card glass">
        ${cardTitle('list', '다가오는 일정', upcoming.length ? `<button type="button" class="btn btn--plain btn--sm" data-action="goto" data-tab="schedule">전체 보기</button>` : '')}
        ${upcoming.length
          ? `<div class="upcoming-list">${upcoming.map((e) => renderEventRow(e, { showDate: true })).join('')}</div>`
          : renderEmpty({ iconName: 'calendar', title: '예정된 일정이 없어요' })}
      </section>
    </div>`;
}

/** 오늘 화면의 달력 카드 내용 (월 이동 버튼 + 달력) */
function homeCalendarCard() {
  const isCurrent = state.homeYear === thisYear && state.homeMonth === thisMonth;
  return `
    <header class="card-head">
      <h2 class="card-title">${icon('calendar', 20)}${U.formatMonthLabel(state.homeYear, state.homeMonth)}</h2>
      <div class="mini-switcher">
        ${isCurrent ? '' : '<button type="button" class="btn btn--plain btn--sm" data-action="home-month" data-delta="0">이번 달</button>'}
        <button type="button" class="btn icon-btn btn--sm" data-action="home-month" data-delta="-1" aria-label="이전 달">${icon('chevronLeft', 18)}</button>
        <button type="button" class="btn icon-btn btn--sm" data-action="home-month" data-delta="1" aria-label="다음 달">${icon('chevronRight', 18)}</button>
      </div>
    </header>
    ${calendarGrid(state.homeYear, state.homeMonth, homeCalendarData, { action: 'open-day', hint: '날짜를 누르면 그날 일정과 급간식이 보여요' })}`;
}

async function changeHomeMonth(delta) {
  const next = delta === 0 ? { year: thisYear, month: thisMonth } : U.shiftMonth(state.homeYear, state.homeMonth, delta);
  const card = $('#home-calendar');
  if (!card) return;

  const seq = ++homeCalendarSeq;
  card.classList.add('is-loading');
  try {
    const data = await api.getMonth(next.year, next.month);
    if (seq !== homeCalendarSeq) return;
    state.homeYear = next.year;
    state.homeMonth = next.month;
    homeCalendarData = data;
    card.innerHTML = homeCalendarCard();
    card.setAttribute('aria-label', `${U.formatMonthLabel(next.year, next.month)} 달력`);
    const after = U.shiftMonth(next.year, next.month, 1);
    api.getMonth(after.year, after.month).catch(() => {});
  } catch (err) {
    if (seq === homeCalendarSeq) toast(err.message, { tone: 'error' });
  } finally {
    if (seq === homeCalendarSeq) card.classList.remove('is-loading');
  }
}

/** 오늘 화면 달력에서 날짜를 누르면 그날 내용을 팝업으로 보여줍니다. */
function openDayPopup(date) {
  const rel = U.relativeDayLabel(date, today);
  const showRel = Math.abs(U.dayDiff(today, date)) <= 2;
  const content = U.el(`
    <div class="day-popup">
      ${showRel ? `<p class="day-popup__rel"><span class="chip tone-blue">${rel}</span></p>` : ''}
      ${dayDetailBody(date, homeCalendarData)}
    </div>`);
  openSheet({ title: U.formatDateLabel(date), content });
}

// ─── 달력 ─────────────────────────────────────

/** 그날의 일정 · 급간식 목록 (달력 상세 카드와 팝업에서 함께 사용) */
function dayDetailBody(date, data) {
  const events = data.schedules.filter((s) => s.date === date);
  const meals = U.sortMeals(data.meals.filter((m) => m.date === date));
  const holiday = holidayName(data, date);

  return `
    ${holiday ? `<p class="holiday-line"><span class="chip tone-red">공휴일</span>${esc(holiday)}</p>` : ''}
    <h3 class="mini-title">${icon('calendar', 16)}일정</h3>
    ${events.length ? events.map((e) => renderEventRow(e)).join('') : '<p class="muted-line">등록된 일정이 없어요</p>'}
    <h3 class="mini-title">${icon('meal', 16)}급간식</h3>
    ${meals.length ? meals.map(renderMealRow).join('') : '<p class="muted-line">등록된 식단이 없어요</p>'}`;
}

function renderDayDetail(date) {
  const rel = U.relativeDayLabel(date, today);
  const showRel = Math.abs(U.dayDiff(today, date)) <= 2;

  return `
    <section class="card glass day-detail fade-in" aria-label="${U.formatDateLabel(date)} 안내">
      <header class="day-detail__head">
        <h2 class="day-detail__date">${U.formatDateLabel(date)}</h2>
        ${showRel ? `<span class="chip tone-blue">${rel}</span>` : ''}
      </header>
      ${dayDetailBody(date, monthData)}
    </section>`;
}

/** 요일 머리 + 날짜 칸 + 범례. action은 날짜를 눌렀을 때 실행할 동작 이름입니다. */
function calendarGrid(year, month, data, { action, selected = '', hint = '' }) {
  const prefix = U.monthKey(year, month);
  const events = U.groupBy(data.schedules, (s) => s.date);
  const meals = U.groupBy(data.meals, (m) => m.date);
  const startOffset = new Date(year, month - 1, 1).getDay();
  const days = U.daysInMonth(year, month);
  const cells = Math.ceil((startOffset + days) / 7) * 7;
  let grid = '';

  for (let i = 0; i < cells; i++) {
    const date = U.ymd(new Date(year, month - 1, 1 - startOffset + i));
    const day = Number(date.slice(8));
    const weekday = i % 7;
    const weekendClass = weekday === 0 ? ' is-sun' : weekday === 6 ? ' is-sat' : '';

    if (!date.startsWith(prefix)) {
      grid += `<span class="day is-outside${weekendClass}" aria-hidden="true"><span class="day__num">${day}</span></span>`;
      continue;
    }

    const dayEvents = events.get(date) || [];
    const hasMeal = meals.has(date);
    const holidayLabel = holidayName(data, date);
    const holiday = Boolean(holidayLabel) || dayEvents.some((e) => U.categoryTone(e.category) === 'red');
    const label = [
      U.formatDateLabel(date),
      holidayLabel,
      dayEvents.length ? `일정 ${dayEvents.length}개` : '',
      hasMeal ? '식단 있음' : ''
    ].filter(Boolean).join(', ');
    const pressed = selected ? ` aria-pressed="${date === selected}"` : '';

    grid += `
      <button type="button" class="day${weekendClass}${holiday ? ' is-holiday' : ''}${date === today ? ' is-today' : ''}${date === selected ? ' is-selected' : ''}"
        data-action="${action}" data-date="${date}"${pressed} aria-label="${esc(label)}">
        <span class="day__num">${day}</span>
        ${holidayLabel ? `<span class="day__holiday">${esc(holidayLabel)}</span>` : ''}
        <span class="day__dots">${dayEvents.slice(0, 3).map((e) => `<i class="day__dot tone-${U.categoryTone(e.category)}"></i>`).join('')}${hasMeal ? '<i class="day__dot day__dot--meal"></i>' : ''}</span>
        <span class="day__labels">${dayEvents.slice(0, 2).map((e) => `<span class="day__label tone-${U.categoryTone(e.category)}">${esc(e.title)}</span>`).join('')}</span>
      </button>`;
  }

  return `
    <div class="calendar__weekdays" aria-hidden="true">
      ${U.WEEKDAYS.map((w, i) => `<span class="${i === 0 ? 'is-sun' : i === 6 ? 'is-sat' : ''}">${w}</span>`).join('')}
    </div>
    <div class="calendar__grid">${grid}</div>
    <p class="calendar__legend">
      ${hint ? `<span class="calendar__hint">${esc(hint)}</span>` : ''}
      <span class="legend-item"><i class="day__dot tone-blue"></i>일정</span>
      <span class="legend-item"><i class="day__dot day__dot--meal"></i>급간식</span>
    </p>`;
}

async function viewCalendar() {
  monthData = await api.getMonth(state.year, state.month);
  const prefix = U.monthKey(state.year, state.month);
  if (!state.selected.startsWith(prefix)) {
    state.selected = today.startsWith(prefix) ? today : `${prefix}-01`;
  }

  return `
    <div class="calendar-layout fade-in">
      <section class="card glass calendar" aria-label="${U.formatMonthLabel(state.year, state.month)} 달력">
        ${calendarGrid(state.year, state.month, monthData, { action: 'select-day', selected: state.selected })}
      </section>
      <div id="day-detail">${renderDayDetail(state.selected)}</div>
    </div>`;
}

function selectDay(date) {
  state.selected = date;
  view.querySelectorAll('.day[data-date]').forEach((button) => {
    const selected = button.dataset.date === date;
    button.classList.toggle('is-selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  $('#day-detail').innerHTML = renderDayDetail(date);
  if (window.matchMedia('(max-width: 879px)').matches) {
    $('#day-detail').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

// ─── 교육일정 ─────────────────────────────────

async function viewSchedule() {
  const data = await api.getMonth(state.year, state.month);
  const categories = [...new Set(data.schedules.map((s) => s.category))];
  if (state.scheduleFilter !== ALL && !categories.includes(state.scheduleFilter)) state.scheduleFilter = ALL;

  const filtered = data.schedules.filter((s) => state.scheduleFilter === ALL || s.category === state.scheduleFilter);
  const groups = U.groupBy(filtered, (s) => s.date);

  if (!data.schedules.length) {
    return `<section class="card glass fade-in">${renderEmpty({ iconName: 'calendar', title: '이번 달 등록된 일정이 없어요', text: '일정이 등록되면 이곳에 표시돼요.' })}</section>`;
  }

  return `
    <div class="fade-in">
      ${filterChips(categories, state.scheduleFilter, 'filter-schedule')}
      <p class="list-summary">${U.formatMonthLabel(state.year, state.month)} · 일정 ${filtered.length}개</p>
      <div class="date-groups">
        ${[...groups].map(([date, items]) => {
          const [, , day] = date.split('-').map(Number);
          const wd = U.weekdayIndex(date);
          return `
            <article class="card glass date-group${date < today ? ' is-past' : ''}${date === today ? ' is-today' : ''}">
              <div class="date-badge${wd === 0 ? ' is-sun' : wd === 6 ? ' is-sat' : ''}">
                <span class="date-badge__day">${day}</span>
                <span class="date-badge__wd">${U.WEEKDAYS[wd]}</span>
                ${date === today ? '<span class="date-badge__today">오늘</span>' : ''}
              </div>
              <div class="date-group__items">${items.map((e) => renderEventRow(e)).join('')}</div>
            </article>`;
        }).join('')}
      </div>
    </div>`;
}

// ─── 급간식 ───────────────────────────────────

async function viewMeal() {
  const data = await api.getMonth(state.year, state.month);
  const types = [...new Set(data.meals.map((m) => m.type))].sort((a, b) => U.mealTypeRank(a) - U.mealTypeRank(b));
  if (state.mealFilter !== ALL && !types.includes(state.mealFilter)) state.mealFilter = ALL;

  if (!data.meals.length) {
    return `<section class="card glass fade-in">${renderEmpty({ iconName: 'bowl', title: '이번 달 등록된 식단이 없어요', text: '식단표가 등록되면 이곳에 표시돼요.' })}</section>`;
  }

  const filtered = U.sortMeals(data.meals.filter((m) => state.mealFilter === ALL || m.type === state.mealFilter));
  const byDate = U.groupBy(filtered, (m) => m.date);
  const weeks = U.groupBy([...byDate.keys()], (date) => U.weekStart(date));

  return `
    <div class="fade-in">
      <div class="meal-tools">
        ${filterChips(types, state.mealFilter, 'filter-meal')}
        <button type="button" class="btn btn--sm" data-action="allergy-info">${icon('info', 16)}알레르기 번호 안내</button>
      </div>
      ${[...weeks].map(([, dates]) => `
        <section class="week">
          <h2 class="week__title">${U.weekOfMonth(dates[0])}주차 <span>${U.formatDateLabel(dates[0], { weekday: false })} – ${U.formatDateLabel(dates[dates.length - 1], { weekday: false })}</span></h2>
          <div class="week__days">
            ${dates.map((date) => `
              <article class="card glass meal-day${date === today ? ' is-today' : ''}${date < today ? ' is-past' : ''}">
                <header class="meal-day__head">
                  <h3 class="meal-day__date">${U.formatDateLabel(date)}</h3>
                  ${date === today ? '<span class="chip tone-blue">오늘</span>' : ''}
                </header>
                ${byDate.get(date).map(renderMealRow).join('')}
              </article>`).join('')}
          </div>
        </section>`).join('')}
    </div>`;
}

function openAllergyInfo() {
  const content = U.el(`
    <div>
      <p class="sheet-lead">식단의 숫자는 아래 알레르기 유발 식품이 들어 있다는 뜻이에요.</p>
      <ol class="allergen-list">
        ${U.ALLERGENS.map((name, i) => `<li><span class="allergen-list__num">${i + 1}</span>${name}</li>`).join('')}
      </ol>
    </div>`);
  openSheet({ title: '알레르기 유발 식품 번호', content });
}

// ─── 화면 전환 ────────────────────────────────

const VIEWS = { home: viewHome, calendar: viewCalendar, schedule: viewSchedule, meal: viewMeal };

function renderToolbar() {
  if (state.tab === 'home') {
    toolbar.hidden = true;
    return;
  }
  const isCurrent = state.year === thisYear && state.month === thisMonth;
  toolbar.hidden = false;
  toolbar.innerHTML = `
    <div class="month-switcher glass">
      <button type="button" class="btn icon-btn" data-month="-1" aria-label="이전 달">${icon('chevronLeft', 20)}</button>
      <span class="month-switcher__label" aria-live="polite">${U.formatMonthLabel(state.year, state.month)}</span>
      <button type="button" class="btn icon-btn" data-month="1" aria-label="다음 달">${icon('chevronRight', 20)}</button>
    </div>
    ${isCurrent ? '' : `<button type="button" class="btn" data-today>${icon('today', 18)}이번 달</button>`}`;
}

function writeHash() {
  const hash = state.tab === 'home' ? '' : `#${state.tab}:${U.monthKey(state.year, state.month)}`;
  history.replaceState(null, '', hash || `${location.pathname}${location.search}`);
}

function readHash() {
  const [tab, ym] = decodeURIComponent(location.hash.slice(1)).split(':');
  if (TABS[tab]) state.tab = tab;
  const match = /^(\d{4})-(\d{2})$/.exec(ym || '');
  if (match && Number(match[2]) >= 1 && Number(match[2]) <= 12) {
    state.year = Number(match[1]);
    state.month = Number(match[2]);
  }
}

/** 이번 달 목록을 처음 열면 지난 날짜를 건너뛰고 오늘(또는 다음 날) 위치로 이동합니다. */
function scrollToToday() {
  const target = view.querySelector('.meal-day.is-today, .date-group.is-today')
    || view.querySelector('.meal-day:not(.is-past), .date-group:not(.is-past)');
  if (!target || target === view.querySelector('.meal-day, .date-group')) return;
  const top = target.getBoundingClientRect().top + window.scrollY - 140;
  window.scrollTo({ top, behavior: 'smooth' });
}

async function render() {
  const seq = ++renderSeq;
  const autoScroll = scrollToTodayPending;
  scrollToTodayPending = false;
  const tab = TABS[state.tab];
  writeHash();

  $('#page-title').textContent = tab.title;
  $('#navbar-title').textContent = tab.title;
  $('#page-subtitle').textContent = state.tab === 'home'
    ? `${U.formatDateLabel(today, { weekday: false, year: true })} ${U.weekdayName(today)}요일`
    : tab.subtitle;
  document.title = `${tab.title} · ${CONFIG.SCHOOL_NAME}`;
  renderToolbar();

  view.setAttribute('aria-busy', 'true');
  view.innerHTML = skeleton();

  try {
    const html = await VIEWS[state.tab]();
    if (seq !== renderSeq) return;
    view.innerHTML = html;
    if (autoScroll && state.year === thisYear && state.month === thisMonth) scrollToToday();
    if (state.tab === 'home') {
      onSwipe($('#home-calendar'), { left: () => changeHomeMonth(1), right: () => changeHomeMonth(-1) });
    }
    if (state.tab === 'calendar') {
      const calendar = view.querySelector('.calendar');
      onSwipe(calendar, { left: () => changeMonth(1), right: () => changeMonth(-1) });
      const next = U.shiftMonth(state.year, state.month, 1);
      api.getMonth(next.year, next.month).catch(() => {});
    }
  } catch (err) {
    if (seq !== renderSeq) return;
    view.innerHTML = renderError(err);
  } finally {
    if (seq === renderSeq) view.setAttribute('aria-busy', 'false');
  }
}

function changeMonth(delta) {
  const next = U.shiftMonth(state.year, state.month, delta);
  state.year = next.year;
  state.month = next.month;
  scrollToTodayPending = true;
  render();
}

function goToTab(name) {
  state.tab = name;
  scrollToTodayPending = true;
  tabbar.select(name, { silent: true });
  window.scrollTo({ top: 0, behavior: 'smooth' });
  render();
}

// ─── 시작 ─────────────────────────────────────

function init() {
  $('#school-name').textContent = CONFIG.SCHOOL_NAME;
  readHash();

  if (IS_DEMO) {
    $('#navbar-end').innerHTML = '<span class="chip tone-orange demo-chip">예시 데이터</span>';
  }

  initNavbar($('#navbar'), $('#page-title'));
  tabbar = initTabBar($('#tabbar'), {
    onChange: (name) => {
      if (name === state.tab) return;
      state.tab = name;
      scrollToTodayPending = true;
      window.scrollTo({ top: 0, behavior: 'smooth' });
      render();
    }
  });
  tabbar.select(state.tab, { silent: true, animate: false });

  toolbar.addEventListener('click', (event) => {
    const monthButton = event.target.closest('[data-month]');
    if (monthButton) changeMonth(Number(monthButton.dataset.month));
    if (event.target.closest('[data-today]')) {
      state.year = thisYear;
      state.month = thisMonth;
      state.selected = today;
      scrollToTodayPending = true;
      render();
    }
  });

  view.addEventListener('click', (event) => {
    const target = event.target.closest('[data-action], [data-retry]');
    if (!target) return;
    if (target.hasAttribute('data-retry')) {
      api.clearCache();
      render();
      return;
    }
    switch (target.dataset.action) {
      case 'select-day':
        selectDay(target.dataset.date);
        break;
      case 'open-day':
        openDayPopup(target.dataset.date);
        break;
      case 'home-month':
        changeHomeMonth(Number(target.dataset.delta));
        break;
      case 'filter-schedule':
        state.scheduleFilter = target.dataset.value;
        render();
        break;
      case 'filter-meal':
        state.mealFilter = target.dataset.value;
        render();
        break;
      case 'allergy-info':
        openAllergyInfo();
        break;
      case 'goto':
        goToTab(target.dataset.tab);
        break;
      default:
        break;
    }
  });

  // 홈 화면에 추가해 두고 며칠씩 켜 두는 경우를 위해:
  // 날짜가 바뀌었으면 '오늘'을 새로 계산하고, 5분 넘게 다른 앱에 있다 돌아오면 최신 내용을 다시 불러옵니다.
  let hiddenAt = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      hiddenAt = Date.now();
      return;
    }
    if (U.todayYmd() !== today) {
      location.reload();
      return;
    }
    if (hiddenAt && Date.now() - hiddenAt > 5 * 60 * 1000 && !document.querySelector('.sheet')) {
      api.clearCache();
      render();
    }
  });

  window.addEventListener('hashchange', () => {
    readHash();
    tabbar.select(state.tab, { silent: true });
    scrollToTodayPending = true;
    render();
  });

  document.addEventListener('keydown', (event) => {
    if (state.tab !== 'calendar' || document.querySelector('.sheet')) return;
    if (event.target.closest('input, textarea')) return;
    if (event.key === 'PageDown') changeMonth(1);
    if (event.key === 'PageUp') changeMonth(-1);
  });

  render();
}

init();
