// app.js
Chart.register(ChartDataLabels);

let dataBase = [];
let mainTable, skuTable;
let necessityChart, statusChart;
let currentView = 'gerencial'; 
const TODAY = new Date('2026-04-28'); 

// Configuración de Perfiles Logísticos
const reglasLogisticas = {
    "PASEO": { limiteFantasma: 0, minUrgencia: 1 },
    "HOGAR": { limiteFantasma: 0, minUrgencia: 1 },
    "ROPA": { limiteFantasma: 12, minUrgencia: 24 },
    "CALZADO": { limiteFantasma: 12, minUrgencia: 24 },
    "INTERIOR DETALLE": { limiteFantasma: 24, minUrgencia: 48 },
    "DEFAULT": { limiteFantasma: 50, minUrgencia: 100 } 
};

$(document).ready(function() {
    mainTable = $('#mainTable').DataTable({
        language: { url: 'https://cdn.datatables.net/plug-ins/1.13.6/i18n/es-ES.json' },
        pageLength: 10,
        columnDefs: [{ className: "text-center", targets: "_all" }],
        createdRow: (row) => $(row).addClass('clickable-row')
    });

    skuTable = $('#skuTable').DataTable({ 
        language: { url: 'https://cdn.datatables.net/plug-ins/1.13.6/i18n/es-ES.json' },
        columnDefs: [{ className: "text-center", targets: "_all" }]
    });

    $('#f_div, #f_cat, #f_grp, #f_age').select2({ theme: 'bootstrap-5', width: '100%', placeholder: "Seleccionar..." });

    loadCSVData();

    // Filtros Relacionales
    $('#f_div, #f_cat, #f_grp, #f_age').on('change', function() {
        if ($(this).attr('id') === 'f_div') updateSubFilters();
        applyFilters();
    });
});

function loadCSVData() {
    Promise.all([
        fetch('sugerido.csv').then(res => res.text()),
        fetch('saldo.csv').then(res => res.text())
    ]).then(([sugeridoText, saldoText]) => {
        let sugeridoRaw = Papa.parse(sugeridoText, { header: true, skipEmptyLines: true, delimiter: ";" }).data;
        let saldoRaw = Papa.parse(saldoText, { header: true, skipEmptyLines: true, delimiter: ";" }).data;
        
        let dataMap = {};
        sugeridoRaw.forEach(row => {
            let grp = (row["Grupo"] || "").trim();
            if(!grp) return;
            dataMap[grp] = {
                div: row["Division"], cat: row["Categoria"], grp_id: row["Grupo ID"], grp: grp,
                s_aec: parseFloat(row["Saldo CDI01"]) || 0, s_ds: parseFloat(row["Saldo DSCDI"]) || 0,
                n_aec: parseFloat(row["Necesidad detalle AEC"]) || 0, n_may: parseFloat(row["Necesidad mayoreo AEC"]) || 0,
                n_ds: parseFloat(row["Necesidad DS"]) || 0, max_age: -1, skus: []
            };
        });

        saldoRaw.forEach(row => {
            let grp = (row["Grupo"] || "").trim();
            if(dataMap[grp]) {
                let dEC = excelToDate(row["UltFecha_EC"]), dDS = excelToDate(row["UltFecha_DS"]);
                let age = Math.max(calcularDias(dEC), calcularDias(dDS));
                dataMap[grp].skus.push({ 
                    cod: row["Producto"], estilo: row["Estilo ID"], marca: row["Marca"], desc: row["ProdNombre"], 
                    s_aec: parseFloat(row["SaldoUND_EC"]) || 0, s_ds: parseFloat(row["SaldoUND_DS"]) || 0,
                    age: age
                });
                if(age > dataMap[grp].max_age) dataMap[grp].max_age = age;
            }
        });

        dataBase = Object.values(dataMap);
        dataBase.forEach(g => { g.age_cat = getAgeCategory(g.max_age); });
        initFilters();
        renderDashboard(dataBase);
    });
}

function renderDashboard(data) {
    mainTable.clear();
    let tS = 0, tN = 0, k = { m1: 0, m2: 0, m3: 0, m4: 0 }, divSum = {};

    data.forEach(row => {
        let s = row.s_aec + row.s_ds, n = Math.round(row.n_aec + row.n_may + row.n_ds);
        tS += s; tN += n;
        divSum[row.div] = (divSum[row.div] || 0) + n;

        let col7, col8;
        if (currentView === 'gerencial') {
            let cob = n > 0 ? (s / n * 100) : (s > 0 ? 101 : 0);
            col7 = n > 0 ? `<b>${cob.toFixed(0)}%</b>` : (s > 0 ? '<b>>100%</b>' : '0%');
            if (n === 0 && s > 0) { col8 = label('Sano','bg-verde'); k.m3++; }
            else if (cob < 50) { col8 = label('Comprar','bg-rojo'); k.m1++; }
            else if (cob <= 100) { col8 = label('En Tiempo','bg-amarillo'); k.m2++; }
            else { col8 = label('Sano','bg-verde'); k.m3++; }
        } else {
            let surtir = Math.min(s, n), falta = n - s;
            col7 = `<b>📦 ${surtir}</b>${falta > 0 ? `<br><small class="text-danger">Falta ${falta}</small>`:''}`;
            let r = reglasLogisticas[row.div] || reglasLogisticas["DEFAULT"];
            if (n === 0) { col8 = label('Listo','bg-verde'); k.m4++; }
            else if (s === 0) { col8 = label('Quiebre','bg-rojo'); k.m1++; }
            else if (s <= r.limiteFantasma && row.max_age > 90) { col8 = label('Residual','bg-gris'); k.m4++; }
            else { col8 = label('Surtir','bg-amarillo'); k.m2++; }
        }
        mainTable.row.add([`<b>${row.grp}</b><br><small>${row.grp_id}</small>`, row.div, `<b>${s}</b>`, row.n_aec, row.n_may, row.n_ds, `<b>${n}</b>`, col7, col8]);
    });
    mainTable.draw();
    updateUI(tS, tN, k, divSum);
}

function openDrillDown(g) {
    $('#mainScreen').addClass('hidden-screen');
    $('#drillDownScreen').removeClass('hidden-screen');
    $('#detailDivCat').text(`${g.div} > ${g.cat}`);
    $('#detailGroupName').text(g.grp);
    
    let nT = Math.round(g.n_aec + g.n_may + g.n_ds);
    let sT = Math.round(g.s_aec + g.s_ds);
    let fT = nT - sT > 0 ? nT - sT : 0;

    $('#detNecTotal').text(nT.toLocaleString());
    $('#detSaldoTotal').text(sT.toLocaleString());
    $('#detFaltante').text(fT.toLocaleString());
    $('#detEstadoBadge').html(nT === 0 ? label('Completado','bg-verde') : (sT === 0 ? label('Sin Stock','bg-rojo') : label('Pendiente','bg-amarillo')));

    skuTable.clear();
    g.skus.forEach(s => {
        let t = s.s_aec + s.s_ds;
        skuTable.row.add([`<span class="text-primary fw-bold">${s.cod}</span>`, s.estilo, `<small>${s.desc}</small>`, s.marca, s.s_aec, s.s_ds, `<b>${t}</b>`, t>0 ? label('SI','bg-verde'):label('NO','bg-rojo')]);
    });
    skuTable.draw();
}

function updateUI(s, n, k, divSum) {
    $('#kpiSaldo').text(Math.round(s).toLocaleString());
    $('#kpiNec').text(Math.round(n).toLocaleString());
    $('#kpiCriticos').text(k.m1); $('#kpiAjustados').text(k.m2); $('#kpiOptimos').text(k.m3 + k.m4);

    let sorted = Object.entries(divSum).sort((a,b) => b[1] - a[1]).slice(0, 10);
    if(necessityChart) necessityChart.destroy();
    necessityChart = new Chart(document.getElementById('chartNecessity'), {
        type: 'bar',
        data: { labels: sorted.map(i => i[0]), datasets: [{ data: sorted.map(i => i[1]), backgroundColor: '#E1251B' }] },
        options: { 
            responsive: true, maintainAspectRatio: false,
            plugins: { datalabels: { anchor: 'end', align: 'top', formatter: (v) => Math.round(v).toLocaleString(), font: { weight: 'bold', size: 10 }, color: '#E1251B' }, legend: { display: false } },
            scales: { x: { ticks: { font: { size: 9 }, maxRotation: 45 } } }
        }
    });

    if(statusChart) statusChart.destroy();
    statusChart = new Chart(document.getElementById('chartStatus'), {
        type: 'doughnut',
        data: { labels: ['Urgente', 'En Tiempo', 'Sano'], datasets: [{ data: [k.m1, k.m2, k.m3+k.m4], backgroundColor: ['#f8d7da', '#fff3cd', '#d1e7dd'] }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
    });
}

// FUNCIONES AUXILIARES
function label(t, c) { return `<span class="status-pill ${c}">${t}</span>`; }
function excelToDate(s) { return s > 0 ? new Date(Math.round((s - 25569) * 86400 * 1000)) : null; }
function calcularDias(d) { return d ? Math.ceil(Math.abs(TODAY - d) / 86400000) : -1; }
function getAgeCategory(a) { if (a < 0) return "Sin Dato"; if (a <= 30) return "Reciente"; if (a <= 90) return "Normal"; if (a <= 180) return "Lento"; return "Estancado"; }
function closeDrillDown() { $('#drillDownScreen').addClass('hidden-screen'); $('#mainScreen').removeClass('hidden-screen'); }
function switchView(v) { currentView = v; $('.view-btn').removeClass('active'); $(`#btn${v.charAt(0).toUpperCase() + v.slice(1)}`).addClass('active'); $('#thMetrica').text(v === 'gerencial' ? '% Cobertura' : 'A Surtir'); $('#thEstado').text(v === 'gerencial' ? 'Estado' : 'Prioridad'); applyFilters(); }
function initFilters() { let divs = [...new Set(dataBase.map(i => i.div))].sort(); $('#f_div').empty().append(divs.map(i => new Option(i, i))); updateSubFilters(); }
function updateSubFilters() { let sel = $('#f_div').val() || []; let d = sel.length ? dataBase.filter(i => sel.includes(i.div)) : dataBase; $('#f_cat').empty().append([...new Set(d.map(i => i.cat))].sort().map(i => new Option(i, i))); $('#f_grp').empty().append([...new Set(d.map(i => i.grp))].sort().map(i => new Option(i, i))); }
function applyFilters() { let f = { d: $('#f_div').val() || [], c: $('#f_cat').val() || [], g: $('#f_grp').val() || [], a: $('#f_age').val() || [] }; let filt = dataBase.filter(r => (!f.d.length || f.d.includes(r.div)) && (!f.c.length || f.c.includes(r.cat)) && (!f.g.length || f.g.includes(r.grp)) && (!f.a.length || f.a.includes(r.age_cat))); renderDashboard(filt); }
