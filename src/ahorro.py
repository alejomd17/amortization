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
