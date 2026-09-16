// ════════════════════════════════════════════════════════════════════════
//  lluvias.gs — Registro de lluvia por finca (lectura del pluviómetro)
//
//  Se guarda UNA FILA POR LECTURA DIARIA, no un acumulado mensual. Del detalle
//  diario siempre se puede sacar el mes; de un total mensual no se puede
//  recuperar qué día llovió — y ese día concreto es justo lo que explica por qué
//  una tarea no se pudo hacer. Por eso el calendario de tareas puede mostrar los
//  milímetros del día junto a las labores.
//
//  La hoja nace VACÍA: se crea con sus encabezados y se llena cuando haya datos.
// ════════════════════════════════════════════════════════════════════════

function _hoyLluvia() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function registrarLluvia(payload) {
  payload = payload || {};
  if (!payload.id_predio) return { ok: false, error: 'Indica la finca.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(payload.fecha || ''))) {
    return { ok: false, error: 'La fecha es obligatoria.' };
  }
  if (String(payload.fecha) > _hoyLluvia()) {
    return { ok: false, error: 'No se puede registrar lluvia de un día que todavía no ha pasado.' };
  }
  if (!findOne('predios', 'id_predio', payload.id_predio)) {
    return { ok: false, error: 'Finca no encontrada.' };
  }
  var mm = parseFloat(payload.milimetros);
  // Cero es un dato legítimo y valioso: "ese día NO llovió" explica tanto como
  // un aguacero. Lo que no se acepta es un vacío o un negativo.
  if (isNaN(mm) || mm < 0) return { ok: false, error: 'Los milímetros deben ser un número de 0 en adelante.' };

  // Una sola lectura por finca y día: dos lecturas del mismo pluviómetro el mismo
  // día se pisan una a otra y el acumulado saldría inflado. Se actualiza.
  var previa = getAll('lluvias').filter(function(l) {
    return l.id_predio === payload.id_predio && String(l.fecha) === String(payload.fecha);
  })[0];

  var datos = {
    id_predio:      payload.id_predio,
    fecha:          payload.fecha,
    milimetros:     mm,
    observacion:    String(payload.observacion || '').trim(),
    registrado_por: String(payload.registrado_por || '').trim()
  };

  if (previa) {
    update('lluvias', 'id_lluvia', previa.id_lluvia, datos);
    datos.id_lluvia = previa.id_lluvia;
    return { ok: true, data: datos, actualizada: true };
  }
  datos.id_lluvia = generarId('LLU');
  datos.creada_el = _hoyLluvia();
  insert('lluvias', datos);
  return { ok: true, data: datos, actualizada: false };
}

function eliminarLluvia(id_lluvia) {
  if (!findOne('lluvias', 'id_lluvia', id_lluvia)) return { ok: false, error: 'Registro no encontrado.' };
  deleteRecord('lluvias', 'id_lluvia', id_lluvia);
  return { ok: true };
}

// Mapa "predio|fecha" → mm, para que el calendario de tareas pueda mostrar la
// lluvia del día junto a las labores sin una segunda llamada.
function _mapaLluvia() {
  var m = {};
  getAll('lluvias').forEach(function(l) {
    m[l.id_predio + '|' + l.fecha] = parseFloat(l.milimetros);
  });
  return m;
}

// Todo lo que necesita la vista, en una llamada.
//   anio      — año a analizar
//   id_predio — opcional; sin él, todas las fincas
function getLluvias(filtros) {
  filtros = filtros || {};
  var hoy  = _hoyLluvia();
  var anio = parseInt(filtros.anio, 10);
  if (isNaN(anio)) anio = parseInt(hoy.substring(0, 4), 10);

  var predios = getAll('predios')
    .filter(function(p) { return String(p.activo) !== 'NO'; })
    .sort(function(a, b) { return String(a.nombre).localeCompare(String(b.nombre)); });
  var nombreDe = {};
  predios.forEach(function(p) { nombreDe[p.id_predio] = p.nombre; });

  var todas = getAll('lluvias').map(function(l) {
    var o = {};
    Object.keys(l).forEach(function(k) { o[k] = l[k]; });
    o.milimetros    = parseFloat(l.milimetros) || 0;
    o.predio_nombre = nombreDe[l.id_predio] || '';
    o.mes           = String(l.fecha).substring(0, 7);
    return o;
  });

  var delAnio = todas.filter(function(l) { return String(l.fecha).substring(0, 4) === String(anio); });
  var lista   = filtros.id_predio ? delAnio.filter(function(l) { return l.id_predio === filtros.id_predio; }) : delAnio;

  // Serie mensual por finca: 12 casillas por predio, listas para graficar.
  var serie = predios.map(function(p) {
    var meses = [];
    for (var m = 1; m <= 12; m++) {
      var key = anio + '-' + (m < 10 ? '0' : '') + m;
      var delMes = delAnio.filter(function(l) { return l.id_predio === p.id_predio && l.mes === key; });
      meses.push({
        mes: key,
        mm:  Math.round(delMes.reduce(function(s, l) { return s + l.milimetros; }, 0) * 10) / 10,
        dias: delMes.filter(function(l) { return l.milimetros > 0; }).length,
        lecturas: delMes.length
      });
    }
    return { id_predio: p.id_predio, nombre: p.nombre, meses: meses,
             total: Math.round(meses.reduce(function(s, x) { return s + x.mm; }, 0) * 10) / 10 };
  });

  // Resumen por finca del año.
  var resumen = predios.map(function(p) {
    var suyas = delAnio.filter(function(l) { return l.id_predio === p.id_predio; });
    var conLluvia = suyas.filter(function(l) { return l.milimetros > 0; });
    var maxima = suyas.reduce(function(mx, l) { return (!mx || l.milimetros > mx.milimetros) ? l : mx; }, null);
    return {
      id_predio:  p.id_predio,
      nombre:     p.nombre,
      lecturas:   suyas.length,
      diasLluvia: conLluvia.length,
      total:      Math.round(suyas.reduce(function(s, l) { return s + l.milimetros; }, 0) * 10) / 10,
      // El promedio se saca sobre los días QUE LLOVIÓ, no sobre todas las
      // lecturas: mezclar los ceros dice cuánto llovió "en promedio al día",
      // que no es lo que nadie pregunta.
      promedioDiaLluvia: conLluvia.length
        ? Math.round(conLluvia.reduce(function(s, l) { return s + l.milimetros; }, 0) / conLluvia.length * 10) / 10 : 0,
      maxima:     maxima ? { mm: maxima.milimetros, fecha: maxima.fecha } : null,
      ultima:     suyas.sort(function(a, b) { return String(b.fecha).localeCompare(String(a.fecha)); })[0] || null
    };
  });

  return {
    ok: true, hoy: hoy, anio: anio,
    hayDatos: todas.length > 0,
    totalRegistros: todas.length,
    // Años con lecturas, para poder navegar cuando se acumule historia.
    anios: (function() {
      var v = {}; todas.forEach(function(l) { v[String(l.fecha).substring(0, 4)] = true; });
      var a = Object.keys(v).sort().reverse();
      if (a.indexOf(String(anio)) < 0) a.unshift(String(anio));
      return a;
    })(),
    predios: predios,
    resumen: resumen,
    serie:   serie,
    lista:   lista.sort(function(a, b) { return String(b.fecha).localeCompare(String(a.fecha)); }).slice(0, 120)
  };
}
