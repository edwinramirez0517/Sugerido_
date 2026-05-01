// app.js
Chart.register(ChartDataLabels);

let dataBase = [];
let mainTable, skuTable;
let necessityChart, statusChart;
let currentView = 'gerencial'; 
const TODAY = new Date('2026-04-28'); 

// REGLAS LOGÍSTICAS DE COMPORTAMIENTO (LIMITES FANTASMAS)
const reglasLogisticas = {
    "PASEO": { limiteFantasma: 0, minUrgencia: 1 },
    "HOGAR": { limiteFantasma: 0, minUrgencia: 1 },
    "ROPA": { limiteFantasma: 12, minUrgencia: 24 },
    "CALZADO": { limiteFantasma: 12, minUrgencia: 24 },
    "INTERIOR DETALLE": { limiteFantasma: 24, minUrgencia: 48 },
    "DEFAULT": { limiteFantasma: 50, minUrgencia: 100 } 
};

// EXCEPCIONES POR GRUPO EXACTO
const excepcionesGrupo = {
    "CARROS DE BATERIA": { limiteFantasma: 0, minUrgencia: 1 },
    "BICICLETAS": { limiteFantasma: 0, minUrgencia: 1 }
};

$(document).ready(function() {
    // 1. Inicializar Tablas con centrado de celdas
    mainTable = $('#mainTable').DataTable({
        language: { url: 'https://cdn.datatables.net/plug-ins/1.13.6/i18n/es-ES.json' },
        pageLength: 10,
        lengthMenu: [10, 25, 50, 100],
        columnDefs: [
            { className: "text-center align-middle", targets: "_all" }
        ],
        createdRow: function(row) { $(row).addClass('clickable-row'); }
    });

    skuTable = $('#skuTable').DataTable({ 
        language: { url: 'https://cdn.datatables.net/plug-ins/1.13.6/i18n/es-ES.json' },
        pageLength: 10,
        columnDefs: [
            { className: "text-center align-middle", targets: "_all" }
        ]
    });

    // 2. Select2
    $('#f_div, #f_cat, #f_grp, #f_age').select2({ theme: 'bootstrap-5', width: '100%', placeholder: "Seleccionar..." });

    // 3. Cargar Archivos
    loadCSVData();

    // 4. Eventos de Filtro en Cascada
    $('#f_div, #f_cat, #f_grp, #f_age').on('change', function() {
        if ($(this).attr('id') === 'f_div') updateSubFilters();
        applyFilters();
    });

    // 5. Clic para ver Detalles
    $('#mainTable tbody').on('click', 'tr', function () {
        let rowData = mainTable.row(this).data();
        if (!rowData) return;
        let groupName = rowData[0].split('<br>')[0].replace(/<b>|<\/b>/g, "").trim();
        let groupData = dataBase.find(d => d.grp === groupName);
        if (groupData) openDrillDown(groupData);
    });

    // 6. Limpiar
    $('#resetFilters').on('click', function() {
        $('#f_div, #f_cat, #f_grp, #f_age').val(null).trigger('change');
        renderDashboard(dataBase); 
    });
});

// LECTURA DE CSV Y SANITIZACIÓN DE DATOS
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
                n_ds: parseFloat(row["Necesidad DS"]) || 0, max_age: -1, age_cat: "Sin Dato", skus: []
            };
        });

        saldoRaw.forEach(row => {
            let grp = (row["Grupo"] || "").trim();
            if(dataMap[grp]) {
                let dEC = excelToDate(row["UltFecha_EC"]);
                let dDS = excelToDate(row["UltFecha_DS"]);
                let age = Math.max(calcularDias(dEC), calcularDias(dDS));
                
                // Agregamos todo el detalle exacto a la matriz de SKUs
                dataMap[grp].skus.push({ 
                    cod: row["Producto"], 
                    estilo: row["Estilo ID"], 
                    marca: row["Marca"], 
                    desc: row["ProdNombre"], 
                    s_aec: parseFloat(row["SaldoUND_EC"]) || 0, 
                    s_ds: parseFloat(row["SaldoUND_DS"]) || 0,
                    f_ec: formatearFecha(dEC), 
                    f_ds: formatearFecha(dDS),
                    age: age
                });

                if(age > dataMap[grp].max_age) dataMap[grp].max_age = age;
            }
        });

        dataBase = Object.values(dataMap);
        dataBase.forEach(g => { g.age_cat = getAgeCategory(g.max_age); });

        initFilters();
        renderDashboard(dataBase);
    }).catch(error => {
        console.error("Error al cargar los archivos CSV:", error);
        alert("Ocurrió un error leyendo los archivos CSV. Revisa la consola.");
    });
}

// LOGICA DE FILTROS EN CASCADA
function initFilters() {
    let divs = [...new Set(dataBase.map(i => i.div))].sort();
    $('#f_div').empty().append(divs.map(i => new Option(i, i)));
    updateSubFilters();
}

function updateSubFilters() {
    let selectedDivs = $('#f_div').val() || [];
    let filteredData = selectedDivs.length ? dataBase.filter(d => selectedDivs.includes(d.div)) : dataBase;
    
    let cats = [...new Set(filteredData.map(i => i.cat))].sort();
    let grps = [...new Set(filteredData.map(i => i.grp))].sort();
    
    $('#f_cat').empty().append(cats.map(i => new Option(i, i)));
    $('#f_grp').empty().append(grps.map(i => new Option(i, i)));
}

function applyFilters() {
    let f = { d: $('#f_div').val() || [], c: $('#f_cat').val() || [], g: $('#f_grp').val() || [], a: $('#f_age').val() || [] };
    let filtered = dataBase.filter(r => 
        (!f.d.length || f.d.includes(r.div)) && (!f.c.length || f.c.includes(r.cat)) &&
        (!f.g.length || f.g.includes(r.grp)) && (!f.a.length || f.a.includes(r.age_cat))
    );
    renderDashboard(filtered);
}

// RENDERIZADO DUAL DE LA MATRIZ (COMPRAS VS PICKING)
function renderDashboard(data) {
    mainTable.clear();
    let tS = 0, tN = 0, k = { m1: 0, m2: 0, m3: 0, m4: 0 }, divSum = {};

    data.forEach(row => {
        let s = row.s_aec + row.s_ds;
        let n = Math.round(row.n_aec + row.n_may + row.n_ds);
        tS += s; tN += n;
        divSum[row.div] = (divSum[row.div] || 0) + n;

        let col7, col8;
        if (currentView === 'gerencial') {
            let cob = n > 0 ? (s / n * 100) : (s > 0 ? 999 : 0);
            col7 = n > 0 ? `<b class="text-primary">${cob.toFixed(0)}%</b>` : (s > 0 ? '<b class="text-success">> 100%</b>' : '<b>0%</b>');
            
            if (n === 0 && s > 0) { col8 = label('Sano','bg-verde'); k.m3++; }
            else if (cob < 50) { col8 = label('Comprar Urgente','bg-rojo'); k.m1++; }
            else if (cob <= 100) { col8 = label('En Tiempo','bg-amarillo'); k.m2++; }
            else { col8 = label('Sano','bg-verde'); k.m3++; }
        } else {
            let surtir = Math.min(s, n);
            let falta = n - s;
            col7 = `<b class="fs-6 text-dark">📦 ${surtir}</b>${falta > 0 ? `<br><small class="text-danger fw-bold">Faltan: ${falta}</small>`:''}`;
            
            let r = excepcionesGrupo[row.grp] || reglasLogisticas[row.div] || reglasLogisticas["DEFAULT"];
            if (n === 0) { col8 = label('Completado','bg-verde'); k.m4++; }
            else if (s === 0) { col8 = label('Quiebre','bg-rojo'); k.m1++; }
            else if (s <= r.limiteFantasma && row.max_age > 90) { col8 = label('Residual','bg-gris'); k.m4++; }
            else if (s < n) { col8 = label('Faltante','bg-rojo'); k.m1++; }
            else if (n >= r.minUrgencia) { col8 = label('Prioridad Alta','bg-rojo'); k.m2++; }
            else { col8 = label('Surtido Normal','bg-amarillo'); k.m2++; }
        }

        // Fila construida con los valores resaltados
        mainTable.row.add([
            `<b>${row.grp}</b><br><small class="text-muted">${row.grp_id}</small>`, 
            row.div, 
            `<b class="text-primary fs-6">${s}</b>`, 
            row.n_aec, 
            row.n_may, 
            row.n_ds, 
            `<b class="text-danger fs-6">${n}</b>`, 
            col7, 
            col8
        ]);
    });
    
    mainTable.draw();
    updateUI(tS, tN, k, divSum);
}

// ACTUALIZACIÓN DE GRÁFICOS Y KPIS SUPERIORES
function updateUI(s, n, k, divSum) {
    $('#kpiSaldo').text(Math.round(s).toLocaleString('en-US'));
    $('#kpiNec').text(Math.round(n).toLocaleString('en-US'));

    if (currentView === 'gerencial') {
        $('#lblCritico').text('Comprar Urgente'); $('#kpiCriticos').text(k.m1);
        $('#lblAjustado').text('En Tiempo'); $('#kpiAjustados').text(k.m2).attr('class', 'text-warning mb-0 fs-2 fw-bold');
        $('#lblOptimo').text('Cobertura Sana'); $('#kpiOptimos').text(k.m3);
    } else {
        $('#lblCritico').text('Quiebre / Faltante'); $('#kpiCriticos').text(k.m1);
        $('#lblAjustado').text('Por Surtir'); $('#kpiAjustados').text(k.m2).attr('class', 'text-warning mb-0 fs-2 fw-bold');
        $('#lblOptimo').text('Residual / Completado'); $('#kpiOptimos').text(k.m4);
    }

    let sorted = Object.entries(divSum).sort((a,b) => b[1] - a[1]).slice(0, 10);
    
    if(necessityChart) necessityChart.destroy();
    necessityChart = new Chart(document.getElementById('chartNecessity').getContext('2d'), {
        type: 'bar',
        data: { labels: sorted.map(i => i[0]), datasets: [{ label: 'Necesidad', data: sorted.map(i => i[1]), backgroundColor: 'rgba(225, 37, 27, 0.85)', borderColor: '#E1251B', borderWidth: 1 }] },
        options: { 
            responsive: true, maintainAspectRatio: false,
            plugins: { datalabels: { anchor: 'end', align: 'top', formatter: (v) => Math.round(v).toLocaleString('en-US'), font: { weight: 'bold', size: 10 }, color: '#E1251B' }, legend: { display: false } },
            scales: { x: { ticks: { font: { size: 9 }, maxRotation: 45, minRotation: 45 } } }
        }
    });

    let labelsPie = currentView === 'gerencial' ? ['Urgente', 'En Tiempo', 'Sano'] : ['Quiebre/Faltante', 'Por Surtir', 'Residual'];
    let colorsPie = currentView === 'gerencial' ? ['#f8d7da', '#fff3cd', '#d1e7dd'] : ['#f8d7da', '#ffc107', '#e9ecef'];

    if(statusChart) statusChart.destroy();
    statusChart = new Chart(document.getElementById('chartStatus').getContext('2d'), {
        type: 'doughnut',
        data: { labels: labelsPie, datasets: [{ data: [k.m1, k.m2, k.m3+k.m4], backgroundColor: colorsPie, borderWidth: 2 }] },
        options: { 
            responsive: true, maintainAspectRatio: false, cutout: '65%',
            plugins: { 
                legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } },
                datalabels: {
                    formatter: (value, ctx) => {
                        let sum = ctx.chart.data.datasets[0].data.reduce((a, b) => a + b, 0);
                        let percentage = (value * 100 / sum).toFixed(1) + "%";
                        return value > 0 ? percentage : '';
                    },
                    color: '#444', font: { weight: 'bold' }
                }
            } 
        }
    });
}

// MANEJO DE LA PANTALLA DRILL-DOWN (SKUs)
function openDrillDown(g) {
    $('#mainScreen').addClass('hidden-screen');
    $('#drillDownScreen').removeClass('hidden-screen');
    
    $('#detailDivCat').text(`${g.div} > ${g.cat}`);
    $('#detailGroupName').text(g.grp);
    
    let nT = Math.round(g.n_aec + g.n_may + g.n_ds);
    let sT = Math.round(g.s_aec + g.s_ds);
    let fT = nT - sT > 0 ? nT - sT : 0;

    $('#detNecTotal').text(nT.toLocaleString('en-US'));
    $('#detSaldoTotal').text(sT.toLocaleString('en-US'));
    
    if (currentView === 'gerencial') {
        $('#detFaltanteTitle').text('Cobertura');
        let cob = nT > 0 ? (sT / nT * 100).toFixed(1) + '%' : '> 100%';
        $('#detFaltante').text(cob).removeClass('text-danger').addClass('text-dark');
    } else {
        $('#detFaltanteTitle').text('Faltante Operativo');
        $('#detFaltante').text(fT.toLocaleString('en-US')).removeClass('text-dark').addClass('text-danger');
    }

    let bHtml = nT === 0 ? label('Completado','bg-verde') : (sT === 0 ? label('Sin Stock','bg-rojo') : label('En Proceso','bg-amarillo'));
    $('#detEstadoBadge').html(bHtml);

    skuTable.clear();
    g.skus.forEach(s => {
        let t = s.s_aec + s.s_ds;
        skuTable.row.add([
            `<span class="fw-bold text-primary">${s.cod}</span>`, 
            s.estilo || '', 
            `<small>${s.desc}</small>`, 
            s.marca || '', 
            s.f_ec || '', 
            s.s_aec, 
            s.f_ds || '', 
            s.s_ds, 
            `<span class="fw-bold fs-6">${t}</span>`, 
            t > 0 ? label('Sí','bg-verde') : label('No','bg-rojo')
        ]);
    });
    skuTable.draw();
}

// CERRAR VENTANA DETALLE
function closeDrillDown() { 
    $('#drillDownScreen').addClass('hidden-screen'); 
    $('#mainScreen').removeClass('hidden-screen'); 
}

// CAMBIO DE VISTAS Y ENCABEZADOS
function switchView(v) {
    currentView = v; 
    $('.view-btn').removeClass('active'); 
    $(`#btn${v.charAt(0).toUpperCase() + v.slice(1)}`).addClass('active');
    
    if(v === 'gerencial') {
        $($('#mainTable thead th')[7]).text('% Cobertura');
        $($('#mainTable thead th')[8]).text('Estado Gerencial');
    } else {
        $($('#mainTable thead th')[7]).html('A Surtir');
        $($('#mainTable thead th')[8]).text('Prioridad Picking');
    }
    applyFilters(); 
}

// UTILIDADES MATEMÁTICAS
function excelToDate(s) { return s > 0 ? new Date(Math.round((s - 25569) * 86400 * 1000)) : null; }
function formatearFecha(d) { return d ? `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth()+1).padStart(2, '0')}/${d.getFullYear()}` : ""; }
function calcularDias(d) { return d ? Math.ceil(Math.abs(TODAY - d) / 86400000) : -1; }
function label(t, c) { return `<span class="status-pill ${c}">${t}</span>`; }
function getAgeCategory(a) { 
    if (a < 0) return "Sin Dato"; 
    if (a <= 30) return "Reciente (0-30 días)"; 
    if (a <= 90) return "Stock Normal (31-90 días)"; 
    if (a <= 180) return "Lento Mov. (91-180 días)"; 
    return "Estancado (>180 días)"; 
}
