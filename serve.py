#!/usr/bin/env python3
"""No-cache static server for the model (ES modules are otherwise cached hard)."""
import http.server, os, sys
os.chdir(os.path.dirname(os.path.abspath(__file__)))
class H(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()
    def log_message(self, *a): pass
port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
print(f'http://localhost:{port}/')
http.server.ThreadingHTTPServer(('', port), H).serve_forever()
