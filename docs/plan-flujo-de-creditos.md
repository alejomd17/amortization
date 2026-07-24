# Plan — Flujo de créditos (cascada)

## Goal
Proyectar el flujo de varios créditos aplicando la estrategia de cascada (cuando un crédito
se termina de pagar, su cuota se redirige como abono al siguiente) para saber **cuándo se
queda libre de deudas** y **cuánta plata mensual se libera**, y poder **comparar estrategias**
en vez de rehacer un Excel a mano.

## Context
El usuario hoy lleva esto en una hoja de cálculo manual con 7 créditos. Sus limitaciones: los
abonos extra se escriben a mano, varios créditos se restan de forma lineal (sin interés real),
y no permite comparar "¿y si pago primero este otro?". Es un módulo nuevo de la app de
calculadoras (FastAPI + HTML/CSS/JS vanilla), que reutiliza el motor de amortización existente.

**Alcance v1: solo créditos.** Sin ingresos (salario, primas, arriendos) — eso queda fuera.

## Process Overview
1. El usuario carga N créditos (saldo, tasa, plazo restante, seguro, abonos dirigidos).
2. Se deriva la cuota de cada crédito y se muestra como chequeo.
3. Se simula mes a mes: cuota + seguro + abonos → el saldo baja.
4. Cuando un crédito llega a 0, su cuota se libera y se reinyecta al siguiente según el orden activo.
5. Se corren 5 escenarios (base, avalancha, bola de nieve, sugerencia, manual) y se comparan.
6. Se muestra la tabla comparativa + la tabla mes a mes del escenario elegido + el KPI de libertad.

## Detailed Steps

### Step 1: Entrada de créditos
**Input por cada crédito:**
```
Nombre · Saldo actual · Tasa (o "sin interés") · Plazo restante
Seguro mensual (opcional)
Abonos dirigidos a ESE crédito:
   · fijo mensual (opcional)
   · puntuales: fecha (AAAAMM) + monto (lista, opcional)
```
**Globales:** fecha de inicio (mes actual por defecto, editable) · % de cuota liberada que se
reinvierte (100% por defecto, editable).

**Output:** la **cuota se calcula** (saldo + tasa + plazo restante) y se muestra al usuario.
**Decisión tomada:** el usuario NO escribe la cuota — se deriva. Esto elimina el riesgo de dedazo
y hace imposible el caso "la cuota no cubre el interés".
**Notas:** caso real del usuario — recompró un crédito a mejor tasa pero quiere seguir pagando lo
de antes; eso se modela con el **abono fijo mensual** (queda explícito cuánto es obligación y
cuánto es decisión de acelerar).

### Step 2: Simulación mes a mes
**What happens:** para cada mes, por cada crédito vivo: se cobra interés sobre el saldo, se aplica
la cuota + seguro + abonos dirigidos + la parte de cascada que le corresponda, y baja el saldo.
**Decisiones:** créditos **sin interés** se soportan (tasa 0 → el saldo baja por pura cuota).
La última cuota se ajusta al saldo exacto (no se sobrepaga).
**Output:** una fila por mes con el saldo de cada crédito, la cuota total pagada, y cuánto se liberó.

### Step 3: Cascada
**What happens:** cuando un crédito llega a 0, su cuota (× el % de reinversión) se suma como abono
extra al siguiente crédito según el orden activo.
**Decisiones:** por defecto se reinvierte el **100%**; con menos, la diferencia queda como flujo
disponible desde ese mes.

### Step 4: Escenarios
Se corre la simulación 5 veces:
| Escenario | Orden |
|---|---|
| **Sin abonos** (base) | sin cascada — para medir cuánto se gana |
| **Avalancha** | tasa más alta primero |
| **Bola de nieve** | saldo más pequeño primero |
| **Sugerencia** | el mejor orden encontrado según la vara elegida |
| **Manual** | el orden que el usuario define/arrastra |

### Step 5: La sugerencia
**What happens:** busca el mejor orden según una **vara seleccionable**:
- menos intereses totales
- salir de deudas lo antes posible
- liberar flujo mensual lo más rápido

**Decisiones:** con pocos créditos se prueban **todos** los órdenes (fuerza bruta = óptimo exacto);
con muchos, búsqueda heurística. La herramienta **dice cuál método usó** ("óptimo exacto" vs
"mejor encontrado") — no se afirma optimalidad cuando no la hay.
**Notas:** la vara importa de verdad. Con créditos al 0%, "menos intereses" los deja de últimos
siempre, mientras que "liberar flujo" puede subirlos al principio si tienen cuota gorda.

### Step 6: Salida
- **Tabla comparativa:** 5 escenarios × 3 métricas (intereses totales, fecha de libertad, flujo liberado).
- **Tabla mes a mes** del escenario elegido: saldo por crédito, cuota total, liberado.
- **KPI:** *"Desde marzo 2031 dispones de $11.980.000 al mes"* — la respuesta a la pregunta original.

## Edge Cases and Failure Modes
- **Cuota que no cubre el interés** → imposible por construcción (la cuota se deriva).
- **Fecha de inicio** → campo editable, mes actual por defecto.
- **Deudas muy largas** → tope de seguridad de 30 años (en Colombia no pasan de ~20, así que en la
  práctica nunca se toca).
- **Última cuota** → se ajusta al saldo exacto.
- **Crédito con saldo 0** → se ignora sin romper el cálculo.
- **Después de la libertad** → la tabla para en ese mes; el KPI dice de cuánto se dispone desde ahí.

## Dependencies and Requirements
- Motor de amortización existente (`src/amortization.py`) y conversión de tasas (`src/interest_rates.py`).
- Patrón del proyecto: módulo en `src/`, endpoint en `api_amortization.py`, sub-modo en el frontend.
- Sin dependencias nuevas — es aritmética.

## Open Questions
- Ninguna bloqueante. Se acordó **pulir sobre la marcha**.
- Fuera de alcance v1 (posibles v2): ingresos y flujo de caja completo, gráfica de saldos,
  seguir la proyección después de la fecha de libertad.

## Success Criteria
- Responde "¿cuándo quedo libre?" y "¿cuánta plata libero y desde cuándo?".
- Permite comparar al menos 4 estrategias sin rehacer nada a mano.
- Los créditos sin interés y sin seguro se modelan correctamente.
- La tabla mes a mes deja ver el momento exacto en que cae cada crédito y a dónde va su cuota.
