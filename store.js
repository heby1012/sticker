import { firebaseConfig } from './firebase-config.js';

const FIREBASE_VERSION = '10.12.2';

export const DEFAULT_MISSIONS = [
  { id: 'english', emoji: '📚', name: '영어책 읽기' },
  { id: 'soccer', emoji: '⚽', name: '축구 미션' },
  { id: 'basketball', emoji: '🏀', name: '농구 미션' },
  { id: 'korean', emoji: '📖', name: '한글책 읽기' },
  { id: 'jumprope', emoji: '🤸', name: '줄넘기 100개' },
  { id: 'math', emoji: '✏️', name: '수학 한 장' },
  { id: 'music', emoji: '🎹', name: '악기 연습' },
  { id: 'tidy', emoji: '🧹', name: '내 방 정리' },
  { id: 'kind', emoji: '💪', name: '착한 일 · 스스로 한 일' },
];

export const DEFAULT_SETTINGS = {
  childName: '유찬',
  boardSize: 30,
  defaultReward: '닌텐도 게임 또는 갖고 싶은 것 (3만원+)',
  currentBoard: 1,
  missions: DEFAULT_MISSIONS,
};

export const isDemo = !firebaseConfig.apiKey || firebaseConfig.apiKey.startsWith('YOUR_');

function newBoard(no, size, reward) {
  return { no, size, reward, count: 0, startedAt: Date.now(), completedAt: null, rewardGiven: false };
}

// 모든 변경은 트랜잭션 함수로 작성해서 Firestore와 체험 모드가 같은 로직을 써요.
// tx: get(path) / set(path, data) / update(path, data) / delete(path) / newId()
// Firestore 규칙상 읽기를 모두 끝낸 뒤에 쓰기를 해야 해요.
export const ops = {
  async init(tx) {
    if (await tx.get('settings/main')) return;
    tx.set('settings/main', DEFAULT_SETTINGS);
    tx.set('boards/1', newBoard(1, DEFAULT_SETTINGS.boardSize, DEFAULT_SETTINGS.defaultReward));
  },

  async addSticker(tx, mission) {
    const s = await tx.get('settings/main');
    const path = `boards/${s.currentBoard}`;
    const b = await tx.get(path);
    if (!b || b.completedAt) throw new Error('이 판은 이미 다 채웠어요.');
    const id = tx.newId();
    const count = b.count + 1;
    const completed = count >= b.size;
    tx.set(`stickers/${id}`, { board: b.no, mission: mission.id, emoji: mission.emoji, name: mission.name, at: Date.now() });
    tx.update(path, { count, completedAt: completed ? Date.now() : null });
    return { id, completed };
  },

  async deleteSticker(tx, id) {
    const st = await tx.get(`stickers/${id}`);
    if (!st) return;
    const s = await tx.get('settings/main');
    if (st.board !== s.currentBoard) throw new Error('지난 판의 스티커는 지울 수 없어요.');
    const path = `boards/${st.board}`;
    const b = await tx.get(path);
    tx.delete(`stickers/${id}`);
    tx.update(path, { count: Math.max(0, b.count - 1), completedAt: null });
  },

  async startNewBoard(tx, reward) {
    const s = await tx.get('settings/main');
    const b = await tx.get(`boards/${s.currentBoard}`);
    if (!b.completedAt) throw new Error('아직 판을 다 채우지 않았어요.');
    const no = s.currentBoard + 1;
    tx.set(`boards/${no}`, newBoard(no, s.boardSize, reward || s.defaultReward));
    tx.update('settings/main', { currentBoard: no });
  },

  async saveSettings(tx, settings, currentReward) {
    const s = await tx.get('settings/main');
    tx.update('settings/main', settings);
    if (currentReward != null) tx.update(`boards/${s.currentBoard}`, { reward: currentReward });
  },

  async setRewardGiven(tx, no, given) {
    tx.update(`boards/${no}`, { rewardGiven: given });
  },
};

export async function createBackend() {
  return isDemo ? localBackend() : firestoreBackend();
}

async function firestoreBackend() {
  const base = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}`;
  const [{ initializeApp }, A, F] = await Promise.all([
    import(`${base}/firebase-app.js`),
    import(`${base}/firebase-auth.js`),
    import(`${base}/firebase-firestore.js`),
  ]);
  const app = initializeApp(firebaseConfig);
  const auth = A.getAuth(app);
  const db = F.getFirestore(app);
  const ref = (p) => F.doc(db, p);

  return {
    onAuth: (cb) => A.onAuthStateChanged(auth, cb),
    async signIn() {
      const provider = new A.GoogleAuthProvider();
      try {
        await A.signInWithPopup(auth, provider);
      } catch (e) {
        if (e.code === 'auth/popup-blocked') await A.signInWithRedirect(auth, provider);
        else if (e.code !== 'auth/popup-closed-by-user' && e.code !== 'auth/cancelled-popup-request') throw e;
      }
    },
    signOut: () => A.signOut(auth),
    run: (fn) => F.runTransaction(db, (t) => fn({
      get: async (p) => { const snap = await t.get(ref(p)); return snap.exists() ? snap.data() : null; },
      set: (p, d) => t.set(ref(p), d),
      update: (p, d) => t.update(ref(p), d),
      delete: (p) => t.delete(ref(p)),
      newId: () => F.doc(F.collection(db, 'stickers')).id,
    })),
    subscribe(cb, onError) {
      let settings, boards, stickers;
      const emit = () => { if (settings !== undefined && boards && stickers) cb({ settings, boards, stickers }); };
      const unsubs = [
        F.onSnapshot(ref('settings/main'), (s) => { settings = s.exists() ? s.data() : null; emit(); }, onError),
        F.onSnapshot(F.collection(db, 'boards'), (q) => {
          boards = q.docs.map((d) => d.data()).sort((a, b) => a.no - b.no); emit();
        }, onError),
        F.onSnapshot(F.query(F.collection(db, 'stickers'), F.orderBy('at')), (q) => {
          stickers = q.docs.map((d) => ({ id: d.id, ...d.data() })); emit();
        }, onError),
      ];
      return () => unsubs.forEach((u) => u());
    },
  };
}

function localBackend() {
  const KEY = 'sticker-board-demo';
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
  let data = load();
  const subs = new Set();

  const snapshot = () => {
    const boards = [], stickers = [];
    for (const [p, v] of Object.entries(data)) {
      if (p.startsWith('boards/')) boards.push(v);
      else if (p.startsWith('stickers/')) stickers.push({ id: p.slice('stickers/'.length), ...v });
    }
    boards.sort((a, b) => a.no - b.no);
    stickers.sort((a, b) => a.at - b.at);
    return { settings: data['settings/main'] || null, boards, stickers };
  };
  const notify = () => { const s = snapshot(); subs.forEach((cb) => cb(s)); };

  // 같은 기기의 다른 탭에서 바꾼 내용도 반영
  window.addEventListener('storage', (e) => { if (e.key === KEY) { data = load(); notify(); } });

  return {
    onAuth(cb) { cb({ email: '체험 모드', demo: true }); return () => {}; },
    async signIn() {},
    async signOut() {},
    async run(fn) {
      const draft = structuredClone(data);
      const result = await fn({
        get: async (p) => (draft[p] ? structuredClone(draft[p]) : null),
        set: (p, d) => { draft[p] = structuredClone(d); },
        update: (p, d) => { draft[p] = { ...draft[p], ...structuredClone(d) }; },
        delete: (p) => { delete draft[p]; },
        newId: () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36),
      });
      data = draft;
      try { localStorage.setItem(KEY, JSON.stringify(data)); } catch {}
      notify();
      return result;
    },
    subscribe(cb) { subs.add(cb); cb(snapshot()); return () => subs.delete(cb); },
  };
}
