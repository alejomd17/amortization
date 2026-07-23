import math
from src.interest_rates import InterestRates

interest_rates = InterestRates()


class Decisiones:
    def abonar_vs_invertir(self,
                           saldo: float = 150000000,
                           plazo_restante_meses: float = 180,
                           tasa_credito: float = 14,
                           tc_type: str = "Efectiva",
                           tc_period: str = "Anual",
                           monto_extra: float = 10000000,
                           cdt_ea: float = 10,
                           retencion_cdt_pct: float = 4,
                           ) -> dict:
        """Tienes plata extra: ¿abonar al crédito o invertir en un CDT?

        Modela los flujos reales: si abonas, el crédito termina antes y la cuota que se
        libera se invierte hasta el fin del plazo original. Compara el patrimonio final
        de las dos estrategias en ese horizonte.
        """
        i_loan = interest_rates.calculate_interest_rate(tasa_credito, tc_type, tc_period, 'Mensual') / 100
        n = int(plazo_restante_meses)

        # Cuota del crédito (sistema francés)
        if i_loan == 0:
            cuota = saldo / n if n else 0.0
        else:
            cuota = saldo * i_loan * (1 + i_loan) ** n / ((1 + i_loan) ** n - 1)

        # Meses para pagar el saldo restante tras el abono
        nuevo_saldo = max(saldo - monto_extra, 0.0)
        if nuevo_saldo <= 0:
            m_a = 0
        elif i_loan == 0:
            m_a = math.ceil(nuevo_saldo / cuota) if cuota else n
        else:
            arg = 1 - nuevo_saldo * i_loan / cuota
            m_a = math.ceil(-math.log(arg) / math.log(1 + i_loan)) if arg > 0 else n
        m_a = min(m_a, n)
        meses_ahorrados = n - m_a

        # CDT neto, tasa mensual efectiva
        cdt_neto_ea = cdt_ea * (1 - retencion_cdt_pct / 100)
        i_cdt = (1 + cdt_neto_ea / 100) ** (1 / 12) - 1

        # ABONAR: la cuota liberada (desde m_a+1 hasta n) se invierte en el CDT
        if i_cdt == 0:
            valor_abonar = cuota * meses_ahorrados
        else:
            valor_abonar = cuota * (((1 + i_cdt) ** meses_ahorrados - 1) / i_cdt)

        # INVERTIR: el extra crece en el CDT por todo el plazo restante
        valor_invertir = monto_extra * (1 + i_cdt) ** n

        # Intereses del crédito que te ahorras al abonar (cuotas evitadas menos el capital extra)
        interes_ahorrado = cuota * meses_ahorrados - monto_extra
        conviene_abonar = valor_abonar > valor_invertir

        return {
            "saldo": round(float(saldo), 2),
            "monto_extra": round(float(monto_extra), 2),
            "cuota": round(cuota, 2),
            "plazo_restante_meses": n,
            "tasa_credito_ea": interest_rates.calculate_interest_rate(tasa_credito, tc_type, tc_period, 'Anual'),
            "cdt_neto_ea": round(cdt_neto_ea, 2),
            "meses_ahorrados": int(meses_ahorrados),
            "nuevo_plazo_meses": int(m_a),
            "interes_ahorrado": round(interes_ahorrado, 2),
            "valor_abonar": round(valor_abonar, 2),
            "valor_invertir": round(valor_invertir, 2),
            "diferencia": round(abs(valor_abonar - valor_invertir), 2),
            "conviene_abonar": conviene_abonar,
        }
