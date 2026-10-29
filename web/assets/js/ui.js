// Liquid Glass UI 부품: 내비게이션 바, 탭바, 세그먼트, 시트, 알림, 토스트

import { icon } from './icons.js';
import { el, escapeHtml } from './util.js';

/** 큰 제목이 화면 밖으로 나가면 상단 바에 작은 제목과 유리 배경을 띄웁니다. */
export function initNavbar(navbar, largeTitle) {
  const observer = new IntersectionObserver(
    ([entry]) => navbar.classList.toggle('is-scrolled', !entry.isIntersecting),
    { rootMargin: '-64px 0px 0px 0px' }
  );
  observer.observe(largeTitle);
}

/** 플로팅 탭바: 선택 표시(렌즈)가 물방울처럼 미끄러지며 이동합니다. */
export function initTabBar(nav, { onChange }) {
  const lens = nav.querySelector('.tabbar__lens');
  const items = [...nav.querySelectorAll('[data-tab]')];
  let current = null;

  const place = (animate) => {
    if (!current) return;
    if (!animate) lens.style.transition = 'none';
    lens.style.width = `${current.offsetWidth}px`;
    lens.style.transform = `translateX(${current.offsetLeft}px)`;
    if (!animate) {
      lens.getBoundingClientRect();
      lens.style.transition = '';
    }
  };

  const select = (name, { silent = false, animate = true } = {}) => {
    const target = items.find((item) => item.dataset.tab === name) || items[0];
    const changed = target !== current;
    const first = !current;
    current = target;

    items.forEach((item) => {
      const selected = item === target;
      item.setAttribute('aria-selected', String(selected));
      item.tabIndex = selected ? 0 : -1;
    });

    place(animate && !first);

    if (changed && !first && animate) {
      nav.classList.remove('is-moving');
      void nav.offsetWidth;
      nav.classList.add('is-moving');
      setTimeout(() => nav.classList.remove('is-moving'), 650);
    }

    if (!silent) onChange(target.dataset.tab);
  };

  items.forEach((item) => item.addEventListener('click', () => select(item.dataset.tab)));

  nav.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    const index = items.indexOf(current) + (event.key === 'ArrowRight' ? 1 : -1);
    const next = items[(index + items.length) % items.length];
    next.focus();
    select(next.dataset.tab);
  });

  new ResizeObserver(() => place(false)).observe(nav);

  return { select };
}

/** 세그먼트 컨트롤 */
export function createSegmented(options, value, onChange, { block = false, label = '' } = {}) {
  const root = el(`<div class="segmented glass glass--thin${block ? ' segmented--block' : ''}" role="group" aria-label="${escapeHtml(label)}"><span class="segmented__thumb" aria-hidden="true"></span></div>`);
  const thumb = root.firstElementChild;
  let current = value;

  options.forEach((option) => {
    const button = el(`<button type="button" class="segmented__item" data-value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</button>`);
    button.addEventListener('click', () => {
      if (current === option.value) return;
      setValue(option.value);
      onChange(option.value);
    });
    root.append(button);
  });

  const place = (animate = true) => {
    const active = [...root.querySelectorAll('.segmented__item')].find((b) => b.dataset.value === String(current));
    if (!active) {
      thumb.style.width = '0';
      return;
    }
    if (!animate) thumb.style.transition = 'none';
    thumb.style.width = `${active.offsetWidth}px`;
    thumb.style.transform = `translateX(${active.offsetLeft}px)`;
    if (!animate) {
      thumb.getBoundingClientRect();
      thumb.style.transition = '';
    }
  };

  function setValue(next) {
    current = next;
    root.querySelectorAll('.segmented__item').forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset.value === String(next)));
    });
    place(true);
  }

  setValue(value);
  new ResizeObserver(() => place(false)).observe(root);

  return { el: root, setValue, get value() { return current; } };
}

let scrollLocks = 0;

function lockScroll() {
  scrollLocks += 1;
  document.documentElement.style.overflow = 'hidden';
}

function unlockScroll() {
  scrollLocks = Math.max(0, scrollLocks - 1);
  if (!scrollLocks) document.documentElement.style.overflow = '';
}

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

function trapFocus(container, event) {
  if (event.key !== 'Tab') return;
  const nodes = [...container.querySelectorAll(FOCUSABLE)].filter((n) => n.offsetParent !== null);
  if (!nodes.length) return;
  const first = nodes[0];
  const last = nodes[nodes.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

let sheetSeq = 0;

/**
 * 시트 열기
 * @param {{ title: string, content: Node, primary?: { label: string, icon?: string, onClick: Function }, onClose?: Function }} options
 */
export function openSheet({ title, content, primary, onClose }) {
  const id = `sheet-title-${++sheetSeq}`;
  const opener = document.activeElement;
  const backdrop = el('<div class="sheet-backdrop"></div>');
  const sheet = el(`
    <section class="sheet glass" role="dialog" aria-modal="true" aria-labelledby="${id}">
      <div class="sheet__grabber" aria-hidden="true"></div>
      <header class="sheet__header">
        <button type="button" class="btn icon-btn" data-close aria-label="닫기">${icon('xmark', 20)}</button>
        <h2 class="sheet__title" id="${id}">${escapeHtml(title)}</h2>
        <span class="sheet__primary"></span>
      </header>
      <div class="sheet__body"></div>
    </section>`);
  const body = sheet.querySelector('.sheet__body');
  const primarySlot = sheet.querySelector('.sheet__primary');
  let primaryButton = null;
  let closed = false;

  body.append(content);

  if (primary) {
    primaryButton = el(`<button type="button" class="btn icon-btn btn--tint" aria-label="${escapeHtml(primary.label)}">${icon(primary.icon || 'check', 20)}</button>`);
    primaryButton.addEventListener('click', () => primary.onClick());
    primarySlot.append(primaryButton);
  }

  const close = () => {
    if (closed) return;
    closed = true;
    sheet.classList.remove('is-open', 'is-dragging');
    sheet.style.transform = '';
    backdrop.classList.remove('is-open');
    document.removeEventListener('keydown', onKey);
    setTimeout(() => {
      sheet.remove();
      backdrop.remove();
    }, 450);
    unlockScroll();
    if (opener && opener.focus) opener.focus({ preventScroll: true });
    if (onClose) onClose();
  };

  const onKey = (event) => {
    if (event.key === 'Escape' && !document.querySelector('.alert')) close();
    else trapFocus(sheet, event);
  };

  backdrop.addEventListener('click', close);
  sheet.querySelector('[data-close]').addEventListener('click', close);
  document.addEventListener('keydown', onKey);

  // 아래로 끌어내려 닫기 (모바일)
  const mobile = window.matchMedia('(max-width: 759px)');
  const dragZones = [sheet.querySelector('.sheet__grabber'), sheet.querySelector('.sheet__header')];
  let startY = 0;
  let dy = 0;
  let dragging = false;

  const onMove = (event) => {
    if (!dragging) return;
    dy = Math.max(0, event.clientY - startY);
    sheet.style.transform = `translateY(${dy}px)`;
    backdrop.style.opacity = String(Math.max(0.2, 1 - dy / 400));
  };

  const onUp = () => {
    if (!dragging) return;
    dragging = false;
    sheet.classList.remove('is-dragging');
    backdrop.style.opacity = '';
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    if (dy > 110) close();
    else sheet.style.transform = '';
  };

  dragZones.forEach((zone) => zone.addEventListener('pointerdown', (event) => {
    if (!mobile.matches || event.target.closest('button')) return;
    dragging = true;
    startY = event.clientY;
    dy = 0;
    sheet.classList.add('is-dragging');
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }));

  document.body.append(backdrop, sheet);
  lockScroll();
  requestAnimationFrame(() => {
    backdrop.classList.add('is-open');
    sheet.classList.add('is-open');
    const focusTarget = body.querySelector('[autofocus]') || sheet.querySelector('[data-close]');
    focusTarget.focus({ preventScroll: true });
  });

  return {
    sheet,
    body,
    close,
    setBusy(busy) {
      if (!primaryButton) return;
      primaryButton.disabled = busy;
      primaryButton.innerHTML = busy ? '<span class="spinner" aria-hidden="true"></span>' : icon(primary.icon || 'check', 20);
    }
  };
}

/** iOS 스타일 확인 대화상자 → Promise<boolean> */
export function confirmDialog({ title, message = '', confirmLabel = '확인', cancelLabel = '취소', destructive = false }) {
  return new Promise((resolve) => {
    const opener = document.activeElement;
    const backdrop = el('<div class="sheet-backdrop alert-backdrop"></div>');
    const alert = el(`
      <div class="alert glass" role="alertdialog" aria-modal="true" aria-labelledby="alert-title" aria-describedby="alert-message">
        <p class="alert__title" id="alert-title">${escapeHtml(title)}</p>
        <p class="alert__message" id="alert-message">${escapeHtml(message)}</p>
        <div class="alert__actions">
          <button type="button" class="btn" data-answer="no">${escapeHtml(cancelLabel)}</button>
          <button type="button" class="btn ${destructive ? 'btn--danger' : 'btn--tint'}" data-answer="yes">${escapeHtml(confirmLabel)}</button>
        </div>
      </div>`);

    const finish = (answer) => {
      alert.classList.remove('is-open');
      backdrop.classList.remove('is-open');
      document.removeEventListener('keydown', onKey, true);
      setTimeout(() => {
        alert.remove();
        backdrop.remove();
      }, 300);
      if (opener && opener.focus) opener.focus({ preventScroll: true });
      resolve(answer);
    };

    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        finish(false);
      } else {
        trapFocus(alert, event);
      }
    };

    alert.querySelectorAll('[data-answer]').forEach((button) => {
      button.addEventListener('click', () => finish(button.dataset.answer === 'yes'));
    });
    backdrop.addEventListener('click', () => finish(false));
    document.addEventListener('keydown', onKey, true);

    document.body.append(backdrop, alert);
    requestAnimationFrame(() => {
      backdrop.classList.add('is-open');
      alert.classList.add('is-open');
      alert.querySelector('[data-answer="no"]').focus({ preventScroll: true });
    });
  });
}

let toastNode = null;
let toastTimer = 0;

/** 상단 다이내믹 아일랜드 모양 알림 */
export function toast(message, { tone = 'success' } = {}) {
  if (!toastNode) {
    toastNode = el('<div class="toast" role="status" aria-live="polite"></div>');
    document.body.append(toastNode);
  }
  const error = tone === 'error';
  toastNode.className = `toast${error ? ' toast--error' : ''}${message.length > 36 ? ' toast--long' : ''}`;
  toastNode.innerHTML = `<span class="toast__icon">${icon(error ? 'xmark' : 'check', 14)}</span><span>${escapeHtml(message)}</span>`;
  void toastNode.offsetWidth;
  toastNode.classList.add('is-open');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastNode.classList.remove('is-open'), error ? 4200 : 2400);
}

/** 좌우로 밀어서 넘기기 */
export function onSwipe(target, { left, right }) {
  let startX = 0;
  let startY = 0;
  let tracking = false;

  target.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse') return;
    tracking = true;
    startX = event.clientX;
    startY = event.clientY;
  });

  target.addEventListener('pointerup', (event) => {
    if (!tracking) return;
    tracking = false;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    if (dx < 0) left();
    else right();
  });

  target.addEventListener('pointercancel', () => {
    tracking = false;
  });
}

export function renderEmpty({ iconName = 'sparkles', title, text = '' }) {
  return `
    <div class="empty">
      <span class="empty__icon">${icon(iconName, 26)}</span>
      <p class="empty__title">${escapeHtml(title)}</p>
      ${text ? `<p class="empty__text">${escapeHtml(text)}</p>` : ''}
    </div>`;
}

export function renderError(error) {
  return `
    <div class="card glass error-card fade-in" role="alert">
      <div class="empty">
        <span class="empty__icon">${icon('alert', 26)}</span>
        <p class="empty__title">데이터를 불러오지 못했어요</p>
        <p class="empty__text">${escapeHtml(error.message || String(error))}</p>
        <button type="button" class="btn btn--tint" data-retry>${icon('refresh', 18)}다시 시도</button>
      </div>
    </div>`;
}
