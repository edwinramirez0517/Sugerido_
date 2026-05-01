// app.js

// Registramos la extensión para las etiquetas de los gráficos
Chart.register(ChartDataLabels);

let dataBase = [];
let mainTable, skuTable;
let necessityChart, statusChart;

// Fecha base para cálculos de antigüedad (28 Abr 2026, según el tablero)
const TODAY = new Date('2026-04-28'); 

$(document).ready(function() {
    // 1. Inicializar Filtros Visuales
    $('#f_div, #f_cat, #f_grp, #f_age').select2({
        theme: 'bootstrap-5',
        width: '100%',
        placeholder: "Seleccionar..."
    });

    // 2. Inicializar DataTables
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

    // 3. Cargar archivos CSV directamente de GitHub
    loadCSVData();

    // 4. Configurar clic en las filas para abrir el desglose de los SKUs
    $('#mainTable tbody').on('click', 'tr', function () {
        let rowData = mainTable.row(this).data();
        if (!rowData) return;
        
        // Buscamos a qué grupo pertenece la fila que recibió el clic
        let groupNameMatch = rowData[0].match(/<b>(.*?)<\/b>/);
        let groupName = groupNameMatch ? groupNameMatch[1] : "";
        let groupData = dataBase.find(d => d.grp === groupName);

        if (groupData) {
            openDrillDown(groupData);
        }
    });

    // 5. Configurar Botón Limpiar Filtros
    $('#resetFilters').on('click', function() {
        $('#f_div, #f_cat, #f_grp, #f_age').val(null).trigger('change');
        processDataAndPopulateUI(dataBase); 
    });
});

// FUNCIONES MATEMÁTICAS Y DE FECHAS PARA ARREGLAR LOS DATOS DE EXCEL
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
    let y = dateObj.getFullYear();
    return `${d}/${m}/${y}`;
}

function calcularDias(dateObj) {
    if (!dateObj) return -1;
    const diffTime = Math.abs(TODAY - dateObj);
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
}

function getAgeCategory(maxAge) {
    if (maxAge < 0) return "Sin Dato";
    if (maxAge <= 30) return "Reciente (0-30 días)";
    if (maxAge <= 90) return "Stock Normal (31-90 días)";
    if (maxAge <= 180) return "Lento Mov. (91-180 días)";
    return "Estancado (>180 días)";
}

// FUNCIÓN MAESTRA: LEE LOS ARCHIVOS CSV DE GITHUB Y LOS PEGA
function loadCSVData() {
    Promise.all([
        fetch('sugerido.csv').then(response => response.text()),
        fetch('saldo.csv').then(response => response.text())
    ])
    .then(([sugeridoText, saldoText]) => {
        let sugeridoParsed = Papa.parse(sugeridoText, { header: true, skipEmptyLines: true, delimiter: ";" }).data;
        let saldoParsed = Papa.parse(saldoText, { header: true, skipEmptyLines: true, delimiter: ";" }).data;

        let dataMap = {};

        // 1. Agrupar la data principal (sugerido.csv)
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
                max_age: -1,
                age_cat: "Sin Dato",
                skus: []
            };
        });

        // 2. Insertar los Códigos (saldo.csv) dentro de los grupos creados
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
                    d_ec: d_ec,
                    d_ds: d_ds,
                    max_age: max_age
                });

                if(max_age > dataMap[grpName].max_age) {
                    dataMap[grpName].max_age = max_age;
                }
            }
        });

        // Convertir todo al formato que usamos para pintar y asignar antigüedad
        dataBase = Object.values(dataMap);
        dataBase.forEach(group => { group.age_cat = getAgeCategory(group.max_age); });

        populateFilters();
        processDataAndPopulateUI(dataBase);
    })
    .catch(error => {
        console.error("Error cargando los CSV:", error);
        alert("Ocurrió un error leyendo los archivos CSV. Verifica tu consola (F12).");
    });
}

function populateFilters() {
    let divs = [...new Set(dataBase.map(item => item.div))].sort();
    let cats = [...new Set(dataBase.map(item => item.cat))].sort();
    let grps = [...new Set(dataBase.map(item => item.grp))].sort();

    $('#f_div').empty(); divs.forEach(d => $('#f_div').append(new Option(d, d)));
    $('#f_cat').empty(); cats.forEach(c => $('#f_cat').append(new Option(c, c)));
    $('#f_grp').empty(); grps.forEach(g => $('#f_grp').append(new Option(g, g)));

    // Activar los filtros cuando el usuario seleccione algo
    $('#f_div, #f_cat, #f_grp, #f_age').on('change', function() {
        let fDiv = $('#f_div').val() || [];
        let fCat = $('#f_cat').val() || [];
        let fGrp = $('#f_grp').val() || [];
        let fAge = $('#f_age').val() || [];

        let filtered = dataBase.filter(row => {
            return (fDiv.length === 0 || fDiv.includes(row.div)) &&
                   (fCat.length === 0 || fCat.includes(row.cat)) &&
                   (fGrp.length === 0 || fGrp.includes(row.grp)) &&
                   (fAge.length === 0 || fAge.includes(row.age_cat));
        });

        processDataAndPopulateUI(filtered);
    });
}

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

    $('#kpiSaldo').text(totalSaldo.toLocaleString('en-US'));
    $('#kpiNec').text(totalNec.toLocaleString('en-US'));
    $('#kpiCriticos').text(cCritico);
    $('#kpiAjustados').text(cAjustado);
    $('#kpiOptimos').text(cOptimo);

    updateCharts(divisionesNec, cCritico, cAjustado, cOptimo);
}

function updateCharts(divisionesNec, cCritico, cAjustado, cOptimo) {
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
            plugins: { legend: { display: false } } 
        }
    });
}

function openDrillDown(groupData) {
    $('#mainScreen').addClass('hidden-screen');
    $('#drillDownScreen').removeClass('hidden-screen');

    $('#detailDivCat').text(`${groupData.div} > ${groupData.cat}`);
    $('#detailGroupName').text(groupData.grp);
    
    $('#detNecAEC').text(groupData.n_aec);
    $('#detNecMay').text(groupData.n_may);
    $('#detNecDS').text(groupData.n_ds);
    $('#detNecGlobal').text(groupData.n_aec + groupData.n_may + groupData.n_ds);
    $('#detSaldoTotal').text(groupData.s_aec + groupData.s_ds);

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

function closeDrillDown() {
    $('#drillDownScreen').addClass('hidden-screen');
    $('#mainScreen').removeClass('hidden-screen');
}

function switchView(view) {
    $('.view-btn').removeClass('active');
    if (view === 'gerencial') {
        $('#btnGerencial').addClass('active');
    } else {
        $('#btnOperativo').addClass('active');
    }
}
