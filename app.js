import { createBackend, ops, isDemo } from './store.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDate = (t) => new Date(t).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });
const fmtShort = (t) => new Date(t).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' });
const fmtTime = (t) => new Date(t).toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' });
const sameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();

let be;
let user = null;
let state = null;
let tab = 'board';
let unsubscribe = null;
let initRequested = false;
let knownStickers = null; // 새로 붙은 스티커만 애니메이션하려고 기억
let settingsDirty = false;

const app = $('#app');

// ---------- 시작 ----------

(async () => {
  try {
    be = await createBackend();
  } catch (e) {
    console.error(e);
    return showMessage('😵', 'Firebase를 불러오지 못했어요', '인터넷 연결을 확인하고 새로고침해 주세요.');
  }
  be.onAuth((u) => {
    user = u;
    unsubscribe?.();
    unsubscribe = null;
    state = null;
    knownStickers = null;
    if (!u) return showLogin();
    showMessage('⏳', '스티커판을 불러오는 중…');
    unsubscribe = be.subscribe(onState, onSubscribeError);
  });
})();

function onState(s) {
  if (!s.settings) {
    if (!initRequested) {
      initRequested = true;
      act(() => be.run(ops.init));
    }
    return;
  }
  state = s;
  render();
}

function onSubscribeError(e) {
  console.error(e);
  if (e.code === 'permission-denied') {
    showMessage('🔒', '허용되지 않은 계정이에요',
      `${esc(user?.email)} 계정은 이 스티커판을 볼 수 없어요. 가족 계정으로 다시 로그인해 주세요.`, true);
  } else {
    showMessage('😵', '데이터를 불러오지 못했어요', esc(e.message), true);
  }
}

async function act(fn) {
  try {
    return await fn();
  } catch (e) {
    console.error(e);
    toast(e.code === 'permission-denied' ? '권한이 없어요. 가족 계정으로 로그인해 주세요.' : e.message || '문제가 생겼어요.');
  }
}

// ---------- 공통 화면 ----------

function showMessage(icon, title, body = '', withLogout = false) {
  app.innerHTML = `
    <div class="center-screen">
      <div class="big-emoji">${icon}</div>
      <h1 class="display">${title}</h1>
      ${body ? `<p class="muted">${body}</p>` : ''}
      ${withLogout ? '<button class="btn ghost" data-action="logout">로그아웃</button>' : ''}
    </div>`;
}

function showLogin() {
  app.innerHTML = `
    <div class="center-screen">
      <div class="big-emoji">⭐</div>
      <h1 class="display">칭찬 스티커판</h1>
      <p class="muted">가족 구글 계정으로 로그인해 주세요.<br>한 번 로그인하면 이 기기에서는 계속 유지돼요.</p>
      <button class="btn primary big" data-action="login">
        <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2c-2 1.5-4.5 2.4-7.2 2.4-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
        구글로 로그인
      </button>
    </div>`;
}

function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { el.hidden = true; }, 2600);
}

// ---------- 데이터 도우미 ----------

const currentBoard = () => state.boards.find((b) => b.no === state.settings.currentBoard);
const boardStickers = (no) => state.stickers.filter((s) => s.board === no);
const activeMissions = () => state.settings.missions.filter((m) => !m.hidden);

function missionCounts(stickers) {
  const map = new Map();
  for (const s of stickers) {
    const key = s.mission;
    const e = map.get(key) || { emoji: s.emoji, name: s.name, n: 0 };
    e.n++;
    map.set(key, e);
  }
  return [...map.values()].sort((a, b) => b.n - a.n);
}

// ---------- 메인 렌더 ----------

function render() {
  if (!state) return;
  if (tab === 'settings' && settingsDirty && app.querySelector('.settings-view')) return;
  const s = state.settings;
  const b = currentBoard();
  if (!b) return;

  const fresh = new Set();
  const ids = new Set(state.stickers.map((x) => x.id));
  if (knownStickers) for (const id of ids) if (!knownStickers.has(id)) fresh.add(id);
  knownStickers = ids;

  const views = { board: viewBoard, history: viewHistory, settings: viewSettings };
  app.innerHTML = `
    ${isDemo ? '<div class="demo-banner">체험 모드: 이 기기 브라우저에만 저장돼요. Firebase를 연결하면 가족이 함께 볼 수 있어요.</div>' : ''}
    <header class="top">
      <h1 class="display">${esc(s.childName)}의 칭찬 스티커</h1>
      <div class="sub">${b.no}번째 판 · ${b.count} / ${b.size}</div>
    </header>
    <main class="view">${views[tab](fresh)}</main>
    <nav class="tabs">
      ${tabBtn('board', '⭐', '스티커판')}
      ${tabBtn('history', '📅', '기록')}
      ${tabBtn('settings', '⚙️', '설정')}
    </nav>`;
}

const tabBtn = (id, icon, label) =>
  `<button class="tab ${tab === id ? 'on' : ''}" data-action="tab" data-tab="${id}"><span>${icon}</span>${label}</button>`;

function viewBoard(fresh) {
  const b = currentBoard();
  const stickers = boardStickers(b.no);
  const left = b.size - b.count;
  const done = !!b.completedAt;
  const today = state.stickers.filter((x) => sameDay(x.at, Date.now()));
  const pct = Math.round((b.count / b.size) * 100);

  let cells = '';
  for (let i = 0; i < b.size; i++) {
    const st = stickers[i];
    if (st) cells += `<div class="cell filled ${fresh.has(st.id) ? 'pop' : ''}" title="${esc(st.name)} · ${fmtShort(st.at)}">${esc(st.emoji)}</div>`;
    else cells += `<div class="cell ${i === b.count ? 'next' : ''}">${i + 1}</div>`;
  }

  return `
    <section class="reward card">
      <div class="reward-icon">🎁</div>
      <div class="reward-body">
        <div class="reward-label">다 모으면</div>
        <div class="reward-text">${esc(b.reward)}</div>
        <div class="bar"><div style="width:${pct}%"></div></div>
        <div class="reward-left">${done ? '🎉 다 모았어요!' : `${left}개 남았어요!`}</div>
      </div>
    </section>

    <section class="board card ${done ? 'done' : ''}">
      <div class="grid" style="--cols:${gridCols(b.size)}">${cells}</div>
    </section>

    ${done
      ? `<button class="btn primary big wide" data-action="new-board">🎉 새 스티커판 시작하기</button>`
      : `<button class="btn primary big wide" data-action="open-sheet">⭐ 스티커 붙이기</button>`}

    <section class="today">
      <span class="muted">오늘 붙인 스티커</span>
      <span class="today-list">${today.length ? today.map((x) => `<span title="${esc(x.name)}">${esc(x.emoji)}</span>`).join('') : '<span class="muted">아직 없어요</span>'}</span>
    </section>`;
}

// 30칸은 6×5, 40칸은 5×8처럼 마지막 줄이 꽉 차는 칸 수를 고름
const gridCols = (size) => (size % 6 === 0 && size <= 36 ? 6 : size % 5 === 0 ? 5 : 6);

function viewHistory() {
  const b = currentBoard();
  const stickers = boardStickers(b.no);
  const counts = missionCounts(stickers);
  const max = Math.max(1, ...counts.map((c) => c.n));

  // 이번 판 기록: 날짜별로 묶어서 최신순
  const byDay = [];
  for (const st of [...stickers].reverse()) {
    const last = byDay[byDay.length - 1];
    if (last && sameDay(last.at, st.at)) last.items.push(st);
    else byDay.push({ at: st.at, items: [st] });
  }

  const past = state.boards.filter((x) => x.no !== b.no || x.completedAt).filter((x) => x.completedAt).reverse();

  return `
    <section class="card">
      <h2 class="display h2">이번 판 미션</h2>
      ${counts.length ? counts.map((c) => `
        <div class="stat-row">
          <span class="stat-emoji">${esc(c.emoji)}</span>
          <span class="stat-name">${esc(c.name)}</span>
          <span class="stat-bar"><span style="width:${(c.n / max) * 100}%"></span></span>
          <span class="stat-n">${c.n}</span>
        </div>`).join('') : '<p class="muted">아직 붙인 스티커가 없어요.</p>'}
    </section>

    <section class="card">
      <h2 class="display h2">이번 판 기록</h2>
      ${byDay.length ? byDay.map((d) => `
        <div class="day">
          <div class="day-title">${fmtDate(d.at)}</div>
          ${d.items.map((st) => `
            <div class="log-row">
              <span class="log-emoji">${esc(st.emoji)}</span>
              <span class="log-name">${esc(st.name)}</span>
              <span class="log-time muted">${fmtTime(st.at)}</span>
              <button class="btn tiny ghost" data-action="delete" data-id="${esc(st.id)}" aria-label="스티커 지우기">지우기</button>
            </div>`).join('')}
        </div>`).join('') : '<p class="muted">기록이 없어요.</p>'}
    </section>

    <section class="card">
      <h2 class="display h2">완성한 스티커판 <span class="pill">${past.length}장</span></h2>
      ${past.length ? past.map((p) => `
        <div class="past">
          <div class="past-head">
            <strong>${p.no}번째 판</strong>
            <span class="muted">${fmtShort(p.startedAt)} ~ ${fmtShort(p.completedAt)}</span>
          </div>
          <div class="past-reward">🎁 ${esc(p.reward)}</div>
          <div class="past-emojis">${missionCounts(boardStickers(p.no)).map((c) => `<span>${esc(c.emoji)}×${c.n}</span>`).join('')}</div>
          <label class="check">
            <input type="checkbox" data-action="reward-given" data-no="${p.no}" ${p.rewardGiven ? 'checked' : ''}>
            보상 줬어요
          </label>
        </div>`).join('') : '<p class="muted">첫 번째 판을 완성하면 여기에 쌓여요.</p>'}
      <p class="muted small">지금까지 붙인 스티커: 모두 ${state.stickers.length}개</p>
    </section>`;
}

function viewSettings() {
  const s = state.settings;
  const b = currentBoard();
  return `
    <form class="settings-view" data-form="settings">
      <section class="card">
        <h2 class="display h2">기본 설정</h2>
        <label class="field">아이 이름
          <input name="childName" value="${esc(s.childName)}" maxlength="20" required>
        </label>
        <label class="field">이번 판(${b.no}번째) 보상
          <input name="currentReward" value="${esc(b.reward)}" maxlength="60">
        </label>
        <label class="field">이번 판 칸 수
          <input name="currentSize" type="number" min="${Math.max(5, b.count)}" max="60" value="${b.size}">
          <span class="muted small">붙인 스티커는 그대로 남아요. 이미 붙인 ${b.count}개보다 적게는 못 줄여요.</span>
        </label>
        <label class="field">새 판의 기본 보상
          <input name="defaultReward" value="${esc(s.defaultReward)}" maxlength="60">
        </label>
        <label class="field">새 판의 칸 수
          <input name="boardSize" type="number" min="5" max="60" value="${s.boardSize}">
          <span class="muted small">다음 판부터 이 칸 수로 시작해요.</span>
        </label>
      </section>

      <section class="card">
        <h2 class="display h2">미션 스티커</h2>
        <p class="muted small">이모지와 이름을 바꿀 수 있어요. 숨긴 미션은 스티커 붙이기 목록에 안 나와요.</p>
        <div class="missions">${s.missions.map(missionRow).join('')}</div>
        <button type="button" class="btn ghost wide" data-action="add-mission">＋ 미션 추가</button>
      </section>

      <div class="save-bar"><button class="btn primary big wide" type="submit">저장하기</button></div>

      <section class="card">
        <h2 class="display h2">계정 · 백업</h2>
        <p class="muted small">${isDemo ? '체험 모드로 사용 중이에요.' : `로그인: ${esc(user?.email)}`}</p>
        <button type="button" class="btn ghost wide" data-action="backup">📦 백업 파일 내려받기 (JSON)</button>
        ${isDemo ? '' : '<button type="button" class="btn ghost wide" data-action="logout">로그아웃</button>'}
      </section>
    </form>`;
}

const missionRow = (m) => `
  <div class="mission-row" data-id="${esc(m.id)}">
    <input class="m-emoji" value="${esc(m.emoji)}" maxlength="4" aria-label="이모지">
    <input class="m-name" value="${esc(m.name)}" maxlength="20" aria-label="미션 이름">
    <label class="check small"><input type="checkbox" class="m-hidden" ${m.hidden ? 'checked' : ''}>숨김</label>
  </div>`;

// ---------- 스티커 고르기 시트 ----------

function openSheet() {
  const sheet = $('#sheet');
  sheet.innerHTML = `
    <div class="sheet-backdrop" data-action="close-sheet"></div>
    <div class="sheet-panel" role="dialog" aria-label="스티커 고르기">
      <div class="sheet-handle"></div>
      <h2 class="display h2">어떤 미션을 했나요?</h2>
      <div class="mission-grid">
        ${activeMissions().map((m) => `
          <button class="mission" data-action="pick" data-id="${esc(m.id)}">
            <span class="mission-emoji">${esc(m.emoji)}</span>
            <span class="mission-name">${esc(m.name)}</span>
          </button>`).join('')}
      </div>
      <button class="btn ghost wide" data-action="close-sheet">닫기</button>
    </div>`;
  sheet.hidden = false;
}

const closeSheet = () => { $('#sheet').hidden = true; };

async function pick(id) {
  const m = state.settings.missions.find((x) => x.id === id);
  if (!m) return;
  closeSheet();
  const res = await act(() => be.run((tx) => ops.addSticker(tx, m)));
  if (!res) return;
  if (res.completed) celebrate();
  else toast(`${m.emoji} ${m.name} 스티커를 붙였어요!`);
}

function celebrate() {
  const b = currentBoard();
  const el = $('#celebrate');
  const bits = ['⭐', '🎉', '✨', '🌟', '🎊'];
  let rain = '';
  for (let i = 0; i < 40; i++) {
    rain += `<span class="confetti" style="left:${Math.random() * 100}%;animation-delay:${Math.random() * 1.2}s;animation-duration:${2 + Math.random() * 1.5}s">${bits[i % bits.length]}</span>`;
  }
  el.innerHTML = `
    ${rain}
    <div class="celebrate-card">
      <div class="big-emoji">🏆</div>
      <h2 class="display">${b.size}칸 다 채웠어!</h2>
      <p>${esc(state.settings.childName)}, 정말 잘했어요!</p>
      <p class="reward-text">🎁 ${esc(b.reward)}</p>
      <button class="btn primary big wide" data-action="close-celebrate">야호!</button>
    </div>`;
  el.hidden = false;
}

async function newBoard() {
  const reward = prompt('다음 판을 다 채우면 받을 보상은?', state.settings.defaultReward);
  if (reward === null) return;
  await act(() => be.run((tx) => ops.startNewBoard(tx, reward.trim())));
  toast('새 스티커판이 시작됐어요! 화이팅!');
}

// ---------- 설정 저장 ----------

function collectMissions() {
  return [...document.querySelectorAll('.mission-row')]
    .map((row) => ({
      id: row.dataset.id,
      emoji: row.querySelector('.m-emoji').value.trim(),
      name: row.querySelector('.m-name').value.trim(),
      hidden: row.querySelector('.m-hidden').checked,
    }))
    .filter((m) => m.emoji && m.name);
}

async function saveSettings(form) {
  const fd = new FormData(form);
  const missions = collectMissions();
  if (!missions.some((m) => !m.hidden)) return toast('보이는 미션이 하나는 있어야 해요.');
  const clampSize = (v) => Math.min(60, Math.max(5, parseInt(v, 10) || 30));
  const settings = {
    childName: fd.get('childName').trim() || '우리 아이',
    defaultReward: fd.get('defaultReward').trim(),
    boardSize: clampSize(fd.get('boardSize')),
    missions,
  };
  const current = { reward: fd.get('currentReward').trim(), size: clampSize(fd.get('currentSize')) };
  const res = await act(() => be.run((tx) => ops.saveSettings(tx, settings, current)));
  if (res) {
    settingsDirty = false;
    toast('저장했어요!');
    render();
    if (res.completed) celebrate();
  }
}

function backup() {
  const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), ...state }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `칭찬스티커-백업-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---------- 이벤트 ----------

document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const a = el.dataset.action;
  if (a === 'reward-given') return; // change 이벤트에서 처리
  switch (a) {
    case 'login': return act(() => be.signIn());
    case 'logout': return act(() => be.signOut());
    case 'tab':
      if (tab === 'settings' && settingsDirty && !confirm('저장하지 않은 설정이 있어요. 나갈까요?')) return;
      settingsDirty = false;
      tab = el.dataset.tab;
      window.scrollTo(0, 0);
      return render();
    case 'open-sheet': return openSheet();
    case 'close-sheet': return closeSheet();
    case 'pick': return pick(el.dataset.id);
    case 'close-celebrate': $('#celebrate').hidden = true; return;
    case 'new-board': return newBoard();
    case 'delete': {
      const st = state.stickers.find((x) => x.id === el.dataset.id);
      if (st && confirm(`${fmtDate(st.at)} ${st.emoji} ${st.name} 스티커를 지울까요?`)) {
        await act(() => be.run((tx) => ops.deleteSticker(tx, st.id)));
      }
      return;
    }
    case 'add-mission': {
      settingsDirty = true;
      const wrap = document.querySelector('.missions');
      wrap.insertAdjacentHTML('beforeend', missionRow({ id: 'm' + Date.now().toString(36), emoji: '⭐', name: '' }));
      wrap.lastElementChild.querySelector('.m-name').focus();
      return;
    }
    case 'backup': return backup();
  }
});

document.addEventListener('change', (e) => {
  const el = e.target;
  if (el.dataset.action === 'reward-given') {
    act(() => be.run((tx) => ops.setRewardGiven(tx, Number(el.dataset.no), el.checked)));
  }
});

document.addEventListener('input', (e) => {
  if (e.target.closest('.settings-view')) settingsDirty = true;
});

document.addEventListener('submit', (e) => {
  if (e.target.dataset.form === 'settings') {
    e.preventDefault();
    saveSettings(e.target);
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { closeSheet(); $('#celebrate').hidden = true; }
});
