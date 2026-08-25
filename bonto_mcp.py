#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Bonto MCP 客户端：管理会话并调用工具"""
import json, sys, os, urllib.request, re

ENDPOINT = "https://api.bonto.dev/mcp"
SID_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".bonto_session")

def get_sid():
    try:
        with open(SID_FILE) as f:
            return f.read().strip()
    except Exception:
        return None

def save_sid(sid):
    with open(SID_FILE, "w") as f:
        f.write(sid)

def parse_response(raw):
    # 可能是 SSE (event: message\ndata: {...}) 或纯 JSON
    for m in re.finditer(r"data:\s*(\{.*?\})\s*(?:\n|$)", raw, re.S):
        try:
            return json.loads(m.group(1))
        except Exception:
            continue
    try:
        return json.loads(raw)
    except Exception:
        return {"raw": raw[:500]}

def call(method, params=None, sid=None):
    body = {"jsonrpc": "2.0", "id": 1, "method": method, "params": params or {}}
    req = urllib.request.Request(
        ENDPOINT,
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json", "Accept": "application/json, text/event-stream"},
    )
    if sid:
        req.add_header("Mcp-Session-Id", sid)
    try:
        resp = urllib.request.urlopen(req, timeout=40)
    except urllib.error.HTTPError as e:
        return {"error": e.code, "body": e.read().decode(errors="replace")[:800]}
    except Exception as e:
        return {"error": str(e)}
    new_sid = resp.headers.get("mcp-session-id")
    raw = resp.read().decode("utf-8", errors="replace")
    data = parse_response(raw)
    if new_sid and method == "initialize":
        save_sid(new_sid)
    return data

if __name__ == "__main__":
    method = sys.argv[1]
    params = {}
    if len(sys.argv) > 2:
        params = json.loads(sys.argv[2])
    sid = get_sid()
    if method == "initialize":
        sid = None
    result = call(method, params, sid)
    # 输出结果，便于 shell 处理
    print(json.dumps(result, ensure_ascii=False))
