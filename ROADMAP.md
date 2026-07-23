# Roadmap — Calculadora de crédito y ahorro

Ideas acordadas para ir construyendo. Marca lo hecho a medida que avanzamos.

## ✅ Hecho
- **Crédito → Amortización**: cuota fija (sistema francés), abonos único/recurrente
  (reemplazan, no suman), resumen (cuota, tasas E.A./M.V., totales, fecha de fin),
  conversión de tasas en vivo, plazo en meses/años.
- **Ahorro → CDT**: interés compuesto a vencimiento, retención en la fuente 4% (editable).

## 🔜 Backlog

### Crédito
- [ ] **Costo real del crédito** — campos opcionales (seguros, estudio, costos) dentro de
      la amortización actual → muestra la tasa efectiva real. (No es módulo aparte.)
- [ ] **Comparador de créditos** — compara N escenarios lado a lado. Incluye **modo
      refinanciar / compra de cartera** (una columna = crédito actual desde el saldo
      restante + campo "costos del cambio"). Reúso casi total del amortizador.
- [ ] **Abonar a capital vs. invertir** — vive en Crédito por ahora; se mueve a
      "Decisiones" cuando esa sección exista.

### Ahorro
- [ ] **Ahorro programado** — aportes mensuales fijos → cuánto acumulas (interés compuesto
      sobre aportes recurrentes).
- [ ] **Meta de ahorro** — inverso: cuánto aportar para llegar a $X, o cuánto tiempo toma.
- [ ] **Comparador de ahorro** — CDT vs. cuenta de ahorro vs. fondo.
- [ ] Extras educativos: ajuste por inflación (valor real), simple vs. compuesto.

### Inmobiliaria (renombrar la pestaña "Hipotecario")
- [ ] **Capacidad de endeudamiento** — cuota ≤ ~30% del ingreso → monto máximo que prestan.
- [ ] **Cuota inicial + precio de vivienda** → monto a financiar + cuota.
- [ ] **Evaluador de rentabilidad de arriendo** ⭐ — rentabilidad neta anual, flujo mensual,
      comparación vs. CDT. Fases: v1 neta + vs CDT · v2 valorización + proyección N años ·
      v3 compra financiada (apalancamiento). Ver plan detallado aparte.

### Decisiones / ¿Qué me conviene? (crear cuando haya 2–3 listas)
- [ ] Abonar vs. invertir *(mover aquí desde Crédito)*
- [ ] **Arrendar vs. comprar** ⭐ — total de arriendo vs. cuota + valorización − intereses.
- [ ] Cuota inicial grande vs. pequeña
- [ ] Pagar de contado vs. financiar
- [ ] Plazo corto vs. largo
- [ ] Leasing habitacional vs. hipoteca

## Notas de diseño
- **Descartado**: reducir cuota al abonar (siempre conviene reducir plazo); sistema alemán
  (en Colombia todo es sistema francés).
- **Retención en la fuente**: 4% para CDT y renta fija · 7% rendimientos financieros generales.
- **Verdad honesta a mostrar** en rentabilidad de arriendo: sin valorización, el arriendo
  suele rendir menos que un CDT — la valorización no puede faltar o el veredicto miente.
- Todo reutiliza el mismo motor de interés compuesto; sin dependencias nuevas.

## Estructura de pestañas objetivo
```
Crédito          Inmobiliaria           Ahorro         ¿Qué me conviene?
├ Amortización   ├ Capacidad            ├ CDT ✅        ├ Abonar vs. invertir
└ Comparador     ├ Cuota inicial        ├ Programado    ├ Arrendar vs. comprar
  (+ refinanciar)└ Rentabilidad arriendo└ Meta          └ (cuota inicial, plazo, …)
```
