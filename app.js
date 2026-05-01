// app.js

// Registramos la extensión para las etiquetas de los gráficos
Chart.register(ChartDataLabels);

// 1. PEGA AQUÍ TU VARIABLE dataBase COMPLETA QUE TENÍAS EN EL HTML
// (Aquí dejo una pequeña muestra para que el código funcione de inmediato)
const dataBase = [
    {
        "div": "ACCESORIOS", "cat": "ACCESORIOS DE BELLEZA", "grp_id": "10001001", "grp": "LENTES P/DAMA", 
        "s_aec": 2692.0, "s_ds": 8.0, "n_aec": 79.0, "n_may": 132.0, "n_ds": 255.0, "max_age": 3378, "age_cat": "Estancado (>180 días)", 
        "skus": [
            {"cod": "200014", "estilo": "71926", "desc": "LENTE P/SOL P/DAMA", "marca": "SIN MARCA", "s_aec": 2.0, "s_ds": 4.0, "f_ec": "14/11/2022", "f_ds": "27/03/2026", "d_ec": 1261, "d_ds": 32, "max_age": 1261}
        ]
    },
    {
        "div": "ACCESORIOS", "cat": "ACCESORIOS PERSONALES", "grp_id": "10003001", "grp": "FAJA P/HOM", 
        "s_aec": 1802.0, "s_ds": 56.0, "n_aec": 0.0, "n_may": 0.0, "n_ds": 0.0, "max_age": 241, "age_cat": "Estancado (>180 días)", 
        "skus": [
            {"cod": "282241", "estilo": "FJ-SFCHAPA-GREG", "desc": "FAJA P/HOMBRE SF CHAPA", "marca": "GREGORIS", "s_aec": 24.0, "s_ds": 0.0, "f_ec": "28/03/2026", "f_ds": "", "d_ec": 31, "d_ds": -1, "max_age": 31}
        ]
    }
    // ... PON TU ARREGLO GIGANTE AQUÍ ...
];

let mainTable, skuTable;
let necessityChart, statusChart;

$(document).ready(function() {
    // 2. Inicializar Filtros Visuales
    $('#f_div, #f_cat, #f_grp, #f_age').select2({
        theme: 'bootstrap-5',
        width: '100%',
        placeholder: "Seleccionar..."
    });

    // 3. Inicializar DataTables
    mainTable = $('#mainTable').DataTable({
        language: { url: 'https://cdn.datatables.net/plug-ins/1.13.6/i18n/es-ES.json' },
        responsive: true,
        pageLength: 10,
        lengthMenu: [10, 25, 50, 100],
        createdRow: function(row, data, dataIndex) {
            $(row).addClass('clickable-row');
        }
    });

    skuTable = $('#skuTable').DataTable({
        language: { url: 'https://cdn.datatables.net/plug-ins/1.13.6/i18n/es-ES.json' },
        responsive: true,
        pageLength: 10
    });

    // 4. Llenar la interfaz con los datos
    processDataAndPopulateUI(dataBase);

    // 5. Configurar el clic en las filas para el Drill-Down (Desglose)
    $('#mainTable tbody').on('click', 'tr', function () {
        let rowData = mainTable.row(this).data();
        if (!rowData) return;
        
        // Extraer el nombre del grupo de la celda HTML
        let groupNameMatch = rowData[0].match(/<b>(.*?)<\/b>/);
        let groupName = groupNameMatch ? groupNameMatch[1] : "";
        let groupData = dataBase.find(d => d.grp === groupName);

        if (groupData) {
            openDrillDown(groupData);
        }
    });

    // 6. Botón Limpiar Filtros
    $('#resetFilters').on('click', function() {
        $('#f_div, #f_cat, #f_grp, #f_age').val(null).trigger('change');
        // Aquí puedes agregar lógica para volver a filtrar dataBase si lo necesitas
        processDataAndPopulateUI(dataBase); 
    });
});

// FUNCIÓN PRINCIPAL PARA PINTAR TABLAS, KPIs y GRÁFICOS
function processDataAndPopulateUI(data) {
    mainTable.clear();
    
    let totalSaldo = 0, totalNec = 0, cCritico = 0, cAjustado = 0, cOptimo = 0;
    let divisionesNec = {};

    data.forEach(row => {
        let saldo = row.s_aec + row.s_ds;
        let necGlobal = row.n_aec + row.n_may + row.n_ds;
        let cobertura = necGlobal > 0 ? ((saldo / necGlobal) * 100).toFixed(1) : 100;

        let estadoHtml = "";
        if(cobertura < 50) { 
            estadoHtml = '<span class="status-pill bg-rojo">Crítico</span>'; cCritico++; 
        } else if(cobertura <= 100) { 
            estadoHtml = '<span class="status-pill bg-amarillo">Ajustado</span>'; cAjustado++; 
        } else { 
            estadoHtml = '<span class="status-pill bg-verde">Óptimo</span>'; cOptimo++; 
        }

        totalSaldo += saldo;
        totalNec += necGlobal;

        // Agrupar necesidad por división para el gráfico
        if(!divisionesNec[row.div]) divisionesNec[row.div] = 0;
        divisionesNec[row.div] += necGlobal;

        mainTable.row.add([
            `<b>${row.grp}</b> <br><small class="text-muted">${row.grp_id}</small>`,
            row.div,
            saldo,
            row.n_aec,
            row.n_may,
            row.n_ds,
            necGlobal,
            cobertura + '%',
            estadoHtml
        ]);
    });

    mainTable.draw();

    // Actualizar KPIs de la pantalla principal
    $('#kpiSaldo').text(totalSaldo.toLocaleString('en-US'));
    $('#kpiNec').text(totalNec.toLocaleString('en-US'));
    $('#kpiCriticos').text(cCritico);
    $('#kpiAjustados').text(cAjustado);
    $('#kpiOptimos').text(cOptimo);

    // Actualizar Gráficos
    updateCharts(divisionesNec, cCritico, cAjustado, cOptimo);
}

// ACTUALIZAR GRÁFICOS CHART.JS
function updateCharts(divisionesNec, cCritico, cAjustado, cOptimo) {
    // Top 10 Divisiones
    let sortedDivs = Object.entries(divisionesNec).sort((a,b) => b[1] - a[1]).slice(0,10);
    let labels = sortedDivs.map(item => item[0]);
    let data = sortedDivs.map(item => item[1]);

    if(necessityChart) necessityChart.destroy();
    const ctxNec = document.getElementById('chartNecessity').getContext('2d');
    necessityChart = new Chart(ctxNec, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{ label: 'Necesidad Global', data: data, backgroundColor: '#E1251B' }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });

    if(statusChart) statusChart.destroy();
    const ctxStat = document.getElementById('chartStatus').getContext('2d');
    statusChart = new Chart(ctxStat, {
        type: 'doughnut',
        data: {
            labels: ['Crítico', 'Ajustado', 'Óptimo'],
            datasets: [{ data: [cCritico, cAjustado, cOptimo], backgroundColor: ['#f8d7da', '#fff3cd', '#d1e7dd'] }]
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: false,
            plugins: { legend: { display: false } } // Puedes ocultarla y usar el HTML si quieres
        }
    });
}

// ABRIR PANTALLA 2 (DRILL-DOWN)
function openDrillDown(groupData) {
    $('#mainScreen').addClass('hidden-screen');
    $('#drillDownScreen').removeClass('hidden-screen');

    // Llenar cabeceras y KPIs del detalle
    $('#detailDivCat').text(`${groupData.div} > ${groupData.cat}`);
    $('#detailGroupName').text(groupData.grp);
    
    $('#detNecAEC').text(groupData.n_aec);
    $('#detNecMay').text(groupData.n_may);
    $('#detNecDS').text(groupData.n_ds);
    $('#detNecGlobal').text(groupData.n_aec + groupData.n_may + groupData.n_ds);
    $('#detSaldoTotal').text(groupData.s_aec + groupData.s_ds);

    // Llenar tabla de SKUs
    skuTable.clear();
    groupData.skus.forEach(sku => {
        let totalGral = sku.s_aec + sku.s_ds;
        let disponibilidad = totalGral > 0 
            ? '<span class="status-pill bg-verde">Disponible</span>' 
            : '<span class="status-pill bg-rojo">Agotado</span>';

        skuTable.row.add([
            `<b>${sku.cod}</b>`,
            sku.estilo,
            sku.desc,
            sku.marca,
            sku.f_ec,
            sku.s_aec,
            sku.f_ds,
            sku.s_ds,
            totalGral,
            disponibilidad
        ]);
    });
    skuTable.draw();
}

// CERRAR PANTALLA 2 Y VOLVER
function closeDrillDown() {
    $('#drillDownScreen').addClass('hidden-screen');
    $('#mainScreen').removeClass('hidden-screen');
}

// CAMBIAR VISTAS (BOTONES SUPERIORES)
function switchView(view) {
    $('.view-btn').removeClass('active');
    if (view === 'gerencial') {
        $('#btnGerencial').addClass('active');
    } else {
        $('#btnOperativo').addClass('active');
    }
}
