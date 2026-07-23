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

from api_amortization import app  # noqa: E402

__all__ = ["app"]
