"""Простой локальный сервер для игры (без кеширования): python3 serve.py [порт]"""
import http.server, sys, os
os.chdir(os.path.dirname(os.path.abspath(__file__)))
class H(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, '.js': 'application/javascript', '.woff2': 'font/woff2'}
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()
port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
print(f'Игра: http://localhost:{port}')
http.server.ThreadingHTTPServer(('0.0.0.0', port), H).serve_forever()
