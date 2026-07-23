# Roadmap — Calculadora de crédito y ahorro

Ideas acordadas para ir construyendo. Marca lo hecho a medida que avanzamos.

## ✅ Hecho
- **Crédito → Amortización**: cuota fija (sistema francés), abonos único/recurrente
  (reemplazan, no suman), resumen (cuota, tasas E.A./M.V., totales, fecha de fin),
  conversión de tasas en vivo, plazo en meses/años.
- **Ahorro → CDT**: interés compuesto a vencimiento, retención en la fuente 4% (editable).

## 🔜 Backlog

### Crédito
- [x] **Costo real del crédito** — campos opcionales (seguros, estudio, costos) dentro de
      la amortización actual → muestra la tasa efectiva real. (No es módulo aparte.)
- [x] **Comparador de créditos** — compara N escenarios lado a lado. Incluye **modo
      refinanciar / compra de cartera** (una columna = crédito actual desde el saldo
      restante + campo "costos del cambio"). Reúso casi total del amortizador.
- [x] **Abonar a capital vs. invertir** — vive en Crédito por ahora; se mueve a
      "Decisiones" cuando esa sección exista.

### Ahorro
- [x] **Ahorro programado** — aportes mensuales fijos → cuánto acumulas (interés compuesto
      sobre aportes recurrentes).
- [x] **Meta de ahorro** — inverso: cuánto aportar para llegar a $X, o cuánto tiempo toma.
- [ ] **Comparador de ahorro** — CDT vs. cuenta de ahorro vs. fondo.
- [ ] Extras educativos: ajuste por inflación (valor real), simple vs. compuesto.

### Inmobiliaria (renombrar la pestaña "Hipotecario")
- [x] **Capacidad de endeudamiento** — cuota ≤ ~30% del ingreso → monto máximo que prestan.
- [x] **Cuota inicial + precio de vivienda** → monto a financiar + cuota.
- [x] **Evaluador de rentabilidad de arriendo** ⭐ — **SPEC FINALIZADO**
      - Entradas: precio · costos de compra (default 2.5%) · arriendo mensual · vacancia
        (meses/año) · comisión agencia (~10%) · administración (la paga el propietario) ·
        predial · mantenimiento · **inflación esperada (5%) + valorización real (3%)** [2 campos] ·
        CDT de referencia (% E.A.).
      - Salidas: rent. bruta · rent. neta (arriendo) · flujo mensual neto · valorización total
        (=infl+real) · **RENT. TOTAL** (=neta+valorización) · veredicto vs CDT (E.A. neto) ·
        desglose de gastos.
      - Fases: **v1** = todo lo anterior (valorización incluida) · v2 = proyección a N años
        (arriendo sube con inflación) · v3 = compra financiada (apalancamiento).
      - Técnico: `src/inmueble.py` + `/inmueble`, reutiliza el motor del CDT para el benchmark.

### Decisiones / ¿Qué me conviene? (crear cuando haya 2–3 listas)
- [ ] Abonar vs. invertir *(mover aquí desde Crédito)*
- [x] **Arrendar vs. comprar** ⭐ — total de arriendo vs. cuota + valorización − intereses.
- [ ] Cuota inicial grande vs. pequeña
- [ ] Pagar de contado vs. financiar
- [ ] Plazo corto vs. largo
- [ ] Leasing habitacional vs. hipoteca

## Notas de diseño
- **Descartado**: reducir cuota al abonar (siempre conviene reducir plazo); sistema alemán
  (en Colombia todo es sistema francés).
- **Retención en la fuente**: 4% para CDT y renta fija · 7% rendimientos financieros generales.
- **Costos de compra de inmueble** (investigado): el comprador paga ~2–3% del valor comercial
  (notariales 50% + beneficencia/registro). Default 2.5%.
- **Valorización de vivienda** (investigado, IPVU BanRep): real ~2–4% sobre inflación (histórico);
  7% en 2025 fue excepcional (máx. en 12 años). Se modela como inflación (5%) + real (3%) = 8%
  nominal, en 2 campos separados para que la cuenta quede a la vista.
- **Verdad honesta a mostrar** en rentabilidad de arriendo: sin valorización, el arriendo
  suele rendir menos que un CDT — por eso la valorización va desde v1.
- **Comparador ≈ amortizador reusado**: cada escenario es una corrida del amortizador; refinanciar
  solo agrega "saldo restante" como input y un campo "costos del cambio". Poco código nuevo.
- **Comparaciones nominal vs nominal**: rent. total del inmueble vs. tasa E.A. neta del CDT (el
  motor ya convierte cualquier tasa a E.A.).
- Todo reutiliza el mismo motor de interés compuesto; sin dependencias nuevas.

## Estructura de pestañas objetivo
```
Crédito          Inmobiliaria           Ahorro         ¿Qué me conviene?
├ Amortización   ├ Capacidad            ├ CDT ✅        ├ Abonar vs. invertir
└ Comparador     ├ Cuota inicial        ├ Programado    ├ Arrendar vs. comprar
  (+ refinanciar)└ Rentabilidad arriendo└ Meta          └ (cuota inicial, plazo, …)
```
