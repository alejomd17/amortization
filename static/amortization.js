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

function descargarArchivo(nombre, contenido, tipo) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([contenido], { type: tipo }));
    a.download = nombre;
    a.click();
    URL.revokeObjectURL(a.href);
}

// POST que devuelve el JSON crudo (sin render ni scroll). Lanza con el detalle del backend.
async function postJson(path, data) {
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
    return response.json();
}

// Tabla de amortización de un crédito. Mismas columnas que el módulo de amortización.
function tablaAmortHtml(filas, conSeguro) {
    const cabecera = ["#", "Mes", "Interés", "Capital"]
        .concat(conSeguro ? ["Seguro"] : [])
        .concat(["Cuota", "Abono", "Saldo"])
        .map((t) => `<th>${t}</th>`).join("");
    const cuerpo = filas.map((f) => `
        <tr class="${f.abono_capital > 0 ? "row-abono" : ""}">
            <td>${f.num}</td><td>${fmtMesAnno(f.anno_mes)}</td>
            <td>${fmtMoney(f.interest)}</td><td>${fmtMoney(f.capital)}</td>
            ${conSeguro ? `<td>${fmtMoney(f.insurance)}</td>` : ""}
            <td>${fmtMoney(f.payment)}</td>
            <td>${f.abono_capital > 0 ? fmtMoney(f.abono_capital) : "—"}</td>
            <td>${fmtMoney(f.balance)}</td>
        </tr>`).join("");
    return `<div class="table-scroll">
        <table class="amort-table"><thead><tr>${cabecera}</tr></thead><tbody>${cuerpo}</tbody></table>
    </div>`;
}

// La misma tabla como CSV, para descargarla
function tablaAmortCsv(filas) {
    const cab = ["num", "mes", "interes", "capital", "seguro", "cuota", "abono", "saldo"];
    const cuerpo = filas.map((f) => [f.num, f.anno_mes, f.interest, f.capital,
                                     f.insurance, f.payment, f.abono_capital, f.balance].join(","));
    return [cab.join(","), ...cuerpo].join("\n");
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

    // ── Recordar en qué pantalla estabas (sobrevive a recargar) ──────────────
    const NAV_STORE = "amortizacion.nav.v1";
    function guardarNav(campo, key) {
        try {
            const n = JSON.parse(localStorage.getItem(NAV_STORE) || "{}");
            n[campo] = key;
            localStorage.setItem(NAV_STORE, JSON.stringify(n));
        } catch (e) { /* modo privado o sin espacio: seguimos sin recordar */ }
    }
    function leerNav() {
        try { return JSON.parse(localStorage.getItem(NAV_STORE) || "{}"); }
        catch (e) { return {}; }
    }

    // ── PESTAÑAS: Crédito / Ahorro / Inmobiliaria ────────────────────────────
    const TABS = [
        { key: "credito", tab: "tabCredito", panel: "panelCredito" },
        { key: "ahorro", tab: "tabAhorro", panel: "panelAhorro" },
        { key: "inmobiliaria", tab: "tabInmobiliaria", panel: "panelInmobiliaria" },
    ].map((t) => ({ ...t, tabEl: document.getElementById(t.tab), panelEl: document.getElementById(t.panel) }));
    function setTab(key) {
        TABS.forEach((t) => {
            const activo = t.key === key;
            t.tabEl.classList.toggle("active", activo);
            t.panelEl.classList.toggle("hidden", !activo);
        });
    }
    TABS.forEach((t) => t.tabEl.addEventListener("click", () => { setTab(t.key); guardarNav("tab", t.key); }));

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
    AHORRO_MODOS.forEach((m) => m.btnEl.addEventListener("click", () => { setAhorroModo(m.key); guardarNav("ahorro", m.key); }));

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

    // ── AHORRO META (¿cuánto aporto? / ¿cuánto tardo?) ───────────────────────
    const ahMtObjetivo = document.getElementById("ahMtObjetivo");
    const ahMtInicial = document.getElementById("ahMtInicial");
    const ahMtRate = document.getElementById("ahMtRate");
    const ahMtRateType = document.getElementById("ahMtRateType");
    const ahMtRatePeriod = document.getElementById("ahMtRatePeriod");
    const ahMtPlazo = document.getElementById("ahMtPlazo");
    const ahMtPlazoUnit = document.getElementById("ahMtPlazoUnit");
    const ahMtAporte = document.getElementById("ahMtAporte");
    const mtFieldPlazo = document.getElementById("mtFieldPlazo");
    const mtFieldAporte = document.getElementById("mtFieldAporte");
    const mtModeAporte = document.getElementById("mtModeAporte");
    const mtModeTiempo = document.getElementById("mtModeTiempo");
    const calcularMetaBtn = document.getElementById("calcularMetaBtn");

    let metaModo = "aporte";
    function setMetaModo(modo) {
        metaModo = modo;
        const esAporte = modo === "aporte";
        mtModeAporte.classList.toggle("active", esAporte);
        mtModeTiempo.classList.toggle("active", !esAporte);
        mtModeAporte.setAttribute("aria-selected", String(esAporte));
        mtModeTiempo.setAttribute("aria-selected", String(!esAporte));
        mtFieldPlazo.classList.toggle("hidden", !esAporte);
        mtFieldAporte.classList.toggle("hidden", esAporte);
    }
    mtModeAporte.addEventListener("click", () => setMetaModo("aporte"));
    mtModeTiempo.addEventListener("click", () => setMetaModo("tiempo"));

    wireRateConversion(ahMtRate, ahMtRateType, ahMtRatePeriod,
        document.getElementById("ahMtRateConversion"));

    calcularMetaBtn.addEventListener("click", () => {
        const data = {
            modo: metaModo,
            meta_objetivo: Number.parseFloat(ahMtObjetivo.value),
            monto_inicial: Number.parseFloat(ahMtInicial.value) || 0,
            interest_rate: Number.parseFloat(ahMtRate.value),
            type_rate: ahMtRateType.value,
            period: ahMtRatePeriod.value,
        };
        if (metaModo === "tiempo") {
            data.aporte_mensual = Number.parseFloat(ahMtAporte.value) || 0;
        } else {
            const plazo = Number.parseFloat(ahMtPlazo.value);
            data.plazo_meses = ahMtPlazoUnit.value === "years" ? plazo * 12 : plazo;
        }
        postAndRender("/ahorro-meta", data, displayMeta, "metaResultCard");
    });

    // ── Sub-modo Inmobiliaria ────────────────────────────────────────────────
    const INMO_MODOS = [
        { key: "capacidad", btn: "imModeCapacidad", panel: "imPanelCapacidad" },
        { key: "cuota-inicial", btn: "imModeCuotaInicial", panel: "imPanelCuotaInicial" },
        { key: "rentabilidad", btn: "imModeRentabilidad", panel: "imPanelRentabilidad" },
        { key: "arrendar-comprar", btn: "imModeArrendarComprar", panel: "imPanelArrendarComprar" },
    ].map((m) => ({ ...m, btnEl: document.getElementById(m.btn), panelEl: document.getElementById(m.panel) }));
    function setInmoModo(key) {
        INMO_MODOS.forEach((m) => {
            const activo = m.key === key;
            m.btnEl.classList.toggle("active", activo);
            m.btnEl.setAttribute("aria-selected", String(activo));
            m.panelEl.classList.toggle("hidden", !activo);
        });
    }
    INMO_MODOS.forEach((m) => m.btnEl.addEventListener("click", () => { setInmoModo(m.key); guardarNav("inmobiliaria", m.key); }));

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

    // Arrendar vs. comprar
    document.getElementById("calcularArrendarComprarBtn").addEventListener("click", () => {
        const plazoMeses = gv("acPlazoUnit") === "years" ? g("acPlazo") * 12 : g("acPlazo");
        postAndRender("/inmueble/arrendar-vs-comprar", {
            precio: g("acPrecio"),
            cuota_inicial_pct: g("acCuotaInicial") || 30,
            costos_compra_pct: g("acCostosCompra") || 0,
            tasa_credito: g("acTasa"),
            tc_type: gv("acTcType"),
            tc_period: gv("acTcPeriod"),
            plazo_credito_meses: plazoMeses,
            arriendo_mensual: g("acArriendo"),
            inflacion_pct: g("acInflacion") || 0,
            valorizacion_real_pct: g("acValorizacion") || 0,
            predial_anual: g("acPredial") || 0,
            administracion_mensual: g("acAdmin") || 0,
            mantenimiento_anual: g("acMantenimiento") || 0,
            tasa_inversion_ea: g("acTasaInversion") || 0,
            retencion_inversion_pct: g("acRetencionInv") || 0,
            horizonte_anos: g("acHorizonte") || 10,
            vende: document.getElementById("acVende").checked,
            costos_venta_pct: g("acCostosVenta") || 0,
        }, displayArrendarComprar, "arrendarComprarResultCard");
    });

    // ── FLUJO DE CRÉDITOS (cascada) ──────────────────────────────────────────
    // Se guarda en este navegador para no volver a escribir todo cada vez.
    const FLUJO_STORE = "amortizacion.flujo.v1";
    let flujoCreditos = [];
    let fjArrastrando = null;   // índice de la fila que se está arrastrando
    // Se guarda la referencia al objeto, no el índice: así arrastrar o eliminar otra
    // fila no deja la edición apuntando al crédito equivocado.
    let fjEditando = null;      // crédito en edición (null = agregando uno nuevo)

    const FJ_CAMPOS = ["fjNombre", "fjSaldo", "fjPlazo", "fjTasa", "fjSeguro",
                       "fjAbonoFijo", "fjMesInicio", "fjCuota"];

    function fjSalirEdicion() {
        fjEditando = null;
        FJ_CAMPOS.forEach((id) => { document.getElementById(id).value = ""; });
        document.getElementById("fjTasa").value = "0";
        document.getElementById("fjPlazoUnit").value = "months";
        document.getElementById("fjTipoTasa").value = "Efectiva";
        document.getElementById("fjPeriodoTasa").value = "Anual";
        document.getElementById("fjRecibeAbono").checked = true;
        document.getElementById("fjAddBtn").textContent = "Agregar crédito";
        document.getElementById("fjCancelEditBtn").hidden = true;
    }

    function fjEntrarEdicion(c) {
        if (!c) return;
        fjEditando = c;
        document.getElementById("fjNombre").value = c.nombre || "";
        document.getElementById("fjSaldo").value = c.saldo;
        document.getElementById("fjPlazo").value = c.plazo_meses;
        document.getElementById("fjPlazoUnit").value = "months";   // el crédito se guarda en meses
        document.getElementById("fjTasa").value = c.tasa || 0;
        document.getElementById("fjTipoTasa").value = c.tipo_tasa || "Efectiva";
        document.getElementById("fjPeriodoTasa").value = c.periodo_tasa || "Anual";
        document.getElementById("fjSeguro").value = c.seguro || "";
        document.getElementById("fjAbonoFijo").value = c.abono_fijo || "";
        document.getElementById("fjMesInicio").value = c.mes_inicio || "";
        document.getElementById("fjCuota").value = c.cuota || "";
        document.getElementById("fjRecibeAbono").checked = c.recibe_abono !== false;
        document.getElementById("fjAddBtn").textContent = "Guardar cambios";
        document.getElementById("fjCancelEditBtn").hidden = false;
        document.getElementById("fjNombre").scrollIntoView({ behavior: "smooth", block: "center" });
    }

    function guardarFlujo() {
        try {
            localStorage.setItem(FLUJO_STORE, JSON.stringify({
                creditos: flujoCreditos,
                fecha_inicio: document.getElementById("fjFechaInicio").value,
                pct: document.getElementById("fjPctReinversion").value,
                vara: gv("fjVara"),
            }));
        } catch (e) { /* modo privado o sin espacio: seguimos sin persistir */ }
    }

    function cargarFlujo() {
        try {
            const d = JSON.parse(localStorage.getItem(FLUJO_STORE) || "null");
            if (!d) return;
            flujoCreditos = Array.isArray(d.creditos) ? d.creditos : [];
            if (d.fecha_inicio) document.getElementById("fjFechaInicio").value = d.fecha_inicio;
            if (d.pct) document.getElementById("fjPctReinversion").value = d.pct;
            if (d.vara) document.getElementById("fjVara").value = d.vara;
        } catch (e) { flujoCreditos = []; }
    }

    function refrescarFlujoUI() {
        displayFlujoCreditos();
        displayPuntualesSelect();
        displayPuntualesTabla();
        guardarFlujo();
    }

    function displayPuntualesSelect() {
        const sel = document.getElementById("fjPuntCredito");
        const previo = sel.value;
        sel.innerHTML = flujoCreditos
            .map((c, i) => `<option value="${i}">${c.nombre}</option>`).join("");
        if (previo && flujoCreditos[previo]) sel.value = previo;
    }

    function displayPuntualesTabla() {
        const tbody = document.querySelector("#fjPuntTable tbody");
        const tfoot = document.querySelector("#fjPuntTable tfoot");
        tbody.innerHTML = "";
        tfoot.innerHTML = "";
        let total = 0, cuantos = 0;

        flujoCreditos.forEach((c, i) => {
            Object.entries(c.abonos_puntuales || {})
                .sort((a, b) => a[0].localeCompare(b[0]))
                .forEach(([fecha, monto]) => {
                    total += monto; cuantos += 1;
                    const row = tbody.insertRow();
                    row.insertCell(0).textContent = c.nombre;
                    row.insertCell(1).textContent = fmtMesAnno(fecha);
                    row.insertCell(2).textContent = fmtMoney(monto);
                    const b = document.createElement("button");
                    b.className = "btn-remove-abono";
                    b.textContent = "Eliminar";
                    b.addEventListener("click", () => {
                        delete flujoCreditos[i].abonos_puntuales[fecha];
                        refrescarFlujoUI();
                    });
                    row.insertCell(3).appendChild(b);
                });
        });

        if (cuantos) {
            const r = tfoot.insertRow();
            ["", `Total (${cuantos})`, fmtMoney(total), ""].forEach((t, k) => {
                r.insertCell(k).textContent = t;
            });
        }
    }

    function displayFlujoCreditos() {
        const tbody = document.querySelector("#fjTable tbody");
        const tfoot = document.querySelector("#fjTable tfoot");
        tbody.innerHTML = "";
        tfoot.innerHTML = "";

        flujoCreditos.forEach((c, i) => {
            const row = tbody.insertRow();
            row.insertCell(0).textContent = i + 1;

            const celdaNombre = row.insertCell(1);
            celdaNombre.textContent = c.nombre;
            if (c.mes_inicio) {   // desembolso futuro: hoy todavía no existe
                const badge = document.createElement("span");
                badge.className = "badge-futuro";
                badge.textContent = `desde ${fmtMesAnno(c.mes_inicio)}`;
                celdaNombre.appendChild(badge);
            }
            if (c.recibe_abono === false) {   // excluido de la cascada
                const badge = document.createElement("span");
                badge.className = "badge-sinabono";
                badge.textContent = "sin abonos";
                celdaNombre.appendChild(badge);
            }

            row.insertCell(2).textContent = fmtMoney(c.saldo);

            const celdaTasa = row.insertCell(3);
            if (c.tasa > 0) {
                // se muestran las dos tasas ya convertidas, sin importar cómo la digitó
                const ea = convertirTasa(c.tasa, c.tipo_tasa, c.periodo_tasa, "Anual");
                const mv = convertirTasa(c.tasa, c.tipo_tasa, c.periodo_tasa, "Mensual");
                celdaTasa.innerHTML = `${fmtPct(ea)} <span class="tasa-sub">E.A.</span>`
                    + `<br><span class="tasa-mv">${fmtPct(mv)} <span class="tasa-sub">M.V.</span></span>`;
            } else {
                celdaTasa.textContent = "sin interés";
            }

            const plazoReal = plazoEstimado(c);
            row.insertCell(4).textContent = plazoReal ? `${plazoReal} m` : `${c.plazo_meses} m`;

            const celdaCuota = row.insertCell(5);
            // lo que pagas al mes = cuota + seguro (igual que la tabla y el Total de abajo)
            celdaCuota.textContent = fmtMoney(cuotaEstimada(c) + (c.seguro || 0));
            if (c.seguro > 0) {   // se avisa que ese número ya trae el seguro
                const marca = document.createElement("span");
                marca.className = "tasa-sub";
                marca.textContent = " c/seguro";
                celdaCuota.appendChild(marca);
            }
            if (c.cuota > 0) {   // la cuota base la fijó el usuario, no se calculó
                const marca = document.createElement("span");
                marca.className = "tasa-sub";
                marca.textContent = " fija";
                celdaCuota.appendChild(marca);
            }

            const nAbonos = Object.keys(c.abonos_puntuales || {}).length;
            row.insertCell(6).textContent = nAbonos ? `${nAbonos}` : "—";

            // Reordenar arrastrando (los ▲▼ quedan solo como respaldo táctil)
            row.draggable = true;
            row.classList.add("fila-arrastrable");
            row.addEventListener("dragstart", (e) => {
                fjArrastrando = i;
                row.classList.add("arrastrando");
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", String(i));   // Firefox lo exige
            });
            row.addEventListener("dragend", () => {
                fjArrastrando = null;
                document.querySelectorAll("#fjTable tbody tr")
                    .forEach((r) => r.classList.remove("arrastrando", "sobre"));
            });
            row.addEventListener("dragover", (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (fjArrastrando !== null && fjArrastrando !== i) row.classList.add("sobre");
            });
            row.addEventListener("dragleave", () => row.classList.remove("sobre"));
            row.addEventListener("drop", (e) => {
                e.preventDefault();
                row.classList.remove("sobre");
                const desde = fjArrastrando !== null
                    ? fjArrastrando
                    : Number.parseInt(e.dataTransfer.getData("text/plain"), 10);
                if (Number.isNaN(desde) || desde === i) return;
                const [movido] = flujoCreditos.splice(desde, 1);
                flujoCreditos.splice(i, 0, movido);
                fjArrastrando = null;
                refrescarFlujoUI();
            });

            const celdaOrden = row.insertCell(7);
            const grupoBtns = document.createElement("span");
            grupoBtns.className = "orden-btns";
            [["▲", -1], ["▼", 1]].forEach(([txt, delta]) => {
                const b = document.createElement("button");
                b.className = "btn-remove-abono";
                b.textContent = txt;
                b.addEventListener("click", () => {
                    const j = i + delta;
                    if (j < 0 || j >= flujoCreditos.length) return;
                    [flujoCreditos[i], flujoCreditos[j]] = [flujoCreditos[j], flujoCreditos[i]];
                    refrescarFlujoUI();
                });
                grupoBtns.appendChild(b);
            });
            celdaOrden.appendChild(grupoBtns);

            const acciones = row.insertCell(8);

            // Tabla de condiciones: colapsada, se despliega bajo la fila solo si la piden.
            // Aquí todavía no hay escenario escogido, así que solo puede mostrar el
            // crédito aislado — se rotula explícitamente para no chocar con los resultados.
            const ver = document.createElement("button");
            ver.className = "btn-remove-abono";
            ver.textContent = "Ver tabla";
            ver.addEventListener("click", async () => {
                const sig = row.nextElementSibling;
                if (sig && sig.classList.contains("fila-tabla")) { sig.remove(); return; }
                tbody.querySelectorAll(".fila-tabla").forEach((el) => el.remove());
                ver.textContent = "Cargando…";
                try {
                    const d = await postJson("/flujo/credito", {
                        creditos: flujoCreditos,
                        indice: i,
                        fecha_inicio: document.getElementById("fjFechaInicio").value,
                    });
                    // sectionRowIndex (no rowIndex): insertRow indexa dentro del tbody
                    const panel = tbody.insertRow(row.sectionRowIndex + 1);
                    panel.className = "fila-tabla";
                    const celda = panel.insertCell(0);
                    celda.colSpan = 9;
                    celda.innerHTML = `
                        <p class="section-eyebrow">${d.nombre} — el crédito por su cuenta</p>
                        <p class="hint">Cuota <strong>${fmtMoney(d.solo.cuota)}</strong> ·
                            termina en <strong>${fmtMesAnno(d.solo.anno_mes_fin)}</strong> ·
                            intereses <strong>${fmtMoney(d.solo.total_intereses)}</strong>.
                            Incluye tus abonos dirigidos, pero <strong>no la cascada</strong> de los
                            otros créditos. Dentro de tu plan termina antes: eso lo ves en los resultados.</p>
                        ${tablaAmortHtml(d.solo.tabla, d.seguro > 0)}`;
                    const csv = document.createElement("button");
                    csv.className = "btn-remove-abono";
                    csv.textContent = "Descargar CSV";
                    csv.addEventListener("click", () => descargarArchivo(
                        `${d.nombre}-condiciones.csv`, tablaAmortCsv(d.solo.tabla), "text/csv"));
                    celda.appendChild(csv);
                } catch (e) {
                    alert("No se pudo armar la tabla: " + e.message);
                } finally {
                    ver.textContent = "Ver tabla";
                }
            });
            acciones.appendChild(ver);

            const edit = document.createElement("button");
            edit.className = "btn-remove-abono";
            edit.textContent = "Editar";
            edit.addEventListener("click", () => { fjEntrarEdicion(c); displayFlujoCreditos(); });
            acciones.appendChild(edit);

            const del = document.createElement("button");
            del.className = "btn-remove-abono";
            del.textContent = "Eliminar";
            del.addEventListener("click", () => {
                if (fjEditando === c) fjSalirEdicion();
                flujoCreditos.splice(i, 1);
                refrescarFlujoUI();
            });
            acciones.appendChild(del);

            if (fjEditando === c) row.classList.add("fila-editando");
        });

        if (flujoCreditos.length) {
            const saldoTot = flujoCreditos.reduce((a, c) => a + c.saldo, 0);
            const cuotaTot = flujoCreditos.reduce((a, c) => a + cuotaEstimada(c) + (c.seguro || 0), 0);
            // el total incluye los créditos futuros: se avisa para que no se lea como "lo que pago hoy"
            const futuros = flujoCreditos.filter((c) => c.mes_inicio).length;
            const etiqueta = futuros
                ? `Total (${flujoCreditos.length}, ${futuros} por desembolsar)`
                : `Total (${flujoCreditos.length})`;
            const r = tfoot.insertRow();
            ["", etiqueta, fmtMoney(saldoTot), "", "", fmtMoney(cuotaTot), "", "", ""]
                .forEach((t, k) => { r.insertCell(k).textContent = t; });
        }
    }

    document.getElementById("fjAddBtn").addEventListener("click", () => {
        const saldo = g("fjSaldo");
        const plazoRaw = g("fjPlazo");
        if (!(saldo > 0) || !(plazoRaw > 0)) {
            alert("Ingresa un saldo y un plazo válidos.");
            return;
        }
        const mesInicio = document.getElementById("fjMesInicio").value.trim();
        if (mesInicio && !esAnnoMesValido(mesInicio)) {
            alert("El mes de desembolso debe tener formato AAAAMM (ej. 202801). Déjalo vacío si ya tienes el crédito.");
            return;
        }
        const plazo = gv("fjPlazoUnit") === "years" ? plazoRaw * 12 : plazoRaw;
        const idx = fjEditando ? flujoCreditos.indexOf(fjEditando) : -1;
        const editando = idx >= 0;
        const credito = {
            nombre: document.getElementById("fjNombre").value.trim()
                || (editando ? fjEditando.nombre : `Crédito ${flujoCreditos.length + 1}`),
            saldo,
            tasa: g("fjTasa") || 0,
            tipo_tasa: gv("fjTipoTasa"),
            periodo_tasa: gv("fjPeriodoTasa"),
            plazo_meses: Math.round(plazo),
            cuota: g("fjCuota") || 0,        // 0 = se calcula sola
            seguro: g("fjSeguro") || 0,
            abono_fijo: g("fjAbonoFijo") || 0,
            mes_inicio: mesInicio || null,   // null = ya lo tienes hoy
            recibe_abono: document.getElementById("fjRecibeAbono").checked,
            // al editar se conservan los abonos puntuales: se administran en su propia tabla
            abonos_puntuales: editando ? (fjEditando.abonos_puntuales || {}) : {},
        };
        // con cuota fija, el plazo se deriva; si no cubre el interés no se pagaría nunca
        if (credito.cuota > 0 && plazoEstimado(credito) === null) {
            alert("Esa cuota fija no cubre ni el interés del primer mes; así el saldo nunca bajaría. "
                + "Súbela, o déjala vacía para que se calcule sola.");
            return;
        }
        if (editando) {
            flujoCreditos[idx] = credito;   // se queda en el mismo puesto del orden
        } else {
            flujoCreditos.push(credito);
        }
        fjSalirEdicion();
        refrescarFlujoUI();
    });

    document.getElementById("fjCancelEditBtn").addEventListener("click", fjSalirEdicion);

    // Abonos puntuales: se agregan a un crédito ya creado
    document.getElementById("fjPuntAddBtn").addEventListener("click", () => {
        const idx = Number.parseInt(document.getElementById("fjPuntCredito").value, 10);
        const fecha = document.getElementById("fjPuntFecha").value.trim();
        const monto = g("fjPuntMonto");
        if (Number.isNaN(idx) || !flujoCreditos[idx]) {
            alert("Primero agrega un crédito.");
            return;
        }
        if (!esAnnoMesValido(fecha)) {
            alert("El mes debe tener formato AAAAMM (ej. 202701).");
            return;
        }
        if (!(monto > 0)) {
            alert("Ingresa un monto mayor a 0.");
            return;
        }
        flujoCreditos[idx].abonos_puntuales = flujoCreditos[idx].abonos_puntuales || {};
        flujoCreditos[idx].abonos_puntuales[fecha] = monto;   // si ya había ese mes, lo reemplaza
        document.getElementById("fjPuntFecha").value = "";
        document.getElementById("fjPuntMonto").value = "";
        refrescarFlujoUI();
    });

    document.getElementById("fjLimpiarBtn").addEventListener("click", () => {
        if (!confirm("¿Borrar todos los créditos guardados en este navegador?")) return;
        fjSalirEdicion();
        flujoCreditos = [];
        try { localStorage.removeItem(FLUJO_STORE); } catch (e) {}
        refrescarFlujoUI();
    });

    // ── Carga / descarga de archivo ──────────────────────────────────────────
    const CSV_COLS = ["nombre", "saldo", "tasa", "tipo_tasa", "periodo_tasa", "plazo_meses",
                      "cuota", "seguro", "abono_fijo", "mes_inicio", "recibe_abono", "abonos_puntuales"];

    // Acepta formatos colombianos: "240.000.000" -> 240000000 · "12,5" -> 12.5
    function parseNumeroCsv(txt) {
        let s = String(txt ?? "").replace(/[^\d,.\-]/g, "").trim();
        if (!s) return 0;
        const coma = s.includes(","), punto = s.includes(".");
        if (coma && punto) {
            // el separador decimal es el último que aparezca
            s = s.lastIndexOf(",") > s.lastIndexOf(".")
                ? s.replace(/\./g, "").replace(",", ".")
                : s.replace(/,/g, "");
        } else if (coma) {
            s = s.replace(",", ".");
        } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
            s = s.replace(/\./g, "");            // puntos de miles
        }
        const n = Number.parseFloat(s);
        return Number.isFinite(n) ? n : 0;
    }

    function parsePuntualesCampo(txt) {
        const out = {};
        String(txt || "").split(/[|;]/).forEach((par) => {
            const [f, m] = par.split(":").map((s) => (s || "").trim());
            const monto = parseNumeroCsv(m);
            if (/^\d{6}$/.test(f) && monto > 0) out[f] = monto;
        });
        return out;
    }

    function parseCSV(texto) {
        const lineas = texto.split(/\r?\n/).filter((l) => l.trim());
        if (!lineas.length) throw new Error("el archivo está vacío");
        const sep = lineas[0].includes(";") && !lineas[0].includes(",") ? ";" : ",";
        const cab = lineas[0].split(sep).map((h) => h.trim().toLowerCase());
        if (!cab.includes("saldo") || !cab.includes("plazo_meses")) {
            throw new Error("faltan las columnas 'saldo' y 'plazo_meses'");
        }
        return lineas.slice(1).map((linea, i) => {
            const v = linea.split(sep).map((x) => x.trim());
            const get = (col) => { const k = cab.indexOf(col); return k >= 0 ? (v[k] || "") : ""; };
            return {
                nombre: get("nombre") || `Crédito ${i + 1}`,
                saldo: parseNumeroCsv(get("saldo")),
                tasa: parseNumeroCsv(get("tasa")),
                tipo_tasa: get("tipo_tasa") || "Efectiva",
                periodo_tasa: get("periodo_tasa") || "Anual",
                plazo_meses: Math.round(parseNumeroCsv(get("plazo_meses"))),
                cuota: parseNumeroCsv(get("cuota")),   // 0 = se calcula sola
                seguro: parseNumeroCsv(get("seguro")),
                abono_fijo: parseNumeroCsv(get("abono_fijo")),
                // no pasa por parseNumeroCsv: es una fecha AAAAMM, no un monto
                mes_inicio: /^\d{6}$/.test(get("mes_inicio")) ? get("mes_inicio") : null,
                // "no"/"false"/"0" -> no recibe; vacío o cualquier otra cosa -> sí (default)
                recibe_abono: !/^(no|false|0)$/i.test(get("recibe_abono").trim()),
                abonos_puntuales: parsePuntualesCampo(get("abonos_puntuales")),
            };
        });
    }

    document.getElementById("fjExportBtn").addEventListener("click", () => {
        if (!flujoCreditos.length) { alert("No hay créditos para descargar."); return; }
        descargarArchivo("mis-creditos.json", JSON.stringify({
            creditos: flujoCreditos,
            fecha_inicio: document.getElementById("fjFechaInicio").value,
            pct: document.getElementById("fjPctReinversion").value,
            vara: gv("fjVara"),
        }, null, 2), "application/json");
    });

    document.getElementById("fjPlantillaBtn").addEventListener("click", () => {
        descargarArchivo("plantilla-creditos.csv", [
            CSV_COLS.join(","),
            "Faro,240000000,12,Efectiva,Anual,240,,0,0,,,",
            "Terrabonga,42739600,0,Efectiva,Anual,18,,0,0,,,202701:35000000|202803:50000000",
            "Casa nueva,50000000,11,Efectiva,Anual,24,,0,0,202801,,",
            "Sierra,32800000,0,Efectiva,Anual,17,1400000,0,0,,no,",
        ].join("\n"), "text/csv");
    });

    document.getElementById("fjArchivo").addEventListener("change", (ev) => {
        const file = ev.target.files && ev.target.files[0];
        if (!file) return;
        const lector = new FileReader();
        lector.onload = () => {
            try {
                const txt = String(lector.result);
                let cargados;
                if (file.name.toLowerCase().endsWith(".json")) {
                    const d = JSON.parse(txt);
                    cargados = Array.isArray(d) ? d : d.creditos;
                    if (!Array.isArray(cargados)) throw new Error("el JSON no trae una lista de créditos");
                    if (d.fecha_inicio) document.getElementById("fjFechaInicio").value = d.fecha_inicio;
                    if (d.pct) document.getElementById("fjPctReinversion").value = d.pct;
                    if (d.vara) document.getElementById("fjVara").value = d.vara;
                } else {
                    cargados = parseCSV(txt);
                }
                const validos = cargados
                    .map((c, i) => ({
                        nombre: c.nombre || `Crédito ${i + 1}`,
                        saldo: Number(c.saldo) || 0,
                        tasa: Number(c.tasa) || 0,
                        tipo_tasa: c.tipo_tasa || "Efectiva",
                        periodo_tasa: c.periodo_tasa || "Anual",
                        plazo_meses: Math.round(Number(c.plazo_meses) || 0),
                        seguro: Number(c.seguro) || 0,
                        abono_fijo: Number(c.abono_fijo) || 0,
                        abonos_puntuales: c.abonos_puntuales || {},
                    }))
                    .filter((c) => c.saldo > 0 && c.plazo_meses > 0);
                if (!validos.length) throw new Error("no se encontró ningún crédito válido");
                const descartados = cargados.length - validos.length;
                fjSalirEdicion();     // el archivo reemplaza la lista: la edición ya no aplica
                flujoCreditos = validos;
                refrescarFlujoUI();
                alert(`Se cargaron ${validos.length} créditos.` +
                      (descartados ? ` Se ignoraron ${descartados} filas sin saldo o plazo válidos.` : ""));
            } catch (e) {
                alert("No se pudo leer el archivo: " + e.message);
            }
            ev.target.value = "";
        };
        lector.readAsText(file);
    });

    // Restaurar lo guardado; si no hay fecha, arrancar en el mes actual
    cargarFlujo();
    if (!document.getElementById("fjFechaInicio").value) {
        const hoy = new Date();
        document.getElementById("fjFechaInicio").value =
            `${hoy.getFullYear()}${String(hoy.getMonth() + 1).padStart(2, "0")}`;
    }
    ["fjFechaInicio", "fjPctReinversion", "fjVara"].forEach((id) =>
        document.getElementById(id).addEventListener("change", guardarFlujo));
    refrescarFlujoUI();

    document.getElementById("calcularFlujoBtn").addEventListener("click", () => {
        if (!flujoCreditos.length) {
            alert("Agrega al menos un crédito.");
            return;
        }
        const fecha = document.getElementById("fjFechaInicio").value.trim();
        if (!/^\d{6}$/.test(fecha)) {
            alert("El mes de inicio debe tener formato AAAAMM (ej. 202601).");
            return;
        }
        postAndRender("/flujo", {
            creditos: flujoCreditos,
            fecha_inicio: fecha,
            pct_reinversion: g("fjPctReinversion") || 100,
            orden_manual: flujoCreditos.map((_, i) => i),   // el orden de la lista
            vara: gv("fjVara"),
        }, displayFlujo, "flujoResultCard");
    });

    // ── Sub-modo Crédito: Amortización / Comparador ──────────────────────────
    const CREDITO_MODOS = [
        { key: "amortizacion", btn: "crModeAmortizacion", panel: "crPanelAmortizacion" },
        { key: "comparador", btn: "crModeComparador", panel: "crPanelComparador" },
        { key: "abonar-invertir", btn: "crModeAbonarInvertir", panel: "crPanelAbonarInvertir" },
        { key: "flujo", btn: "crModeFlujo", panel: "crPanelFlujo" },
    ].map((m) => ({ ...m, btnEl: document.getElementById(m.btn), panelEl: document.getElementById(m.panel) }));
    function setCreditoModo(key) {
        CREDITO_MODOS.forEach((m) => {
            const activo = m.key === key;
            m.btnEl.classList.toggle("active", activo);
            m.btnEl.setAttribute("aria-selected", String(activo));
            m.panelEl.classList.toggle("hidden", !activo);
        });
    }
    CREDITO_MODOS.forEach((m) => m.btnEl.addEventListener("click", () => { setCreditoModo(m.key); guardarNav("credito", m.key); }));

    // Restaura la última pantalla vista (los 4 setters ya están definidos).
    // Se valida la clave para no dejar la vista en blanco si el guardado quedó viejo.
    (function restaurarNav() {
        const n = leerNav();
        const aplica = (grupo, setter, key) => {
            if (key && grupo.some((m) => m.key === key)) setter(key);
        };
        aplica(CREDITO_MODOS, setCreditoModo, n.credito);
        aplica(AHORRO_MODOS, setAhorroModo, n.ahorro);
        aplica(INMO_MODOS, setInmoModo, n.inmobiliaria);
        aplica(TABS, setTab, n.tab);   // el tab de último: deja visible el panel correcto
    })();

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
    let aiModo = "original";
    const aiFieldsOriginal = document.getElementById("aiFieldsOriginal");
    const aiFieldsSaldo = document.getElementById("aiFieldsSaldo");
    const aiModeOriginal = document.getElementById("aiModeOriginal");
    const aiModeSaldo = document.getElementById("aiModeSaldo");
    function setAiModo(modo) {
        aiModo = modo;
        const esOriginal = modo === "original";
        aiModeOriginal.classList.toggle("active", esOriginal);
        aiModeSaldo.classList.toggle("active", !esOriginal);
        aiModeOriginal.setAttribute("aria-selected", String(esOriginal));
        aiModeSaldo.setAttribute("aria-selected", String(!esOriginal));
        aiFieldsOriginal.classList.toggle("hidden", !esOriginal);
        aiFieldsSaldo.classList.toggle("hidden", esOriginal);
    }
    aiModeOriginal.addEventListener("click", () => setAiModo("original"));
    aiModeSaldo.addEventListener("click", () => setAiModo("saldo"));

    document.getElementById("calcularAbonarInvertirBtn").addEventListener("click", () => {
        const data = {
            modo: aiModo,
            tasa_credito: g("aiTasaCredito"),
            tc_type: gv("aiTcType"),
            tc_period: gv("aiTcPeriod"),
            monto_extra: g("aiMonto"),
            cdt_ea: g("aiCdt") || 0,
            retencion_cdt_pct: g("aiRetencion") || 0,
        };
        if (aiModo === "original") {
            data.monto_inicial = g("aiMontoInicial");
            data.plazo_total_meses = gv("aiPlazoTotalUnit") === "years" ? g("aiPlazoTotal") * 12 : g("aiPlazoTotal");
            data.cuotas_pagadas = g("aiCuotasPagadas") || 0;
        } else {
            data.saldo = g("aiSaldo");
            data.plazo_restante_meses = gv("aiPlazoUnit") === "years" ? g("aiPlazo") * 12 : g("aiPlazo");
        }
        postAndRender("/decisiones/abonar-vs-invertir", data, displayAbonarInvertir, "abonarInvertirResultCard");
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


// ── Render: meta de ahorro (bruto) ────────────────────────────────────────────
function displayMeta(r) {
    const card = document.getElementById("metaResultCard");
    card.classList.remove("hidden");

    if (r.modo === "tiempo" && r.alcanzable === false) {
        card.innerHTML = `
            <h2>Tu <em>meta</em></h2>
            <p class="resumen-narrativa">
                Con ese aporte y esa tasa no llegas a la meta de
                <strong>${fmtMoney(r.meta_objetivo)}</strong> — sube el aporte o la tasa.
            </p>`;
        return;
    }
    if (r.ya_alcanzada) {
        card.innerHTML = `
            <h2>Tu <em>meta</em></h2>
            <p class="resumen-narrativa">
                Con tu monto inicial de <strong>${fmtMoney(r.monto_inicial)}</strong> ya alcanzas la
                meta de <strong>${fmtMoney(r.meta_objetivo)}</strong> — no necesitas aportar nada más.
            </p>`;
        return;
    }

    const inicialTxt = r.monto_inicial > 0 ? ` (más <strong>${fmtMoney(r.monto_inicial)}</strong> inicial)` : "";

    if (r.modo === "tiempo") {
        card.innerHTML = `
            <h2>Tu <em>meta</em></h2>
            <p class="resumen-narrativa">
                Aportando <strong>${fmtMoney(r.aporte_mensual)}</strong> al mes${inicialTxt} al
                ${fmtPct(r.tasa_ea)} E.A., llegas a <strong>${fmtMoney(r.meta_objetivo)}</strong> en
                <strong>${r.meses} meses</strong> (${r.anos} años).
            </p>
            <div class="kpi-grid">
                ${kpiHtml("Tardas", `${r.meses} meses`, `${r.anos} años`, "good")}
                ${kpiHtml("Meta", fmtMoney(r.meta_objetivo))}
                ${kpiHtml("Aporte mensual", fmtMoney(r.aporte_mensual))}
                ${kpiHtml("Total que aportas", fmtMoney(r.total_aportado), "de tu bolsillo")}
                ${kpiHtml("Valor final", fmtMoney(r.valor_final), "bruto")}
                ${kpiHtml("Tasa E.A.", fmtPct(r.tasa_ea))}
            </div>`;
        return;
    }

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
            ${kpiHtml("Lo pone el interés", fmtMoney(r.interes), "", "good")}
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


// ── Flujo de créditos: cuota estimada en el cliente (preview de la lista) ─────
function tasaMensual(c) {
    if (!c.tasa || c.tasa <= 0) return 0;
    return convertirTasa(c.tasa, c.tipo_tasa, c.periodo_tasa, "Mensual") / 100;
}

function cuotaEstimada(c) {
    if (c.cuota > 0) return c.cuota;        // el usuario fijó su cuota
    const n = c.plazo_meses;
    if (!n) return 0;
    const im = tasaMensual(c);
    if (im === 0) return c.saldo / n;
    return c.saldo * im * Math.pow(1 + im, n) / (Math.pow(1 + im, n) - 1);
}

// Plazo real: con cuota fija el plazo se deriva de ella, no es el que se digitó
function plazoEstimado(c) {
    if (!(c.cuota > 0)) return c.plazo_meses;
    const im = tasaMensual(c);
    if (im === 0) return Math.ceil(c.saldo / c.cuota - 1e-9);
    if (c.cuota <= c.saldo * im) return null;   // no cubre el interés
    return Math.ceil(-Math.log(1 - c.saldo * im / c.cuota) / Math.log(1 + im) - 1e-9);
}


// ── Render: flujo de créditos ─────────────────────────────────────────────────
function displayFlujo(r) {
    const card = document.getElementById("flujoResultCard");
    card.classList.remove("hidden");
    const esc = r.escenarios;
    const base = esc[0];
    const sug = esc.find((e) => e.clave === "sugerencia");
    // por defecto se muestra "Tu orden" si existe; si no, la Sugerencia
    const claveInicial = esc.some((e) => e.clave === "manual") ? "manual" : "sugerencia";

    const filas = esc.map((e) => `
        <tr class="${e.clave === "sugerencia" ? "row-abono" : ""}">
            <td>${e.nombre}${e.metodo ? ` <span class="hint">(${e.metodo})</span>` : ""}</td>
            <td>${e.anno_mes_libertad ? fmtMesAnno(e.anno_mes_libertad) : "—"}</td>
            <td>${e.meses} meses</td>
            <td>${fmtMoney(e.total_intereses)}</td>
            <td>${fmtMoney(e.ahorro_intereses)}</td>
            <td>${fmtMoney(e.flujo_ganado)}</td>
        </tr>`).join("");

    card.innerHTML = `
        <h2>Tu <em>flujo de créditos</em></h2>
        <p class="resumen-narrativa">
            Con la cascada quedas libre en <strong>${fmtMesAnno(sug.anno_mes_libertad)}</strong>
            (${sug.meses} meses) en vez de ${base.anno_mes_libertad ? fmtMesAnno(base.anno_mes_libertad) : "—"}:
            <strong>${sug.meses_ahorrados} meses antes</strong> y
            <strong>${fmtMoney(sug.ahorro_intereses)}</strong> menos en intereses.
            Desde ese mes dispones de <strong>${fmtMoney(sug.flujo_mensual_liberado)}</strong> al mes.
        </p>
        <div class="kpi-grid">
            ${kpiHtml("Libre de deudas", fmtMesAnno(sug.anno_mes_libertad), `${sug.meses} meses`, "good")}
            ${kpiHtml("Dispones al mes", fmtMoney(sug.flujo_mensual_liberado), "desde esa fecha", "good")}
            ${kpiHtml("Ahorro en intereses", fmtMoney(sug.ahorro_intereses), "vs. sin cascada", "good")}
            ${kpiHtml("Meses que ahorras", `${sug.meses_ahorrados}`, "vs. sin cascada")}
        </div>

        <h3>Comparación de estrategias</h3>
        <div class="table-scroll">
            <table class="amort-table comparador-table">
                <thead><tr>
                    <th>Estrategia</th><th>Libre</th><th>Plazo</th>
                    <th>Intereses</th><th>Ahorro</th><th>Flujo ganado</th>
                </tr></thead>
                <tbody>${filas}</tbody>
            </table>
        </div>

        <h3>Orden sugerido</h3>
        <p class="resumen-narrativa">${sug.orden_nombres.join(" &rarr; ")}</p>

        <h3>Ver el mes a mes de</h3>
        <div class="chips-credito" id="fjEscenarioSel">
            ${esc.map((e) => `<button type="button" class="chip-credito${e.clave === claveInicial ? " activo" : ""}"
                data-clave="${e.clave}">${e.nombre}</button>`).join("")}
        </div>`;

    const chipsEsc = card.querySelectorAll("#fjEscenarioSel .chip-credito");
    chipsEsc.forEach((b) => b.addEventListener("click", () => {
        chipsEsc.forEach((x) => x.classList.toggle("activo", x === b));
        renderFlujoDetalle(r, b.dataset.clave);
        cargarTablaCredito(r, b.dataset.clave, fjCreditoVisible, fjModoTabla);   // conserva el crédito visible
    }));
    renderFlujoDetalle(r, claveInicial);
    cargarTablaCredito(r, claveInicial, null, fjModoTabla);   // null = el primero de la cascada
}


// ── Render: tabla de amortización de un crédito dentro del plan ───────────────
let fjCreditoVisible = 0;            // índice del crédito que se está mostrando
let fjModoTabla = "en_plan";         // "solo" | "en_plan"
let fjUltimoResultado = null;        // para que las flechas del teclado sepan qué mover
let fjUltimaClave = null;
let fjOrdenActual = [];              // orden de la cascada del escenario visible

// ← → mueven entre créditos siguiendo la cascada, pero no si estás escribiendo en un campo
document.addEventListener("keydown", (ev) => {
    if (ev.key !== "ArrowLeft" && ev.key !== "ArrowRight") return;
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(ev.target.tagName)) return;
    const card = document.getElementById("flujoCreditoCard");
    if (!card || card.classList.contains("hidden")) return;
    const n = fjOrdenActual.length;
    if (n < 2) return;
    ev.preventDefault();
    const salto = ev.key === "ArrowLeft" ? -1 : 1;
    const pos = fjOrdenActual.indexOf(fjCreditoVisible);
    cargarTablaCredito(fjUltimoResultado, fjUltimaClave,
                       fjOrdenActual[(pos + salto + n) % n], fjModoTabla);
});

async function cargarTablaCredito(r, clave, indice, modo) {
    const card = document.getElementById("flujoCreditoCard");
    const esc = r.escenarios.find((e) => e.clave === clave);
    if (!esc || !r.creditos.length) { card.classList.add("hidden"); return; }

    // sin índice se arranca por el primero de la cascada, no por el primero de la lista
    const { secuencia, turno } = ordenParaMostrar(r, esc.orden);
    fjCreditoVisible = (indice === null || indice === undefined || !secuencia.includes(indice))
        ? secuencia[0]
        : indice;
    fjModoTabla = modo;
    fjUltimoResultado = r;
    fjUltimaClave = clave;
    fjOrdenActual = secuencia;
    card.classList.remove("hidden");

    let d;
    try {
        d = await postJson("/flujo/credito", {
            creditos: r.creditos_entrada,
            indice: fjCreditoVisible,
            fecha_inicio: r.fecha_inicio,
            pct_reinversion: r.pct_reinversion,
            orden: esc.orden,
        });
    } catch (e) {
        card.innerHTML = `<p class="section-eyebrow">Detalle por crédito</p>
            <p class="hint">No se pudo armar la tabla: ${e.message}</p>`;
        return;
    }

    const vista = d[modo] || d.solo;
    const solo = d.solo, plan = d.en_plan;
    // La comparación explícita evita que las dos tablas se lean como contradictorias
    const comparacion = (plan && solo.anno_mes_fin && plan.anno_mes_fin)
        ? `Por su cuenta termina en <strong>${fmtMesAnno(solo.anno_mes_fin)}</strong>
           con <strong>${fmtMoney(solo.total_intereses)}</strong> de intereses.
           Dentro de tu plan termina en <strong>${fmtMesAnno(plan.anno_mes_fin)}</strong>
           con <strong>${fmtMoney(plan.total_intereses)}</strong>: la cascada le mete
           <strong>${fmtMoney(plan.total_abonos - solo.total_abonos)}</strong> extra y le ahorra
           <strong>${fmtMoney(solo.total_intereses - plan.total_intereses)}</strong>.`
        : "";

    const chips = secuencia.map((idx) =>
        `<button type="button" class="chip-credito${idx === fjCreditoVisible ? " activo" : ""}"
                 data-i="${idx}"><span class="orden-pos">${turno[idx]}</span> ${r.creditos[idx].nombre}</button>`)
        .join("");

    card.innerHTML = `
        <p class="section-eyebrow">Detalle por crédito — ${esc.nombre}</p>
        <p class="hint">Las pestañas van <strong>en el orden de la cascada</strong>: lo que se libera
            de un crédito pasa al primero que siga vivo a su derecha.</p>
        <div class="selector-credito">
            <button type="button" class="flecha-credito" id="fjCredPrev" aria-label="Crédito anterior">‹</button>
            <div class="chips-credito">${chips}</div>
            <button type="button" class="flecha-credito" id="fjCredNext" aria-label="Crédito siguiente">›</button>
        </div>
        <div class="toggle-tabla">
            <button type="button" class="chip-credito${modo === "solo" ? " activo" : ""}" data-modo="solo">Solo este crédito</button>
            <button type="button" class="chip-credito${modo === "en_plan" ? " activo" : ""}" data-modo="en_plan">Dentro de mi plan</button>
        </div>
        <p class="hint">${comparacion}</p>
        <div class="kpi-grid">
            ${kpiHtml("Cuota", fmtMoney(vista.cuota), d.seguro > 0 ? `+ ${fmtMoney(d.seguro)} de seguro` : "")}
            ${kpiHtml("Termina", vista.anno_mes_fin ? fmtMesAnno(vista.anno_mes_fin) : "—", `${vista.meses} cuotas`)}
            ${kpiHtml("Intereses", fmtMoney(vista.total_intereses))}
            ${kpiHtml("Abonos", fmtMoney(vista.total_abonos),
                      modo === "solo" ? "solo los tuyos" : "tuyos + cascada")}
        </div>
        ${tablaAmortHtml(vista.tabla, d.seguro > 0)}
        <button type="button" class="btn btn-outline" id="fjCredCsv">Descargar CSV</button>`;

    // Las flechas se mueven por el orden en que se ven las pestañas
    const n = secuencia.length;
    const pos = secuencia.indexOf(fjCreditoVisible);
    const irPos = (p) => cargarTablaCredito(r, clave, secuencia[(p + n) % n], fjModoTabla);
    card.querySelectorAll(".chip-credito[data-i]").forEach((b) =>
        b.addEventListener("click", () => cargarTablaCredito(r, clave, Number(b.dataset.i), fjModoTabla)));
    card.querySelectorAll(".chip-credito[data-modo]").forEach((b) =>
        b.addEventListener("click", () => cargarTablaCredito(r, clave, fjCreditoVisible, b.dataset.modo)));
    document.getElementById("fjCredPrev").addEventListener("click", () => irPos(pos - 1));
    document.getElementById("fjCredNext").addEventListener("click", () => irPos(pos + 1));
    document.getElementById("fjCredCsv").addEventListener("click", () => descargarArchivo(
        `${d.nombre}-${modo === "solo" ? "solo" : "en-mi-plan"}.csv`,
        tablaAmortCsv(vista.tabla), "text/csv"));
}


// Orden en que se MUESTRAN los créditos: exactamente el de la cascada del escenario,
// incluidos los que están por desembolsar (aparecen en su turno sugerido, con "·" en
// los meses previos a nacer). El número es la posición en ese orden.
function ordenParaMostrar(r, orden) {
    const turno = {};
    orden.forEach((idx, p) => { turno[idx] = p + 1; });
    return { secuencia: orden.slice(), turno };
}


let fjVistaMesAMes = "saldos";   // "saldos" | "pagos" — qué muestran las columnas por crédito

function renderFlujoDetalle(r, clave) {
    const card = document.getElementById("flujoDetalleCard");
    card.classList.remove("hidden");
    const filas = r.detalle[clave] || [];
    const esc = r.escenarios.find((e) => e.clave === clave);
    const vista = fjVistaMesAMes;   // saldo restante, o lo pagado ese mes

    // Las columnas van en el ORDEN DE LA CASCADA, no en el de la lista de arriba: así se
    // lee de izquierda a derecha quién le pasa la cuota liberada a quién.
    const orden = esc ? esc.orden : r.creditos.map((_, i) => i);
    const hayCascada = clave !== "base";   // en "Sin cascada" no hay orden que numerar
    const { secuencia, turno } = ordenParaMostrar(r, orden);
    const hayFuturos = secuencia.some((i) => r.creditos[i].mes_inicio);
    const cols = secuencia.map((idx) => {
        const c = r.creditos[idx];
        // sin el badge "desde …": ensancha mucho la columna. El "·" en las celdas y la
        // nota de arriba ya avisan que el crédito aún no se ha desembolsado.
        return `<th>${hayCascada ? `<span class="orden-pos">${turno[idx]}</span> ` : ""}${c.nombre}</th>`;
    }).join("");
    const head = `<th>#</th><th>Mes</th>${cols}<th>Pago total</th><th>Liberado</th>`;
    // Celda de cada crédito según la vista: saldo restante o lo pagado ese mes.
    // null = todavía no se desembolsa (·). En saldos, "—" = ya se pagó;
    // en pagos, "—" = ese mes no se le pagó nada (p. ej. el mes del desembolso).
    const celda = (f, idx) => {
        const v = f[vista][idx];
        if (v === null) return `<td class="sin-desembolsar" title="Aún no se ha desembolsado">·</td>`;
        return `<td>${v > 0 ? fmtMoney(v) : "—"}</td>`;
    };
    const body = filas.map((f) => `
        <tr class="${f.liberado > 0 ? "row-abono" : ""}">
            <td>${f.num}</td><td>${f.anno_mes}</td>
            ${secuencia.map((idx) => celda(f, idx)).join("")}
            <td>${fmtMoney(f.pago_total)}</td><td>${fmtMoney(f.liberado)}</td>
        </tr>`).join("");

    const notaCascada = !hayCascada
        ? `Acá cada crédito va por su cuenta: nadie le pasa nada a nadie. Es el escenario contra
           el que se comparan los demás.`
        : `El número es el <strong>turno en la cascada</strong>: lo que se libera de un crédito pasa
           siempre al de menor turno que siga vivo.` + (hayFuturos
           ? ` Un crédito <strong>por desembolsar</strong> aparece en su turno con "·" hasta que nace;
               desde ahí cuenta en la cascada.`
           : ``);
    const notaVista = vista === "saldos"
        ? `Cada columna es el <strong>saldo que aún debes</strong> ese mes, antes de pagar: el último
           mes con saldo es cuando terminas de pagar ese crédito.`
        : `Cada columna es <strong>lo que le pagas</strong> a cada crédito ese mes (cuota + seguro + abonos).
           El mes del desembolso muestra "—": aún no se paga.`;

    card.innerHTML = `
        <p class="section-eyebrow">Mes a mes — ${esc ? esc.nombre : clave}</p>
        <div class="toggle-tabla">
            <button type="button" class="chip-credito${vista === "saldos" ? " activo" : ""}" data-vista="saldos">Saldos</button>
            <button type="button" class="chip-credito${vista === "pagos" ? " activo" : ""}" data-vista="pagos">Pagos</button>
        </div>
        <p class="hint">${notaVista} ${notaCascada}</p>
        <div class="table-scroll">
            <table class="amort-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
        </div>`;

    card.querySelectorAll("[data-vista]").forEach((b) => b.addEventListener("click", () => {
        fjVistaMesAMes = b.dataset.vista;
        renderFlujoDetalle(r, clave);   // re-render conservando el escenario
    }));
}


// ── Render: arrendar vs. comprar ──────────────────────────────────────────────
function displayArrendarComprar(r) {
    const card = document.getElementById("arrendarComprarResultCard");
    card.classList.remove("hidden");
    const ganador = r.conviene_comprar ? "comprar" : "arrendar";
    const breakEven = r.break_even_ano
        ? `Comprar supera a arrendar a partir del <strong>año ${r.break_even_ano}</strong>.`
        : `En 40 años, arrendar e invertir nunca queda por debajo de comprar con estos datos.`;

    card.innerHTML = `
        <h2>Arrendar vs. <em>comprar</em></h2>
        <p class="resumen-narrativa">
            A <strong>${r.horizonte_anos} años</strong> te conviene <strong>${ganador}</strong>:
            comprar te deja <strong>${fmtMoney(r.patrimonio_comprar)}</strong> de patrimonio y
            arrendar (invirtiendo la diferencia) <strong>${fmtMoney(r.patrimonio_arrendar)}</strong>
            — diferencia de <strong>${fmtMoney(r.diferencia)}</strong>. ${breakEven}
        </p>
        <div class="kpi-grid">
            ${kpiHtml("Patrimonio si compras", fmtMoney(r.patrimonio_comprar), "", r.conviene_comprar ? "good" : "")}
            ${kpiHtml("Patrimonio si arriendas", fmtMoney(r.patrimonio_arrendar), "", r.conviene_comprar ? "" : "good")}
            ${kpiHtml("Punto de equilibrio", r.break_even_ano ? `Año ${r.break_even_ano}` : "—", "comprar supera a arrendar", "good")}
            ${kpiHtml("Valor del inmueble", fmtMoney(r.valor_inmueble_final), `en ${r.horizonte_anos} años`)}
            ${kpiHtml("Saldo del crédito", fmtMoney(r.saldo_credito_final), `en ${r.horizonte_anos} años`)}
            ${kpiHtml("Cuota del crédito", fmtMoney(r.cuota_credito))}
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
            Con los mismos <strong>${fmtMoney(r.monto_extra)}</strong> te conviene
            <strong>${ganador}</strong>. Si los abonas, tu crédito termina
            <strong>${r.meses_ahorrados} meses antes</strong> y esas
            <strong>${r.meses_ahorrados} cuotas de ${fmtMoney(r.cuota)}</strong> que dejas de pagar,
            puestas en el CDT, te dejan <strong>${fmtMoney(r.valor_abonar)}</strong>.
            Si en vez de eso los metes al CDT desde ya, te dejan
            <strong>${fmtMoney(r.valor_invertir)}</strong> — diferencia de
            <strong>${fmtMoney(r.diferencia)}</strong> al final del plazo.
        </p>
        <div class="kpi-grid">
            ${kpiHtml("Si abonas", fmtMoney(r.valor_abonar), `las ${r.meses_ahorrados} cuotas liberadas, en el CDT`, r.conviene_abonar ? "good" : "")}
            ${kpiHtml("Si inviertes", fmtMoney(r.valor_invertir), `esos ${fmtMoney(r.monto_extra)} en el CDT`, r.conviene_abonar ? "" : "good")}
            ${kpiHtml("Terminas antes", `${r.meses_ahorrados} meses`, `pagas ${r.nuevo_plazo_meses} en vez de ${r.plazo_restante_meses}`, r.conviene_abonar ? "good" : "")}
            ${kpiHtml("Interés que ahorras", fmtMoney(r.interes_ahorrado), "cuotas liberadas − lo que pusiste")}
            ${kpiHtml("Tasa crédito", fmtPct(r.tasa_credito_ea), "E.A.")}
            ${kpiHtml("CDT neto", fmtPct(r.cdt_neto_ea), "E.A.")}
        </div>
        <p class="hint">Sale lo mismo de tu bolsillo en los dos casos
            (${fmtMoney(r.monto_extra)} + ${r.plazo_restante_meses} cuotas), por eso son comparables.</p>`;
}
