"""Собирает игру в ОДИН html-файл (все картинки, шрифты и скрипты внутри) — его можно просто открыть двойным щелчком."""
import base64, json, os, re
D = os.path.dirname(os.path.abspath(__file__))

def b64(path, mime):
    return f"data:{mime};base64," + base64.b64encode(open(os.path.join(D, path), 'rb').read()).decode()

def read(path):
    return open(os.path.join(D, path), encoding='utf-8').read()

html = read('index.html')
css = re.sub(r"url\('(fonts/[^']+)'\)", lambda m: f"url('{b64(m.group(1), 'font/woff2')}')", read('style.css'))

# все картинки из assets/ (кроме исходника рига) — по относительному пути, как их запрашивает loadAssets()
files = []
for root, _, names in os.walk(os.path.join(D, 'assets')):
    for n in names:
        if n.endswith(('.png', '.jpg')) and n != 'icon.png':
            files.append(os.path.relpath(os.path.join(root, n), os.path.join(D, 'assets')).replace(os.sep, '/'))
assets = {f: b64('assets/' + f, 'image/jpeg' if f.endswith('.jpg') else 'image/png') for f in sorted(files)}

html = html.replace('<link rel="stylesheet" href="style.css" />', f'<style>\n{css}\n</style>')
html = html.replace('<link rel="icon" href="assets/icon.png" />', f'<link rel="icon" href="{b64("assets/icon.png", "image/png")}" />')

scripts = re.findall(r'<script src="([^"]+)"></script>', html)
assert 'js/core.js' in scripts and 'js/main.js' in scripts, scripts
for i, src in enumerate(scripts):
    code = read(src)
    if src == 'js/core.js':
        assert '__ASSETS' in code
        code = f'window.__ASSETS = {json.dumps(assets)};\n' + code
    html = html.replace(f'<script src="{src}"></script>', f'<script>\n/* {src} */\n{code}\n</script>')
assert '<script src=' not in html

# jim-game.html — для скачивания; index.html в корне — для GitHub Pages
for name in ('jim-game.html', 'index.html'):
    out = os.path.join(D, '..', name)
    open(out, 'w', encoding='utf-8').write(html)
    print('OK ->', os.path.abspath(out), os.path.getsize(out) // 1024, 'KB')
