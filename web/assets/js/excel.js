// 엑셀 양식 만들기 · 엑셀/CSV 파일 읽기 (관리자 페이지 전용)
// ExcelJS(약 1MB)는 엑셀 기능을 처음 쓸 때만 불러옵니다.

import * as U from './util.js';

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const BLUE = 'FF2F66BF';

/** 시트별 열 정의. aliases: 올린 파일의 제목줄에서 이 열을 찾을 때 쓰는 이름 (띄어쓰기 무시) */
export const SHEET_DEFS = {
  schedule: {
    name: '교육일정',
    tab: 'FF2F66BF',
    sheetAliases: ['교육일정', '일정', '행사'],
    columns: [
      { key: 'date', header: '날짜', width: 13, aliases: ['날짜', '일자', 'date'] },
      { key: 'category', header: '구분', width: 12, aliases: ['구분', '분류', '종류'] },
      { key: 'title', header: '행사명', width: 30, aliases: ['행사명', '제목', '일정명', '일정', '행사'] },
      { key: 'detail', header: '내용', width: 42, aliases: ['내용', '상세', '설명', '비고'], wrap: true },
      { key: 'target', header: '대상 반', width: 20, aliases: ['대상반', '대상', '반'] }
    ]
  },
  meal: {
    name: '급간식',
    tab: 'FF1FA363',
    sheetAliases: ['급간식', '급식', '식단', '간식'],
    columns: [
      { key: 'date', header: '날짜', width: 13, aliases: ['날짜', '일자', 'date'] },
      { key: 'type', header: '구분', width: 11, aliases: ['구분', '식사', '종류', '분류'] },
      { key: 'menu', header: '메뉴', width: 50, aliases: ['메뉴', '식단', '음식'], wrap: true },
      { key: 'allergy', header: '알레르기 정보', width: 16, aliases: ['알레르기정보', '알레르기', '알러지', '알레르기번호'] },
      { key: 'note', header: '비고', width: 24, aliases: ['비고', '메모', '참고'] }
    ]
  }
};

const scriptPromises = {};

function loadVendorScript(file, globalName) {
  if (window[globalName]) return Promise.resolve(window[globalName]);
  if (!scriptPromises[file]) {
    scriptPromises[file] = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = new URL(`../vendor/${file}`, import.meta.url).href;
      script.onload = () => resolve(window[globalName]);
      script.onerror = () => {
        delete scriptPromises[file];
        script.remove();
        reject(new Error('엑셀 도구를 불러오지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.'));
      };
      document.head.append(script);
    });
  }
  return scriptPromises[file];
}

export function loadExcelJS() {
  return loadVendorScript('exceljs.min.js', 'ExcelJS');
}

/**
 * 엑셀 · 구글시트에서 셀 메모(댓글)를 단 파일은 ExcelJS가 열다가 멈추는 문제가 있어,
 * 그럴 때만 메모를 떼어 낸 사본으로 다시 엽니다. (메모 외 내용은 그대로)
 */
async function withoutComments(buffer) {
  const JSZip = await loadVendorScript('jszip.min.js', 'JSZip');
  const zip = await JSZip.loadAsync(buffer);
  const names = Object.keys(zip.files);

  for (const name of names.filter((n) => /^xl\/worksheets\/_rels\/[^/]+\.rels$/i.test(n))) {
    const xml = await zip.file(name).async('string');
    zip.file(name, xml.replace(/<Relationship\b[^>]*Type="[^"]*\/(?:comments|vmlDrawing|threadedComment)"[^>]*\/>/g, ''));
  }
  for (const name of names.filter((n) => /^xl\/worksheets\/[^/]+\.xml$/i.test(n))) {
    const xml = await zip.file(name).async('string');
    zip.file(name, xml.replace(/<legacyDrawing\b[^>]*\/>/g, ''));
  }
  return zip.generateAsync({ type: 'arraybuffer' });
}

// ─── 셀 값 ────────────────────────────────────

/** ExcelJS 셀 값(글자, 숫자, 날짜, 서식 있는 글자, 수식 결과, 링크)을 글자 또는 Date로 */
function cellValue(value) {
  if (value == null) return '';
  if (value instanceof Date) return value;
  if (typeof value === 'object') {
    if (Array.isArray(value.richText)) return value.richText.map((part) => part.text).join('');
    if ('result' in value) return cellValue(value.result);
    if ('text' in value) return cellValue(value.text);
    return '';
  }
  return String(value);
}

function utcYmd(date) {
  return `${date.getUTCFullYear()}-${U.pad2(date.getUTCMonth() + 1)}-${U.pad2(date.getUTCDate())}`;
}

/** 날짜 칸 → 'YYYY-MM-DD' (엑셀 날짜, 엑셀 날짜 번호, 2026-11-03, 2026. 11. 3., 11/3 …) */
export function cellToDate(value, fallbackYear) {
  if (value instanceof Date) return isNaN(value) ? '' : utcYmd(value);
  const text = String(value ?? '').trim();
  if (/^\d{5}(\.\d+)?$/.test(text)) {
    const serial = Math.floor(Number(text));
    if (serial > 30000 && serial < 80000) return utcYmd(new Date(Date.UTC(1899, 11, 30) + serial * 86400000));
  }
  return U.normalizeDateInput(text, fallbackYear);
}

export function cellText(value) {
  if (value instanceof Date) return isNaN(value) ? '' : utcYmd(value);
  return String(value ?? '').trim();
}

function excelDate(ymdText) {
  const [y, m, d] = ymdText.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

// ─── 양식 만들기 ──────────────────────────────

function styleHeader(row) {
  row.height = 22;
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });
}

function addGuideSheet(wb, { schoolName, year, month, classes }) {
  const ws = wb.addWorksheet('작성 방법', { properties: { tabColor: { argb: 'FF7B4DFF' } }, views: [{ showGridLines: false }] });
  ws.columns = [{ width: 3 }, { width: 8 }, { width: 96 }];

  ws.getCell('B2').value = `${schoolName} 교육일정 · 급간식 엑셀 양식`;
  ws.getCell('B2').font = { size: 16, bold: true, color: { argb: BLUE } };
  ws.getCell('B3').value = `${year}년 ${month}월 기준으로 만들었어요.`;
  ws.getCell('B3').font = { color: { argb: 'FF666666' } };

  const steps = [
    '[교육일정], [급간식] 탭에 내용을 적고 저장한 뒤, 관리자 페이지 › 엑셀 › "엑셀 파일 올리기"로 올리세요.',
    '첫 줄(제목줄)의 이름은 바꾸지 마세요. 열 순서는 바뀌어도 제목만 같으면 알아서 찾아요.',
    '날짜는 엑셀 날짜로 입력하거나 2026-11-03, 2026. 11. 3., 11/3 처럼 적어도 돼요.',
    '[급간식] 탭에는 평일 날짜와 오전간식 · 점심 · 오후간식 칸이 미리 채워져 있어요. 메뉴가 빈 줄은 올릴 때 자동으로 건너뛰어요.',
    '메뉴는 쉼표(,)로 구분하거나 한 칸 안에서 줄을 바꿔(Alt+Enter) 적어요. 메뉴 뒤에 붙인 번호(예: 미역국5.6.)도 알레르기로 인식해요.',
    '알레르기 정보는 번호를 점으로 구분해 적어요. 예: 1.2.5.6 (아래 번호표 참고)',
    `대상 반은 비워 두면 모든 반 일정이에요. 여러 반은 쉼표로 구분해요.${classes.length ? ` (반 목록: ${classes.join(', ')})` : ''}`,
    '올릴 때 "추가하기"는 기존 내용에 더하고, "해당 달 바꾸기"는 파일에 들어 있는 달의 기존 내용을 지우고 파일 내용으로 바꿔요.',
    '"이 달 내용 내려받기"로 받은 파일을 고친 뒤 "해당 달 바꾸기"로 올리면, 수정 · 삭제한 내용이 그대로 반영돼요.'
  ];
  steps.forEach((text, i) => {
    const row = ws.getRow(5 + i);
    row.getCell(2).value = `${i + 1}.`;
    row.getCell(2).font = { bold: true, color: { argb: BLUE } };
    row.getCell(2).alignment = { vertical: 'top', horizontal: 'right' };
    row.getCell(3).value = text;
    row.getCell(3).alignment = { wrapText: true, vertical: 'top' };
  });

  const tableStart = 6 + steps.length;
  const head = ws.getRow(tableStart);
  head.getCell(2).value = '번호';
  head.getCell(3).value = '알레르기 유발식품';
  styleHeader(head);
  U.ALLERGENS.forEach((name, i) => {
    const row = ws.getRow(tableStart + 1 + i);
    row.getCell(2).value = i + 1;
    row.getCell(2).alignment = { horizontal: 'center' };
    row.getCell(3).value = name;
  });
}

function addDataSheet(wb, kind, { categories, classes = [] }) {
  const def = SHEET_DEFS[kind];
  const ws = wb.addWorksheet(def.name, {
    properties: { tabColor: { argb: def.tab } },
    views: [{ state: 'frozen', ySplit: 1 }]
  });
  ws.columns = def.columns.map((c) => ({ header: c.header, key: c.key, width: c.width }));

  ws.getColumn('date').numFmt = 'yyyy-mm-dd';
  ws.getColumn('date').alignment = { horizontal: 'center', vertical: 'top' };
  def.columns.filter((c) => c.wrap).forEach((c) => {
    ws.getColumn(c.key).alignment = { wrapText: true, vertical: 'top' };
  });
  styleHeader(ws.getRow(1));

  // 구분 · 대상 반은 고를 수 있게 하되, 목록에 없는 값도 적을 수 있게 둡니다.
  const list = (values) => ({ type: 'list', allowBlank: true, formulae: [`"${values.join(',')}"`], showErrorMessage: false });
  ws.dataValidations.add('B2:B2000', list(categories));
  if (kind === 'schedule' && classes.length) ws.dataValidations.add('E2:E2000', list(classes));
  return ws;
}

function prefilledMeals(year, month, holidays) {
  const off = new Set(holidays.map((h) => h.date));
  const rows = [];
  for (let day = 1; day <= U.daysInMonth(year, month); day++) {
    const date = `${U.monthKey(year, month)}-${U.pad2(day)}`;
    const wd = U.weekdayIndex(date);
    if (wd === 0 || wd === 6 || off.has(date)) continue;
    U.MEAL_TYPE_PRESETS.forEach((type) => rows.push({ date, type, menu: '', allergy: '', note: '' }));
  }
  return rows;
}

/**
 * 엑셀 파일(Blob) 만들기
 * - prefill: true → 빈 양식 (급간식 탭에 평일 × 오전간식 · 점심 · 오후간식 줄을 미리 채움)
 * - prefill: false → 넘겨준 schedules · meals 를 그대로 담은 내려받기 파일
 */
export async function buildWorkbook({ schoolName, year, month, schedules = [], meals = [], holidays = [], classes = [], prefill = false }) {
  const ExcelJS = await loadExcelJS();
  const wb = new ExcelJS.Workbook();
  wb.creator = schoolName;
  wb.created = new Date();

  addGuideSheet(wb, { schoolName, year, month, classes });

  const scheduleSheet = addDataSheet(wb, 'schedule', { categories: U.SCHEDULE_CATEGORY_PRESETS, classes });
  (prefill ? [] : schedules).forEach((e) => {
    scheduleSheet.addRow({ date: excelDate(e.date), category: e.category, title: e.title, detail: e.detail, target: e.target || '' });
  });

  const mealSheet = addDataSheet(wb, 'meal', { categories: U.MEAL_TYPE_PRESETS });
  (prefill ? prefilledMeals(year, month, holidays) : U.sortMeals(meals)).forEach((m) => {
    mealSheet.addRow({ date: excelDate(m.date), type: m.type, menu: m.menu, allergy: m.allergy, note: m.note });
  });

  // 파일을 열면 급간식 탭이 먼저 보이게 합니다.
  wb.views = [{ x: 0, y: 0, width: 20000, height: 12000, firstSheet: 0, activeTab: 2, visibility: 'visible' }];

  const buffer = await wb.xlsx.writeBuffer();
  return new Blob([buffer], { type: XLSX_TYPE });
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

// ─── 파일 읽기 ────────────────────────────────

const norm = (value) => cellText(value).replace(/\s+/g, '').toLowerCase();

function worksheetRows(ws) {
  const rows = [];
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    const values = [];
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      values[col - 1] = cellValue(cell.value);
    });
    rows.push({ rowNumber, values: Array.from(values, (v) => v ?? '') });
  });
  return rows;
}

/** 따옴표 · 줄바꿈 셀을 지원하는 CSV 읽기 (쉼표 또는 탭) */
function parseDelimited(text) {
  const src = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const firstLine = src.split('\n', 1)[0];
  const delimiter = firstLine.includes('\t') && !firstLine.includes(',') ? '\t' : ',';
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;

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
    } else if (ch === delimiter) {
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
    .map((values, i) => ({ rowNumber: i + 1, values }))
    .filter((r) => r.values.some((v) => v.trim() !== ''));
}

/** 한국어 윈도우 엑셀이 만든 CSV(EUC-KR)도 읽습니다. */
function decodeText(buffer) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch (err) {
    return new TextDecoder('euc-kr').decode(buffer);
  }
}

function findColumn(headers, column) {
  for (const alias of column.aliases) {
    const index = headers.indexOf(alias);
    if (index !== -1) return index;
  }
  return -1;
}

/** 표에서 '날짜' 제목줄을 찾아 어떤 종류(교육일정/급간식)인지 정하고 줄마다 값을 꺼냅니다. */
function readTable(table) {
  const headerAt = table.rows.slice(0, 10).findIndex((r) => r.values.some((v) => ['날짜', '일자', 'date'].includes(norm(v))));
  if (headerAt === -1) return null;

  const headers = table.rows[headerAt].values.map(norm);
  const has = (kind, key) => findColumn(headers, SHEET_DEFS[kind].columns.find((c) => c.key === key)) !== -1;
  const byName = Object.keys(SHEET_DEFS).find((k) => SHEET_DEFS[k].sheetAliases.some((a) => norm(table.name).includes(a)));
  const kind = has('meal', 'menu') ? 'meal' : has('schedule', 'title') ? 'schedule' : byName;
  if (!kind) return null;

  const columns = SHEET_DEFS[kind].columns.map((c) => [c.key, findColumn(headers, c)]);
  const records = table.rows.slice(headerAt + 1).map((r) => ({
    sheet: table.name,
    rowNumber: r.rowNumber,
    values: Object.fromEntries(columns.map(([key, index]) => [key, index === -1 ? '' : (r.values[index] ?? '')]))
  }));
  return { kind, records };
}

/**
 * 올린 파일 읽기 → { schedule: [...], meal: [...], sheets: [{ name, kind, count }] }
 * 각 줄: { sheet, rowNumber, values: { date, category|type, ... } } (값은 글자 또는 Date)
 */
export async function readSpreadsheetFile(file) {
  const name = file.name || '';
  let tables;

  if (/\.xls$/i.test(name)) {
    throw new Error('예전 엑셀 형식(.xls)은 읽을 수 없어요. 엑셀에서 "다른 이름으로 저장 → Excel 통합 문서(*.xlsx)"로 저장한 뒤 올려 주세요.');
  }

  if (/\.(csv|txt)$/i.test(name) || file.type === 'text/csv') {
    tables = [{ name: name.replace(/\.[^.]+$/, ''), rows: parseDelimited(decodeText(await file.arrayBuffer())) }];
  } else {
    const ExcelJS = await loadExcelJS();
    const buffer = await file.arrayBuffer();
    let wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(buffer);
    } catch (err) {
      try {
        wb = new ExcelJS.Workbook();
        await wb.xlsx.load(await withoutComments(buffer));
      } catch (retryErr) {
        throw new Error('엑셀 파일을 열지 못했어요. .xlsx 파일인지 확인해 주세요. (암호가 걸린 파일은 암호를 풀고 저장해 주세요)');
      }
    }
    tables = wb.worksheets
      .filter((ws) => ws.state !== 'hidden' && ws.state !== 'veryHidden')
      .map((ws) => ({ name: ws.name, rows: worksheetRows(ws) }));
  }

  const result = { schedule: [], meal: [], sheets: [] };
  tables.forEach((table) => {
    const found = readTable(table);
    if (!found) return;
    result.sheets.push({ name: table.name, kind: found.kind, count: found.records.length });
    result[found.kind].push(...found.records);
  });
  return result;
}
