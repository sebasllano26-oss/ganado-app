// ════════════════════════════════════════════════════════════════════════
//  ventas.gs — Registro y análisis de ventas
// ════════════════════════════════════════════════════════════════════════

// Registra la venta de un animal.
function registrarVenta(payload) {
  payload = payload || {};
  if (!payload.codigo)      return { ok: false, error: 'El código del animal es obligatorio.' };
  if (!payload.fecha_venta) return { ok: false, error: 'La fecha de venta es obligatoria.' };
  if (!payload.precio_salida || isNaN(parseFloat(payload.precio_salida))) {
    return { ok: false, error: 'El precio de salida debe ser un número.' };
  }
  if (!payload.peso_salida || isNaN(parseFloat(payload.peso_salida))) {
    return { ok: false, error: 'El peso de salida debe ser un número.' };
  }

  var animal = findOne('animales', 'codigo', payload.codigo);
  if (!animal) return { ok: false, error: 'Animal no encontrado.' };

  var precioSalida = parseFloat(payload.precio_salida);
  var pesoSalida   = parseFloat(payload.peso_salida);
  var precioKg     = (pesoSalida > 0) ? Math.round((precioSalida / pesoSalida) * 100) / 100 : '';

  // El costo del animal es OBLIGATORIO para poder hablar de utilidad.
  // Antes esto era: parseFloat(animal.precio_compra) || 0 — si el animal no tenia
  // precio de compra, la venta se registraba como si el animal hubiera costado
  // CERO. La utilidad salia igual al precio de venta entero y la rentabilidad,
  // absurda — todo sin un solo aviso. Vale mucho mas frenar y pedir el dato.
  var precioCompra = parseFloat(animal.precio_compra);
  if (isNaN(precioCompra) || precioCompra <= 0) {
    return { ok: false, sinCosto: true, codigo: payload.codigo,
      error: 'El animal ' + payload.codigo + ' no tiene precio de compra registrado. ' +
             'Sin ese dato la utilidad de la venta seria falsa (se calcularia como si el animal ' +
             'hubiera costado cero). Registra primero el precio de compra en la ficha del animal.' };
  }

  var utilidad   = Math.round((precioSalida - precioCompra) * 100) / 100;
  var diasPredio = calcularDiasFinca(animal.fecha_ingreso, payload.fecha_venta);

  var venta = {
    id_venta:       generarId('VNT'),
    codigo:         payload.codigo,
    fecha_venta:    payload.fecha_venta,
    precio_salida:  precioSalida,
    precio_kg:      precioKg,
    peso_salida:    pesoSalida,
    precio_compra:  precioCompra,
    utilidad:       utilidad,
    dias_en_predio: diasPredio,
    comprador:      String(payload.comprador || '').trim()
  };

  insert('ventas', venta);
  update('animales', 'codigo', payload.codigo, {
    estado:       'VENDIDO',
    dias_en_finca: diasPredio
  });

  return { ok: true, data: venta };
}

// ── COSTO DE UNA VENTA ────────────────────────────────────────────────────
// Manda el precio de compra que tiene HOY la hoja 'animales'. La foto guardada
// en la venta se conserva y se compara: si difieren, es que alguien corrigio el
// precio despues de vender, y esa diferencia hay que mostrarla, no esconderla.
//
// Por que el vivo y no la foto: el usuario corrige el precio en la ficha del
// animal esperando que las cifras cuadren. Si la venta se quedara con la foto,
// la rentabilidad seguiria calculandose sobre un dato que el propio usuario ya
// dio por malo.
function _resolverCostoVenta(venta, animal) {
  var guardado = parseFloat(venta.precio_compra);
  var vivo     = animal ? parseFloat(animal.precio_compra) : NaN;

  var costo  = !isNaN(vivo) && vivo > 0 ? vivo
             : (!isNaN(guardado) && guardado > 0 ? guardado : null);
  var origen = !isNaN(vivo) && vivo > 0 ? 'animal'
             : (!isNaN(guardado) && guardado > 0 ? 'venta' : 'sin_costo');

  // Desfase = la venta guarda un costo distinto del que hoy tiene el animal.
  // Incluye el caso historico: ventas sin la columna, con la utilidad calculada
  // sobre un costo que ya no existe.
  var desfase = null;
  if (costo !== null) {
    var implicito = parseFloat(venta.precio_salida) - parseFloat(venta.utilidad);
    if (!isNaN(implicito) && Math.abs(implicito - costo) > 1) {
      desfase = { costoImplicito: Math.round(implicito), costoReal: Math.round(costo),
                  diferencia: Math.round(costo - implicito) };
    }
  }
  return { costo: costo, origen: origen, guardado: isNaN(guardado) ? null : guardado, desfase: desfase };
}

// Enriquece una lista de ventas con el costo resuelto y la utilidad RECALCULADA.
// La utilidad que viaja al frontend ya no es la congelada en la hoja.
function _enriquecerVentas(ventas) {
  var porCodigo = {};
  getAll('animales').forEach(function(a) { porCodigo[String(a.codigo).trim()] = a; });

  return ventas.map(function(v) {
    var r = _resolverCostoVenta(v, porCodigo[String(v.codigo).trim()]);
    var o = {};
    Object.keys(v).forEach(function(k) { o[k] = v[k]; });
    o.precio_compra      = r.costo === null ? '' : Math.round(r.costo);
    o.costo_origen       = r.origen;
    o.costo_registrado   = r.guardado;
    o.desfase_costo      = r.desfase;
    o.utilidad = (r.costo === null || isNaN(parseFloat(v.precio_salida)))
      ? ''
      : Math.round((parseFloat(v.precio_salida) - r.costo) * 100) / 100;
    o.utilidad_registrada = v.utilidad;
    return o;
  });
}

// ── DIAGNOSTICO (solo lectura) ────────────────────────────────────────────
// Ejecutar desde el editor de Apps Script para ver el alcance del problema
// ANTES de tocar nada. No modifica ninguna hoja.
function DIAGNOSTICO_VENTAS() {
  var ventas = _enriquecerVentas(getAll('ventas'));
  var sinCosto = ventas.filter(function(v){ return v.costo_origen === 'sin_costo'; });
  var desfase  = ventas.filter(function(v){ return v.desfase_costo; });

  var l = [];
  l.push('VENTAS REVISADAS: ' + ventas.length);
  l.push('');
  l.push('SIN PRECIO DE COMPRA (' + sinCosto.length + ') — su utilidad se calculo sobre CERO:');
  sinCosto.forEach(function(v) { l.push('   ' + v.codigo + '  vendido en ' + v.precio_salida); });
  l.push('');
  l.push('CON EL COSTO DESFASADO (' + desfase.length + ') — la venta dice un costo y el animal otro:');
  desfase.forEach(function(v) {
    var d = v.desfase_costo;
    l.push('   ' + v.codigo + '  la venta asume ' + d.costoImplicito +
           '  ·  el animal dice ' + d.costoReal +
           '  ·  diferencia ' + (d.diferencia > 0 ? '+' : '') + d.diferencia);
  });
  l.push('');
  l.push(sinCosto.length + desfase.length === 0
    ? 'Todo cuadra: ninguna venta contradice la hoja de animales.'
    : 'Las vistas YA muestran el costo real del animal (se recalcula al vuelo).');
  l.push('Para dejarlo escrito tambien en la hoja ventas, ejecuta REPARAR_VENTAS().');

  var txt = l.join('\n');
  Logger.log(txt);
  return txt;
}

// ── REPARACION (escribe en la hoja) ───────────────────────────────────────
// Reescribe precio_compra y utilidad de cada venta con el precio que hoy tiene
// el animal. NO hace falta para que las vistas esten bien —esas ya recalculan—;
// sirve para dejar la hoja coherente con lo que se ve. Ejecutar a mano.
function REPARAR_VENTAS() {
  var porCodigo = {};
  getAll('animales').forEach(function(a) { porCodigo[String(a.codigo).trim()] = a; });

  var arregladas = 0, sinCosto = [];
  getAll('ventas').forEach(function(v) {
    var animal = porCodigo[String(v.codigo).trim()];
    var vivo   = animal ? parseFloat(animal.precio_compra) : NaN;
    if (isNaN(vivo) || vivo <= 0) { sinCosto.push(v.codigo); return; }

    var nuevaUtil = Math.round((parseFloat(v.precio_salida) - vivo) * 100) / 100;
    if (parseFloat(v.precio_compra) === vivo && parseFloat(v.utilidad) === nuevaUtil) return;

    update('ventas', 'id_venta', v.id_venta, { precio_compra: vivo, utilidad: nuevaUtil });
    arregladas++;
  });

  var txt = 'Ventas actualizadas: ' + arregladas +
    (sinCosto.length ? '\nSin precio de compra en el animal, no se pudieron arreglar: ' + sinCosto.join(', ') : '');
  Logger.log(txt);
  return txt;
}

// Datos completos para la vista Finanzas (protegida con PIN en el frontend).
function getFinanzasCompleto(payload) {
  // El candado, y esta vez en el servidor. Antes esta funcion le respondia a
  // cualquiera que la llamara: el PIN se comparaba en el navegador y aqui no se
  // miraba. Ver seguridad.gs para el porque completo.
  _exigirPinFinanzas(payload);

  var activos = listAnimales({ soloActivos: true });
  var ventas  = _enriquecerVentas(getAll('ventas'));

  // Pre-agrupar mediciones por código (una sola lectura de la hoja) para calcular
  // peso actual y GDP promedio por animal — la tabla de detalle los mostraba en "—".
  var medsPorCodigo = {};
  getAll('mediciones').forEach(function(m) {
    (medsPorCodigo[m.codigo] = medsPorCodigo[m.codigo] || []).push(m);
  });
  activos = activos.map(function(a) {
    var meds    = medsPorCodigo[a.codigo] || [];
    var serie   = calcularSerieMediciones(meds, a.peso_inicial, a.fecha_ingreso);
    var resumen = calcularResumenGdp(serie);
    var obj = {};
    Object.keys(a).forEach(function(k) { obj[k] = a[k]; });
    obj.ultimo_peso  = ultimoPesoConocido(a, meds);
    obj.gdp_promedio = resumen ? resumen.gdpPromedio : '';
    return obj;
  });

  return {
    activos: activos,
    ventas:  ventas,
    resumen: {
      totalActivos:          activos.length,
      totalInvertidoActivos: activos.reduce(function(s, a) { return s + (parseFloat(a.precio_compra) || 0); }, 0),
      totalIngresos:         ventas.reduce(function(s,  v) { return s + (parseFloat(v.precio_salida) || 0); }, 0),
      totalUtilidad:         ventas.reduce(function(s,  v) { return s + (parseFloat(v.utilidad)      || 0); }, 0),
      totalVendidos:         ventas.length,
      // Cuantas ventas no cuadran con la hoja de animales. El frontend avisa.
      ventasSinCosto:        ventas.filter(function(v){ return v.costo_origen === 'sin_costo'; }).length,
      ventasDesfasadas:      ventas.filter(function(v){ return v.desfase_costo; }).length
    }
  };
}

// Resumen financiero de un animal.
// OJO: hoy NO LA LLAMA NADIE — ni el frontend ni ninguna otra funcion del
// backend. Se protege igual, que cuesta una linea y devuelve dinero, y queda
// anotada para borrarla en una fase de limpieza.
function getFinancieroAnimal(codigo, payload) {
  _exigirPinFinanzas(payload);

  var animal = findOne('animales', 'codigo', codigo);
  if (!animal) return null;

  var ventas = findMany('ventas', 'codigo', codigo);
  var meds   = findMany('mediciones', 'codigo', codigo);
  var serie  = calcularSerieMediciones(meds, animal.peso_inicial, animal.fecha_ingreso);
  var pesoAct = ultimoPesoConocido(animal, meds);

  return {
    precioCompra:  parseFloat(animal.precio_compra) || 0,
    pesoInicial:   parseFloat(animal.peso_inicial)  || 0,
    pesoActual:    pesoAct,
    kgsGanados:    Math.round((pesoAct - parseFloat(animal.peso_inicial)) * 100) / 100,
    gdpPromedio:   serie.length ? calcularResumenGdp(serie).gdpPromedio : null,
    ventas:        ventas,
    utilidadTotal: ventas.reduce(function(s, v) { return s + (parseFloat(v.utilidad) || 0); }, 0)
  };
}

// Lista de ventas con filtros opcionales de fecha.
function listVentas(filtros) {
  filtros = filtros || {};
  var todas = _enriquecerVentas(getAll('ventas'));
  if (filtros.desde) todas = todas.filter(function(v) { return new Date(v.fecha_venta) >= new Date(filtros.desde); });
  if (filtros.hasta) todas = todas.filter(function(v) { return new Date(v.fecha_venta) <= new Date(filtros.hasta); });
  return todas;
}
