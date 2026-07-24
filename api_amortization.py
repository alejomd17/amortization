from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, field_validator
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path
from typing import Dict, List
from src.interest_rates import InterestRates
from src.amortization import Amortization
from src.ahorro import Ahorro
from src.inmueble import Inmueble
from src.comparador import Comparador
from src.decisiones import Decisiones
from src.flujo import Flujo

# Rutas absolutas: en serverless el directorio de trabajo no es la raiz del proyecto
BASE_DIR = Path(__file__).resolve().parent

app = FastAPI()
interest_rates = InterestRates()
amortization = Amortization()
ahorro = Ahorro()
inmueble = Inmueble()
comparador = Comparador()
decisiones = Decisiones()
flujo = Flujo()

origins = [
    "https://aleossa.com",
    "https://www.aleossa.com",
    "https://aleossa-web.netlify.app",  # Por si usas el dominio de Netlify temporalmente
    "http://localhost"  # Para desarrollo local
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True, 
    allow_methods=["*"], 
    allow_headers=["*"],
    expose_headers=["*"]
)
app.mount("/static", StaticFiles(directory=BASE_DIR / "static"), name="static")

class AmortizationRequest(BaseModel):
    desembolso_date:str
    loan_amount:float
    interest_rate:float
    type_rate:str
    period:str
    loan_term_years:float
    insurance: float = 0.0
    abono_capital_all: Dict[str, float] = {}
    costos_iniciales: float = 0.0

    @field_validator("insurance", mode="before")
    @classmethod
    def seguro_por_defecto(cls, v):
        # Si llega None, "", o NaN (p. ej. campo vacio en el front), usar 0.0
        if v is None or v == "":
            return 0.0
        try:
            v = float(v)
        except (TypeError, ValueError):
            return 0.0
        return 0.0 if v != v else v  # v != v es True solo para NaN

@app.api_route('/health', methods=["GET", "HEAD"])
async def health():
    return {"status": "ok"}

@app.get('/favicon.ico', include_in_schema=False)
async def favicon():
    return FileResponse(BASE_DIR / "static" / "favicon.svg", media_type="image/svg+xml")

@app.post('/amortization')
async def calculate_amortization_table(request: AmortizationRequest):
    """
    Calcula la tabla de amortización con los parámetros proporcionados.

    Args:

        desembolso_date: Fecha en formato AAAAMM\n
        loan_amount: Monto total del préstamo\n
        interest_rate: Tasa de interés (porcentaje)\n
        type_rate: Tipo de tasa (Nominal/Efectiva)\n
        period: Periodo de la tasa (Anual/Mensual)\n
        loan_term_years: Plazo en años\n
        insurance: Valor del seguro (opcional)\n
        abono_capital_all: Diccionario de abonos {AAAAMM: valor}\n

    Returns:

        Dict con la tabla de amortización
    """
    
    try:
        if len(request.desembolso_date) != 6 or not (request.desembolso_date.isdigit()):
            raise ValueError("Formato de fecha inválido. Deber ser AAAAMM")
        
        resultado = amortization.calcular(
        desembolso_date     = request.desembolso_date,
        loan_amount         = request.loan_amount,
        interest_rate       = request.interest_rate,
        type_rate           = request.type_rate,
        period              = request.period,
        loan_term_years     = request.loan_term_years,
        insurance           = request.insurance,
        abono_capital_all   = request.abono_capital_all,
        costos_iniciales    = request.costos_iniciales,
            )

        return resultado
    except ValueError as ve:
        raise HTTPException(status_code=422, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f'error interno: {str(e)}')

class AhorroRequest(BaseModel):
    monto: float
    interest_rate: float
    type_rate: str
    period: str
    plazo_meses: float
    retencion: float = 4.0  # CDT / renta fija: 4% sobre rendimientos

    @field_validator("retencion", mode="before")
    @classmethod
    def retencion_por_defecto(cls, v):
        if v is None or v == "":
            return 4.0
        try:
            v = float(v)
        except (TypeError, ValueError):
            return 4.0
        return 0.0 if v != v else v  # NaN -> 0


@app.post('/ahorro')
async def calcular_ahorro(request: AhorroRequest):
    """Calcula un CDT (interes compuesto a vencimiento, con retencion en la fuente)."""
    try:
        if request.plazo_meses <= 0:
            raise ValueError("El plazo debe ser mayor a 0.")
        return ahorro.cdt(
            monto         = request.monto,
            interest_rate = request.interest_rate,
            type_rate     = request.type_rate,
            period        = request.period,
            plazo_meses   = request.plazo_meses,
            retencion_pct = request.retencion,
        )
    except ValueError as ve:
        raise HTTPException(status_code=422, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f'error interno: {str(e)}')


class ProgramadoRequest(BaseModel):
    aporte_mensual: float
    monto_inicial: float = 0.0
    interest_rate: float
    type_rate: str
    period: str
    plazo_meses: float
    retencion: float = 7.0  # rendimientos financieros generales

    @field_validator("retencion", "monto_inicial", mode="before")
    @classmethod
    def numero_por_defecto(cls, v, info):
        default = 7.0 if info.field_name == "retencion" else 0.0
        if v is None or v == "":
            return default
        try:
            v = float(v)
        except (TypeError, ValueError):
            return default
        return default if v != v else v  # NaN -> default


@app.post('/ahorro-programado')
async def calcular_ahorro_programado(request: ProgramadoRequest):
    """Ahorro programado: aportes mensuales fijos + monto inicial, interes compuesto."""
    try:
        if request.plazo_meses <= 0:
            raise ValueError("El plazo debe ser mayor a 0.")
        return ahorro.programado(
            aporte_mensual = request.aporte_mensual,
            monto_inicial  = request.monto_inicial,
            interest_rate  = request.interest_rate,
            type_rate      = request.type_rate,
            period         = request.period,
            plazo_meses    = request.plazo_meses,
            retencion_pct  = request.retencion,
        )
    except ValueError as ve:
        raise HTTPException(status_code=422, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f'error interno: {str(e)}')


class MetaRequest(BaseModel):
    modo: str = "aporte"           # "aporte" (dado el plazo) o "tiempo" (dado el aporte)
    meta_objetivo: float
    monto_inicial: float = 0.0
    aporte_mensual: float = 0.0    # modo tiempo
    plazo_meses: float = 0.0       # modo aporte
    interest_rate: float
    type_rate: str
    period: str

    @field_validator("monto_inicial", "aporte_mensual", "plazo_meses", mode="before")
    @classmethod
    def numero_por_defecto(cls, v):
        if v is None or v == "":
            return 0.0
        try:
            v = float(v)
        except (TypeError, ValueError):
            return 0.0
        return 0.0 if v != v else v


@app.post('/ahorro-meta')
async def calcular_ahorro_meta(request: MetaRequest):
    """Meta de ahorro (valor bruto): cuánto aportar, o cuánto tiempo tarda."""
    try:
        if request.modo == "tiempo":
            if request.aporte_mensual <= 0:
                raise ValueError("El aporte mensual debe ser mayor a 0.")
            return ahorro.meta_tiempo(
                meta_objetivo  = request.meta_objetivo,
                monto_inicial  = request.monto_inicial,
                aporte_mensual = request.aporte_mensual,
                interest_rate  = request.interest_rate,
                type_rate      = request.type_rate,
                period         = request.period,
            )
        if request.plazo_meses <= 0:
            raise ValueError("El plazo debe ser mayor a 0.")
        return ahorro.meta_aporte(
            meta_objetivo = request.meta_objetivo,
            monto_inicial = request.monto_inicial,
            interest_rate = request.interest_rate,
            type_rate     = request.type_rate,
            period        = request.period,
            plazo_meses   = request.plazo_meses,
        )
    except ValueError as ve:
        raise HTTPException(status_code=422, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f'error interno: {str(e)}')


class CapacidadRequest(BaseModel):
    ingreso_mensual: float
    porcentaje_max: float = 30
    deudas_actuales: float = 0
    interest_rate: float
    type_rate: str
    period: str
    plazo_meses: float


class CuotaInicialRequest(BaseModel):
    precio: float
    porcentaje_inicial: float = 30
    interest_rate: float
    type_rate: str
    period: str
    plazo_meses: float


class RentabilidadRequest(BaseModel):
    precio: float
    costos_compra_pct: float = 2.5
    arriendo_mensual: float
    vacancia_meses: float = 0
    comision_agencia_pct: float = 10
    administracion_mensual: float = 0
    predial_anual: float = 0
    mantenimiento_anual: float = 0
    inflacion_pct: float = 5
    valorizacion_real_pct: float = 3
    cdt_ea: float = 10
    retencion_cdt_pct: float = 4


@app.post('/inmueble/capacidad')
async def calcular_capacidad(request: CapacidadRequest):
    try:
        if request.plazo_meses <= 0:
            raise ValueError("El plazo debe ser mayor a 0.")
        return inmueble.capacidad(**request.model_dump())
    except ValueError as ve:
        raise HTTPException(status_code=422, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f'error interno: {str(e)}')


@app.post('/inmueble/cuota-inicial')
async def calcular_cuota_inicial(request: CuotaInicialRequest):
    try:
        if request.plazo_meses <= 0:
            raise ValueError("El plazo debe ser mayor a 0.")
        return inmueble.cuota_inicial(**request.model_dump())
    except ValueError as ve:
        raise HTTPException(status_code=422, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f'error interno: {str(e)}')


@app.post('/inmueble/rentabilidad')
async def calcular_rentabilidad(request: RentabilidadRequest):
    try:
        return inmueble.rentabilidad_arriendo(**request.model_dump())
    except ValueError as ve:
        raise HTTPException(status_code=422, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f'error interno: {str(e)}')


class ArrendarComprarRequest(BaseModel):
    precio: float
    cuota_inicial_pct: float = 30
    costos_compra_pct: float = 2.5
    tasa_credito: float
    tc_type: str
    tc_period: str
    plazo_credito_meses: float
    arriendo_mensual: float
    inflacion_pct: float = 5
    valorizacion_real_pct: float = 3
    predial_anual: float = 0
    administracion_mensual: float = 0
    mantenimiento_anual: float = 0
    tasa_inversion_ea: float = 10
    retencion_inversion_pct: float = 4
    horizonte_anos: float = 10
    vende: bool = False
    costos_venta_pct: float = 3


@app.post('/inmueble/arrendar-vs-comprar')
async def calcular_arrendar_vs_comprar(request: ArrendarComprarRequest):
    try:
        if request.plazo_credito_meses <= 0:
            raise ValueError("El plazo del crédito debe ser mayor a 0.")
        if request.horizonte_anos <= 0:
            raise ValueError("El horizonte debe ser mayor a 0.")
        return inmueble.arrendar_vs_comprar(**request.model_dump())
    except ValueError as ve:
        raise HTTPException(status_code=422, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f'error interno: {str(e)}')


class EscenarioCredito(BaseModel):
    nombre: str = ""
    monto: float
    interest_rate: float
    type_rate: str
    period: str
    plazo_meses: float
    costos: float = 0.0


class CompararRequest(BaseModel):
    escenarios: List[EscenarioCredito]


@app.post('/comparar')
async def comparar_creditos(request: CompararRequest):
    """Compara N créditos por su costo total (incluye modo refinanciar vía 'costos')."""
    try:
        if len(request.escenarios) < 2:
            raise ValueError("Agrega al menos 2 créditos para comparar.")
        return comparador.comparar([e.model_dump() for e in request.escenarios])
    except ValueError as ve:
        raise HTTPException(status_code=422, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f'error interno: {str(e)}')


class AbonarVsInvertirRequest(BaseModel):
    modo: str = "original"          # "original" (deduce el saldo) o "saldo" (directo)
    saldo: float = 0
    plazo_restante_meses: float = 0
    monto_inicial: float = 0
    plazo_total_meses: float = 0
    cuotas_pagadas: float = 0
    tasa_credito: float
    tc_type: str
    tc_period: str
    monto_extra: float
    cdt_ea: float = 10
    retencion_cdt_pct: float = 4


@app.post('/decisiones/abonar-vs-invertir')
async def calcular_abonar_vs_invertir(request: AbonarVsInvertirRequest):
    """¿Abonar al crédito o invertir la plata extra en un CDT?"""
    try:
        if request.monto_extra <= 0:
            raise ValueError("El monto extra debe ser mayor a 0.")
        if request.modo == "original":
            if request.plazo_total_meses <= 0:
                raise ValueError("El plazo total debe ser mayor a 0.")
            if request.cuotas_pagadas >= request.plazo_total_meses:
                raise ValueError("Las cuotas pagadas deben ser menos que el plazo total.")
        elif request.plazo_restante_meses <= 0:
            raise ValueError("El plazo restante debe ser mayor a 0.")
        return decisiones.abonar_vs_invertir(**request.model_dump())
    except ValueError as ve:
        raise HTTPException(status_code=422, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f'error interno: {str(e)}')


class CreditoFlujo(BaseModel):
    nombre: str = ""
    saldo: float
    tasa: float = 0                 # 0 = sin interés
    tipo_tasa: str = "Efectiva"
    periodo_tasa: str = "Anual"
    plazo_meses: float
    seguro: float = 0
    abono_fijo: float = 0
    abonos_puntuales: Dict[str, float] = {}
    mes_inicio: str | None = None   # AAAAMM del desembolso; vacío = ya lo tienes hoy


class FlujoRequest(BaseModel):
    creditos: List[CreditoFlujo]
    fecha_inicio: str
    pct_reinversion: float = 100
    orden_manual: List[int] | None = None
    vara: str = "intereses"         # intereses | tiempo | flujo


class FlujoCreditoRequest(BaseModel):
    creditos: List[CreditoFlujo]
    indice: int                     # cual de los creditos se quiere ver
    fecha_inicio: str
    pct_reinversion: float = 100
    orden: List[int] | None = None  # sin orden solo se devuelve la tabla "solo este credito"


@app.post('/flujo')
async def calcular_flujo(request: FlujoRequest):
    """Flujo de créditos con cascada: compara órdenes y proyecta mes a mes."""
    try:
        if len(request.creditos) < 1:
            raise ValueError("Agrega al menos un crédito.")
        if len(request.fecha_inicio) != 6 or not request.fecha_inicio.isdigit():
            raise ValueError("Formato de fecha inválido. Debe ser AAAAMM.")
        for c in request.creditos:
            if c.plazo_meses <= 0:
                raise ValueError(f"El plazo de '{c.nombre or 'un crédito'}' debe ser mayor a 0.")
            mi = (c.mes_inicio or "").strip()
            if mi and (len(mi) != 6 or not mi.isdigit()):
                raise ValueError(
                    f"El mes de desembolso de '{c.nombre or 'un crédito'}' debe ser AAAAMM (ej. 202801).")
        return flujo.comparar(
            creditos        = [c.model_dump() for c in request.creditos],
            fecha_inicio    = request.fecha_inicio,
            pct_reinversion = request.pct_reinversion,
            orden_manual    = request.orden_manual,
            vara            = request.vara,
        )
    except ValueError as ve:
        raise HTTPException(status_code=422, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f'error interno: {str(e)}')


@app.post('/flujo/credito')
async def tabla_de_un_credito(request: FlujoCreditoRequest):
    """Tabla de amortizacion de un credito: sus condiciones solas y dentro del plan."""
    try:
        if len(request.fecha_inicio) != 6 or not request.fecha_inicio.isdigit():
            raise ValueError("Formato de fecha inválido. Debe ser AAAAMM.")
        return flujo.tabla_credito(
            creditos        = [c.model_dump() for c in request.creditos],
            indice          = request.indice,
            fecha_inicio    = request.fecha_inicio,
            pct_reinversion = request.pct_reinversion,
            orden           = request.orden,
        )
    except ValueError as ve:
        raise HTTPException(status_code=422, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f'error interno: {str(e)}')


@app.get("/", response_class=HTMLResponse)
async def read_root():
    try:
        content = (BASE_DIR / "templates" / "amortization.html").read_text(encoding="utf-8")
        return HTMLResponse(content=content)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f'Error al leer el archivo HTML: {str(e)}')