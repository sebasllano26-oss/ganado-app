// ════════════════════════════════════════════════════════════════════════
//  dashboard.gs — KPIs, alertas y comparativo multi-animal
// ════════════════════════════════════════════════════════════════════════

function getDashboard(filtros) {
  filtros = filtros || {};
  // Polyfill explícito — Object.assign falla en runtime Rhino
  var filtrosActivos = { soloActivos: true };
  for (var k in filtros) { if (filtros.hasOwnProperty(k) && filtros[k]) filtrosActivos[k] = filtros[k]; }
  // Si el usuario filtra explícitamente por VENDIDO o MUERTO, no excluirlos con soloActivos
  if (filtrosActivos.estado && filtrosActivos.estado !== 'ACTIVO') {
    filtrosActivos.soloActivos = false;
  }
  var animales  = listAnimales(filtrosActivos);
  var ahora     = new Date();
  var mesActual = ahora.getMonth();
  var anioActual = ahora.getFullYear();

  // Índice de codigos activos
  var codigoSet = {};
  animales.forEach(function(a) { codigoSet[a.codigo] = true; });

  var todasMeds = getAll('mediciones').filter(function(m) { return codigoSet[m.codigo]; });

  var medsMes = todasMeds.filter(function(m) {
    var f = new Date(m.fecha);
    return f.getMonth() === mesActual && f.getFullYear() === anioActual;
  });

  // Última medición por animal (para la regla de 45 días sin pesar)
  var ultimaMedPorCodigo = {};
  todasMeds.forEach(function(m) {
    var c = m.codigo;
    if (!ultimaMedPorCodigo[c] || new Date(m.fecha) > new Date(ultimaMedPorCodigo[c].fecha)) {
      ultimaMedPorCodigo[c] = m;
    }
  });

  // Serie recalculada por animal — una sola pasada, misma matemática que la ficha.
  var medsPorCodigo = {};
  todasMeds.forEach(function(m) {
    if (!medsPorCodigo[m.codigo]) medsPorCodigo[m.codigo] = [];
    medsPorCodigo[m.codigo].push(m);
  });
  var seriePorCodigo = {};
  animales.forEach(function(a) {
    seriePorCodigo[a.codigo] = calcularSerieMediciones(medsPorCodigo[a.codigo] || [], a.peso_inicial, a.fecha_ingreso);
  });

  var pesosArr = animales.map(function(a) {
    return ultimoPesoConocido(a, medsPorCodigo[a.codigo] || []);
  }).filter(function(p) { return !isNaN(p) && p > 0; });

  // ── GDP promedio POR ÚLTIMA MEDICIÓN VÁLIDA de cada animal ──────────────
  // (antes se promediaban TODOS los GDP históricos, incluida la basura)
  var gdpsUlt = [];
  animales.forEach(function(a) {
    var uv = ultimaMedicionValida(seriePorCodigo[a.codigo]);
    if (uv && !isNaN(uv.gdpPer)) gdpsUlt.push(uv.gdpPer);
  });

  // Referencia histórica: todos los GDP válidos almacenados (sin imposibles)
  var limImpo = gdpImposibleKg();
  var gdpsHist = [];
  todasMeds.forEach(function(m) {
    var g = parseFloat(m.gdp);
    if (!isNaN(g) && Math.abs(g) <= limImpo) gdpsHist.push(g);
  });

  var pesoPromedio = pesosArr.length
    ? Math.round(pesosArr.reduce(function(s,v){ return s+v; }, 0) / pesosArr.length * 10) / 10 : 0;
  var gdpPromedio = gdpsUlt.length
    ? Math.round(gdpsUlt.reduce(function(s,v){ return s+v; }, 0) / gdpsUlt.length * 1000) / 1000 : 0;
  var gdpPromedioHist = gdpsHist.length
    ? Math.round(gdpsHist.reduce(function(s,v){ return s+v; }, 0) / gdpsHist.length * 1000) / 1000 : 0;

  var totalInvertido = animales.reduce(function(s, a) {
    return s + (parseFloat(a.precio_compra) || 0);
  }, 0);

  // Distribución de clasificaciones — desde la serie recalculada
  var distrib = { SUPERA: 0, CUMPLE: 0, CASI: 0, BAJO: 0, CRITICO: 0, SIN_DATOS: 0 };
  animales.forEach(function(a) {
    var uv = ultimaMedicionValida(seriePorCodigo[a.codigo]);
    var c = uv ? uv.clasificacion : 'SIN_DATOS';
    if (distrib[c] !== undefined) distrib[c]++;
    else distrib.SIN_DATOS++;
  });

  var alertas = _generarAlertas(animales, ultimaMedPorCodigo, seriePorCodigo);

  // Tabla resumen — una sola lectura de mediciones para todos los animales
  var tablaResumen = animales.map(function(a) {
    var uv  = ultimaMedicionValida(seriePorCodigo[a.codigo]);
    var meds = medsPorCodigo[a.codigo] || [];   // O(1) — sin lectura adicional
    var nAlertasDatos = seriePorCodigo[a.codigo].filter(function(s) {
      return s.alerta === 'GDP_IMPOSIBLE' || s.alerta === 'GDP_ALTO' || s.alerta === 'FECHA_INVALIDA' || s.alerta === 'SIN_BASELINE';
    }).length;
    return {
      codigo:        a.codigo,
      tipo:          a.tipo,
      sexo:          a.sexo || _sexoDeTipo(a.tipo),   // para el botón "🐄 A Vacas" (solo hembras)
      enVacas:       a.en_vacas || '',                // 'SI' si ya está en el grupo de vacas a mano
      predio:        a.predio,
      lote:          a.lote,
      propietario:   a.propietario,
      indicaciones:  a.indicaciones,
      diasEnFinca:   a.dias_en_finca || calcularDiasFinca(a.fecha_ingreso, null),
      pesoInicial:   a.peso_inicial,
      precioCompra:  a.precio_compra,
      pesoActual:    ultimoPesoConocido(a, meds),
      ultimaGdp:     uv ? uv.gdpPer : '',
      clasificacion: uv ? uv.clasificacion : '',
      color:         uv ? colorClasificacion(uv.clasificacion) : 'gray',
      datosAlerta:   nAlertasDatos,
      diasSinMedir:        diasSinMedir(meds),
      causaMuerte:         a.causa_muerte         || '',
      estadoReproductivo:  a.estado_reproductivo  || '',
      desarrolloOvarico:   a.desarrollo_ovarico   || '',
      estadoDescarte:      a.estado_descarte      || '',
      motivoDescarte:      a.motivo_descarte      || '',
      obsDescarte:         a.obs_descarte         || '',
      fechaDescarte:       a.fecha_descarte       || ''
    };
  });

  // Opciones COMPLETAS de filtros: distintos predio/tipo/propietario tomados de
  // TODOS los animales (sin filtrar), para que los desplegables del dashboard no
  // se reduzcan en cascada al aplicar un filtro.
  var _todos = getAll('animales');
  var _sP = {}, _sT = {}, _sO = {}, _preds = [], _tipos = [], _props = [];
  _todos.forEach(function(a) {
    if (a.predio      && !_sP[a.predio])      { _sP[a.predio] = 1;      _preds.push(a.predio); }
    if (a.tipo        && !_sT[a.tipo])        { _sT[a.tipo] = 1;        _tipos.push(a.tipo); }
    if (a.propietario && !_sO[a.propietario]) { _sO[a.propietario] = 1; _props.push(a.propietario); }
  });
  _preds.sort(); _tipos.sort(); _props.sort();

  return {
    kpis: {
      totalActivos:    animales.length,
      pesoPromedio:    pesoPromedio,
      gdpPromedio:     gdpPromedio,      // por ÚLTIMA medición válida de cada animal
      gdpPromedioHist: gdpPromedioHist, // referencia: promedio histórico de GDP válidos
      medicionesMes:   medsMes.length,
      totalInvertido:  Math.round(totalInvertido),
      rentabilidadEst: 0  // requiere precio de mercado externo
    },
    distribucion:  distrib,
    alertas:       alertas,
    tablaResumen:  tablaResumen,
    opcionesFiltro: { predios: _preds, tipos: _tipos, propietarios: _props }
  };
}

function _generarAlertas(animales, ultimaMedPorCodigo, seriePorCodigo) {
  var alertas  = [];
  var limite45 = new Date(Date.now() - 45 * 86400000);
  var hoy      = new Date();
  var mapaPalp = _mapaUltimaPalpacionPrenada();   // fecha de la última palpación "Preñada" por animal

  animales.forEach(function(a) {
    var ult = ultimaMedPorCodigo[a.codigo];
    if (!ult) {
      alertas.push({ tipo: 'SIN_MEDICION', nivel: 'warning', codigo: a.codigo,
        mensaje: 'Sin mediciones registradas' });
    } else if (new Date(ult.fecha) < limite45) {
      alertas.push({ tipo: 'SIN_MEDICION', nivel: 'warning', codigo: a.codigo,
        mensaje: 'Sin medición en más de 45 días' });
    }
    // Rendimiento bajo — desde la ÚLTIMA medición válida (serie recalculada)
    var uv = seriePorCodigo ? ultimaMedicionValida(seriePorCodigo[a.codigo] || []) : null;
    if (uv && uv.clasificacion === 'CRITICO') {
      alertas.push({ tipo: 'BAJO_RENDIMIENTO', nivel: 'danger', codigo: a.codigo,
        mensaje: 'GDP CRÍTICO (' + uv.gdpPer + ' kg/día)' });
    } else if (uv && uv.clasificacion === 'BAJO') {
      alertas.push({ tipo: 'BAJO_RENDIMIENTO', nivel: 'orange', codigo: a.codigo,
        mensaje: 'GDP BAJO (' + uv.gdpPer + ' kg/día)' });
    }
    // Datos sospechosos en el histórico del animal (no bloquean, pero se muestran)
    if (seriePorCodigo) {
      var nImpo = 0, nFecha = 0;
      (seriePorCodigo[a.codigo] || []).forEach(function(s) {
        if (s.alerta === 'GDP_IMPOSIBLE') nImpo++;
        if (s.alerta === 'FECHA_INVALIDA') nFecha++;
      });
      if (nImpo > 0) {
        alertas.push({ tipo: 'DATO_REVISAR', nivel: 'warning', codigo: a.codigo,
          mensaje: nImpo + ' medición(es) con GDP imposible — revisar peso/fecha' });
      } else if (nFecha > 0) {
        alertas.push({ tipo: 'DATO_REVISAR', nivel: 'warning', codigo: a.codigo,
          mensaje: nFecha + ' medición(es) con fecha inválida o duplicada — revisar' });
      }
    }
    // Gestación PROYECTADA a hoy (el campo meses es estático; se proyecta con la
    // fecha de la palpación). Distingue parto próximo de gestación ya vencida.
    var g = proyectarGestacion(a, mapaPalp[a.codigo], hoy);
    if (g.prenada && g.gestProyectada !== '' && g.gestProyectada !== undefined) {
      if (g.estado === 'GESTACION_VENCIDA') {
        alertas.push({ tipo: 'GESTACION_VENCIDA', nivel: 'danger', codigo: a.codigo,
          mensaje: 'Gestación vencida (~' + g.gestProyectada + ' m; palpada ' + g.gestReportada + ' m el ' + g.fechaPalpacion + ') — ¿ya parió? registrar nacimiento o re-palpar' });
      } else if (g.gestProyectada >= 7) {
        alertas.push({ tipo: 'PARTO_PROXIMO', nivel: g.gestProyectada >= 8 ? 'danger' : 'warning', codigo: a.codigo,
          mensaje: 'Gestación ~' + g.gestProyectada + ' meses — parto próximo' });
      }
    }
  });

  getAlertasSanitarias(7).forEach(function(e) {
    alertas.push({ tipo: 'SANITARIO', nivel: 'danger', codigo: e.codigo,
      mensaje: e.tipo + ' próximo: ' + e.proxima_fecha });
  });

  // Alertas reproductivas: vacas que llevan demasiado tiempo sin parir → evaluar venta.
  var setCod = {};
  animales.forEach(function(a) { setCod[a.codigo] = true; });
  try {
    getVacasIntervalo().forEach(function(v) {
      if (v.alerta && setCod[v.codigo]) {
        alertas.push({ tipo: 'INTERVALO_PARTO', nivel: 'warning', codigo: v.codigo,
          mensaje: 'Último parto ' + v.ultimaCria + ' · ' + v.mesesSinParir + ' meses sin parir (' + v.partos + ' parto' + (v.partos !== 1 ? 's' : '') + ') — evaluar venta' });
      }
    });
  } catch (e) {}

  return alertas;
}


// Evolución mensual del peso promedio para el gráfico de tendencia.
function getEvolucionMensual(filtros) {
  filtros = filtros || {};
  var animales = listAnimales(filtros);
  var codigoSet = {};
  animales.forEach(function(a) { codigoSet[a.codigo] = true; });

  var porMes = {};
  getAll('mediciones').filter(function(m) { return codigoSet[m.codigo]; }).forEach(function(m) {
    var d = _parseFecha(m.fecha) || new Date(m.fecha);
    if (!d || isNaN(d.getTime())) return;
    var mo  = d.getMonth() + 1;
    var key = d.getFullYear() + '-' + (mo < 10 ? '0' : '') + mo;
    if (!porMes[key]) porMes[key] = [];
    porMes[key].push(parseFloat(m.peso));
  });

  return Object.keys(porMes).sort().map(function(mes) {
    var ps   = porMes[mes];
    var prom = ps.reduce(function(s,v){ return s+v; }, 0) / ps.length;
    return { mes: mes, pesoPromedio: Math.round(prom * 10) / 10, cantidad: ps.length };
  });
}

// ── Dinámica del hato: entradas vs salidas por mes ─────────────────────────
// Entradas = animales que ingresaron ese mes (compras + nacimientos, por fecha_ingreso).
// Salidas  = ventas registradas ese mes (por fecha_venta).
// Devuelve los últimos N meses en orden cronológico: [{ mes:'yyyy-MM', entradas, salidas }].
function getDinamicaHato(meses) {
  meses = meses || 6;
  var hoy  = new Date();
  var keys = [], mapa = {};
  for (var i = meses - 1; i >= 0; i--) {
    var dref = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
    var mo   = dref.getMonth() + 1;
    var key  = dref.getFullYear() + '-' + (mo < 10 ? '0' : '') + mo;
    keys.push(key);
    mapa[key] = { mes: key, entradas: 0, salidas: 0 };
  }
  getAll('animales').forEach(function(a) {
    var f = String(a.fecha_ingreso || '').substring(0, 7);
    if (mapa[f]) mapa[f].entradas++;
  });
  getAll('ventas').forEach(function(v) {
    var f = String(v.fecha_venta || '').substring(0, 7);
    if (mapa[f]) mapa[f].salidas++;
  });
  return keys.map(function(k) { return mapa[k]; });
}

// ── Endpoint unificado: dashboard + evolución + dinámica en una sola llamada ──
// Reduce el número de roundtrips frontend→Apps Script de 3 a 1,
// lo que elimina cold-starts extra y corta el tiempo de carga.
function getDashboardFull(filtros) {
  filtros = filtros || {};
  return {
    params:    getParametrosPublicos(),
    dashboard: getDashboard(filtros),
    evolucion: getEvolucionMensual(filtros),
    dinamica:  getDinamicaHato(6)
  };
}
