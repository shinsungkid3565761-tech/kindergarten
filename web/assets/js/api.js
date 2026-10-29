// Apps Script JSON API 클라이언트
// - 읽기: GET ?action=month
// - 쓰기: POST (Content-Type: text/plain → 브라우저 CORS 사전요청 없이 전송)

import { CONFIG } from './config.js';
import { monthKey } from './util.js';

export class ApiError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const query = new URLSearchParams(location.search);
export const IS_DEMO = query.has('demo') || !CONFIG.API_URL;

let demoBackend = null;

async function send(method, payload) {
  if (IS_DEMO) {
    if (!demoBackend) {
      const { createDemoBackend } = await import('./demo.js');
      demoBackend = createDemoBackend();
    }
    return demoBackend.handle(method, payload);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT_MS);
  let response;

  try {
    if (method === 'GET') {
      const url = new URL(CONFIG.API_URL);
      Object.entries(payload).forEach(([key, value]) => url.searchParams.set(key, value));
      response = await fetch(url, { redirect: 'follow', signal: controller.signal });
    } else {
      response = await fetch(CONFIG.API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
        redirect: 'follow',
        signal: controller.signal
      });
    }
  } catch (err) {
    throw new ApiError(
      'NETWORK',
      err.name === 'AbortError'
        ? '서버 응답이 늦어지고 있어요. 잠시 후 다시 시도해 주세요.'
        : '서버에 연결하지 못했어요. 인터넷 연결 또는 Apps Script 배포 설정(액세스: 모든 사용자)을 확인해 주세요.'
    );
  } finally {
    clearTimeout(timer);
  }

  const text = await response.text();
  let json;

  try {
    json = JSON.parse(text);
  } catch (err) {
    throw new ApiError(
      'BAD_RESPONSE',
      'Apps Script가 JSON으로 응답하지 않았어요. apps-script/Code.gs 로 코드를 바꾼 뒤 새 버전으로 다시 배포해 주세요.'
    );
  }

  if (!json.ok) {
    throw new ApiError(json.code || 'SERVER', json.error || '요청을 처리하지 못했어요.');
  }

  return json.data;
}

const monthCache = new Map();

export const api = {
  /** 월별 일정·급간식. 같은 달은 한 번만 불러옵니다. */
  getMonth(year, month, { force = false } = {}) {
    const key = monthKey(year, month);
    if (force || !monthCache.has(key)) {
      const request = send('GET', { action: 'month', year, month }).catch((err) => {
        monthCache.delete(key);
        throw err;
      });
      monthCache.set(key, request);
    }
    return monthCache.get(key);
  },

  clearCache() {
    monthCache.clear();
  },

  login(password) {
    return send('POST', { action: 'login', password });
  },

  save(token, kind, item, original) {
    return send('POST', {
      action: 'save',
      token,
      kind,
      item,
      row: original ? original.row : undefined,
      original: original || undefined
    });
  },

  remove(token, kind, original) {
    return send('POST', { action: 'delete', token, kind, row: original.row, original });
  },

  bulkAdd(token, kind, items) {
    return send('POST', { action: 'bulkAdd', token, kind, items });
  }
};
