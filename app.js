// app.js
Chart.register(ChartDataLabels);

let dataBase = [];
let mainTable, skuTable;
let necessityChart, statusChart;
let currentView = 'gerencial'; 

const TODAY = new Date('2026-04-28'); 

// REGLAS LOGÍSTICAS POR DEFECTO
const reglasLogisticas = {
    "PASEO": { limiteFantasma: 0, minUrgencia: 1 },
    "HOGAR": { limiteFantasma: 0, minUrgencia: 1 },
    "JUGUETERIA": { limiteFantasma: 0, minUrgencia: 2 },
    "ROPA": { limiteFantasma: 12, minUrgencia: 24 },
    "CALZADO": { limiteFantasma: 12, minUrgencia: 24 },
    "INTERIOR DETALLE": { limiteFantasma: 24, minUrgencia: 48 },
    "DEFAULT": { limiteFantasma: 50, minUrgencia: 100 } 
};

$(document).ready(function() {
    initTables();
    loadCSVData();
});

function initTables() {
    mainTable = $('#mainTable').DataTable({
        language: { url: 'https://cdn.datatables.net/plug-ins/1.13.6/i18n/es-ES.json' },
        responsive: true,
        pageLength: 10,
        createdRow: function(row) { $(row).addClass('clickable-row'); }
    });

    skuTable = $('#skuTable').DataTable({
        language: { url: 'https://cdn.datatables.net/plug-ins/1.13.6/i18n/es-ES.json' },
        responsive: true, pageLength: 10
    });

    // Clic en filas para el Drill-down
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

function loadCSVData() {
    Promise.all([
        fetch('sugerido.csv').then(res => res.text()),
        fetch('saldo.csv').then(res => res.text())
    ]).then(([sugeridoText, saldoText]) => {
        // DETECCIÓN AUTOMÁTICA DE DELIMITADOR (";" o ",")
        let sugeridoParsed = Papa.parse(sugeridoText, { header: true, skipEmptyLines: true }).data;
        let saldoParsed = Papa.parse(saldoText, { header: true, skipEmptyLines: true }).data;
        
        let dataMap = {};

        sugeridoParsed.forEach(row => {
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

        saldoParsed.forEach(row => {
            let grpName = (row["Grupo"] || "").trim();
            if(dataMap[grpName]) {
                let s_ec = parseFloat(row["SaldoUND_EC"]) || 0;
                let s_ds = parseFloat(row["SaldoUND_DS"]) || 0;
                
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
                    s_aec: s_ec, s_ds: s_ds,
                    f_ec: formatearFecha(dateEC), f_ds: formatearFecha(dateDS),
                    max_age: max_age
                });
                if(max_age > dataMap[grpName].max_age) dataMap[grpName].max_age = max_age;
            }
        });

        dataBase = Object.values(dataMap);
        dataBase.forEach(g => { g.age_cat = getAgeCategory(g.max_age); });

        setupFilters();
        renderDashboard(dataBase);
    });
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
            let cobVal = nec > 0 ? (saldo / nec) * 100 : (saldo > 0 ? 101 : 0);
            col7 = nec > 0 ? cobVal.toFixed(1) + '%' : (saldo > 0 ? '> 100%' : '0%');
            
            if (nec === 0 && saldo > 0) { col8 = label('Sano', 'bg-verde'); kpi.m3++; }
            else if (cobVal < 50) { col8 = label('Urgente', 'bg-rojo'); kpi.m1++; }
            else if (cobVal <= 100) { col8 = label('En Tiempo', 'bg-amarillo'); kpi.m2++; }
            else { col8 = label('Sano', 'bg-verde'); kpi.m3++; }
        } else {
            let surtir = Math.min(saldo, nec);
            let falta = nec - saldo;
            col7 = `<b>📦 ${surtir}</b>${falta > 0 ? `<br><small class='text-danger'>Falta: ${falta}</small>` : ''}`;
            
            let r = reglasLogisticas[row.div] || reglasLogisticas["DEFAULT"];
            if (nec === 0) { col8 = label('Completado', 'bg-verde'); kpi.m4++; }
            else if (saldo === 0) { col8 = label('Quiebre', 'bg-rojo'); kpi.m1++; }
            else if (saldo <= r.limiteFantasma && row.max_age > 90) { col8 = label('Residual', 'bg-gris'); kpi.m4++; }
            else { col8 = label('Por Surtir', 'bg-amarillo'); kpi.m2++; }
        }
        mainTable.row.add([`<b>${row.grp}</b><br><small>${row.grp_id}</small>`, row.div, saldo, row.n_aec, row.n_may, row.n_ds, nec, col7, col8]);
    });
    mainTable.draw();
    updateKPIs(totalSaldo, totalNec, kpi);
    updateCharts(divSummary, kpi);
}

function setupFilters() {
    const fill = (id, field) => {
        let items = [...new Set(dataBase.map(i => i[field]))].sort();
        $(id).empty().append(items.map(i => new Option(i, i)));
    };
    fill('#f_div', 'div'); fill('#f_cat', 'cat'); fill('#f_grp', 'grp');
    $('#f_div, #f_cat, #f_grp, #f_age').on('change', () => {
        let f = { d: $('#f_div').val(), c: $('#f_cat').val(), g: $('#f_grp').val(), a: $('#f_age').val() };
        let filtered = dataBase.filter(r => 
            (!f.d.length || f.d.includes(r.div)) && (!f.c.length || f.c.includes(r.cat)) &&
            (!f.g.length || f.g.includes(r.grp)) && (!f.a.length || f.a.includes(r.age_cat))
        );
        renderDashboard(filtered);
    });
}

function switchView(v) {
    currentView = v;
    $('.view-btn').removeClass('active');
    $(`#btn${v.charAt(0).toUpperCase() + v.slice(1)}`).addClass('active');
    
    // Cambiar nombres de columnas dinámicamente
    if(v === 'gerencial') {
        $($('#mainTable thead th')[7]).text('% Cobertura');
        $($('#mainTable thead th')[8]).text('Estado Gerencial');
    } else {
        $($('#mainTable thead th')[7]).html('A Surtir');
        $($('#mainTable thead th')[8]).text('Prioridad Picking');
    }
    renderDashboard(dataBase);
}

// UTILIDADES
function label(t, c) { return `<span class="status-pill ${c}">${t}</span>`; }
function excelToDate(s) { return s > 0 ? new Date(Math.round((s - 25569) * 86400 * 1000)) : null; }
function formatearFecha(d) { return d ? `${d.getDate()}/${d.getMonth()+1}/${d.getFullYear()}` : ""; }
function calcularDias(d) { return Math.ceil(Math.abs(TODAY - d) / 86400000); }
function getAgeCategory(a) {
    if (a < 0) return "Sin Dato";
    if (a <= 30) return "Reciente (0-30 días)";
    if (a <= 90) return "Stock Normal (31-90 días)";
    if (a <= 180) return "Lento Mov. (91-180 días)";
    return "Estancado (>180 días)";
}
function updateKPIs(s, n, k) {
    $('#kpiSaldo').text(s.toLocaleString()); $('#kpiNec').text(n.toLocaleString());
    if (currentView === 'gerencial') {
        $('#lblCritico').text('Urgente'); $('#kpiCriticos').text(k.m1);
        $('#lblAjustado').text('En Tiempo'); $('#kpiAjustados').text(k.m2);
        $('#lblOptimo').text('Sano'); $('#kpiOptimos').text(k.m3);
    } else {
        $('#lblCritico').text('Quiebre'); $('#kpiCriticos').text(k.m1);
        $('#lblAjustado').text('Surtir'); $('#kpiAjustados').text(k.m2);
        $('#lblOptimo').text('Completado'); $('#kpiOptimos').text(k.m4);
    }
}
function updateCharts(divs, k) {
    let sorted = Object.entries(divs).sort((a,b) => b[1] - a[1]).slice(0,10);
    if(necessityChart) necessityChart.destroy();
    necessityChart = new Chart(document.getElementById('chartNecessity').getContext('2d'), {
        type: 'bar',
        data: { labels: sorted.map(i => i[0]), datasets: [{ label: 'Necesidad', data: sorted.map(i => i[1]), backgroundColor: '#E1251B' }] },
        options: { responsive: true, maintainAspectRatio: false }
    });
    if(statusChart) statusChart.destroy();
    statusChart = new Chart(document.getElementById('chartStatus').getContext('2d'), {
        type: 'doughnut',
        data: { labels: ['Urgente/Quiebre', 'En Tiempo/Surtir', 'Sano/Completado'], datasets: [{ data: [k.m1, k.m2, k.m3+k.m4], backgroundColor: ['#f8d7da', '#fff3cd', '#d1e7dd'] }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });
}
function openDrillDown(g) {
    $('#mainScreen').addClass('hidden-screen'); $('#drillDownScreen').removeClass('hidden-screen');
    $('#detailDivCat').text(`${g.div} > ${g.cat}`); $('#detailGroupName').text(g.grp);
    $('#detNecAEC').text(g.n_aec); $('#detNecMay').text(g.n_may); $('#detNecDS').text(g.n_ds);
    $('#detNecGlobal').text(g.n_aec + g.n_may + g.n_ds); $('#detSaldoTotal').text(g.s_aec + g.s_ds);
    skuTable.clear();
    g.skus.forEach(s => {
        let t = s.s_aec + s.s_ds;
        skuTable.row.add([`<b>${s.cod}</b>`, s.estilo, s.desc, s.marca, s.f_ec, s.s_aec, s.f_ds, s.s_ds, t, t>0 ? label('Si','bg-verde'):label('No','bg-rojo')]);
    });
    skuTable.draw();
}
function closeDrillDown() { $('#drillDownScreen').addClass('hidden-screen'); $('#mainScreen').removeClass('hidden-screen'); }
