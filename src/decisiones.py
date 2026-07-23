import math
from src.interest_rates import InterestRates

interest_rates = InterestRates()


def _cuota(monto, im, n):
    if n <= 0:
        return 0.0
    if im == 0:
        return monto / n
    return monto * im * (1 + im) ** n / ((1 + im) ** n - 1)


class Decisiones:
    @staticmethod
    def _saldo_restante(monto_inicial, im, plazo_total, cuotas_pagadas):
        """Saldo de un crédito francés tras `cuotas_pagadas` cuotas."""
        cuota = _cuota(monto_inicial, im, plazo_total)
        if im == 0:
            saldo = monto_inicial - cuota * cuotas_pagadas
        else:
            saldo = monto_inicial * (1 + im) ** cuotas_pagadas - cuota * ((1 + im) ** cuotas_pagadas - 1) / im
        return max(saldo, 0.0)

    def abonar_vs_invertir(self,
                           modo: str = "original",
                           # modo "saldo": saldo actual + plazo restante
                           saldo: float = 0,
                           plazo_restante_meses: float = 0,
                           # modo "original": deduce el saldo del crédito original
                           monto_inicial: float = 0,
                           plazo_total_meses: float = 0,
                           cuotas_pagadas: float = 0,
                           # comunes
                           tasa_credito: float = 14,
                           tc_type: str = "Efectiva",
                           tc_period: str = "Anual",
                           monto_extra: float = 10000000,
                           cdt_ea: float = 10,
                           retencion_cdt_pct: float = 4,
                           ) -> dict:
        """¿Abonar al crédito o invertir la plata extra en un CDT?

        Modela los flujos reales: si abonas, el crédito termina antes y la cuota liberada
        se invierte hasta el fin del plazo original; compara el patrimonio final.

        En modo "original" deduce el saldo actual y el plazo restante a partir del crédito
        original (monto, plazo total, cuotas ya pagadas).
        """
        i_loan = interest_rates.calculate_interest_rate(tasa_credito, tc_type, tc_period, 'Mensual') / 100

        if modo == "original":
            plazo_total = int(plazo_total_meses)
            k = int(cuotas_pagadas)
            saldo = self._saldo_restante(monto_inicial, i_loan, plazo_total, k)
            n = plazo_total - k
        else:
            n = int(plazo_restante_meses)

        saldo = float(saldo)
        cuota = _cuota(saldo, i_loan, n)

        # Meses para pagar el saldo tras el abono
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

        interes_ahorrado = cuota * meses_ahorrados - monto_extra
        conviene_abonar = valor_abonar > valor_invertir

        return {
            "saldo": round(saldo, 2),
            "monto_extra": round(float(monto_extra), 2),
            "cuota": round(cuota, 2),
            "plazo_restante_meses": int(n),
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
