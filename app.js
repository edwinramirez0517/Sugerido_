// app.js
Chart.register(ChartDataLabels);

let dataBase = [];
let mainTable, skuTable;
let necessityChart, statusChart;
let currentView = 'gerencial'; // Estado global de la vista

const TODAY = new Date('2026-04-28'); 

// ==========================================
// DICCIONARIO DE REGLAS LOGÍSTICAS (MÉTODOS)
// ==========================================
const reglasLogisticas = {
    "PASEO": { limiteFantasma: 0, minUrgencia: 1 },
    "HOGAR": { limiteFantasma: 0, minUrgencia: 1 },
    "JUGUETERIA": { limiteFantasma: 0, minUrgencia: 2 },
    "ROPA": { limiteFantasma: 12, minUrgencia: 24 },
    "CALZADO": { limiteFantasma: 12, minUrgencia: 24 },
    "CALZADO PLASTICO": { limiteFantasma: 12, minUrgencia: 24 },
    "INTERIOR DETALLE": { limiteFantasma: 24, minUrgencia: 48 },
    "DEFAULT": { limiteFantasma: 50, minUrgencia: 100 } // Belleza, Accesorios, etc.
};

// Si un grupo específico se comporta diferente a su división, ponlo aquí
const excepcionesGrupo = {
    "CARROS DE BATERIA": { limiteFantasma: 0, minUrgencia: 1 },
    "BICICLETAS": { limiteFantasma: 0, minUrgencia: 1 }
};

$(document).ready(function() {
    $('#f_div, #f_cat, #f_grp, #f_age').select2({ theme: 'bootstrap-5', width: '100%', placeholder: "Seleccionar..." });

    mainTable = $('#mainTable').DataTable({
        language: { url: 'https://cdn.datatables.net/plug-ins/1.13.6/i18n/es-ES.json' },
        responsive: true,
        pageLength: 10,
        lengthMenu: [10, 25, 50, 100],
        createdRow: function(row, data, dataIndex) { $(row).addClass('clickable-row'); }
    });

    skuTable = $('#skuTable').DataTable({
        language: { url: 'https://cdn.datatables.net/plug-ins/1.13.6/i18n/es-ES.json' },
        responsive: true, pageLength: 10
    });

    loadCSVData();

    $('#mainTable tbody').on('click', 'tr', function () {
        let rowData = mainTable.row(this).data();
        if (!rowData) return;
        let groupNameMatch = rowData[0].match(/<b>(.*?)<\/b>/);
        let groupName = groupNameMatch ? groupNameMatch[1] : "";
        let groupData = dataBase.find(d => d.grp === groupName);
        if (groupData) openDrillDown(groupData);
    });

    $('#resetFilters').on('click', function() {
        $('#f_div, #f_cat, #f_grp, #f_age').val(null).trigger('change');
        processDataAndPopulateUI(dataBase); 
    });
});

// ==========================================
// FUNCIONES DE FECHAS (SANEAMIENTO DE EXCEL)
// ==========================================
function excelToDate(serial) {
    if (!serial || String(serial).trim() === "" || isNaN(Number(serial))) return null;
    let utc_days  = Math.floor(Number(serial) - 25569);
    let utc_value = utc_days * 86400;                                        
    let date_info = new Date(utc_value * 1000);
    return new Date(date_info.getUTCFullYear(), date_info.getUTCMonth(), date_info.getUTCDate());
}

function formatearFecha(dateObj) {
    if (!dateObj) return "";
    let d = String(dateObj.getDate()).padStart(2, '0');
    let m = String(dateObj.getMonth() + 1).padStart(2, '0');
    return `${d}/${m}/${dateObj.getFullYear()}`;
}

function calcularDias(dateObj) {
    if (!dateObj) return -1;
    return Math.ceil(Math.abs(TODAY - dateObj) / (1000 * 60 * 60 * 24)); 
}

function getAgeCategory(maxAge) {
    if (maxAge < 0) return "Sin Dato";
    if (maxAge <= 30) return "Reciente (0-30 días)";
    if (maxAge <= 90) return "Stock Normal (31-90 días)";
    if (maxAge <= 180) return "Lento Mov. (91-180 días)";
    return "Estancado (>180 días)";
}

// ==========================================
// CARGA Y CRUCE DE ARCHIVOS CSV (PAPA PARSE)
// ==========================================
function loadCSVData() {
    Promise.all([
        fetch('sugerido.csv').then(res => res.text()),
        fetch('saldo.csv').then(res => res.text())
    ]).then(([sugeridoText, saldoText]) => {
        let sugeridoParsed = Papa.parse(sugeridoText, { header: true, skipEmptyLines: true, delimiter: ";" }).data;
        let saldoParsed = Papa.parse(saldoText, { header: true, skipEmptyLines: true, delimiter: ";" }).data;
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
                    d_ec: d_ec, d_ds: d_ds, max_age: max_age
                });
                if(max_age > dataMap[grpName].max_age) dataMap[grpName].max_age = max_age;
            }
        });

        dataBase = Object.values(dataMap);
        dataBase.forEach(g => { g.age_cat = getAgeCategory(g.max_age); });

        populateFilters();
        processDataAndPopulateUI(dataBase);
    }).catch(error => {
        console.error("Error CSV:", error);
        alert("Asegúrate de que los archivos estén en Github y se llamen sugerido.csv y saldo.csv");
    });
}

function populateFilters() {
    let divs = [...new Set(dataBase.map(i => i.div))].sort();
    let cats = [...new Set(dataBase.map(i => i.cat))].sort();
    let grps = [...new Set(dataBase.map(i => i.grp))].sort();

    $('#f_div').empty(); divs.forEach(d => $('#f_div').append(new Option(d, d)));
    $('#f_cat').empty(); cats.forEach(c => $('#f_cat').append(new Option(c, c)));
    $('#f_grp').empty(); grps.forEach(g => $('#f_grp').append(new Option(g, g)));

    $('#f_div, #f_cat, #f_grp, #f_age').on('change', function() {
        let fDiv = $('#f_div').val() || [], fCat = $('#f_cat').val() || [];
        let fGrp = $('#f_grp').val() || [], fAge = $('#f_age').val() || [];

        let filtered = dataBase.filter(row => {
            return (fDiv.length === 0 || fDiv.includes(row.div)) &&
                   (fCat.length === 0 || fCat.includes(row.cat)) &&
                   (fGrp.length === 0 || fGrp.includes(row.grp)) &&
                   (fAge.length === 0 || fAge.includes(row.age_cat));
        });
        processDataAndPopulateUI(filtered);
    });
}

// ==========================================
// RENDERIZADO DUAL (GERENCIAL VS OPERATIVO)
// ==========================================
function processDataAndPopulateUI(data) {
    mainTable.clear();
    let totalSaldo = 0, totalNec = 0;
    let metric1 = 0, metric2 = 0, metric3 = 0, metric4 = 0; 
    let divisionesNec = {};

    data.forEach(row => {
        let saldo = row.s_aec + row.s_ds;
        let necGlobal = row.n_aec + row.n_may + row.n_ds;
        totalSaldo += saldo;
        totalNec += necGlobal;
        if(!divisionesNec[row.div]) divisionesNec[row.div] = 0;
        divisionesNec[row.div] += necGlobal;

        let metrica7, metrica8;

        if (currentView === 'gerencial') {
            // LÓGICA DE COMPRAS
            let cobertura = necGlobal > 0 ? ((saldo / necGlobal) * 100).toFixed(1) : 100;
            metrica7 = cobertura + '%';
            
            if (cobertura < 50) { 
                metrica8 = '<span class="status-pill bg-rojo">Comprar Urgente</span>'; metric1++; 
            } else if (cobertura <= 100) { 
                metrica8 = '<span class="status-pill bg-amarillo">En Tiempo</span>'; metric2++; 
            } else { 
                metrica8 = '<span class="status-pill bg-verde">Cobertura Sana</span>'; metric3++; 
            }
        } else {
            // LÓGICA DE PICKING (WMS)
            let deficit = necGlobal - saldo;
            metrica7 = deficit > 0 ? deficit : 0; 

            if (necGlobal === 0) {
                metrica8 = '<span class="status-pill bg-verde">Completado</span>'; metric4++;
            } else {
                let regla = excepcionesGrupo[row.grp] || reglasLogisticas[row.div] || reglasLogisticas["DEFAULT"];
                
                if (saldo === 0) {
                    metrica8 = '<span class="status-pill bg-rojo">Quiebre</span>'; metric1++;
                } else if (saldo <= regla.limiteFantasma && row.max_age > 90) {
                    metrica8 = '<span class="status-pill bg-gris">Fantasma / Residual</span>'; metric3++;
                } else if (necGlobal >= regla.minUrgencia) {
                    metrica8 = '<span class="status-pill bg-rojo">Urgente</span>'; metric1++;
                } else {
                    metrica8 = '<span class="status-pill" style="background-color:#fd7e14; color:white; border:1px solid #e8590c;">Por Surtir</span>'; metric2++;
                }
            }
        }

        mainTable.row.add([
            `<b>${row.grp}</b> <br><small class="text-muted">${row.grp_id}</small>`,
            row.div, saldo, row.n_aec, row.n_may, row.n_ds, necGlobal,
            metrica7, metrica8
        ]);
    });

    mainTable.draw();

    // Actualizar KPIs superiores
    $('#kpiSaldo').text(totalSaldo.toLocaleString('en-US'));
    $('#kpiNec').text(totalNec.toLocaleString('en-US'));

    if (currentView === 'gerencial') {
        $('#lblCritico').text('Comprar Urgente'); $('#kpiCriticos').text(metric1);
        $('#lblAjustado').text('En Tiempo'); $('#kpiAjustados').text(metric2).attr('class', 'fw-bold mb-0 text-warning');
        $('#lblOptimo').text('Cobertura Sana'); $('#kpiOptimos').text(metric3);
    } else {
        $('#lblCritico').text('Quiebre / Urgente'); $('#kpiCriticos').text(metric1);
        $('#lblAjustado').text('Por Surtir'); $('#kpiAjustados').text(metric2).attr('class', 'fw-bold mb-0 text-orange'); // Ajuste visual
        $('#lblOptimo').text('Residual / Completado'); $('#kpiOptimos').text(metric3 + metric4);
    }

    updateCharts(divisionesNec, metric1, metric2, metric3);
}

function updateCharts(divisionesNec, m1, m2, m3) {
    let sortedDivs = Object.entries(divisionesNec).sort((a,b) => b[1] - a[1]).slice(0,10);
    
    if(necessityChart) necessityChart.destroy();
    necessityChart = new Chart(document.getElementById('chartNecessity').getContext('2d'), {
        type: 'bar',
        data: { labels: sortedDivs.map(i => i[0]), datasets: [{ label: 'Necesidad Global', data: sortedDivs.map(i => i[1]), backgroundColor: '#E1251B' }] },
        options: { responsive: true, maintainAspectRatio: false }
    });

    let labelsPie = currentView === 'gerencial' ? ['Urgente', 'En Tiempo', 'Sano'] : ['Quiebre/Urgente', 'Por Surtir', 'Residual'];
    let colorsPie = currentView === 'gerencial' ? ['#f8d7da', '#fff3cd', '#d1e7dd'] : ['#f8d7da', '#fd7e14', '#e9ecef'];

    if(statusChart) statusChart.destroy();
    statusChart = new Chart(document.getElementById('chartStatus').getContext('2d'), {
        type: 'doughnut',
        data: { labels: labelsPie, datasets: [{ data: [m1, m2, m3], backgroundColor: colorsPie }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });
}

function switchView(view) {
    currentView = view;
    $('.view-btn').removeClass('active');
    
    // Cambiar dinámicamente los encabezados de la tabla HTML
    if (view === 'gerencial') {
        $('#btnGerencial').addClass('active');
        $($('#mainTable thead th')[7]).text('% Cobertura');
        $($('#mainTable thead th')[8]).text('Estado Gerencial');
    } else {
        $('#btnOperativo').addClass('active');
        $($('#mainTable thead th')[7]).text('Déficit Surtido');
        $($('#mainTable thead th')[8]).text('Prioridad Picking');
    }
    
    processDataAndPopulateUI(dataBase); // Recalcular todo
}

function openDrillDown(groupData) {
    $('#mainScreen').addClass('hidden-screen'); $('#drillDownScreen').removeClass('hidden-screen');
    $('#detailDivCat').text(`${groupData.div} > ${groupData.cat}`);
    $('#detailGroupName').text(groupData.grp);
    $('#detNecAEC').text(groupData.n_aec); $('#detNecMay').text(groupData.n_may);
    $('#detNecDS').text(groupData.n_ds); $('#detNecGlobal').text(groupData.n_aec + groupData.n_may + groupData.n_ds);
    $('#detSaldoTotal').text(groupData.s_aec + groupData.s_ds);

    skuTable.clear();
    groupData.skus.forEach(sku => {
        let totalGral = sku.s_aec + sku.s_ds;
        let disponibilidad = totalGral > 0 ? '<span class="status-pill bg-verde">Disponible</span>' : '<span class="status-pill bg-rojo">Agotado</span>';
        skuTable.row.add([ `<b>${sku.cod}</b>`, sku.estilo, sku.desc, sku.marca, sku.f_ec, sku.s_aec, sku.f_ds, sku.s_ds, totalGral, disponibilidad ]);
    });
    skuTable.draw();
}

function closeDrillDown() {
    $('#drillDownScreen').addClass('hidden-screen'); $('#mainScreen').removeClass('hidden-screen');
}
