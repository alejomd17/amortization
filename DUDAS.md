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
- **Abonar vs. invertir — el campo NO es plata adicional**. Se llamaba "Monto extra a abonar"
  y confundía: sonaba a plata que aparece de algún lado y que además ya estaba decidido abonar.
  Es **la misma plata en los dos escenarios**; la pregunta es dónde la pones. Renombrado a
  "Plata que tienes disponible" y los textos ya no dicen "el extra". La comparación es justa
  porque de tu bolsillo sale lo mismo en ambos casos: monto + las cuotas del plazo restante.
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
  - **Solo 2 objetivos en el selector**: "menos intereses / salir antes" y "liberar flujo".
    Medido en 300 escenarios: la vara `tiempo` ("salir antes") dio el **mismo orden que
    `intereses` el 100%** de las veces — porque con presupuesto fijo el orden casi no cambia la
    fecha de libertad (95% idéntica), así que `tiempo` desempata por intereses y son la misma
    cosa. `flujo` sí difiere ~53% de las veces (trade-off real). El backend sigue soportando
    `tiempo` por compatibilidad, pero no se ofrece; un `tiempo` guardado se mapea a `intereses`.
  - El **flujo liberado se normaliza** al horizonte del escenario base; sin eso, "sin cascada"
    parecía el mejor solo por durar más. La búsqueda optimiza esa misma métrica normalizada.
  - **Al liquidarse un crédito se libera cuota + seguro** (no solo la cuota): dejas de pagar
    ambos, así que los dos entran al pool que cae sobre el siguiente. Coherente con que "lo que
    pagas" es cuota + seguro.
  - **Una sola regla para la plata que se libera**: todo (la cuota liberada *y* el sobrante de
    una última cuota) va al **primer crédito activo del orden**. Antes el sobrante se lo quedaba
    el que iba justo detrás del que se liquidaba, mientras la cuota liberada arrancaba desde el
    principio del orden — dos reglas para la misma plata. El síntoma era un abono que
    "aparecía un mes y se devolvía" al siguiente, y parecía un error de cuentas sin serlo.
    Si al repartir el sobrante ya no queda ningún crédito vivo, esa plata simplemente te queda
    libre ese mes.
  - **La cuota liberada le llega a quien va primero en el orden del escenario**, que casi nunca
    es el orden de la lista de arriba (ese es "Tu orden"). Para que eso se vea sin explicarlo,
    **las columnas del mes a mes y las pestañas del detalle se ordenan según el escenario**
    (numeradas 1, 2, 3…), no según la lista de entrada: leyendo de izquierda a derecha se ve
    quién le pasa la cuota liberada a quién. Las flechas ‹ › y las teclas ← → también recorren
    ese orden. En "Sin cascada" no se numeran ni se habla de orden, porque ahí no hay cascada.

  - **Abonos puntuales**: lista con botón (eliges el crédito, el mes y el monto). Si repites un
    mes en el mismo crédito, el nuevo monto reemplaza al anterior. Igual que en amortización,
    tiene toggle **Único / Mensual fijo**: el "mensual fijo" asigna el mismo monto a cada mes de
    un rango (desde-hasta) del crédito elegido — se expande en entradas puntuales individuales.
    (Distinto del campo "Abono fijo mensual" del crédito, que aplica toda la vida sin rango.)
  - **Persistencia**: los créditos y la configuración se guardan en `localStorage` del navegador
    bajo la clave `amortizacion.flujo.v1`, con botón "Limpiar todo". **Limitación honesta: es por
    navegador/dispositivo** — no sigue al usuario entre su computador y su celular. Para eso
    haría falta base de datos + login (otro proyecto).
  - **Carga por archivo**: se puede subir `.json` (ida y vuelta exacta) o `.csv`. Se descargan
    los créditos en dos formatos: "Guardar los míos (.json)" (exacto) y "Guardar los míos (.csv)"
    (mismo formato que la lectura, round-trip exacto salvo comas en el nombre, que se limpian).
    El CSV **exporta tus créditos reales**; solo cuando la lista está vacía baja una plantilla
    con ejemplos. **No se lee `.xlsx` directamente** a propósito: requeriría una
    librería JS o `openpyxl` en el backend, y el proyecto no tiene dependencias de JS y el bundle
    se mantiene en 14MB. Con "Guardar como CSV" desde Excel se logra lo mismo.
    El parser entiende formato colombiano (`240.000.000`, `$ 42.739.600`, `12,5`) y separador
    `,` o `;`. El archivo **reemplaza** la lista actual (no la mezcla).

  - **Tabla de amortización por crédito** (`POST /flujo/credito`). Devuelve **dos** tablas
    del mismo crédito, y son números distintos a propósito:
    - `solo`: el crédito por su cuenta, **con tus abonos dirigidos** (fijo y puntuales) pero
      sin la cascada. Conserva `mes_inicio` para que las fechas sean las reales.
    - `en_plan`: el mismo crédito dentro del orden escogido, sumándole las cuotas liberadas
      de los que ya se pagaron.
    - Lo **único** que cambia entre las dos es la cascada, así que la diferencia mide
      exactamente lo que gana la estrategia de orden — que es la pregunta del módulo.
    - Dónde vive cada una: arriba, en la lista, un botón "Ver tabla" **colapsado por defecto**
      que solo puede mostrar `solo` (ahí todavía no hay escenario escogido) y lo dice
      explícitamente. Abajo, en resultados, las dos con un toggle.
    - Navegación entre créditos: **pestañas con el nombre** + flechas ‹ › + teclas ← →.
      Se escogieron pestañas sobre solo-flechas porque con 7 créditos las flechas obligan a
      6 clics para llegar al último y no dejan ver dónde estás.
    - `detallar` va **apagado por defecto** en `_simular`: la búsqueda corre hasta 5.040
      simulaciones y guardar cada fila la volvería lenta y pesada sin que nadie las lea.
      Por eso la tabla se pide aparte en vez de viajar dentro de `/flujo`.
    - Las dos tablas se pueden **descargar en CSV**.
  - **Mes a mes: toggle Saldos / Pagos**. La tabla mostraba solo saldos (el que queda
    *después* de pagar), y eso confundía: el último saldo visible de un crédito es el del mes
    ANTERIOR al último pago, así que parecía terminar un mes antes (ej: Terrabonga con último
    saldo en mayo, pero el pago que lo liquida es en junio — que es lo que dice el banco). El
    toggle "Pagos" muestra lo que se le paga a cada crédito cada mes (cuota+seguro+abonos);
    ahí se ve el pago final en junio y el "—" del mes de arranque/desembolso (no se paga ese
    mes). La suma de pagos por crédito = el pago total. Se guarda en cada fila (`pagos`),
    con la misma convención que `saldos` (None = aún no nace).
  - **Columnas Cuotas / Abonos** (a la derecha del mes a mes): "Cuotas" = solo las cuotas+seguros
    programados de ese mes; "Abonos" = lo extra (dirigidos + cascada). Juntas = `pago_total`.
    Se muestran 3 columnas: **Cuotas · Abonos · Total** (Total = las dos juntas = `pago_total`).
  - **Ingreso mensual + columna "Te queda"**: `Te queda = ingreso − (Total − abonos extras)`.
    Del salario salen **las cuotas, el abono fijo y la cascada** (todo lo de la "hoja de vida" del
    crédito); **solo los abonos extras** (los puntuales/rangos de la sección Abonos puntuales:
    primas, cesantías, bonos) vienen de otra fuente y NO se restan del salario. El motor los separa
    en `abonos_extra` por mes. Verde si alcanza, rojo si no. Client-side (no recalcula la cascada).
  - **Abonos "mensual fijo" como rango (grupo)**: se guardan en `abonos_recurrentes`
    (`{desde, hasta, monto}`), NO expandidos, para **quitar el rango completo** de un botón. El
    backend (`_abonos_efectivos`) los expande y **SUMA** lo que caiga en el mismo mes: cada rango
    y cada puntual es una inyección real, así que si coinciden se suman (no se pisan) — vale para
    rango+puntual y rango+rango. El **CSV los expande**; el **JSON conserva el grupo**. La
    importación también recupera cuota/mes_inicio/recibe_abono, que antes se perdían (bug
    preexistente). Hay también un botón **"quitar todos los abonos del crédito elegido"**. (`mes_inicio`, AAAAMM, opcional). Antes de esa fecha el
    crédito **no existe**: sin saldo, sin cuota, sin intereses. Se desembolsa en ese mes y paga
    su primera cuota al mes siguiente (igual que los créditos que ya tienes, que arrancan en la
    fila 0 y pagan en la 1). Decisiones tomadas:
    - La **fecha de libertad espera el desembolso**: no se declara "libre de deudas" en un mes
      en el que todavía falta desembolsar un crédito ya planeado.
    - El **flujo liberado no cuenta** la cuota de un crédito que aún no nace — nunca fue una
      obligación, contarla infla la métrica.
    - En la tabla mes a mes: `·` = todavía no se desembolsa · `—` = ya se pagó. Son distintos.
    - **Se muestra en su turno sugerido, inline** (no forzado al final). Antes se movía al final
      de las columnas porque hoy no influye; el usuario prefirió verlo en la posición que la
      herramienta le sugiere, con `·` en los meses previos a nacer.
    - Un `mes_inicio` en el pasado se trata como "ya lo tienes hoy" (nace en 0).
    - El "Total" de la lista **sí suma los créditos futuros** (saldo y cuota); la etiqueta avisa
      cuántos están por desembolsar para que no se lea como "lo que pago hoy".
    - **Pendiente / duda abierta**: la plata que liberas *entre* que se acaban tus créditos
      actuales y llega el desembolso nuevo hoy simplemente queda libre mes a mes; no se acumula
      como ahorro para entrar de cuota inicial al crédito nuevo. ¿Vale la pena modelarlo?
  - **La columna "Cuota" de la tabla por crédito incluye el seguro**, igual que el módulo de
    amortización (donde `payment = cuota + seguro`). El seguro no es parte de la cuota francesa
    (interés+capital), pero lo que pagas cada mes es cuota + seguro, y así se muestra. La
    columna "Seguro" lo sigue desglosando aparte. `total_pagado` no lo cuenta doble.
  - **Cuota fija (opcional)**: si la dejas vacía se calcula por sistema francés con el plazo;
    si la escribes, manda esa y el **plazo se deriva de ella** (lo que muestra la lista y las
    tablas, no el que digitaste). Sirve para créditos donde conoces la cuota real y no cuadra
    con saldo+plazo (redondeos del banco, etc.). Se valida que cubra al menos el interés del
    primer mes; si no, se rechaza (mismo criterio de "cuota que no cubre interés" del resto).
  - **Recibe abonos de la cascada** (checkbox, por defecto sí): al desmarcarlo, el crédito
    **no es destino** del pool liberado — la plata sigue de largo al siguiente que sí reciba.
    Su cuota, cuando se paga, **sí** se libera al pool (no recibir ≠ no aportar). Pensado para
    créditos 0% donde abonar no ahorra interés: excluirlos deja que la cascada ataque los caros
    (comprobado: en un caso salió libre un mes antes). Su `abono_fijo`/puntuales, si los pones,
    siguen aplicando (son elección explícita por crédito, aparte de la cascada).
  - **Editar un crédito ya agregado**: el botón "Editar" carga el crédito en el mismo
    formulario de arriba (el botón pasa a "Guardar cambios" + aparece "Cancelar", y la fila
    se resalta). Al guardar **se queda en el mismo puesto del orden** y **conserva sus abonos
    puntuales** (esos se administran en su propia tabla). Internamente se guarda la
    *referencia* al crédito, no el índice, para que arrastrar o borrar otra fila no deje la
    edición apuntando al crédito equivocado.
  - **Reordenar arrastrando** (drag & drop nativo del navegador, sin librerías). Los botones
    ▲▼ siguen en el código pero la columna se **oculta en escritorio** (`min-width: 761px`):
    el drag & drop de HTML5 **no dispara eventos en pantallas táctiles**, así que sin ese
    respaldo el orden manual quedaría imposible de cambiar en el celular. Hacer arrastre
    táctil de verdad exigiría manejar `touchstart/touchmove` a mano (~80 líneas) o una
    librería JS; no valía la pena para una columna de respaldo.

- **Se recuerda en qué pantalla estabas** (clave `amortizacion.nav.v1`): la pestaña de arriba
  (Crédito/Ahorro/Inmobiliaria) y el sub-modo activo de cada una. Al recargar (Ctrl+Shift+R)
  vuelves a donde estabas, no al Amortización por defecto. Es solo *navegación*: los datos que
  escribes solo se persisten en el flujo (`amortizacion.flujo.v1`); las demás calculadoras
  siguen sin guardar sus campos. Si una clave guardada quedó vieja, se ignora (no deja la vista
  en blanco).

## Abiertas
- ¿La persistencia de **datos digitados** debería extenderse a las otras calculadoras, o solo al
  flujo (que es la de más digitación)? — la de *navegación* ya quedó para todas.

## Hallazgo importante (flujo de créditos)
Con presupuesto mensual constante (cascada al 100%), probando los 5.040 órdenes del caso real:
- **La fecha de libertad NO cambia con el orden** — los 5.040 terminan en el mismo mes.
- Los **intereses** varían poco: 2,3% de rango.
- El **flujo liberado** varía mucho: **26% de rango**.

O sea: el orden no decide *cuándo* sales de deudas, decide *cuánta plata liberas en el camino*.
Por eso la vara "liberar flujo" es la que de verdad discrimina.
