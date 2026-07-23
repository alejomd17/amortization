// La pagina y la API se sirven juntas (en local por uvicorn, en produccion por
// Vercel), asi que la ruta relativa basta. La excepcion es aleossa.com, donde
// Netlify hace proxy y /amortization apunta a la raiz: ahi hace falta la absoluta.
const PROXIED_HOSTS = ["aleossa.com", "www.aleossa.com"];
const API_BASE = PROXIED_HOSTS.includes(window.location.hostname)
    ? "https://amortization-sigma.vercel.app"
    : "";

// ── Utilidades ──────────────────────────────────────────────────────────────
const DICT_PERIOD = { Mensual: 1, Semestral: 6, Anual: 12 };

// Conversion de tasas: misma logica que src/interest_rates.py, replicada en el
// cliente para mostrar el equivalente en vivo sin ir al servidor.
function convertirTasa(tasaInicial, tipo, periodoActual, periodoDeseado) {
    let tasa = tasaInicial;
    let actual = periodoActual;
    if (tipo === "Nominal") {
        tasa = tasa / DICT_PERIOD[actual];
        actual = "Mensual";
    }
    const convertida = (Math.pow(1 + tasa / 100, DICT_PERIOD[periodoDeseado] / DICT_PERIOD[actual]) - 1) * 100;
    return Math.round(convertida * 10000) / 10000;
}

const fmtMoney = (v) => "$" + Math.round(v).toLocaleString("es-CO");
const fmtPct = (v) => `${Math.round(v * 100) / 100}%`;  // 2 decimales, sin ceros sobrantes

const MESES_ABR = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
function fmtMesAnno(annoMes) {
    if (!/^\d{6}$/.test(annoMes)) return annoMes;
    const nombre = MESES_ABR[Number(annoMes.slice(4)) - 1] || "";
    return `${nombre.charAt(0).toUpperCase()}${nombre.slice(1)} ${annoMes.slice(0, 4)}`;
}

// Tarjeta KPI reutilizable (resumen de crédito y de ahorro)
function kpiHtml(label, value, sub = "", clase = "") {
    return `<div class="kpi ${clase}">
        <span class="kpi-label">${label}</span>
        <span class="kpi-value">${value}</span>
        ${sub ? `<span class="kpi-sub">${sub}</span>` : ""}
    </div>`;
}

// POST a la API y renderiza el resultado (patrón común de todos los botones Calcular)
async function postAndRender(path, data, renderFn, cardId) {
    try {
        const response = await fetch(`${API_BASE}/${path.replace(/^\//, "")}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
        });
        if (!response.ok) {
            let detalle = "";
            try { detalle = (await response.json()).detail || ""; } catch (e) {}
            throw new Error(detalle || `HTTP ${response.status}`);
        }
        renderFn(await response.json());
        document.getElementById(cardId).scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
        console.error("Error:", error);
        alert("Hubo un problema con el cálculo: " + error.message);
    }
}

// Muestra el equivalente E.A./M.V. en vivo bajo un campo de tasa
function wireRateConversion(rateEl, typeEl, periodEl, outEl) {
    function update() {
        const tasa = Number.parseFloat(rateEl.value);
        if (!Number.isFinite(tasa) || tasa <= 0) {
            outEl.classList.add("hidden");
            return;
        }
        const ea = convertirTasa(tasa, typeEl.value, periodEl.value, "Anual");
        const mv = convertirTasa(tasa, typeEl.value, periodEl.value, "Mensual");
        outEl.innerHTML = `≈ <strong>${fmtPct(ea)}</strong> E.A. &nbsp;·&nbsp; <strong>${fmtPct(mv)}</strong> M.V.`;
        outEl.classList.remove("hidden");
    }
    [rateEl, typeEl, periodEl].forEach((el) => el.addEventListener("input", update));
}

// "202607" -> valido si son 6 digitos y el mes esta entre 01 y 12
function esAnnoMesValido(s) {
    if (!/^\d{6}$/.test(s)) return false;
    const mes = Number(s.slice(4));
    return mes >= 1 && mes <= 12;
}

// Lista de "AAAAMM" desde/hasta inclusive
function mesesEnRango(desde, hasta) {
    const meses = [];
    let anno = Number(desde.slice(0, 4));
    let mes = Number(desde.slice(4));
    const finAnno = Number(hasta.slice(0, 4));
    const finMes = Number(hasta.slice(4));
    while (anno < finAnno || (anno === finAnno && mes <= finMes)) {
        meses.push(`${anno}${String(mes).padStart(2, "0")}`);
        mes += 1;
        if (mes > 12) { mes = 1; anno += 1; }
    }
    return meses;
}

// ── App ─────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {

    const desembolsoDate = document.getElementById("desembolsoDate");
    const loanAmount = document.getElementById("loanAmount");
    const InterestRate = document.getElementById("InterestRate");
    const rateType = document.getElementById("rateType");
    const ratePeriod = document.getElementById("ratePeriod");
    const loanTerm = document.getElementById("loanTerm");
    const loanTermUnit = document.getElementById("loanTermUnit");
    const insurance = document.getElementById("insurance");
    const costosIniciales = document.getElementById("costosIniciales");
    const calculateBtn = document.getElementById("calculateBtn");
    const rateConversion = document.getElementById("rateConversion");

    // Abonos: unico
    const abonosCapitalDate = document.getElementById("abonosCapitalDate");
    const abonosCapitalValue = document.getElementById("abonosCapitalValue");
    const addAbonoUnicoBtn = document.getElementById("addAbonosCapital");
    // Abonos: recurrente
    const abonoRecDesde = document.getElementById("abonoRecDesde");
    const abonoRecHasta = document.getElementById("abonoRecHasta");
    const abonoRecValor = document.getElementById("abonoRecValor");
    const addAbonoRecBtn = document.getElementById("addAbonoRecurrente");
    // Toggle de modo
    const modeUnico = document.getElementById("modeUnico");
    const modeRecurrente = document.getElementById("modeRecurrente");
    const panelUnico = document.getElementById("abonoUnicoPanel");
    const panelRecurrente = document.getElementById("abonoRecurrentePanel");

    const abono_capital_all = {};

    // ── Conversion de tasas en vivo ──────────────────────────────────────────
    function actualizarConversion() {
        const tasa = Number.parseFloat(InterestRate.value);
        if (!Number.isFinite(tasa) || tasa <= 0) {
            rateConversion.classList.add("hidden");
            return;
        }
        const ea = convertirTasa(tasa, rateType.value, ratePeriod.value, "Anual");
        const mv = convertirTasa(tasa, rateType.value, ratePeriod.value, "Mensual");
        rateConversion.innerHTML = `≈ <strong>${fmtPct(ea)}</strong> E.A. &nbsp;·&nbsp; <strong>${fmtPct(mv)}</strong> M.V.`;
        rateConversion.classList.remove("hidden");
    }
    [InterestRate, rateType, ratePeriod].forEach((el) =>
        el.addEventListener("input", actualizarConversion));

    // ── Toggle de modo de abono ──────────────────────────────────────────────
    function setModo(modo) {
        const esUnico = modo === "unico";
        modeUnico.classList.toggle("active", esUnico);
        modeRecurrente.classList.toggle("active", !esUnico);
        modeUnico.setAttribute("aria-selected", String(esUnico));
        modeRecurrente.setAttribute("aria-selected", String(!esUnico));
        panelUnico.classList.toggle("hidden", !esUnico);
        panelRecurrente.classList.toggle("hidden", esUnico);
    }
    modeUnico.addEventListener("click", () => setModo("unico"));
    modeRecurrente.addEventListener("click", () => setModo("recurrente"));

    // ── Tabla de abonos ──────────────────────────────────────────────────────
    function agregarAbono(annoMes, monto) {
        // Reemplaza: el ultimo valor asignado a un mes es el que manda (no se suman
        // solapes de rangos). Para cambiar un mes, vuelve a asignarlo o elimínalo.
        abono_capital_all[annoMes] = monto;
    }

    function displayAbonos() {
        const tbody = document.querySelector("#abonosTable tbody");
        const tfoot = document.querySelector("#abonosTable tfoot");
        tbody.innerHTML = "";
        tfoot.innerHTML = "";

        const ordenados = Object.entries(abono_capital_all).sort((a, b) => a[0].localeCompare(b[0]));

        ordenados.forEach(([date, value]) => {
            const row = tbody.insertRow();
            row.insertCell(0).textContent = date;
            row.insertCell(1).textContent = fmtMoney(value);
            const actionCell = row.insertCell(2);
            const removeBtn = document.createElement("button");
            removeBtn.className = "btn-remove-abono";
            removeBtn.textContent = "Eliminar";
            removeBtn.setAttribute("data-date", date);
            actionCell.appendChild(removeBtn);
        });

        if (ordenados.length > 0) {
            const suma = ordenados.reduce((acc, [, v]) => acc + v, 0);
            const footRow = tfoot.insertRow();
            footRow.insertCell(0).textContent = `Total (${ordenados.length})`;
            footRow.insertCell(1).textContent = fmtMoney(suma);
            footRow.insertCell(2).textContent = "";
        }

        document.querySelectorAll(".btn-remove-abono").forEach((btn) => {
            btn.addEventListener("click", function () {
                delete abono_capital_all[this.getAttribute("data-date")];
                displayAbonos();
            });
        });
    }

    // ── Agregar abono unico ──────────────────────────────────────────────────
    addAbonoUnicoBtn.addEventListener("click", () => {
        const date = abonosCapitalDate.value.trim();
        const amount = Number.parseFloat(abonosCapitalValue.value);
        if (!esAnnoMesValido(date) || !(amount > 0)) {
            alert("Ingrese una fecha AAAAMM válida y un monto mayor a 0.");
            return;
        }
        agregarAbono(date, amount);
        abonosCapitalDate.value = "";
        abonosCapitalValue.value = "";
        displayAbonos();
    });

    // ── Agregar abono mensual fijo (rango) ───────────────────────────────────
    addAbonoRecBtn.addEventListener("click", () => {
        const desde = abonoRecDesde.value.trim();
        const hasta = abonoRecHasta.value.trim();
        const monto = Number.parseFloat(abonoRecValor.value);
        if (!esAnnoMesValido(desde) || !esAnnoMesValido(hasta)) {
            alert("Ingrese fechas AAAAMM válidas en 'Desde' y 'Hasta'.");
            return;
        }
        if (desde > hasta) {
            alert("'Desde' debe ser menor o igual que 'Hasta'.");
            return;
        }
        if (!(monto > 0)) {
            alert("Ingrese un monto mensual mayor a 0.");
            return;
        }
        mesesEnRango(desde, hasta).forEach((m) => agregarAbono(m, monto));
        abonoRecDesde.value = "";
        abonoRecHasta.value = "";
        abonoRecValor.value = "";
        displayAbonos();
    });

    // ── Calcular ─────────────────────────────────────────────────────────────
    calculateBtn.addEventListener("click", async () => {
        // Plazo: convertir a años segun la unidad elegida (el backend usa años)
        const plazo = Number.parseFloat(loanTerm.value);
        const plazoAnios = loanTermUnit.value === "months" ? plazo / 12 : plazo;

        const data = {
            desembolso_date: desembolsoDate.value.trim(),
            loan_amount: Number.parseFloat(loanAmount.value),
            interest_rate: Number.parseFloat(InterestRate.value),
            type_rate: rateType.value,
            period: ratePeriod.value,
            loan_term_years: plazoAnios,
            insurance: Number.parseFloat(insurance.value) || 0,  // vacio -> 0
            abono_capital_all: abono_capital_all,
            costos_iniciales: Number.parseFloat(costosIniciales.value) || 0,
        };

        try {
            const response = await fetch(`${API_BASE}/amortization`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data),
            });

            if (!response.ok) {
                let detalle = "";
                try { detalle = (await response.json()).detail || ""; } catch (e) {}
                throw new Error(detalle || `HTTP ${response.status}`);
            }

            const result = await response.json();
            displayResumen(result.resumen);
            displayAmortizationTable(result.amortization_table);
            document.getElementById("resumenCard").scrollIntoView({ behavior: "smooth", block: "start" });
        } catch (error) {
            console.error("Error:", error);
            alert("Hubo un problema con el cálculo: " + error.message);
        }
    });

    // ── PESTAÑAS: Crédito / Inmobiliaria / Ahorro ────────────────────────────
    const TABS = [
        { key: "credito", tab: "tabCredito", panel: "panelCredito" },
        { key: "inmobiliaria", tab: "tabInmobiliaria", panel: "panelInmobiliaria" },
        { key: "ahorro", tab: "tabAhorro", panel: "panelAhorro" },
    ].map((t) => ({ ...t, tabEl: document.getElementById(t.tab), panelEl: document.getElementById(t.panel) }));
    function setTab(key) {
        TABS.forEach((t) => {
            const activo = t.key === key;
            t.tabEl.classList.toggle("active", activo);
            t.panelEl.classList.toggle("hidden", !activo);
        });
    }
    TABS.forEach((t) => t.tabEl.addEventListener("click", () => setTab(t.key)));

    // ── AHORRO / CDT ─────────────────────────────────────────────────────────
    const ahMonto = document.getElementById("ahMonto");
    const ahRate = document.getElementById("ahRate");
    const ahRateType = document.getElementById("ahRateType");
    const ahRatePeriod = document.getElementById("ahRatePeriod");
    const ahRateConversion = document.getElementById("ahRateConversion");
    const ahPlazo = document.getElementById("ahPlazo");
    const ahPlazoUnit = document.getElementById("ahPlazoUnit");
    const ahRetencion = document.getElementById("ahRetencion");
    const calcularAhorroBtn = document.getElementById("calcularAhorroBtn");

    function actualizarConversionAhorro() {
        const tasa = Number.parseFloat(ahRate.value);
        if (!Number.isFinite(tasa) || tasa <= 0) {
            ahRateConversion.classList.add("hidden");
            return;
        }
        const ea = convertirTasa(tasa, ahRateType.value, ahRatePeriod.value, "Anual");
        const mv = convertirTasa(tasa, ahRateType.value, ahRatePeriod.value, "Mensual");
        ahRateConversion.innerHTML = `≈ <strong>${fmtPct(ea)}</strong> E.A. &nbsp;·&nbsp; <strong>${fmtPct(mv)}</strong> M.V.`;
        ahRateConversion.classList.remove("hidden");
    }
    [ahRate, ahRateType, ahRatePeriod].forEach((el) =>
        el.addEventListener("input", actualizarConversionAhorro));

    calcularAhorroBtn.addEventListener("click", async () => {
        const plazo = Number.parseFloat(ahPlazo.value);
        const plazoMeses = ahPlazoUnit.value === "years" ? plazo * 12 : plazo;

        const data = {
            monto: Number.parseFloat(ahMonto.value),
            interest_rate: Number.parseFloat(ahRate.value),
            type_rate: ahRateType.value,
            period: ahRatePeriod.value,
            plazo_meses: plazoMeses,
            retencion: Number.parseFloat(ahRetencion.value) || 0,
        };

        try {
            const response = await fetch(`${API_BASE}/ahorro`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data),
            });
            if (!response.ok) {
                let detalle = "";
                try { detalle = (await response.json()).detail || ""; } catch (e) {}
                throw new Error(detalle || `HTTP ${response.status}`);
            }
            displayAhorro(await response.json());
            document.getElementById("ahorroResultCard").scrollIntoView({ behavior: "smooth", block: "start" });
        } catch (error) {
            console.error("Error:", error);
            alert("Hubo un problema con el cálculo: " + error.message);
        }
    });

    // ── Sub-modo Ahorro: CDT / Programado / Meta ─────────────────────────────
    const AHORRO_MODOS = [
        { key: "cdt", btn: "ahModeCdt", panel: "ahPanelCdt" },
        { key: "programado", btn: "ahModeProgramado", panel: "ahPanelProgramado" },
        { key: "meta", btn: "ahModeMeta", panel: "ahPanelMeta" },
    ].map((m) => ({ ...m, btnEl: document.getElementById(m.btn), panelEl: document.getElementById(m.panel) }));
    function setAhorroModo(key) {
        AHORRO_MODOS.forEach((m) => {
            const activo = m.key === key;
            m.btnEl.classList.toggle("active", activo);
            m.btnEl.setAttribute("aria-selected", String(activo));
            m.panelEl.classList.toggle("hidden", !activo);
        });
    }
    AHORRO_MODOS.forEach((m) => m.btnEl.addEventListener("click", () => setAhorroModo(m.key)));

    // ── AHORRO PROGRAMADO ────────────────────────────────────────────────────
    const ahPgAporte = document.getElementById("ahPgAporte");
    const ahPgInicial = document.getElementById("ahPgInicial");
    const ahPgRate = document.getElementById("ahPgRate");
    const ahPgRateType = document.getElementById("ahPgRateType");
    const ahPgRatePeriod = document.getElementById("ahPgRatePeriod");
    const ahPgPlazo = document.getElementById("ahPgPlazo");
    const ahPgPlazoUnit = document.getElementById("ahPgPlazoUnit");
    const ahPgRetencion = document.getElementById("ahPgRetencion");
    const calcularProgramadoBtn = document.getElementById("calcularProgramadoBtn");

    wireRateConversion(ahPgRate, ahPgRateType, ahPgRatePeriod,
        document.getElementById("ahPgRateConversion"));

    calcularProgramadoBtn.addEventListener("click", async () => {
        const plazo = Number.parseFloat(ahPgPlazo.value);
        const plazoMeses = ahPgPlazoUnit.value === "years" ? plazo * 12 : plazo;

        const data = {
            aporte_mensual: Number.parseFloat(ahPgAporte.value),
            monto_inicial: Number.parseFloat(ahPgInicial.value) || 0,
            interest_rate: Number.parseFloat(ahPgRate.value),
            type_rate: ahPgRateType.value,
            period: ahPgRatePeriod.value,
            plazo_meses: plazoMeses,
            retencion: Number.parseFloat(ahPgRetencion.value) || 0,
        };

        try {
            const response = await fetch(`${API_BASE}/ahorro-programado`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data),
            });
            if (!response.ok) {
                let detalle = "";
                try { detalle = (await response.json()).detail || ""; } catch (e) {}
                throw new Error(detalle || `HTTP ${response.status}`);
            }
            displayProgramado(await response.json());
            document.getElementById("programadoResultCard").scrollIntoView({ behavior: "smooth", block: "start" });
        } catch (error) {
            console.error("Error:", error);
            alert("Hubo un problema con el cálculo: " + error.message);
        }
    });

    // ── AHORRO META ──────────────────────────────────────────────────────────
    const ahMtObjetivo = document.getElementById("ahMtObjetivo");
    const ahMtInicial = document.getElementById("ahMtInicial");
    const ahMtRate = document.getElementById("ahMtRate");
    const ahMtRateType = document.getElementById("ahMtRateType");
    const ahMtRatePeriod = document.getElementById("ahMtRatePeriod");
    const ahMtPlazo = document.getElementById("ahMtPlazo");
    const ahMtPlazoUnit = document.getElementById("ahMtPlazoUnit");
    const ahMtRetencion = document.getElementById("ahMtRetencion");
    const calcularMetaBtn = document.getElementById("calcularMetaBtn");

    wireRateConversion(ahMtRate, ahMtRateType, ahMtRatePeriod,
        document.getElementById("ahMtRateConversion"));

    calcularMetaBtn.addEventListener("click", async () => {
        const plazo = Number.parseFloat(ahMtPlazo.value);
        const plazoMeses = ahMtPlazoUnit.value === "years" ? plazo * 12 : plazo;

        const data = {
            meta_objetivo: Number.parseFloat(ahMtObjetivo.value),
            monto_inicial: Number.parseFloat(ahMtInicial.value) || 0,
            interest_rate: Number.parseFloat(ahMtRate.value),
            type_rate: ahMtRateType.value,
            period: ahMtRatePeriod.value,
            plazo_meses: plazoMeses,
            retencion: Number.parseFloat(ahMtRetencion.value) || 0,
        };

        try {
            const response = await fetch(`${API_BASE}/ahorro-meta`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data),
            });
            if (!response.ok) {
                let detalle = "";
                try { detalle = (await response.json()).detail || ""; } catch (e) {}
                throw new Error(detalle || `HTTP ${response.status}`);
            }
            displayMeta(await response.json());
            document.getElementById("metaResultCard").scrollIntoView({ behavior: "smooth", block: "start" });
        } catch (error) {
            console.error("Error:", error);
            alert("Hubo un problema con el cálculo: " + error.message);
        }
    });

    // ── Sub-modo Inmobiliaria ────────────────────────────────────────────────
    const INMO_MODOS = [
        { key: "capacidad", btn: "imModeCapacidad", panel: "imPanelCapacidad" },
        { key: "cuota-inicial", btn: "imModeCuotaInicial", panel: "imPanelCuotaInicial" },
        { key: "rentabilidad", btn: "imModeRentabilidad", panel: "imPanelRentabilidad" },
    ].map((m) => ({ ...m, btnEl: document.getElementById(m.btn), panelEl: document.getElementById(m.panel) }));
    function setInmoModo(key) {
        INMO_MODOS.forEach((m) => {
            const activo = m.key === key;
            m.btnEl.classList.toggle("active", activo);
            m.btnEl.setAttribute("aria-selected", String(activo));
            m.panelEl.classList.toggle("hidden", !activo);
        });
    }
    INMO_MODOS.forEach((m) => m.btnEl.addEventListener("click", () => setInmoModo(m.key)));

    const g = (id) => Number.parseFloat(document.getElementById(id).value);
    const gv = (id) => document.getElementById(id).value;

    // Capacidad de endeudamiento
    wireRateConversion(document.getElementById("imCapRate"), document.getElementById("imCapRateType"),
        document.getElementById("imCapRatePeriod"), document.getElementById("imCapRateConversion"));
    document.getElementById("calcularCapacidadBtn").addEventListener("click", () => {
        const plazoMeses = gv("imCapPlazoUnit") === "years" ? g("imCapPlazo") * 12 : g("imCapPlazo");
        postAndRender("/inmueble/capacidad", {
            ingreso_mensual: g("imCapIngreso"),
            porcentaje_max: g("imCapPorcentaje") || 30,
            deudas_actuales: g("imCapDeudas") || 0,
            interest_rate: g("imCapRate"),
            type_rate: gv("imCapRateType"),
            period: gv("imCapRatePeriod"),
            plazo_meses: plazoMeses,
        }, displayCapacidad, "capacidadResultCard");
    });

    // Cuota inicial + precio
    wireRateConversion(document.getElementById("imCiRate"), document.getElementById("imCiRateType"),
        document.getElementById("imCiRatePeriod"), document.getElementById("imCiRateConversion"));
    document.getElementById("calcularCuotaInicialBtn").addEventListener("click", () => {
        const plazoMeses = gv("imCiPlazoUnit") === "years" ? g("imCiPlazo") * 12 : g("imCiPlazo");
        postAndRender("/inmueble/cuota-inicial", {
            precio: g("imCiPrecio"),
            porcentaje_inicial: g("imCiPorcentaje") || 30,
            interest_rate: g("imCiRate"),
            type_rate: gv("imCiRateType"),
            period: gv("imCiRatePeriod"),
            plazo_meses: plazoMeses,
        }, displayCuotaInicial, "cuotaInicialResultCard");
    });

    // Rentabilidad de arriendo
    document.getElementById("calcularRentabilidadBtn").addEventListener("click", () => {
        postAndRender("/inmueble/rentabilidad", {
            precio: g("imRtPrecio"),
            costos_compra_pct: g("imRtCostos") || 0,
            arriendo_mensual: g("imRtArriendo"),
            vacancia_meses: g("imRtVacancia") || 0,
            comision_agencia_pct: g("imRtComision") || 0,
            administracion_mensual: g("imRtAdmin") || 0,
            predial_anual: g("imRtPredial") || 0,
            mantenimiento_anual: g("imRtMantenimiento") || 0,
            inflacion_pct: g("imRtInflacion") || 0,
            valorizacion_real_pct: g("imRtValorizacion") || 0,
            cdt_ea: g("imRtCdt") || 0,
            retencion_cdt_pct: g("imRtRetencion") || 0,
        }, displayRentabilidad, "rentabilidadResultCard");
    });

    // ── Sub-modo Crédito: Amortización / Comparador ──────────────────────────
    const CREDITO_MODOS = [
        { key: "amortizacion", btn: "crModeAmortizacion", panel: "crPanelAmortizacion" },
        { key: "comparador", btn: "crModeComparador", panel: "crPanelComparador" },
        { key: "abonar-invertir", btn: "crModeAbonarInvertir", panel: "crPanelAbonarInvertir" },
    ].map((m) => ({ ...m, btnEl: document.getElementById(m.btn), panelEl: document.getElementById(m.panel) }));
    function setCreditoModo(key) {
        CREDITO_MODOS.forEach((m) => {
            const activo = m.key === key;
            m.btnEl.classList.toggle("active", activo);
            m.btnEl.setAttribute("aria-selected", String(activo));
            m.panelEl.classList.toggle("hidden", !activo);
        });
    }
    CREDITO_MODOS.forEach((m) => m.btnEl.addEventListener("click", () => setCreditoModo(m.key)));

    // ── Comparador de créditos ───────────────────────────────────────────────
    const escenarios = [];
    function displayEscenarios() {
        const tbody = document.querySelector("#escenariosTable tbody");
        tbody.innerHTML = "";
        escenarios.forEach((e, i) => {
            const row = tbody.insertRow();
            row.insertCell(0).textContent = e.nombre || `Crédito ${i + 1}`;
            row.insertCell(1).textContent = fmtMoney(e.monto);
            row.insertCell(2).textContent =
                `${e.interest_rate}% ${e.type_rate === "Nominal" ? "N" : "E"}${e.period === "Anual" ? "A" : "M"}`;
            row.insertCell(3).textContent = `${e.plazo_meses} m`;
            row.insertCell(4).textContent = fmtMoney(e.costos);
            const btn = document.createElement("button");
            btn.className = "btn-remove-abono";
            btn.textContent = "Eliminar";
            btn.addEventListener("click", () => { escenarios.splice(i, 1); displayEscenarios(); });
            row.insertCell(5).appendChild(btn);
        });
    }
    document.getElementById("addEscenarioBtn").addEventListener("click", () => {
        const monto = Number.parseFloat(document.getElementById("cmpMonto").value);
        const rate = Number.parseFloat(document.getElementById("cmpRate").value);
        const plazoRaw = Number.parseFloat(document.getElementById("cmpPlazo").value);
        if (!(monto > 0) || !(rate > 0) || !(plazoRaw > 0)) {
            alert("Ingresa monto, tasa y plazo válidos.");
            return;
        }
        const plazoMeses = document.getElementById("cmpPlazoUnit").value === "years" ? plazoRaw * 12 : plazoRaw;
        escenarios.push({
            nombre: document.getElementById("cmpNombre").value.trim(),
            monto,
            interest_rate: rate,
            type_rate: document.getElementById("cmpRateType").value,
            period: document.getElementById("cmpRatePeriod").value,
            plazo_meses: plazoMeses,
            costos: Number.parseFloat(document.getElementById("cmpCostos").value) || 0,
        });
        ["cmpNombre", "cmpMonto", "cmpRate", "cmpPlazo", "cmpCostos"].forEach((id) => {
            document.getElementById(id).value = "";
        });
        displayEscenarios();
    });
    document.getElementById("compararBtn").addEventListener("click", () => {
        if (escenarios.length < 2) {
            alert("Agrega al menos 2 créditos para comparar.");
            return;
        }
        postAndRender("/comparar", { escenarios }, displayComparador, "comparadorResultCard");
    });

    // ── Abonar vs. invertir ──────────────────────────────────────────────────
    document.getElementById("calcularAbonarInvertirBtn").addEventListener("click", () => {
        postAndRender("/decisiones/abonar-vs-invertir", {
            monto_extra: g("aiMonto"),
            tasa_credito: g("aiTasaCredito"),
            tc_type: gv("aiTcType"),
            tc_period: gv("aiTcPeriod"),
            cdt_ea: g("aiCdt") || 0,
            retencion_cdt_pct: g("aiRetencion") || 0,
            horizonte_anos: g("aiHorizonte") || 5,
        }, displayAbonarInvertir, "abonarInvertirResultCard");
    });
});


// ── Render: resumen ───────────────────────────────────────────────────────────
function displayResumen(r) {
    const card = document.getElementById("resumenCard");
    card.classList.remove("hidden");

    const kpi = (label, value, sub = "", clase = "") =>
        `<div class="kpi ${clase}">
            <span class="kpi-label">${label}</span>
            <span class="kpi-value">${value}</span>
            ${sub ? `<span class="kpi-sub">${sub}</span>` : ""}
        </div>`;

    const seguroSub = r.seguro > 0
        ? `+ seguro ${fmtMoney(r.seguro)} = ${fmtMoney(r.cuota_total)}`
        : "";

    // Costo real: solo si hay costos (seguro/iniciales) que lo separen de la tasa nominal
    const hayCostoReal = r.costo_real_ea && Math.abs(r.costo_real_ea - r.tasa_ea) > 0.001;
    const costoRealKpi = hayCostoReal
        ? kpi("Costo real (E.A.)", fmtPct(r.costo_real_ea), `+${Math.round((r.costo_real_ea - r.tasa_ea) * 100) / 100} pts vs nominal`)
        : "";

    let html = `<h2>Tu <em>resumen</em></h2>
        <div class="kpi-grid">
            ${kpi("Cuota mensual", fmtMoney(r.cuota_mensual), seguroSub)}
            ${kpi("Tasa E.A.", fmtPct(r.tasa_ea))}
            ${kpi("Tasa M.V.", fmtPct(r.tasa_mv))}
            ${costoRealKpi}
            ${kpi("Plazo", `${r.plazo_meses} meses`)}
        </div>

        <h3>Sin abonos</h3>
        <div class="kpi-grid">
            ${kpi("Total a pagar", fmtMoney(r.sin_abonos.total_pagado))}
            ${kpi("Total intereses", fmtMoney(r.sin_abonos.total_intereses))}
            ${kpi("Meses a pagar", `${r.sin_abonos.meses}`, `termina ${fmtMesAnno(r.sin_abonos.mes_final)}`)}
        </div>`;

    if (r.con_abonos) {
        const c = r.con_abonos;
        html += `
        <h3>Con tus abonos</h3>
        <p class="resumen-narrativa">
            Con estos abonos terminas de pagar en <strong>${fmtMesAnno(c.mes_final)}</strong>
            &mdash; <strong>${c.meses} meses</strong> (${c.meses_ahorrados} antes) &mdash;
            y ahorras <strong>${fmtMoney(c.ahorro_intereses)}</strong> en intereses.
        </p>
        <div class="kpi-grid">
            ${kpi("Terminas de pagar", fmtMesAnno(c.mes_final), `${c.meses} meses`, "good")}
            ${kpi("Meses que ahorras", `${c.meses_ahorrados}`, "", "good")}
            ${kpi("Ahorro en intereses", fmtMoney(c.ahorro_intereses), "", "good")}
            ${kpi("Ahorro total", fmtMoney(c.ahorro_total), "", "good")}
            ${kpi("Total a pagar", fmtMoney(c.total_pagado))}
            ${kpi("Total intereses", fmtMoney(c.total_intereses))}
            ${kpi("Total abonos", fmtMoney(c.total_abonos), `${c.abonos.length} abonos`)}
        </div>`;
    }

    card.innerHTML = html;
}


// ── Render: tabla ─────────────────────────────────────────────────────────────
function displayAmortizationTable(tabla) {
    const resultCard = document.getElementById("resultsTable");
    const tableBody = document.getElementById("calculationResult").getElementsByTagName("tbody")[0];
    resultCard.classList.remove("hidden");
    tableBody.innerHTML = "";

    tabla.forEach((row) => {
        const newRow = tableBody.insertRow();
        if (row.abono_capital > 0) newRow.classList.add("row-abono");
        newRow.insertCell(0).textContent = row.num;
        newRow.insertCell(1).textContent = row.anno_mes;
        newRow.insertCell(2).textContent = fmtMoney(row.interest);
        newRow.insertCell(3).textContent = fmtMoney(row.capital);
        newRow.insertCell(4).textContent = fmtMoney(row.insurance);
        newRow.insertCell(5).textContent = fmtMoney(row.payment);
        newRow.insertCell(6).textContent = fmtMoney(row.abono_capital);
        newRow.insertCell(7).textContent = fmtMoney(row.balance);
    });
}


// ── Render: ahorro / CDT ──────────────────────────────────────────────────────
function displayAhorro(r) {
    const card = document.getElementById("ahorroResultCard");
    card.classList.remove("hidden");

    card.innerHTML = `
        <h2>Tu <em>ahorro</em></h2>
        <p class="resumen-narrativa">
            Inviertes <strong>${fmtMoney(r.monto)}</strong> a <strong>${fmtPct(r.tasa_ea)} E.A.</strong>
            durante <strong>${r.plazo_meses} meses</strong>. Al vencimiento recibes
            <strong>${fmtMoney(r.valor_final_neto)}</strong> netos.
        </p>
        <div class="kpi-grid">
            ${kpiHtml("Valor final neto", fmtMoney(r.valor_final_neto), `rinde ${fmtPct(r.rendimiento_neto_pct)}`, "good")}
            ${kpiHtml("Interés neto", fmtMoney(r.interes_neto), "", "good")}
            ${kpiHtml("Interés bruto", fmtMoney(r.interes_bruto))}
            ${kpiHtml("Retención", fmtMoney(r.retencion), `${fmtPct(r.retencion_pct)} en la fuente`)}
            ${kpiHtml("Tasa E.A.", fmtPct(r.tasa_ea))}
            ${kpiHtml("Tasa M.V.", fmtPct(r.tasa_mv))}
        </div>`;
}


// ── Render: ahorro programado ─────────────────────────────────────────────────
function displayProgramado(r) {
    const card = document.getElementById("programadoResultCard");
    card.classList.remove("hidden");

    const inicialTxt = r.monto_inicial > 0
        ? ` (más <strong>${fmtMoney(r.monto_inicial)}</strong> inicial)`
        : "";

    card.innerHTML = `
        <h2>Tu <em>ahorro programado</em></h2>
        <p class="resumen-narrativa">
            Aportando <strong>${fmtMoney(r.aporte_mensual)}</strong> al mes durante
            <strong>${r.plazo_meses} meses</strong>${inicialTxt}, acumulas
            <strong>${fmtMoney(r.valor_final_neto)}</strong>. De eso,
            <strong>${fmtMoney(r.interes_neto)}</strong> son intereses que no pusiste tú.
        </p>
        <div class="kpi-grid">
            ${kpiHtml("Valor final neto", fmtMoney(r.valor_final_neto), "", "good")}
            ${kpiHtml("Total aportado", fmtMoney(r.total_aportado), "lo que pusiste tú")}
            ${kpiHtml("Interés neto", fmtMoney(r.interes_neto), "", "good")}
            ${kpiHtml("Interés bruto", fmtMoney(r.interes_bruto))}
            ${kpiHtml("Retención", fmtMoney(r.retencion), `${fmtPct(r.retencion_pct)} en la fuente`)}
            ${kpiHtml("Tasa E.A.", fmtPct(r.tasa_ea))}
        </div>`;
}


// ── Render: meta de ahorro ────────────────────────────────────────────────────
function displayMeta(r) {
    const card = document.getElementById("metaResultCard");
    card.classList.remove("hidden");

    if (r.ya_alcanzada) {
        card.innerHTML = `
            <h2>Tu <em>meta</em></h2>
            <p class="resumen-narrativa">
                Con tu monto inicial de <strong>${fmtMoney(r.monto_inicial)}</strong> ya superas la
                meta de <strong>${fmtMoney(r.meta_objetivo)}</strong> — no necesitas aportar nada más.
            </p>`;
        return;
    }

    const inicialTxt = r.monto_inicial > 0 ? ` (más <strong>${fmtMoney(r.monto_inicial)}</strong> inicial)` : "";
    card.innerHTML = `
        <h2>Tu <em>meta</em></h2>
        <p class="resumen-narrativa">
            Para llegar a <strong>${fmtMoney(r.meta_objetivo)}</strong> en
            <strong>${r.plazo_meses} meses</strong>${inicialTxt} al ${fmtPct(r.tasa_ea)} E.A.,
            debes aportar <strong>${fmtMoney(r.aporte_mensual)}</strong> al mes.
        </p>
        <div class="kpi-grid">
            ${kpiHtml("Aporte mensual", fmtMoney(r.aporte_mensual), "", "good")}
            ${kpiHtml("Meta", fmtMoney(r.meta_objetivo))}
            ${kpiHtml("Total que aportas", fmtMoney(r.total_aportado), "de tu bolsillo")}
            ${kpiHtml("Lo pone el interés", fmtMoney(r.interes_neto), "", "good")}
            ${kpiHtml("Plazo", `${r.plazo_meses} meses`)}
            ${kpiHtml("Tasa E.A.", fmtPct(r.tasa_ea))}
        </div>`;
}


// ── Render: capacidad de endeudamiento ────────────────────────────────────────
function displayCapacidad(r) {
    const card = document.getElementById("capacidadResultCard");
    card.classList.remove("hidden");
    card.innerHTML = `
        <h2>Tu <em>capacidad</em></h2>
        <p class="resumen-narrativa">
            Con un ingreso de <strong>${fmtMoney(r.ingreso_mensual)}</strong> y una cuota de hasta el
            <strong>${fmtPct(r.porcentaje_max)}</strong>, te pueden prestar hasta
            <strong>${fmtMoney(r.monto_max)}</strong> a ${r.plazo_meses} meses (${fmtPct(r.tasa_ea)} E.A.).
        </p>
        <div class="kpi-grid">
            ${kpiHtml("Monto máximo", fmtMoney(r.monto_max), "", "good")}
            ${kpiHtml("Cuota máxima", fmtMoney(r.cuota_max), `${fmtPct(r.porcentaje_max)} del ingreso`)}
            ${kpiHtml("Plazo", `${r.plazo_meses} meses`)}
            ${kpiHtml("Tasa E.A.", fmtPct(r.tasa_ea))}
        </div>`;
}


// ── Render: cuota inicial + precio ────────────────────────────────────────────
function displayCuotaInicial(r) {
    const card = document.getElementById("cuotaInicialResultCard");
    card.classList.remove("hidden");
    card.innerHTML = `
        <h2>Tu <em>financiación</em></h2>
        <p class="resumen-narrativa">
            Un inmueble de <strong>${fmtMoney(r.precio)}</strong> con <strong>${fmtPct(r.porcentaje_inicial)}</strong>
            de cuota inicial (<strong>${fmtMoney(r.cuota_inicial)}</strong>) deja
            <strong>${fmtMoney(r.monto_financiar)}</strong> a financiar → cuota de
            <strong>${fmtMoney(r.cuota_mensual)}</strong> al mes.
        </p>
        <div class="kpi-grid">
            ${kpiHtml("Cuota mensual", fmtMoney(r.cuota_mensual), "", "good")}
            ${kpiHtml("Cuota inicial", fmtMoney(r.cuota_inicial), `${fmtPct(r.porcentaje_inicial)} del precio`)}
            ${kpiHtml("Monto a financiar", fmtMoney(r.monto_financiar))}
            ${kpiHtml("Total a pagar", fmtMoney(r.total_pagado))}
            ${kpiHtml("Total intereses", fmtMoney(r.total_intereses))}
            ${kpiHtml("Plazo", `${r.plazo_meses} meses`)}
        </div>`;
}


// ── Render: rentabilidad de arriendo ──────────────────────────────────────────
function displayRentabilidad(r) {
    const card = document.getElementById("rentabilidadResultCard");
    card.classList.remove("hidden");

    const veredicto = r.conviene_inmueble
        ? `Supera al CDT (<strong>${fmtPct(r.cdt_neto)}</strong> neto), y además queda un activo que puedes vender.`
        : `Queda por debajo del CDT (<strong>${fmtPct(r.cdt_neto)}</strong> neto). En pura rentabilidad, el CDT gana.`;

    card.innerHTML = `
        <h2>Tu <em>rentabilidad</em></h2>
        <p class="resumen-narrativa">
            Arriendo neto <strong>${fmtPct(r.rent_neta)}</strong> + valorización
            <strong>${fmtPct(r.valorizacion_total)}</strong> = <strong>${fmtPct(r.rent_total)}</strong> anual.
            ${veredicto}
        </p>
        <div class="kpi-grid">
            ${kpiHtml("Rentabilidad total", fmtPct(r.rent_total), "arriendo + valorización", "good")}
            ${kpiHtml("Rent. neta arriendo", fmtPct(r.rent_neta))}
            ${kpiHtml("Rent. bruta", fmtPct(r.rent_bruta))}
            ${kpiHtml("Flujo mensual neto", fmtMoney(r.flujo_mensual))}
            ${kpiHtml("Valorización", fmtPct(r.valorizacion_total))}
            ${kpiHtml("CDT de referencia", fmtPct(r.cdt_neto), "neto")}
        </div>
        <h3>Desglose anual</h3>
        <div class="kpi-grid">
            ${kpiHtml("Inversión total", fmtMoney(r.inversion_total))}
            ${kpiHtml("Ingreso arriendo", fmtMoney(r.ingreso_bruto_anual), "bruto/año")}
            ${kpiHtml("Comisión agencia", fmtMoney(r.gastos.comision_agencia))}
            ${kpiHtml("Administración", fmtMoney(r.gastos.administracion))}
            ${kpiHtml("Predial", fmtMoney(r.gastos.predial))}
            ${kpiHtml("Mantenimiento", fmtMoney(r.gastos.mantenimiento))}
        </div>`;
}


// ── Render: comparador de créditos ────────────────────────────────────────────
function displayComparador(r) {
    const card = document.getElementById("comparadorResultCard");
    card.classList.remove("hidden");
    const es = r.escenarios;
    const mejor = es.find((e) => e.mejor) || es[0];

    const th = es.map((e, i) => `<th class="${e.mejor ? "col-mejor" : ""}">${e.nombre || "Crédito " + (i + 1)}</th>`).join("");
    const fila = (label, fn) =>
        `<tr><td>${label}</td>${es.map((e) => `<td class="${e.mejor ? "col-mejor" : ""}">${fn(e)}</td>`).join("")}</tr>`;

    card.innerHTML = `
        <h2>El <em>comparador</em></h2>
        <p class="resumen-narrativa">
            Gana <strong>${mejor.nombre || "Crédito 1"}</strong> con el menor costo total
            (<strong>${fmtMoney(mejor.costo_total)}</strong>)${mejor.ahorro_vs_peor > 0
                ? `, ahorra <strong>${fmtMoney(mejor.ahorro_vs_peor)}</strong> frente a la opción más cara` : ""}.
        </p>
        <div class="table-scroll">
            <table class="amort-table comparador-table">
                <thead><tr><th></th>${th}</tr></thead>
                <tbody>
                    ${fila("Cuota mensual", (e) => fmtMoney(e.cuota))}
                    ${fila("Tasa E.A.", (e) => fmtPct(e.tasa_ea))}
                    ${fila("Plazo", (e) => e.plazo_meses + " meses")}
                    ${fila("Total pagado", (e) => fmtMoney(e.total_pagado))}
                    ${fila("Total intereses", (e) => fmtMoney(e.total_intereses))}
                    ${fila("Costos iniciales", (e) => fmtMoney(e.costos))}
                    ${fila("Costo total", (e) => `<strong>${fmtMoney(e.costo_total)}</strong>`)}
                </tbody>
            </table>
        </div>`;
}


// ── Render: abonar vs. invertir ───────────────────────────────────────────────
function displayAbonarInvertir(r) {
    const card = document.getElementById("abonarInvertirResultCard");
    card.classList.remove("hidden");
    const ganador = r.conviene_abonar ? "abonar al crédito" : "invertir en el CDT";
    card.innerHTML = `
        <h2>¿Abonar o <em>invertir</em>?</h2>
        <p class="resumen-narrativa">
            Te conviene <strong>${ganador}</strong>. Abonar te ahorra el
            <strong>${fmtPct(r.tasa_credito_ea)}</strong> del crédito (libre de impuestos);
            invertir te renta el <strong>${fmtPct(r.cdt_neto)}</strong> neto. En
            ${r.horizonte_anos} años la diferencia es <strong>${fmtMoney(r.diferencia)}</strong>.
        </p>
        <div class="kpi-grid">
            ${kpiHtml("Si abonas", fmtMoney(r.valor_abonar), `ahorras ${fmtMoney(r.ganancia_abonar)}`, r.conviene_abonar ? "good" : "")}
            ${kpiHtml("Si inviertes", fmtMoney(r.valor_invertir), `ganas ${fmtMoney(r.ganancia_invertir)}`, r.conviene_abonar ? "" : "good")}
            ${kpiHtml("Abonar rinde", fmtPct(r.tasa_credito_ea), "libre de impuestos")}
            ${kpiHtml("Invertir rinde", fmtPct(r.cdt_neto), "neto")}
            ${kpiHtml("Diferencia", fmtMoney(r.diferencia), `en ${r.horizonte_anos} años`)}
        </div>`;
}
