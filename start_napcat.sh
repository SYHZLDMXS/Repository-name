#!/bin/bash
# 在合一容器里启动 NapCat。
# NapCat-Docker 镜像内部启动入口在不同版本略有差异，这里做兼容探测。
set -e

candidates=(
  "$(command -v napcat 2>/dev/null || true)"
  /usr/local/bin/napcat
  /usr/bin/napcat
  /app/napcat
  /app/start.sh
  /docker-entrypoint.sh
  /entrypoint.sh
)
NAP=""
for c in "${candidates[@]}"; do
  [ -n "$c" ] && [ -x "$c" ] && NAP="$c" && break
done

if [ -z "$NAP" ]; then
  echo "[start_napcat] 未找到 napcat 启动入口，镜像内候选位置如下，请据此修改本脚本：" >&2
  ls -la /usr/local/bin 2>/dev/null >&2 || true
  ls -la /app 2>/dev/null >&2 || true
  exit 1
fi

echo "[start_napcat] 通过入口启动 NapCat: $NAP"
exec "$NAP"
