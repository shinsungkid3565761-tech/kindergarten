// 사이트 설정
// Apps Script를 새 버전으로 배포했는데 주소(…/exec)가 바뀌었다면 API_URL만 고치면 됩니다.
// API_URL을 비워 두거나 주소 뒤에 ?demo 를 붙이면 예시 데이터로 화면을 미리 볼 수 있습니다.

export const CONFIG = {
  SCHOOL_NAME: '신성대학교부속유치원',
  API_URL: 'https://script.google.com/macros/s/AKfycbzEZdp7At-kBdoTcDuQZWYO9cPpuaegPGUeooEGDfytBT3ZhZPNwghviINdR20o4OXk8A/exec',
  REQUEST_TIMEOUT_MS: 20000,

  // 오늘 화면 날씨 · 미세먼지 위치 (Open-Meteo 무료 예보, 키 필요 없음)
  WEATHER: { PLACE: '당진', LATITUDE: 36.8897, LONGITUDE: 126.6458 },

  // 이 시각(24시간제)부터는 '오늘' 대신 '내일' 일정 · 옷차림을 먼저 알려 줍니다.
  TOMORROW_FROM_HOUR: 14
};
