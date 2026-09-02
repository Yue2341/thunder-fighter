// ============================================================
// 雷霆战机 · ui.js —— 界面与社交（登录/菜单/好友/房间/流程编排）
// 说明：最后加载；启动入口（bootstrap + 主循环）在本文件末尾
// ============================================================
  // ==================== 网络 / 账号状态 ====================
  let token = localStorage.getItem('thunder.token') || null;
  let me = { uid: '', name: '' };
  let ws = null;
  let wsRetry = null;
  let friends = [];       // [{uid,name,online}]
  let selectedUid = null;
  let inviteState = null; // { role:'host'|'guest', peerUid, peerName }

  const $ = id => document.getElementById(id);
  const screens = { login: $('login'), menu: $('menu'), room: $('room'), over: $('over') };
  const hud = $('hud'), scoreEl = $('score'), highEl = $('high'), livesEl = $('lives'), powerBars = $('powerBars');

  function showScreen(name) {
    for (const k in screens) screens[k].classList.toggle('hidden', k !== name);
    hud.classList.toggle('hidden', name !== 'game');
    if (name === 'game') $('pauseMenu').classList.add('hidden');
  }

  let toastTimer = null;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
  }

  async function api(path, opts = {}) {
    const res = await fetch(path, {
      method: opts.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': 'Bearer ' + token } : {}),
        ...(opts.headers || {}),
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || '请求失败');
    return data;
  }

  // ==================== 数据存储（本地最高分） ====================
  const Store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
    getHigh() { return this.get('thunder.high', 0); },
    setHigh(v) { this.set('thunder.high', v); },
  };

  // ==================== 账号 / 登录 ====================
  async function loadAccounts() {
    try {
      const list = await api('/api/accounts');
      const grid = $('accGrid');
      grid.innerHTML = '';
      for (const a of list) {
        const card = document.createElement('div');
        card.className = 'acc-card';
        card.dataset.uid = a.uid;
        card.innerHTML = `<div class="nm">${a.name}</div><div class="id">${a.uid}</div>`;
        card.onclick = () => {
          document.querySelectorAll('.acc-card').forEach(c => c.classList.remove('sel'));
          card.classList.add('sel');
          selectedUid = a.uid;
        };
        grid.appendChild(card);
      }
    } catch (e) {
      $('loginStatus').textContent = '⚠ 无法连接服务器';
    }
  }

  async function doLogin() {
    if (!selectedUid) { $('loginStatus').textContent = '请先选择一个账户'; return; }
    const password = $('pwdInput').value;
    $('loginStatus').textContent = '登录中...';
    try {
      const data = await api('/api/login', { method: 'POST', body: { uid: selectedUid, password } });
      token = data.token;
      me = { uid: data.uid, name: data.name };
      localStorage.setItem('thunder.token', token);
      connectWS();
      await loadMenu();
      showScreen('menu');
      // 打开邀请链接时，登录后自动加入房间
      if (window._pendingRoom) {
        setTimeout(() => { initAudio(); startManualGuest(window._pendingRoom); }, 400);
        window._pendingRoom = null;
      }
    } catch (e) {
      $('loginStatus').textContent = '⚠ ' + e.message;
    }
  }

  function logout() {
    try { api('/api/logout', { method: 'POST' }); } catch (e) {}
    wsClose();
    token = null; me = { uid: '', name: '' };
    localStorage.removeItem('thunder.token');
    selectedUid = null;
    showScreen('login');
    loadAccounts();
  }


  function onWS(msg) {
    switch (msg.type) {
      case 'presence':
        const f = friends.find(x => x.uid === msg.uid);
        if (f) { f.online = msg.online; if (msg.name) f.name = msg.name; renderFriends(); }
        break;
      case 'invite':
        // 收到邀请
        if (running || inviteState) { wsSend({ type: 'invite-decline', to: msg.from }); return; }
        inviteState = { role: 'guest', peerUid: msg.from, peerName: msg.fromName };
        $('inviteTitle').textContent = '⚔️ 对战邀请';
        $('inviteText').textContent = `${msg.fromName} 邀请你一起游玩，是否接受？`;
        $('inviteModal').classList.remove('hidden');
        break;
      case 'invite-accepted':
        toast(`${msg.fromName} 已接受邀请，正在创建房间...`);
        startHostViaInvite(msg.from);
        break;
      case 'invite-declined':
        toast(`${msg.fromName} 拒绝了邀请`);
        inviteState = null;
        break;
      case 'invite-fail':
        toast('对方不在线，无法邀请');
        inviteState = null;
        break;
      case 'room-offer':
        // 房主发来房间码，自动加入
        $('inviteModal').classList.add('hidden');
        toast(`正在加入 ${msg.fromName} 的房间...`);
        startGuestViaInvite(msg.from, msg.code);
        break;
    }
  }

  // ==================== 菜单 / 好友 / 战绩 ====================
  async function loadMenu() {
    $('myName').textContent = me.name;
    $('myUid').textContent = me.uid;
    $('avatar').textContent = (me.name || '?').charAt(0).toUpperCase();
    await Promise.all([loadFriends(), loadLeaderboard(), loadScores()]);
  }

  async function loadFriends() {
    try {
      friends = await api('/api/friends');
      renderFriends();
    } catch (e) {}
  }
  function renderFriends() {
    const el = $('friendList');
    $('friendCount').textContent = `(${friends.filter(f => f.online).length}/${friends.length} 在线)`;
    if (!friends.length) { el.innerHTML = '<div class="muted">暂无好友，输入好友 UID 添加</div>'; return; }
    el.innerHTML = friends.map(f => `
      <div class="friend-row">
        <span class="dot ${f.online ? 'on' : 'off'}"></span>
        <span class="fname">${f.name}</span>
        <span class="fuid">${f.uid}</span>
        ${f.online ? `<button class="btn small" data-invite="${f.uid}">邀请</button>` : `<span class="muted">离线</span>`}
        <button class="btn small ghost" data-del="${f.uid}">✕</button>
      </div>`).join('');
    el.querySelectorAll('[data-invite]').forEach(b => b.onclick = () => inviteFriend(b.dataset.invite));
    el.querySelectorAll('[data-del]').forEach(b => b.onclick = () => removeFriend(b.dataset.del));
  }

  async function addFriend() {
    const uid = $('addFriendInput').value.trim().toUpperCase();
    if (!uid) return;
    try {
      await api('/api/friends', { method: 'POST', body: { uid } });
      $('addFriendInput').value = '';
      toast('已添加好友');
      await loadFriends();
    } catch (e) { toast('⚠ ' + e.message); }
  }
  async function removeFriend(uid) {
    try {
      await api('/api/friends/' + uid, { method: 'DELETE' });
      await loadFriends();
    } catch (e) {}
  }

  async function loadLeaderboard() {
    try {
      const rows = await api('/api/leaderboard');
      $('lbList').innerHTML = rows.slice(0, 10).map((r, i) => `
        <div class="lb-row">
          <span style="width:22px;color:#ffd94d;text-align:center">${i + 1}</span>
          <span class="dot ${r.online ? 'on' : 'off'}"></span>
          <span class="fname">${r.name}</span>
          <span class="fuid">${r.uid}</span>
          <span style="color:#ffd94d;margin-left:auto">${r.best}</span>
        </div>`).join('') || '<div class="muted">暂无数据</div>';
    } catch (e) {}
  }
  async function loadScores() {
    try {
      const list = await api('/api/scores');
      const fmt = ts => { const d = new Date(ts); const p = n => String(n).padStart(2, '0'); return `${d.getMonth() + 1}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`; };
      $('myScores').innerHTML = list.slice(0, 5).map(s => `
        <div class="friend-row">
          <span class="fname">${fmt(s.ts)} · ${s.mode === 'solo' ? '单人' : '联机'}</span>
          <span style="color:#ffd94d;margin-left:auto">${s.score}分</span>
          <span class="muted">击落${s.kills}</span>
        </div>`).join('') || '<div class="muted">暂无记录</div>';
    } catch (e) {}
  }

  // ==================== 邀请 / 联机流程 ====================
  function inviteFriend(uid) {
    if (!uid) return;
    inviteState = { role: 'host', peerUid: uid };
    wsSend({ type: 'invite', to: uid });
    toast('已发送邀请，等待对方回应...');
  }

  function startHostViaInvite(peerUid) {
    inviteState = { role: 'host', peerUid, peerName: '' };
    if (!Net.available()) { toast('⚠ 网络模块加载失败'); inviteState = null; return; }
    mode = 'host';
    waitingForGuest = true;
    initGame(2);
    $('roomHint').textContent = '已邀请好友，等待加入...';
    $('roomStatus').textContent = '等待好友加入...';
    $('btnCopy').style.display = 'none';
    showScreen('room');
    Net.host();
  }

  function startGuestViaInvite(fromUid, code) {
    if (!Net.available()) { toast('⚠ 网络模块加载失败'); return; }
    mode = 'guest';
    initView();
    $('roomHint').textContent = '正在连接好友房间...';
    $('roomStatus').textContent = '正在连接...';
    $('btnCopy').style.display = 'none';
    showScreen('room');
    initAudio();
    Net.join(code);
    startBGM();
  }

  // ==================== 初始化 Net 回调 ====================
  Net.onOpen = code => { $('roomCode').textContent = code; };
  Net.onGuestJoin = () => {
    if (mode === 'host') {
      waitingForGuest = false;
      $('roomStatus').textContent = '好友已加入！';
      sfx.join();
      showScreen('game');
    }
  };
  Net.onPeerLeft = () => {
    if (mode === 'host' && running) {
      toast('好友已离开');
      $('roomStatus').textContent = '对方已离开';
      showScreen('room');
    } else if (mode === 'host') {
      $('roomStatus').textContent = '对方已离开，等待新玩家...';
      waitingForGuest = true;
    }
  };
  Net.onConnected = () => { $('roomStatus').textContent = '已连接，等待房主开始...'; };
  Net.onHostLeft = () => {
    if (running) endGame();
    toast('房主已离开');
    showScreen('menu');
    loadMenu();
  };
  Net.onError = e => {
    if (e.type === 'peer-unavailable') {
      toast('⚠ 未找到该房间，请确认房间码');
      showScreen('menu');
      loadMenu();
    }
  };

  // ==================== 开始游戏（单人 / 房间） ====================
  function startSolo() {
    mode = 'solo';
    initGame(1);
    showScreen('game');
    startBGM();
  }
  function startManualHost() {
    if (!Net.available()) { toast('⚠ 网络模块加载失败'); return; }
    mode = 'host';
    waitingForGuest = true;
    inviteState = null;
    initGame(2);
    $('roomHint').textContent = '房间码（分享给好友）';
    $('roomStatus').textContent = '等待玩家加入...';
    $('btnCopy').style.display = '';
    showScreen('room');
    Net.host();
    startBGM();
  }
  function startManualGuest(code) {
    if (!Net.available()) { toast('⚠ 网络模块加载失败'); return; }
    mode = 'guest';
    initView();
    $('roomHint').textContent = '正在连接房间...';
    $('roomStatus').textContent = '正在连接 ' + code + ' ...';
    $('btnCopy').style.display = 'none';
    showScreen('room');
    Net.join(code);
    startBGM();
  }

  function leaveRoom() {
    Net.close();
    running = false; paused = false;
    mode = 'solo'; game = null;
    inviteState = null;
    stopBGM();
    showScreen('menu');
    loadMenu();
  }

  // 暂停 / 退出
  function setPaused(v) {
    if (!running) return;
    paused = v;
    $('pauseMenu').classList.toggle('hidden', !v);
    if (v && game) $('pauseScore').textContent = '当前得分 ' + game.score;
  }

  function quitGame() {
    if (!running) return;
    running = false; paused = false;
    $('pauseMenu').classList.add('hidden');
    stopBGM();
    // 记录当前得分（中途退出也保存战绩）
    recordScore();
    // 联机时通知对方本局结束
    if (mode === 'host') Net.send({ t: 'over', score: game.score });
    if (mode === 'host' || mode === 'guest') Net.close();
    mode = 'solo'; game = null;
    inviteState = null;
    showScreen('menu');
    loadMenu();
  }

  // ==================== UI 事件 ====================
  $('btnLogin').addEventListener('click', () => { initAudio(); doLogin(); });
  $('pwdInput').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
  $('btnLogout').addEventListener('click', logout);
  $('btnEditName').addEventListener('click', editName);
  $('btnSolo').addEventListener('click', () => { initAudio(); startSolo(); });
  $('btnHost').addEventListener('click', () => { initAudio(); startManualHost(); });
  $('btnJoinRoom').addEventListener('click', () => {
    initAudio();
    const code = $('joinRoomInput').value.trim().toUpperCase();
    if (!code) { toast('请输入房间码'); return; }
    startManualGuest(code);
  });
  $('joinRoomInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') $('btnJoinRoom').click();
  });
  $('btnAddFriend').addEventListener('click', addFriend);
  $('addFriendInput').addEventListener('keydown', e => { if (e.key === 'Enter') addFriend(); });
  $('btnAccept').addEventListener('click', () => {
    $('inviteModal').classList.add('hidden');
    if (inviteState && inviteState.role === 'guest') {
      wsSend({ type: 'invite-accept', to: inviteState.peerUid });
      toast('已接受邀请，等待对方创建房间...');
    }
  });
  $('btnDecline').addEventListener('click', () => {
    $('inviteModal').classList.add('hidden');
    if (inviteState && inviteState.role === 'guest') wsSend({ type: 'invite-decline', to: inviteState.peerUid });
    inviteState = null;
  });
  $('btnCopy').addEventListener('click', async () => {
    const base = location.href.split('?')[0];
    const link = `${base}?room=${Net.code}&invite=${encodeURIComponent(me.name)}`;
    try {
      await navigator.clipboard.writeText(link);
      $('roomStatus').textContent = '✅ 邀请链接已复制，发给好友即可！';
    } catch (e) { $('roomStatus').textContent = '复制失败，请手动复制：' + link; }
  });
  $('btnLeave').addEventListener('click', leaveRoom);
  $('btnResume').addEventListener('click', () => setPaused(false));
  $('btnQuitGame').addEventListener('click', quitGame);
  $('btnHudQuit').addEventListener('click', () => { if (running) setPaused(true); });
  $('btnMusic').addEventListener('click', toggleBGM);
  $('btnRestart').addEventListener('click', () => {
    if (mode === 'solo') { initGame(1); showScreen('game'); }
    else if (mode === 'host') { initGame(2); Net.send({ t: 'restart' }); showScreen('game'); }
  });
  $('btnMenu').addEventListener('click', leaveRoom);

  function editName() {
    const cur = me.name;
    const input = document.createElement('input');
    input.type = 'text'; input.value = cur; input.maxLength = 16;
    input.style.cssText = 'padding:4px 8px;font-size:15px;width:120px;text-align:left;';
    const span = $('myName');
    span.innerHTML = '';
    span.appendChild(input);
    input.focus();
    const save = async () => {
      const name = input.value.trim();
      if (!name || name === cur) { $('myName').textContent = cur; return; }
      try {
        const r = await api('/api/name', { method: 'POST', body: { name } });
        me.name = r.name;
        $('myName').textContent = me.name;
        $('avatar').textContent = me.name.charAt(0).toUpperCase();
        toast('昵称已更新');
      } catch (e) { $('myName').textContent = cur; toast('⚠ ' + e.message); }
    };
    input.onblur = save;
    input.onkeydown = e => { if (e.key === 'Enter') input.blur(); };
  }

  // ==================== 启动 ====================
  async function bootstrap() {
    loadAccounts();
    // URL 带 ?room= 房间码：登录后自动加入
    const roomParam = (new URLSearchParams(location.search).get('room') || '').trim().toUpperCase();
    if (token) {
      try {
        const data = await api('/api/me');
        me = { uid: data.uid, name: data.name };
        connectWS();
        await loadMenu();
        showScreen('menu');
        if (roomParam) {
          window._pendingRoom = roomParam;
          setTimeout(() => { initAudio(); startManualGuest(roomParam); }, 500);
        }
      } catch (e) {
        token = null;
        localStorage.removeItem('thunder.token');
        showScreen('login');
        if (roomParam) {
          window._pendingRoom = roomParam;
          $('loginStatus').textContent = '登录后自动加入房间 ' + roomParam;
        }
      }
    } else {
      showScreen('login');
      if (roomParam) {
        window._pendingRoom = roomParam;
        $('loginStatus').textContent = '登录后自动加入房间 ' + roomParam;
      }
    }
  }

  bootstrap();
  requestAnimationFrame(loop);
