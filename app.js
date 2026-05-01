// ==========================================
// RENDERIZADO DUAL (GERENCIAL VS OPERATIVO)
// ==========================================
function processDataAndPopulateUI(data) {
    mainTable.clear();
    let totalSaldo = 0, totalNec = 0;
    
    // Contadores para KPIs
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

        // -----------------------------------------------------
        // 1. LÓGICA DE COMPRAS (VISTA GERENCIAL)
        // -----------------------------------------------------
        if (currentView === 'gerencial') {
            
            // Si no hay necesidad, pero hay saldo, la cobertura es "Infinita" (>100%)
            let coberturaVal = necGlobal > 0 ? (saldo / necGlobal) * 100 : (saldo > 0 ? 999 : 100);
            metrica7 = necGlobal > 0 ? coberturaVal.toFixed(1) + '%' : '> 100%';
            
            if (necGlobal === 0 && saldo > 0) {
                metrica8 = '<span class="status-pill bg-verde">Sobre-stock / Sano</span>'; metric3++;
            } else if (coberturaVal < 50) { 
                metrica8 = '<span class="status-pill bg-rojo">Comprar Urgente</span>'; metric1++; 
            } else if (coberturaVal <= 100) { 
                metrica8 = '<span class="status-pill bg-amarillo">En Tiempo</span>'; metric2++; 
            } else { 
                metrica8 = '<span class="status-pill bg-verde">Cobertura Sana</span>'; metric3++; 
            }

        // -----------------------------------------------------
        // 2. LÓGICA DE PICKING WMS (VISTA OPERATIVA)
        // -----------------------------------------------------
        } else {
            // Unidades físicas que el bodeguero SÍ puede sacar hoy (lo menor entre saldo y necesidad)
            let aSurtir = Math.min(saldo, necGlobal);
            // Unidades que no se pueden cumplir (venta perdida)
            let deficit = necGlobal - saldo;
            let deficitReal = deficit > 0 ? deficit : 0; 

            // Reemplazamos la vista de "Déficit 0" por una orden de empaque visual
            metrica7 = `<div class="fw-bold fs-6">📦 ${aSurtir}</div>`;
            if (deficitReal > 0) {
                metrica7 += `<small class="text-danger fw-bold">Faltan: ${deficitReal}</small>`;
            }

            // Consultar las reglas de la división
            let regla = excepcionesGrupo[row.grp] || reglasLogisticas[row.div] || reglasLogisticas["DEFAULT"];
            
            if (necGlobal === 0) {
                metrica8 = '<span class="status-pill bg-verde">Completado</span>'; metric4++;
            } else if (saldo === 0) {
                metrica8 = '<span class="status-pill bg-rojo">Quiebre (Saldo 0)</span>'; metric1++;
            } else if (saldo <= regla.limiteFantasma && row.max_age > 90) {
                metrica8 = '<span class="status-pill bg-gris">Residual (Fantasma)</span>'; metric4++; 
            } else if (saldo < necGlobal) {
                metrica8 = '<span class="status-pill bg-rojo">Faltante Parcial</span>'; metric1++;
            } else if (necGlobal >= regla.minUrgencia) {
                metrica8 = '<span class="status-pill" style="background-color:#fd7e14; color:white; border:1px solid #e8590c;">Prioridad Alta</span>'; metric2++;
            } else {
                metrica8 = '<span class="status-pill bg-amarillo">Surtido Normal</span>'; metric2++;
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
        $('#lblCritico').text('Quiebre / Faltante'); $('#kpiCriticos').text(metric1);
        $('#lblAjustado').text('Por Surtir'); $('#kpiAjustados').text(metric2).attr('class', 'fw-bold mb-0 text-warning'); 
        $('#lblOptimo').text('Residual / Completado'); $('#kpiOptimos').text(metric4);
    }

    updateCharts(divisionesNec, metric1, metric2, (metric3 + metric4));
}

function updateCharts(divisionesNec, m1, m2, m3) {
    let sortedDivs = Object.entries(divisionesNec).sort((a,b) => b[1] - a[1]).slice(0,10);
    
    if(necessityChart) necessityChart.destroy();
    necessityChart = new Chart(document.getElementById('chartNecessity').getContext('2d'), {
        type: 'bar',
        data: { labels: sortedDivs.map(i => i[0]), datasets: [{ label: 'Necesidad Global', data: sortedDivs.map(i => i[1]), backgroundColor: '#E1251B' }] },
        options: { responsive: true, maintainAspectRatio: false }
    });

    let labelsPie = currentView === 'gerencial' ? ['Urgente', 'En Tiempo', 'Sano'] : ['Quiebre/Faltante', 'Por Surtir', 'Residual'];
    let colorsPie = currentView === 'gerencial' ? ['#f8d7da', '#fff3cd', '#d1e7dd'] : ['#f8d7da', '#ffc107', '#e9ecef'];

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
        $($('#mainTable thead th')[7]).html('% Cobertura');
        $($('#mainTable thead th')[8]).html('Estado Gerencial');
    } else {
        $('#btnOperativo').addClass('active');
        $($('#mainTable thead th')[7]).html('A Surtir <br><small>(Faltante)</small>');
        $($('#mainTable thead th')[8]).html('Prioridad Picking');
    }
    
    processDataAndPopulateUI(dataBase); // Recalcular todo
}
