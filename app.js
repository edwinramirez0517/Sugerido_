// ==========================================
// INICIO DEL CÓDIGO
// ==========================================
Chart.register(ChartDataLabels);

let dataBase = [];
let mainTable, skuTable, tiendasTable;
let necessityChart, statusChart;
let currentView = 'gerencial'; 

const TODAY = new Date(); 
const CURRENT_MONTH = TODAY.getMonth() + 1;

const reglasLogisticas = {
    "PASEO": { limiteFantasma: 0, minUrgencia: 1 }, "HOGAR": { limiteFantasma: 0, minUrgencia: 1 },
    "ROPA": { limiteFantasma: 12, minUrgencia: 24 }, "CALZADO": { limiteFantasma: 12, minUrgencia: 24 },
    "CALZADO PLASTICO": { limiteFantasma: 12, minUrgencia: 24 }, "INTERIOR DETALLE": { limiteFantasma: 24, minUrgencia: 48 },
    "DEFAULT": { limiteFantasma: 50, minUrgencia: 100 } 
};

// ==========================================
// FUNCIONES DE FECHAS
// ==========================================
function excelToDate(excelDate) {
    if (!excelDate) return null;
    let parts = excelDate.split(' ')[0].split('/');
    if (parts.length === 3) return new Date(parts[2], parts[1] - 1, parts[0]);
    return null;
}
function calcularDias(date) {
    if (!date) return 0;
    const diffTime = Math.abs(TODAY - date);
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}
function formatearFecha(date) {
    if (!date) return '';
    return date.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function getAgeCategory(days) {
    if (days === 0) return "Sin Dato";
    if (days <= 30) return "0-30 días";
    if (days <= 60) return "31-60 días";
    if (days <= 90) return "61-90 días";
    return "+90 días";
}
function label(text, className) {
    return `<span class="status-pill ${className}">${text}</span>`;
}

// ==========================================
// EVALUAR TEMPORADAS
// ==========================================
function checkSeason(div, cat, grp) {
    let text = `${div} ${cat} ${grp}`.toUpperCase();
    if (text.includes("ESCOLAR") || text.includes("MOCHILA") || text.includes("CUADERNO")) return [12, 1, 2].includes(CURRENT_MONTH) ? "ALTA" : "FUERA";
    if (text.includes("VALENTIN") || text.includes("AMOR")) return [1, 2].includes(CURRENT_MONTH) ? "ALTA" : "FUERA";
    if (text.includes("VERANO") || text.includes("PLAYA") || text.includes("PISCINA") || text.includes("BAÑO")) return [3, 4].includes(CURRENT_MONTH) ? "ALTA" : "FUERA";
    if ((text.includes("MAMA") || text.includes("MADRE") || text.includes("DAMA") || text.includes("BELLEZA")) && [4, 5].includes(CURRENT_MONTH)) return "ALTA";
    if (["HOGAR", "TECNOLOGIA", "PASEO"].includes(div.toUpperCase()) && [6, 7].includes(CURRENT_MONTH)) return "ALTA";
    if ((text.includes("NIÑO") || text.includes("JUGUET")) && [8, 9].includes(CURRENT_MONTH)) return "ALTA";
    if (text.includes("NAVIDAD") || text.includes("PASCUA") || text.includes("LUCES")) return [9, 10, 11, 12].includes(CURRENT_MONTH) ? "ALTA" : "FUERA";
    return "NORMAL"; 
}

// ==========================================
// INICIALIZACIÓN DE TABLAS
// ==========================================
$(document).ready(function() {
    
    $('#fechaActual').text('📅 ' + formatearFecha(TODAY));

    mainTable = $('#mainTable').DataTable({
        language: { url: 'https://cdn.datatables.net/plug-ins/1.13.6/i18n/es-ES.json' },
        pageLength: 25, 
        lengthMenu: [[10, 25, 50, 100, -1], [10, 25, 50, 100, "Todas"]],
        columnDefs: [ { className: "text-center align-middle", targets: "_all" }, { targets: [2, 3, 4, 6], render: $.fn.dataTable.render.number(',', '.', 0, '') }, { targets: [5, 7, 8], render: function (data, type, row) { return (type === 'sort' || type === 'type') ? data.sortValue : data.display; } } ],
        createdRow: function(row) { $(row).addClass('clickable-row'); }
    });

    tiendasTable = $('#tiendasTable').DataTable({ 
        language: { url: 'https://cdn.datatables.net/plug-ins/1.13.6/i18n/es-ES.json' }, 
        pageLength: 25, 
        lengthChange: true, 
        lengthMenu: [[10, 25, 50, 100, -1], [10, 25, 50, 100, "Todas"]],
        order: [], 
        columnDefs: [
            { className: "text-center align-middle", targets: "_all" }, 
            { targets: [1, 2], render: $.fn.dataTable.render.number(',', '.', 0, '') },
            { targets: [3], render: function (data, type, row) { return (type === 'sort' || type === 'type') ? data.sortValue : data.display; } }
        ]
    });

    skuTable = $('#skuTable').DataTable({ 
        language: { url: 'https://cdn.datatables.net/plug-ins/1.13.6/i18n/es-ES.json' }, 
        pageLength: 25, 
        lengthChange: true, 
        lengthMenu: [[10, 25, 50, 100, -1], [10, 25, 50, 100, "Todas"]],
        order: [], 
        columnDefs: [
            { className: "text-center align-middle", targets: "_all" }, 
            { targets: [4], render: $.fn.dataTable.render.number(',', '.', 0, '') },
            { targets: [5, 6, 7], render: function (data, type, row) { return (type === 'sort' || type === 'type') ? data.sortValue : data.display; } }
        ]
    });

    $('#f_div, #f_cat, #f_grp, #f_age, #f_status').select2({ theme: 'bootstrap-5', width: '100%', placeholder: "Todos" });
    
    loadCSVData();

    $('#f_div').on('select2:select select2:unselect', function() { updateSubFilters('div'); applyFilters(); });
    $('#f_cat').on('select2:select select2:unselect', function() { updateSubFilters('cat'); applyFilters(); });
    $('#f_grp, #f_age, #f_status').on('select2:select select2:unselect', function() { applyFilters(); });
    
    $('#hideFueraTemporada').on('change', function() { applyFilters(); });
    
    $('#resetFilters').on('click', function() { 
        $('#f_div, #f_cat, #f_grp, #f_age, #f_status').val(null).trigger('change.select2'); 
        $('#hideFueraTemporada').prop('checked', false);
        updateSubFilters('div'); 
        applyFilters(); 
    });

    $('#mainTable tbody').on('click', 'tr', function () {
        let rowData = mainTable.row(this).data();
        if (!rowData) return;
        let htmlString = rowData[0];
        let rawGrp = htmlString.substring(0, htmlString.indexOf('<br>')).replace(/<[^>]*>?/gm, '').trim();
        let groupData = dataBase.find(d => d.grp === rawGrp);
        if (groupData) openDrillDown(groupData);
    });
});

// ==========================================
// FUNCIÓN FILTRO DE TIENDAS (EL NUEVO MENÚ)
// ==========================================
function filterTiendas(type) {
    tiendasTable.column(0).search(''); // Limpiamos primero
    
    if (type === 'MAYOREO') {
        tiendasTable.column(0).search('MAYOREO', false, true).draw();
    } else if (type === 'AEC_DETALLE') {
        tiendasTable.column(0).search('AEC DETALLE', false, true).draw();
    } else if (type === 'DS') {
        tiendasTable.column(0).search('DS|VITRINA', true, false).draw();
    } else {
        tiendasTable.draw(); // ALL
    }
}

// ==========================================
// EXTRACCIÓN ZIP
// ==========================================
async function fetchAndUnzip(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error("No se pudo descargar el archivo: " + url);
    const blob = await response.blob();
    const zip = await JSZip.loadAsync(blob);
    let csvText = null;
    for (let filename of Object.keys(zip.files)) {
        let fileObj = zip.files[filename];
        if (!fileObj.dir) {
            csvText = await fileObj.async("string");
            break;
        }
    }
    if (!csvText) throw new Error("El archivo ZIP está vacío.");
    return csvText;
}

function loadCSVData() {
    Promise.all([
        fetchAndUnzip('sugerido_v2.zip'),
        fetch('saldo_2.csv').then(res => { if(!res.ok) throw new Error("No se encontró saldo_2.csv"); return res.text(); })
    ]).then(([sugeridoText, saldoText]) => {
        let sugeridoRaw = Papa.parse(sugeridoText, { header: true, skipEmptyLines: true, delimiter: ";" }).data;
        let saldoRaw = Papa.parse(saldoText, { header: true, skipEmptyLines: true, delimiter: ";" }).data;
        
        if (!sugeridoRaw || sugeridoRaw.length === 0) throw new Error("El CSV de Sugerido está vacío.");

        let dataMap = {};

        let headersSug = Object.keys(sugeridoRaw[0]);
        const getCol = (headers, exactName, fallback) => {
            let match = headers.find(h => h.trim().toLowerCase() === exactName.toLowerCase());
            if (match) return match;
            match = headers.find(h => h.trim().toLowerCase() === fallback.toLowerCase());
            if (match) return match;
            match = headers.find(h => h.trim().toLowerCase().includes(exactName.toLowerCase()));
            if (match) return match;
            match = headers.find(h => h.trim().toLowerCase().includes(fallback.toLowerCase()));
            return match || exactName;
        };
        
        let k_grp = getCol(headersSug, "Grupo", "grupo");
        let k_div = getCol(headersSug, "Division", "division");
        let k_cat = getCol(headersSug, "Categoria", "categoria");
        let k_grpId = getCol(headersSug, "Grupo ID", "grupo id");
        let k_tienda = getCol(headersSug, "Nombre Tienda", "tienda");
        let k_saldoT = getCol(headersSug, "Saldo Tienda", "saldo tienda");
        let k_sAEC = getCol(headersSug, "Sugerido AEC", "aec");
        let k_sDS = getCol(headersSug, "Sugerido DS", "ds");
        let k_nDetAEC = getCol(headersSug, "Necesidad detalle AEC", "detalle aec");
        let k_nMayAEC = getCol(headersSug, "Necesidad mayoreo AEC", "mayoreo aec");
        let k_nDS = getCol(headersSug, "Necesidad DS", "necesidad ds");

        sugeridoRaw.forEach(row => {
            let grp = (row[k_grp] || "").trim();
            if(!grp || grp === "SIN GRP") return;

            if(!dataMap[grp]) {
                dataMap[grp] = { div: (row[k_div] || "").trim(), cat: (row[k_cat] || "").trim(), grp_id: (row[k_grpId] || "").trim(), grp: grp, s_aec: 0, s_ds: 0, n_aec: 0, n_may: 0, n_ds: 0, total_nec: 0, max_age: -1, tiendas: [], skusMap: new Map() };
            }

            let tiendaNombre = (row[k_tienda] || "").trim();
            let necDet = Math.round(parseFloat(row[k_nDetAEC]) || 0);
            let necMay = Math.round(parseFloat(row[k_nMayAEC]) || 0);
            let necDS = Math.round(parseFloat(row[k_nDS]) || 0);

            let isMayoreo = tiendaNombre.toUpperCase().includes("MAYOREO") || 
                            tiendaNombre.toUpperCase().includes("AEC") || 
                            tiendaNombre.toUpperCase().includes("DS") || 
                            necMay > 0;

            let tipoTienda = isMayoreo ? "MAYOREO" : "DETALLE";

            let sugAEC = Math.round(parseFloat(row[k_sAEC]) || 0);
            let sugDS = Math.round(parseFloat(row[k_sDS]) || 0);

            dataMap[grp].n_aec += necDet;
            dataMap[grp].n_may += necMay;
            dataMap[grp].n_ds += necDS;

            let rowTotalNec = necDet + necMay + necDS;
            let rowTotalSug = sugAEC + sugDS; 
            
            if ((rowTotalNec > 0 || rowTotalSug > 0) && tiendaNombre !== "") {
                dataMap[grp].tiendas.push({ 
                    nombre: tiendaNombre, 
                    tipo: tipoTienda, 
                    sugerido: rowTotalSug, 
                    saldo_t: Math.round(parseFloat(row[k_saldoT]) || 0), 
                    necesidad: rowTotalNec 
                });
            }
        });

        let headersSal = Object.keys(saldoRaw[0]);
        let k_sGrp = getCol(headersSal, "Grupo", "grupo");
        let k_sProd = getCol(headersSal, "Producto", "producto");
        let k_sMarca = getCol(headersSal, "Marca", "marca");
        let k_sDesc = getCol(headersSal, "ProdNombre", "prodnombre");
        let k_sFechaEC = getCol(headersSal, "UltFecha_EC", "ultfecha_ec");
        let k_sFechaDS = getCol(headersSal, "UltFecha_DS", "ultfecha_ds");
        let k_sSaldoEC = getCol(headersSal, "SaldoUND_EC", "salbound_ec");
        let k_sSaldoDS = getCol(headersSal, "SaldoUND_DS", "salbound_ds");

        saldoRaw.forEach(row => {
            let grp = (row[k_sGrp] || "").trim();
            if(dataMap[grp]) {
                let dEC = excelToDate(row[k_sFechaEC]);
                let dDS = excelToDate(row[k_sFechaDS]);
                let age = Math.max(calcularDias(dEC), calcularDias(dDS));
                
                let sAEC = Math.round(parseFloat(row[k_sSaldoEC]) || 0);
                let sDS = Math.round(parseFloat(row[k_sSaldoDS]) || 0);

                dataMap[grp].s_aec += sAEC; dataMap[grp].s_ds += sDS;

                dataMap[grp].skusMap.set((row[k_sProd] || "").trim(), { 
                    cod: (row[k_sProd] || "").trim(), marca: (row[k_sMarca] || "").trim(), desc: (row[k_sDesc] || "").trim(), 
                    s_aec: sAEC, s_ds: sDS, total: sAEC + sDS, f_ec: formatearFecha(dEC), f_ds: formatearFecha(dDS), age: age
                });

                if(age > dataMap[grp].max_age) dataMap[grp].max_age = age;
            }
        });

        dataBase = Object.values(dataMap);
        
        dataBase.forEach(row => { 
            row.skus = Array.from(row.skusMap.values());
            delete row.skusMap;

            row.age_cat = getAgeCategory(row.max_age); 
            let s = row.s_aec + row.s_ds;
            let n = row.n_aec + row.n_may + row.n_ds;
            row.total_nec = n; 
            let cob = n > 0 ? (s / n * 100) : (s > 0 ? 999 : 0);
            let season = checkSeason(row.div, row.cat, row.grp);
            let r = reglasLogisticas[row.div] || reglasLogisticas["DEFAULT"];

            if (season === "FUERA" && s > 0) row.est_gerencial = 'Inmovilizado';
            else if (n === 0 && s > 0) row.est_gerencial = 'Sano';
            else if (cob < 50) row.est_gerencial = 'Comprar Urgente';
            else if (cob <= 110) row.est_gerencial = 'En Tiempo';
            else row.est_gerencial = 'Sano';

            if (season === "FUERA") row.est_operativo = 'Fuera de Temporada';
            else if (n === 0) row.est_operativo = 'Completado';
            else if (s === 0) row.est_operativo = 'Quiebre';
            else if (s <= r.limiteFantasma && row.max_age > 90) row.est_operativo = 'Residual';
            else if (s < n) row.est_operativo = 'Faltante';
            else if (n >= r.minUrgencia || season === "ALTA") row.est_operativo = 'Prioridad Alta';
            else row.est_operativo = 'Surtido Normal';
        });

        $('#loadingOverlay').fadeOut(500, function() {
            $('#mainScreen').removeClass('hidden-screen');
            initFilters(); applyFilters(); 
        });

    }).catch(error => { 
        console.error("Error FATAL:", error); 
        $('#loadingOverlay .spinner-border').hide();
        $('#loadingText').text("⚠️ Falla al leer los archivos");
        $('#errorBox').removeClass('d-none').html(`<b>Error procesando datos:</b> ${error.message}`);
    });
}

function rebuildSelect(id, options, selectedArr) {
    let $el = $(id); $el.empty();
    options.forEach(o => { let isSelected = selectedArr ? selectedArr.includes(o) : false; $el.append(new Option(o, o, isSelected, isSelected)); });
    $el.trigger('change.select2');
}

function initFilters() {
    if(dataBase.length === 0) return;
    let divs = [...new Set(dataBase.map(i => i.div))].sort();
    let ages = [...new Set(dataBase.map(i => i.age_cat))].sort();
    rebuildSelect('#f_div', divs, []); rebuildSelect('#f_age', ages, []);
    updateStatusFilterOptions(); updateSubFilters('div');
}

function updateSubFilters(triggeredBy) {
    let selDiv = $('#f_div').val() || []; let selCat = $('#f_cat').val() || []; let d = dataBase;
    if (triggeredBy === 'div') {
        if (selDiv.length) d = d.filter(r => selDiv.includes(r.div));
        rebuildSelect('#f_cat', [...new Set(d.map(i => i.cat))].sort(), $('#f_cat').val());
        selCat = $('#f_cat').val() || [];
        if (selCat.length) d = d.filter(r => selCat.includes(r.cat));
        rebuildSelect('#f_grp', [...new Set(d.map(i => i.grp))].sort(), $('#f_grp').val());
    } else if (triggeredBy === 'cat') {
        if (selDiv.length) d = d.filter(r => selDiv.includes(r.div));
        if (selCat.length) d = d.filter(r => selCat.includes(r.cat));
        rebuildSelect('#f_grp', [...new Set(d.map(i => i.grp))].sort(), $('#f_grp').val());
    }
}

function updateStatusFilterOptions() {
    let statuses = [...new Set(dataBase.map(i => currentView === 'gerencial' ? i.est_gerencial : i.est_operativo))].sort();
    $('#lbl_f_status').html(currentView === 'gerencial' ? '📊 Estado Gerencial' : '🚀 Prioridad Picking');
    rebuildSelect('#f_status', statuses, []);
}

function applyFilters() {
    let f = { d: $('#f_div').val() || [], c: $('#f_cat').val() || [], g: $('#f_grp').val() || [], a: $('#f_age').val() || [], s: $('#f_status').val() || [] };
    let hideTemp = $('#hideFueraTemporada').is(':checked');

    let filtered = dataBase.filter(r => 
        (!f.d.length || f.d.includes(r.div)) && 
        (!f.c.length || f.c.includes(r.cat)) && 
        (!f.g.length || f.g.includes(r.grp)) && 
        (!f.a.length || f.a.includes(r.age_cat)) && 
        (!f.s.length || (currentView === 'gerencial' ? f.s.includes(r.est_gerencial) : f.s.includes(r.est_operativo))) &&
        (!hideTemp || r.est_operativo !== 'Fuera de Temporada')
    );
    renderDashboard(filtered);
}

function renderDashboard(data) {
    mainTable.clear();
    let tS = 0, tN = 0; let k = { m1: 0, m2: 0, m3: 0, m4: 0, m5: 0 }; let divSum = {}; 

    data.forEach(row => {
        let s = row.s_aec + row.s_ds; let n = row.total_nec;
        tS += s; tN += n;
        if(!divSum[row.div]) divSum[row.div] = 0; divSum[row.div] += n;

        let col7 = { display: '', sortValue: 0 }; let col8 = { display: '', sortValue: 0 };
        
        let dsCol = { 
            display: row.n_ds > 0 ? `<span class="text-danger fw-bold">${row.n_ds.toLocaleString('en-US')}</span>` : '<span class="text-danger">0</span>', 
            sortValue: row.n_ds 
        };

        if (currentView === 'gerencial') {
            let cob = n > 0 ? (s / n * 100) : (s > 0 ? 999 : 0); col7.sortValue = cob;
            col7.display = row.est_gerencial === 'Inmovilizado' ? `<b class="text-danger">${cob > 100 ? '> 100' : cob.toFixed(0)}%</b>` : (n > 0 ? `<b class="text-primary">${cob.toFixed(0)}%</b>` : (s > 0 ? '<b class="text-success">> 100%</b>' : '<b>0%</b>'));
            
            let cssColor = '';
            if (row.est_gerencial === 'Sano') cssColor = 'bg-verde';
            else if (row.est_gerencial === 'Comprar Urgente') cssColor = 'bg-rojo';
            else if (row.est_gerencial === 'En Tiempo') cssColor = 'bg-amarillo';
            else cssColor = 'bg-morado';

            col8.display = label(row.est_gerencial, cssColor); 
            col8.sortValue = row.est_gerencial === 'Comprar Urgente' ? 1 : 3;

            if (row.est_gerencial === 'Comprar Urgente') k.m1++; else if (row.est_gerencial === 'En Tiempo') k.m2++; else k.m3++;
        } else {
            let surtir = Math.min(s, n); let falta = n - s; col7.sortValue = surtir;
            col7.display = `<b class="fs-6 text-dark">📦 ${surtir.toLocaleString('en-US')}</b>${falta > 0 ? `<br><small class="text-danger fw-bold">Faltan: ${falta.toLocaleString('en-US')}</small>`:''}`;
            
            let cssColor = '';
            let textDisplay = row.est_operativo;
            if (row.est_operativo === 'Completado') cssColor = 'bg-verde';
            else if (row.est_operativo === 'Quiebre') { cssColor = 'bg-dark text-white'; textDisplay = 'Quiebre (Saldo 0)'; }
            else if (row.est_operativo === 'Residual' || row.est_operativo === 'Fuera de Temporada') cssColor = 'bg-gris';
            else if (row.est_operativo === 'Faltante') cssColor = 'bg-rojo';
            else if (row.est_operativo === 'Prioridad Alta') { cssColor = 'bg-rojo'; textDisplay = '🔥 Prioridad Alta'; }
            else cssColor = 'bg-amarillo';

            col8.display = label(textDisplay, cssColor); col8.sortValue = 1;

            if (row.est_operativo === 'Quiebre' || row.est_operativo === 'Faltante') k.m1++; else if (row.est_operativo === 'Prioridad Alta' || row.est_operativo === 'Surtido Normal') k.m2++; else if (row.est_operativo === 'Fuera de Temporada') k.m5++; else k.m4++;
        }

        mainTable.row.add([ `<b>${row.grp}</b><br><small class="text-muted">${row.grp_id}</small>`, row.div, s, row.n_aec, row.n_may, dsCol, n, col7, col8 ]);
    });
    
    mainTable.draw(); updateUI(tS, tN, k, divSum);
}

function updateUI(s, n, k, divSum) {
    $('#kpiSaldo').text(Math.round(s).toLocaleString('en-US')); $('#kpiNec').text(Math.round(n).toLocaleString('en-US'));
    if (currentView === 'gerencial') { $('#lblCritico').text('Comprar Urgente'); $('#kpiCriticos').text(k.m1); $('#lblAjustado').text('En Tiempo'); $('#kpiAjustados').text(k.m2).attr('class', 'text-warning mb-0 fs-2 fw-bold'); $('#lblOptimo').text('Sano / Inmov.'); $('#kpiOptimos').text(k.m3);
    } else { $('#lblCritico').text('Quiebre / Faltante'); $('#kpiCriticos').text(k.m1); $('#lblAjustado').text('Por Surtir'); $('#kpiAjustados').text(k.m2).attr('class', 'text-warning mb-0 fs-2 fw-bold'); $('#lblOptimo').text('Residual / Completado'); $('#kpiOptimos').text(k.m4 + k.m5); }

    let sorted = Object.entries(divSum).sort((a,b) => b[1] - a[1]).slice(0, 10);
    
    if(necessityChart) necessityChart.destroy();
    necessityChart = new Chart(document.getElementById('chartNecessity').getContext('2d'), { 
        type: 'bar', 
        data: { labels: sorted.map(i => i[0]), datasets: [{ label: 'Necesidad', data: sorted.map(i => i[1]), backgroundColor: 'rgba(225, 37, 27, 0.85)', borderColor: '#E1251B', borderWidth: 1 }] }, 
        options: { 
            responsive: true, maintainAspectRatio: false, 
            plugins: { datalabels: { anchor: 'end', align: 'top', formatter: (v) => Math.round(v).toLocaleString('en-US'), font: { weight: 'bold', size: 10 }, color: '#E1251B' }, legend: { display: false } }, 
            scales: { 
                x: { grid: { display: false }, ticks: { font: { size: 9 }, maxRotation: 45, minRotation: 45 } },
                y: { display: false, grid: { display: false } } 
            } 
        } 
    });

    let labelsPie = currentView === 'gerencial' ? ['Urgente', 'En Tiempo', 'Sano'] : ['Quiebre/Faltante', 'Por Surtir', 'Inactivos'];
    let colorsPie = currentView === 'gerencial' ? ['#dc3545', '#ffc107', '#198754'] : ['#212529', '#ffc107', '#e9ecef'];
    if(statusChart) statusChart.destroy();
    statusChart = new Chart(document.getElementById('chartStatus').getContext('2d'), { type: 'doughnut', data: { labels: labelsPie, datasets: [{ data: [k.m1, k.m2, k.m3+k.m4+k.m5], backgroundColor: colorsPie, borderWidth: 2 }] }, options: { responsive: true, maintainAspectRatio: false, cutout: '65%', plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } }, datalabels: { formatter: (value, ctx) => { let sum = ctx.chart.data.datasets[0].data.reduce((a, b) => a + b, 0); return value > 0 ? (value * 100 / sum).toFixed(1) + "%" : ''; }, color: '#444', font: { weight: 'bold' } } } } });
}

function switchView(v) { 
    currentView = v; 
    $('.view-btn').removeClass('active'); 
    $(`#btn${v.charAt(0).toUpperCase() + v.slice(1)}`).addClass('active'); 
    
    if(v === 'operativo') {
        $('#toggleTemporadaContainer').show();
    } else {
        $('#toggleTemporadaContainer').hide();
        $('#hideFueraTemporada').prop('checked', false);
    }
    
    updateStatusFilterOptions(); 
    applyFilters(); 
}

function openDrillDown(g) {
    $('#mainScreen').addClass('hidden-screen'); $('#drillDownScreen').removeClass('hidden-screen');
    $('#detailDivCat').text(`${g.div} > ${g.cat}`); $('#detailGroupName').text(g.grp);

    // Reinicia los filtros de tienda por defecto cada vez que abres un grupo
    $('#fT_all').prop('checked', true);
    tiendasTable.column(0).search('');

    let nT = g.total_nec; 
    let sT = g.s_aec + g.s_ds; 
    let fT = nT - sT > 0 ? nT - sT : 0;
    
    $('#detNecTotal').text(nT.toLocaleString('en-US')); 
    $('#detSaldoTotal').text(sT.toLocaleString('en-US'));
    
    if (currentView === 'gerencial') {
        $('#detFaltanteTitle').text('Cobertura'); 
        let cob = nT > 0 ? (sT / nT * 100).toFixed(1) + '%' : '> 100%';
        $('#detFaltante').text(cob).removeClass('text-danger').addClass('text-dark');
        let mColor = g.est_gerencial === 'Sano' ? 'bg-verde' : (g.est_gerencial === 'Comprar Urgente' ? 'bg-rojo' : (g.est_gerencial === 'Inmovilizado' ? 'bg-morado' : 'bg-amarillo'));
        $('#detEstadoBadge').html(label(g.est_gerencial, mColor));
    } else {
        $('#detFaltanteTitle').text('Saldo Insuficiente (Faltan)');
        $('#detFaltante').text(fT.toLocaleString('en-US')).removeClass('text-dark').addClass('text-danger');
        let mColor = g.est_operativo === 'Completado' ? 'bg-verde' : (g.est_operativo === 'Quiebre' || g.est_operativo === 'Faltante' ? 'bg-rojo' : (g.est_operativo === 'Residual' || g.est_operativo === 'Fuera de Temporada' ? 'bg-gris' : 'bg-amarillo'));
        $('#detEstadoBadge').html(label(g.est_operativo, mColor));
    }

    g.tiendas.sort((a, b) => b.necesidad - a.necesidad);

    tiendasTable.clear();
    g.tiendas.forEach(t => {
        let badge = '';
        if (t.necesidad > 0 && t.necesidad > t.saldo_t) {
            badge = label('Urgente', 'bg-rojo');
        } else if (t.necesidad > 0) {
            badge = label('Surtir', 'bg-amarillo');
        } else {
            badge = label('Ok', 'bg-verde');
        }

        let isDS = t.nombre.toUpperCase().includes('DS') || t.nombre.toUpperCase().includes('VITRINA');
        let nombreDisplay = isDS ? `<b class="text-danger">${t.nombre}</b>` : `<b>${t.nombre}</b>`;
        
        let col_req = { display: `<b class="text-danger fs-6">${t.necesidad.toLocaleString('en-US')}</b>`, sortValue: t.necesidad };
        
        tiendasTable.row.add([ `${nombreDisplay}<br><small class="text-muted">${t.tipo}</small>`, t.sugerido, t.saldo_t, col_req, badge ]);
    });
    tiendasTable.draw();

    g.skus.sort((a, b) => b.total - a.total);

    skuTable.clear();
    g.skus.filter(s => s.total > 0).forEach(s => { 
        let col_f_ds = { display: `<span class="text-danger fw-bold">${s.f_ds || ''}</span>`, sortValue: s.f_ds || '' };
        let col_s_ds = { display: `<b class="text-danger fs-6">${s.s_ds.toLocaleString('en-US')}</b>`, sortValue: s.s_ds };
        let col_tot = { display: `<b class="fs-6 text-dark">${s.total.toLocaleString('en-US')}</b>`, sortValue: s.total };
        
        skuTable.row.add([ `<span class="fw-bold text-primary">${s.cod}</span>`, `<small>${s.desc}</small>`, s.marca || '', s.f_ec || '', s.s_aec, col_f_ds, col_s_ds, col_tot ]); 
    });
    skuTable.draw();
}

function closeDrillDown() { $('#drillDownScreen').addClass('hidden-screen'); $('#mainScreen').removeClass('hidden-screen'); }

// ==========================================
// FIN DEL CÓDIGO
// ==========================================
