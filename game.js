// ============================================================
// 雷霆战机 · game.js —— 游戏引擎（音频/实体/逻辑/渲染/输入）
// 说明：与 net.js / ui.js 按顺序加载，共享全局作用域（同浏览器多 <script> 语义）
// ============================================================
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;

  // ==================== 音效 ====================
  let actx = null;
  function initAudio() { if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume(); }
  function beep(freq, dur, type = 'square', vol = 0.12, slide = 0) {
    if (!actx) return;
    const t = actx.currentTime;
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(actx.destination);
    o.start(t); o.stop(t + dur);
  }
  const sfx = {
    shoot() { beep(880, 0.05, 'square', 0.05, -400); },
    // 音调随连击升高（pitch=连击数，封顶 24）
    boom(pitch = 0) { beep(120 * (1 + Math.min(pitch, 24) * 0.04), 0.3, 'sawtooth', 0.2, -80); },
    hit() { beep(200, 0.15, 'square', 0.15, -120); },
    power() { beep(520, 0.12, 'triangle', 0.18, 300); beep(780, 0.14, 'triangle', 0.16, 300); },
    bomb() { beep(60, 0.7, 'sawtooth', 0.3, -30); },
    over() { beep(400, 0.6, 'sawtooth', 0.18, -360); },
    join() { beep(660, 0.1, 'triangle', 0.2, 200); beep(990, 0.15, 'triangle', 0.2, 200); },
  };

  // ==================== 背景音乐（经典雷霆战机风格，Web Audio 实时合成） ====================
  const MIDI = n => 440 * Math.pow(2, (n - 69) / 12);
  let bgmOn = true;
  let bgmTimer = null;
  let bgmNextTime = 0;
  let bgmStep = 0;
  const BGM_STEP = 60 / 138 / 4; // BPM 138，16 分音符时长
  // 主旋律（64 步，Am-F-C-G 循环，0=休止）
  const BGM_MELODY = [
    69,0,69,0,72,0,69,0,76,0,74,0,72,0,71,0,
    65,0,65,0,69,0,65,0,72,0,71,0,69,0,67,0,
    64,0,64,0,67,0,64,0,71,0,69,0,67,0,65,0,
    62,0,62,0,65,0,62,0,69,0,67,0,65,0,64,0,
  ];
  // 贝斯根音（A2 F2 C2 G2，每 2 步一个）
  const BGM_BASS = [45,41,36,43].map(n => [n,n,n,n,n,n,n,n]).flat();
  // 鼓点步位
  const BGM_KICK = [0, 12, 16, 28, 32, 44, 48, 60];
  const BGM_SNARE = [8, 24, 40, 56];

  function bgmTone(freq, time, dur, type, vol) {
    if (!actx || !bgmOn) return;
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, time);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    o.connect(g).connect(actx.destination);
    o.start(time); o.stop(time + dur + 0.02);
  }
  function bgmKick(time) {
    if (!actx || !bgmOn) return;
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(160, time);
    o.frequency.exponentialRampToValueAtTime(45, time + 0.1);
    g.gain.setValueAtTime(0.5, time);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.13);
    o.connect(g).connect(actx.destination);
    o.start(time); o.stop(time + 0.15);
  }
  function bgmNoise(time, dur, vol, hpFreq) {
    if (!actx || !bgmOn) return;
    const len = Math.max(1, Math.ceil(actx.sampleRate * dur));
    const buf = actx.createBuffer(1, len, actx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = actx.createBufferSource();
    src.buffer = buf;
    const f = actx.createBiquadFilter();
    f.type = 'highpass'; f.frequency.value = hpFreq;
    const g = actx.createGain();
    g.gain.setValueAtTime(vol, time);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    src.connect(f).connect(g).connect(actx.destination);
    src.start(time); src.stop(time + dur + 0.02);
  }
  function scheduleBGM() {
    if (!actx) return;
    while (bgmNextTime < actx.currentTime + 0.12) {
      const step = bgmStep % 64;
      const t = bgmNextTime;
      const m = BGM_MELODY[step];
      if (m) bgmTone(MIDI(m), t, BGM_STEP * 0.9, 'square', 0.04);
      if (step % 2 === 0) bgmTone(MIDI(BGM_BASS[step] - 12), t, BGM_STEP * 1.7, 'sawtooth', 0.05);
      if (BGM_KICK.includes(step)) bgmKick(t);
      if (BGM_SNARE.includes(step)) bgmNoise(t, 0.1, 0.1, 1800);
      if (step % 2 === 1) bgmNoise(t, 0.03, 0.025, 6000);
      bgmNextTime += BGM_STEP;
      bgmStep++;
    }
  }
  function startBGM() {
    if (!actx || bgmTimer || !bgmOn) return;
    bgmNextTime = actx.currentTime + 0.05;
    bgmStep = 0;
    bgmTimer = setInterval(scheduleBGM, 25);
  }
  function stopBGM() {
    if (bgmTimer) { clearInterval(bgmTimer); bgmTimer = null; }
  }
  function toggleBGM() {
    bgmOn = !bgmOn;
    if (bgmOn) { initAudio(); startBGM(); } else stopBGM();
    const b = $('btnMusic');
    if (b) { b.textContent = bgmOn ? '🎵' : '🔇'; b.title = bgmOn ? '关闭背景音乐' : '打开背景音乐'; }
  }

  // ==================== 工具 ====================
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const dist2 = (ax, ay, bx, by) => (ax - bx) ** 2 + (ay - by) ** 2;
  function circleHit(a, b) { const r = a.r + b.r; return dist2(a.x, a.y, b.x, b.y) < r * r; }

  const ENEMY_TYPES = [
    { r: 14, hp: 1, speed: 150, score: 100, color: '#e8556d' },
    { r: 17, hp: 2, speed: 105, score: 200, color: '#c86be8' },
    { r: 20, hp: 4, speed: 90,  score: 350, color: '#e8972e' },
    { r: 34, hp: 60, speed: 45, score: 5000, color: '#ff4455' },
  ];

  class Particle {
    constructor(x, y, color, speed, life, size) {
      this.x = x; this.y = y;
      const a = rand(0, Math.PI * 2), s = rand(0.3, 1) * speed;
      this.vx = Math.cos(a) * s; this.vy = Math.sin(a) * s;
      this.life = life; this.maxLife = life;
      this.size = size || rand(1.5, 4); this.color = color;
    }
    update(dt) { this.x += this.vx * dt; this.y += this.vy * dt; this.vx *= 0.98; this.vy *= 0.98; this.life -= dt; }
  }
  function explode(x, y, color, n = 22, speed = 220, sound = '') {
    for (let i = 0; i < n; i++) game.particles.push(new Particle(x, y, color, speed, rand(0.25, 0.7), rand(1.5, 4.5)));
    if (game.events) game.events.push([x, y, color, n, sound]);
  }

  class Star {
    constructor() { this.reset(true); }
    reset(init) { this.x = rand(0, W); this.y = init ? rand(0, H) : -5; this.speed = rand(40, 180); this.size = rand(0.5, 2.2); this.tw = rand(0.3, 1); }
    update(dt) { this.y += this.speed * dt; if (this.y > H) this.reset(false); }
  }

  // ==================== 玩家 ====================
  const PLAYER_COLORS = ['#4db8ff', '#4dff88'];
  class Player {
    constructor(index) {
      this.index = index;
      this.x = W / 2 + (index ? 40 : 0);
      this.y = H - 90;
      this.r = 16; this.speed = 320;
      this.power = 1; this.bombs = 2; this.inv = 0;
      this.shootCd = 0; this.shootRate = 0.14; this.trail = 0;
      this.color = PLAYER_COLORS[index] || '#4db8ff';
    }
    applyInput(dt) {
      if (keys.has('ArrowLeft') || keys.has('a')) this.x -= this.speed * dt;
      if (keys.has('ArrowRight') || keys.has('d')) this.x += this.speed * dt;
      if (keys.has('ArrowUp') || keys.has('w')) this.y -= this.speed * dt;
      if (keys.has('ArrowDown') || keys.has('s')) this.y += this.speed * dt;
      if (mouse.active) {
        this.x += (mouse.x - this.x) * Math.min(1, dt * 14);
        this.y += (mouse.y - this.y) * Math.min(1, dt * 14);
      }
      this.clamp();
    }
    clamp() { this.x = clamp(this.x, 20, W - 20); this.y = clamp(this.y, 50, H - 20); }
    tick(dt) {
      if (this.inv > 0) this.inv -= dt;
      if (this.shootCd > 0) this.shootCd -= dt;
      this.trail -= dt;
      if (this.trail <= 0) {
        this.trail = 0.03;
        game.particles.push(new Particle(this.x + rand(-4, 4), this.y + 18,
          this.index === 1 ? '#7cffa0' : rand(0, 1) < 0.5 ? '#ffaa33' : '#33ccff', 90, 0.35, rand(1.5, 3)));
      }
      if (this.shootCd <= 0) this.shoot();
    }
    shoot() {
      this.shootCd = this.shootRate;
      const p = this.power, bx = this.x, by = this.y;
      const list = [];
      if (p === 1) list.push([bx, by - 20, 0]);
      else if (p === 2) list.push([bx - 9, by - 14, 0], [bx + 9, by - 14, 0]);
      else if (p === 3) list.push([bx, by - 22, 0], [bx - 12, by - 12, 0], [bx + 12, by - 12, 0]);
      else if (p === 4) list.push([bx - 9, by - 16, -0.16], [bx + 9, by - 16, 0.16], [bx - 15, by - 10, 0], [bx + 15, by - 10, 0]);
      else list.push([bx, by - 24, 0], [bx - 10, by - 16, -0.22], [bx + 10, by - 16, 0.22], [bx - 18, by - 10, 0], [bx + 18, by - 10, 0]);
      for (const [x, y, dir] of list) game.bullets.push({ x, y, vx: dir * 260, vy: -720, r: 5 });
      sfx.shoot();
    }
  }

  class Enemy {
    constructor(type, x, y) {
      this.type = type;
      const t = ENEMY_TYPES[type];
      this.x = x !== undefined ? x : rand(25, W - 25);
      this.y = y !== undefined ? y : -30;
      this.r = t.r;
      // 随时间增加小兵血量（游戏 20 秒后开始强化，120 秒后达到 +100%）
      const timeBonus = Math.min(1, Math.max(0, (game.time - 20) / 100));
      this.hp = this.maxHp = Math.round(t.hp * (1 + timeBonus));
      this.speed = t.speed * rand(0.85, 1.2);
      this.vx = type === 1 ? rand(-60, 60) : 0;
      this.score = Math.round(t.score * (1 + timeBonus * 0.5)); this.color = t.color;
      this.shootCd = type >= 1 ? rand(0.8, 1.6) : Infinity;
      this.wobble = rand(0, Math.PI * 2);
      this.dead = false;
      this.flash = 0; // 受击白闪计时
    }
    update(dt) {
      if (this.flash > 0) this.flash -= dt;
      this.y += this.speed * dt;
      if (this.type === 2) {
        this.x += Math.sin(this.y * 0.02 + this.wobble) * 40 * dt;
      } else if (this.type === 1) {
        this.x += this.vx * dt;
        if (this.x < 20 || this.x > W - 20) this.vx *= -1;
        this.shootCd -= dt;
        if (this.shootCd <= 0 && this.y > 0 && this.y < H - 200) {
          this.shootCd = rand(0.9, 1.7);
          game.eBullets.push({ x: this.x, y: this.y + 18, vx: 0, vy: 260, r: 6 });
        }
      } else if (this.type === 3) {
        this.x = W / 2 + Math.sin(this.y * 0.01) * 80;
        this.shootCd -= dt;
        if (this.shootCd <= 0 && this.y > 40 && this.y < H - 300) {
          this.shootCd = 0.5;
          for (let i = -2; i <= 2; i++) game.eBullets.push({ x: this.x + i * 18, y: this.y + 30, vx: i * 30, vy: 240, r: 6 });
        }
      }
      if (this.y > H + 50) this.dead = true;
    }
  }

  class PowerUp {
    constructor(x, y, kind) { this.x = x; this.y = y; this.kind = kind; this.r = 13; this.vy = 110; this.dead = false; this.t = 0; }
    update(dt) { this.t += dt; this.y += this.vy * dt; this.x += Math.sin(this.t * 3) * 30 * dt; if (this.y > H + 20) this.dead = true; }
  }

  // ==================== 游戏状态 ====================
  let game = null;
  let running = false, paused = false;
  let mode = 'solo';
  let waitingForGuest = false;
  let guestX = W / 2 + 40, guestY = H - 90;

  function initGame(playerCount) {
    game = {
      players: Array.from({ length: playerCount }, (_, i) => new Player(i)),
      lives: playerCount === 1 ? 3 : 5,
      maxLives: playerCount === 1 ? 3 : 5,
      bullets: [], eBullets: [], enemies: [], powerups: [],
      particles: [], events: [], texts: [],
      stars: Array.from({ length: 70 }, () => new Star()),
      score: 0, kills: 0,
      combo: 0, comboTimer: 0,   // 连击：2 秒内连续击杀累计，中断归零
      hitStop: 0,                // 受击顿帧（击杀瞬间短暂冻结，放大打击感）
      banner: null,              // 全屏横幅（Boss WARNING 等）
      spawnTimer: 0, nextBossTime: 30, bossSpawned: false,
      time: 0, shake: 0,
    };
    running = true; paused = false;
    updateHUD();
  }

  function updateHUD() {
    if (!game) return;
    scoreEl.textContent = game.score;
    highEl.textContent = Store.getHigh();
    livesEl.textContent = '❤'.repeat(Math.min(game.lives, 6)) + '🖤'.repeat(Math.max(0, game.maxLives - game.lives));
    if (mode === 'solo') {
      powerBars.innerHTML = `<div class="bar-wrap">火力<div class="power-bar"><div class="power-fill" id="pf0"></div></div></div>`;
      document.getElementById('pf0').style.width = (game.players[0].power / 5 * 100) + '%';
    } else {
      powerBars.innerHTML = `<div class="bar-wrap" style="color:#4db8ff">P1<div class="power-bar"><div class="power-fill" id="pf0"></div></div></div>
        <div class="bar-wrap" style="color:#4dff88">P2<div class="power-bar"><div class="power-fill p2" id="pf1"></div></div></div>`;
      document.getElementById('pf0').style.width = (game.players[0].power / 5 * 100) + '%';
      document.getElementById('pf1').style.width = (game.players[1].power / 5 * 100) + '%';
    }
  }

  function spawnEnemy() {
    const t = game.time, r = Math.random();
    let type;
    if (t < 8) type = r < 0.75 ? 0 : 1;
    else if (t < 20) type = r < 0.5 ? 0 : (r < 0.85 ? 1 : 2);
    else type = r < 0.35 ? 0 : (r < 0.7 ? 1 : 2);
    game.enemies.push(new Enemy(type));
  }
  function spawnBoss() {
    if (game.bossSpawned) return;
    game.bossSpawned = true;
    game.nextBossTime = game.time + 45; // 45 秒后下一波 Boss
    const boss = new Enemy(3);
    // Boss 血量随时间递增：第一波 60，之后每波 +70%
    const wave = Math.floor(game.time / 45) + 1;
    let hp = Math.round(60 * (1 + (wave - 1) * 0.7));
    if (game.players.length > 1) hp = Math.round(hp * 1.5);
    boss.hp = boss.maxHp = hp;
    game.enemies.push(boss);
    // Boss 出场警示横幅
    game.banner = { text: '⚠ WARNING ⚠', sub: `第 ${wave} 波 Boss 来袭`, life: 2.2, maxLife: 2.2, color: '#ff4455' };
    sfx.join();
  }
  function dropPowerUp(x, y) {
    const r = Math.random();
    game.powerups.push(new PowerUp(x, y, r < 0.45 ? 'P' : r < 0.7 ? 'H' : 'B'));
  }

  // ==================== 打击感反馈（震屏分级 / 飘字 / 连击 / 顿帧） ====================
  function addShake(v) { game.shake = Math.max(game.shake, v); }
  function spawnText(x, y, text, color) {
    game.texts.push({ x, y, text, color: color || '#ffd94d', life: 0.8, maxLife: 0.8 });
  }
  function comboMult() { return game.combo >= 20 ? 3 : game.combo >= 8 ? 2 : 1; }
  // 统一击杀奖励：连击计数 + 倍率得分 + 飘字 + 顿帧 + 分级震屏 + 升调音效
  function killReward(e) {
    game.kills++;
    game.combo++;
    game.comboTimer = 2;
    const mult = comboMult();
    const gain = Math.round(e.score * mult);
    addScore(gain);
    spawnText(e.x, e.y - e.r, '+' + gain, mult > 1 ? '#ff8844' : '#ffd94d');
    if (game.combo >= 5 && game.combo % 5 === 0) spawnText(e.x, e.y - e.r - 24, 'COMBO x' + game.combo, '#ff66dd');
    game.hitStop = e.type === 3 ? 0.09 : 0.03;
    addShake(e.type === 3 ? 0.8 : e.type === 2 ? 0.22 : 0.12);
    sfx.boom(game.combo);
  }

  function playerHit(idx) {
    const p = game.players[idx];
    if (!p || p.inv > 0) return;
    game.lives--;
    p.power = Math.max(1, p.power - 1);
    p.inv = 2;
    explode(p.x, p.y, '#ff6b6b', 16, 180, 'hit');
    sfx.hit();
    addShake(0.4); // 玩家受击重震
    updateHUD();
    if (game.lives <= 0) endGame();
  }

  function bomb(idx) {
    const p = game.players[idx];
    if (!p || p.bombs <= 0) return;
    p.bombs--; sfx.bomb(); addShake(0.55);
    game.eBullets = [];
    for (const e of game.enemies) {
      e.hp -= 15;
      e.flash = 0.07;
      explode(e.x, e.y, '#ffcc00', 10, 180, 'boom');
      if (e.hp <= 0) {
        e.dead = true; killReward(e);
        if (e.type === 3) game.bossSpawned = false; // Boss 被炸弹击杀后允许下一波
      }
    }
    for (let i = 0; i < 40; i++) game.particles.push(new Particle(rand(0, W), rand(0, H), '#ffd94d', 500, 0.5, rand(2, 5)));
  }

  function addScore(n) {
    game.score += n;
    if (game.score > Store.getHigh()) Store.setHigh(game.score);
    updateHUD();
  }

  async function recordScore() {
    if (!token || !game) return;
    try {
      await api('/api/scores', { method: 'POST', body: { score: game.score, kills: game.kills, mode: mode === 'solo' ? 'solo' : 'multi' } });
    } catch (e) {}
  }

  function endGame() {
    if (!running) return;
    running = false;
    stopBGM();
    sfx.over();
    explode(game.players[0].x, game.players[0].y, '#ff6b6b', 40, 300, 'over');
    $('finalScore').textContent = '最终得分 ' + game.score + (mode === 'host' || mode === 'guest' ? '（联机合作）' : '');
    $('btnRestart').style.display = (mode === 'solo' || mode === 'host') ? '' : 'none';
    if (mode === 'host') Net.send({ t: 'over', score: game.score });
    recordScore();
    showScreen('over');
  }

  // ==================== 更新逻辑 ====================
  function update(dt) {
    const g = game;
    if (waitingForGuest) { for (const s of g.stars) s.update(dt); return; }
    // 受击顿帧：冻结世界仅保留粒子/飘字/震屏衰减，放大"打中"的感觉
    if (g.hitStop > 0) {
      g.hitStop -= dt;
      g.shake = Math.max(0, g.shake - dt);
      g.events = [];
      for (const p of g.particles) p.update(dt);
      g.particles = g.particles.filter(p => p.life > 0);
      for (const tx of g.texts) tx.life -= dt;
      g.texts = g.texts.filter(tx => tx.life > 0);
      return;
    }
    g.time += dt;
    g.shake = Math.max(0, g.shake - dt);
    g.events = [];
    // 连击倒计时：超时中断归零
    if (g.comboTimer > 0) { g.comboTimer -= dt; if (g.comboTimer <= 0) g.combo = 0; }
    // 横幅倒计时
    if (g.banner) { g.banner.life -= dt; if (g.banner.life <= 0) g.banner = null; }

    g.players[0].applyInput(dt);
    if (mode === 'host' && g.players[1]) {
      const p1 = g.players[1];
      p1.x = guestX; p1.y = guestY; p1.clamp();
    }
    for (const p of g.players) p.tick(dt);

    g.spawnTimer -= dt;
    if (g.spawnTimer <= 0) { g.spawnTimer = clamp(0.9 - g.time * 0.02, 0.28, 0.9); spawnEnemy(); }
    if (g.time > g.nextBossTime && !g.bossSpawned) spawnBoss();

    for (const b of g.bullets) { b.x += b.vx * dt; b.y += b.vy * dt; }
    for (const b of g.eBullets) { b.x += b.vx * dt; b.y += b.vy * dt; }
    for (const e of g.enemies) e.update(dt);
    for (const p of g.powerups) p.update(dt);
    for (const s of g.stars) s.update(dt);
    for (const p of g.particles) p.update(dt);
    for (const tx of g.texts) { tx.y -= 45 * dt; tx.life -= dt; }

    g.bullets = g.bullets.filter(b => b.y > -20 && b.x > -20 && b.x < W + 20);
    g.eBullets = g.eBullets.filter(b => b.y < H + 20 && b.x > -20 && b.x < W + 20);
    g.enemies = g.enemies.filter(e => !e.dead);
    g.powerups = g.powerups.filter(p => !p.dead);
    g.particles = g.particles.filter(p => p.life > 0);
    g.texts = g.texts.filter(tx => tx.life > 0);

    for (const b of g.bullets) {
      if (b.dead) continue;
      for (const e of g.enemies) {
        if (e.dead || b.dead) continue;
        if (circleHit(b, e)) {
          b.dead = true; e.hp--;
          e.flash = 0.07;          // 受击白闪
          addShake(0.05);          // 命中轻震
          explode(b.x, b.y, '#7ef9ff', 4, 120, 'hit');
          if (e.hp <= 0) {
            e.dead = true;
            explode(e.x, e.y, e.color, e.type === 3 ? 60 : 18, e.type === 3 ? 350 : 200, 'boom');
            killReward(e);
            if (e.type === 3) {
              for (let i = 0; i < 4; i++) dropPowerUp(e.x + rand(-40, 40), e.y + rand(-20, 20));
              g.bossSpawned = false; // Boss 被击杀后允许下一波
            }
            else if (Math.random() < 0.18) dropPowerUp(e.x, e.y);
          }
          break;
        }
      }
    }
    g.bullets = g.bullets.filter(b => !b.dead);

    for (let i = 0; i < g.players.length; i++) {
      const pl = g.players[i];
      for (const e of g.enemies) {
        if (!e.dead && circleHit(e, pl)) { e.dead = true; explode(e.x, e.y, e.color, 20, 220, 'boom'); playerHit(i); sfx.boom(); }
      }
      for (const b of g.eBullets) {
        if (!b.dead && circleHit(b, pl)) { b.dead = true; playerHit(i); }
      }
    }
    g.eBullets = g.eBullets.filter(b => !b.dead);

    for (const p of g.powerups) {
      for (let i = 0; i < g.players.length; i++) {
        const pl = g.players[i];
        if (!p.dead && circleHit(p, pl)) {
          p.dead = true; sfx.power();
          if (p.kind === 'P') pl.power = Math.min(5, pl.power + 1);
          else if (p.kind === 'H') g.lives = Math.min(g.maxLives, g.lives + 1);
          else pl.bombs = Math.min(3, pl.bombs + 1);
          explode(p.x, p.y, '#ffffff', 12, 150, 'power');
          updateHUD();
          break;
        }
      }
    }

    if (mode === 'host') {
      Net.stateTimer -= dt;
      if (Net.stateTimer <= 0) { Net.stateTimer = 0.05; Net.sendState(); }
    }
  }

  // ==================== 渲染 ====================
  function drawPlayer(p) {
    if (!p) return;
    if (p.inv > 0 && Math.floor(p.inv * 12) % 2 === 0) return;
    ctx.save();
    ctx.translate(p.x, p.y);
    const g = ctx.createRadialGradient(0, 0, 2, 0, 0, 34);
    g.addColorStop(0, p.color + '66'); g.addColorStop(1, p.color + '00');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, 34, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = p.color; ctx.strokeStyle = '#eaf6ff'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -22); ctx.lineTo(5, -8); ctx.lineTo(16, 6); ctx.lineTo(10, 14);
    ctx.lineTo(5, 10); ctx.lineTo(0, 16); ctx.lineTo(-5, 10); ctx.lineTo(-10, 14);
    ctx.lineTo(-16, 6); ctx.lineTo(-5, -8); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#eaf6ff';
    ctx.beginPath(); ctx.ellipse(0, -6, 3, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ff5544'; ctx.fillRect(-15, 4, 3, 4); ctx.fillRect(12, 4, 3, 4);
    ctx.restore();
  }
  function drawEnemy(e) {
    ctx.save(); ctx.translate(e.x, e.y);
    if (e.type === 3) {
      ctx.fillStyle = '#7a1f2b'; ctx.strokeStyle = '#ff8899'; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, 40); ctx.lineTo(40, -20); ctx.lineTo(22, -34);
      ctx.lineTo(0, -12); ctx.lineTo(-22, -34); ctx.lineTo(-40, -20);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ff3344'; ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(-40, -46, 80, 6);
      ctx.fillStyle = '#ff4455'; ctx.fillRect(-40, -46, 80 * (e.hp / e.maxHp), 6);
    } else {
      ctx.fillStyle = e.color || ENEMY_TYPES[e.type].color;
      ctx.strokeStyle = '#ffd9e0'; ctx.lineWidth = 1.2;
      if (e.type === 0) {
        ctx.beginPath(); ctx.moveTo(0, 16); ctx.lineTo(12, -6); ctx.lineTo(6, -14); ctx.lineTo(0, -8); ctx.lineTo(-6, -14); ctx.lineTo(-12, -6); ctx.closePath(); ctx.fill(); ctx.stroke();
      } else if (e.type === 1) {
        ctx.beginPath(); ctx.moveTo(0, 20); ctx.lineTo(15, -8); ctx.lineTo(9, -6); ctx.lineTo(4, -16); ctx.lineTo(-4, -16); ctx.lineTo(-9, -6); ctx.lineTo(-15, -8); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#ffdd44'; ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.beginPath(); ctx.moveTo(0, 24); ctx.lineTo(18, 6); ctx.lineTo(14, -14); ctx.lineTo(0, -8); ctx.lineTo(-14, -14); ctx.lineTo(-18, 6); ctx.closePath(); ctx.fill(); ctx.stroke();
      }
    }
      if (e.hp !== undefined && e.flash > 0) {
        ctx.globalAlpha = Math.min(1, e.flash / 0.07) * 0.85;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(0, 0, e.r + 2, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.restore();
  }
  function drawBullet(b) {
    const g = ctx.createLinearGradient(b.x, b.y - 10, b.x, b.y + 6);
    g.addColorStop(0, '#7ef9ff'); g.addColorStop(1, '#0066ff');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(b.x, b.y, 3.5, 9, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath(); ctx.arc(b.x, b.y - 2, 2.2, 0, Math.PI * 2); ctx.fill();
  }
  function drawEBullet(b) {
    const g = ctx.createRadialGradient(b.x, b.y, 1, b.x, b.y, 8);
    g.addColorStop(0, '#fff'); g.addColorStop(0.4, '#ff8844'); g.addColorStop(1, 'rgba(255,60,40,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(b.x, b.y, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffdd88';
    ctx.beginPath(); ctx.arc(b.x, b.y, 3.5, 0, Math.PI * 2); ctx.fill();
  }
  function drawPowerup(p) {
    const color = p.kind === 'P' ? '#00e5ff' : p.kind === 'H' ? '#ff5577' : '#ffd94d';
    const letter = p.kind === 'P' ? 'P' : p.kind === 'H' ? '❤' : 'B';
    ctx.save(); ctx.translate(p.x, p.y);
    const g = ctx.createRadialGradient(0, 0, 2, 0, 0, 18);
    g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(0.5, color + 'cc'); g.addColorStop(1, color + '00');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, 18, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = color; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(letter, 0, 1);
    ctx.restore();
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    if (game && game.shake > 0) ctx.translate(rand(-8, 8) * game.shake, rand(-8, 8) * game.shake); // 振幅随分级震动叠加
    if (game) {
      for (const s of game.stars) { ctx.globalAlpha = s.tw; ctx.fillStyle = '#cfe6ff'; ctx.fillRect(s.x, s.y, s.size, s.size); }
      ctx.globalAlpha = 1;
      for (const p of game.powerups) drawPowerup(p);
      for (const e of game.enemies) drawEnemy(e);
      for (const b of game.bullets) drawBullet(b);
      for (const b of game.eBullets) drawEBullet(b);
      for (const p of game.players) drawPlayer(p);
      for (const p of game.particles) {
        const a = clamp(p.life / p.maxLife, 0, 1);
        ctx.globalAlpha = a; ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * a, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      // 得分飘字
      for (const tx of game.texts) {
        const a = clamp(tx.life / tx.maxLife, 0, 1);
        ctx.globalAlpha = a;
        ctx.fillStyle = tx.color;
        ctx.font = 'bold 15px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(tx.text, tx.x, tx.y);
      }
      ctx.globalAlpha = 1;
      // 连击 HUD（顶部中央）
      if (game.combo >= 2) {
        const mult = comboMult();
        ctx.fillStyle = mult > 1 ? '#ff8844' : '#8be9ff';
        ctx.font = 'bold 18px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`COMBO x${game.combo}` + (mult > 1 ? `　得分 x${mult}` : ''), W / 2, 88);
      }
      // Boss 警示横幅
      if (game.banner) {
        const b = game.banner;
        const a = clamp(b.life / b.maxLife, 0, 1) * (0.7 + Math.sin(game.time * 14) * 0.3);
        ctx.globalAlpha = clamp(a, 0, 1);
        ctx.fillStyle = b.color;
        ctx.font = 'bold 34px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(b.text, W / 2, H / 2 - 60);
        ctx.fillStyle = '#ffd9e0';
        ctx.font = '16px sans-serif';
        ctx.fillText(b.sub, W / 2, H / 2 - 28);
        ctx.globalAlpha = 1;
      }
      // 新手提示（开局前 5 秒）
      if (game.time < 5 && (mode === 'solo' || mode === 'host')) {
        ctx.globalAlpha = clamp(5 - game.time, 0, 1) * 0.85;
        ctx.fillStyle = '#9fd4ff';
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(IS_TOUCH ? '拖动屏幕移动 · 自动开火 · 双指或 💣 放炸弹'
                              : '移动：鼠标 / WASD · 自动开火 · 空格：炸弹 · ESC：暂停', W / 2, H - 40);
        ctx.globalAlpha = 1;
      }
    }
    ctx.restore();
    if (paused && running) {
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, 0, W, H);
    }
  }

  // ==================== 主循环 ====================
  let last = performance.now();
  function loop(ts) {
    const dt = Math.min(0.033, (ts - last) / 1000 || 0.016);
    last = ts;
    if (running && !paused && (mode === 'solo' || mode === 'host')) update(dt);
    if (running && !paused && mode === 'guest' && game && game.players && game.players[1]) {
      const self = game.players[1];
      if (self && typeof self.applyInput === 'function') {
        self.applyInput(dt);
        Net.inputTimer = (Net.inputTimer || 0) - dt;
        if (Net.inputTimer <= 0) { Net.inputTimer = 0.033; Net.send({ t: 'input', x: self.x, y: self.y }); }
      }
      for (const s of game.stars) s.update(dt);
      for (const p of game.particles) p.update(dt);
      game.particles = game.particles.filter(p => p.life > 0);
    }
    draw();
    requestAnimationFrame(loop);
  }

  // ==================== 输入 ====================
  const keys = new Set();
  const mouse = { x: W / 2, y: H - 90, active: false };
  window.addEventListener('keydown', e => {
    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key)) e.preventDefault();
    keys.add(e.key.length === 1 ? e.key.toLowerCase() : e.key);
    if (e.key === ' ' && running && !paused) {
      if (mode === 'solo' || mode === 'host') bomb(0);
      else if (mode === 'guest') Net.send({ t: 'bomb' });
    }
    if (e.key === 'Escape' && running) setPaused(!paused);
  });
  window.addEventListener('keyup', e => keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key));
  canvas.addEventListener('mousemove', e => {
    const r = canvas.getBoundingClientRect();
    mouse.x = (e.clientX - r.left) * (W / r.width);
    mouse.y = (e.clientY - r.top) * (H / r.height);
    mouse.active = true;
  });
  canvas.addEventListener('mousedown', () => {
    if (!running || paused) return;
    if (mode === 'solo' || mode === 'host') bomb(0);
    else if (mode === 'guest') Net.send({ t: 'bomb' });
  });

  // ==================== 触屏支持（移动端拖拽移动 / 双指或按钮放炸弹） ====================
  const IS_TOUCH = ('ontouchstart' in window) || (navigator.maxTouchPoints || 0) > 0;
  function setTouchPos(t) {
    const r = canvas.getBoundingClientRect();
    mouse.x = (t.clientX - r.left) * (W / r.width);
    mouse.y = (t.clientY - r.top) * (H / r.height) - 70; // 上移 70px，避免手指遮挡战机
    mouse.active = true;
  }
  function triggerBomb() {
    if (!running || paused) return;
    if (mode === 'solo' || mode === 'host') bomb(0);
    else if (mode === 'guest') Net.send({ t: 'bomb' });
  }
  canvas.addEventListener('touchstart', e => {
    e.preventDefault();
    initAudio();
    if (e.touches.length >= 2) { triggerBomb(); return; } // 双指点按 = 炸弹
    setTouchPos(e.touches[0]);
  }, { passive: false });
  canvas.addEventListener('touchmove', e => {
    e.preventDefault();
    if (e.touches[0]) setTouchPos(e.touches[0]);
  }, { passive: false });
  canvas.addEventListener('touchend', e => {
    e.preventDefault();
    if (e.touches.length === 0) mouse.active = false; // 松手后战机停在原地
    else if (e.touches[0]) setTouchPos(e.touches[0]);
  }, { passive: false });
  // 触屏设备显示虚拟炸弹按钮
  if (IS_TOUCH) {
    const bb = document.getElementById('btnBomb');
    if (bb) { bb.style.display = ''; bb.addEventListener('click', triggerBomb); }
  }
