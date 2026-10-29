/**
 * 신성대학교부속유치원 교육일정 · 급간식 안내
 * Code.gs - Apps Script 백엔드 (구글시트 + JSON API)
 *
 * - 공개 페이지(GitHub Pages)  : GET  ?action=month&year=2026&month=3
 * - 관리자 페이지              : POST {action: 'login' | 'save' | 'delete' | 'bulkAdd', ...}
 * - 관리자 비밀번호            : 구글시트 [설정] 탭의 '관리자 비밀번호' 칸 (B2)
 */

const SHEET_NAMES = {
  SCHEDULE: '교육일정',
  MEAL: '급간식',
  SETTINGS: '설정'
};

// [설정] 탭에서 비밀번호를 찾을 때 쓰는 항목 이름 (A열)
const PASSWORD_LABEL = '관리자 비밀번호';

const SHEET_HEADERS = {
  SCHEDULE: [['날짜', '구분', '행사명', '내용']],
  MEAL: [['날짜', '구분', '메뉴', '알레르기 정보', '비고']]
};

const SCHOOL_NAME = '신성대학교부속유치원';

const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;   // 관리자 로그인 유지 시간 (12시간)
const CACHE_TTL_SEC = 300;                   // 월별 데이터 캐시 (5분, 관리자 수정 시 즉시 초기화)
const MAX_LOGIN_FAILURES = 10;               // 10분 동안 허용하는 로그인 실패 횟수
const MAX_BULK_ITEMS = 500;                  // 일괄 등록 1회 최대 건수

// 쓰기 요청(POST 전용)
const WRITE_ACTIONS = { login: true, save: true, 'delete': true, bulkAdd: true };

// 시트 종류별 정의 (열 순서 = 시트 열 순서)
const KINDS = {
  schedule: {
    sheetName: SHEET_NAMES.SCHEDULE,
    headers: SHEET_HEADERS.SCHEDULE,
    fields: [
      { key: 'date',     max: 10 },
      { key: 'category', max: 30 },
      { key: 'title',    max: 100 },
      { key: 'detail',   max: 1000 }
    ],
    categoryKey: 'category',
    defaultCategory: '교육일정',
    requiredKey: 'title',
    requiredLabel: '행사명',
    fromRow: scheduleFromRow_
  },
  meal: {
    sheetName: SHEET_NAMES.MEAL,
    headers: SHEET_HEADERS.MEAL,
    fields: [
      { key: 'date',    max: 10 },
      { key: 'type',    max: 30 },
      { key: 'menu',    max: 500 },
      { key: 'allergy', max: 200 },
      { key: 'note',    max: 300 }
    ],
    categoryKey: 'type',
    defaultCategory: '급식',
    requiredKey: 'menu',
    requiredLabel: '메뉴',
    fromRow: mealFromRow_
  }
};

/**
 * 최초 1회 실행:
 * 교육일정·급간식 관리 시트를 자동으로 만듭니다.
 */
function setupSheets() {
  const ss = getSpreadsheet_();

  createSheetIfNeeded_(ss, SHEET_NAMES.SCHEDULE, SHEET_HEADERS.SCHEDULE);
  createSheetIfNeeded_(ss, SHEET_NAMES.MEAL, SHEET_HEADERS.MEAL);
  createSettingsSheetIfNeeded_(ss);

  Logger.log('관리 시트 주소: ' + ss.getUrl());
  if (!getAdminPassword_()) {
    Logger.log('⚠️ 관리자 비밀번호가 없습니다. 구글시트 [설정] 탭의 B2 칸에 비밀번호를 입력하세요.');
  }
  return ss.getUrl();
}

/**
 * 웹앱 GET 진입점
 * - action 파라미터가 있으면 JSON API로 응답합니다.
 * - 없으면 기존 화면(index.html)을 그대로 보여줍니다.
 */
function doGet(e) {
  const params = (e && e.parameter) || {};

  if (!params.action) {
    try {
      return HtmlService.createHtmlOutputFromFile('index')
        .setTitle(SCHOOL_NAME + ' 교육일정 · 급간식 안내')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    } catch (err) {
      return jsonOutput_({ ok: true, data: { service: SCHOOL_NAME + ' API', status: 'running' } });
    }
  }

  return handleRequest_('GET', params);
}

/**
 * 웹앱 POST 진입점 (관리자 기능)
 * 브라우저 CORS 사전요청을 피하기 위해 Content-Type: text/plain 으로 JSON 문자열을 받습니다.
 */
function doPost(e) {
  let body;

  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return jsonOutput_({ ok: false, code: 'INVALID', error: '요청 형식이 올바르지 않습니다.' });
  }

  return handleRequest_('POST', body || {});
}

/**
 * 요청 종류(action)에 따라 처리하고 JSON으로 응답합니다.
 */
function handleRequest_(method, params) {
  const action = String(params.action || '');

  try {
    if (WRITE_ACTIONS[action] && method !== 'POST') {
      throw apiError_('INVALID', '이 요청은 POST로만 보낼 수 있습니다.');
    }

    switch (action) {
      case 'ping':
        return ok_({ school: SCHOOL_NAME, time: new Date().toISOString() });

      case 'month':
        return ok_(getMonthDataCached_(params.year, params.month));

      case 'login':
        return ok_(login_(params.password));

      case 'save':
        requireAdmin_(params.token);
        return ok_(saveItem_(params.kind, params.row, params.original, params.item));

      case 'delete':
        requireAdmin_(params.token);
        return ok_(deleteItem_(params.kind, params.row, params.original));

      case 'bulkAdd':
        requireAdmin_(params.token);
        return ok_(bulkAdd_(params.kind, params.items));

      default:
        throw apiError_('INVALID', '알 수 없는 요청입니다: ' + action);
    }
  } catch (err) {
    if (err && err.apiCode) {
      return jsonOutput_({ ok: false, code: err.apiCode, error: err.message });
    }
    console.error(err);
    return jsonOutput_({ ok: false, code: 'SERVER', error: '서버 오류가 발생했습니다. (' + (err && err.message) + ')' });
  }
}

/**
 * 해당 월의 일정·급간식 데이터를 불러옵니다.
 * (각 항목의 row 값은 관리자 페이지에서 수정·삭제할 때 사용합니다.)
 */
function getMonthData(year, month) {
  const ss = getSpreadsheet_();
  const targetMonth = year + '-' + String(month).padStart(2, '0');

  const scheduleSheet = ss.getSheetByName(SHEET_NAMES.SCHEDULE);
  const mealSheet = ss.getSheetByName(SHEET_NAMES.MEAL);

  const schedules = readScheduleData_(scheduleSheet).filter(function(item) {
    return item.date.indexOf(targetMonth) === 0;
  });

  const meals = readMealData_(mealSheet).filter(function(item) {
    return item.date.indexOf(targetMonth) === 0;
  });

  return {
    schedules: sortByDate_(schedules),
    meals: sortByDate_(meals)
  };
}

/**
 * 월별 데이터를 캐시와 함께 불러옵니다.
 */
function getMonthDataCached_(year, month) {
  year = Number(year);
  month = Number(month);

  if (!(year >= 2000 && year <= 2100) || !(month >= 1 && month <= 12) || month % 1 !== 0) {
    throw apiError_('INVALID', '연도 또는 월 값이 올바르지 않습니다.');
  }

  const cache = CacheService.getScriptCache();
  const key = 'month_' + getCacheVersion_() + '_' + year + '-' + String(month).padStart(2, '0');
  const cached = cache.get(key);

  if (cached) return JSON.parse(cached);

  const data = getMonthData(year, month);

  try {
    cache.put(key, JSON.stringify(data), CACHE_TTL_SEC);
  } catch (err) {
    // 100KB를 넘는 달은 캐시 없이 응답합니다.
  }

  return data;
}

/**
 * 교육일정 시트 내용을 읽습니다.
 */
function readScheduleData_(sheet) {
  return readRows_(sheet, scheduleFromRow_);
}

/**
 * 급간식 시트 내용을 읽습니다.
 */
function readMealData_(sheet) {
  return readRows_(sheet, mealFromRow_);
}

function scheduleFromRow_(row) {
  const date = formatDate_(row[0]);
  if (!date) return null;

  return {
    date: date,
    category: String(row[1] || '교육일정'),
    title: String(row[2] || ''),
    detail: String(row[3] || '')
  };
}

function mealFromRow_(row) {
  const date = formatDate_(row[0]);
  if (!date) return null;

  return {
    date: date,
    type: String(row[1] || '급식'),
    menu: String(row[2] || ''),
    allergy: String(row[3] || ''),
    note: String(row[4] || '')
  };
}

/**
 * 시트의 2행부터 읽어 객체 배열로 만듭니다. (row = 실제 시트 행 번호)
 */
function readRows_(sheet, fromRow) {
  if (!sheet || sheet.getLastRow() < 2) return [];

  const values = sheet.getDataRange().getValues();
  const result = [];

  for (let i = 1; i < values.length; i++) {
    const item = fromRow(values[i]);
    if (!item) continue;

    item.row = i + 1;
    result.push(item);
  }

  return result;
}

function sortByDate_(items) {
  return items.sort(function(a, b) {
    return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
  });
}

// ─── 관리자 인증 ─────────────────────────────

/**
 * 비밀번호를 확인하고 12시간 동안 쓸 수 있는 토큰을 발급합니다.
 */
function login_(password) {
  const expected = getAdminPassword_();

  if (!expected) {
    throw apiError_('NOT_CONFIGURED', '관리자 비밀번호가 설정되지 않았습니다. 구글시트 [설정] 탭의 \'관리자 비밀번호\' 칸(B2)을 채워 주세요.');
  }

  const cache = CacheService.getScriptCache();
  const failures = Number(cache.get('login_failures') || 0);

  if (failures >= MAX_LOGIN_FAILURES) {
    throw apiError_('LOCKED', '로그인 시도가 너무 많습니다. 10분 뒤에 다시 시도해 주세요.');
  }

  if (String(password || '') !== expected) {
    cache.put('login_failures', String(failures + 1), 600);
    Utilities.sleep(800);
    throw apiError_('UNAUTHORIZED', '비밀번호가 올바르지 않습니다.');
  }

  cache.remove('login_failures');

  const expiresAt = Date.now() + TOKEN_TTL_MS;
  return {
    token: expiresAt + '.' + signToken_(String(expiresAt)),
    expiresAt: expiresAt
  };
}

function requireAdmin_(token) {
  const parts = String(token || '').split('.');
  const expiresAt = Number(parts[0]);

  const valid = parts.length === 2 &&
    expiresAt > Date.now() &&
    getAdminPassword_() &&
    signToken_(parts[0]) === parts[1];

  if (!valid) {
    throw apiError_('UNAUTHORIZED', '로그인이 만료되었습니다. 다시 로그인해 주세요.');
  }
}

/**
 * 토큰 서명: 비밀번호가 바뀌면 기존 토큰도 자동으로 무효가 됩니다.
 */
function signToken_(payload) {
  const key = getTokenSecret_() + ':' + getAdminPassword_();
  const bytes = Utilities.computeHmacSha256Signature(payload, key);
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/, '');
}

let adminPasswordCache_ = null;

/**
 * 관리자 비밀번호: 구글시트 [설정] 탭 → 비어 있으면 스크립트 속성 ADMIN_PASSWORD.
 * (한 번의 요청 안에서는 한 번만 읽습니다.)
 */
function getAdminPassword_() {
  if (adminPasswordCache_ !== null) return adminPasswordCache_;

  const sheet = createSettingsSheetIfNeeded_(getSpreadsheet_());
  const values = sheet.getDataRange().getValues();
  let password = '';

  for (let i = 0; i < values.length; i++) {
    if (String(values[i][0]).trim() === PASSWORD_LABEL) {
      password = String(values[i][1] == null ? '' : values[i][1]).trim();
      break;
    }
  }

  if (!password) {
    password = String(PropertiesService.getScriptProperties().getProperty('ADMIN_PASSWORD') || '').trim();
  }

  adminPasswordCache_ = password;
  return password;
}

/**
 * [설정] 탭이 없으면 만듭니다. B열은 글자 형식이라 0으로 시작하는 비밀번호도 그대로 저장됩니다.
 */
function createSettingsSheetIfNeeded_(ss) {
  let sheet = ss.getSheetByName(SHEET_NAMES.SETTINGS);
  if (sheet) return sheet;

  sheet = ss.insertSheet(SHEET_NAMES.SETTINGS);
  sheet.getRange('B:B').setNumberFormat('@');
  sheet.getRange(1, 1, 2, 3).setValues([
    ['항목', '값', '설명'],
    [PASSWORD_LABEL, '', '관리자 페이지 로그인 비밀번호입니다. 바꾸면 이미 로그인한 기기도 다시 로그인해야 합니다.']
  ]);

  sheet.getRange(1, 1, 1, 3)
    .setBackground('#2f66bf')
    .setFontColor('#ffffff')
    .setFontWeight('bold')
    .setHorizontalAlignment('center');
  sheet.getRange(2, 2).setBackground('#fff8d6');

  sheet.setFrozenRows(1);
  sheet.setColumnWidth(1, 140);
  sheet.setColumnWidth(2, 200);
  sheet.setColumnWidth(3, 460);

  return sheet;
}

function getTokenSecret_() {
  const properties = PropertiesService.getScriptProperties();
  let secret = properties.getProperty('TOKEN_SECRET');

  if (!secret) {
    secret = Utilities.getUuid() + Utilities.getUuid();
    properties.setProperty('TOKEN_SECRET', secret);
  }

  return secret;
}

// ─── 등록 · 수정 · 삭제 ──────────────────────

/**
 * 항목을 추가(row 없음)하거나 수정(row 있음)합니다.
 * 수정할 때는 original(불러올 당시 값)과 시트의 현재 값이 같은지 확인해
 * 다른 사람이 먼저 바꾼 행을 덮어쓰지 않도록 합니다.
 */
function saveItem_(kind, row, original, item) {
  const def = getKind_(kind);
  const record = normalizeItem_(def, item);

  return withLock_(function() {
    const sheet = getKindSheet_(def);
    const values = toRowValues_(def, record);
    let rowNum;

    if (row) {
      rowNum = assertRowMatches_(sheet, def, row, original);
      sheet.getRange(rowNum, 1, 1, values.length).setValues([values]);
    } else {
      rowNum = sheet.getLastRow() + 1;
      sheet.getRange(rowNum, 1, 1, values.length).setValues([values]);
    }

    invalidateCache_();
    record.row = rowNum;
    return { item: record };
  });
}

function deleteItem_(kind, row, original) {
  const def = getKind_(kind);

  return withLock_(function() {
    const sheet = getKindSheet_(def);
    const rowNum = assertRowMatches_(sheet, def, row, original);

    sheet.deleteRow(rowNum);
    invalidateCache_();
    return { row: rowNum };
  });
}

/**
 * 여러 항목을 한 번에 추가합니다. (엑셀 붙여넣기, 기간 일정 등록)
 */
function bulkAdd_(kind, items) {
  const def = getKind_(kind);

  if (!Array.isArray(items) || items.length === 0) {
    throw apiError_('INVALID', '등록할 항목이 없습니다.');
  }
  if (items.length > MAX_BULK_ITEMS) {
    throw apiError_('INVALID', '한 번에 최대 ' + MAX_BULK_ITEMS + '건까지 등록할 수 있습니다.');
  }

  const rows = items.map(function(item, index) {
    try {
      return toRowValues_(def, normalizeItem_(def, item));
    } catch (err) {
      if (err.apiCode) err.message = (index + 1) + '번째 줄: ' + err.message;
      throw err;
    }
  });

  return withLock_(function() {
    const sheet = getKindSheet_(def);
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
    invalidateCache_();
    return { count: rows.length };
  });
}

function getKind_(kind) {
  const def = KINDS[String(kind || '')];
  if (!def) throw apiError_('INVALID', '알 수 없는 데이터 종류입니다: ' + kind);
  return def;
}

function getKindSheet_(def) {
  return createSheetIfNeeded_(getSpreadsheet_(), def.sheetName, def.headers);
}

/**
 * 입력값을 정리하고 검증합니다.
 */
function normalizeItem_(def, item) {
  item = item || {};
  const record = {};

  def.fields.forEach(function(field) {
    let text = String(item[field.key] == null ? '' : item[field.key]).trim();
    if (text.length > field.max) text = text.slice(0, field.max);
    record[field.key] = text;
  });

  if (!isValidDate_(record.date)) {
    throw apiError_('INVALID', '날짜 형식이 올바르지 않습니다. (예: 2026-03-02)');
  }
  if (!record[def.requiredKey]) {
    throw apiError_('INVALID', def.requiredLabel + '을(를) 입력해 주세요.');
  }
  if (!record[def.categoryKey]) {
    record[def.categoryKey] = def.defaultCategory;
  }

  return record;
}

/**
 * 시트에 쓸 값 배열을 만듭니다.
 * =, +, -, @ 로 시작하는 글자는 수식으로 실행되지 않도록 앞에 ' 를 붙입니다.
 */
function toRowValues_(def, record) {
  return def.fields.map(function(field) {
    const value = record[field.key];

    if (field.key === 'date') {
      const parts = value.split('-');
      return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    }

    return /^[=+\-@]/.test(value) ? "'" + value : value;
  });
}

function assertRowMatches_(sheet, def, row, original) {
  const rowNum = Number(row);

  if (!(rowNum >= 2) || rowNum % 1 !== 0 || rowNum > sheet.getLastRow()) {
    throw apiError_('CONFLICT', '해당 항목을 찾을 수 없습니다. 새로고침 후 다시 시도해 주세요.');
  }

  const values = sheet.getRange(rowNum, 1, 1, def.fields.length).getValues()[0];
  const current = def.fromRow(values);
  original = original || {};

  const same = current && def.fields.every(function(field) {
    return String(original[field.key] == null ? '' : original[field.key]) === String(current[field.key]);
  });

  if (!same) {
    throw apiError_('CONFLICT', '다른 곳에서 내용이 바뀌었습니다. 새로고침 후 다시 시도해 주세요.');
  }

  return rowNum;
}

function isValidDate_(text) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;

  const parts = text.split('-').map(Number);
  const date = new Date(parts[0], parts[1] - 1, parts[2]);

  return date.getFullYear() === parts[0] &&
    date.getMonth() === parts[1] - 1 &&
    date.getDate() === parts[2];
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();

  if (!lock.tryLock(15000)) {
    throw apiError_('BUSY', '다른 작업을 처리하는 중입니다. 잠시 후 다시 시도해 주세요.');
  }

  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

// ─── 캐시 ────────────────────────────────────

/**
 * 캐시 버전을 바꿔서 모든 월 캐시를 한 번에 무효화합니다.
 */
function getCacheVersion_() {
  const cache = CacheService.getScriptCache();
  let version = cache.get('data_version');

  if (!version) {
    version = Utilities.getUuid();
    cache.put('data_version', version, 21600);
  }

  return version;
}

function invalidateCache_() {
  CacheService.getScriptCache().put('data_version', Utilities.getUuid(), 21600);
}

/**
 * 구글시트를 직접 수정했을 때도 캐시를 비워 바로 반영되게 합니다.
 * (스프레드시트에 연결된 스크립트에서만 자동 실행됩니다.)
 */
function onEdit(e) {
  try {
    invalidateCache_();
  } catch (err) {
    // 단순 트리거에서 캐시를 쓸 수 없는 환경이면 5분 뒤 자동 반영됩니다.
  }
}

// ─── 공통 도구 ───────────────────────────────

function ok_(data) {
  return jsonOutput_({ ok: true, data: data });
}

function jsonOutput_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function apiError_(code, message) {
  const err = new Error(message);
  err.apiCode = code;
  return err;
}

/**
 * 날짜를 yyyy-MM-dd 형식으로 통일합니다.
 */
function formatDate_(value) {
  if (!value) return '';

  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value)) {
    return Utilities.formatDate(
      value,
      Session.getScriptTimeZone(),
      'yyyy-MM-dd'
    );
  }

  const text = String(value).trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text;
  }

  const parsed = new Date(text);

  if (!isNaN(parsed)) {
    return Utilities.formatDate(
      parsed,
      Session.getScriptTimeZone(),
      'yyyy-MM-dd'
    );
  }

  return '';
}

/**
 * 시트가 없으면 생성하고 제목행을 넣습니다.
 */
function createSheetIfNeeded_(ss, sheetName, headers) {
  let sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }

  if (sheet.getLastRow() === 0) {
    const columnCount = headers[0].length;

    sheet.getRange(1, 1, 1, columnCount).setValues(headers);

    sheet.getRange(1, 1, 1, columnCount)
      .setBackground('#2f66bf')
      .setFontColor('#ffffff')
      .setFontWeight('bold')
      .setHorizontalAlignment('center');

    sheet.setFrozenRows(1);
    sheet.autoResizeColumns(1, columnCount);
    sheet.getRange('A:A').setNumberFormat('yyyy-mm-dd');
  }

  return sheet;
}

/**
 * 연결된 관리용 구글시트를 가져옵니다.
 * 처음 실행하면 자동으로 새 구글시트를 만듭니다.
 */
function getSpreadsheet_() {
  const properties = PropertiesService.getScriptProperties();
  const savedId = properties.getProperty('SPREADSHEET_ID');

  if (savedId) {
    return SpreadsheetApp.openById(savedId);
  }

  const activeSpreadsheet = SpreadsheetApp.getActiveSpreadsheet();

  if (activeSpreadsheet) {
    properties.setProperty('SPREADSHEET_ID', activeSpreadsheet.getId());
    return activeSpreadsheet;
  }

  const newSpreadsheet = SpreadsheetApp.create(
    '신성대학교부속유치원 교육일정 및 급간식 관리'
  );

  properties.setProperty('SPREADSHEET_ID', newSpreadsheet.getId());

  return newSpreadsheet;
}
