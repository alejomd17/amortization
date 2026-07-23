from src.interest_rates import InterestRates

interest_rates = InterestRates()


class Decisiones:
    def abonar_vs_invertir(self,
                           monto_extra: float = 10000000,
                           tasa_credito: float = 14,
                           tc_type: str = "Efectiva",
                           tc_period: str = "Anual",
                           cdt_ea: float = 10,
                           retencion_cdt_pct: float = 4,
                           horizonte_anos: float = 5,
                           ) -> dict:
        """Tienes plata extra: ¿abonar al crédito o invertir en un CDT?

        Abonar "rinde" la tasa efectiva del crédito, libre de impuestos (te ahorras
        ese interés). Invertir rinde la tasa del CDT menos la retención.
        """
        tasa_credito_ea = interest_rates.calculate_interest_rate(tasa_credito, tc_type, tc_period, 'Anual')
        cdt_neto = cdt_ea * (1 - retencion_cdt_pct / 100)
        n = horizonte_anos

        valor_abonar = monto_extra * (1 + tasa_credito_ea / 100) ** n
        valor_invertir = monto_extra * (1 + cdt_neto / 100) ** n

        conviene_abonar = tasa_credito_ea > cdt_neto

        return {
            "monto_extra": round(float(monto_extra), 2),
            "tasa_credito_ea": tasa_credito_ea,
            "cdt_neto": round(cdt_neto, 2),
            "horizonte_anos": round(float(n), 2),
            "valor_abonar": round(valor_abonar, 2),
            "valor_invertir": round(valor_invertir, 2),
            "ganancia_abonar": round(valor_abonar - monto_extra, 2),
            "ganancia_invertir": round(valor_invertir - monto_extra, 2),
            "diferencia": round(abs(valor_abonar - valor_invertir), 2),
            "conviene_abonar": conviene_abonar,
        }
