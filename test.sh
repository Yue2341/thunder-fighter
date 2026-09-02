#!/usr/bin/env bash
# ============================================================
# 雷霆战机 · 一键冒烟测试
#   1) 前端桩测试：Node 模拟浏览器环境跑完整游戏逻辑（scripts/stub-test.js）
#   2) 后端 API 冒烟：起真实服务器，全链路验证核心接口
# 用法: bash test.sh   （或 npm test）
# ============================================================
cd "$(dirname "$0")"
mkdir -p .tmp
pass=0; fail=0
check() { # name expected actual
  if [ "$3" = "$2" ]; then pass=$((pass+1)); echo "  ✅ $1";
  else fail=$((fail+1)); echo "  ❌ $1 (期望 $2, 实际 $3)"; fi
}

echo "▶ [1/2] 前端桩测试"
if node scripts/stub-test.js game.js net.js ui.js; then
  pass=$((pass+1))
else
  fail=$((fail+1)); echo "  ❌ 前端桩测试未通过"
fi

echo "▶ [2/2] 后端 API 冒烟测试"
PORT=3100 DATA_FILE=.tmp/smoke-data.json node server.js > .tmp/smoke-server.log 2>&1 &
SRV_PID=$!
trap 'kill $SRV_PID 2>/dev/null' EXIT
rm -f .tmp/smoke-data.json

BASE=http://localhost:3100
for i in $(seq 1 30); do
  curl -s -o /dev/null "$BASE/" && break
  sleep 0.3
done

check "静态页可访问"              200 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/")"
check "game.js 可访问"            200 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/game.js")"
check "net.js 可访问"              200 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/net.js")"
check "ui.js 可访问"                200 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/ui.js")"
check "错误密码返回 401"           401 "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/login" -H 'Content-Type: application/json' -d '{"uid":"TF1002","password":"wrong"}')"

TOKEN=$(curl -s -X POST "$BASE/api/login" -H 'Content-Type: application/json' -d '{"uid":"TF1002","password":"123456"}' \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{console.log(JSON.parse(s).token||'')}catch(e){console.log('')}})")
[ -n "$TOKEN" ] && check "正确密码登录成功" ok ok || check "正确密码登录成功" ok "失败(无token)"

check "会话鉴权 /api/me"           200 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/me" -H "Authorization: Bearer $TOKEN")"
check "正常战绩可提交"             200 "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/scores" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"score":12345,"kills":5,"mode":"solo"}')"
check "伪造高分被拒绝(400)"        400 "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/scores" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"score":999999999,"kills":1,"mode":"solo"}')"
check "未登录提交战绩 401"         401 "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/scores" -H 'Content-Type: application/json' -d '{"score":1,"kills":1}')"
check "排行榜可访问"               200 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/leaderboard")"
check "添加好友"                   200 "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/friends" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"uid":"TF1003"}')"
check "好友列表"                   200 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/friends" -H "Authorization: Bearer $TOKEN")"
check "删除好友"                   200 "$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "$BASE/api/friends/TF1003" -H "Authorization: Bearer $TOKEN")"

# 数据文件不得含明文密码
if [ -f .tmp/smoke-data.json ] && ! grep -q '"password":' .tmp/smoke-data.json; then
  check "data.json 无明文密码（已哈希）" ok ok
else
  check "data.json 无明文密码（已哈希）" ok "失败"
fi

# WebSocket：无 token 连接应被拒绝（关闭码 4001）
WS_RESULT=$(node -e "
const WebSocket = require('ws');
const ws = new WebSocket('ws://localhost:3100/ws?token=invalid');
let code = 'no-close';
ws.on('close', (c) => { code = c; console.log(code); process.exit(0); });
ws.on('open', () => {});
setTimeout(() => { console.log(code); process.exit(0); }, 3000);
" 2>/dev/null)
check "WebSocket 拒绝无效 token (4001)" 4001 "$WS_RESULT"

echo ""
echo "冒烟结果: $pass 通过, $fail 失败"
[ "$fail" = "0" ]
