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

- **Flujo de créditos (cascada)** — ver `docs/plan-flujo-de-creditos.md` para el spec completo.
  - La cuota **se deriva** (saldo + tasa + plazo restante); el usuario no la escribe.
  - Se soportan créditos **sin interés** (tasa 0) y sin seguro.
  - Abonos dirigidos por crédito: fijo mensual + puntuales.
  - Búsqueda: fuerza bruta hasta 7 créditos (óptimo exacto); de 8 en adelante búsqueda local
    por intercambios (dice "mejor encontrado", no miente sobre optimalidad).
  - El **flujo liberado se normaliza** al horizonte del escenario base; sin eso, "sin cascada"
    parecía el mejor solo por durar más. La búsqueda optimiza esa misma métrica normalizada.

  - **Abonos puntuales**: lista con botón (eliges el crédito, el mes y el monto). Si repites un
    mes en el mismo crédito, el nuevo monto reemplaza al anterior.
  - **Persistencia**: los créditos y la configuración se guardan en `localStorage` del navegador
    bajo la clave `amortizacion.flujo.v1`, con botón "Limpiar todo". **Limitación honesta: es por
    navegador/dispositivo** — no sigue al usuario entre su computador y su celular. Para eso
    haría falta base de datos + login (otro proyecto).
  - **Carga por archivo**: se puede subir `.json` (ida y vuelta exacta) o `.csv`, y descargar los
    créditos o una plantilla. **No se lee `.xlsx` directamente** a propósito: requeriría una
    librería JS o `openpyxl` en el backend, y el proyecto no tiene dependencias de JS y el bundle
    se mantiene en 14MB. Con "Guardar como CSV" desde Excel se logra lo mismo.
    El parser entiende formato colombiano (`240.000.000`, `$ 42.739.600`, `12,5`) y separador
    `,` o `;`. El archivo **reemplaza** la lista actual (no la mezcla).

## Abiertas
- **Reordenar es con botones ▲▼**, no arrastrando. Es más simple y funciona en móvil.
  ¿Te sirve así o quieres arrastre real (drag & drop)?
- ¿La persistencia debería extenderse a las otras calculadoras, o solo al flujo (que es la de
  más digitación)?

## Hallazgo importante (flujo de créditos)
Con presupuesto mensual constante (cascada al 100%), probando los 5.040 órdenes del caso real:
- **La fecha de libertad NO cambia con el orden** — los 5.040 terminan en el mismo mes.
- Los **intereses** varían poco: 2,3% de rango.
- El **flujo liberado** varía mucho: **26% de rango**.

O sea: el orden no decide *cuándo* sales de deudas, decide *cuánta plata liberas en el camino*.
Por eso la vara "liberar flujo" es la que de verdad discrimina.
