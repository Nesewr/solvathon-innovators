#!/bin/sh
# 배포 전 실행: index.html의 js/css 링크 버전을 올려 브라우저 캐시를 무효화
cd "$(dirname "$0")" && python3 - <<'PY'
import re,datetime
p='index.html'; s=open(p,encoding='utf-8').read(); v=datetime.datetime.now().strftime('%m%d%H%M')
s=re.sub(r'(src|href)="((?:js|css)/[^"?]+)(\?v=\d+)?"', lambda m: f'{m.group(1)}="{m.group(2)}?v={v}"', s)
open(p,'w',encoding='utf-8').write(s); print('asset version', v)
PY
