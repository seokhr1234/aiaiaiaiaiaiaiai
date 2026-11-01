#!/bin/zsh
cd "$(dirname "$0")"
if command -v node >/dev/null 2>&1; then
  node donghaeng-nav/scripts/launch.mjs --setup-key
elif [[ -x /usr/local/bin/node ]]; then
  /usr/local/bin/node donghaeng-nav/scripts/launch.mjs --setup-key
elif [[ -x /opt/homebrew/bin/node ]]; then
  /opt/homebrew/bin/node donghaeng-nav/scripts/launch.mjs --setup-key
else
  echo "Node.js가 없어 실행하지 못했어요. Node.js 설치 후 다시 실행해 주세요."
  read "reply?Enter를 누르면 닫힙니다."
fi
