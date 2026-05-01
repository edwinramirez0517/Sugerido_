// app.js
Chart.register(ChartDataLabels);

let dataBase = [];
let mainTable, skuTable;
let necessityChart, statusChart;
let currentView = 'gerencial'; 

const TODAY = new Date('2026-04-28'); 

// REGLAS LOGÍSTICAS POR DIVISIÓN
const reglasLogisticas = {
    "PASEO": { limiteFantasma: 0, minUrgencia: 1 },
    "HOGAR": { limiteFantasma: 0, minUrgencia: 1 },
    "JUGUETERIA": { limiteFantasma: 0, minUrgencia: 2 },
    "ROPA": { limiteFantasma: 12, minUrgencia: 24 },
    "CALZADO": { limiteFantasma: 12, minUrgencia: 24 },
    "INTERIOR DETALLE": { limiteFantasma: 24, minUrgencia: 48 },
    "DEFAULT": { limiteFantasma: 50, minUrgencia: 100 } 
};

// EXCEPCIONES POR NOMBRE DE GRUPO EXACTO
const excepcionesGrupo = {
    "CARROS DE BATERIA": { limiteFantasma: 0, minUrgencia: 1 },
    "BICICLETAS": { limiteFantasma: 0, minUrgencia: 1 }
};

$(document).ready(function() {
    initUI();
    loadCSVData();
});

function initUI() {
    $('#f_div, #f_cat, #f_grp, #f_age').select2({ theme: 'bootstrap-5', width: '100%', placeholder: "Seleccionar..." });

    mainTable = $('#mainTable').DataTable({
        language: { url: 'https://cdn.datatables.net/plug-ins/1.13.6/i18n/es-ES.json' },
        responsive: true,
        pageLength: 10,
        lengthMenu: [10, 25, 50, 100],
        createdRow: function(row) { $(row).addClass('clickable-row'); }
    });

    skuTable = $('#skuTable').DataTable({
        language: { url: 'https://cdn.datatables.net/plug-ins/1.13.6/i18n/es-ES.json' },
        responsive: true, pageLength: 10
    });

    $('#mainTable tbody').on('click', 'tr', function () {
        let rowData = mainTable.row(this).data();
        if (!rowData) return;
        let groupName = rowData[0].split('<br>')[0].replace(/<b>|<\/b>/g, "").trim();
        let groupData = dataBase.find(d => d.grp === groupName);
        if (groupData) openDrillDown(groupData);
    });

    $('#resetFilters').on('click', function() {
        $('#f_div, #f_cat, #f_grp, #f_age').val(null).trigger('change');
        renderDashboard(dataBase); 
    });
}

// CARGA Y CRUCE DE DATOS
function loadCSVData() {
    Promise.all([
        fetch('sugerido.csv').then(res => res.text()),
        fetch('saldo.csv').then(res => res.text())
    ]).then(([sugeridoText, saldoText]) => {
        // Configuramos PapaParse para usar ";" como delimitador según el análisis de tus archivos
        let sugeridoRaw = Papa.parse(sugeridoText, { header: true, skipEmptyLines: true, delimiter: ";" }).data;
        let saldoRaw = Papa.parse(saldoText, { header: true, skipEmptyLines: true, delimiter: ";" }).data;
        
        let dataMap = {};

        sugeridoRaw.forEach(row => {
            let grpName = (row["Grupo"] || "").trim();
            if(!grpName) return;
            dataMap[grpName] = {
                div: (row["Division"] || "").trim(),
                cat: (row["Categoria"] || "").trim(),
                grp_id: (row["Grupo ID"] || "").trim(),
                grp: grpName,
                s_aec: parseFloat(row["Saldo CDI01"]) || 0,
                s_ds: parseFloat(row["Saldo DSCDI"]) || 0,
                n_aec: parseFloat(row["Necesidad detalle AEC"]) || 0,
                n_may: parseFloat(row["Necesidad mayoreo AEC"]) || 0,
                n_ds: parseFloat(row["Necesidad DS"]) || 0,
                max_age: -1, age_cat: "Sin Dato", skus: []
            };
        });

        saldoRaw.forEach(row => {
            let grpName = (row["Grupo"] || "").trim();
            if(dataMap[grpName]) {
                let dateEC = excelToDate(row["UltFecha_EC"]);
                let dateDS = excelToDate(row["UltFecha_DS"]);
                let d_ec = dateEC ? calcularDias(dateEC) : -1;
                let d_ds = dateDS ? calcularDias(dateDS) : -1;
                let max_age = Math.max(d_ec, d_ds);

                dataMap[grpName].skus.push({
                    cod: (row["Producto"] || "").trim(),
                    estilo: (row["Estilo ID"] || "").trim(),
                    desc: (row["ProdNombre"] || "").trim(),
                    marca: (row["Marca"] || "").trim(),
                    s_aec: parseFloat(row["SaldoUND_EC"]) || 0,
                    s_ds: parseFloat(row["SaldoUND_DS"]) || 0,
                    f_ec: formatearFecha(dateEC),
                    f_ds: formatearFecha(dateDS),
                    max_age: max_age
                });
                if(max_age > dataMap[grpName].max_age) dataMap[grpName].max_age = max_age;
            }
        });

        dataBase = Object.values(dataMap);
        dataBase.forEach(g => { g.age_cat = getAgeCategory(g.max_age); });

        setupFilters();
        renderDashboard(dataBase);
    }).catch(e => console.error("Error cargando archivos:", e));
}

function renderDashboard(data) {
    mainTable.clear();
    let totalSaldo = 0, totalNec = 0;
    let kpi = { m1: 0, m2: 0, m3: 0, m4: 0 }; 
    let divSummary = {};

    data.forEach(row => {
        let saldo = row.s_aec + row.s_ds;
        let nec = row.n_aec + row.n_may + row.n_ds;
        totalSaldo += saldo; totalNec += nec;
        if(!divSummary[row.div]) divSummary[row.div] = 0;
        divSummary[row.div] += nec;

        let col7, col8;
        if (currentView === 'gerencial') {
            let cobVal = nec > 0 ? (saldo / nec) * 100 : (saldo > 0 ? 999 : 100);
            col7 = nec > 0 ? cobVal.toFixed(1) + '%' : '> 100%';
            if (nec === 0 && saldo > 0) { col8 = label('Sano', 'bg-verde'); kpi.m3++; }
            else if (cobVal < 50) { col8 = label('Comprar Urgente', 'bg-rojo'); kpi.m1++; }
            else if (cobVal <= 100) { col8 = label('En Tiempo', 'bg-amarillo'); kpi.m2++; }
            else { col8 = label('Sano', 'bg-verde'); kpi.m3++; }
        } else {
            let surtir = Math.min(saldo, nec);
            let falta = nec - saldo;
            col7 = `<b>📦 ${surtir}</b>${falta > 0 ? `<br><small class='text-danger'>Faltan: ${falta}</small>` : ''}`;
            let r = excepcionesGrupo[row.grp] || reglasLogisticas[row.div] || reglasLogisticas["DEFAULT"];
            if (nec === 0) { col8 = label('Completado', 'bg-verde'); kpi.m4++; }
            else if (saldo === 0) { col8 = label('Quiebre', 'bg-rojo'); kpi.m1++; }
            else if (saldo <= r.limiteFantasma && row.max_age > 90) { col8 = label('Residual', 'bg-gris'); kpi.m4++; }
            else if (saldo < nec) { col8 = label('Faltante', 'bg-rojo'); kpi.m1++; }
            else if (nec >= r.minUrgencia) { col8 = label('Prioridad', 'bg-rojo'); kpi.m2++; }
            else { col8 = label('Por Surtir', 'bg-amarillo'); kpi.m2++; }
        }

        mainTable.row.add([`<b>${row.grp}</b><br><small>${row.grp_id}</small>`, row.div, saldo, row.n_aec, row.n_may, row.n_ds, nec, col7, col8]);
    });
    mainTable.draw();
    updateKPIs(totalSaldo, totalNec, kpi);
    updateCharts(divSummary, kpi);
}

// FUNCIONES AUXILIARES
function label(t, c) { return `<span class="status-pill ${c}">${t}</span>`; }

function excelToDate(s) {
    if (!s || isNaN(s)) return null;
    return new Date(Math.round((s - 25569) * 86400 * 1000));
}

function formatearFecha(d) { return d ? `${d.getDate()}/${d.getMonth()+1}/${d.getFullYear()}` : ""; }

function calcularDias(d) { return d ? Math.ceil(Math.abs(TODAY - d) / 86400000) : -1; }

function getAgeCategory(a) {
    if (a < 0) return "Sin Dato";
    if (a <= 30) return "Reciente";
    if (a <= 90) return "Normal";
    if (a <= 180) return "Lento";
    return "Estancado";
}

function updateKPIs(s, n, k) {
    $('#kpiSaldo').text(s.toLocaleString());
    $('#kpiNec').text(n.toLocaleString());
    if (currentView === 'gerencial') {
        $('#lblCritico').text('Urgente'); $('#kpiCriticos').text(k.m1);
        $('#lblAjustado').text('En Tiempo'); $('#kpiAjustados').text(k.m2);
        $('#lblOptimo').text('Sano'); $('#kpiOptimos').text(k.m3);
    } else {
        $('#lblCritico').text('Quiebre'); $('#kpiCriticos').text(k.m1);
        $('#lblAjustado').text('Por Surtir'); $('#kpiAjustados').text(k.m2);
        $('#lblOptimo').text('Completado'); $('#kpiOptimos').text(k.m4);
    }
}

function switchView(v) {
    currentView = v;
    $('.view-btn').removeClass('active');
    $(`#btn${v.charAt(0).toUpperCase() + v.slice(1)}`).addClass('active');
    renderDashboard(dataBase);
}
