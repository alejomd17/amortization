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
  patrimonio final de las dos estrategias. Toggle "desde el crédito original" (deduce el saldo con
  el motor de amortización) / "sé mi saldo actual".
- **Arrendar vs. comprar** (en Inmobiliaria): patrimonio final a un horizonte.
  - Comprar: valor del inmueble − saldo del crédito (− venta si aplica, toggle, default conserva).
  - Arrendar: invierte la cuota inicial **y la diferencia mensual** (lo que se ahorra vs. el costo
    de comprar) a la tasa de inversión. Este segundo término es necesario para que sea justo — sin
    él, comprar sale artificialmente bien.
  - Administración: la paga el comprador (propietario).
  - Muestra el año de equilibrio (break-even).
  - Predial, administración y mantenimiento suben con inflación año a año (igual que el arriendo);
    la cuota del crédito no (es fija).

## Abiertas
- (ninguna)
