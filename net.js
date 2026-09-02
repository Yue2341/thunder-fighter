// ============================================================
// 雷霆战机 · net.js —— 联机（PeerJS P2P 房主权威快照 / WebSocket 信令）
// ============================================================
  // ==================== PeerJS 联机（游戏数据传输） ====================
  const Net = {
    peer: null, conn: null, code: null, stateTimer: 0,
    onOpen: null, onConnected: null, onGuestJoin: null, onPeerLeft: null, onHostLeft: null, onError: null,
    genCode() {
      const cs = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
      let s = 'T';
      for (let i = 0; i < 5; i++) s += cs[Math.floor(Math.random() * cs.length)];
      return s;
    },
    available() { return typeof Peer !== 'undefined'; },
    host() {
      const code = this.genCode();
      this.code = code;
      this.peer = new Peer(code, { debug: 0 });
      this.peer.on('open', () => this.onOpen && this.onOpen(code));
      this.peer.on('connection', conn => {
        if (this.conn) { conn.on('open', () => conn.close()); return; }
        this.conn = conn;
        conn.on('open', () => this.onGuestJoin && this.onGuestJoin());
        conn.on('data', d => this.onData(d));
        conn.on('close', () => { if (this.conn === conn) { this.conn = null; this.onPeerLeft && this.onPeerLeft(); } });
      });
      this.peer.on('error', e => { if (e.type === 'unavailable-id') { this.peer.destroy(); this.host(); } });
    },
    join(code) {
      this.code = code;
      this.peer = new Peer();
      this.peer.on('open', () => {
        const conn = this.peer.connect(code, { reliable: true });
        this.conn = conn;
        conn.on('open', () => this.onConnected && this.onConnected());
        conn.on('data', d => this.onData(d));
        conn.on('close', () => this.onHostLeft && this.onHostLeft());
      });
      this.peer.on('error', e => this.onError && this.onError(e));
    },
    onData(d) {
      if (!d || !d.t) return;
      if (mode === 'host') {
        if (d.t === 'input') { guestX = d.x; guestY = d.y; }
        else if (d.t === 'bomb') bomb(1);
      } else {
        if (d.t === 'state') applySnapshot(d);
        else if (d.t === 'over') {
          if (running) { running = false; $('finalScore').textContent = '最终得分 ' + d.score + '（联机合作）'; $('btnRestart').style.display = 'none'; recordScore(); showScreen('over'); }
        } else if (d.t === 'restart') { initView(); showScreen('game'); sfx.join(); }
      }
    },
    isHost() { return mode === 'host'; },
    send(obj) { if (this.conn && this.conn.open) this.conn.send(obj); },
    sendState() { if (this.conn && this.conn.open) this.send({ t: 'state', s: snapshot() }); },
    close() {
      try { if (this.conn) this.conn.close(); } catch (e) {}
      try { if (this.peer) this.peer.destroy(); } catch (e) {}
      this.conn = null; this.peer = null; this.code = null;
    },
  };

  function snapshot() {
    return {
      players: game.players.map(p => [p.x, p.y, p.power, p.inv, p.bombs]),
      lives: game.lives, maxLives: game.maxLives,
      enemies: game.enemies.map(e => [e.type, e.x, e.y, e.hp]),
      eBullets: game.eBullets.map(b => [b.x, b.y]),
      bullets: game.bullets.map(b => [b.x, b.y, b.vx]),
      powerups: game.powerups.map(p => [p.x, p.y, p.kind]),
      score: game.score, kills: game.kills, combo: game.combo, events: game.events,
    };
  }
  function applySnapshot(d) {
    const s = d.s;
    if (!game || !Array.isArray(game.players) || game.players.length < 2) initView();
    const self = game.players[1];
    const myX = self.x, myY = self.y;
    game.players[0] = Object.assign(game.players[0] || {}, { x: s.players[0][0], y: s.players[0][1], power: s.players[0][2], inv: s.players[0][3], bombs: s.players[0][4], r: 16, color: PLAYER_COLORS[0] });
    game.players[1] = Object.assign(game.players[1] || {}, { x: myX, y: myY, power: s.players[1][2], inv: s.players[1][3], bombs: s.players[1][4], r: 16, color: PLAYER_COLORS[1] });
    game.lives = s.lives; game.maxLives = s.maxLives; game.score = s.score;
    game.kills = s.kills || 0;                 // 房客也累计击落数（此前战绩击落恒为 0）
    if (typeof s.combo === 'number') game.combo = s.combo; // 连击数同步显示
    game.enemies = s.enemies.map(e => ({ type: e[0], x: e[1], y: e[2], hp: e[3], maxHp: ENEMY_TYPES[e[0]].hp, r: ENEMY_TYPES[e[0]].r, color: ENEMY_TYPES[e[0]].color }));
    game.eBullets = s.eBullets.map(b => ({ x: b[0], y: b[1], r: 6 }));
    game.bullets = s.bullets.map(b => ({ x: b[0], y: b[1], vx: b[2], vy: -720, r: 5 }));
    game.powerups = s.powerups.map(p => ({ x: p[0], y: p[1], kind: p[2], r: 13 }));
    for (const ev of s.events) {
      explode(ev[0], ev[1], ev[2], ev[3], 220);
      if (ev[4] && sfx[ev[4]]) sfx[ev[4]]();
    }
    updateHUD();
    if (!running) { running = true; showScreen('game'); }
  }
  function initView() {
    game = {
      players: [new Player(0), new Player(1)],
      lives: 5, maxLives: 5, bullets: [], eBullets: [], enemies: [], powerups: [],
      particles: [], events: [], texts: [], rings: [], stars: Array.from({ length: 70 }, () => new Star()),
      score: 0, kills: 0, combo: 0, comboTimer: 0, hitStop: 0, banner: null, time: 0,
      shake: 0,
    };
    updateHUD();
  }

  // ==================== WebSocket ====================
  function connectWS() {
    wsClose();
    if (!token) return;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${proto}://${location.host}/ws?token=${token}`);
    ws.onmessage = e => { try { onWS(JSON.parse(e.data)); } catch (err) {} };
    ws.onclose = () => { ws = null; if (token && !document.hidden) { clearTimeout(wsRetry); wsRetry = setTimeout(connectWS, 3000); } };
  }
  function wsClose() { clearTimeout(wsRetry); if (ws) { try { ws.close(); } catch (e) {} ws = null; } }
  function wsSend(obj) { if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj)); }
