const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');
const PASSWORD = '123456'; // 所有测试账户统一密码

// ==================== 10 个预设账户（uid 固定，name 可自定义） ====================
const PRESET_ACCOUNTS = [
  '猎鹰', '闪电', '雷霆', '疾风', '烈焰',
  '苍穹', '流星', '风暴', '幻影', '战神'
].map((name, i) => ({
  uid: 'TF' + (1001 + i),
  name,
  password: PASSWORD,
}));

// ==================== 数据加载 / 保存 ====================
function load() {
  if (fs.existsSync(DATA_FILE)) {
    try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch (e) {}
  }
  return { accounts: PRESET_ACCOUNTS.map(a => ({ ...a })), scores: {}, friends: {} };
}
function save() {
  try { fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2)); } catch (e) {}
}

let db = load();
// 合并预设账户（防止重复 / 缺失）
for (const a of PRESET_ACCOUNTS) {
  if (!db.accounts.find(x => x.uid === a.uid)) db.accounts.push({ ...a });
}
if (!db.scores) db.scores = {};
if (!db.friends) db.friends = {};
for (const a of db.accounts) {
  if (!db.scores[a.uid]) db.scores[a.uid] = [];
  if (!db.friends[a.uid]) db.friends[a.uid] = [];
}

const sessions = new Map(); // token -> uid
const wsClients = new Map(); // uid -> WebSocket

const findAccount = uid => db.accounts.find(a => a.uid === uid);
const online = uid => wsClients.has(uid);

// ==================== HTTP 服务 ====================
const app = express();
app.use(express.json());
app.use(express.static(__dirname));

app.get('/api/accounts', (req, res) => {
  res.json(db.accounts.map(a => ({ uid: a.uid, name: a.name })));
});

// 登录
app.post('/api/login', (req, res) => {
  const uid = String(req.body?.uid || '').trim().toUpperCase();
  const password = String(req.body?.password || '');
  const acc = findAccount(uid);
  if (!acc) return res.status(401).json({ error: '账户不存在' });
  if (password !== PASSWORD) return res.status(401).json({ error: '密码错误' });
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, acc.uid);
  res.json({ token, uid: acc.uid, name: acc.name });
});

// 退出登录
app.post('/api/logout', (req, res) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (sessions.delete(token)) return res.json({ ok: true });
  res.status(401).json({ error: '无效会话' });
});

// 鉴权中间件
function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const uid = sessions.get(token);
  if (!uid) return res.status(401).json({ error: '未登录' });
  req.uid = uid;
  next();
}

app.get('/api/me', auth, (req, res) => {
  const acc = findAccount(req.uid);
  res.json({ uid: acc.uid, name: acc.name });
});

// 修改昵称
app.post('/api/name', auth, (req, res) => {
  const name = String(req.body?.name || '').trim().slice(0, 16);
  if (!name) return res.status(400).json({ error: '昵称不能为空' });
  const acc = findAccount(req.uid);
  acc.name = name;
  save();
  // 通知好友昵称变化
  for (const [u, ws] of wsClients) {
    if ((db.friends[u] || []).includes(req.uid) && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'rename', uid: req.uid, name }));
    }
  }
  res.json({ name });
});

// ==================== 战绩 ====================
app.get('/api/scores', auth, (req, res) => {
  const list = (db.scores[req.uid] || []).slice().reverse();
  res.json(list);
});

app.post('/api/scores', auth, (req, res) => {
  const rec = {
    score: Math.max(0, Math.floor(+req.body?.score || 0)),
    kills: Math.max(0, Math.floor(+req.body?.kills || 0)),
    mode: String(req.body?.mode || 'solo'),
    ts: Date.now(),
  };
  (db.scores[req.uid] ||= []).push(rec);
  if (db.scores[req.uid].length > 100) db.scores[req.uid].shift();
  save();
  res.json({ ok: true });
});

// 排行榜（每个账户最高分）
app.get('/api/leaderboard', (req, res) => {
  const rows = db.accounts.map(a => {
    const sc = db.scores[a.uid] || [];
    const best = sc.reduce((m, s) => Math.max(m, s.score), 0);
    return { uid: a.uid, name: a.name, best, online: online(a.uid) };
  }).sort((x, y) => y.best - x.best);
  res.json(rows);
});

// ==================== 好友 ====================
app.get('/api/friends', auth, (req, res) => {
  const list = (db.friends[req.uid] || []).map(uid => {
    const acc = findAccount(uid);
    return { uid, name: acc ? acc.name : uid, online: online(uid) };
  });
  res.json(list);
});

app.post('/api/friends', auth, (req, res) => {
  const target = String(req.body?.uid || '').trim().toUpperCase();
  const acc = findAccount(target);
  if (!acc) return res.status(404).json({ error: '未找到该 UID 的账户' });
  if (target === req.uid) return res.status(400).json({ error: '不能添加自己' });
  const list = (db.friends[req.uid] ||= []);
  if (!list.includes(target)) { list.push(target); save(); }
  res.json({ ok: true, uid: target, name: acc.name, online: online(target) });
});

app.delete('/api/friends/:uid', auth, (req, res) => {
  const target = req.params.uid.toUpperCase();
  db.friends[req.uid] = (db.friends[req.uid] || []).filter(u => u !== target);
  save();
  res.json({ ok: true });
});

// ==================== WebSocket（在线状态 + 邀请 + 房间信令） ====================
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

function send(uid, obj) {
  const ws = wsClients.get(uid);
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}

function broadcastPresence(uid, isOnline) {
  const acc = findAccount(uid);
  for (const [u, ws] of wsClients) {
    if ((db.friends[u] || []).includes(uid) && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'presence', uid, name: acc?.name, online: isOnline }));
    }
  }
}

function handleMessage(ws, msg) {
  const from = ws.uid;
  switch (msg.type) {
    case 'invite': {
      const to = String(msg.to || '').toUpperCase();
      if (!findAccount(to)) return;
      if (!online(to)) { send(from, { type: 'invite-fail', to, reason: '对方不在线' }); return; }
      send(to, { type: 'invite', from, fromName: findAccount(from).name });
      break;
    }
    case 'invite-accept':
      send(String(msg.to || '').toUpperCase(), { type: 'invite-accepted', from, fromName: findAccount(from).name });
      break;
    case 'invite-decline':
      send(String(msg.to || '').toUpperCase(), { type: 'invite-declined', from, fromName: findAccount(from).name });
      break;
    case 'room-offer':
      // 房主把 PeerJS 房间码发给好友，好友自动加入
      send(String(msg.to || '').toUpperCase(), { type: 'room-offer', from, fromName: findAccount(from).name, code: msg.code });
      break;
  }
}

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, 'http://x');
  const token = url.searchParams.get('token');
  const uid = sessions.get(token);
  if (!uid) { ws.close(4001, 'unauthorized'); return; }
  ws.uid = uid;
  wsClients.set(uid, ws);
  broadcastPresence(uid, true);

  ws.on('message', data => {
    let msg;
    try { msg = JSON.parse(data); } catch (e) { return; }
    if (msg && msg.type) handleMessage(ws, msg);
  });
  ws.on('close', () => {
    if (wsClients.get(uid) === ws) wsClients.delete(uid);
    broadcastPresence(uid, false);
  });
});

server.listen(PORT, () => {
  console.log('雷霆战机服务器已启动');
  console.log('  本地: http://localhost:' + PORT);
  console.log('  账户: ' + db.accounts.map(a => a.uid).join(', '));
  console.log('  密码: ' + PASSWORD);
});
