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

    # ── Arrendar vs. comprar ──────────────────────────────────────────────────
    def arrendar_vs_comprar(self,
                            precio: float = 300000000,
                            cuota_inicial_pct: float = 30,
                            costos_compra_pct: float = 2.5,
                            tasa_credito: float = 12,
                            tc_type: str = "Efectiva",
                            tc_period: str = "Anual",
                            plazo_credito_meses: float = 240,
                            arriendo_mensual: float = 1500000,
                            inflacion_pct: float = 5,
                            valorizacion_real_pct: float = 3,
                            predial_anual: float = 0,
                            administracion_mensual: float = 0,
                            mantenimiento_anual: float = 0,
                            tasa_inversion_ea: float = 10,
                            retencion_inversion_pct: float = 4,
                            horizonte_anos: float = 10,
                            vende: bool = False,
                            costos_venta_pct: float = 3,
                            ) -> dict:
        """Arrendar vs. comprar, comparando el patrimonio final a un horizonte.

        Comprar: patrimonio = valor del inmueble − saldo del crédito (− venta si aplica).
        Arrendar: invierte la cuota inicial y, mes a mes, lo que se ahorra frente al costo
        de comprar; el patrimonio es ese fondo acumulado.
        """
        i_loan = interest_rates.calculate_interest_rate(tasa_credito, tc_type, tc_period, 'Mensual') / 100
        cuota_inicial = precio * cuota_inicial_pct / 100
        costos_compra = precio * costos_compra_pct / 100
        desembolso_inicial = cuota_inicial + costos_compra          # lo que invierte el que arrienda
        monto_credito = precio - cuota_inicial
        plazo = int(plazo_credito_meses)

        if i_loan == 0:
            cuota = monto_credito / plazo if plazo else 0.0
        else:
            cuota = monto_credito * i_loan * (1 + i_loan) ** plazo / ((1 + i_loan) ** plazo - 1)

        # Inversión (costo de oportunidad) neta, mensual
        inv_neta_ea = tasa_inversion_ea * (1 - retencion_inversion_pct / 100)
        i_inv = (1 + inv_neta_ea / 100) ** (1 / 12) - 1
        valorizacion_total = inflacion_pct + valorizacion_real_pct  # anual, nominal
        costos_prop_base = predial_anual / 12 + administracion_mensual + mantenimiento_anual / 12

        def _saldo(m):
            if m >= plazo:
                return 0.0
            if i_loan == 0:
                return max(monto_credito - cuota * m, 0.0)
            return monto_credito * (1 + i_loan) ** m - cuota * ((1 + i_loan) ** m - 1) / i_loan

        def _patrimonios(meses):
            anos = meses / 12
            valor_inmueble = precio * (1 + valorizacion_total / 100) ** anos
            patr_comprar = valor_inmueble - _saldo(meses)
            if vende:
                patr_comprar -= valor_inmueble * costos_venta_pct / 100

            # Arrendar: cuota inicial invertida + diferencia mensual invertida
            fondo = desembolso_inicial * (1 + i_inv) ** meses
            for k in range(1, meses + 1):
                factor_infl = (1 + inflacion_pct / 100) ** ((k - 1) // 12)
                arriendo_k = arriendo_mensual * factor_infl
                # predial, administración y mantenimiento suben con inflación; la cuota no
                costo_comprar_k = (cuota if k <= plazo else 0.0) + costos_prop_base * factor_infl
                diferencia = costo_comprar_k - arriendo_k          # lo que ahorra al arrendar
                fondo += diferencia * (1 + i_inv) ** (meses - k)
            return patr_comprar, fondo

        n_meses = int(horizonte_anos * 12)
        patr_comprar, patr_arrendar = _patrimonios(n_meses)

        # Año de equilibrio: primer año donde comprar >= arrendar
        break_even = None
        for y in range(1, 41):
            c, a = _patrimonios(y * 12)
            if c >= a:
                break_even = y
                break

        return {
            "precio": round(float(precio), 2),
            "cuota_inicial": round(cuota_inicial, 2),
            "costos_compra": round(costos_compra, 2),
            "monto_credito": round(monto_credito, 2),
            "cuota_credito": round(cuota, 2),
            "arriendo_mensual": round(float(arriendo_mensual), 2),
            "horizonte_anos": round(float(horizonte_anos), 1),
            "valor_inmueble_final": round(precio * (1 + valorizacion_total / 100) ** horizonte_anos, 2),
            "saldo_credito_final": round(_saldo(n_meses), 2),
            "patrimonio_comprar": round(patr_comprar, 2),
            "patrimonio_arrendar": round(patr_arrendar, 2),
            "diferencia": round(abs(patr_comprar - patr_arrendar), 2),
            "conviene_comprar": patr_comprar >= patr_arrendar,
            "break_even_ano": break_even,
            "vende": vende,
        }
