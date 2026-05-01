// app.js
Chart.register(ChartDataLabels);

let dataBase = [];
let mainTable, skuTable;
let necessityChart, statusChart;
let currentView = 'gerencial'; 
const TODAY = new Date('2026-04-28'); 

const reglasLogisticas = {
    "PASEO": { limiteFantasma: 0, minUrgencia: 1 },
    "HOGAR": { limiteFantasma: 0, minUrgencia: 1 },
    "ROPA": { limiteFantasma: 12, minUrgencia: 24 },
    "CALZADO": { limiteFantasma: 12, minUrgencia: 24 },
    "DEFAULT": { limiteFantasma: 50, minUrgencia: 100 } 
};

$(document).ready(function() {
    mainTable = $('#mainTable').DataTable({
        language: { url: 'https://cdn.datatables.net/plug-ins/1.13.6/i18n/es-ES.json' },
        pageLength: 10,
        createdRow: (row) => $(row).addClass('clickable-row')
    });
    skuTable = $('#skuTable').DataTable({ language: { url: 'https://cdn.datatables.net/plug-ins/1.13.6/i18n/es-ES.json' } });
    
    $('#f_div, #f_cat, #f_grp, #f_age').select2({ theme: 'bootstrap-5', width: '100%' });

    loadCSVData();
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
                    cod: row["Producto"], desc: row["ProdNombre"], s_aec: parseFloat(row["SaldoUND_EC"]), 
                    s_ds: parseFloat(row["SaldoUND_DS"]), f_ec: formatearFecha(dEC), f_ds: formatearFecha(dDS) 
                });
                if(age > dataMap[grp].max_age) dataMap[grp].max_age = age;
            }
        });

        dataBase = Object.values(dataMap);
        setupFilters();
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
            let cob = n > 0 ? (s / n * 100) : (s > 0 ? 999 : 0);
            col7 = n > 0 ? cob.toFixed(0) + '%' : (s > 0 ? '>100%' : '0%');
            if (n === 0 && s > 0) { col8 = label('Sano','bg-verde'); k.m3++; }
            else if (cob < 50) { col8 = label('Urgente','bg-rojo'); k.m1++; }
            else if (cob <= 100) { col8 = label('En Tiempo','bg-amarillo'); k.m2++; }
            else { col8 = label('Sano','bg-verde'); k.m3++; }
        } else {
            let surtir = Math.min(s, n), falta = n - s;
            col7 = `📦 ${surtir} ${falta > 0 ? '<br><small class="text-danger">Falta '+falta+'</small>':''}`;
            let r = reglasLogisticas[row.div] || reglasLogisticas["DEFAULT"];
            if (n === 0) { col8 = label('Listo','bg-verde'); k.m4++; }
            else if (s === 0) { col8 = label('Quiebre','bg-rojo'); k.m1++; }
            else if (s <= r.limiteFantasma && row.max_age > 90) { col8 = label('Residual','bg-gris'); k.m4++; }
            else { col8 = label('Surtir','bg-amarillo'); k.m2++; }
        }
        mainTable.row.add([`<b>${row.grp}</b><br><small>${row.grp_id}</small>`, row.div, s, row.n_aec, row.n_may, row.n_ds, n, col7, col8]);
    });
    mainTable.draw();
    $('#kpiSaldo').text(Math.round(tS).toLocaleString());
    $('#kpiNec').text(Math.round(tN).toLocaleString());
    $('#kpiCriticos').text(k.m1); $('#kpiAjustados').text(k.m2); $('#kpiOptimos').text(k.m3+k.m4);
    updateCharts(divSum, k);
}

function updateCharts(divs, k) {
    let sorted = Object.entries(divs).sort((a,b) => b[1] - a[1]).slice(0, 10);
    if(necessityChart) necessityChart.destroy();
    necessityChart = new Chart(document.getElementById('chartNecessity'), {
        type: 'bar',
        data: { labels: sorted.map(i => i[0]), datasets: [{ data: sorted.map(i => i[1]), backgroundColor: '#E1251B' }] },
        options: { 
            responsive: true, maintainAspectRatio: false,
            scales: { x: { ticks: { font: { size: 9 }, maxRotation: 45, minRotation: 45 } } },
            plugins: { datalabels: { anchor: 'end', align: 'top', formatter: Math.round, font: { size: 10, weight: 'bold' }, color: '#E1251B' }, legend: { display: false } }
        }
    });

    if(statusChart) statusChart.destroy();
    statusChart = new Chart(document.getElementById('chartStatus'), {
        type: 'doughnut',
        data: { labels: ['Urgente', 'En Tiempo', 'Sano'], datasets: [{ data: [k.m1, k.m2, k.m3+k.m4], backgroundColor: ['#f8d7da', '#fff3cd', '#d1e7dd'] }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
    });
}

function switchView(v) {
    currentView = v; $('.view-btn').removeClass('active');
    $(`#btn${v.charAt(0).toUpperCase() + v.slice(1)}`).addClass('active');
    renderDashboard(dataBase);
}

function setupFilters() {
    const fill = (id, f) => {
        let items = [...new Set(dataBase.map(i => i[f]))].sort();
        $(id).empty().append(items.map(i => new Option(i, i)));
    };
    fill('#f_div','div'); fill('#f_cat','cat'); fill('#f_grp','grp');
}

function excelToDate(s) { return s > 0 ? new Date(Math.round((s - 25569) * 86400 * 1000)) : null; }
function formatearFecha(d) { return d ? `${d.getDate()}/${d.getMonth()+1}/${d.getFullYear()}` : ""; }
function calcularDias(d) { return d ? Math.ceil(Math.abs(TODAY - d) / 86400000) : -1; }
function label(t, c) { return `<span class="status-pill ${c}">${t}</span>`; }
