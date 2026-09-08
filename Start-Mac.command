#!/bin/bash
cd -- "$(dirname -- "$0")" || exit 1
game_node="$(command -v node 2>/dev/null)"
if [ -z "$game_node" ]; then
  for candidate in /opt/homebrew/bin/node /usr/local/bin/node; do
    if [ -x "$candidate" ]; then game_node="$candidate"; break; fi
  done
fi
if [ -z "$game_node" ] || ! "$game_node" -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 22 ? 0 : 1)' ; then
  echo "请先安装 Node.js 22 或更新版本：https://nodejs.org/"
  echo "安装后，重新双击此启动文件。"
  read -r -p "按回车退出…"
  exit 1
fi
"$game_node" launch.mjs
