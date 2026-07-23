# Dudas y supuestos pendientes de feedback

Cosas que decidí con un default razonable mientras construía el backlog.
Revísalas y me corriges lo que no cuadre.

## Ahorro → Meta
- **Retención**: default 7% (rendimientos generales). ¿Correcto según el vehículo?
- **Interpretación de la meta**: la tomo como el valor final **neto** deseado (después de
  retención). ¿Así, o la meta es bruta?
- **Modo**: solo hice "dado el plazo → cuánto aporto al mes". No incluí el inverso
  "dado el aporte → cuánto tiempo tardo". ¿Lo agrego?

## Inmobiliaria → Capacidad de endeudamiento
- **% de la cuota**: default 30% del ingreso. ¿Ese es el que usan tus bancos de referencia?
- **Período de la tasa**: en capacidad fijé el período a Anual (solo dejé Nominal/Efectiva).
  Asumí que la tasa hipotecaria siempre se cotiza anual. ¿Bien, o meto el selector Anual/Mensual?
- **Deudas actuales**: campo opcional que se resta a la cuota máxima. ¿Correcto el enfoque?

## Inmobiliaria → Cuota inicial
- **Cuota inicial default 30%**. (Mínimo legal en Colombia suele ser 30% VIS / según banco.) ¿OK?

## Inmobiliaria → Rentabilidad de arriendo
- **Defaults**: costos compra 2.5% · comisión agencia 10% · vacancia 0 meses · CDT ref 10% E.A. ·
  retención CDT 4% · inflación 5% · valorización real 3%.
- **Vacancia default 0** (optimista). ¿Prefieres un default más realista, tipo 1 mes?
- **Comisión agencia**: la calculo como % del arriendo sobre los meses arrendados (no un mes fijo
  de comisión). ¿Así opera tu agencia, o es distinto?
- El evaluador es **v1** (sin proyección a N años ni compra financiada/apalancamiento — eso era v2/v3).
