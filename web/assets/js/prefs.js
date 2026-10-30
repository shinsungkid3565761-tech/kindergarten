// 학부모가 고른 설정(우리 아이 알레르기, 우리 반)은 그 기기에만 저장합니다.

const KEYS = {
  allergens: 'kg-my-allergens',
  myClass: 'kg-my-class'
};

function read(key) {
  try {
    return localStorage.getItem(key);
  } catch (err) {
    return null;
  }
}

function write(key, value) {
  try {
    if (value == null || value === '') localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch (err) {
    // 저장할 수 없는 환경(개인정보 보호 모드 등)에서는 이번 방문에만 적용됩니다.
  }
}

let allergensCache = null;
let myClassCache = null;

export const prefs = {
  /** 우리 아이 알레르기 번호 (1~19) */
  get allergens() {
    if (!allergensCache) {
      try {
        const list = JSON.parse(read(KEYS.allergens) || '[]');
        allergensCache = Array.isArray(list) ? list.map(Number).filter((n) => n >= 1 && n <= 19) : [];
      } catch (err) {
        allergensCache = [];
      }
    }
    return allergensCache;
  },

  set allergens(list) {
    allergensCache = [...new Set(list)].sort((a, b) => a - b);
    write(KEYS.allergens, allergensCache.length ? JSON.stringify(allergensCache) : null);
  },

  /** 우리 반 이름 ('' = 전체) */
  get myClass() {
    if (myClassCache === null) myClassCache = read(KEYS.myClass) || '';
    return myClassCache;
  },

  set myClass(name) {
    myClassCache = name || '';
    write(KEYS.myClass, myClassCache);
  }
};
