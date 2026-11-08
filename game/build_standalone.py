"""Собирает игру в ОДИН html-файл (все картинки и шрифты внутри) — его можно просто открыть двойным щелчком."""
import base64, os, re
D = os.path.dirname(os.path.abspath(__file__))
def b64(path, mime):
    return f"data:{mime};base64," + base64.b64encode(open(os.path.join(D, path), 'rb').read()).decode()
html = open(os.path.join(D, 'index.html'), encoding='utf-8').read()
css = open(os.path.join(D, 'style.css'), encoding='utf-8').read()
js = open(os.path.join(D, 'game.js'), encoding='utf-8').read()
css = re.sub(r"url\('(fonts/[^']+)'\)", lambda m: f"url('{b64(m.group(1), 'font/woff2')}')", css)
asset_files = ['jim.png', 'jim-body.png', 'jim-arm.png', 'princess.png', 'crow.png', 'cow.png', 'bg.jpg']
asset_files += [f'run-{i}.png' for i in range(17)]
asset_files += ['jump-rise.png', 'jump-top.png', 'jump-fall.png', 'land.png']
asset_files += [f'shoot-{i}.png' for i in range(4)]
asset_files += [f'death-{i}.png' for i in range(4)]
assets = {f: b64('assets/' + f, 'image/jpeg' if f.endswith('.jpg') else 'image/png') for f in asset_files}
js = js.replace("i.src = 'assets/' + f;", "i.src = (window.__ASSETS && window.__ASSETS[f]) || ('assets/' + f);")
assert '__ASSETS' in js
html = html.replace('<link rel="stylesheet" href="style.css" />', f'<style>\n{css}\n</style>')
html = html.replace('<link rel="icon" href="assets/icon.png" />', f'<link rel="icon" href="{b64("assets/icon.png", "image/png")}" />')
import json
html = html.replace('<script src="game.js"></script>', f'<script>window.__ASSETS = {json.dumps(assets)};</script>\n<script>\n{js}\n</script>')
# jim-game.html — автономная версия для скачивания. Промо-сайт в корневом index.html не перезаписываем.
out = os.path.join(D, '..', 'jim-game.html')
open(out, 'w', encoding='utf-8').write(html)
print('OK ->', os.path.abspath(out), os.path.getsize(out) // 1024, 'KB')
