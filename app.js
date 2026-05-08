// ==========================================
// CONFIGURACIÓN Y VARIABLES GLOBALES
// ==========================================
let dataBase = []; 
let mainTable, skuTable, tiendasTable;
let currentView = 'gerencial';
const TODAY = new Date('2026-04-28');

// ==========================================
// DESCOMPRESIÓN Y CARGA
// ==========================================
async function fetchAndUnzip(url, filenameInsideZip) {
    const response = await fetch(url);
    const blob = await response.blob();
    const zip = await JSZip.loadAsync(blob);
    return await zip.file(filenameInsideZip).async("string");
}

function loadCSVData() {
    Promise.all([
        fetchAndUnzip('sugerido_v2.zip', 'sugerido_v2.csv'),
        fetch('saldo_2.csv').then(res => res.text())
    ]).then(([sugeridoText, saldoText]) => {
        let sugeridoRaw = Papa.parse(sugeridoText, { header: true, skipEmptyLines: true, delimiter: ";" }).data;
        let saldoRaw = Papa.parse(saldoText, { header: true, skipEmptyLines: true, delimiter: ";" }).data;
        
        let dataMap = {};

        // 1. Procesar Necesidades por Tienda (sugerido_v2)
        sugeridoRaw.forEach(row => {
            let grp = (row["Grupo"] || "").trim();
            if(!grp) return;

            // REGLA DE NEGOCIO: AEC y DS siempre son MAYOREO
            let tiendaNombre = row["Nombre Tienda"] || "";
            let tipoTienda = row["Tipo de Tienda"];
            if(tiendaNombre.includes("AEC") || tiendaNombre.includes("DS")) {
                tipoTienda = "MAYOREO";
            }

            if(!dataMap[grp]) {
                dataMap[grp] = {
                    div: row["Division"], cat: row["Categoria"], grp: grp, grp_id: row["Grupo ID"],
                    n_aec: 0, n_may: 0, n_ds: 0, s_aec: 0, s_ds: 0,
                    tiendas: [], skus: [], max_age: 0
                };
            }

            let necDet = Math.round(parseFloat(row["Necesidad detalle AEC"]) || 0);
            let necMay = Math.round(parseFloat(row["Necesidad mayoreo AEC"]) || 0);
            let necDS = Math.round(parseFloat(row["Necesidad DS"]) || 0);

            dataMap[grp].n_aec += necDet;
            dataMap[grp].n_may += necMay;
            dataMap[grp].n_ds += necDS;

            // Guardar info específica de la tienda para el Picking
            if (necDet > 0 || necMay > 0 || necDS > 0) {
                dataMap[grp].tiendas.push({
                    nombre: tiendaNombre,
                    tipo: tipoTienda,
                    saldo_t: Math.round(parseFloat(row["Saldo Tienda"]) || 0),
                    necesidad: necDet + necMay + necDS
                });
            }
        });

        // 2. Procesar Saldos en Bodega (saldo_2)
        saldoRaw.forEach(row => {
            let grp = (row["Grupo"] || "").trim();
            if(dataMap[grp]) {
                let sAEC = Math.round(parseFloat(row["SaldoUND_EC"]) || 0);
                let sDS = Math.round(parseFloat(row["SaldoUND_DS"]) || 0);
                
                dataMap[grp].s_aec += sAEC;
                dataMap[grp].s_ds += sDS;
                
                dataMap[grp].skus.push({
                    cod: row["Producto"], desc: row["ProdNombre"],
                    s_aec: sAEC, s_ds: sDS, total: sAEC + sDS
                });
            }
        });

        dataBase = Object.values(dataMap);
        initFilters();
        applyFilters();
    });
}

// ==========================================
// RENDERIZADO Y VISTAS
// ==========================================
function renderDashboard(data) {
    mainTable.clear();
    let tS = 0, tN = 0;
    let k = { m1: 0, m2: 0, m3: 0 };

    data.forEach(row => {
        let s = row.s_aec + row.s_ds;
        let n = row.n_aec + row.n_may + row.n_ds;
        tS += s; tN += n;

        let cob = n > 0 ? (s / n * 100) : (s > 0 ? 999 : 0);
        let est = '';
        
        if (currentView === 'gerencial') {
            if (cob < 50) { est = 'Urgente'; k.m1++; }
            else if (cob <= 110) { est = 'En Tiempo'; k.m2++; }
            else { est = 'Sano'; k.m3++; }
        } else {
            if (s === 0 && n > 0) { est = 'Quiebre'; k.m1++; }
            else if (s < n) { est = 'Faltante'; k.m2++; }
            else { est = 'Cubierto'; k.m3++; }
        }

        mainTable.row.add([
            `<b>${row.grp}</b>`, row.div, s, row.n_aec, row.n_may, row.n_ds, n, 
            cob.toFixed(0) + '%', est
        ]);
    });
    mainTable.draw();
    $('#kpiSaldo').text(tS.toLocaleString());
    $('#kpiNec').text(tN.toLocaleString());
    $('#kpiCriticos').text(k.m1); $('#kpiAjustados').text(k.m2); $('#kpiOptimos').text(k.m3);
}

// ==========================================
// CONSOLA DE PICKING (DRILL DOWN)
// ==========================================
function openDrillDown(groupName) {
    let g = dataBase.find(d => d.grp === groupName);
    if(!g) return;

    $('#mainScreen').addClass('hidden-screen');
    $('#drillDownScreen').removeClass('hidden-screen');
    $('#detailDivCat').text(`${g.div} > ${g.cat}`);
    $('#detailGroupName').text(g.grp);

    // Llenar Tabla Tiendas (Izquierda)
    tiendasTable.clear();
    g.tiendas.forEach(t => {
        tiendasTable.row.add([
            t.nombre, t.saldo_t, t.necesidad, 
            t.necesidad > 20 ? '<span class="badge bg-danger">ALTA</span>' : '<span class="badge bg-warning">NORMAL</span>'
        ]);
    });
    tiendasTable.draw();

    // Llenar Tabla SKUs (Derecha)
    skuTable.clear();
    g.skus.filter(s => s.total > 0).forEach(s => {
        skuTable.row.add([s.cod, s.desc, s.s_aec, s.s_ds, s.total]);
    });
    skuTable.draw();
}

// ==========================================
// INICIALIZACIÓN DE TABLAS Y EVENTOS
// ==========================================
$(document).ready(function() {
    mainTable = $('#mainTable').DataTable({ pageLength: 15 });
    tiendasTable = $('#tiendasTable').DataTable({ paging: false, searching: false, info: false });
    skuTable = $('#skuTable').DataTable({ pageLength: 10 });

    $('#mainTable tbody').on('click', 'tr', function () {
        let name = $(this).find('td:first-child').text();
        openDrillDown(name);
    });

    loadCSVData();
});

function switchView(v) {
    currentView = v;
    $('.view-btn').removeClass('active');
    $(`#btn${v.charAt(0).toUpperCase() + v.slice(1)}`).addClass('active');
    applyFilters();
}

function closeDrillDown() {
    $('#drillDownScreen').addClass('hidden-screen');
    $('#mainScreen').removeClass('hidden-screen');
}

function initFilters() {
    let divs = [...new Set(dataBase.map(i => i.div))].sort();
    divs.forEach(d => $('#f_div').append(new Option(d, d)));
    $('#f_div, #f_cat, #f_age, #f_status').select2({ theme: 'bootstrap-5' });
}

function applyFilters() {
    renderDashboard(dataBase);
}
