#!/bin/bash
# 더블클릭하면 켜져 있는 알리미 서버를 끕니다.
if pkill -f "scraper/server.py"; then echo "알리미 서버를 껐습니다."; else echo "켜져 있는 서버가 없습니다."; fi
sleep 2
