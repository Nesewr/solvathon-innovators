#!/bin/sh
# 매일 07:30에 auto_update.py 실행 (3일 지났을 때만 실제 수집). 해제: ./install_schedule.sh --uninstall
LABEL=com.jungsan.riro-autoupdate
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
HERE="$(cd "$(dirname "$0")" && pwd)"
PY="$(command -v python3)"
if [ "$1" = "--uninstall" ]; then launchctl bootout "gui/$(id -u)" "$PLIST" 2>/dev/null; rm -f "$PLIST"; echo "해제됨"; exit 0; fi
mkdir -p "$HOME/Library/LaunchAgents"
cat > "$PLIST" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>$PY</string><string>$HERE/auto_update.py</string></array>
  <key>StartCalendarInterval</key><dict><key>Hour</key><integer>7</integer><key>Minute</key><integer>30</integer></dict>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>/tmp/riro-autoupdate.out</string>
  <key>StandardErrorPath</key><string>/tmp/riro-autoupdate.err</string>
  <key>EnvironmentVariables</key><dict><key>PATH</key><string>/usr/local/bin:/usr/bin:/bin:$HOME/anaconda3/bin</string></dict>
</dict></plist>
PL
launchctl bootout "gui/$(id -u)" "$PLIST" 2>/dev/null
launchctl bootstrap "gui/$(id -u)" "$PLIST" && echo "등록됨: 매일 07:30 ($PLIST)"
