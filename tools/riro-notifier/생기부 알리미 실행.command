#!/bin/bash
# 더블클릭하면 서버가 켜지고 브라우저가 열립니다. 끄려면 이 터미널 창을 닫으세요.
cd "$(dirname "$0")"
python3 scraper/server.py
