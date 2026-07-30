"""Punto de entrada para Vercel.

Vercel ejecuta las funciones desde la carpeta api/, asi que el resto del
proyecto (api_amortization.py, src/, static/, templates/) queda un nivel
arriba y hay que agregarlo al path antes de importar.
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from api_amortization import app as _fastapi_app  # noqa: E402

# Vercel entrega el path de la petición como el destino del rewrite
# (p. ej. "/api/index/health"). Le quitamos ese prefijo para que las rutas
# de FastAPI ("/health", "/", "/static/...") vuelvan a matchear. Si algún día
# Vercel entrega el path original, el prefijo no está y no se toca nada.
_PREFIX = "/api/index"


async def app(scope, receive, send):
    if scope.get("type") in ("http", "websocket"):
        path = scope.get("path", "") or ""
        if path == _PREFIX or path.startswith(_PREFIX + "/"):
            nuevo = path[len(_PREFIX):] or "/"
            scope = dict(scope)
            scope["path"] = nuevo
            scope["raw_path"] = nuevo.encode("utf-8")
    await _fastapi_app(scope, receive, send)


__all__ = ["app"]
