// 오늘 화면 맨 위 안내: 인사말 + 오늘(오후에는 내일) 일정 + 날씨에 맞는 옷차림
// 화면 없이도 시험할 수 있도록 문장만 만드는 순수 함수로 둡니다.

import * as U from './util.js';
import { dayForecast } from './weather.js';

const esc = U.escapeHtml;

export function greetingFor(hour) {
  if (hour >= 5 && hour < 12) return '좋은 아침이에요';
  if (hour >= 12 && hour < 18) return '좋은 오후예요';
  if (hour >= 18 && hour < 22) return '편안한 저녁이에요';
  return '좋은 밤이에요';
}

/** '2026년 11월 10일 화요일' */
export function fullDateLabel(date) {
  return `${U.formatDateLabel(date, { weekday: false, year: true })} ${U.weekdayName(date)}요일`;
}

/** 오늘 · 내일 · 모레 · 금요일 · 11월 20일 (금) */
export function dayWord(date, today) {
  const diff = U.dayDiff(today, date);
  if (diff === 0) return '오늘';
  if (diff === 1) return '내일';
  if (diff === 2) return '모레';
  if (diff > 2 && diff < 7) return `${U.weekdayName(date)}요일`;
  return U.formatDateLabel(date);
}

const isClosure = (event) => /휴원|휴업|휴일|공휴|방학/.test(String(event.category || ''));

/** 유치원이 쉬는 날이면 그 이유(공휴일 이름 · 휴원 일정 · 주말), 아니면 '' */
export function offReason(date, data) {
  const holiday = data.holidays.find((h) => h.date === date);
  if (holiday) return { kind: 'holiday', text: holiday.name };
  const closure = data.schedules.find((s) => s.date === date && isClosure(s));
  if (closure) return { kind: 'closure', text: closure.title || closure.category };
  const wd = U.weekdayIndex(date);
  if ((wd === 0 || wd === 6) && !data.meals.some((m) => m.date === date)) return { kind: 'weekend', text: `${U.WEEKDAYS[wd]}요일` };
  return null;
}

const quote = (title) => `<b class="hl">‘${esc(title)}’</b>`;

function eventsSentence(lead, events) {
  if (!events.length) return '';
  const first = events[0];
  if (events.length > 1) return `${lead} ${quote(first.title)} 등 일정이 ${events.length}개 있어요.`;
  const detail = String(first.detail || '').trim();
  const note = detail && detail.length <= 40 ? `(${esc(detail)})` : '';
  return `${lead} ${quote(first.title)}${U.josa(first.title, '이', '가')} 있어요${note}.`;
}

/** 날씨 문장: '날씨는 맑고, 등원 시간엔 3°, 낮에는 12°까지 올라가요.' */
function weatherSentence(f, { lead = '', afterDropOff = false }) {
  const when = f.wetPart === 'am' ? '오전에 ' : f.wetPart === 'pm' ? '오후에 ' : '';
  const head = `${lead}날씨는 ${when}${f.info.clause || '무난하고'},`;
  let text;
  if (afterDropOff) {
    text = `${head} 하원 시간엔 ${f.afternoon ?? f.high}°예요.`;
  } else {
    const am = f.morning ?? f.min;
    const rise = Number.isFinite(f.high) && Number.isFinite(am) && f.high - am >= 3;
    text = `${head} 등원 시간엔 ${am}°${rise ? `, 낮에는 ${f.high}°까지 올라가요.` : '예요.'}`;
  }
  const feel = afterDropOff ? f.afternoonFeel : f.coldFeel;
  if (f.chill >= 4 && Number.isFinite(feel) && feel < 10) {
    text += ` 바람 때문에 체감온도는 ${feel}°까지 내려가요.`;
  }
  return text;
}

/**
 * 날씨에 맞는 아이 옷차림 · 준비물
 * 추위는 유치원에 있는 동안 가장 낮은 체감온도, 더위는 가장 높은 체감온도로 판단합니다.
 */
export function outfitAdvice(f) {
  const cold = f.coldFeel ?? f.min;
  const warm = f.warmFeel ?? f.max;
  const tips = [];
  const lines = [];
  const tip = (iconName, label, tone) => tips.push({ icon: iconName, label, tone });

  if (warm >= 29) {
    lines.push('많이 더우니 <b>통풍이 잘 되는 반팔 · 반바지</b>를 입혀 주세요.');
    tip('shirt', '반팔 · 반바지', 'orange');
  } else if (cold >= 23) {
    lines.push('더운 편이라 <b>반팔</b>이 좋아요.');
    tip('shirt', '반팔', 'orange');
  } else if (cold >= 20) {
    lines.push('따뜻해서 <b>얇은 긴팔이나 반팔</b>이 알맞아요.');
    tip('shirt', '얇은 옷', 'yellow');
  } else if (cold >= 16) {
    lines.push('활동하기 좋은 날씨라 <b>긴팔</b>이면 충분해요.');
    tip('shirt', '긴팔', 'green');
  } else if (cold >= 12) {
    lines.push('선선하니 긴팔에 <b>가벼운 겉옷(가디건 · 바람막이)</b>을 챙겨 주세요.');
    tip('jacket', '가벼운 겉옷', 'teal');
  } else if (cold >= 7) {
    lines.push('쌀쌀하니 <b>도톰한 겉옷(점퍼 · 자켓)</b>을 입혀 주세요.');
    tip('jacket', '도톰한 겉옷', 'blue');
  } else if (cold >= 2) {
    lines.push('추우니 <b>따뜻한 점퍼나 얇은 패딩</b>을 입혀 주세요.');
    tip('jacket', '점퍼 · 패딩', 'blue');
  } else if (cold >= -4) {
    lines.push('많이 추우니 <b>두꺼운 패딩</b>에 장갑을 챙겨 주세요.');
    tip('jacket', '두꺼운 패딩', 'purple');
    tip('mitten', '장갑', 'purple');
  } else {
    lines.push('아주 추우니 <b>두꺼운 패딩</b>에 모자 · 장갑 · 목도리까지 꼭 챙겨 주세요.');
    tip('jacket', '두꺼운 패딩', 'purple');
    tip('mitten', '모자 · 장갑 · 목도리', 'purple');
  }

  if (warm - cold >= 7 && cold < 17 && warm < 29) {
    lines.push('낮에는 따뜻해지니 <b>입고 벗기 쉬운 옷</b>으로 겹쳐 입혀 주세요.');
    tip('layers', '겹쳐 입기', 'teal');
  }

  // 날씨 주의 (중요한 순서)
  const extras = [];
  const pop = Number.isFinite(f.pop) ? f.pop : 0;
  const popText = pop ? `(강수확률 ${pop}%)` : '';
  if (f.snowHours > 0) {
    extras.push({ text: '눈 소식이 있어요. <b>미끄럽지 않은 신발</b>과 장갑을 챙겨 주세요.', tip: { icon: 'snowflake', label: '방수 신발', tone: 'blue' } });
  } else if (pop >= 60 || f.rainHours >= 2) {
    extras.push({ text: `비 소식이 있어요${popText}. <b>우산과 장화</b>를 챙겨 주세요.`, tip: { icon: 'umbrella', label: '우산 · 장화', tone: 'blue' } });
  } else if (pop >= 40 || f.rainHours === 1) {
    extras.push({ text: `비가 올 수도 있어요${popText}. <b>작은 우산</b>을 챙기면 좋아요.`, tip: { icon: 'umbrella', label: '우산', tone: 'blue' } });
  }
  if (f.dust && f.dust.level >= 2) {
    extras.push({ text: `미세먼지가 ${f.dust.level >= 3 ? '매우 ' : ''}나빠요. <b>마스크</b>를 챙겨 주세요.`, tip: { icon: 'mask', label: '마스크', tone: 'orange' } });
  }
  if (f.uv >= 6 && warm >= 18) {
    extras.push({ text: '자외선이 강해요. <b>모자와 선크림</b>을 챙겨 주세요.', tip: { icon: 'sun', label: '모자 · 선크림', tone: 'yellow' } });
  }
  if (f.wind >= 8 && cold < 20) {
    extras.push({ text: `바람이 세게 불어요(초속 ${Math.round(f.wind)}m). <b>모자 달린 겉옷</b>이 좋아요.`, tip: { icon: 'wind', label: '바람 주의', tone: 'teal' } });
  }

  return { lines, extras, tips: [...extras.map((e) => e.tip), ...tips] };
}

/**
 * 오늘 화면 안내 문장을 만듭니다.
 * @param {object} p
 * @param {Date} p.now 지금 시각
 * @param {{schedules, meals, holidays}} p.data 이번 달 + 다음 달 (우리 반 기준으로 거른 것)
 * @param {object|null} p.weather getWeather() 결과 (없으면 날씨 문장 생략)
 * @param {number} p.fromHour 이 시각부터는 내일을 먼저 안내
 */
export function buildBrief({ now, data, weather = null, fromHour = 14 }) {
  const today = U.ymd(now);
  const hour = now.getHours();
  const focus = hour < fromHour ? today : U.addDays(today, 1);
  const focusWord = dayWord(focus, today);
  const eventsOn = (date) => data.schedules.filter((s) => s.date === date && !isClosure(s));
  const sentences = [];
  const chips = [];
  let tips = [];
  let target = focus;
  const off = offReason(focus, data);

  if (off) {
    const word = `${focusWord}${U.josa(focusWord, '은', '는')}`;
    sentences.push(off.kind === 'weekend'
      ? `${word} ${off.text}, 가족과 즐거운 주말 보내세요.`
      : `${word} <b>${esc(off.text)}</b>${U.josa(off.text, '이라', '라')} 유치원이 쉬어요.`);

    // 다음 등원일 (2주 안)
    target = null;
    for (let i = 1; i <= 14; i++) {
      const date = U.addDays(focus, i);
      if (!offReason(date, data)) {
        target = date;
        break;
      }
    }
    if (target) {
      const wd = U.weekdayName(target);
      sentences.push(`다음 등원일은 <b>${U.formatDateLabel(target)}</b>${U.josa(wd, '이에요', '예요')}.`);
      const events = eventsOn(target);
      if (events.length) {
        sentences.push(eventsSentence('이날은', events));
        chips.push({ kind: 'day', date: target, label: `${dayWord(target, today)} 일정 ${events.length}건` });
      }
    }
  } else {
    const events = eventsOn(focus);
    const lead = `${focusWord}${U.josa(focusWord, '은', '는')}`;
    if (events.length) {
      sentences.push(eventsSentence(lead, events));
      chips.push({ kind: 'day', date: focus, label: `${focusWord} 일정 ${events.length}건` });
    } else {
      sentences.push(focus === today
        ? `${lead} 특별한 일정 없이 즐겁게 놀이해요.`
        : `${lead} 특별한 일정 없이 평소처럼 등원해요.`);
    }
  }

  // 날씨 · 옷차림 (예보 범위 안일 때만)
  // 오늘 오전 10시가 지나면 이미 등원했으니 하원 시간 기준으로 알려 줍니다.
  const afterDropOff = target === today && hour >= 10;
  const forecast = target ? dayForecast(weather, target, afterDropOff ? { fromHour: hour } : {}) : null;
  if (forecast) {
    const lead = target === focus ? '' : `${dayWord(target, today)} `;
    sentences.push(weatherSentence(forecast, { lead, afterDropOff }));
    const advice = outfitAdvice(forecast);
    sentences.push(...(afterDropOff ? [`하원할 때는 ${advice.lines[0]}`] : advice.lines));
    sentences.push(...advice.extras.slice(0, 2).map((e) => e.text));
    tips = advice.tips.slice(0, 4);
  }

  // 그날 일정이 없으면 다가오는 일정을 한 줄로 알려 줍니다.
  const upcoming = data.schedules
    .filter((s) => s.date > (target || focus) && U.dayDiff(today, s.date) <= 30)
    .sort((a, b) => a.date.localeCompare(b.date));
  const focusHasEvents = chips.some((c) => c.kind === 'day');
  if (!focusHasEvents && upcoming.length) {
    const next = upcoming[0];
    const days = U.dayDiff(today, next.date);
    if (days === 1) {
      const events = eventsOn(next.date);
      sentences.push(eventsSentence('내일은', events.length ? events : [next]));
      chips.push({ kind: 'day', date: next.date, label: `내일 일정 ${events.length || 1}건` });
    } else {
      sentences.push(`다가오는 일정은 ${U.formatDateLabel(next.date)} ${quote(next.title)}${U.josa(next.title, '으로', '로')}, ${days}일 남았어요.`);
      chips.push({ kind: 'upcoming', label: '다가오는 일정 보기' });
    }
  }

  return {
    greeting: greetingFor(hour),
    dateLabel: fullDateLabel(today),
    today,
    focus,
    target,
    html: sentences.filter(Boolean).join(' '),
    chips,
    tips,
    hasForecast: Boolean(forecast)
  };
}
