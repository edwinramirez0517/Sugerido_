// ==========================================
// CONFIGURACIÓN INICIAL
// ==========================================
Chart.register(ChartDataLabels);

let dataBase = [];
let mainTable, skuTable, tiendasTable;
let necessityChart, statusChart;
let currentView = 'gerencial'; 
const TODAY = new Date('2026-04-28'); 
const CURRENT_MONTH = TODAY.getMonth() + 1; // Abril = 4

// TUS REGLAS LOGÍSTICAS ORIGINALES
const reglasLogisticas = {
    "PASEO": { limiteFantasma: 0, minUrgencia: 1 },
    "HOGAR": { limiteFantasma: 0, minUrgencia: 1 },
    "ROPA": { limiteFantasma: 12, minUrgencia: 24 },
    "CALZADO": { limiteFantasma: 12, minUrgencia: 24 },
    "CALZADO PLASTICO": { limiteFantasma: 12, minUrgencia: 24 },
    "INTERIOR DETALLE": { limiteFantasma: 24, minUrgencia: 48 },
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
// EVALUAR TEMPORADAS (REPARADO DIA DE LA MADRE)
// ==========================================
function checkSeason(div, cat, grp) {
    let text = `${div} ${cat} ${grp}`.toUpperCase();
    if (text.includes("ESCOLAR") || text.includes("MOCHILA") || text.includes("CUADERNO")) return [12, 1, 2].includes(CURRENT_MONTH) ? "ALTA" : "FUERA";
    if (text.includes("VALENTIN") || text.includes("AMOR")) return [1, 2].includes(CURRENT_MONTH) ? "ALTA" : "FUERA";
    if (text.includes("VERANO") || text.includes("PLAYA") || text.includes("PISCINA") || text.includes("TRAJE DE BAÑO")) return [3, 4].includes(CURRENT_MONTH) ? "ALTA" : "FUERA";
    
    // DIA DE LA MADRE: Validamos MAMA, MADRE y también DAMA o BELLEZA para que jale todo lo de mujer en Abril y Mayo
    if ((text.includes("MAMA") || text.includes("MADRE") || text.includes("DAMA") || text.includes("BELLEZA")) && [4, 5].includes(CURRENT_MONTH)) return "ALTA";
    
    if (["HOGAR", "TECNOLOGIA", "PASEO"].includes(div.toUpperCase()) && [6, 7].includes(CURRENT_MONTH)) return "ALTA";
    if ((text.includes("NIÑO") || text.includes("JUGUET")) && [8, 9].includes(CURRENT_MONTH)) return "ALTA";
    if (text.includes("NAVIDAD") || text.includes("PASCUA") || text.includes("LUCES")) return [9, 10, 11, 12].includes(CURRENT_MONTH) ? "ALTA" : "FUERA";
    return "NORMAL"; 
}

// ==========================================
// INICIALIZACIÓN TABLAS
// ==========================================
$(document).ready(function() {
    mainTable = $('#mainTable').DataTable({
        language: { url: 'https://cdn.datatables.net/plug-ins/1.13.6/i18n/es-ES.json' },
        pageLength: 10,
        lengthMenu: [10, 25, 50, 100],
        columnDefs: [
            { className: "text-center align-middle", targets: "_all" },
            { targets: [2, 3, 4, 5, 6], render: $.fn.dataTable.render.number(',', '.', 0, '') },
            { targets: [7, 8], render: function (data, type, row) { return (type === 'sort' || type === 'type') ? data.sortValue : data.display; } }
        ],
        createdRow: function(row) { $(row).addClass('clickable-row'); }
    });

    tiendasTable = $('#tiendasTable').DataTable({ 
        language: { url: 'https://cdn.datatables.net/plug-ins/1.13.6/i18n/es-ES.json' },
        pageLength: 10, lengthChange: false,
        columnDefs: [{ className: "text-center align-middle", targets: "_all" }, { targets: [1, 2], render: $.fn.dataTable.render.number(',', '.', 0, '') }]
    });

    skuTable = $('#skuTable').DataTable({ 
        language: { url: 'https://cdn.datatables.net/plug-ins/1.13.6/i18n/es-ES.json' },
        pageLength: 10, lengthChange: false,
        columnDefs: [{ className: "text-center align-middle", targets: "_all" }, { targets: [4, 6, 7], render: $.fn.dataTable.render.number(',', '.', 0, '') }]
    });

    $('#f_div, #f_cat, #f_grp, #f_age, #f_status').select2({ theme: 'bootstrap-5', width: '100%', placeholder: "Todos" });
    
    // Iniciar carga de datos
    loadCSVData();

    $('#f_div').on('select2:select select2:unselect', function() { updateSubFilters('div'); applyFilters(); });
    $('#f_cat').on('select2:select select2:unselect', function() { updateSubFilters('cat'); applyFilters(); });
    $('#f_grp, #f_age, #f_status').on('select2:select select2:unselect', function() { applyFilters(); });

    $('#resetFilters').on('click', function() {
        $('#f_div, #f_cat, #f_grp, #f_age, #f_status').val(null).trigger('change.select2');
        updateSubFilters('div'); applyFilters(); 
    });

    // Clic en fila corregido para evitar errores
    $('#mainTable tbody').on('click', 'tr', function () {
        let rowData = mainTable.row(this).data();
        if (!rowData) return;
        
        let htmlString = rowData[0];
        let rawGrp = htmlString.substring(0, htmlString.indexOf('<br>')).replace(/<[^>]*>?/gm, '').trim();
        
        let groupData = dataBase.find(d => d.grp === rawGrp);
        if (groupData) {
            openDrillDown(groupData);
        } else {
            alert("No se encontró el detalle de este grupo.");
        }
    });
});

// ==========================================
// EXTRACCIÓN ZIP Y PROCESAMIENTO
// ==========================================
async function fetchAndUnzip(url, filenameInsideZip) {
    const response = await fetch(url);
    if (!response.ok) throw new Error("No se encontró el archivo " + url);
    const blob = await response.blob();
    const zip = await JSZip.loadAsync(blob);
    return await zip.file(filenameInsideZip).async("string");
}

function loadCSVData() {
    Promise.all([
        fetchAndUnzip('sugerido_v2.zip', 'sugerido_v2.csv'),
        fetch('saldo_2.csv').then(res => {
            if(!res.ok) throw new Error("No se encontró saldo_2.csv"); 
            return res.text(); 
        })
    ]).then(([sugeridoText, saldoText]) => {
        let sugeridoRaw = Papa.parse(sugeridoText, { header: true, skipEmptyLines: true, delimiter: ";" }).data;
        let saldoRaw = Papa.parse(saldoText, { header: true, skipEmptyLines: true, delimiter: ";" }).data;
        
        let dataMap = {};

        // 1. PROCESAR NECESIDADES DE TIENDA Y GLOBAL UNIFICADO
        sugeridoRaw.forEach(row => {
            let grp = (row["Grupo"] || "").trim();
            if(!grp || grp === "SIN GRP") return;

            if(!dataMap[grp]) {
                dataMap[grp] = {
                    div: (row["Division"] || "").trim(), cat: (row["Categoria"] || "").trim(), grp_id: (row["Grupo ID"] || "").trim(), grp: grp,
                    s_aec: 0, s_ds: 0, n_aec: 0, n_may: 0, n_ds: 0, total_nec: 0, max_age: -1, tiendas: [], skus: []
                };
            }

            let tiendaNombre = (row["Nombre Tienda"] || "").trim();
            let tipoTienda = (row["Tipo de Tienda"] || "").toUpperCase().trim();
            if(tiendaNombre.includes("AEC") || tiendaNombre.includes("DS")) tipoTienda = "MAYOREO";

            // Aquí estaba el error en la versión anterior. Debemos capturar TODA la necesidad de la fila.
            let sugAEC = Math.round(parseFloat(row["Sugerido AEC"]) || 0);
            let sugDS = Math.round(parseFloat(row["Sugerido DS"]) || 0);
            let necDet = Math.round(parseFloat(row["Necesidad detalle AEC"]) || 0);
            let necMay = Math.round(parseFloat(row["Necesidad mayoreo AEC"]) || 0);
            let necDS = Math.round(parseFloat(row["Necesidad DS"]) || 0);

            // Sumamos a los totales globales de gerencia
            dataMap[grp].n_aec += (sugAEC + necDet);
            dataMap[grp].n_may += necMay;
            dataMap[grp].n_ds += (sugDS + necDS);

            // Total de esa tienda específica
            let rowTotalNec = sugAEC + sugDS + necDet + necMay + necDS;

            if (rowTotalNec > 0 && tiendaNombre !== "") {
                dataMap[grp].tiendas.push({
                    nombre: tiendaNombre, tipo: tipoTienda,
                    saldo_t: Math.round(parseFloat(row["Saldo Tienda"]) || 0),
                    necesidad: rowTotalNec
                });
            }
        });

        // 2. PROCESAR SALDOS DE BODEGA Y ANTIGÜEDAD
        saldoRaw.forEach(row => {
            let grp = (row["Grupo"] || "").trim();
            if(dataMap[grp]) {
                let dEC = excelToDate(row["UltFecha_EC"]);
                let dDS = excelToDate(row["UltFecha_DS"]);
                let age = Math.max(calcularDias(dEC), calcularDias(dDS));
                
                let sAEC = Math.round(parseFloat(row["SaldoUND_EC"]) || 0);
                let sDS = Math.round(parseFloat(row["SaldoUND_DS"]) || 0);

                dataMap[grp].s_aec += sAEC;
                dataMap[grp].s_ds += sDS;

                dataMap[grp].skus.push({ 
                    cod: (row["Producto"] || "").trim(), marca: (row["Marca"] || "").trim(), desc: (row["ProdNombre"] || "").trim(), 
                    s_aec: sAEC, s_ds: sDS, total: sAEC + sDS, f_ec: formatearFecha(dEC), f_ds: formatearFecha(dDS), age: age
                });

                if(age > dataMap[grp].max_age) dataMap[grp].max_age = age;
            }
        });

        dataBase = Object.values(dataMap);
        
        // 3. APLICAR REGLAS Y ESTADOS (AHORA CON NÚMEROS REALES)
        dataBase.forEach(row => { 
            row.age_cat = getAgeCategory(row.max_age); 
            
            let s = row.s_aec + row.s_ds;
            let n = row.n_aec + row.n_may + row.n_ds;
            row.total_nec = n; // Guardamos explícito

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

        // 4. QUITAR PANTALLA DE CARGA Y MOSTRAR DASHBOARD
        $('#loadingOverlay').fadeOut(500, function() {
            $('#mainScreen').removeClass('hidden-screen');
            initFilters();
            applyFilters(); 
        });

    }).catch(error => { 
        console.error("Error CSV/ZIP:", error); 
        $('#loadingOverlay .spinner-border').hide();
        $('#loadingText').text("⚠️ Error de Conexión o Archivos");
        $('#errorBox').removeClass('d-none').html(`
            <b>Fallo al procesar los datos logísticos.</b><br>
            Asegúrate de que los archivos estén en Github correctamente:<br>
            1. <code>sugerido_v2.zip</code> (Que dentro tenga el CSV).<br>
            2. <code>saldo_2.csv</code>.<br>
            <hr>
            <small>Detalle Técnico: ${error.message}</small>
        `);
    });
}

// ==========================================
// FILTROS EN CASCADA
// ==========================================
function rebuildSelect(id, options, selectedArr) {
    let $el = $(id);
    $el.empty();
    options.forEach(o => {
        let isSelected = selectedArr ? selectedArr.includes(o) : false;
        $el.append(new Option(o, o, isSelected, isSelected));
    });
    $el.trigger('change.select2');
}

function initFilters() {
    if(dataBase.length === 0) return;
    let divs = [...new Set(dataBase.map(i => i.div))].sort();
    let ages = [...new Set(dataBase.map(i => i.age_cat))].sort();
    rebuildSelect('#f_div', divs, []);
    rebuildSelect('#f_age', ages, []);
    updateStatusFilterOptions();
    updateSubFilters('div');
}

function updateSubFilters(triggeredBy) {
    let selDiv = $('#f_div').val() || [];
    let selCat = $('#f_cat').val() || [];
    let d = dataBase;
    
    if (triggeredBy === 'div') {
        if (selDiv.length) d = d.filter(r => selDiv.includes(r.div));
        let cats = [...new Set(d.map(i => i.cat))].sort();
        rebuildSelect('#f_cat', cats, $('#f_cat').val());
        
        selCat = $('#f_cat').val() || [];
        if (selCat.length) d = d.filter(r => selCat.includes(r.cat));
        let grps = [...new Set(d.map(i => i.grp))].sort();
        rebuildSelect('#f_grp', grps, $('#f_grp').val());
    } else if (triggeredBy === 'cat') {
        if (selDiv.length) d = d.filter(r => selDiv.includes(r.div));
        if (selCat.length) d = d.filter(r => selCat.includes(r.cat));
        let grps = [...new Set(d.map(i => i.grp))].sort();
        rebuildSelect('#f_grp', grps, $('#f_grp').val());
    }
}

function updateStatusFilterOptions() {
    let statuses = [...new Set(dataBase.map(i => currentView === 'gerencial' ? i.est_gerencial : i.est_operativo))].sort();
    $('#lbl_f_status').html(currentView === 'gerencial' ? '📊 Estado Gerencial' : '🚀 Prioridad Picking');
    rebuildSelect('#f_status', statuses, []);
}

function applyFilters() {
    let f = { 
        d: $('#f_div').val() || [], c: $('#f_cat').val() || [], 
        g: $('#f_grp').val() || [], a: $('#f_age').val() || [],
        s: $('#f_status').val() || []
    };
    
    let filtered = dataBase.filter(r => 
        (!f.d.length || f.d.includes(r.div)) && (!f.c.length || f.c.includes(r.cat)) &&
        (!f.g.length || f.g.includes(r.grp)) && (!f.a.length || f.a.includes(r.age_cat)) &&
        (!f.s.length || (currentView === 'gerencial' ? f.s.includes(r.est_gerencial) : f.s.includes(r.est_operativo)))
    );
    renderDashboard(filtered);
}

// ==========================================
// RENDERIZADO TABLA MAESTRA Y GRÁFICOS (RESTAURADO)
// ==========================================
function renderDashboard(data) {
    mainTable.clear();
    let tS = 0, tN = 0;
    let k = { m1: 0, m2: 0, m3: 0, m4: 0, m5: 0 }; 
    let divSum = {}; 

    const gerencialMap = {
        'Sano': { css: 'bg-verde', sort: 3 }, 'Comprar Urgente': { css: 'bg-rojo', sort: 1 },
        'En Tiempo': { css: 'bg-amarillo', sort: 2 }, 'Inmovilizado': { css: 'bg-morado', sort: 4 }
    };
    const operativoMap = {
        'Completado': { css: 'bg-verde', sort: 5 }, 'Quiebre': { css: 'bg-dark text-white', sort: 1, text: 'Quiebre (Saldo 0)' },
        'Residual': { css: 'bg-gris', sort: 6 }, 'Faltante': { css: 'bg-rojo', sort: 2 },
        'Prioridad Alta': { css: 'bg-rojo', sort: 3, text: '🔥 Prioridad Alta' }, 'Surtido Normal': { css: 'bg-amarillo', sort: 4 },
        'Fuera de Temporada': { css: 'bg-gris', sort: 7 }
    };

    data.forEach(row => {
        let s = row.s_aec + row.s_ds;
        let n = row.total_nec;
        tS += s; tN += n;
        
        if(!divSum[row.div]) divSum[row.div] = 0; divSum[row.div] += n;

        let col7 = { display: '', sortValue: 0 }; 
        let col8 = { display: '', sortValue: 0 };

        if (currentView === 'gerencial') {
            let cob = n > 0 ? (s / n * 100) : (s > 0 ? 999 : 0);
            col7.sortValue = cob;
            col7.display = row.est_gerencial === 'Inmovilizado' ? `<b class="text-danger">${cob > 100 ? '> 100' : cob.toFixed(0)}%</b>` : (n > 0 ? `<b class="text-primary">${cob.toFixed(0)}%</b>` : (s > 0 ? '<b class="text-success">> 100%</b>' : '<b>0%</b>'));
            let m = gerencialMap[row.est_gerencial] || gerencialMap['Sano'];
            col8.display = label(row.est_gerencial, m.css); col8.sortValue = m.sort;

            if (row.est_gerencial === 'Comprar Urgente') k.m1++; else if (row.est_gerencial === 'En Tiempo') k.m2++; else k.m3++;
        } else {
            let surtir = Math.min(s, n); let falta = n - s;
            col7.sortValue = surtir;
            col7.display = `<b class="fs-6 text-dark">📦 ${surtir.toLocaleString('en-US')}</b>${falta > 0 ? `<br><small class="text-danger fw-bold">Faltan: ${falta.toLocaleString('en-US')}</small>`:''}`;
            let m = operativoMap[row.est_operativo] || operativoMap['Completado'];
            col8.display = label(m.text || row.est_operativo, m.css); col8.sortValue = m.sort;

            if (row.est_operativo === 'Quiebre' || row.est_operativo === 'Faltante') k.m1++;
            else if (row.est_operativo === 'Prioridad Alta' || row.est_operativo === 'Surtido Normal') k.m2++;
            else if (row.est_operativo === 'Fuera de Temporada') k.m5++; else k.m4++;
        }

        mainTable.row.add([
            `<b>${row.grp}</b><br><small class="text-muted">${row.grp_id}</small>`, 
            row.div, s, row.n_aec, row.n_may, row.n_ds, n, col7, col8
        ]);
    });
    
    mainTable.draw();
    updateUI(tS, tN, k, divSum);
}

function updateUI(s, n, k, divSum) {
    $('#kpiSaldo').text(Math.round(s).toLocaleString('en-US'));
    $('#kpiNec').text(Math.round(n).toLocaleString('en-US'));

    if (currentView === 'gerencial') {
        $('#lblCritico').text('Comprar Urgente'); $('#kpiCriticos').text(k.m1);
        $('#lblAjustado').text('En Tiempo'); $('#kpiAjustados').text(k.m2).attr('class', 'text-warning mb-0 fs-2 fw-bold');
        $('#lblOptimo').text('Sano / Inmov.'); $('#kpiOptimos').text(k.m3);
    } else {
        $('#lblCritico').text('Quiebre / Faltante'); $('#kpiCriticos').text(k.m1);
        $('#lblAjustado').text('Por Surtir'); $('#kpiAjustados').text(k.m2).attr('class', 'text-warning mb-0 fs-2 fw-bold');
        $('#lblOptimo').text('Residual / Completado'); $('#kpiOptimos').text(k.m4 + k.m5);
    }

    let sorted = Object.entries(divSum).sort((a,b) => b[1] - a[1]).slice(0, 10);
    
    if(necessityChart) necessityChart.destroy();
    necessityChart = new Chart(document.getElementById('chartNecessity').getContext('2d'), {
        type: 'bar',
        data: { labels: sorted.map(i => i[0]), datasets: [{ label: 'Necesidad', data: sorted.map(i => i[1]), backgroundColor: 'rgba(225, 37, 27, 0.85)', borderColor: '#E1251B', borderWidth: 1 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { datalabels: { anchor: 'end', align: 'top', formatter: (v) => Math.round(v).toLocaleString('en-US'), font: { weight: 'bold', size: 10 }, color: '#E1251B' }, legend: { display: false } }, scales: { x: { ticks: { font: { size: 9 }, maxRotation: 45, minRotation: 45 } } } }
    });

    let labelsPie = currentView === 'gerencial' ? ['Urgente', 'En Tiempo', 'Sano'] : ['Quiebre/Faltante', 'Por Surtir', 'Inactivos'];
    let colorsPie = currentView === 'gerencial' ? ['#f8d7da', '#fff3cd', '#d1e7dd'] : ['#212529', '#ffc107', '#e9ecef'];

    if(statusChart) statusChart.destroy();
    statusChart = new Chart(document.getElementById('chartStatus').getContext('2d'), {
        type: 'doughnut',
        data: { labels: labelsPie, datasets: [{ data: [k.m1, k.m2, k.m3+k.m4+k.m5], backgroundColor: colorsPie, b
