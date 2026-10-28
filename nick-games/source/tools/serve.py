#!/usr/bin/env python3
"""Serve the finished web artifact; no build dependencies needed."""
import argparse, functools, http.server
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--port',type=int,default=8765);args=p.parse_args()
web=Path(__file__).resolve().parents[1]/'web'
class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map={**http.server.SimpleHTTPRequestHandler.extensions_map,'.wasm':'application/wasm'}
handler=functools.partial(Handler,directory=str(web))
print(f'Open http://127.0.0.1:{args.port}/',flush=True)
http.server.ThreadingHTTPServer(('127.0.0.1',args.port),handler).serve_forever()
