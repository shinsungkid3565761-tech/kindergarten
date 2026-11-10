// SF Symbols 느낌의 선형 아이콘 (24×24)

const PATHS = {
  home: '<path d="M3.5 10.6 12 3.8l8.5 6.8"/><path d="M5.8 9v10.2c0 .7.5 1.2 1.2 1.2h3.2v-5.6h3.6v5.6H17c.7 0 1.2-.5 1.2-1.2V9"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="3.2"/><path d="M3.5 9.8h17M8 3v4M16 3v4"/><circle cx="8.2" cy="14" r=".9" fill="currentColor" stroke="none"/><circle cx="12" cy="14" r=".9" fill="currentColor" stroke="none"/><circle cx="15.8" cy="14" r=".9" fill="currentColor" stroke="none"/><circle cx="8.2" cy="17.3" r=".9" fill="currentColor" stroke="none"/><circle cx="12" cy="17.3" r=".9" fill="currentColor" stroke="none"/>',
  list: '<path d="M9 6.5h11M9 12h11M9 17.5h11"/><circle cx="4.8" cy="6.5" r="1.2" fill="currentColor" stroke="none"/><circle cx="4.8" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="4.8" cy="17.5" r="1.2" fill="currentColor" stroke="none"/>',
  meal: '<path d="M7 3v7.2a2 2 0 0 1-2 2V3M7 10.2a2 2 0 0 0 2 2V3M7 12.2V21"/><path d="M17.5 21V3c-2.4 1.2-3.6 4-3.6 7.4 0 1.6.9 2.6 2.2 2.6h1.4"/>',
  bowl: '<path d="M3.5 11h17a8.5 8.5 0 0 1-17 0Z"/><path d="M8.5 7.5c0-1.2 1-1.6 1-2.8M12 7.5c0-1.2 1-1.6 1-2.8M15.5 7.5c0-1.2 1-1.6 1-2.8"/>',
  sunrise: '<path d="M4 17.5h16M7 17.5a5 5 0 0 1 10 0"/><path d="M12 3.5v3M5.6 8.1l1.8 1.8M18.4 8.1l-1.8 1.8M2.5 13.5h2M19.5 13.5h2"/><path d="M8 21h8"/>',
  cookie: '<path d="M20.6 12.6A8.6 8.6 0 1 1 11.4 3.4a3 3 0 0 0 3.6 3.6 3 3 0 0 0 3.6 3.6 3 3 0 0 0 2 2Z"/><circle cx="9" cy="10" r="1" fill="currentColor" stroke="none"/><circle cx="14.5" cy="15" r="1" fill="currentColor" stroke="none"/><circle cx="9.5" cy="15.5" r="1" fill="currentColor" stroke="none"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"/>',
  chevronLeft: '<path d="M14.5 5.5 8 12l6.5 6.5"/>',
  chevronRight: '<path d="M9.5 5.5 16 12l-6.5 6.5"/>',
  chevronDown: '<path d="M5.5 9.5 12 16l6.5-6.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  xmark: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  pencil: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z"/><path d="M13.5 6.5l4 4"/>',
  trash: '<path d="M4.5 6.5h15M9.5 6.5V4.8c0-.7.5-1.3 1.2-1.3h2.6c.7 0 1.2.6 1.2 1.3v1.7M6.5 6.5l.9 12.3c.1 1 .9 1.7 1.8 1.7h5.6c.9 0 1.7-.7 1.8-1.7l.9-12.3"/><path d="M10 10.5v6M14 10.5v6"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.8"/><path d="M8 10.5V7.8a4 4 0 0 1 8 0v2.7"/><circle cx="12" cy="15.5" r="1.3" fill="currentColor" stroke="none"/>',
  logout: '<path d="M14.5 4.5H18c.8 0 1.5.7 1.5 1.5v12c0 .8-.7 1.5-1.5 1.5h-3.5"/><path d="M10 8l-4 4 4 4M6 12h10"/>',
  paste: '<rect x="5" y="5" width="14" height="15.5" rx="2.6"/><path d="M9 5V4.2c0-.7.5-1.2 1.2-1.2h3.6c.7 0 1.2.5 1.2 1.2V5"/><path d="M9 11h6M9 14.5h6M9 18h3.5"/>',
  sparkles: '<path d="M11 3.5l1.6 4.3c.3.8.9 1.4 1.7 1.7L18.5 11l-4.2 1.6c-.8.3-1.4.9-1.7 1.7L11 18.5l-1.6-4.2c-.3-.8-.9-1.4-1.7-1.7L3.5 11l4.2-1.5c.8-.3 1.4-.9 1.7-1.7L11 3.5Z"/><path d="M18.5 15.5l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6.6-1.4Z"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5"/><circle cx="12" cy="7.8" r="1.1" fill="currentColor" stroke="none"/>',
  alert: '<path d="M10.3 4.4 2.9 17.6c-.8 1.3.2 2.9 1.7 2.9h14.8c1.5 0 2.5-1.6 1.7-2.9L13.7 4.4c-.8-1.3-2.6-1.3-3.4 0Z"/><path d="M12 9.5v4.5"/><circle cx="12" cy="17" r="1.1" fill="currentColor" stroke="none"/>',
  refresh: '<path d="M19.5 12a7.5 7.5 0 1 1-2.3-5.4"/><path d="M19.5 4.5v4.2h-4.2"/>',
  external: '<path d="M14 4.5h5.5V10M19.5 4.5 11 13"/><path d="M18 14v4c0 1.1-.9 2-2 2H6c-1.1 0-2-.9-2-2V8c0-1.1.9-2 2-2h4"/>',
  today: '<rect x="3.5" y="5" width="17" height="15.5" rx="3.2"/><path d="M3.5 9.8h17M8 3v4M16 3v4"/><rect x="10" y="12.6" width="4" height="4" rx="1" fill="currentColor" stroke="none"/>',
  table: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.6"/><path d="M3.5 9.5h17M3.5 14.5h17M9.5 9.5v10"/>',
  download: '<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5"/><path d="M4.5 16.5v1.5c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2v-1.5"/>',
  upload: '<path d="M12 15V4M7.5 8.5 12 4l4.5 4.5"/><path d="M4.5 16.5v1.5c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2v-1.5"/>',
  print: '<path d="M7 9V4.5c0-.6.4-1 1-1h8c.6 0 1 .4 1 1V9"/><rect x="3.5" y="9" width="17" height="8" rx="2.4"/><path d="M7 14.5h10V20c0 .6-.4 1-1 1H8c-.6 0-1-.4-1-1v-5.5Z"/><circle cx="17" cy="12" r=".9" fill="currentColor" stroke="none"/>',
  users: '<circle cx="9" cy="8.5" r="3.2"/><path d="M3.5 19.5c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5"/><circle cx="16.8" cy="9.3" r="2.5"/><path d="M15.8 14.7c2.4-.3 4.3 1.2 4.9 4.3"/>',
  copy: '<rect x="8.5" y="8.5" width="11.5" height="11.5" rx="2.4"/><path d="M15.5 8.5V6.4c0-1.3-1.1-2.4-2.4-2.4H6.4C5.1 4 4 5.1 4 6.4v6.7c0 1.3 1.1 2.4 2.4 2.4h2.1"/>',
  // 날씨
  sun: '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.8v2.1M12 19.1v2.1M2.8 12h2.1M19.1 12h2.1M5.5 5.5 7 7M17 17l1.5 1.5M5.5 18.5 7 17M17 7l1.5-1.5"/>',
  partly: '<path d="M9 3.2v1.5M3.4 8.8h1.5M5 4.8l1 1M13 4.8l-1 1"/><path d="M5.9 11.3A3.4 3.4 0 0 1 12 8.4"/><path d="M9.2 19.8h8.4a3.4 3.4 0 0 0 .3-6.8 4.7 4.7 0 0 0-9.1 1.1 2.9 2.9 0 0 0 .4 5.7Z"/>',
  moonCloud: '<path d="M12.6 7.6A4.2 4.2 0 0 1 7.3 3.4a4.4 4.4 0 0 0-1.9 7.7"/><path d="M9.2 19.8h8.4a3.4 3.4 0 0 0 .3-6.8 4.7 4.7 0 0 0-9.1 1.1 2.9 2.9 0 0 0 .4 5.7Z"/>',
  cloud: '<path d="M7.4 18.6h10a4 4 0 0 0 .4-8 5.6 5.6 0 0 0-10.8 1.3 3.4 3.4 0 0 0 .4 6.7Z"/>',
  rain: '<path d="M7.4 14.6h10a3.8 3.8 0 0 0 .4-7.6 5.4 5.4 0 0 0-10.5 1.3 3.2 3.2 0 0 0 .1 6.3Z"/><path d="M8.6 17.6 7.6 20M12.6 17.6l-1 2.4M16.6 17.6l-1 2.4"/>',
  snow: '<path d="M7.4 14.6h10a3.8 3.8 0 0 0 .4-7.6 5.4 5.4 0 0 0-10.5 1.3 3.2 3.2 0 0 0 .1 6.3Z"/><circle cx="8.5" cy="18.4" r=".95" fill="currentColor" stroke="none"/><circle cx="12.3" cy="20" r=".95" fill="currentColor" stroke="none"/><circle cx="16" cy="18.4" r=".95" fill="currentColor" stroke="none"/>',
  storm: '<path d="M7.4 14.6h10a3.8 3.8 0 0 0 .4-7.6 5.4 5.4 0 0 0-10.5 1.3 3.2 3.2 0 0 0 .1 6.3Z"/><path d="M12.8 15.6 11 18.6h2.6l-1.8 3"/>',
  fog: '<path d="M4 8.5h16M6.5 12.5h11M4 16.5h16"/>',
  // 옷차림 · 준비물
  umbrella: '<path d="M3.2 12.2a8.8 8.8 0 0 1 17.6 0Z"/><path d="M12 12.2v6.3a2 2 0 0 1-4 0M12 3.4v-.6"/>',
  jacket: '<path d="M9 3.6 12 6l3-2.4 4.3 2.2 1.2 5.2-2.5.9V20h-12v-8.1l-2.5-.9 1.2-5.2L9 3.6Z"/><path d="M12 6v14M9.5 14.5h-1M15.5 14.5h-1"/>',
  shirt: '<path d="M8.8 4.2 4.3 6.6l1.6 3.9 2.3-.9V19.8h7.6V9.6l2.3.9 1.6-3.9-4.5-2.4a3.2 3.2 0 0 1-6.4 0Z"/>',
  mask: '<path d="M5 9c2.2-1.1 4.6-1.7 7-1.7s4.8.6 7 1.7v4.5c-2.1 1.9-4.5 3-7 3s-4.9-1.1-7-3V9Z"/><path d="M5 10H3.3c0 1.9.7 3 1.9 3.4M19 10h1.7c0 1.9-.7 3-1.9 3.4M8.6 10.8h6.8M9 13.3h6"/>',
  mitten: '<path d="M8.3 20.5h7.4v-3.2l2.9-5.2a1.8 1.8 0 0 0-3.1-1.8l-1 1.6V6.6a3.4 3.4 0 0 0-6.8 0v7.6c0 .8.2 1.5.6 2.1v4.2Z"/><path d="M8.3 17.5h7.4"/>',
  layers: '<path d="M12 4 3.8 8.3 12 12.6l8.2-4.3L12 4Z"/><path d="M3.8 12.2 12 16.5l8.2-4.3M3.8 16 12 20.3l8.2-4.3"/>',
  snowflake: '<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9"/><path d="M9.8 4.6 12 6l2.2-1.4M9.8 19.4 12 18l2.2 1.4"/>',
  wind: '<path d="M3.5 9.2h10.8a2.6 2.6 0 1 0-2.6-2.6"/><path d="M3.5 13.2h14.3a2.6 2.6 0 1 1-2.6 2.6"/><path d="M3.5 17.2h6.5"/>',
};

export function icon(name, size = 22, extraClass = '') {
  const body = PATHS[name] || PATHS.info;
  const cls = extraClass ? ` class="${extraClass}"` : '';
  return `<svg${cls} width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
}
