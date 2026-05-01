// app.js
Chart.register(ChartDataLabels);

// Variables globales para almacenar los datos de los CSV
let saldoData = [];
let sugeridoData = [];

$(document).ready(function() {
    // 1. Inicializar Filtros Select2
    $('#f_div, #f_cat, #f_grp, #f_age').select2({
        theme: 'bootstrap-5',
        width: '100%',
        placeholder: "Seleccionar..."
    });

    // 2. Inicializar Tablas
    initTables();

    // 3. Inicializar Gráficos (vacíos por defecto)
    initCharts();

    // 4. Cargar los archivos CSV
    loadCSVData();

    // 5. Configurar Botón Limpiar Filtros
    $('#resetFilters').on('click', function() {
        $('#f_div, #f_cat, #f_grp, #f_age').val(null).trigger('change');
        // Aquí podrías agregar lógica para redibujar la tabla general
    });
});

// Cambiar de vista Gerencial / Operativa
function switchView(view) {
    $('.view-btn').removeClass('active');
    if (view === 'gerencial') {
        $('#btnGerencial').addClass('active');
        // Agrega aquí tu lógica para cambiar las columnas o KPIs a vista Gerencial
    } else {
        $('#btnOperativo').addClass('active');
        // Agrega aquí tu lógica para cambiar las columnas o KPIs a vista Operativa
    }
}

// Navegar de regreso a la pantalla principal
function closeDrillDown() {
    $('#drillDownScreen').addClass('hidden-screen');
    $('#mainScreen').removeClass('hidden-screen');
}

// Inicializar DataTables
function initTables() {
    $('#mainTable').DataTable({
        language: { url: 'https://cdn.datatables.net/plug-ins/1.13.6/i18n/es-ES.json' },
        responsive: true,
        pageLength: 10,
        lengthMenu: [10, 25, 50, 100]
    });

    $('#skuTable').DataTable({
        language: { url: 'https://cdn.datatables.net/plug-ins/1.13.6/i18n/es-ES.json' },
        responsive: true,
        pageLength: 10
    });
}

// Inicializar Chart.js
let necessityChart, statusChart;
function initCharts() {
    const ctxNec = document.getElementById('chartNecessity').getContext('2d');
    necessityChart = new Chart(ctxNec, {
        type: 'bar',
        data: {
            labels: ['Ejemplo A', 'Ejemplo B'], // Reemplazar con datos reales
            datasets: [{
                label: 'Necesidad Global',
                data: [10, 20],
                backgroundColor: '#E1251B'
            }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });

    const ctxStat = document.getElementById('chartStatus').getContext('2d');
    statusChart = new Chart(ctxStat, {
        type: 'doughnut',
        data: {
            labels: ['Crítico', 'Ajustado', 'Óptimo'],
            datasets: [{
                data: [30, 20, 50], // Reemplazar con datos reales
                backgroundColor: ['#f8d7da', '#fff3cd', '#d1e7dd']
            }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
}

// Cargar archivos CSV explícitamente desde la raíz para Github Pages
function loadCSVData() {
    // Usamos Promise.all para asegurarnos de que ambos archivos carguen antes de procesar
    Promise.all([
        fetch('saldo.csv').then(response => response.text()),
        fetch('sugerido.csv').then(response => response.text())
    ])
    .then(([saldoText, sugeridoText]) => {
        // Parsear usando PapaParse (incluido en index.html)
        Papa.parse(saldoText, {
            header: true,
            skipEmptyLines: true,
            complete: function(results) {
                saldoData = results.data;
                console.log("saldo.csv cargado:", saldoData.length, "registros");
            }
        });

        Papa.parse(sugeridoText, {
            header: true,
            skipEmptyLines: true,
            complete: function(results) {
                sugeridoData = results.data;
                console.log("sugerido.csv cargado:", sugeridoData.length, "registros");
            }
        });

        // Una vez cargados ambos, puedes cruzar los datos y popular las tablas/gráficos
        processDataAndPopulateUI();

    })
    .catch(error => {
        console.error("Error al cargar los archivos CSV. Asegúrate de que saldo.csv y sugerido.csv estén en la misma carpeta que index.html", error);
    });
}

// Lógica principal de cruce y visualización
function processDataAndPopulateUI() {
    /* 
      AQUÍ VA TU LÓGICA DE PROCESAMIENTO
      1. Limpiar dataTables: $('#mainTable').DataTable().clear()
      2. Cruzar saldoData y sugeridoData
      3. Agregar filas con $('#mainTable').DataTable().row.add([...]).draw()
      4. Actualizar los KPIs (kpiSaldo, kpiNec, etc.)
      5. Actualizar los Gráficos (necessityChart.update(), statusChart.update())
    */
    console.log("Datos listos para ser mapeados en la interfaz.");
}
