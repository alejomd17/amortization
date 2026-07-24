"""Flujo de créditos con estrategia de cascada.

Cuando un crédito se termina de pagar, su cuota se libera y se reinyecta como abono
al siguiente crédito según el orden activo. Permite comparar estrategias de orden.
"""
import math
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


def _diff_meses(desde: str, hasta: str) -> int:
    """Meses entre dos 'AAAAMM'. '202607' -> '202801' = 18."""
    a = int(desde[:4]) * 12 + int(desde[4:])
    b = int(hasta[:4]) * 12 + int(hasta[4:])
    return b - a


def _cuota_francesa(saldo: float, im: float, n: int) -> float:
    if n <= 0:
        return saldo
    if im == 0:
        return saldo / n
    return saldo * im * (1 + im) ** n / ((1 + im) ** n - 1)


def _plazo_desde_cuota(saldo: float, im: float, cuota: float) -> int:
    """Meses para pagar `saldo` con una cuota fija dada. Lo inverso de la francesa:
    cuando el usuario fija su cuota, el plazo es el que resulte, no el que digitó.
    Devuelve None si la cuota no alcanza ni a cubrir el interés (nunca se pagaría)."""
    if cuota <= 0:
        return 0
    if im == 0:
        return math.ceil(saldo / cuota - 1e-9)
    if cuota <= saldo * im:
        return None
    return math.ceil(-math.log(1 - saldo * im / cuota) / math.log(1 + im) - 1e-9)


class Flujo:
    # ── Preparación ───────────────────────────────────────────────────────────
    def _preparar(self, creditos: list[dict], fecha_inicio: str) -> list[dict]:
        """Normaliza cada crédito, le deriva la cuota y calcula en qué mes nace.

        `mes_inicio` permite modelar un crédito que todavía no existe (un desembolso
        futuro): antes de esa fecha no tiene saldo, ni cuota, ni intereses.
        """
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
            mes_ini = str(c.get("mes_inicio") or "").strip()
            valido = len(mes_ini) == 6 and mes_ini.isdigit()
            # un desembolso en el pasado es un crédito que ya tienes: nace en 0
            nace = max(_diff_meses(fecha_inicio, mes_ini), 0) if valido else 0

            nombre = c.get("nombre") or f"Crédito {len(preparados) + 1}"

            # Cuota: si el usuario la fija, manda esa y el plazo se deriva de ella.
            # Si no, se calcula por sistema francés con el plazo que digitó.
            cuota_manual = float(c.get("cuota") or 0)
            if cuota_manual > 0:
                plazo_real = _plazo_desde_cuota(saldo, im, cuota_manual)
                if plazo_real is None:
                    raise ValueError(
                        f"La cuota de '{nombre}' (${cuota_manual:,.0f}) no cubre ni el interés del "
                        f"primer mes; así el saldo nunca bajaría. Súbela o baja la tasa.")
                cuota, plazo_efectivo = cuota_manual, plazo_real
            else:
                cuota, plazo_efectivo = _cuota_francesa(saldo, im, plazo), plazo

            preparados.append({
                "nombre": nombre,
                "mes_inicio": mes_ini if valido and nace > 0 else None,
                "nace": nace,
                "saldo_inicial": saldo,
                "im": im,
                "tasa_ea": tasa_ea,
                "plazo_meses": plazo_efectivo,
                "cuota": cuota,
                "cuota_fija": cuota_manual > 0,
                "seguro": float(c.get("seguro", 0) or 0),
                "abono_fijo": float(c.get("abono_fijo", 0) or 0),
                "puntuales": {str(k): float(v) for k, v in (c.get("abonos_puntuales") or {}).items()},
                # por defecto recibe abonos de la cascada; el usuario puede excluirlo
                "recibe_abono": c.get("recibe_abono", True) is not False,
            })
        return preparados

    # ── Simulación de un orden ────────────────────────────────────────────────
    def _simular(self, preparados: list[dict], orden: list[int], pct_reinversion: float,
                 fecha_inicio: str, con_cascada: bool = True, detallar: bool = False) -> dict:
        """Simula mes a mes. `orden` son índices; el pool de cuotas liberadas va al
        primer crédito activo del orden (y el sobrante baja al siguiente).

        `detallar` guarda la tabla de amortización de cada crédito. Va apagado por
        defecto a propósito: la búsqueda corre hasta 5.040 simulaciones y guardar
        cada fila la volvería lenta y pesada sin que nadie lea esas tablas.
        """
        # Un crédito con desembolso futuro todavía no existe: sin saldo y sin cuota.
        nacidos = [c["nace"] <= 0 for c in preparados]
        saldos = [c["saldo_inicial"] if nacidos[i] else 0.0 for i, c in enumerate(preparados)]
        pool = 0.0                     # cuotas liberadas (ya escaladas por pct)
        pct = pct_reinversion / 100 if con_cascada else 0.0

        def foto_saldos():
            """None = todavía no se ha desembolsado (distinto de 0 = ya se pagó)."""
            return [round(s, 2) if nacidos[i] else None for i, s in enumerate(saldos)]

        filas = [{
            "num": 0, "anno_mes": fecha_inicio, "pago_total": 0.0, "liberado": 0.0,
            "saldos": foto_saldos(),
            "pagos": [0.0 if nacidos[i] else None for i in range(len(preparados))],
        }]
        total_intereses = 0.0
        total_pagado = 0.0
        flujo_liberado_acum = 0.0      # métrica: cuánto obligación mensual ya está muerta, mes a mes
        mes_libertad = None
        # tabla de amortización por crédito (mismas columnas que el módulo de amortización)
        detalle_creditos = [[] for _ in preparados] if detallar else None

        for mes in range(1, MAX_MESES + 1):
            anno_mes = _sumar_meses(fecha_inicio, mes)
            extra = pool               # el pool va al primer crédito activo del orden
            sobrante = 0.0             # lo que sobra de una última cuota; se reparte al final
            pago_mes = 0.0
            filas_mes = {}             # fila de detalle de cada crédito, por si hay que corregirla
            pagos_credito = {}         # lo que se le paga a cada crédito ESTE mes (cuota+seguro+abono)

            # Saldo que AÚN DEBES este mes (antes de pagar): es lo que se muestra en la vista
            # Saldos, para que el último mes con saldo sea el de la última cuota. Un crédito que
            # se desembolsa este mes ya lo debes (aunque el primer pago sea el mes siguiente);
            # antes de nacer es None.
            saldos_display = [
                round(saldos[i], 2) if nacidos[i]
                else (round(c["saldo_inicial"], 2) if c["nace"] == mes else None)
                for i, c in enumerate(preparados)
            ]

            for idx in orden:
                if not nacidos[idx] or saldos[idx] <= 0:
                    continue
                c = preparados[idx]
                interes = saldos[idx] * c["im"]
                total_intereses += interes

                dirigido = c["abono_fijo"] + c["puntuales"].get(anno_mes, 0.0)
                # los excluidos no son destino de la cascada: el pool sigue de largo
                if c["recibe_abono"]:
                    aporte_extra = extra
                    extra = 0.0
                else:
                    aporte_extra = 0.0

                capital = c["cuota"] - interes
                reduccion = capital + dirigido + aporte_extra

                # tolerancia de medio centavo: sin ella un residuo de coma flotante
                # genera una cuota fantasma extra (mismo bug que se corrigió en amortización)
                if saldos[idx] - reduccion <= 0.005:
                    # última cuota: se ajusta al saldo exacto y lo que sobre se reparte abajo
                    sobrante += max(reduccion - saldos[idx], 0.0)
                    pago = saldos[idx] + interes
                    # el abono no puede pasarse del saldo; lo que quede lo cubre la cuota
                    abono_aplicado = min(dirigido + aporte_extra, saldos[idx])
                    capital_cuota = saldos[idx] - abono_aplicado
                    cuota_pagada = capital_cuota + interes
                    saldos[idx] = 0.0
                    pool += c["cuota"] * pct
                else:
                    saldos[idx] -= reduccion
                    pago = c["cuota"] + dirigido + aporte_extra
                    abono_aplicado = dirigido + aporte_extra
                    capital_cuota = capital
                    cuota_pagada = c["cuota"]

                pago_mes += pago + c["seguro"]
                pagos_credito[idx] = pago + c["seguro"]

                if detallar:
                    filas_mes[idx] = {
                        "num": mes, "anno_mes": anno_mes,
                        "interest": round(interes, 2),
                        "capital": round(capital_cuota, 2),
                        "insurance": round(c["seguro"], 2),
                        # lo que pagas ese mes = cuota + seguro (igual que el módulo de amortización)
                        "payment": round(cuota_pagada + c["seguro"], 2),
                        "abono_capital": round(abono_aplicado, 2),
                        "balance": round(saldos[idx], 2),
                    }
                    detalle_creditos[idx].append(filas_mes[idx])

            # Sobrante de una última cuota: vuelve al PRIMER crédito activo del orden,
            # que es la misma regla que sigue la cuota liberada a partir del mes siguiente.
            # Antes se lo quedaba el que iba justo detrás del que se liquidó: eran dos
            # reglas para la misma plata y el abono "aparecía y se devolvía" al mes.
            while sobrante > 0.005:
                objetivo = next((i for i in orden if nacidos[i] and saldos[i] > 0
                                 and preparados[i]["recibe_abono"]), None)
                if objetivo is None:
                    break              # no queda a quién abonarle: ese mes te sobra la plata
                aplicado = min(sobrante, saldos[objetivo])
                saldos[objetivo] -= aplicado
                sobrante -= aplicado
                pago_mes += aplicado
                pagos_credito[objetivo] = pagos_credito.get(objetivo, 0.0) + aplicado
                if saldos[objetivo] <= 0.005:
                    saldos[objetivo] = 0.0
                    pool += preparados[objetivo]["cuota"] * pct
                if detallar and objetivo in filas_mes:
                    fila = filas_mes[objetivo]
                    fila["abono_capital"] = round(fila["abono_capital"] + aplicado, 2)
                    fila["balance"] = round(saldos[objetivo], 2)

            # obligación mensual ya liberada (cuota+seguro de los créditos muertos).
            # Un crédito que aún no nace no cuenta: nunca fue una obligación.
            liberado = sum(c["cuota"] + c["seguro"] for i, c in enumerate(preparados)
                           if nacidos[i] and saldos[i] <= 0)
            flujo_liberado_acum += liberado
            total_pagado += pago_mes

            # Desembolsos de este mes: el crédito aparece con saldo y empieza a pagar
            # el mes siguiente (igual que los que ya existen en la fila 0).
            for i, c in enumerate(preparados):
                if not nacidos[i] and c["nace"] == mes:
                    saldos[i] = c["saldo_inicial"]
                    nacidos[i] = True

            filas.append({
                "num": mes, "anno_mes": anno_mes,
                "pago_total": round(pago_mes, 2),
                "liberado": round(liberado, 2),
                # saldo que debías ESTE mes, antes de pagar (ver saldos_display arriba)
                "saldos": saldos_display,
                # lo pagado a cada crédito este mes: None si aún no nace, 0 si nació pero no pagó
                # (justo el mes del desembolso), >0 si pagó. Suma = pago_total.
                "pagos": [round(pagos_credito.get(i, 0.0), 2) if nacidos[i] else None
                          for i in range(len(preparados))],
            })

            # No hay libertad mientras falte desembolsar un crédito que ya está planeado
            if all(nacidos) and all(s <= 0 for s in saldos):
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
            "detalle_creditos": detalle_creditos,
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
        validos = [c for c in creditos if float(c.get("saldo", 0) or 0) > 0]
        p = self._preparar(validos, fecha_inicio)
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
                "mes_inicio": c["mes_inicio"],
                "cuota_fija": c["cuota_fija"], "recibe_abono": c["recibe_abono"],
            } for c in p],
            # se devuelven los créditos tal como entraron (ya filtrados, para que los
            # índices coincidan) porque /flujo/credito necesita re-simular con ellos
            "creditos_entrada": validos,
            "fecha_inicio": fecha_inicio,
            "pct_reinversion": pct_reinversion,
            "vara": vara,
            "escenarios": [{k: v for k, v in e.items()
                            if k not in ("filas", "detalle_creditos")} for e in escenarios],
            "detalle": {e["clave"]: e["filas"] for e in escenarios},
        }

    # ── Tabla de amortización de un solo crédito ──────────────────────────────
    @staticmethod
    def _resumir_tabla(filas: list[dict], cuota: float) -> dict:
        return {
            "tabla": filas,
            "cuota": round(cuota, 2),
            "meses": len(filas),
            "anno_mes_fin": filas[-1]["anno_mes"] if filas else None,
            "total_intereses": round(sum(f["interest"] for f in filas), 2),
            "total_abonos": round(sum(f["abono_capital"] for f in filas), 2),
            # payment ya incluye el seguro; solo se suma el abono aparte para no contarlo doble
            "total_pagado": round(sum(f["payment"] + f["abono_capital"] for f in filas), 2),
        }

    def tabla_credito(self,
                      creditos: list[dict],
                      indice: int,
                      fecha_inicio: str = "202601",
                      pct_reinversion: float = 100,
                      orden: list[int] | None = None,
                      ) -> dict:
        """Tabla de amortización de un crédito, en dos versiones:

        - `solo`:    el crédito por su cuenta, con tus abonos dirigidos (fijo y puntuales)
                     pero **sin la cascada** de los otros créditos.
        - `en_plan`: el mismo crédito dentro del orden dado, sumándole las cuotas liberadas
                     de los que ya se pagaron. Solo si llega `orden`.

        Lo único que cambia entre las dos es la cascada: la diferencia es exactamente
        lo que gana la estrategia de orden.
        """
        validos = [c for c in creditos if float(c.get("saldo", 0) or 0) > 0]
        p = self._preparar(validos, fecha_inicio)
        if not p:
            raise ValueError("Agrega al menos un crédito con saldo mayor a 0.")
        if not 0 <= indice < len(p):
            raise ValueError("El crédito seleccionado no existe.")

        # Se simula el crédito aislado tal cual está: conserva mes_inicio y sus abonos
        # dirigidos. Lo único que le falta frente a `en_plan` es la cascada.
        p_solo = self._preparar([validos[indice]], fecha_inicio)
        res_solo = self._simular(p_solo, [0], 0, fecha_inicio, con_cascada=False, detallar=True)

        out = {
            "nombre": p[indice]["nombre"],
            "mes_inicio": p[indice]["mes_inicio"],
            "seguro": round(p[indice]["seguro"], 2),
            "solo": self._resumir_tabla(res_solo["detalle_creditos"][0], p_solo[0]["cuota"]),
        }

        if orden and sorted(orden) == list(range(len(p))):
            res_plan = self._simular(p, list(orden), pct_reinversion, fecha_inicio, detallar=True)
            out["en_plan"] = self._resumir_tabla(
                res_plan["detalle_creditos"][indice], p[indice]["cuota"])
        return out
