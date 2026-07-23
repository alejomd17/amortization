from src.interest_rates import InterestRates

interest_rates = InterestRates()


def _tasa_mensual(interest_rate, type_rate, period):
    """Tasa efectiva mensual como decimal (usa el motor de conversión existente)."""
    return interest_rates.calculate_interest_rate(interest_rate, type_rate, period, 'Mensual') / 100


class Inmueble:
    # ── Capacidad de endeudamiento ────────────────────────────────────────────
    def capacidad(self,
                  ingreso_mensual: float = 5000000,
                  porcentaje_max: float = 30,
                  deudas_actuales: float = 0,
                  interest_rate: float = 12,
                  type_rate: str = "Efectiva",
                  period: str = "Anual",
                  plazo_meses: float = 240,
                  ) -> dict:
        """Cuánto te prestan: cuota ≤ porcentaje_max% del ingreso (menos deudas),
        y el monto máximo = valor presente de esa cuota al plazo y tasa dados.
        """
        im = _tasa_mensual(interest_rate, type_rate, period)
        n = int(plazo_meses)

        cuota_max = max(ingreso_mensual * porcentaje_max / 100 - deudas_actuales, 0.0)
        if im == 0:
            monto_max = cuota_max * n
        else:
            monto_max = cuota_max * (1 - (1 + im) ** -n) / im

        return {
            "ingreso_mensual": round(float(ingreso_mensual), 2),
            "porcentaje_max": round(float(porcentaje_max), 2),
            "deudas_actuales": round(float(deudas_actuales), 2),
            "cuota_max": round(cuota_max, 2),
            "monto_max": round(monto_max, 2),
            "plazo_meses": n,
            "tasa_ea": interest_rates.calculate_interest_rate(interest_rate, type_rate, period, 'Anual'),
        }

    # ── Cuota inicial + precio de vivienda ────────────────────────────────────
    def cuota_inicial(self,
                      precio: float = 300000000,
                      porcentaje_inicial: float = 30,
                      interest_rate: float = 12,
                      type_rate: str = "Efectiva",
                      period: str = "Anual",
                      plazo_meses: float = 240,
                      ) -> dict:
        """Del precio y el % de cuota inicial → monto a financiar y la cuota mensual."""
        im = _tasa_mensual(interest_rate, type_rate, period)
        n = int(plazo_meses)

        cuota_inicial = precio * porcentaje_inicial / 100
        monto_financiar = precio - cuota_inicial
        if im == 0:
            cuota = monto_financiar / n if n else 0.0
        else:
            cuota = monto_financiar * im * (1 + im) ** n / ((1 + im) ** n - 1)
        total_pagado = cuota * n
        total_intereses = total_pagado - monto_financiar

        return {
            "precio": round(float(precio), 2),
            "porcentaje_inicial": round(float(porcentaje_inicial), 2),
            "cuota_inicial": round(cuota_inicial, 2),
            "monto_financiar": round(monto_financiar, 2),
            "cuota_mensual": round(cuota, 2),
            "total_pagado": round(total_pagado, 2),
            "total_intereses": round(total_intereses, 2),
            "plazo_meses": n,
            "tasa_ea": interest_rates.calculate_interest_rate(interest_rate, type_rate, period, 'Anual'),
        }

    # ── Rentabilidad de arriendo ──────────────────────────────────────────────
    def rentabilidad_arriendo(self,
                              precio: float = 300000000,
                              costos_compra_pct: float = 2.5,
                              arriendo_mensual: float = 1500000,
                              vacancia_meses: float = 0,
                              comision_agencia_pct: float = 10,
                              administracion_mensual: float = 0,
                              predial_anual: float = 0,
                              mantenimiento_anual: float = 0,
                              inflacion_pct: float = 5,
                              valorizacion_real_pct: float = 3,
                              cdt_ea: float = 10,
                              retencion_cdt_pct: float = 4,
                              ) -> dict:
        """Rentabilidad de comprar para arrendar, vs. dejar la plata en un CDT."""
        inversion = precio * (1 + costos_compra_pct / 100)
        meses_arrendado = max(12 - vacancia_meses, 0)

        ingreso_bruto_anual = arriendo_mensual * meses_arrendado
        comision = arriendo_mensual * comision_agencia_pct / 100 * meses_arrendado
        administracion = administracion_mensual * 12
        gastos_anuales = comision + administracion + predial_anual + mantenimiento_anual
        ingreso_neto_anual = ingreso_bruto_anual - gastos_anuales

        rent_bruta = arriendo_mensual * 12 / inversion * 100 if inversion else 0.0
        rent_neta = ingreso_neto_anual / inversion * 100 if inversion else 0.0
        flujo_mensual = ingreso_neto_anual / 12

        valorizacion_total = inflacion_pct + valorizacion_real_pct
        rent_total = rent_neta + valorizacion_total

        cdt_neto = cdt_ea * (1 - retencion_cdt_pct / 100)

        return {
            "precio": round(float(precio), 2),
            "inversion_total": round(inversion, 2),
            "ingreso_bruto_anual": round(ingreso_bruto_anual, 2),
            "gastos": {
                "comision_agencia": round(comision, 2),
                "administracion": round(administracion, 2),
                "predial": round(float(predial_anual), 2),
                "mantenimiento": round(float(mantenimiento_anual), 2),
                "total": round(gastos_anuales, 2),
            },
            "ingreso_neto_anual": round(ingreso_neto_anual, 2),
            "flujo_mensual": round(flujo_mensual, 2),
            "rent_bruta": round(rent_bruta, 2),
            "rent_neta": round(rent_neta, 2),
            "valorizacion_total": round(valorizacion_total, 2),
            "rent_total": round(rent_total, 2),
            "cdt_ea": round(float(cdt_ea), 2),
            "cdt_neto": round(cdt_neto, 2),
            "conviene_inmueble": rent_total > cdt_neto,
        }
