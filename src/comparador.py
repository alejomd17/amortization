from src.interest_rates import InterestRates

interest_rates = InterestRates()


def _cuota(monto, im, n):
    """Cuota fija (sistema francés)."""
    if n <= 0:
        return 0.0
    if im == 0:
        return monto / n
    return monto * im * (1 + im) ** n / ((1 + im) ** n - 1)


class Comparador:
    def comparar(self, escenarios: list[dict]) -> dict:
        """Compara N créditos por su costo total. Cada escenario:
        {nombre, monto, interest_rate, type_rate, period, plazo_meses, costos}.
        `costos` = gastos iniciales (para refinanciar: costos del cambio).
        El escenario ganador es el de menor costo total (pagos + costos).
        """
        resultados = []
        for esc in escenarios:
            im = interest_rates.calculate_interest_rate(
                esc["interest_rate"], esc["type_rate"], esc["period"], 'Mensual') / 100
            n = int(esc["plazo_meses"])
            monto = float(esc["monto"])
            costos = float(esc.get("costos", 0) or 0)

            cuota = _cuota(monto, im, n)
            total_pagado = cuota * n
            total_intereses = total_pagado - monto
            costo_total = total_pagado + costos

            resultados.append({
                "nombre": esc.get("nombre", "") or "",
                "monto": round(monto, 2),
                "cuota": round(cuota, 2),
                "total_pagado": round(total_pagado, 2),
                "total_intereses": round(total_intereses, 2),
                "costos": round(costos, 2),
                "costo_total": round(costo_total, 2),
                "plazo_meses": n,
                "tasa_ea": interest_rates.calculate_interest_rate(
                    esc["interest_rate"], esc["type_rate"], esc["period"], 'Anual'),
            })

        if resultados:
            idx_mejor = min(range(len(resultados)), key=lambda i: resultados[i]["costo_total"])
            peor = max(r["costo_total"] for r in resultados)
            for i, r in enumerate(resultados):
                r["mejor"] = (i == idx_mejor)
                # cuánto ahorra el mejor frente al más caro
                r["ahorro_vs_peor"] = round(peor - r["costo_total"], 2)

        return {"escenarios": resultados}
