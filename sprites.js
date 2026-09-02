// ============================================================
// 雷霆战机 · sprites.js —— 敌机/Boss 精灵图素材（离屏预渲染）
// 供 game.js 与 sprites.html（素材预览/导出页）共用
// ============================================================
// ==================== 敌机精灵图（离屏预渲染高精细矢量画，双帧尾焰动画 + 受击白色剪影） ====================
function makeSprite(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w * 2; c.height = h * 2; // 2x 超采样，缩小绘制更锐利
  const x = c.getContext('2d');
  x.scale(2, 2); x.translate(w / 2, h / 2);
  draw(x);
  // 白色剪影（受击白闪用整幅轮廮，不再用白圈）
  const f = document.createElement('canvas');
  f.width = w * 2; f.height = h * 2;
  const fx = f.getContext('2d');
  fx.drawImage(c, 0, 0);
  fx.globalCompositeOperation = 'source-in';
  fx.fillStyle = '#ffffff';
  fx.fillRect(0, 0, w * 2, h * 2);
  return { img: c, flash: f, w, h };
}
function poly(x, pts, fill, stroke, lw) {
  x.beginPath(); x.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) x.lineTo(pts[i][0], pts[i][1]);
  x.closePath();
  if (fill) { x.fillStyle = fill; x.fill(); }
  if (stroke) { x.strokeStyle = stroke; x.lineWidth = lw || 1; x.stroke(); }
}
function flame(x, ox, oy, len, color, w) { // 引擎尾焰（向后喷）
  const g = x.createLinearGradient(ox, oy, ox, oy - len);
  g.addColorStop(0, color); g.addColorStop(1, 'rgba(255,120,40,0)');
  x.fillStyle = g;
  x.beginPath(); x.moveTo(ox - w, oy); x.quadraticCurveTo(ox, oy - len * 1.3, ox + w, oy); x.closePath(); x.fill();
  x.fillStyle = '#fff8d0';
  x.beginPath(); x.moveTo(ox - w * 0.4, oy); x.quadraticCurveTo(ox, oy - len * 0.7, ox + w * 0.4, oy); x.closePath(); x.fill();
}
// —— 红色蜂型小兵（44×44）：后掠翼/座舱玻璃/中线高光/翼尖灯 ——
function artEnemy0(x, frame) {
  flame(x, 0, -14, 9 + frame * 3, '#ff8c42', 3.2);
  poly(x, [[6, -2], [21, -11], [19, 1], [7, 7]], '#8f2a3c', '#ffb3c0', 0.8);
  poly(x, [[-6, -2], [-21, -11], [-19, 1], [-7, 7]], '#8f2a3c', '#ffb3c0', 0.8);
  const g = x.createLinearGradient(0, -16, 0, 18);
  g.addColorStop(0, '#6b1a2a'); g.addColorStop(0.55, '#d94a60'); g.addColorStop(1, '#8f2a3c');
  poly(x, [[0, 18], [8, 6], [7, -8], [3, -15], [-3, -15], [-7, -8], [-8, 6]], g, '#ffd9e0', 1);
  x.strokeStyle = 'rgba(255,220,228,.5)'; x.beginPath(); x.moveTo(0, -12); x.lineTo(0, 14); x.stroke();
  x.fillStyle = '#0d1f33'; x.beginPath(); x.ellipse(0, 5, 3, 6, 0, 0, Math.PI * 2); x.fill();
  x.fillStyle = 'rgba(140,230,255,.85)'; x.beginPath(); x.ellipse(0.8, 3.4, 1, 2, 0, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#2a0a10'; x.fillRect(-4, -17, 8, 3);
  x.fillStyle = '#ff5a6e'; x.beginPath(); x.arc(19.5, -8, 1.4, 0, 7); x.fill();
  x.beginPath(); x.arc(-19.5, -8, 1.4, 0, 7); x.fill();
}
// —— 紫色炮艇（52×52）：双引擎/肩炮舱/中央炮塔/水晶鳍 ——
function artEnemy1(x, frame) {
  flame(x, -12, -16, 8 + frame * 2.5, '#c86be8', 2.6);
  flame(x, 12, -16, 8 + frame * 2.5, '#c86be8', 2.6);
  poly(x, [[8, -4], [25, -8], [26, 4], [10, 10]], '#4a1f6b', '#d9a6ff', 0.8);
  poly(x, [[-8, -4], [-25, -8], [-26, 4], [-10, 10]], '#4a1f6b', '#d9a6ff', 0.8);
  const g = x.createLinearGradient(0, -18, 0, 20);
  g.addColorStop(0, '#3a1454'); g.addColorStop(0.6, '#a458cc'); g.addColorStop(1, '#5c2a80');
  poly(x, [[0, 20], [11, 10], [12, -8], [6, -16], [-6, -16], [-12, -8], [-11, 10]], g, '#e6c6ff', 1);
  x.fillStyle = '#2a0f3d'; x.fillRect(-14, -4, 7, 10); x.fillRect(7, -4, 7, 10);
  x.fillStyle = '#c86be8'; x.fillRect(-12.5, 4, 4, 5); x.fillRect(8.5, 4, 4, 5);
  poly(x, [[0, -16], [3, -22], [0, -25], [-3, -22]], '#9fe8ff', '#e6ffff', 0.6);
  x.fillStyle = '#1c0b2e'; x.beginPath(); x.arc(0, 4, 6.5, 0, 7); x.fill();
  x.strokeStyle = '#d9a6ff'; x.lineWidth = 1; x.stroke();
  x.fillStyle = '#e6c6ff'; x.fillRect(-1.5, 4, 3, 9);
  x.fillStyle = '#0d1f33'; x.beginPath(); x.ellipse(0, -6, 3.5, 5, 0, 0, 7); x.fill();
  x.fillStyle = 'rgba(160,235,255,.9)'; x.beginPath(); x.ellipse(1, -7.5, 1.2, 2, 0, 0, 7); x.fill();
}
// —— 橙色重甲轰炸机（64×64）：四引擎/装甲钣金+铆钉/警示条纹/机鼻重炮 ——
function artEnemy2(x, frame) {
  for (const ox of [-20, -9, 9, 20]) flame(x, ox, -20, 7 + frame * 2, '#ffb36b', 2.4);
  poly(x, [[12, -6], [31, -12], [32, 6], [14, 14]], '#7a4413', '#ffd9a6', 1);
  poly(x, [[-12, -6], [-31, -12], [-32, 6], [-14, 14]], '#7a4413', '#ffd9a6', 1);
  x.save(); x.globalAlpha = 0.85;
  poly(x, [[16, -2], [22, -5], [23, 0], [17, 3]], '#ffd94d');
  poly(x, [[24, -7], [30, -10], [31, -5], [25, -2]], '#2b2b2b');
  poly(x, [[-16, -2], [-22, -5], [-23, 0], [-17, 3]], '#ffd94d');
  poly(x, [[-24, -7], [-30, -10], [-31, -5], [-25, -2]], '#2b2b2b');
  x.restore();
  const g = x.createLinearGradient(0, -22, 0, 26);
  g.addColorStop(0, '#5c330e'); g.addColorStop(0.55, '#e8972e'); g.addColorStop(1, '#8a4f16');
  poly(x, [[0, 26], [14, 14], [15, -10], [8, -20], [-8, -20], [-15, -10], [-14, 14]], g, '#ffe0b0', 1.2);
  x.strokeStyle = 'rgba(60,30,5,.55)'; x.lineWidth = 1;
  x.beginPath(); x.moveTo(-13, -4); x.lineTo(13, -4); x.moveTo(-12, 6); x.lineTo(12, 6); x.stroke();
  x.fillStyle = '#3c1e05';
  for (const p of [[-10, -12], [10, -12], [-9, 10], [9, 10], [0, -16]]) { x.beginPath(); x.arc(p[0], p[1], 1.2, 0, 7); x.fill(); }
  x.fillStyle = '#2b1605'; x.fillRect(-3, 14, 6, 10);
  x.fillStyle = '#ffd94d'; x.fillRect(-1.5, 20, 3, 6);
  x.fillStyle = '#0d1f33'; x.beginPath(); x.ellipse(0, -10, 4, 6, 0, 0, 7); x.fill();
  x.fillStyle = 'rgba(160,235,255,.9)'; x.beginPath(); x.ellipse(1.2, -12, 1.4, 2.2, 0, 0, 7); x.fill();
  x.fillStyle = '#ff5544'; x.beginPath(); x.arc(-31, -8, 1.5, 0, 7); x.fill();
  x.fillStyle = '#4cff8b'; x.beginPath(); x.arc(31, -8, 1.5, 0, 7); x.fill();
}
// —— Boss 旗舰“毁灭者”（150×130）：三层巨翼/双侧副炮/中央反应堆/旗舰炮/铆钉装甲 ——
function artBoss(x, frame) {
  for (const ox of [-30, 0, 30]) flame(x, ox, -52, 13 + frame * 3, '#ff6b6b', 5);
  poly(x, [[30, -20], [72, -34], [78, -8], [62, 10], [34, 14]], '#3d0d16', '#ff8899', 1.5);
  poly(x, [[-30, -20], [-72, -34], [-78, -8], [-62, 10], [-34, 14]], '#3d0d16', '#ff8899', 1.5);
  x.fillStyle = '#1c060b'; x.fillRect(58, -6, 8, 22); x.fillRect(-66, -6, 8, 22);
  x.fillStyle = '#ff4455'; x.fillRect(60, 12, 4, 10); x.fillRect(-64, 12, 4, 10);
  x.save(); x.globalAlpha = 0.75;
  poly(x, [[40, -18], [52, -23], [54, -15], [42, -10]], '#ffd94d');
  poly(x, [[-40, -18], [-52, -23], [-54, -15], [-42, -10]], '#ffd94d');
  x.restore();
  poly(x, [[26, -30], [52, -40], [56, -24], [30, -12]], '#571420', '#ffaabb', 1);
  poly(x, [[-26, -30], [-52, -40], [-56, -24], [-30, -12]], '#571420', '#ffaabb', 1);
  const g = x.createLinearGradient(0, -56, 0, 64);
  g.addColorStop(0, '#4a0f1a'); g.addColorStop(0.45, '#a11226'); g.addColorStop(1, '#571420');
  poly(x, [[0, 64], [26, 44], [34, 8], [28, -38], [14, -56], [-14, -56], [-28, -38], [-34, 8], [-26, 44]], g, '#ffb3c0', 2);
  x.strokeStyle = 'rgba(40,8,14,.6)'; x.lineWidth = 1.2;
  x.beginPath(); x.moveTo(-30, 0); x.lineTo(30, 0); x.moveTo(-26, -26); x.lineTo(26, -26); x.moveTo(-22, 24); x.lineTo(22, 24); x.stroke();
  x.fillStyle = '#2a060c';
  for (const p of [[-18, -46], [18, -46], [-24, -14], [24, -14], [-16, 32], [16, 32]]) { x.beginPath(); x.arc(p[0], p[1], 1.6, 0, 7); x.fill(); }
  x.fillStyle = '#1c060b'; x.beginPath(); x.arc(0, 8, 17, 0, 7); x.fill();
  x.strokeStyle = '#ff8899'; x.lineWidth = 1.5; x.stroke();
  x.strokeStyle = 'rgba(255,136,153,.7)'; x.beginPath(); x.arc(0, 8, 13, 0, 7); x.stroke();
  x.fillStyle = '#2a060c'; x.fillRect(-6, 44, 12, 16);
  x.fillStyle = '#ff4455'; x.fillRect(-3, 56, 6, 8);
  x.fillStyle = '#0d1f33'; x.beginPath(); x.ellipse(0, -34, 6, 9, 0, 0, 7); x.fill();
  x.fillStyle = 'rgba(160,235,255,.85)'; x.beginPath(); x.ellipse(2, -37, 2, 3.4, 0, 0, 7); x.fill();
}
const ENEMY_SPRITES = [
  [makeSprite(44, 44, x => artEnemy0(x, 0)), makeSprite(44, 44, x => artEnemy0(x, 1))],
  [makeSprite(52, 52, x => artEnemy1(x, 0)), makeSprite(52, 52, x => artEnemy1(x, 1))],
  [makeSprite(64, 64, x => artEnemy2(x, 0)), makeSprite(64, 64, x => artEnemy2(x, 1))],
  [makeSprite(150, 130, x => artBoss(x, 0)), makeSprite(150, 130, x => artBoss(x, 1))],
];

// 火力等级 → 光环 RGB（1 蓝白 → 2 天蓝 → 3 青绿 → 4 金色 → 5 圣金）
const POWER_AURA = [null, '77,184,255', '64,224,255', '124,255,212', '255,217,77', '255,240,176'];

