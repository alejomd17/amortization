from src.interest_rates import InterestRates

interest_rates = InterestRates()


class Ahorro:
    _DICT_PERIOD = {"Mensual": 1, "Semestral": 6, "Anual": 12}

    def _tasa_mensual_efectiva(self, interest_rate: float, type_rate: str, period: str) -> float:
        """Tasa efectiva mensual como decimal, SIN redondear (para componer con precision).

        Misma logica que InterestRates.calculate_interest_rate, pero sin el round(),
        que acumula error al elevar a muchos periodos.
        """
        rate = interest_rate
        cur = period
        if type_rate == "Nominal":
            rate = rate / self._DICT_PERIOD[cur]
            cur = "Mensual"
        return (1 + rate / 100) ** (1 / self._DICT_PERIOD[cur]) - 1

    def cdt(self,
            monto: float = 10000000,
            interest_rate: float = 10,
            type_rate: str = "Efectiva",
            period: str = "Anual",
            plazo_meses: float = 12,
            retencion_pct: float = 4.0,
            ) -> dict:
        """Calcula un CDT: interes compuesto a vencimiento, con retencion en la fuente.

        La retencion se aplica sobre los rendimientos (interes bruto). Para CDT y
        titulos de renta fija la tarifa tipica es 4%.
        """
        tasa_mensual = self._tasa_mensual_efectiva(interest_rate, type_rate, period)

        valor_final_bruto = monto * (1 + tasa_mensual) ** plazo_meses
        interes_bruto = valor_final_bruto - monto
        retencion = interes_bruto * (retencion_pct / 100)
        interes_neto = interes_bruto - retencion
        valor_final_neto = monto + interes_neto

        # Tasas para mostrar (redondeadas)
        tasa_ea = interest_rates.calculate_interest_rate(interest_rate, type_rate, period, 'Anual')
        tasa_mv = round(tasa_mensual * 100, 4)

        return {
            "monto": round(float(monto), 2),
            "plazo_meses": int(plazo_meses),
            "tasa_ea": tasa_ea,
            "tasa_mv": tasa_mv,
            "interes_bruto": round(interes_bruto, 2),
            "retencion_pct": round(float(retencion_pct), 2),
            "retencion": round(retencion, 2),
            "interes_neto": round(interes_neto, 2),
            "valor_final_bruto": round(valor_final_bruto, 2),
            "valor_final_neto": round(valor_final_neto, 2),
            # rendimiento neto sobre el capital, en todo el plazo
            "rendimiento_neto_pct": round(interes_neto / monto * 100, 2) if monto else 0.0,
        }

    def programado(self,
                   aporte_mensual: float = 500000,
                   monto_inicial: float = 0,
                   interest_rate: float = 10,
                   type_rate: str = "Efectiva",
                   period: str = "Anual",
                   plazo_meses: float = 60,
                   retencion_pct: float = 7.0,
                   ) -> dict:
        """Ahorro programado: aportes mensuales fijos + un monto inicial opcional,
        con interes compuesto (valor futuro de una anualidad vencida).

        Rendimientos financieros generales: retencion tipica 7%.
        """
        im = self._tasa_mensual_efectiva(interest_rate, type_rate, period)
        n = int(plazo_meses)

        fv_inicial = monto_inicial * (1 + im) ** n
        if im == 0:
            fv_aportes = aporte_mensual * n
        else:
            fv_aportes = aporte_mensual * (((1 + im) ** n - 1) / im)

        valor_final_bruto = fv_inicial + fv_aportes
        total_aportado = monto_inicial + aporte_mensual * n
        interes_bruto = valor_final_bruto - total_aportado
        retencion = interes_bruto * (retencion_pct / 100)
        interes_neto = interes_bruto - retencion
        valor_final_neto = total_aportado + interes_neto

        tasa_ea = interest_rates.calculate_interest_rate(interest_rate, type_rate, period, 'Anual')
        tasa_mv = round(im * 100, 4)

        return {
            "aporte_mensual": round(float(aporte_mensual), 2),
            "monto_inicial": round(float(monto_inicial), 2),
            "plazo_meses": n,
            "tasa_ea": tasa_ea,
            "tasa_mv": tasa_mv,
            "total_aportado": round(total_aportado, 2),
            "interes_bruto": round(interes_bruto, 2),
            "retencion_pct": round(float(retencion_pct), 2),
            "retencion": round(retencion, 2),
            "interes_neto": round(interes_neto, 2),
            "valor_final_bruto": round(valor_final_bruto, 2),
            "valor_final_neto": round(valor_final_neto, 2),
        }

    def meta(self,
             meta_objetivo: float = 50000000,
             monto_inicial: float = 0,
             interest_rate: float = 10,
             type_rate: str = "Efectiva",
             period: str = "Anual",
             plazo_meses: float = 60,
             retencion_pct: float = 7.0,
             ) -> dict:
        """Meta de ahorro (inverso del programado): cuánto aportar al mes para
        llegar a `meta_objetivo` (valor final NETO) en `plazo_meses`.
        """
        im = self._tasa_mensual_efectiva(interest_rate, type_rate, period)
        n = int(plazo_meses)
        F = (1 + im) ** n
        S = n if im == 0 else ((1 + im) ** n - 1) / im
        r = 1 - retencion_pct / 100

        # meta_neta = aportado + interes_neto  →  despejar el aporte mensual (PMT)
        denom = n + r * (S - n)
        aporte = (meta_objetivo - monto_inicial - r * monto_inicial * (F - 1)) / denom if denom else 0.0
        ya_alcanzada = aporte <= 0
        aporte = max(aporte, 0.0)

        total_aportado = monto_inicial + aporte * n
        fv_bruto = monto_inicial * F + aporte * S
        interes_bruto = fv_bruto - total_aportado
        retencion = interes_bruto * (retencion_pct / 100)
        interes_neto = interes_bruto - retencion
        valor_final_neto = total_aportado + interes_neto

        tasa_ea = interest_rates.calculate_interest_rate(interest_rate, type_rate, period, 'Anual')

        return {
            "meta_objetivo": round(float(meta_objetivo), 2),
            "aporte_mensual": round(aporte, 2),
            "monto_inicial": round(float(monto_inicial), 2),
            "plazo_meses": n,
            "tasa_ea": tasa_ea,
            "tasa_mv": round(im * 100, 4),
            "total_aportado": round(total_aportado, 2),
            "interes_neto": round(interes_neto, 2),
            "retencion_pct": round(float(retencion_pct), 2),
            "valor_final_neto": round(valor_final_neto, 2),
            "ya_alcanzada": ya_alcanzada,  # el monto inicial solo ya supera la meta
        }
