// Claude Office 사무실 렌더러 (Pixel Agents 스프라이트 사용)
// app.js가 start()로 캔버스를 붙이고, applySnapshot()으로 세션 목록을 넘겨준다.
// ======================================================================
//  사무실 지도 (16px 타일)
//  # 벽 · L 자료실 · D 작업실 · S 서버실 · H 복도 · O 라운지 · C 통신실 · E 엘리베이터 로비
// ======================================================================
const T = 16, COLS = 40, ROWS = 26, WW = COLS * T, WH = ROWS * T;
const MAP = [];
const addRow = s => MAP.push(s.split(''));
addRow(' '.repeat(COLS));
addRow('#'.repeat(COLS));
for (let i = 0; i < 10; i++) addRow('#' + 'L'.repeat(12) + '#' + 'D'.repeat(13) + '#' + 'S'.repeat(11) + '#');
addRow('#'.repeat(COLS));
for (let i = 0; i < 3; i++) addRow('#' + 'H'.repeat(38) + '#');
addRow('#'.repeat(COLS));
for (let i = 0; i < 9; i++) addRow('#' + 'O'.repeat(16) + '#' + 'C'.repeat(13) + '#' + 'E'.repeat(7) + '#');
const TOP_DOORS = [6, 7, 20, 21, 33, 34], BOTTOM_DOORS = [8, 9, 24, 25, 33];
for (const c of TOP_DOORS) MAP[12][c] = 'H';
for (const c of BOTTOM_DOORS) MAP[16][c] = 'H';

const ROOM_NAMES = { L: '📚 자료실', D: '⌨️ 작업실', S: '🖥 서버실', O: '☕ 라운지', C: '📡 통신실', E: '🛗 엘리베이터' };
// 문 위에 거는 방 이름표 (월드 좌표)
const SIGNS = [
  { room: 'L', x: 7 * T, y: 12 * T - 4 }, { room: 'D', x: 21 * T, y: 12 * T - 4 }, { room: 'S', x: 34 * T, y: 12 * T - 4 },
  { room: 'O', x: 9 * T, y: 16 * T - 4 }, { room: 'C', x: 25 * T, y: 16 * T - 4 }, { room: 'E', x: 36.5 * T, y: 15 * T - 6 },
];
// 바닥 무늬(floor_N.png)와 색 — Pixel Agents의 Colorize 방식
const FLOORS = {
  L: { p: 6, c: { h: 25, s: 48, b: -43, c: -88 } },
  D: { p: 0, c: { h: 209, s: 39, b: -25, c: -80 } },
  S: { p: 2, c: { h: 225, s: 16, b: -52, c: -55 } },
  H: { p: 3, c: { h: 35, s: 12, b: -12, c: -55 } },
  O: { p: 5, c: { h: 14, s: 42, b: -28, c: -75 } },
  C: { p: 0, c: { h: 168, s: 32, b: -32, c: -80 } },
  E: { p: 1, c: { h: 40, s: 10, b: -8, c: -55 } },
};
const WALL_COLOR = { h: 214, s: 30, b: -100, c: -55 };

// 가구 카탈로그: [가로, 세로, 배경행(통과 가능), 종류, 방향]
const CAT = {
  DESK_FRONT: [3, 2, 1, 'desk'], TABLE_FRONT: [3, 4, 1, 'desk'], SMALL_TABLE_FRONT: [2, 2, 1, 'desk'], COFFEE_TABLE: [2, 2, 0, 'desk'],
  PC_FRONT: [1, 2, 1, 'surf'], PC_SIDE: [1, 2, 1, 'surf'], PC_BACK: [1, 2, 1, 'surf'], COFFEE: [1, 1, 0, 'surf'],
  CUSHIONED_BENCH: [1, 1, 0, 'chair'], WOODEN_BENCH: [1, 1, 0, 'chair'],
  WOODEN_CHAIR_SIDE: [1, 2, 1, 'chair', 'side'], WOODEN_CHAIR_BACK: [1, 2, 1, 'chair', 'back'], WOODEN_CHAIR_FRONT: [1, 2, 1, 'chair', 'front'],
  SOFA_FRONT: [2, 1, 0, 'chair', 'front'], SOFA_BACK: [2, 1, 0, 'chair', 'back'], SOFA_SIDE: [1, 2, 0, 'chair', 'side'],
  DOUBLE_BOOKSHELF: [2, 2, 0, 'wall'], BOOKSHELF: [2, 1, 0, 'wall'], WHITEBOARD: [2, 2, 0, 'wall'], CLOCK: [1, 2, 0, 'wall'],
  LARGE_PAINTING: [2, 2, 0, 'wall'], SMALL_PAINTING: [1, 2, 0, 'wall'], SMALL_PAINTING_2: [1, 2, 0, 'wall'], HANGING_PLANT: [1, 2, 0, 'wall'],
  PLANT: [1, 2, 1, 'decor'], PLANT_2: [1, 2, 1, 'decor'], CACTUS: [1, 2, 1, 'decor'], LARGE_PLANT: [2, 3, 2, 'decor'], POT: [1, 1, 0, 'decor'], BIN: [1, 1, 0, 'decor'],
};

// [종류, col, row]  (':left' = 좌우 반전)
const FURNITURE = [
  // 📚 자료실
  ['DOUBLE_BOOKSHELF', 1, 0], ['DOUBLE_BOOKSHELF', 3, 0], ['DOUBLE_BOOKSHELF', 5, 0], ['DOUBLE_BOOKSHELF', 7, 0],
  ['CLOCK', 10, 0], ['HANGING_PLANT', 12, 0],
  ['DOUBLE_BOOKSHELF', 2, 5], ['DOUBLE_BOOKSHELF', 4, 5], ['DOUBLE_BOOKSHELF', 8, 5], ['DOUBLE_BOOKSHELF', 10, 5],
  ['TABLE_FRONT', 5, 7], ['WOODEN_CHAIR_SIDE', 4, 7], ['WOODEN_CHAIR_SIDE', 4, 9], ['WOODEN_CHAIR_SIDE:left', 8, 7], ['WOODEN_CHAIR_SIDE:left', 8, 9],
  ['COFFEE', 6, 8], ['PLANT', 12, 9], ['BIN', 1, 10],
  // ⌨️ 작업실 (책상 6개)
  ['LARGE_PAINTING', 15, 0], ['WHITEBOARD', 19, 0], ['SMALL_PAINTING', 24, 0], ['CLOCK', 26, 0],
  ['DESK_FRONT', 14, 3], ['DESK_FRONT', 18, 3], ['DESK_FRONT', 22, 3], ['DESK_FRONT', 14, 7], ['DESK_FRONT', 18, 7], ['DESK_FRONT', 22, 7],
  ['PC_FRONT', 15, 3], ['PC_FRONT', 19, 3], ['PC_FRONT', 23, 3], ['PC_FRONT', 15, 7], ['PC_FRONT', 19, 7], ['PC_FRONT', 23, 7],
  ['CUSHIONED_BENCH', 15, 5], ['CUSHIONED_BENCH', 19, 5], ['CUSHIONED_BENCH', 23, 5], ['CUSHIONED_BENCH', 15, 9], ['CUSHIONED_BENCH', 19, 9], ['CUSHIONED_BENCH', 23, 9],
  ['PLANT', 26, 2], ['LARGE_PLANT', 25, 8],
  // 🖥 서버실 (랙은 직접 그림) + 콘솔 2대
  ['DESK_FRONT', 29, 7], ['PC_FRONT', 30, 7], ['CUSHIONED_BENCH', 30, 9],
  ['DESK_FRONT', 34, 7], ['PC_FRONT', 35, 7], ['CUSHIONED_BENCH', 35, 9],
  ['BIN', 38, 10], ['POT', 28, 10],
  // 복도
  ['SMALL_PAINTING', 3, 11], ['SMALL_PAINTING_2', 11, 11], ['LARGE_PAINTING', 15, 11], ['SMALL_PAINTING', 26, 11], ['SMALL_PAINTING_2', 37, 11],
  ['PLANT_2', 1, 13], ['PLANT', 38, 13],
  // ☕ 라운지
  ['HANGING_PLANT', 1, 15], ['LARGE_PAINTING', 4, 15], ['SMALL_PAINTING_2', 11, 15], ['CLOCK', 14, 15],
  ['SOFA_FRONT', 4, 19], ['COFFEE_TABLE', 4, 20], ['SOFA_BACK', 4, 22], ['SOFA_SIDE', 3, 20], ['SOFA_SIDE:left', 6, 20], ['COFFEE', 4, 21],
  ['SMALL_TABLE_FRONT', 13, 18], ['COFFEE', 13, 19], ['COFFEE', 14, 19],
  ['LARGE_PLANT', 15, 23], ['PLANT_2', 1, 24], ['CACTUS', 10, 24],
  // 📡 통신실 (회의 테이블 + 단말기)
  ['WHITEBOARD', 20, 15], ['LARGE_PAINTING', 27, 15],
  ['TABLE_FRONT', 22, 18], ['WOODEN_CHAIR_SIDE', 21, 18], ['WOODEN_CHAIR_SIDE', 21, 20], ['WOODEN_CHAIR_SIDE:left', 25, 18], ['WOODEN_CHAIR_SIDE:left', 25, 20],
  ['PC_SIDE', 22, 18], ['PC_SIDE', 22, 20], ['PC_SIDE:left', 24, 18], ['PC_SIDE:left', 24, 20],
  ['DESK_FRONT', 27, 22], ['PC_FRONT', 28, 22], ['CUSHIONED_BENCH', 28, 24],
  ['PLANT', 30, 17], ['CACTUS', 18, 24],
  // 🛗 로비
  ['SMALL_PAINTING', 32, 15], ['PLANT', 38, 24], ['POT', 32, 25],
];
const RACKS = [29, 31, 33, 35];           // 서버랙 시작 col (2칸 폭, row 2~3)
const ELEVATOR = { col: 35, w: 3, spawn: [36, 17] };

// 서서 일하는 자리 (의자 자리는 가구에서 자동으로 만든다)
const STAND_SPOTS = {
  L: [[2, 2, 'up'], [4, 2, 'up'], [6, 2, 'up'], [8, 2, 'up'], [3, 7, 'up'], [10, 7, 'up']],
  S: [[29, 4, 'up'], [31, 4, 'up'], [33, 4, 'up'], [35, 4, 'up']],
  O: [[13, 20, 'up'], [14, 20, 'up'], [9, 19, 'down'], [10, 22, 'left']],
  C: [[20, 17, 'up'], [21, 17, 'up']],
  X: [[17, 6, 'down'], [21, 6, 'down'], [25, 6, 'down']], // 작업실 보조석 (빈 책상 없을 때 서브에이전트용)
};
const ROOM_OF_STATE = { read: 'L', bash: 'S', edit: 'D', web: 'C', idle: 'O' };

// ======================================================================
//  에셋
// ======================================================================
const IMG = {};
function loadImg(key, src) {
  return new Promise(res => { const im = new Image(); im.onload = () => { IMG[key] = im; res(); }; im.onerror = () => res(); im.src = src; });
}
const FURN_FILES = ['DESK_FRONT', 'TABLE_FRONT', 'SMALL_TABLE_FRONT', 'COFFEE_TABLE', 'PC_FRONT_OFF', 'PC_FRONT_ON_1', 'PC_FRONT_ON_2', 'PC_FRONT_ON_3',
  'PC_SIDE', 'PC_BACK', 'COFFEE', 'CUSHIONED_BENCH', 'WOODEN_BENCH', 'WOODEN_CHAIR_SIDE', 'WOODEN_CHAIR_BACK', 'WOODEN_CHAIR_FRONT',
  'SOFA_FRONT', 'SOFA_BACK', 'SOFA_SIDE', 'DOUBLE_BOOKSHELF', 'BOOKSHELF', 'WHITEBOARD', 'CLOCK', 'LARGE_PAINTING', 'SMALL_PAINTING',
  'SMALL_PAINTING_2', 'HANGING_PLANT', 'PLANT', 'PLANT_2', 'CACTUS', 'LARGE_PLANT', 'POT', 'BIN'];
async function loadAssets() {
  const jobs = [];
  for (let i = 0; i < 6; i++) jobs.push(loadImg('char' + i, `assets/characters/char_${i}.png`));
  for (let i = 0; i < 9; i++) jobs.push(loadImg('floor' + i, `assets/floors/floor_${i}.png`));
  jobs.push(loadImg('wall', 'assets/walls/wall_0.png'));
  jobs.push(loadImg('pet_claudio', 'assets/pets/claudio.png'), loadImg('pet_gitcat', 'assets/pets/gitcat.png'));
  for (const f of FURN_FILES) jobs.push(loadImg(f, `assets/furniture/${f}.png`));
  await Promise.all(jobs);
}

// ---------- 색 처리 (Pixel Agents colorize.ts와 같은 공식) ----------
function hsl2rgb(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s, hp = (h % 360) / 60, x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0, g = 0, b = 0;
  if (hp < 1) [r, g] = [c, x]; else if (hp < 2) [r, g] = [x, c]; else if (hp < 3) [g, b] = [c, x];
  else if (hp < 4) [g, b] = [x, c]; else if (hp < 5) [r, b] = [x, c]; else [r, b] = [c, x];
  const m = l - c / 2;
  return [r, g, b].map(v => Math.max(0, Math.min(255, Math.round((v + m) * 255))));
}
function rgb2hsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  let h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
function toCanvas(img) { const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; c.getContext('2d').drawImage(img, 0, 0); return c; }
function mapPixels(img, fn) {
  const c = toCanvas(img), x = c.getContext('2d'), d = x.getImageData(0, 0, c.width, c.height), p = d.data;
  for (let i = 0; i < p.length; i += 4) if (p[i + 3]) { const o = fn(p[i], p[i + 1], p[i + 2]); p[i] = o[0]; p[i + 1] = o[1]; p[i + 2] = o[2]; }
  x.putImageData(d, 0, 0); return c;
}
function colorize(img, { h, s, b, c }) {
  return mapPixels(img, (r, g, bl) => {
    let l = (0.299 * r + 0.587 * g + 0.114 * bl) / 255;
    if (c) l = 0.5 + (l - 0.5) * ((100 + c) / 100);
    if (b) l += b / 200;
    return hsl2rgb(h, s / 100, Math.max(0, Math.min(1, l)));
  });
}
// 서브에이전트용: 피부·머리색(주황 계열)은 두고 옷 색만 돌린다
function hueShift(img, deg) {
  return mapPixels(img, (r, g, b) => {
    const [h, s, l] = rgb2hsl(r, g, b);
    if (s < 0.15 || (h > 8 && h < 50)) return [r, g, b];
    return hsl2rgb((h + deg) % 360, s, l);
  });
}
const sheetCache = new Map();
function sheetFor(idx, hue) {
  const k = idx + ':' + hue;
  if (!sheetCache.has(k)) { const img = IMG['char' + idx]; sheetCache.set(k, img ? (hue ? hueShift(img, hue) : img) : null); }
  return sheetCache.get(k);
}
const avatarCache = new Map();
function avatarFor(idx, hue) {
  const k = idx + ':' + hue;
  if (!avatarCache.has(k)) {
    const sh = sheetFor(idx, hue); if (!sh) return '';
    const c = document.createElement('canvas'); c.width = 16; c.height = 16;
    c.getContext('2d').drawImage(sh, 16, 8, 16, 16, 0, 0, 16, 16);
    avatarCache.set(k, c.toDataURL());
  }
  return avatarCache.get(k);
}

// ======================================================================
//  월드 만들기: 바닥, 벽, 가구, 의자 자리, 통행 가능 타일
// ======================================================================
const isFloor = (c, r) => r >= 0 && r < ROWS && c >= 0 && c < COLS && MAP[r][c] !== '#' && MAP[r][c] !== ' ';
const BLOCKED = new Set(), SEAT_TILES = new Set();
const tkey = (c, r) => r * COLS + c;
let floorCanvas, statics = [], pcItems = [];
const SPOTS = {}; const SPOT_BY_KEY = {};
let DESK_SPOTS = [];

function buildWorld() {
  // 바닥
  floorCanvas = document.createElement('canvas'); floorCanvas.width = WW; floorCanvas.height = WH;
  const fx = floorCanvas.getContext('2d');
  const tiles = {};
  for (const [k, f] of Object.entries(FLOORS)) tiles[k] = IMG['floor' + f.p] ? colorize(IMG['floor' + f.p], f.c) : null;
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const ch = MAP[r][c];
    if (tiles[ch]) fx.drawImage(tiles[ch], c * T, r * T);
  }
  // 벽 (상하좌우 이웃으로 모양 결정: N=1 E=2 S=4 W=8)
  const wallImg = IMG.wall ? colorize(IMG.wall, WALL_COLOR) : null;
  const isWall = (c, r) => r >= 0 && r < ROWS && c >= 0 && c < COLS && MAP[r][c] === '#';
  statics = [];
  if (wallImg) for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    if (!isWall(c, r)) continue;
    const m = (isWall(c, r - 1) ? 1 : 0) | (isWall(c + 1, r) ? 2 : 0) | (isWall(c, r + 1) ? 4 : 0) | (isWall(c - 1, r) ? 8 : 0);
    statics.push({ zY: (r + 1) * T, draw: () => ctx.drawImage(wallImg, (m % 4) * 16, Math.floor(m / 4) * 32, 16, 32, c * T, r * T - 16, 16, 32) });
  }
  // 엘리베이터 (벽면 위에 그림)
  statics.push({ zY: 17 * T + 0.1, draw: drawElevator });

  // 가구
  const deskZ = new Map();
  const parsed = FURNITURE.map(([type, col, row]) => {
    const [base, side] = type.split(':');
    const [w, h, bg, kind, orient] = CAT[base];
    return { base, mirror: side === 'left', col, row, w, h, bg, kind, orient };
  });
  for (const f of parsed) if (f.kind === 'desk')
    for (let dr = 0; dr < f.h; dr++) for (let dc = 0; dc < f.w; dc++) deskZ.set(tkey(f.col + dc, f.row + dr), (f.row + f.h) * T);
  const seats = [];
  for (const f of parsed) {
    // 통행 막기 (벽에 거는 가구는 벽 위라 상관없음)
    if (f.kind !== 'chair')
      for (let dr = f.bg; dr < f.h; dr++) for (let dc = 0; dc < f.w; dc++) if (isFloor(f.col + dc, f.row + dr)) BLOCKED.add(tkey(f.col + dc, f.row + dr));
    let zY = (f.row + f.h) * T;
    if (f.kind === 'chair') zY = f.orient === 'back' ? (f.row + f.h) * T + 1 : (f.row + 1) * T;
    if (f.kind === 'surf') { const dz = deskZ.get(tkey(f.col, f.row)); if (dz !== undefined) zY = Math.max(zY, dz + 0.5); }
    const item = { f, zY, draw: () => drawFurniture(f, item) };
    if (f.base === 'PC_FRONT') { item.seatKey = `${f.col},${f.row + 2}`; pcItems.push(item); }
    statics.push(item);
    // 의자 → 앉는 자리
    if (f.kind === 'chair') for (let dr = f.bg; dr < f.h; dr++) for (let dc = 0; dc < f.w; dc++) {
      const c = f.col + dc, r = f.row + dr;
      let dir = f.orient === 'front' ? 'down' : f.orient === 'back' ? 'up' : f.orient === 'side' ? (f.mirror ? 'left' : 'right') : null;
      if (!dir) for (const [dc2, dr2, d] of [[0, -1, 'up'], [0, 1, 'down'], [-1, 0, 'left'], [1, 0, 'right']])
        if (deskZ.has(tkey(c + dc2, r + dr2))) { dir = d; break; }
      seats.push({ col: c, row: r, dir: dir || 'down', seat: true });
      SEAT_TILES.add(tkey(c, r));
    }
  }
  // 서버랙
  RACKS.forEach((c0, i) => {
    for (let dr = 2; dr <= 3; dr++) for (let dc = 0; dc < 2; dc++) BLOCKED.add(tkey(c0 + dc, dr));
    statics.push({ zY: 4 * T, draw: () => drawRack(c0, i) });
  });
  // 벽 바로 아래 줄은 벽에 가려지므로 문 앞을 빼고 막는다
  for (let c = 0; c < COLS; c++) {
    if (!TOP_DOORS.includes(c) && isFloor(c, 11)) BLOCKED.add(tkey(c, 11));
    if (!BOTTOM_DOORS.includes(c) && isFloor(c, 15)) BLOCKED.add(tkey(c, 15));
  }

  // 방별 자리 목록
  const mk = (room, s) => { const key = `${s.col},${s.row}`; const spot = { ...s, room, key }; SPOT_BY_KEY[key] = spot; return spot; };
  for (const room of ['L', 'D', 'S', 'O', 'C']) SPOTS[room] = [];
  for (const s of seats.sort((a, b) => a.row - b.row || a.col - b.col)) {
    const room = MAP[s.row][s.col];
    if (SPOTS[room]) SPOTS[room].push(mk(room, s));
  }
  for (const [room, list] of Object.entries(STAND_SPOTS)) {
    SPOTS[room] = SPOTS[room] || [];
    for (const [col, row, dir] of list) SPOTS[room].push(mk(room, { col, row, dir, seat: false }));
  }
  DESK_SPOTS = SPOTS.D.slice();
  // 라운지: 소파부터 앉게
  SPOTS.O.sort((a, b) => b.seat - a.seat);
}

function drawFurniture(f, item) {
  let name = f.base;
  if (name === 'PC_FRONT') {
    const on = [...actors.values()].some(a => a.spot === item.seatKey && a.arrived && TYPING_STATES.has(a.data.state));
    name = on ? 'PC_FRONT_ON_' + (1 + Math.floor(now / 200) % 3) : 'PC_FRONT_OFF';
  }
  const img = IMG[name]; if (!img) return;
  const x = f.col * T, y = f.row * T;
  if (f.mirror) { ctx.save(); ctx.translate(x + img.width, y); ctx.scale(-1, 1); ctx.drawImage(img, 0, 0); ctx.restore(); }
  else ctx.drawImage(img, x, y);
}

function drawRack(c0, i) {
  const x = c0 * T + 2, w = 28, top = 18, bot = 4 * T;
  const busy = [...actors.values()].some(a => a.arrived && a.data.state === 'bash');
  ctx.fillStyle = '#12141b'; ctx.fillRect(x, top, w, bot - top);
  ctx.fillStyle = '#262b38'; ctx.fillRect(x + 1, top + 1, w - 2, bot - top - 2);
  for (let u = 0; u < 8; u++) {
    const uy = top + 3 + u * 5;
    ctx.fillStyle = '#323849'; ctx.fillRect(x + 3, uy, w - 6, 4);
    for (let l = 0; l < 3; l++) {
      const on = rand(i * 97 + u * 13 + l + Math.floor(now / (busy ? 110 : 600))) > (busy ? .35 : .65);
      ctx.fillStyle = on ? (l === 2 ? '#ffb347' : '#5dff8a') : '#1c3b28';
      ctx.fillRect(x + 5 + l * 3, uy + 1, 2, 2);
    }
    ctx.fillStyle = '#454c60'; ctx.fillRect(x + 16, uy + 1, 8, 1);
  }
  ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(x, bot - 2, w, 2);
}

let doorOpen = 0, elevatorOpenUntil = 0;
function drawElevator() {
  const x = ELEVATOR.col * T, y = 15 * T, w = ELEVATOR.w * T, h = 2 * T;
  doorOpen += ((now < elevatorOpenUntil ? 1 : 0) - doorOpen) * 0.15;
  ctx.fillStyle = '#5b6072'; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#1c1b22'; ctx.fillRect(x + 4, y + 7, w - 8, h - 7);
  ctx.fillStyle = '#ffe9a8'; ctx.fillRect(x + 6, y + 9, w - 12, 3);
  const half = ((w - 8) / 2) * (1 - doorOpen);
  ctx.fillStyle = '#aeb3c2'; ctx.fillRect(x + 4, y + 7, half, h - 7); ctx.fillRect(x + w - 4 - half, y + 7, half, h - 7);
  ctx.fillStyle = '#8c91a1';
  if (half > 1) { ctx.fillRect(x + 4 + half - 1, y + 7, 1, h - 7); ctx.fillRect(x + w - 4 - half, y + 7, 1, h - 7); }
  ctx.fillStyle = '#111'; ctx.fillRect(x + w / 2 - 6, y + 1, 12, 5);
  ctx.fillStyle = doorOpen > 0.3 ? '#ffb347' : '#ff5a3c'; ctx.fillRect(x + w / 2 - 4, y + 2, doorOpen > 0.3 ? 8 : 3, 3);
}

function rand(seed) { const x = Math.sin(seed * 9301 + 49297) * 233280; return x - Math.floor(x); }

// ======================================================================
//  길찾기 (BFS)
// ======================================================================
const walkable = (c, r) => isFloor(c, r) && !BLOCKED.has(tkey(c, r)) && !SEAT_TILES.has(tkey(c, r));
function findPath(sc, sr, gc, gr) {
  if (sc === gc && sr === gr) return [];
  const prev = new Int32Array(COLS * ROWS).fill(-2), start = tkey(sc, sr), goal = tkey(gc, gr);
  const q = [start]; prev[start] = -1;
  for (let qi = 0; qi < q.length; qi++) {
    const k = q[qi]; if (k === goal) break;
    const c = k % COLS, r = (k / COLS) | 0;
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nc = c + dc, nr = r + dr;
      if (nc < 0 || nr < 0 || nc >= COLS || nr >= ROWS) continue;
      const nk = tkey(nc, nr);
      if (prev[nk] !== -2) continue;
      if (nk !== goal && !walkable(nc, nr)) continue;
      prev[nk] = k; q.push(nk);
    }
  }
  if (prev[goal] === -2) return null;
  const path = [];
  for (let k = goal; k !== start; k = prev[k]) path.push([k % COLS, (k / COLS) | 0]);
  return path.reverse();
}

// ======================================================================
//  캐릭터
// ======================================================================
const actors = new Map();
const TYPING_STATES = new Set(['edit', 'bash', 'web']);
let snap = { sessions: [], log: [], now: Date.now() };
let clockSkew = 0, now = 0;
const userChar = new Map();
function charFor(user) {
  if (!userChar.has(user)) {
    const used = new Set(userChar.values());
    let i = hashStr(user) % 6;
    for (let k = 0; k < 6 && used.has(i); k++) i = (i + 1) % 6;
    userChar.set(user, i);
  }
  return userChar.get(user);
}
function hashStr(s) { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); }

function tileOf(a) { return [Math.max(0, Math.min(COLS - 1, Math.round((a.x - 8) / T))), Math.max(0, Math.min(ROWS - 1, Math.round((a.y - 8) / T)))]; }
function goTo(a, col, row, dir) {
  const [sc, sr] = tileOf(a);
  const p = findPath(sc, sr, col, row);
  a.path = p || [[col, row]];
  a.finalDir = dir; a.arrived = false;
}

function upsertActor(id, kind, data, parent) {
  let a = actors.get(id);
  if (!a) {
    const [c, r] = ELEVATOR.spawn;
    a = { id, kind, x: c * T + 8, y: r * T + 8, path: [], dir: 'down', spot: null, arrived: false, alpha: 0, leaving: false, seed: hashStr(id) % 1000 };
    actors.set(id, a);
    elevatorOpenUntil = now + 1500;
  }
  const prevState = a.data && a.data.state;
  a.kind = kind; a.data = data; a.parent = parent; a.leaving = false;
  // 생김새: 각자 꾸민 모습(프로필)을 쓰고, 없으면 기본값. 서브에이전트는 그 Claude와 옷 색만 다르게
  const owner = kind === 'sub' ? parent.user : data.user;
  const pf = profiles.get(owner) || {};
  if (kind === 'human') { a.charIdx = pf.char ?? charFor(owner); a.hue = pf.hue || 0; }
  else {
    a.charIdx = pf.claudeChar ?? charFor(owner);
    const h = pf.claudeHue ?? CLAUDE_HUE.main;
    a.hue = kind === 'sub' ? ((h + 90) % 360 || 90) : h;
  }
  if (prevState && prevState !== data.state) {
    if (data.state === 'idle' && kind === 'main') { a.doneUntil = now + 2500; emit('done', data); }
    if (data.state === 'wait') emit('wait', kind === 'main' ? data : parent);
  }
  return a;
}

const CLAUDE_HUE = { main: 190, sub: 100 };
let reservedDesks = 0;   // 앞쪽 책상은 사람(멤버) 자리
function applySnapshot(s) {
  snap = s;
  clockSkew = Date.now() - s.now;
  const present = new Set(), mains = [];
  // 출근한 사람: { id, user, status, desk }
  for (const h of s.humans || []) {
    const a = upsertActor('human:' + h.id, 'human', { ...h, state: h.status === 'meeting' ? 'think' : 'edit', updatedAt: Date.now() }, null);
    a.deskIdx = h.desk % DESK_SPOTS.length;
    present.add(a.id); mains.push(a);
  }
  s.sessions.forEach((sess, i) => {
    const m = upsertActor(sess.id, 'main', sess, null);
    m.deskIdx = (reservedDesks + i) % DESK_SPOTS.length;
    present.add(m.id); mains.push(m);
    for (const sub of sess.subs) present.add(upsertActor(sub.id, 'sub', sub, sess).id);
  });
  for (const a of actors.values()) {
    if (!present.has(a.id) && !a.leaving) {
      a.leaving = true; a.spot = null;
      goTo(a, ELEVATOR.spawn[0], ELEVATOR.spawn[1], 'up');
    }
  }
  assignSpots(mains);
}

function assignSpots(mains) {
  const live = [...actors.values()].filter(a => !a.leaving);
  const own = a => DESK_SPOTS[a.deskIdx] && DESK_SPOTS[a.deskIdx].key;
  const ownedDesks = new Set(mains.map(own));
  const roomOf = key => key && (SPOT_BY_KEY[key].room === 'X' ? 'D' : SPOT_BY_KEY[key].room);
  const want = new Map();
  for (const a of live) {
    if (a.kind === 'human') {
      // 사람: 근무/집중 → 자기 책상, 회의 → 통신실(회의 테이블)
      const meeting = a.data.status === 'meeting';
      const keep = meeting ? roomOf(a.spot) === 'C' : a.spot === own(a);
      want.set(a, keep ? null : meeting ? 'C' : 'D');
      continue;
    }
    let room = ROOM_OF_STATE[a.data.state];
    // think / plan / wait: 그 자리에서 고민. 처음 왔거나 라운지에 있었다면 메인은 자기 책상으로
    if (!room) room = a.spot && roomOf(a.spot) !== 'O' ? 'stay' : (a.kind === 'main' || !a.spot ? 'D' : 'stay');
    const keep = room === 'stay' || (roomOf(a.spot) === room && !(a.kind === 'main' && room === 'D' && a.spot !== own(a)));
    want.set(a, keep ? null : room);
  }
  const taken = new Set(live.filter(a => !want.get(a)).map(a => a.spot));
  for (const a of live) {
    const room = want.get(a);
    if (!room) continue;
    let spot;
    if (room === 'C' && a.kind === 'human') {
      spot = SPOTS.C.find(s => s.seat && !taken.has(s.key)) || SPOTS.C.find(s => !taken.has(s.key)) || SPOTS.C[0];
    } else if (room === 'D') {
      if (a.kind === 'main' || a.kind === 'human') spot = DESK_SPOTS[a.deskIdx];
      else spot = DESK_SPOTS.find(s => !ownedDesks.has(s.key) && !taken.has(s.key)) || SPOTS.X.find(s => !taken.has(s.key)) || SPOTS.X[0];
    } else {
      const list = SPOTS[room];
      spot = list.find(s => !taken.has(s.key)) || list[a.seed % list.length];
    }
    taken.add(spot.key);
    if (spot.key !== a.spot) { a.spot = spot.key; goTo(a, spot.col, spot.row, spot.dir); }
  }
}

// ---------- 애니메이션 ----------
const DIR_ROW = { down: 0, up: 1, right: 2, left: 2 };
const SPEED = 72;
function stepActor(a, dt) {
  if (a.path.length) {
    const [c, r] = a.path[0];
    const tx = c * T + 8, ty = r * T + 8;
    const dx = tx - a.x, dy = ty - a.y, dist = Math.hypot(dx, dy);
    const step = SPEED * dt * (a.kind === 'sub' ? 1.2 : 1);
    if (Math.abs(dx) > Math.abs(dy)) a.dir = dx > 0 ? 'right' : 'left'; else if (dist > 0.1) a.dir = dy > 0 ? 'down' : 'up';
    if (dist <= step) { a.x = tx; a.y = ty; a.path.shift(); }
    else { a.x += dx / dist * step; a.y += dy / dist * step; }
    if (!a.path.length) { a.arrived = !a.leaving; if (a.finalDir) a.dir = a.finalDir; if (a.leaving) { elevatorOpenUntil = now + 1200; a.fading = true; } }
  }
  if (a.fading || (a.leaving && !a.path.length)) {
    a.alpha -= dt * 1.6;
    if (a.alpha <= 0) actors.delete(a.id);
  } else if (a.alpha < 1) a.alpha = Math.min(1, a.alpha + dt * 2);

  const idleFor = a.kind === 'human' ? 0 : Date.now() - clockSkew - (a.kind === 'main' ? a.data.updatedAt : a.parent.updatedAt);
  a.sleep = a.arrived && a.data.state === 'idle' && idleFor > 5 * 60_000;
  const spot = a.spot && SPOT_BY_KEY[a.spot];
  a.seated = a.arrived && spot && spot.seat;
}

function frameOf(a) {
  if (a.path.length) return [0, 1, 2, 1][Math.floor(now / 150 + a.seed) % 4];
  if (!a.arrived) return 1;
  const st = a.data.state;
  if (st === 'read') return 5 + Math.floor(now / 400 + a.seed) % 2;
  if (TYPING_STATES.has(st)) return 3 + Math.floor(now / 300 + a.seed) % 2;
  return 1;
}

function drawActor(a) {
  const sheet = sheetFor(a.charIdx, a.hue); if (!sheet) return;
  const sit = a.seated ? 6 : 0;
  const x = Math.round(a.x - 8), y = Math.round(a.y + sit - 32);
  ctx.globalAlpha = Math.max(0, a.alpha);
  ctx.fillStyle = 'rgba(0,0,0,.18)';
  if (!a.seated) { ctx.beginPath(); ctx.ellipse(a.x, a.y, 5, 2, 0, 0, 7); ctx.fill(); }
  const fx = frameOf(a) * 16, fy = DIR_ROW[a.dir] * 32;
  if (a.dir === 'left') { ctx.save(); ctx.translate(x + 16, y); ctx.scale(-1, 1); ctx.drawImage(sheet, fx, fy, 16, 32, 0, 0, 16, 32); ctx.restore(); }
  else ctx.drawImage(sheet, fx, fy, 16, 32, x, y, 16, 32);
  ctx.globalAlpha = 1;
}

// ---------- Pixel Agents 말풍선 스프라이트 ----------
function pixelSprite(pal, rows) {
  const c = document.createElement('canvas'); c.width = rows[0].length; c.height = rows.length;
  const x = c.getContext('2d');
  rows.forEach((row, r) => [...row].forEach((k, i) => { if (pal[k]) { x.fillStyle = pal[k]; x.fillRect(i, r, 1, 1); } }));
  return c;
}
const BUBBLE_BASE = ['BBBBBBBBBBB', 'BFFFFFFFFFB', 'BFFFFFFFFFB', 'BFFFFFFFFFB', 'BFFFFFFFFFB', 'BFFAFAFAFFB', 'BFFFFFFFFFB', 'BFFFFFFFFFB', 'BFFFFFFFFFB', 'BBBBBBBBBBB', '____BBB____', '_____B_____'];
const BUBBLES = {
  wait: pixelSprite({ B: '#555566', F: '#EEEEFF', A: '#CCA700' }, BUBBLE_BASE),
  done: pixelSprite({ B: '#555566', F: '#EEEEFF', G: '#44BB66' }, ['_BBBBBBBBB_', 'BFFFFFFFFFB', 'BFFFFFFFFFB', 'BFFFFFFFGFB', 'BFFFFFFGFFB', 'BFFGFFGFFFB', 'BFFFGGFFFFB', 'BFFFFFFFFFB', 'BFFFFFFFFFB', '_BBBBBBBBB_', '____BBB____', '_____B_____']),
  heart: pixelSprite({ B: '#555566', F: '#EEEEFF', H: '#E64566' }, ['_BBBBBBBBB_', 'BFFFFFFFFFB', 'BFFHHFHHFFB', 'BFHHHHHHHFB', 'BFHHHHHHHFB', 'BFHHHHHHHFB', 'BFFHHHHHFFB', 'BFFFHHHFFFB', 'BFFFFHFFFFB', '_BBBBBBBBB_', '____BBB____', '_____B_____']),
};
function bubbleOf(a) {
  if (a.leaving || !a.arrived && a.data.state !== 'wait') return null;
  if (a.data.state === 'wait') return 'wait';
  if (a.doneUntil > now) return 'done';
  return null;
}

// ======================================================================
//  반려동물 (라운지를 돌아다님, 클릭하면 하트)
// ======================================================================
const pets = [
  { key: 'pet_claudio', x: 9 * T + 8, y: 23 * T + 8, path: [], dir: 'down', until: 0, heartUntil: 0 },
  { key: 'pet_gitcat', x: 12 * T + 8, y: 21 * T + 8, path: [], dir: 'down', until: 0, heartUntil: 0 },
];
function stepPet(p, dt) {
  if (p.path.length) {
    const [c, r] = p.path[0], tx = c * T + 8, ty = r * T + 8;
    const dx = tx - p.x, dy = ty - p.y, dist = Math.hypot(dx, dy), step = 32 * dt;
    if (Math.abs(dx) > Math.abs(dy)) p.dir = dx > 0 ? 'right' : 'left'; else if (dist > .1) p.dir = dy > 0 ? 'down' : 'up';
    if (dist <= step) { p.x = tx; p.y = ty; p.path.shift(); if (!p.path.length) p.until = now + 3000 + Math.random() * 9000; }
    else { p.x += dx / dist * step; p.y += dy / dist * step; }
  } else if (now > p.until) {
    const tiles = [];
    for (let r = 17; r < ROWS; r++) for (let c = 1; c <= 16; c++) if (walkable(c, r) && MAP[r][c] === 'O') tiles.push([c, r]);
    const [gc, gr] = tiles[Math.floor(Math.random() * tiles.length)];
    const [sc, sr] = [Math.round((p.x - 8) / T), Math.round((p.y - 8) / T)];
    p.path = findPath(sc, sr, gc, gr) || [];
    if (!p.path.length) p.until = now + 2000;
  }
}
function drawPet(p) {
  const img = IMG[p.key]; if (!img) return;
  const walking = p.path.length > 0, f = Math.floor(now / (walking ? 150 : 300)) % 3;
  const bottom = Math.round(p.y + 6);
  if (walking && (p.dir === 'left' || p.dir === 'right')) {
    const x = Math.round(p.x - 16);
    if (p.dir === 'left') { ctx.save(); ctx.translate(x + 32, bottom - 32); ctx.scale(-1, 1); ctx.drawImage(img, f * 32, 64, 32, 32, 0, 0, 32, 32); ctx.restore(); }
    else ctx.drawImage(img, f * 32, 64, 32, 32, x, bottom - 32, 32, 32);
  } else {
    const row = p.dir === 'up' ? 1 : 0, col = walking ? f : 3 + f;
    ctx.drawImage(img, col * 16, row * 32, 16, 32, Math.round(p.x - 8), bottom - 32, 16, 32);
  }
  if (p.heartUntil > now) ctx.drawImage(BUBBLES.heart, Math.round(p.x - 5), bottom - 30);
}

// ======================================================================
//  렌더링
// ======================================================================
let cv, ctx, stageEl, emit = () => {};
let zoom = 2, dpr = 1;
function resize() {
  dpr = window.devicePixelRatio || 1;
  const avail = stageEl.clientWidth - 18;
  zoom = Math.max(1, Math.floor(avail * dpr / WW));
  cv.width = WW * zoom; cv.height = WH * zoom;
  cv.style.width = Math.min(avail, WW * zoom / dpr) + 'px';
}

// 클릭할 수 있는 것: 반려동물(하트), 작업실 화이트보드, 캐릭터
const BOARD_RECT = { x: 19 * T - 2, y: 0, w: 2 * T + 4, h: 2 * T + 6 };
function worldPos(e) {
  const r = cv.getBoundingClientRect();
  return [(e.clientX - r.left) / r.width * WW, (e.clientY - r.top) / r.height * WH];
}
function hitTest(wx, wy) {
  for (const p of pets) if (Math.abs(wx - p.x) < 9 && wy < p.y + 8 && wy > p.y - 20) return { pet: p };
  const b = BOARD_RECT;
  if (wx >= b.x && wx <= b.x + b.w && wy >= b.y && wy <= b.y + b.h) return { board: true };
  const hits = [...actors.values()].filter(a => !a.leaving && a.alpha > .5 && Math.abs(wx - a.x) < 8 && wy > a.y + (a.seated ? 6 : 0) - 30 && wy < a.y + 8);
  if (hits.length) { const a = hits.sort((x, y) => y.y - x.y)[0]; return { actor: a }; }
  return null;
}
function onClick(e) {
  const h = hitTest(...worldPos(e));
  if (!h) return;
  if (h.pet) h.pet.heartUntil = now + 2000;
  else if (h.board) emit('board');
  else if (h.actor && h.actor.kind === 'human') emit('human', h.actor.data);
  else if (h.actor) emit('actor', h.actor.kind === 'main' ? h.actor.data : h.actor.parent);
}
function onMove(e) { cv.style.cursor = hitTest(...worldPos(e)) ? 'pointer' : ''; }
let boardBadge = '';
const marks = new Map();
const profiles = new Map();   // 이름 → { char, hue, claudeChar, claudeHue, claudeName }
const claudeNameOf = user => (profiles.get(user) || {}).claudeName || `${user}의 Claude`;

function roundRect(x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function clipText(s, maxW) {
  if (ctx.measureText(s).width <= maxW) return s;
  while (s.length > 1 && ctx.measureText(s + '…').width > maxW) s = s.slice(0, -1);
  return s + '…';
}

function labelOf(a) {
  const d = a.data;
  if (a.kind === 'human') {
    const st = { meeting: '📅 회의 중', focus: '🎧 집중' }[d.status] || '';
    return { who: (marks.get(d.user) || '') + d.user, text: a.leaving ? '퇴근 🛗' : st, human: true };
  }
  const who = a.kind === 'sub' ? '↳ ' + d.desc : (marks.get(d.user) || '') + '🤖 ' + claudeNameOf(d.user);
  if (a.leaving) return { who, text: '퇴근 🛗' };
  if (a.sleep) return { who, text: '💤' };
  switch (d.state) {
    case 'idle': return { who, text: a.doneUntil > now ? '완료!' : '' };
    case 'think': return { who, text: d.detail || '💭 ' + '·'.repeat(1 + Math.floor(now / 400) % 3) };
    case 'plan': return { who, text: '📝 ' + (d.detail || '계획 중') };
    case 'wait': return { who, text: '🙋 ' + (d.detail || '승인 필요'), alert: true };
    default: return { who, text: d.tool + (d.detail ? ' · ' + d.detail : '') };
  }
}

function drawOverlays() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const Z = zoom, F = Math.round(10.5 * dpr * Math.max(1, Z / dpr / 2.2));
  // 문 위 방 이름표
  ctx.font = `600 ${F}px -apple-system, "Apple SD Gothic Neo", sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const s of SIGNS) {
    const name = ROOM_NAMES[s.room], w = ctx.measureText(name).width + F, h = F * 1.6;
    ctx.fillStyle = 'rgba(14,12,20,.78)'; roundRect(s.x * Z - w / 2, s.y * Z - h / 2, w, h, F * .4); ctx.fill();
    ctx.fillStyle = '#f4ecff'; ctx.fillText(name, s.x * Z, s.y * Z + 1);
  }
  // 화이트보드 배지 (할 일 개수)
  if (boardBadge) {
    ctx.font = `700 ${F}px -apple-system, "Apple SD Gothic Neo", sans-serif`;
    const bx = 20 * T * Z, by = (2 * T + 7) * Z, bw = ctx.measureText(boardBadge).width + F, bh = F * 1.6;
    ctx.fillStyle = 'rgba(242,166,90,.95)'; roundRect(bx - bw / 2, by - bh / 2, bw, bh, bh / 2); ctx.fill();
    ctx.fillStyle = '#241505'; ctx.textAlign = 'center'; ctx.fillText(boardBadge, bx, by + 1);
  }
  // 캐릭터 이름표 + 하는 일 (겹치면 위로 쌓기)
  const placed = [];
  const list = [...actors.values()].filter(a => a.alpha > 0.2).sort((a, b) => b.y - a.y);
  for (const a of list) {
    const L = labelOf(a);
    ctx.font = `700 ${F}px -apple-system, "Apple SD Gothic Neo", sans-serif`;
    const whoW = ctx.measureText(L.who).width;
    ctx.font = `${F}px -apple-system, "Apple SD Gothic Neo", sans-serif`;
    const text = L.text ? clipText(L.text, 150 * dpr) : '';
    const textW = text ? ctx.measureText(text).width + F * .5 : 0;
    const w = whoW + textW + F, h = F * 1.7;
    const sit = a.seated ? 6 : 0;
    const bubble = bubbleOf(a);
    let x = a.x * Z - w / 2, y = (a.y + sit - 31 - (bubble ? 13 : 0)) * Z - h - 2 * dpr;
    x = Math.max(2, Math.min(cv.width - w - 2, x));
    for (let guard = 0; guard < 6; guard++) {
      const hit = placed.find(p => x < p.x + p.w && x + w > p.x && y < p.y + p.h && y + h > p.y);
      if (!hit) break;
      y = hit.y - h - 2 * dpr;
    }
    placed.push({ x, y, w, h });
    ctx.globalAlpha = Math.min(1, a.alpha);
    ctx.fillStyle = L.alert ? 'rgba(255,209,102,.96)' : L.human ? 'rgba(244,236,255,.96)' : a.kind === 'sub' ? 'rgba(52,44,20,.9)' : 'rgba(18,15,26,.88)';
    roundRect(x, y, w, h, h / 2); ctx.fill();
    ctx.textAlign = 'left';
    ctx.font = `700 ${F}px -apple-system, "Apple SD Gothic Neo", sans-serif`;
    ctx.fillStyle = L.alert ? '#3a2a00' : L.human ? '#1b1624' : a.kind === 'sub' ? '#ffd86b' : '#ffffff';
    ctx.fillText(L.who, x + F / 2, y + h / 2 + 1);
    if (text) {
      ctx.font = `${F}px -apple-system, "Apple SD Gothic Neo", sans-serif`;
      ctx.fillStyle = L.alert ? '#3a2a00' : L.human ? '#5b4a75' : '#c9bfdc';
      ctx.fillText(text, x + F / 2 + whoW + F * .5, y + h / 2 + 1);
    }
    // 채팅 말풍선: 메시지를 보낸 사람의 캐릭터 머리 위에 잠깐 뜬다
    if (a.sayUntil > now) {
      ctx.font = `${F * 1.05}px -apple-system, "Apple SD Gothic Neo", sans-serif`;
      const said = clipText('💬 ' + a.sayText, 220 * dpr), sw = ctx.measureText(said).width + F * 1.2, sh = F * 1.9;
      const sx = Math.max(2, Math.min(cv.width - sw - 2, a.x * Z - sw / 2)), sy = y - sh - 6 * dpr;
      ctx.globalAlpha = Math.min(1, (a.sayUntil - now) / 400);
      ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#555566'; ctx.lineWidth = Math.max(1, dpr);
      roundRect(sx, sy, sw, sh, F * .5); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(a.x * Z - 4 * dpr, sy + sh - .5); ctx.lineTo(a.x * Z, sy + sh + 5 * dpr); ctx.lineTo(a.x * Z + 4 * dpr, sy + sh - .5); ctx.fill();
      ctx.fillStyle = '#1b1624'; ctx.textAlign = 'left'; ctx.fillText(said, sx + F * .6, sy + sh / 2 + 1);
      placed.push({ x: sx, y: sy, w: sw, h: sh });
    }
    ctx.globalAlpha = 1;
  }
  if (!snap.sessions.length) {
    ctx.font = `${F * 1.2}px -apple-system, "Apple SD Gothic Neo", sans-serif`; ctx.textAlign = 'center';
    const msg = '아직 아무도 출근 안 했어요. Claude Code를 켜보세요!', w = ctx.measureText(msg).width + F * 2;
    ctx.fillStyle = 'rgba(14,12,20,.85)'; roundRect(cv.width / 2 - w / 2, 14 * T * Z - F, w, F * 2.2, F * .5); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillText(msg, cv.width / 2, 14 * T * Z + 2);
  }
}

let last = performance.now();
function frame(t) {
  const dt = Math.min(0.25, (t - last) / 1000); last = t; now = t;
  for (const a of actors.values()) stepActor(a, dt);
  for (const p of pets) stepPet(p, dt);

  ctx.setTransform(zoom, 0, 0, zoom, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#100e16'; ctx.fillRect(0, 0, WW, WH);
  ctx.drawImage(floorCanvas, 0, 0);
  const items = statics.slice();
  for (const a of actors.values()) items.push({ zY: a.y + 8.5 + (a.seated ? 0 : 0), draw: () => drawActor(a) });
  for (const p of pets) items.push({ zY: p.y + 8.4, draw: () => drawPet(p) });
  items.sort((a, b) => a.zY - b.zY).forEach(i => i.draw());
  for (const a of actors.values()) {
    const b = bubbleOf(a); if (!b) continue;
    const bob = b === 'wait' ? Math.round(Math.sin(now / 250)) : 0;
    ctx.globalAlpha = Math.max(0, a.alpha);
    ctx.drawImage(BUBBLES[b], Math.round(a.x - 5), Math.round(a.y + (a.seated ? 6 : 0) - 44 + bob));
    ctx.globalAlpha = 1;
  }
  drawOverlays();
  requestAnimationFrame(frame);
}


// ======================================================================
//  바깥에서 쓰는 함수들
// ======================================================================
export const ready = loadAssets().then(buildWorld);
export function start(canvas, stage, onEvent) {
  cv = canvas; ctx = cv.getContext('2d'); stageEl = stage;
  if (onEvent) emit = onEvent;
  resize();
  window.addEventListener('resize', resize);
  cv.addEventListener('click', onClick);
  cv.addEventListener('mousemove', onMove);
  requestAnimationFrame(frame);
}
// 멤버마다 고정 캐릭터 지정 { 이름: 0~5 }
export function setUserChars(map) { for (const [u, i] of Object.entries(map)) userChar.set(u, i); }
// 채팅을 보낸 사람의 캐릭터 머리 위에 말풍선. 화면에 그 사람 캐릭터가 없으면 0을 돌려준다.
export function say(user, text) {
  // 그 사람이 출근해 있으면 사람 머리 위에, 아니면 그 사람의 Claude 위에
  const mine = [...actors.values()].filter(a => a.data.user === user && !a.leaving);
  const targets = mine.some(a => a.kind === 'human') ? mine.filter(a => a.kind === 'human') : mine.filter(a => a.kind === 'main');
  for (const a of targets) { a.sayText = text; a.sayUntil = now + 7000; }
  return targets.length;
}
// 앞에서부터 n개 책상은 사람 자리로 비워둔다
export function setReservedDesks(n) { reservedDesks = n; }
export const HUE = CLAUDE_HUE;
// 각자 꾸민 생김새 { 이름: { char, hue, claudeChar, claudeHue, claudeName } } — 다음 갱신부터 반영
export function setProfiles(obj) { profiles.clear(); for (const [k, v] of Object.entries(obj || {})) profiles.set(k, v); }
// 꾸미기 미리보기용 전신 그림 (정면, 16x32)
const previewCache = new Map();
export function previewFor(idx, hue) {
  const k = idx + ':' + hue;
  if (!previewCache.has(k)) {
    const sh = sheetFor(idx, hue); if (!sh) return '';
    const c = document.createElement('canvas'); c.width = 16; c.height = 32;
    c.getContext('2d').drawImage(sh, 16, 0, 16, 32, 0, 0, 16, 32);
    previewCache.set(k, c.toDataURL());
  }
  return previewCache.get(k);
}
// 작업실 화이트보드 위에 띄울 글자 (예: '📋 2/5')
export function setBoardBadge(text) { boardBadge = text || ''; }
// 이름 앞에 붙일 표시 { 이름: '📌' }
export function setMarks(obj) { marks.clear(); for (const [k, v] of Object.entries(obj || {})) marks.set(k, v); }
export { applySnapshot, avatarFor, charFor };
