# Dudas y supuestos

## Resueltas (ya aplicadas)
- **Retención por defecto**: CDT 4% · Programado 7% (rendimientos generales).
- **Meta**: ahora se calcula sobre el valor **bruto** (la retención ya no entra al cálculo).
  Agregado el modo inverso **"¿cuánto tardo?"** (dado el aporte → meses).
- **Capacidad**: selector de período **Anual/Mensual** agregado; el campo de deudas se renombró a
  **"Cuota mensual de otras deudas"** (se resta a la cuota máxima). Default 30% del ingreso.
- **Rentabilidad de arriendo**: defaults confirmados (costos 2.5% · comisión 10% · vacancia 0 ·
  CDT ref 10% · retención CDT 4% · inflación 5% · valorización real 3%), todos editables digitando.
- **Comparador**: refinanciar se hace agregando el crédito actual como un escenario más (saldo
  restante + costos del cambio); se ordena por costo total. Confirmado así por ahora.
- **Costo real**: TIR del flujo (recibes monto − costos, pagas cuota + seguro), sobre el
  cronograma sin abonos; solo se muestra cuando hay costos.
- **Abonar vs. invertir (versión fina)**: modela los flujos reales — al abonar, el crédito
  termina antes y la cuota liberada se invierte hasta el fin del plazo original; compara el
  patrimonio final de las dos estrategias. Requiere saldo + plazo restante del crédito.

## Abiertas
- **Arrendar vs. comprar**: lo diseñamos juntos (como el evaluador de arriendo) antes de construir.
