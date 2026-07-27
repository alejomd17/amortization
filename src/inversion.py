"""Módulos de inversión con flujo: derechos fiduciarios, negocio y comparador.

La idea común: toda inversión se reduce a tres números — lo que metes, lo que te
da mes a mes, y lo que recuperas al final. Con eso se calcula la rentabilidad
efectiva anual (E.A.) equivalente, que es la única forma justa de comparar
vehículos con estructuras distintas (un CDT que devuelve capital vs. un carro que
se deprecia vs. un derecho fiduciario que se valoriza).
"""

_MESES_PERIODO = {"Mensual": 1, "Trimestral": 3, "Semestral": 6, "Anual": 12}


def tir_mensual(flujos, iters: int = 200):
    """TIR mensual (decimal) por bisección. flujos[0] es t0 (normalmente negativo).

    Devuelve None si el flujo no cambia de signo (no hay TIR real única).
    """
    def npv(r):
        # Horner: VPN = f0 + f1/x + f2/x^2 + ... evaluado como f0 + (1/x)(f1 + (1/x)(...)).
        # x = 1+r nunca es 0 (r >= -0.9999), así que no hay división por cero; si x es
        # diminuto el acumulado desborda a ±inf y el signo se conserva (no revienta).
        x = 1 + r
        acc = 0.0
        for f in reversed(flujos):
            acc = f + acc / x
        return acc

    lo, hi = -0.9999, 1.0
    f_lo, f_hi = npv(lo), npv(hi)
    tries = 0
    while f_lo * f_hi > 0 and tries < 80:
        hi *= 1.5
        f_hi = npv(hi)
        tries += 1
    if f_lo * f_hi > 0:
        return None
    for _ in range(iters):
        mid = (lo + hi) / 2
        f_mid = npv(mid)
        if abs(f_mid) < 1e-7:
            return mid
        if f_lo * f_mid < 0:
            hi, f_hi = mid, f_mid
        else:
            lo, f_lo = mid, f_mid
    return (lo + hi) / 2


def tir_ea(flujos):
    """Rentabilidad efectiva anual (%) equivalente a la TIR mensual del flujo."""
    im = tir_mensual(flujos)
    if im is None:
        return None
    return round(((1 + im) ** 12 - 1) * 100, 2)


def derechos(aporte: float = 100000000,
             rendimiento_caja_anual: float = 8.0,
             periodicidad: str = "Mensual",
             valorizacion_anual: float = 5.0,
             horizonte_meses: float = 60,
             retencion_pct: float = 7.0,
             valor_patrimonio: float = 0.0,
             ) -> dict:
    """Derecho fiduciario: participación en un patrimonio autónomo.

    Dos flujos separados: el reparto de caja (lo que te cae al bolsillo, pro rata,
    según la periodicidad del reglamento) y la valorización (solo se materializa al
    salir/liquidar). Nada garantizado: son los supuestos que mete el usuario.

    El reparto se calcula sobre el aporte inicial (plano, no crece con la
    valorización). La valorización capitaliza sobre el aporte.
    """
    n = int(horizonte_meses)
    mp = _MESES_PERIODO.get(periodicidad, 1)
    rc = rendimiento_caja_anual / 100.0
    val = valorizacion_anual / 100.0
    ret = retencion_pct / 100.0

    # Reparto por periodo: la fracción del año que cubre ese periodo, sobre el aporte.
    reparto_bruto_periodo = aporte * rc * (mp / 12.0)
    reparto_neto_periodo = reparto_bruto_periodo * (1 - ret)

    flujos = [-aporte]
    tabla = []
    acum_neto = 0.0
    total_bruto = total_ret = total_neto = 0.0
    for m in range(1, n + 1):
        es_reparto = (m % mp == 0)
        rb = reparto_bruto_periodo if es_reparto else 0.0
        rt = rb * ret
        rn = rb - rt
        acum_neto += rn
        total_bruto += rb
        total_ret += rt
        total_neto += rn
        valor_part = aporte * (1 + val) ** (m / 12.0)
        flujo_mes = rn + (valor_part if m == n else 0.0)
        flujos.append(flujo_mes)
        tabla.append({
            "mes": m,
            "reparto_bruto": round(rb, 2),
            "retencion": round(rt, 2),
            "reparto_neto": round(rn, 2),
            "acum_neto": round(acum_neto, 2),
            "valor_participacion": round(valor_part, 2),
        })

    valor_salida = aporte * (1 + val) ** (n / 12.0)
    valorizacion = valor_salida - aporte
    ganancia_total = total_neto + valorizacion
    reparto_mensual_equiv = total_neto / n if n else 0.0
    participacion_pct = round(aporte / valor_patrimonio * 100, 4) if valor_patrimonio else None

    return {
        "aporte": round(float(aporte), 2),
        "horizonte_meses": n,
        "periodicidad": periodicidad,
        "meses_periodo": mp,
        "rendimiento_caja_anual": round(float(rendimiento_caja_anual), 2),
        "valorizacion_anual": round(float(valorizacion_anual), 2),
        "retencion_pct": round(float(retencion_pct), 2),
        "participacion_pct": participacion_pct,
        "reparto_bruto_periodo": round(reparto_bruto_periodo, 2),
        "reparto_neto_periodo": round(reparto_neto_periodo, 2),
        "reparto_mensual_equiv": round(reparto_mensual_equiv, 2),
        "total_repartos_neto": round(total_neto, 2),
        "retencion_total": round(total_ret, 2),
        "valor_salida": round(valor_salida, 2),
        "valorizacion": round(valorizacion, 2),
        "ganancia_total": round(ganancia_total, 2),
        "tir_ea": tir_ea(flujos),
        "tabla": tabla,
    }


def _resumen_tasa_fija(monto, tasa_ea, n, retencion_pct, modo):
    """Flujo y resumen de una inversión a tasa fija (CDT o similar)."""
    im = (1 + tasa_ea / 100.0) ** (1 / 12.0) - 1
    ret = retencion_pct / 100.0
    flujos = [-monto]
    if modo == "retiro":
        renta_neta = monto * im * (1 - ret)
        for m in range(1, n + 1):
            flujos.append(renta_neta + (monto if m == n else 0.0))
        mensual, valor_final = renta_neta, monto
        total_recibido = renta_neta * n + monto
    else:  # reinvierte
        vf_bruto = monto * (1 + im) ** n
        vf_neto = monto + (vf_bruto - monto) * (1 - ret)
        for m in range(1, n + 1):
            flujos.append(vf_neto if m == n else 0.0)
        mensual, valor_final = 0.0, vf_neto
        total_recibido = vf_neto
    return {
        "aporte": round(float(monto), 2),
        "mensual": round(mensual, 2),
        "valor_final": round(valor_final, 2),
        "total_recibido": round(total_recibido, 2),
        "ganancia": round(total_recibido - monto, 2),
        "tir_ea": tir_ea(flujos),
    }


def _resumen_desde(d, aporte_key, mensual_key, valor_key, total_neto_key):
    """Extrae el resumen normalizado de un dict de derechos()/negocio()."""
    aporte = d[aporte_key]
    valor_final = d[valor_key]
    total_recibido = d[total_neto_key] + valor_final
    return {
        "aporte": round(aporte, 2),
        "mensual": round(d[mensual_key], 2),
        "valor_final": round(valor_final, 2),
        "total_recibido": round(total_recibido, 2),
        "ganancia": round(total_recibido - aporte, 2),
        "tir_ea": d["tir_ea"],
    }


def _f(v, default=0.0):
    try:
        v = float(v)
        return default if v != v else v
    except (TypeError, ValueError):
        return default


def comparar(opciones) -> dict:
    """Pone varios vehículos lado a lado y los ordena por rentabilidad E.A. real.

    Cada opción es un dict con 'tipo' (tasa_fija | derechos | negocio), 'nombre',
    'horizonte_meses' y los parámetros propios del vehículo. La E.A. equivalente
    (TIR) es lo que hace justa la comparación: mete el flujo mensual, lo que
    recuperas al final y el tiempo, todo en un solo número.
    """
    resultados = []
    for op in opciones:
        tipo = op.get("tipo")
        n = int(_f(op.get("horizonte_meses"), 0))
        if n <= 0:
            continue
        if tipo == "tasa_fija":
            r = _resumen_tasa_fija(_f(op.get("monto")), _f(op.get("tasa_ea")), n,
                                   _f(op.get("retencion_pct"), 4.0), op.get("modo", "reinvierte"))
        elif tipo == "derechos":
            d = derechos(_f(op.get("aporte")), _f(op.get("rendimiento_caja_anual"), 8.0),
                         op.get("periodicidad", "Mensual"), _f(op.get("valorizacion_anual"), 5.0),
                         n, _f(op.get("retencion_pct"), 7.0))
            r = _resumen_desde(d, "aporte", "reparto_mensual_equiv", "valor_salida", "total_repartos_neto")
        elif tipo == "negocio":
            d = negocio(_f(op.get("inversion")), _f(op.get("flujo_mensual_neto")),
                        _f(op.get("valor_salida")), n, _f(op.get("crecimiento_anual")),
                        _f(op.get("costo_mensual")))
            r = _resumen_desde(d, "inversion", "neto_mensual_equiv", "valor_salida", "total_neto")
        else:
            continue
        r["nombre"] = op.get("nombre") or tipo
        r["tipo"] = tipo
        r["horizonte_meses"] = n
        resultados.append(r)

    # Ordena por E.A. desc; los que no tienen TIR (None) quedan al final.
    resultados.sort(key=lambda x: x["tir_ea"] if x["tir_ea"] is not None else -1e9, reverse=True)
    return {
        "opciones": resultados,
        "mejor": resultados[0]["nombre"] if resultados else None,
    }


def negocio(inversion: float = 200000000,
            flujo_mensual_neto: float = 3000000,
            valor_salida: float = 200000000,
            horizonte_meses: float = 60,
            crecimiento_anual: float = 0.0,
            costo_mensual: float = 0.0,
            ) -> dict:
    """Negocio o activo que produce: metes una inversión, te deja un flujo neto
    mensual, y al final lo vendes/traspasas por un valor (que puede ser MENOR que
    lo que pagaste — un carro se deprecia; un hostal puede valorizarse).

    El flujo puede crecer un % anual (un hostal sube tarifas). El costo mensual es
    opcional, para quien quiera detallar gastos aparte del flujo neto.
    """
    n = int(horizonte_meses)
    g = crecimiento_anual / 100.0

    flujos = [-inversion]
    tabla = []
    acum = 0.0
    total_ingreso = total_costo = total_neto = 0.0
    for m in range(1, n + 1):
        factor = (1 + g) ** ((m - 1) / 12.0)
        ingreso = flujo_mensual_neto * factor
        neto = ingreso - costo_mensual
        acum += neto
        total_ingreso += ingreso
        total_costo += costo_mensual
        total_neto += neto
        flujo_mes = neto + (valor_salida if m == n else 0.0)
        flujos.append(flujo_mes)
        tabla.append({
            "mes": m,
            "ingreso": round(ingreso, 2),
            "costo": round(costo_mensual, 2),
            "neto": round(neto, 2),
            "acum_neto": round(acum, 2),
        })

    diferencia_activo = valor_salida - inversion
    ganancia_total = total_neto + diferencia_activo
    neto_mensual_equiv = total_neto / n if n else 0.0
    flujo_mensual_inicial = flujo_mensual_neto - costo_mensual

    return {
        "inversion": round(float(inversion), 2),
        "horizonte_meses": n,
        "crecimiento_anual": round(float(crecimiento_anual), 2),
        "costo_mensual": round(float(costo_mensual), 2),
        "flujo_mensual_inicial": round(flujo_mensual_inicial, 2),
        "neto_mensual_equiv": round(neto_mensual_equiv, 2),
        "total_neto": round(total_neto, 2),
        "valor_salida": round(float(valor_salida), 2),
        "diferencia_activo": round(diferencia_activo, 2),
        "se_valoriza": diferencia_activo >= 0,
        "ganancia_total": round(ganancia_total, 2),
        "tir_ea": tir_ea(flujos),
        "tabla": tabla,
    }
