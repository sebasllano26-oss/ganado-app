// ════════════════════════════════════════════════════════════════════════
//  planeacion.gs — SISTEMA DE PLANEACIÓN
//
//  1. Histórico mensual del hato: GDP y pesos segmentados por mes
//     (subidas/bajadas) para entender el comportamiento real.
//  2. Proyección forward: con el GDP de la ÚLTIMA medición válida de cada
//     animal se proyecta mes a mes cuándo cruza el peso objetivo de venta.
//  3. Plan compra-venta: política 1 compra por venta (mismo mes) con engorda
//     configurable (~12 meses). El peso de compra recomendado es el que,
//     al ritmo esperado del hato, llega al objetivo en esos meses:
//
//        peso_compra = peso_objetivo − gdp_esperado × (meses_engorda × 30.44)
//
//  Parámetros editables sin tocar código (hoja catalogos):
//    config_peso_objetivo_venta_kg   (default estadístico, fallback 405)
//    config_meses_engorda_compra     (12)
//    config_horizonte_planeacion_meses (12)
// ════════════════════════════════════════════════════════════════════════

var DIAS_MES = 30.44;   // promedio anual 365.25/12

// ── Parámetros parametrizables ────────────────────────────────────────────
function pesoObjetivoVentaKg()      { return getConfigNum('peso_objetivo_venta_kg', 405); }
function mesesEngordaCompra()       { return getConfigNum('meses_engorda_compra', 12); }
function horizontePlaneacionMeses() { return getConfigNum('horizonte_planeacion_meses', 12); }
// 0 = sin definir. A diferencia de los tres de arriba, aqui el cero es un valor
// legitimo: significa "todavia no tengo un precio propio", y el plan cae al
// historico de ventas en vez de inventarse una cifra.
function precioKgVentaPlan()        { return getConfigNum('precio_kg_venta', 0); }
function precioKgCompraPlan()       { return getConfigNum('precio_kg_compra', 0); }

function _setConfigPlaneacion(clave, val) {
  val = parseFloat(val);
  if (isNaN(val) || val <= 0) return { ok: false, error: 'El valor debe ser un número positivo.' };
  if (findMany('catalogos', 'categoria', 'config_' + clave).length) {
    update('catalogos', 'categoria', 'config_' + clave, { valor: String(val) });
  } else {
    insert('catalogos', { categoria: 'config_' + clave, valor: String(val) });
  }
  return { ok: true, msg: 'config_' + clave + ' = ' + val };
}

// Los precios aceptan vacio o 0 para BORRARLOS (volver al historico), asi que no
// pueden usar _setConfigPlaneacion, que exige un positivo.
function _setConfigPrecio(clave, val) {
  var v = (val === '' || val === null || val === undefined) ? 0 : parseFloat(val);
  if (isNaN(v) || v < 0) return { ok: false, error: 'El precio debe ser un número igual o mayor que cero.' };
  var guardado = v > 0 ? String(v) : '';
  if (findMany('catalogos', 'categoria', 'config_' + clave).length) {
    update('catalogos', 'categoria', 'config_' + clave, { valor: guardado });
  } else {
    insert('catalogos', { categoria: 'config_' + clave, valor: guardado });
  }
  return { ok: true, msg: 'config_' + clave + ' = ' + (guardado || '(sin definir)') };
}
function setPrecioKgVenta(v)          { return _setConfigPrecio('precio_kg_venta', v); }
function setPrecioKgCompra(v)         { return _setConfigPrecio('precio_kg_compra', v); }

function setPesoObjetivoVenta(kg)     { return _setConfigPlaneacion('peso_objetivo_venta_kg', kg); }
function setMesesEngorda(n)           { return _setConfigPlaneacion('meses_engorda_compra', n); }
function setHorizontePlaneacion(n)    { return _setConfigPlaneacion('horizonte_planeacion_meses', n); }

// Guarda los 3 parámetros en una sola llamada desde la Web App.
// Los dos precios son opcionales: si no llegan, no se tocan. Asi una llamada
// antigua de tres argumentos sigue funcionando igual que antes.
function guardarParamsPlaneacion(objetivoKg, mesesEngorda, horizonteMeses, precioVenta, precioCompra) {
  var r1 = setPesoObjetivoVenta(objetivoKg);
  if (!r1.ok) return r1;
  var r2 = setMesesEngorda(mesesEngorda);
  if (!r2.ok) return r2;
  var r3 = setHorizontePlaneacion(horizonteMeses);
  if (!r3.ok) return r3;
  if (precioVenta !== undefined) {
    var r4 = setPrecioKgVenta(precioVenta);
    if (!r4.ok) return r4;
  }
  if (precioCompra !== undefined) {
    var r5 = setPrecioKgCompra(precioCompra);
    if (!r5.ok) return r5;
  }
  return { ok: true, msg: 'Parámetros guardados.' };
}

// ── Estadísticas históricas de ventas (para sugerir el objetivo) ──────────
function getEstadisticasVenta() {
  var pesos = [];
  getAll('ventas').forEach(function(v) {
    var p = parseFloat(v.peso_salida);
    if (!isNaN(p) && p > 0) pesos.push(p);
  });
  if (pesos.length === 0) {
    return { n: 0, min: '', promedio: '', mediana: '', p60: '', p75: '', max: '', sugerenciaObjetivo: '' };
  }
  pesos.sort(function(a, b) { return a - b; });
  function pct(arr, p) {
    var idx = Math.min(arr.length - 1, Math.max(0, Math.ceil(p * arr.length) - 1));
    return arr[idx];
  }
  var suma = pesos.reduce(function(s, v) { return s + v; }, 0);
  var mediana = pesos.length % 2
    ? pesos[(pesos.length - 1) / 2]
    : (pesos[pesos.length / 2 - 1] + pesos[pesos.length / 2]) / 2;
  var p60 = Math.round(pct(pesos, 0.60) * 10) / 10;
  return {
    n:        pesos.length,
    min:      Math.round(pesos[0] * 10) / 10,
    promedio: Math.round(suma / pesos.length * 10) / 10,
    mediana:  Math.round(mediana * 10) / 10,
    p60:      p60,
    p75:      Math.round(pct(pesos, 0.75) * 10) / 10,
    max:      Math.round(pesos[pesos.length - 1] * 10) / 10,
    // Sugerencia: percentil 60 redondeado a 5 kg — vende el grueso del lote sin descartar buenos animales
    sugerenciaObjetivo: Math.round(p60 / 5) * 5
  };
}

// ── Endpoint principal ────────────────────────────────────────────────────
function getPlaneacion(filtros) {
  filtros = filtros || {};

  // Filtros base SIN restricción de estado (el histórico mira todo el pasado)
  var fBase = {};
  ['predio', 'lote', 'tipo', 'propietario'].forEach(function(k) {
    if (filtros[k]) fBase[k] = filtros[k];
  });

  // Proyección: solo activos. Histórico: todos los estados.
  var fActivos = {}; for (var k in fBase) fActivos[k] = fBase[k];
  fActivos.soloActivos = true;

  var todos   = listAnimales(fBase);
  var activos = listAnimales(fActivos);

  // Motivo por el que un animal queda fuera del plan de ventas.
  // Solo DOS grupos, a proposito:
  //   · categoria VACA      — pie de cria, no es ganado de engorde
  //   · PREÑADA (cualquiera) — vender una preñada es el error que hay que evitar
  // Las NOVILLAS DE VIENTRE vacias SI entran al plan, y una palpacion dudosa
  // tampoco excluye: no es una preñez confirmada. La primera version sacaba a
  // esos dos grupos tambien y vaciaba el plan de mas.
  var mapaPesoCat = _mapaUltimaMedicion();
  var motivoFuera = {};
  activos.forEach(function(a) {
    if (String(a.estado_reproductivo || '').trim() === 'Preñada') {
      motivoFuera[a.codigo] = 'Preñada';
      return;
    }
    if (clasificarAnimal(a, { mapaPeso: mapaPesoCat }) === 'VACA') {
      motivoFuera[a.codigo] = 'Vaca';
    }
  });

  // ── Series por animal (una lectura de mediciones) ────────────────────────
  var codigoSetTodos = {};
  todos.forEach(function(a) { codigoSetTodos[a.codigo] = true; });

  var medsPorCodigo = {};
  getAll('mediciones').forEach(function(m) {
    if (codigoSetTodos[m.codigo]) (medsPorCodigo[m.codigo] = medsPorCodigo[m.codigo] || []).push(m);
  });

  var serieDe = {};
  todos.forEach(function(a) {
    serieDe[a.codigo] = calcularSerieMediciones(medsPorCodigo[a.codigo] || [], a.peso_inicial, a.fecha_ingreso);
  });

  // ── 1) HISTÓRICO MENSUAL (segmentación por mes) ──────────────────────────
  // Por mes: cuántos animales se midieron, peso promedio, GDP promedio del mes
  // y cuántas mediciones subieron vs bajaron respecto a la anterior.
  var hist = {};
  function bucket(key) {
    if (!hist[key]) hist[key] = { mes: key, codigos: {}, pesos: [], gdps: [], subidas: 0, bajadas: 0 };
    return hist[key];
  }
  todos.forEach(function(a) {
    serieDe[a.codigo].forEach(function(s) {
      var f = _parseFecha(s.fecha);
      if (!f) return;
      var mo  = f.getMonth() + 1;
      var key = f.getFullYear() + '-' + (mo < 10 ? '0' : '') + mo;
      var b = bucket(key);
      if (typeof s.peso === 'number' && s.peso > 0) {
        b.pesos.push(s.peso);
        b.codigos[a.codigo] = true;
      }
      if (s.ganancia !== '' && s.alerta !== 'FECHA_INVALIDA' && s.alerta !== 'DATO_INVALIDO' && s.alerta !== 'GDP_IMPOSIBLE') {
        if (s.ganancia > 0) b.subidas++;
        else if (s.ganancia < 0) b.bajadas++;
      }
      if (s.gdpPer !== '' && s.alerta !== 'GDP_IMPOSIBLE') b.gdps.push(s.gdpPer);
    });
  });
  var historicoMensual = Object.keys(hist).sort().map(function(key) {
    var b = hist[key];
    var prom = function(arr) { return arr.length ? arr.reduce(function(s, v) { return s + v; }, 0) / arr.length : ''; };
    return {
      mes:             key,
      animalesMedidos: Object.keys(b.codigos).length,
      pesoPromedio:    b.pesos.length ? Math.round(prom(b.pesos) * 10) / 10 : '',
      gdpPromedioMes:  b.gdps.length ? Math.round(prom(b.gdps) * 1000) / 1000 : '',
      subidas:         b.subidas,
      bajadas:         b.bajadas
    };
  });

  // ── 2) PROYECCIÓN FORWARD MES A MES ──────────────────────────────────────
  var objetivo   = pesoObjetivoVentaKg();
  var engordaM   = mesesEngordaCompra();
  var horizonteM = Math.max(1, Math.min(24, horizontePlaneacionMeses()));

  // GDP plan del hato: promedio de los últimos GDP válidos de los activos.
  var gdpsHato = [];
  activos.forEach(function(a) {
    var uv = ultimaMedicionValida(serieDe[a.codigo] || []);
    if (uv && !isNaN(uv.gdpPer)) gdpsHato.push(uv.gdpPer);
  });
  var avgHato = gdpsHato.length ? gdpsHato.reduce(function(s, v) { return s + v; }, 0) / gdpsHato.length : null;
  var gdpPlan, gdpOrigen;
  if (avgHato !== null) {
    gdpPlan = Math.max(GDP_PROY_MIN, Math.min(GDP_PROY_MAX, avgHato));
    gdpOrigen = 'hato';
  } else {
    gdpPlan = Math.max(0.1, gdpMinimoKg()); // sin datos: piso conservador (NO el objetivo)
    gdpOrigen = 'meta';
  }

  var hoyD = new Date();
  var mesesFuturos = [];
  for (var m = 1; m <= horizonteM; m++) {
    var dref = new Date(hoyD.getFullYear(), hoyD.getMonth() + m, 1);
    var dmo  = dref.getMonth() + 1;
    mesesFuturos.push(dref.getFullYear() + '-' + (dmo < 10 ? '0' : '') + dmo);
  }

  var ventasPorMes = {};
  mesesFuturos.forEach(function(k) { ventasPorMes[k] = []; });
  var pendientesHorizonte = 0;
  var sinDatos = [];
  var fueraDelPlan = [];

  activos.forEach(function(a) {
    if (motivoFuera[a.codigo]) {
      fueraDelPlan.push({
        codigo:      a.codigo,
        tipo:        a.tipo,
        predio:      a.predio,
        propietario: a.propietario,
        motivo:      motivoFuera[a.codigo],
        meses:       a.meses || ''
      });
      return;
    }
    var serie = serieDe[a.codigo] || [];
    var pesoHoy = ultimoPesoConocido(a, medsPorCodigo[a.codigo] || []);
    if (!(pesoHoy > 0)) { sinDatos.push({ codigo: a.codigo, motivo: 'sin peso' }); return; }

    var uv = ultimaMedicionValida(serie);
    var gdp, origen;
    if (uv && !isNaN(uv.gdpPer)) {
      gdp = Math.max(GDP_PROY_MIN, Math.min(GDP_PROY_MAX, uv.gdpPer));
      origen = 'propio';
    } else {
      gdp = gdpPlan;
      origen = gdpOrigen === 'hato' ? 'promedio-hato' : 'meta';
    }

    // Primer mes en que cruza el objetivo (mínimo 1: si ya lo cumplió, vende ya)
    var mesVenta = null;
    if (pesoHoy >= objetivo) {
      mesVenta = 1;
    } else if (gdp <= 0) {
      pendientesHorizonte++; return;   // ritmo ≤ 0 nunca cruza el objetivo
    } else {
      for (var mm = 1; mm <= horizonteM; mm++) {
        if (pesoHoy + gdp * DIAS_MES * mm >= objetivo) { mesVenta = mm; break; }
      }
    }
    if (!mesVenta || mesVenta > horizonteM) { pendientesHorizonte++; return; }

    var key = mesesFuturos[mesVenta - 1];
    ventasPorMes[key].push({
      codigo:          a.codigo,
      tipo:            a.tipo,
      propietario:     a.propietario,
      predio:          a.predio,
      pesoHoy:         Math.round(pesoHoy * 10) / 10,
      pesoProyectado:  Math.round((pesoHoy + gdp * DIAS_MES * mesVenta) * 10) / 10,
      gdpUsado:        gdp,
      gdpOrigen:       origen
    });
  });

  // Peso de compra recomendado: para llegar al objetivo en los meses de engorda
  var diasEngorda = engordaM * DIAS_MES;
  var pesoCompraRec = Math.round((objetivo - gdpPlan * diasEngorda) / 5) * 5;
  var notaCompra = '';
  if (pesoCompraRec < 150) {
    notaCompra = 'El ritmo actual (' + gdpPlan + ' kg/día) exige comprar muy liviano; se fijó piso de 150 kg.';
    pesoCompraRec = 150;
  } else if (pesoCompraRec > objetivo - 50) {
    pesoCompraRec = Math.round((objetivo - 50) / 5) * 5;
    notaCompra = 'Ritmo insuficiente para llegar al objetivo en ' + engordaM + ' meses con compras normales: se sugiere el máximo viable (objetivo − 50 kg) o ampliar los meses de engorda.';
  }

  // Precio/kg de COMPRA histórico (mediana sobre activos con precio y peso válidos)
  var ratios = [];
  activos.forEach(function(a) {
    var pc = parseFloat(a.precio_compra), pi = parseFloat(a.peso_inicial);
    if (!isNaN(pc) && pc > 0 && !isNaN(pi) && pi > 0) ratios.push(pc / pi);
  });
  ratios.sort(function(x, y) { return x - y; });
  var precioKgCompra = ratios.length
    ? Math.round(ratios[Math.floor(ratios.length / 2)]) : '';

  // Precios efectivos: manda el parametro que puso el usuario; si no lo definio,
  // se cae al historico de ventas. Se informa cual se uso para que la cifra no
  // sea una caja negra.
  var pVentaParam  = precioKgVentaPlan();
  var pCompraParam = precioKgCompraPlan();
  // El precio de VENTA no tiene respaldo historico posible: precioKgCompra es la
  // mediana de precio_compra/peso_inicial, o sea un precio de compra. Usarlo aqui
  // le daria al plan margen cero y un ingreso inventado. Sin parametro, no hay
  // ingreso estimado y la vista lo dice.
  var precioVentaUsado  = pVentaParam  > 0 ? pVentaParam  : '';
  var precioCompraUsado = pCompraParam > 0 ? pCompraParam : (precioKgCompra !== '' ? precioKgCompra : '');
  var origenVenta  = pVentaParam  > 0 ? 'parametro' : 'sin_precio';
  var origenCompra = pCompraParam > 0 ? 'parametro' : (precioCompraUsado !== '' ? 'historico' : 'sin_precio');

  // Saldo de cabezas: con cuantas arranca y con cuantas cierra el hato cada mes.
  // La reposicion es 1:1 el mismo mes, asi que hoy el saldo se mantiene plano;
  // se calcula igual porque esa politica puede cambiar y el numero debe verse.
  var hatoCorriente = activos.length;

  // Armar filas mensuales de proyección
  var proyeccionMensual = mesesFuturos.map(function(key) {
    var ventas = ventasPorMes[key];
    var kg = ventas.reduce(function(s, v) { return s + v.pesoProyectado; }, 0);
    var compras = ventas.length;   // reposición 1:1 el mismo mes
    var hatoInicio = hatoCorriente;
    var hatoFin    = hatoInicio - ventas.length + compras;
    hatoCorriente  = hatoFin;
    return {
      mes:            key,
      ventas:         ventas.length,
      kgEstimados:    Math.round(kg),
      detalle:        ventas,
      compras:        compras,
      pesoCompraRec:  pesoCompraRec,
      hatoInicio:     hatoInicio,
      hatoFin:        hatoFin,
      saldoCabezas:   compras - ventas.length,
      ingresoEst:     (precioVentaUsado  !== '' && kg > 0)      ? Math.round(kg * precioVentaUsado) : '',
      inversionEst:   (precioCompraUsado !== '' && compras > 0) ? Math.round(compras * pesoCompraRec * precioCompraUsado) : ''
    };
  });

  var totalVentas = proyeccionMensual.reduce(function(s, p) { return s + p.ventas; }, 0);
  var totalCompras = proyeccionMensual.reduce(function(s, p) { return s + p.compras; }, 0);
  var inversionTotal = proyeccionMensual.reduce(function(s, p) { return s + (p.inversionEst || 0); }, 0);
  var ingresoTotal   = proyeccionMensual.reduce(function(s, p) { return s + (p.ingresoEst   || 0); }, 0);

  return {
    ok: true,
    data: {
      historicoMensual: historicoMensual,
      proyeccionMensual: proyeccionMensual,
      resumen: {
        totalVentas:            totalVentas,
        kgTotales:              Math.round(proyeccionMensual.reduce(function(s, p) { return s + p.kgEstimados; }, 0)),
        totalCompras:           totalCompras,
        inversionTotal:         inversionTotal || '',
        pesoCompraRecomendado:  pesoCompraRec,
        notaCompra:             notaCompra,
        precioKgCompraRef:      precioKgCompra,
        gdpPlanUsado:           gdpPlan,
        gdpPromedioHato:        avgHato !== null ? Math.round(avgHato * 1000) / 1000 : '',
        gdpOrigen:              gdpOrigen,
        objetivoUsado:          objetivo,
        mesesEngorda:           engordaM,
        horizonte:              horizonteM,
        activosProyectados:     activos.length - sinDatos.length - fueraDelPlan.length,
        pendientesHorizonte:    pendientesHorizonte,
        sinDatos:               sinDatos.slice(0, 30),
        ingresoTotal:           ingresoTotal || '',
        precioVentaUsado:       precioVentaUsado,
        precioCompraUsado:      precioCompraUsado,
        origenPrecioVenta:      origenVenta,
        origenPrecioCompra:     origenCompra,
        hatoInicial:            activos.length,
        hatoFinal:              hatoCorriente,
        fueraDelPlan:           fueraDelPlan.length,
        fueraVacas:             fueraDelPlan.filter(function(x){ return x.motivo === 'Vaca'; }).length,
        fueraPrenadas:          fueraDelPlan.filter(function(x){ return x.motivo === 'Preñada'; }).length
      },
      estadisticasVenta: getEstadisticasVenta(),
      opciones: {
        predios: (function() {
          var vistos = {}, out = [];
          getAll('animales').forEach(function(a) {
            if (a.estado === 'VENDIDO' || a.estado === 'MUERTO') return;
            var pr = String(a.predio || '').trim();
            if (pr && !vistos[pr]) { vistos[pr] = true; out.push(pr); }
          });
          return out.sort();
        })()
      },
      filtroPredio: filtros.predio || '',
      configs: {
        objetivo:      pesoObjetivoVentaKg(),
        engorda:       mesesEngordaCompra(),
        horizonte:     horizontePlaneacionMeses(),
        precioVenta:   pVentaParam  > 0 ? pVentaParam  : '',
        precioCompra:  pCompraParam > 0 ? pCompraParam : ''
      }
    }
  };
}
