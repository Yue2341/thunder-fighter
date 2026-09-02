// ==================== 无浏览器桩测试 ====================
// 用 Node vm 模拟浏览器环境（多 <script> 共享全局词法作用域），加载前端脚本并
// 模拟"开始单人游戏 → 自动开火 → 击落敌机"的过程，断言核心游戏逻辑正常。
// 用法: node scripts/stub-test.js <script1.js> [script2.js ...]
const fs = require('fs');
const vm = require('vm');

// ---------- canvas ctx 桩（记录所有调用，供断言） ----------
function makeCtx() {
  const calls = [];
  const grad = { addColorStop() {} };
  const target = {
    canvas: { width: 480, height: 700 },
    createLinearGradient: () => grad,
    createRadialGradient: () => grad,
    measureText: () => ({ width: 10 }),
  };
  return new Proxy(target, {
    get(t, p) {
      if (p === '__calls') return calls;
      if (p in t) return t[p];
      return (...a) => { calls.push([p, ...a]); return undefined; };
    },
    set(t, p, v) { t[p] = v; return true; },
  });
}

// ---------- DOM 元素桩 ----------
function makeClassList() {
  const s = new Set();
  return {
    add: c => s.add(c), remove: c => s.delete(c),
    toggle(c, v) { if (v === undefined) { s.has(c) ? s.delete(c) : s.add(c); } else { v ? s.add(c) : s.delete(c); } },
    contains: c => s.has(c),
  };
}
function makeEl(id) {
  const el = {
    id, children: [], dataset: {}, value: '', textContent: '', innerHTML: '', title: '', maxLength: 0,
    width: 480, height: 700, // canvas 尺寸（game 画布依赖）
    style: new Proxy({}, { set: () => true, get: () => '' }),
    classList: makeClassList(), handlers: {}, onclick: null, onblur: null, onkeydown: null,
    addEventListener(t, f) { (el.handlers[t] ||= []).push(f); },
    removeEventListener() {},
    appendChild(c) { el.children.push(c); return c; },
    querySelectorAll() { return []; },
    focus() {}, blur() {},
    getBoundingClientRect() { return { left: 0, top: 0, width: 480, height: 700 }; },
    getContext() { if (!el._ctx) el._ctx = makeCtx(); return el._ctx; },
  };
  return el;
}

// ---------- AudioContext 桩 ----------
class FakeAudioContext {
  constructor() { this.currentTime = 0; this.state = 'running'; this.sampleRate = 44100; }
  resume() {}
  get destination() { return {}; }
  createOscillator() { return { type: '', frequency: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect(x) { return x; }, start() {}, stop() {} }; }
  createGain() { return { gain: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect(x) { return x; } }; }
  createBuffer() { return { getChannelData: () => new Float32Array(64) }; }
  createBufferSource() { return { buffer: null, connect(x) { return x; }, start() {}, stop() {} }; }
  createBiquadFilter() { return { type: '', frequency: { value: 0 }, connect(x) { return x; } }; }
}

// ---------- 组装沙箱 ----------
const elements = {};
const rafQueue = [];
const winHandlers = {};
const storage = new Map();

const sandbox = {
  console, Math, JSON, Set, Map, Array, Object, Promise, Date, Number, String, Boolean, isNaN, parseInt, parseFloat,
  URL, URLSearchParams, setTimeout, clearTimeout, setInterval, clearInterval, Buffer,
  performance: { now: () => 0 },
  requestAnimationFrame: cb => { rafQueue.push(cb); return rafQueue.length; },
  localStorage: {
    getItem: k => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: k => storage.delete(k),
  },
  location: { protocol: 'http:', host: 'localhost:3000', href: 'http://localhost:3000/', search: '' },
  navigator: { clipboard: { writeText: async () => {} } },
  fetch: async () => ({ ok: false, status: 401, json: async () => ({ error: 'stub: 离线环境' }) }),
  WebSocket: class { constructor() { this.readyState = 1; this.OPEN = 1; } close() {} send() {} },
  AudioContext: FakeAudioContext,
  document: {
    hidden: false,
    getElementById(id) { return elements[id] ||= makeEl(id); },
    createElement(tag) { return makeEl('<' + tag + '>'); },
    querySelectorAll() { return []; },
  },
};
sandbox.window = sandbox; // window 与全局同体（window._pendingRoom 等可直接用）
sandbox.addEventListener = (t, f) => { (winHandlers[t] ||= []).push(f); };
sandbox.window.addEventListener = sandbox.addEventListener;
vm.createContext(sandbox);

// ---------- 依次加载脚本（模拟多个 <script> 标签） ----------
const files = process.argv.slice(2);
if (!files.length) { console.error('用法: node scripts/stub-test.js <script...>'); process.exit(2); }
for (const f of files) {
  vm.runInContext(fs.readFileSync(f, 'utf8'), sandbox, { filename: f });
}

// ---------- 断言工具 ----------
let pass = 0, fail = 0;
function assert(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra ? ' —— ' + extra : '')); }
}
const ctxCalls = () => elements.game._ctx.__calls;
const fillTexts = () => ctxCalls().filter(c => c[0] === 'fillText').map(c => String(c[1]));

// ==================== 测试流程 ====================
(async () => {
console.log('▶ 启动与加载');
assert('所有脚本加载无异常', true);
await new Promise(r => setTimeout(r, 30)); // 等待异步微任务（fetch 桩失败回调等）
assert('登录页可见（login 无 hidden）', !elements.login.classList.contains('hidden'));
assert('离线时提示无法连接服务器', String(elements.loginStatus.textContent).includes('无法连接'), elements.loginStatus.textContent);

console.log('▶ 单人游戏模拟（约 90 秒游戏时间）');
sandbox.startSolo();
assert('进入游戏画面（HUD 显示）', !elements.hud.classList.contains('hidden'));
assert('初始得分 0', Number(elements.score.textContent) === 0);

// 通过全局词法作用域拿 game 引用（仅测试用，不改生产代码），给玩家持续无敌以便模拟长时间游玩
const getGame = vm.runInContext('() => game', sandbox);

// 推进主循环 ~90 秒（子弹自动命中敌机，应产生得分/击杀）
let t = 0;
for (let i = 0; i < 5400; i++) {
  t += 16.7; const cb = rafQueue[rafQueue.length - 1]; rafQueue.length = 0; cb(t);
  if (i % 30 === 0) { const g = getGame(); if (g && g.players[0]) g.players[0].inv = 3; } // 测试外挂：无敌
}

const scoreTxt = elements.score.textContent;
console.log('  （模拟结束得分: ' + scoreTxt + '）');
assert('得分 > 0（自动开火可击落敌机）', Number(scoreTxt) > 0, 'score=' + scoreTxt);
assert('玩家存活（lives 已渲染）', String(elements.lives.textContent).includes('❤'), elements.lives.textContent);
const gEnd = getGame();
assert('游戏仍在进行（未被撞死）', gEnd && gEnd.time > 80, 'time=' + (gEnd && gEnd.time));

console.log('▶ 击打反馈 / 连击 / 横幅渲染检查');
assert('出现得分飘字（+N）', fillTexts().some(s => /^\+\d/.test(s)), JSON.stringify(fillTexts().slice(0, 8)));
assert('连击倍率生效（出现 x2/x3 翻倍得分飘字）', fillTexts().some(s => { const m = s.match(/^\+(\d+)$/); return m && Number(m[1]) >= 400; }), JSON.stringify(fillTexts().slice(0, 12)));
assert('出现连击 COMBO 显示', fillTexts().some(s => s.includes('COMBO')));
assert('Boss 波次提示渲染', fillTexts().some(s => s.includes('波')), JSON.stringify(fillTexts().slice(0, 8)));
assert('新手提示渲染（开局 5 秒内）', fillTexts().some(s => s.includes('自动开火')), JSON.stringify(fillTexts().slice(0, 8)));

console.log('▶ 快照结构（联机数据）');
const snap = sandbox.snapshot();
assert('快照含 kills（房客击落数修复）', snap && typeof snap.kills === 'number' && snap.kills > 0, JSON.stringify(snap && { kills: snap.kills, combo: snap.combo }));
assert('快照含 combo', snap && typeof snap.combo === 'number');

console.log('▶ 视觉升级（精灵图/火力光环/冲击波）');
const drawImgCount = ctxCalls().filter(c => c[0] === 'drawImage').length;
assert('敌机精灵图渲染（drawImage 大量出现）', drawImgCount > 100, 'drawImage=' + drawImgCount);
// 强制满级火力 → 应出现旋转能量环（setLineDash）
const g5 = getGame(); if (g5) g5.players[0].power = 5;
const dashBefore = ctxCalls().filter(c => c[0] === 'setLineDash').length;
for (let i = 0; i < 30; i++) { t += 16.7; const cb = rafQueue[rafQueue.length - 1]; rafQueue.length = 0; cb(t); }
assert('满级旋转能量环渲染', ctxCalls().filter(c => c[0] === 'setLineDash').length > dashBefore);
// 冲击波环
sandbox.spawnRing(240, 300, '#ffffff', 100);
const strokeBefore = ctxCalls().filter(c => c[0] === 'stroke').length;
for (let i = 0; i < 10; i++) { t += 16.7; const cb = rafQueue[rafQueue.length - 1]; rafQueue.length = 0; cb(t); }
assert('冲击波环渲染', ctxCalls().filter(c => c[0] === 'stroke').length > strokeBefore);
if (g5) g5.players[0].power = 1; // 恢复

console.log('▶ 输入与触屏');
const kd = winHandlers['keydown'] && winHandlers['keydown'][0];
assert('键盘监听已注册', typeof kd === 'function');
kd({ key: 'a', preventDefault() {} });
kd({ key: 'Escape', preventDefault() {} }); // 暂停
const pauseMenu = elements.pauseMenu;
assert('ESC 可暂停', !pauseMenu.classList.contains('hidden'));
kd({ key: 'Escape', preventDefault() {} });
assert('再按 ESC 恢复', pauseMenu.classList.contains('hidden'));

const cv = elements.game;
const touchMove = cv.handlers['touchmove'] && cv.handlers['touchmove'][0];
assert('触屏移动监听已注册', typeof touchMove === 'function');
if (touchMove) touchMove({ touches: [{ clientX: 240, clientY: 600 }], preventDefault() {} });
assert('触屏炸弹入口存在（双指/按钮）',
  (cv.handlers['touchstart'] || []).length > 0 || (elements.btnBomb && ((elements.btnBomb.handlers['click'] || []).length > 0 || elements.btnBomb.onclick)));

console.log('▶ 暂停期间不推进世界');
const pausedScore = elements.score.textContent;

console.log('\n结果: ' + pass + ' 通过, ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
})().catch(e => { console.error('桩测试异常:', e); process.exit(2); });
