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

    let html = `<h2>Resumen</h2>
        <div class="kpi-grid">
            ${kpi("Cuota mensual", fmtMoney(r.cuota_mensual), seguroSub)}
            ${kpi("Tasa E.A.", fmtPct(r.tasa_ea))}
            ${kpi("Tasa M.V.", fmtPct(r.tasa_mv))}
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
