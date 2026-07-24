"""Flujo de créditos con estrategia de cascada.

Cuando un crédito se termina de pagar, su cuota se libera y se reinyecta como abono
al siguiente crédito según el orden activo. Permite comparar estrategias de orden.
"""
from itertools import permutations

from src.interest_rates import InterestRates

interest_rates = InterestRates()

MAX_MESES = 360          # tope de seguridad (30 años); en la práctica nunca se toca
MAX_FUERZA_BRUTA = 7     # hasta 7 créditos se prueban todos los órdenes (5.040)


def _sumar_meses(anno_mes: str, meses: int) -> str:
    """'202601' + 3 -> '202604'."""
    anno, mes = int(anno_mes[:4]), int(anno_mes[4:])
    total = anno * 12 + (mes - 1) + meses
    return f"{total // 12}{total % 12 + 1:02d}"


def _cuota_francesa(saldo: float, im: float, n: int) -> float:
    if n <= 0:
        return saldo
    if im == 0:
        return saldo / n
    return saldo * im * (1 + im) ** n / ((1 + im) ** n - 1)


class Flujo:
    # ── Preparación ───────────────────────────────────────────────────────────
    def _preparar(self, creditos: list[dict]) -> list[dict]:
        """Normaliza cada crédito y le deriva la cuota."""
        preparados = []
        for c in creditos:
            saldo = float(c.get("saldo", 0) or 0)
            plazo = int(c.get("plazo_meses", 0) or 0)
            tasa = float(c.get("tasa", 0) or 0)
            if tasa > 0:
                im = interest_rates.calculate_interest_rate(
                    tasa, c.get("tipo_tasa", "Efectiva"), c.get("periodo_tasa", "Anual"), 'Mensual') / 100
                tasa_ea = interest_rates.calculate_interest_rate(
                    tasa, c.get("tipo_tasa", "Efectiva"), c.get("periodo_tasa", "Anual"), 'Anual')
            else:
                im, tasa_ea = 0.0, 0.0
            preparados.append({
                "nombre": c.get("nombre") or f"Crédito {len(preparados) + 1}",
                "saldo_inicial": saldo,
                "im": im,
                "tasa_ea": tasa_ea,
                "plazo_meses": plazo,
                "cuota": _cuota_francesa(saldo, im, plazo),
                "seguro": float(c.get("seguro", 0) or 0),
                "abono_fijo": float(c.get("abono_fijo", 0) or 0),
                "puntuales": {str(k): float(v) for k, v in (c.get("abonos_puntuales") or {}).items()},
            })
        return preparados

    # ── Simulación de un orden ────────────────────────────────────────────────
    def _simular(self, preparados: list[dict], orden: list[int], pct_reinversion: float,
                 fecha_inicio: str, con_cascada: bool = True) -> dict:
        """Simula mes a mes. `orden` son índices; el pool de cuotas liberadas va al
        primer crédito activo del orden (y el sobrante baja al siguiente)."""
        saldos = [c["saldo_inicial"] for c in preparados]
        pool = 0.0                     # cuotas liberadas (ya escaladas por pct)
        pct = pct_reinversion / 100 if con_cascada else 0.0

        filas = [{
            "num": 0, "anno_mes": fecha_inicio, "pago_total": 0.0, "liberado": 0.0,
            "saldos": [round(s, 2) for s in saldos],
        }]
        total_intereses = 0.0
        total_pagado = 0.0
        flujo_liberado_acum = 0.0      # métrica: cuánto obligación mensual ya está muerta, mes a mes
        mes_libertad = None

        for mes in range(1, MAX_MESES + 1):
            anno_mes = _sumar_meses(fecha_inicio, mes)
            extra = pool               # el pool baja por el orden
            pago_mes = 0.0

            for idx in orden:
                if saldos[idx] <= 0:
                    continue
                c = preparados[idx]
                interes = saldos[idx] * c["im"]
                total_intereses += interes

                dirigido = c["abono_fijo"] + c["puntuales"].get(anno_mes, 0.0)
                aporte_extra = extra
                extra = 0.0

                capital = c["cuota"] - interes
                reduccion = capital + dirigido + aporte_extra

                # tolerancia de medio centavo: sin ella un residuo de coma flotante
                # genera una cuota fantasma extra (mismo bug que se corrigió en amortización)
                if saldos[idx] - reduccion <= 0.005:
                    # última cuota: se ajusta al saldo exacto y el sobrante sigue al siguiente
                    extra = max(reduccion - saldos[idx], 0.0)
                    pago = saldos[idx] + interes
                    saldos[idx] = 0.0
                    pool += c["cuota"] * pct
                else:
                    saldos[idx] -= reduccion
                    pago = c["cuota"] + dirigido + aporte_extra

                pago_mes += pago + c["seguro"]

            # obligación mensual ya liberada (cuota+seguro de los créditos muertos)
            liberado = sum(c["cuota"] + c["seguro"] for i, c in enumerate(preparados) if saldos[i] <= 0)
            flujo_liberado_acum += liberado
            total_pagado += pago_mes

            filas.append({
                "num": mes, "anno_mes": anno_mes,
                "pago_total": round(pago_mes, 2),
                "liberado": round(liberado, 2),
                "saldos": [round(s, 2) for s in saldos],
            })

            if all(s <= 0 for s in saldos):
                mes_libertad = mes
                break

        obligacion_total = sum(c["cuota"] + c["seguro"] for c in preparados)
        return {
            "filas": filas,
            "total_intereses": round(total_intereses, 2),
            "total_pagado": round(total_pagado, 2),
            "meses": mes_libertad if mes_libertad else MAX_MESES,
            "liquidado": mes_libertad is not None,
            "anno_mes_libertad": filas[-1]["anno_mes"] if mes_libertad else None,
            "flujo_liberado_acum": round(flujo_liberado_acum, 2),
            "flujo_mensual_liberado": round(obligacion_total, 2),
        }

    # ── Órdenes y búsqueda ────────────────────────────────────────────────────
    @staticmethod
    def _orden_avalancha(p):   # tasa más alta primero
        return sorted(range(len(p)), key=lambda i: -p[i]["tasa_ea"])

    @staticmethod
    def _orden_bola_nieve(p):  # saldo más pequeño primero
        return sorted(range(len(p)), key=lambda i: p[i]["saldo_inicial"])

    @staticmethod
    def _flujo_norm(res: dict, horizonte: int, obligacion: float) -> float:
        """Flujo liberado normalizado a un horizonte común. Sin normalizar, un escenario
        que dura más acumula más solo por durar más. La búsqueda DEBE optimizar esta
        misma métrica, que es la que se muestra."""
        return res["flujo_liberado_acum"] + obligacion * (horizonte - res["meses"])

    def _score(self, res: dict, vara: str, horizonte: int, obligacion: float) -> tuple:
        """Menor es mejor. Tupla para desempatar: muchos órdenes empatan en la métrica
        principal (sobre todo en meses, que casi no cambia con presupuesto constante)."""
        flujo = self._flujo_norm(res, horizonte, obligacion)
        if vara == "tiempo":
            return (res["meses"], res["total_intereses"], -flujo)
        if vara == "flujo":
            return (-flujo, res["total_intereses"])
        return (res["total_intereses"], -flujo)   # 'intereses' (default)

    def _buscar_mejor(self, p, pct, fecha, vara, horizonte, obligacion):
        """Óptimo exacto si caben los órdenes; si no, búsqueda local desde las heurísticas."""
        n = len(p)
        puntuar = lambda res: self._score(res, vara, horizonte, obligacion)

        if n <= MAX_FUERZA_BRUTA:
            mejor_orden, mejor_score, mejor_res = None, None, None
            for orden in permutations(range(n)):
                res = self._simular(p, list(orden), pct, fecha)
                s = puntuar(res)
                if mejor_score is None or s < mejor_score:
                    mejor_orden, mejor_score, mejor_res = list(orden), s, res
            return mejor_orden, mejor_res, "óptimo exacto"

        # Heurística: parte de las clásicas y mejora intercambiando pares
        candidatos = [self._orden_avalancha(p), self._orden_bola_nieve(p), list(range(n))]
        mejor_orden = min(candidatos, key=lambda o: puntuar(self._simular(p, o, pct, fecha)))
        mejor_res = self._simular(p, mejor_orden, pct, fecha)
        mejor_score = puntuar(mejor_res)
        mejoro = True
        while mejoro:
            mejoro = False
            for i in range(n):
                for j in range(i + 1, n):
                    cand = mejor_orden[:]
                    cand[i], cand[j] = cand[j], cand[i]
                    res = self._simular(p, cand, pct, fecha)
                    s = puntuar(res)
                    if s < mejor_score:
                        mejor_orden, mejor_score, mejor_res, mejoro = cand, s, res, True
        return mejor_orden, mejor_res, "mejor encontrado"

    # ── API pública ───────────────────────────────────────────────────────────
    def comparar(self,
                 creditos: list[dict],
                 fecha_inicio: str = "202601",
                 pct_reinversion: float = 100,
                 orden_manual: list[int] | None = None,
                 vara: str = "intereses",
                 ) -> dict:
        """Corre los escenarios y devuelve la comparación + el detalle mes a mes."""
        p = self._preparar([c for c in creditos if float(c.get("saldo", 0) or 0) > 0])
        if not p:
            raise ValueError("Agrega al menos un crédito con saldo mayor a 0.")

        natural = list(range(len(p)))
        escenarios = []

        # El base (sin cascada) fija el horizonte común con el que se normaliza el flujo,
        # para que la búsqueda optimice exactamente la métrica que luego se muestra.
        base = self._simular(p, natural, pct_reinversion, fecha_inicio, con_cascada=False)
        obligacion_total = sum(c["cuota"] + c["seguro"] for c in p)
        horizonte = base["meses"]
        escenarios.append({"clave": "base", "nombre": "Sin cascada", "orden": natural, **base})

        av = self._orden_avalancha(p)
        escenarios.append({"clave": "avalancha", "nombre": "Avalancha", "orden": av,
                           **self._simular(p, av, pct_reinversion, fecha_inicio)})

        bn = self._orden_bola_nieve(p)
        escenarios.append({"clave": "bola_nieve", "nombre": "Bola de nieve", "orden": bn,
                           **self._simular(p, bn, pct_reinversion, fecha_inicio)})

        orden_sug, res_sug, metodo = self._buscar_mejor(
            p, pct_reinversion, fecha_inicio, vara, horizonte, obligacion_total)
        escenarios.append({"clave": "sugerencia", "nombre": "Sugerencia", "orden": orden_sug,
                           "metodo": metodo, **res_sug})

        if orden_manual and sorted(orden_manual) == natural:
            escenarios.append({"clave": "manual", "nombre": "Tu orden", "orden": orden_manual,
                               **self._simular(p, orden_manual, pct_reinversion, fecha_inicio)})

        # El flujo liberado se normaliza al horizonte del base: un escenario que dura más
        # acumula más solo por durar más, y eso haría ver "sin cascada" como el mejor.
        # Una vez liquidado todo, se libera la obligación completa cada mes restante.
        for e in escenarios:
            e["flujo_liberado"] = round(self._flujo_norm(e, horizonte, obligacion_total), 2)
            e["ahorro_intereses"] = round(base["total_intereses"] - e["total_intereses"], 2)
            e["meses_ahorrados"] = base["meses"] - e["meses"]
            e["orden_nombres"] = [p[i]["nombre"] for i in e["orden"]]
        e_base = escenarios[0]
        for e in escenarios:
            e["flujo_ganado"] = round(e["flujo_liberado"] - e_base["flujo_liberado"], 2)

        return {
            "creditos": [{
                "nombre": c["nombre"], "saldo": round(c["saldo_inicial"], 2),
                "cuota": round(c["cuota"], 2), "seguro": round(c["seguro"], 2),
                "tasa_ea": c["tasa_ea"], "plazo_meses": c["plazo_meses"],
            } for c in p],
            "fecha_inicio": fecha_inicio,
            "pct_reinversion": pct_reinversion,
            "vara": vara,
            "escenarios": [{k: v for k, v in e.items() if k != "filas"} for e in escenarios],
            "detalle": {e["clave"]: e["filas"] for e in escenarios},
        }
