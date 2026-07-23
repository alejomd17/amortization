from src.interest_rates import InterestRates
from datetime import datetime
interest_rates = InterestRates()

class Amortization:
    def calcular(self,
                 desembolso_date: str = datetime.now().strftime("%Y%m"),
                 loan_amount: float = 100000000,
                 interest_rate: float = 12,
                 type_rate: str = "Efectiva",
                 period: str = "Anual",
                 loan_term_years: float = 20,
                 insurance: float = 80000,
                 abono_capital_all: dict = {},
                 ) -> dict:
        """Calcula la tabla de amortizacion y un resumen con los indicadores clave.

        Devuelve {"amortization_table": [...], "resumen": {...}}.
        """
        monthly_interest_rate = interest_rates.calculate_interest_rate(interest_rate, type_rate, period, 'Mensual') / 100

        number_of_payments = loan_term_years * 12

        monthly_payment = (loan_amount * monthly_interest_rate *
                           (1 + monthly_interest_rate) ** number_of_payments) /\
                            ((1 + monthly_interest_rate)**number_of_payments - 1)

        saldo = loan_amount
        anno_mes = desembolso_date

        fila_cero = {
            "num": 0,
            "anno_mes": anno_mes,
            "interest": 0.0,
            "capital": 0.0,
            "insurance": 0.0,
            "payment": 0.0,
            "abono_capital": 0.0,
            "balance": float(saldo),
        }

        tabla_sin_abonos = self.amortization_abonos_capital(
            [fila_cero.copy()], anno_mes, saldo, insurance,
            monthly_interest_rate, monthly_payment, {})

        tabla = self.amortization_abonos_capital(
            [fila_cero.copy()], anno_mes, saldo, insurance,
            monthly_interest_rate, monthly_payment, abono_capital_all)

        tasa_ea = interest_rates.calculate_interest_rate(interest_rate, type_rate, period, 'Anual')
        tasa_mv = round(monthly_interest_rate * 100, 4)

        resumen = {
            "cuota_mensual": round(monthly_payment, 2),
            "seguro": round(float(insurance), 2),
            "cuota_total": round(monthly_payment + insurance, 2),
            "tasa_ea": tasa_ea,
            "tasa_mv": tasa_mv,
            "plazo_meses": int(number_of_payments),
            "sin_abonos": self._totales(tabla_sin_abonos),
        }

        if abono_capital_all:
            con = self._totales(tabla)
            sin = resumen["sin_abonos"]
            con["meses_ahorrados"] = sin["meses"] - con["meses"]
            con["ahorro_intereses"] = round(sin["total_intereses"] - con["total_intereses"], 2)
            con["ahorro_total"] = round(sin["total_pagado"] - con["total_pagado"], 2)
            con["abonos"] = [
                {"anno_mes": m, "valor": round(float(v), 2)}
                for m, v in sorted(abono_capital_all.items())
            ]
            resumen["con_abonos"] = con

        return {"amortization_table": tabla, "resumen": resumen}

    def calculation_amortization(self, *args, **kwargs) -> list[dict]:
        """Compatibilidad: devuelve solo la tabla (para el notebook)."""
        return self.calcular(*args, **kwargs)["amortization_table"]

    @staticmethod
    def _totales(tabla: list[dict]) -> dict:
        """Resume una tabla de amortizacion en sus totales."""
        total_abonos = sum(row["abono_capital"] for row in tabla)
        return {
            "total_pagado": round(sum(row["payment"] for row in tabla) + total_abonos, 2),
            "total_intereses": round(sum(row["interest"] for row in tabla), 2),
            "total_seguro": round(sum(row["insurance"] for row in tabla), 2),
            "total_abonos": round(total_abonos, 2),
            "meses": max(row["num"] for row in tabla),
            "mes_final": tabla[-1]["anno_mes"],
        }

    def anno_mes_str(self, anno_mes):
        if int(anno_mes[4:]) == 12:
                anno = str(int(anno_mes[:4])+1)
                mes = '01'
        else:
            anno = anno_mes[:4]
            mes = str(int(anno_mes[4:])+1).zfill(2)

        anno_mes = anno + mes

        return anno_mes

    def amortization_abonos_capital(self,
                                    amortization_table,
                                    anno_mes,
                                    saldo,
                                    insurance,
                                    monthly_interest_rate,
                                    monthly_payment,
                                    abono_capital_all
                                    ):

        month = 1
        while saldo > 0:
            anno_mes = self.anno_mes_str(anno_mes)
            interest = saldo * monthly_interest_rate
            abono = monthly_payment - interest
            abono_capital = min(abono_capital_all.get(anno_mes, 0), saldo)

            # Ultima cuota: si el capital regular + el abono extra liquidan el saldo,
            # ajustar el capital para dejarlo exactamente en 0 y no generar una cuota
            # fantasma por residuos de coma flotante.
            if saldo - abono - abono_capital <= 0.005:
                abono = saldo - abono_capital
                saldo = 0.0
                payment = interest + abono + insurance
            else:
                saldo = saldo - abono - abono_capital
                payment = monthly_payment + insurance

            amortization_table.append(
                {
                    "num": month,
                    "anno_mes": anno_mes,
                    "interest": round(float(interest), 2),
                    "capital": round(float(abono), 2),
                    "insurance": round(float(insurance), 2),
                    "payment": round(float(payment), 2),
                    "abono_capital": round(float(abono_capital), 2),
                    "balance": round(float(saldo), 2)
                }
            )

            month += 1

        return amortization_table
