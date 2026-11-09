"""Cache-bust: append ?v=<version> to every relative ES-module import (GitHub Pages caches modules for 10 min,
so a reload would otherwise mix old and new files). Run before each commit: python3 tools/stamp.py"""
import re, sys, time, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
ver = sys.argv[1] if len(sys.argv) > 1 else time.strftime('%Y%m%d%H%M')
pat = re.compile(r"""((?:from\s+|import\s*\(\s*|new URL\(\s*)['"])(\.{1,2}/[^'"?]+\.js)(?:\?v=[^'"]*)?(['"])""")
for f in [root / 'index.html', root / 'main.js', *root.glob('lib/*.js'), *root.glob('data/**/*.js')]:
    s = f.read_text(); n = pat.sub(lambda m: f"{m.group(1)}{m.group(2)}?v={ver}{m.group(3)}", s)
    if n != s: f.write_text(n); print('stamped', f.relative_to(root))
print('version', ver)
