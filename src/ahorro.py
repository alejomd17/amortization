import math
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

    def meta_aporte(self,
                    meta_objetivo: float = 50000000,
                    monto_inicial: float = 0,
                    interest_rate: float = 10,
                    type_rate: str = "Efectiva",
                    period: str = "Anual",
                    plazo_meses: float = 60,
                    ) -> dict:
        """Cuánto aportar al mes para llegar a la meta (valor BRUTO) en el plazo dado."""
        im = self._tasa_mensual_efectiva(interest_rate, type_rate, period)
        n = int(plazo_meses)
        F = (1 + im) ** n
        S = n if im == 0 else ((1 + im) ** n - 1) / im

        ya_alcanzada = monto_inicial * F >= meta_objetivo
        aporte = max((meta_objetivo - monto_inicial * F) / S, 0.0) if S else 0.0

        total_aportado = monto_inicial + aporte * n
        valor_final = monto_inicial * F + aporte * S
        interes = valor_final - total_aportado

        return {
            "modo": "aporte",
            "meta_objetivo": round(float(meta_objetivo), 2),
            "aporte_mensual": round(aporte, 2),
            "monto_inicial": round(float(monto_inicial), 2),
            "plazo_meses": n,
            "tasa_ea": interest_rates.calculate_interest_rate(interest_rate, type_rate, period, 'Anual'),
            "total_aportado": round(total_aportado, 2),
            "interes": round(interes, 2),
            "valor_final": round(valor_final, 2),
            "ya_alcanzada": ya_alcanzada,
        }

    def meta_tiempo(self,
                    meta_objetivo: float = 50000000,
                    monto_inicial: float = 0,
                    aporte_mensual: float = 500000,
                    interest_rate: float = 10,
                    type_rate: str = "Efectiva",
                    period: str = "Anual",
                    ) -> dict:
        """Cuántos meses para llegar a la meta (valor BRUTO) con ese aporte mensual."""
        im = self._tasa_mensual_efectiva(interest_rate, type_rate, period)
        ya_alcanzada = monto_inicial >= meta_objetivo
        alcanzable = True
        n = 0

        if ya_alcanzada:
            n = 0
        elif im == 0:
            alcanzable = aporte_mensual > 0
            if alcanzable:
                n = math.ceil((meta_objetivo - monto_inicial) / aporte_mensual)
        else:
            base = monto_inicial + aporte_mensual / im
            x = (meta_objetivo + aporte_mensual / im) / base if base > 0 else 0
            if x > 1:
                n = math.ceil(math.log(x) / math.log(1 + im))
            else:
                alcanzable = False

        if not alcanzable:
            return {
                "modo": "tiempo",
                "alcanzable": False,
                "meta_objetivo": round(float(meta_objetivo), 2),
                "aporte_mensual": round(float(aporte_mensual), 2),
                "monto_inicial": round(float(monto_inicial), 2),
            }

        F = (1 + im) ** n
        S = n if im == 0 else ((1 + im) ** n - 1) / im
        total_aportado = monto_inicial + aporte_mensual * n
        valor_final = monto_inicial * F + aporte_mensual * S

        return {
            "modo": "tiempo",
            "alcanzable": True,
            "meta_objetivo": round(float(meta_objetivo), 2),
            "aporte_mensual": round(float(aporte_mensual), 2),
            "monto_inicial": round(float(monto_inicial), 2),
            "meses": int(n),
            "anos": round(n / 12, 1),
            "tasa_ea": interest_rates.calculate_interest_rate(interest_rate, type_rate, period, 'Anual'),
            "total_aportado": round(total_aportado, 2),
            "valor_final": round(valor_final, 2),
            "ya_alcanzada": ya_alcanzada,
        }
