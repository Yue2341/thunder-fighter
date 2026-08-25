#!/bin/bash
# Bonto MCP 客户端（curl 版）
# 用法: ./bonto.sh <tool> [json-args]   —— 自动包装为 tools/call
cd "$(dirname "$0")"
ENDPOINT="https://api.bonto.dev/mcp"
SID_FILE=".bonto_session"
HDR_FILE=".bonto_headers"

if [ ! -f "$SID_FILE" ]; then
  curl -s -m 30 -D "$HDR_FILE" -X POST "$ENDPOINT" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json, text/event-stream" \
    -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"pi","version":"1.0"}}}' > /dev/null 2>&1
  grep -i "^mcp-session-id:" "$HDR_FILE" | tr -d '\r' | sed 's/^[Mm][Cc][Pp]-[Ss]ession-[Ii][Dd]: *//' > "$SID_FILE"
fi

SID=$(cat "$SID_FILE")
if [ -z "$SID" ]; then
  echo '{"error":"no session"}'
  exit 1
fi

ARGS="${2:-{}}"
BODY="{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/call\",\"params\":{\"name\":\"$1\",\"arguments\":$ARGS}}"
curl -s -m 90 -X POST "$ENDPOINT" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Mcp-Session-Id: $SID" \
  -d "$BODY" 2>&1 | grep "^data:" | sed 's/^data: //' | tail -1
