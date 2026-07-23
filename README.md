---
title: Amortizacion
emoji: 📉
colorFrom: blue
colorTo: green
sdk: docker
app_port: 7860
pinned: false
---

# aleossa-api

Calculadora de tablas de amortización de crédito con soporte para abonos a capital.
API en FastAPI + frontend estático, servidos desde el mismo proceso.

## Correr en local

```bash
uv sync
uv run uvicorn api_amortization:app --reload --port 8000
```

- App: http://localhost:8000/
- Docs de la API: http://localhost:8000/docs

## Uso desde el notebook

El cálculo no necesita la API; se importa directo:

```python
from src.amortization import Amortization

amortization = Amortization()
tabla = amortization.calculation_amortization(
    desembolso_date="202601",
    loan_amount=240000000,
    interest_rate=11,
    type_rate="Efectiva",
    period="Anual",
    loan_term_years=20,
    insurance=90000.0,
    abono_capital_all={"202603": 32500000.0},
)
```

## Despliegue

Desplegado como Docker Space en Hugging Face. El bloque YAML del inicio es la
configuración que lee HF; `app_port` debe coincidir con el puerto del `Dockerfile`.
