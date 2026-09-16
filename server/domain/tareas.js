// ════════════════════════════════════════════════════════════════════════
//  tareas.gs — Programación y seguimiento de labores por predio y lote
//
//  El ciclo que sostiene este módulo:
//     planeamos → programamos → ejecutamos → verificamos
//                              → si no se ejecuta, reprogramamos
//                              → conservamos el historial
//
//  Regla que lo gobierna todo: NINGUNA TAREA DESAPARECE. Una labor que no se
//  hizo no se borra ni se mueve en silencio; se cierra con su motivo y, si toca,
//  nace otra enlazada a ella. Por eso el calendario de un martes sigue diciendo
//  la verdad de ese martes aunque la labor se haya hecho el jueves.
// ════════════════════════════════════════════════════════════════════════

// Catálogo de labores. `dias` = intervalo sugerido para repetirla; 0 = sin
// sugerencia. Es una sugerencia editable en cada cierre, nunca una imposición.
// Mismo patrón que SAN_TIPOS en el frontend, que ya funciona así.
var ACTIVIDADES_TAREA = [
  { tipo: 'Guadañar',      dias: 45  },
  { tipo: 'Fumigar',       dias: 60  },
  { tipo: 'Machetear',     dias: 60  },
  { tipo: 'Abonar',        dias: 120 },
  { tipo: 'Riego',         dias: 15  },
  { tipo: 'Cercas',        dias: 180 },
  { tipo: 'Vacunar',       dias: 0   },   // el protocolo lo rige Sanidad
  { tipo: 'Mantenimiento', dias: 0   },
  { tipo: 'Otra',          dias: 0   }
];

var ESTADOS_TAREA = ['PROGRAMADA', 'EN_CURSO', 'REALIZADA', 'NO_EJECUTADA', 'CANCELADA'];

// Dos niveles y no mas. En el campo la decision es binaria: "esto no puede
// esperar" o "esto va cuando se pueda". Tres niveles obligarian a distinguir
// alta de media, que nadie hace igual dos veces, y URGENTE dejaria de pesar.
var PRIORIDADES_TAREA = ['URGENTE', 'NORMAL'];

// Las tareas creadas antes de que existiera la columna traen la celda vacia:
// se leen como NORMAL, que es lo que eran.
function _normPrioridad(v) {
  var p = String(v == null ? '' : v).trim().toUpperCase();
  return p === 'URGENTE' ? 'URGENTE' : 'NORMAL';
}

// ── Fechas ────────────────────────────────────────────────────────────────
// Siempre con el calendario local del script. NUNCA toISOString(): convierte a
// UTC y en Colombia (UTC−5) devuelve el día siguiente a partir de las 19:00.
function _hoyTarea() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
}
function _sumarDias(iso, dias) {
  var p = String(iso).split('-');
  var d = new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
  d.setDate(d.getDate() + parseInt(dias, 10));
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}
function _esFechaISO(v) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));
}
// Las fechas viajan como yyyy-MM-dd, que ordena igual alfabética que
// cronológicamente: comparar como texto es correcto y evita zonas horarias.
function _diasEntre(desdeISO, hastaISO) {
  var a = String(desdeISO).split('-'), b = String(hastaISO).split('-');
  var d1 = new Date(+a[0], +a[1] - 1, +a[2]);
  var d2 = new Date(+b[0], +b[1] - 1, +b[2]);
  return Math.round((d2 - d1) / 86400000);
}

// ════════════════════════════════════════════════════════════════════════
//  PREDIOS Y LOTES
// ════════════════════════════════════════════════════════════════════════

function listPrediosLotes(incluirArchivados) {
  var lotes = getAll('lotes');
  var porPredio = {};
  lotes.forEach(function(l) {
    if (!incluirArchivados && String(l.activo) === 'NO') return;
    (porPredio[l.id_predio] = porPredio[l.id_predio] || []).push(l);
  });
  Object.keys(porPredio).forEach(function(k) {
    porPredio[k].sort(function(a, b) { return String(a.nombre).localeCompare(String(b.nombre)); });
  });

  var predios = getAll('predios')
    .filter(function(p) { return incluirArchivados || String(p.activo) !== 'NO'; })
    .map(function(p) {
      var o = {};
      Object.keys(p).forEach(function(k) { o[k] = p[k]; });
      o.lotes = porPredio[p.id_predio] || [];
      return o;
    })
    .sort(function(a, b) { return String(a.nombre).localeCompare(String(b.nombre)); });

  return { ok: true, predios: predios, actividades: ACTIVIDADES_TAREA };
}

function guardarPredio(payload) {
  payload = payload || {};
  var nombre = String(payload.nombre || '').trim();
  if (!nombre) return { ok: false, error: 'El nombre del predio es obligatorio.' };

  // Dos predios con el mismo nombre harían imposible saber a cuál pertenece un
  // lote al mirarlo, y el historial quedaría repartido entre ambos.
  var choque = getAll('predios').filter(function(p) {
    return String(p.nombre).trim().toUpperCase() === nombre.toUpperCase() &&
           p.id_predio !== payload.id_predio;
  });
  if (choque.length) return { ok: false, error: 'Ya existe un predio llamado "' + nombre + '".' };

  var datos = {
    nombre:      nombre,
    propietario: String(payload.propietario || '').trim(),
    notas:       String(payload.notas || '').trim(),
    activo:      payload.activo === 'NO' ? 'NO' : 'SI'
  };

  if (payload.id_predio) {
    if (!findOne('predios', 'id_predio', payload.id_predio)) {
      return { ok: false, error: 'Predio no encontrado.' };
    }
    update('predios', 'id_predio', payload.id_predio, datos);
    datos.id_predio = payload.id_predio;
  } else {
    datos.id_predio = generarId('PRE');
    insert('predios', datos);
  }
  return { ok: true, data: datos };
}

function guardarLote(payload) {
  payload = payload || {};
  var nombre = String(payload.nombre || '').trim();
  if (!payload.id_predio) return { ok: false, error: 'El lote debe pertenecer a un predio.' };
  if (!nombre)            return { ok: false, error: 'El nombre del lote es obligatorio.' };
  if (!findOne('predios', 'id_predio', payload.id_predio)) {
    return { ok: false, error: 'Predio no encontrado.' };
  }

  // El choque se mira DENTRO del predio: dos predios pueden tener cada uno su
  // "Lote 1" sin ambigüedad, pero un mismo predio con dos "Lote 1" sí la crea.
  var choque = getAll('lotes').filter(function(l) {
    return l.id_predio === payload.id_predio &&
           String(l.nombre).trim().toUpperCase() === nombre.toUpperCase() &&
           l.id_lote !== payload.id_lote;
  });
  if (choque.length) return { ok: false, error: 'Ese predio ya tiene un lote llamado "' + nombre + '".' };

  var area = parseFloat(payload.area_ha);
  var datos = {
    id_predio: payload.id_predio,
    nombre:    nombre,
    area_ha:   (isNaN(area) || area <= 0) ? '' : area,
    notas:     String(payload.notas || '').trim(),
    activo:    payload.activo === 'NO' ? 'NO' : 'SI'
  };

  if (payload.id_lote) {
    if (!findOne('lotes', 'id_lote', payload.id_lote)) return { ok: false, error: 'Lote no encontrado.' };
    update('lotes', 'id_lote', payload.id_lote, datos);
    datos.id_lote = payload.id_lote;
  } else {
    datos.id_lote = generarId('LOT');
    insert('lotes', datos);
  }
  return { ok: true, data: datos };
}

// Archivar, no borrar: un lote con historial no puede desaparecer sin llevarse
// consigo el registro de todo lo que se le hizo.
function archivarLote(id_lote, archivar) {
  if (!findOne('lotes', 'id_lote', id_lote)) return { ok: false, error: 'Lote no encontrado.' };
  update('lotes', 'id_lote', id_lote, { activo: archivar === false ? 'SI' : 'NO' });
  return { ok: true };
}
function archivarPredio(id_predio, archivar) {
  if (!findOne('predios', 'id_predio', id_predio)) return { ok: false, error: 'Predio no encontrado.' };
  update('predios', 'id_predio', id_predio, { activo: archivar === false ? 'SI' : 'NO' });
  return { ok: true };
}

// ── SEMBRADO INICIAL ──────────────────────────────────────────────────────
// Crea el registro de predios leyendo los que ya están escritos en la hoja
// 'animales'. Idempotente: si el predio ya existe por nombre, lo salta, así que
// se puede ejecutar las veces que haga falta sin duplicar nada.
// Los lotes NO se pueden sembrar: hoy el campo 'lote' de animales es una copia
// del predio, así que no hay de dónde sacarlos. Se cargan a mano una vez.
function SEMBRAR_PREDIOS_DESDE_ANIMALES() {
  var existentes = {};
  getAll('predios').forEach(function(p) {
    existentes[String(p.nombre).trim().toUpperCase()] = true;
  });

  var creados = [], saltados = [];
  getUniqueValues('animales', 'predio').forEach(function(nombre) {
    var n = String(nombre).trim();
    if (!n) return;
    if (existentes[n.toUpperCase()]) { saltados.push(n); return; }
    existentes[n.toUpperCase()] = true;
    var datos = { id_predio: generarId('PRE'), nombre: n, propietario: '', notas: '', activo: 'SI' };
    insert('predios', datos);
    creados.push(n);
  });

  var txt = 'Predios creados: ' + (creados.length ? creados.join(', ') : 'ninguno') +
            (saltados.length ? '\nYa existían: ' + saltados.join(', ') : '') +
            '\n\nLos lotes se cargan a mano desde la pestaña Tareas → Predios y lotes.';
  Logger.log(txt);
  return txt;
}

// ════════════════════════════════════════════════════════════════════════
//  TAREAS
// ════════════════════════════════════════════════════════════════════════

// Índice de sucesoras por REPROGRAMACIÓN. Una tarea está "reprogramada" si otra
// la señala con id_origen Y el vínculo es de reprogramación — no de repetición.
// Sin ese filtro, cerrar una labor y programar la siguiente marcaría la cumplida
// como reprogramada, que es sencillamente falso.
function _indexarSucesoras(tareas) {
  var idx = {};
  tareas.forEach(function(t) {
    if (t.id_origen && String(t.origen_tipo) === 'REPROGRAMACION') {
      idx[t.id_origen] = t;
    }
  });
  return idx;
}

// Añade lo que NO se guarda: los dos estados deducidos y los nombres legibles.
function _enriquecerTarea(t, sucesoras, predios, lotes, hoy) {
  var o = {};
  Object.keys(t).forEach(function(k) { o[k] = t[k]; });

  var suc = sucesoras[t.id_tarea];
  // PENDIENTE: programada y la fecha ya pasó. Deducido, no guardado: si se
  // guardara haría falta un proceso nocturno, y el día que no corriera el
  // tablero mentiría.
  o.pendiente    = (t.estado === 'PROGRAMADA' && String(t.fecha_programada) < hoy);
  o.reprogramada = !!suc;
  o.sucesora_fecha = suc ? suc.fecha_programada : '';
  o.sucesora_id    = suc ? suc.id_tarea : '';

  var pr = predios[t.id_predio], lo = lotes[t.id_lote];
  o.predio_nombre = pr ? pr.nombre : '';
  o.lote_nombre   = lo ? lo.nombre : '';
  o.dias_desfase  = _esFechaISO(t.fecha_programada) ? _diasEntre(t.fecha_programada, hoy) : '';
  o.prioridad     = _normPrioridad(t.prioridad);
  return o;
}

function _mapear(hoja, clave) {
  var m = {};
  getAll(hoja).forEach(function(r) { m[r[clave]] = r; });
  return m;
}

// Datos del calendario en UNA sola llamada: el mes pedido y las atrasadas.
// Van juntas porque Apps Script cobra caro cada arranque en frío, y porque las
// atrasadas se muestran SIEMPRE, sea cual sea el mes en pantalla — es la
// garantía de que nada se olvide al pasar de página.
function getTareasCalendario(filtros) {
  filtros = filtros || {};
  var hoy = _hoyTarea();

  var anio = parseInt(filtros.anio, 10);
  var mes  = parseInt(filtros.mes, 10);   // 1-12
  if (isNaN(anio) || isNaN(mes)) {
    anio = parseInt(hoy.substring(0, 4), 10);
    mes  = parseInt(hoy.substring(5, 7), 10);
  }
  var mesKey = anio + '-' + (mes < 10 ? '0' : '') + mes;

  var todas   = getAll('tareas');
  var predios = _mapear('predios', 'id_predio');
  var lotes   = _mapear('lotes',   'id_lote');
  var suc     = _indexarSucesoras(todas);

  var ricas = todas.map(function(t) { return _enriquecerTarea(t, suc, predios, lotes, hoy); });

  if (filtros.id_predio) {
    ricas = ricas.filter(function(t) { return t.id_predio === filtros.id_predio; });
  }

  var delMes = ricas.filter(function(t) {
    return String(t.fecha_programada).substring(0, 7) === mesKey;
  }).sort(function(a, b) {
    return String(a.fecha_programada).localeCompare(String(b.fecha_programada));
  });

  // Atrasadas = lo que quedó suelto. Una tarea reprogramada NO entra: su
  // sucesora ya la lleva adelante, y contarla dos veces haría ruido en vez de
  // aviso. Las canceladas tampoco: se decidió no hacerlas.
  var atrasadas = ricas.filter(function(t) {
    if (t.reprogramada) return false;
    if (t.estado === 'NO_EJECUTADA') return true;
    return t.pendiente;
  }).sort(function(a, b) {
    return String(a.fecha_programada).localeCompare(String(b.fecha_programada));
  });

  var responsables = {};
  todas.forEach(function(t) { if (t.responsable) responsables[t.responsable] = true; });

  // Cumplimiento del mes: de lo que ya se CERRO, cuanto se hizo. Las programadas
  // a futuro no cuentan — todavia no han tenido su oportunidad, y meterlas
  // hundiria el porcentaje sin que nadie haya fallado en nada.
  var hechas = delMes.filter(function(t) { return t.estado === 'REALIZADA'; }).length;
  var falladas = delMes.filter(function(t) { return t.estado === 'NO_EJECUTADA'; }).length;
  var cerradas = hechas + falladas;

  // Lluvia del mes por finca y dia, para pintarla junto a las labores. Si la hoja
  // aun no existe o esta vacia, el mapa sale vacio y no pasa nada.
  var lluviaMes = {};
  try {
    getAll('lluvias').forEach(function(l) {
      if (String(l.fecha).substring(0, 7) !== mesKey) return;
      if (filtros.id_predio && l.id_predio !== filtros.id_predio) return;
      var mm = parseFloat(l.milimetros);
      if (isNaN(mm)) return;
      lluviaMes[l.fecha] = Math.round(((lluviaMes[l.fecha] || 0) + mm) * 10) / 10;
    });
  } catch (e) { lluviaMes = {}; }

  return {
    ok: true,
    anio: anio, mes: mes,
    hoy: hoy,
    tareas: delMes,
    atrasadas: atrasadas,
    lluvia: lluviaMes,
    resumen: {
      total:        delMes.length,
      programadas:  delMes.filter(function(t) { return t.estado === 'PROGRAMADA' && !t.pendiente; }).length,
      pendientes:   delMes.filter(function(t) { return t.pendiente; }).length,
      enCurso:      delMes.filter(function(t) { return t.estado === 'EN_CURSO'; }).length,
      hechas:       hechas,
      noEjecutadas: falladas,
      canceladas:   delMes.filter(function(t) { return t.estado === 'CANCELADA'; }).length,
      cumplimiento: cerradas ? Math.round(hechas / cerradas * 100) : ''
    },
    opciones: {
      predios:      listPrediosLotes().predios,
      actividades:  ACTIVIDADES_TAREA,
      responsables: Object.keys(responsables).sort()
    }
  };
}

// ── Alta ──────────────────────────────────────────────────────────────────
function _validarTarea(payload) {
  if (!payload.id_predio)  return 'Indica el predio.';
  if (!payload.actividad)  return 'Indica la actividad.';
  if (!_esFechaISO(payload.fecha_programada)) return 'La fecha programada es obligatoria.';
  if (!findOne('predios', 'id_predio', payload.id_predio)) return 'Predio no encontrado.';
  if (payload.id_lote) {
    var lote = findOne('lotes', 'id_lote', payload.id_lote);
    if (!lote) return 'Lote no encontrado.';
    // Un lote de otro predio dejaría el historial colgando del sitio equivocado.
    if (lote.id_predio !== payload.id_predio) return 'Ese lote no pertenece al predio indicado.';
  }
  return null;
}

function _insertarTarea(payload, origen, origenTipo) {
  var t = {
    id_tarea:         generarId('TAR'),
    id_predio:        payload.id_predio,
    id_lote:          payload.id_lote || '',
    actividad:        String(payload.actividad || '').trim(),
    descripcion:      String(payload.descripcion || '').trim(),
    responsable:      String(payload.responsable || '').trim(),
    fecha_programada: payload.fecha_programada,
    fecha_ejecucion:  '',
    estado:           'PROGRAMADA',
    motivo:           '',
    observacion:      '',
    id_origen:        origen     || '',
    origen_tipo:      origenTipo || '',
    creada_el:        _hoyTarea(),
    prioridad:        _normPrioridad(payload.prioridad)
  };
  insert('tareas', t);
  return t;
}

function crearTarea(payload) {
  payload = payload || {};
  var err = _validarTarea(payload);
  if (err) return { ok: false, error: err };
  return { ok: true, data: _insertarTarea(payload) };
}

// La llamada del jueves: varias labores de un predio, de un tirón.
function crearTareasSemana(payload) {
  payload = payload || {};
  var lista = payload.tareas || [];
  if (!lista.length) return { ok: false, error: 'No hay tareas para programar.' };

  var creadas = 0, errores = [];
  lista.forEach(function(t, i) {
    var err = _validarTarea(t);
    if (err) { errores.push('Fila ' + (i + 1) + ': ' + err); return; }
    _insertarTarea(t);
    creadas++;
  });
  return { ok: errores.length === 0, total: creadas, errores: errores };
}

function actualizarTarea(payload) {
  payload = payload || {};
  var t = findOne('tareas', 'id_tarea', payload.id_tarea);
  if (!t) return { ok: false, error: 'Tarea no encontrada.' };

  var mezcla = {};
  Object.keys(t).forEach(function(k) { mezcla[k] = t[k]; });
  ['id_predio','id_lote','actividad','descripcion','responsable','fecha_programada','prioridad'].forEach(function(k) {
    if (payload[k] !== undefined) mezcla[k] = payload[k];
  });
  mezcla.prioridad = _normPrioridad(mezcla.prioridad);
  var err = _validarTarea(mezcla);
  if (err) return { ok: false, error: err };

  if (payload.estado !== undefined) {
    if (ESTADOS_TAREA.indexOf(payload.estado) < 0) return { ok: false, error: 'Estado no válido.' };
    mezcla.estado = payload.estado;
  }
  var cambios = {};
  ['id_predio','id_lote','actividad','descripcion','responsable','fecha_programada','estado','prioridad']
    .forEach(function(k) { cambios[k] = mezcla[k]; });

  update('tareas', 'id_tarea', payload.id_tarea, cambios);
  return { ok: true, data: cambios };
}

// ── Cierre: se hizo ───────────────────────────────────────────────────────
// Si se pide repetirla, la siguiente nace con vínculo REPETICION — nunca
// REPROGRAMACION, o esta tarea cumplida aparecería marcada como reprogramada.
function completarTarea(payload) {
  payload = payload || {};
  var t = findOne('tareas', 'id_tarea', payload.id_tarea);
  if (!t) return { ok: false, error: 'Tarea no encontrada.' };

  var fechaEjec = _esFechaISO(payload.fecha_ejecucion) ? payload.fecha_ejecucion : _hoyTarea();
  if (fechaEjec > _hoyTarea()) return { ok: false, error: 'La fecha de ejecución no puede ser futura.' };

  update('tareas', 'id_tarea', payload.id_tarea, {
    estado:          'REALIZADA',
    fecha_ejecucion: fechaEjec,
    observacion:     String(payload.observacion || '').trim(),
    motivo:          ''
  });

  var siguiente = null;
  var dias = parseInt(payload.repetir_en_dias, 10);
  if (!isNaN(dias) && dias > 0) {
    siguiente = _insertarTarea({
      id_predio:        t.id_predio,
      id_lote:          t.id_lote,
      actividad:        t.actividad,
      descripcion:      t.descripcion,
      responsable:      payload.responsable_siguiente || t.responsable,
      fecha_programada: _sumarDias(fechaEjec, dias)
    }, t.id_tarea, 'REPETICION');
  }
  return { ok: true, data: { id_tarea: t.id_tarea, estado: 'REALIZADA', fecha_ejecucion: fechaEjec },
           siguiente: siguiente };
}

// ── Cierre: no se hizo ────────────────────────────────────────────────────
// La tarea NO se mueve ni se borra: queda cerrada con su motivo en su fecha
// original, y si hay nueva fecha nace otra enlazada. Así el calendario de aquel
// día sigue mostrando que ese día había algo pendiente.
function noEjecutarTarea(payload) {
  payload = payload || {};
  var t = findOne('tareas', 'id_tarea', payload.id_tarea);
  if (!t) return { ok: false, error: 'Tarea no encontrada.' };

  var motivo = String(payload.motivo || '').trim();
  if (!motivo) return { ok: false, error: 'Indica por qué no se pudo hacer (lluvia, emergencia, otra prioridad…).' };

  update('tareas', 'id_tarea', payload.id_tarea, {
    estado:      'NO_EJECUTADA',
    motivo:      motivo,
    observacion: String(payload.observacion || '').trim()
  });

  var siguiente = null;
  if (payload.nueva_fecha) {
    if (!_esFechaISO(payload.nueva_fecha)) return { ok: false, error: 'La nueva fecha no es válida.' };
    siguiente = _insertarTarea({
      id_predio:        t.id_predio,
      id_lote:          t.id_lote,
      actividad:        t.actividad,
      descripcion:      t.descripcion,
      responsable:      payload.responsable_siguiente || t.responsable,
      fecha_programada: payload.nueva_fecha,
      prioridad:        t.prioridad
    }, t.id_tarea, 'REPROGRAMACION');
  }
  return { ok: true, data: { id_tarea: t.id_tarea, estado: 'NO_EJECUTADA', motivo: motivo },
           siguiente: siguiente };
}

function cancelarTarea(payload) {
  payload = payload || {};
  var t = findOne('tareas', 'id_tarea', payload.id_tarea);
  if (!t) return { ok: false, error: 'Tarea no encontrada.' };
  var motivo = String(payload.motivo || '').trim();
  if (!motivo) return { ok: false, error: 'Indica por qué se cancela.' };
  update('tareas', 'id_tarea', payload.id_tarea, { estado: 'CANCELADA', motivo: motivo });
  return { ok: true, data: { id_tarea: t.id_tarea, estado: 'CANCELADA' } };
}

function iniciarTarea(payload) {
  payload = payload || {};
  var t = findOne('tareas', 'id_tarea', payload.id_tarea);
  if (!t) return { ok: false, error: 'Tarea no encontrada.' };
  update('tareas', 'id_tarea', payload.id_tarea, { estado: 'EN_CURSO' });
  return { ok: true, data: { id_tarea: t.id_tarea, estado: 'EN_CURSO' } };
}

// ── EL TABLERO ────────────────────────────────────────────────────────────
// El calendario responde "que hay en septiembre". Esto responde otra pregunta,
// que es la que se hace de verdad al levantarse: **que me toca**.
//
// Por eso NO se agrupa por estado (por hacer / en curso / hechas), que obliga a
// entender el vocabulario del sistema, sino por CUANDO TOCA — atrasado, hoy,
// esta semana, mas adelante — que son ideas que cualquiera maneja sin que se
// las expliquen.
//
// Va por rango de fechas y no por mes: "los proximos 7 dias" cruza el cambio de
// mes sin que nadie tenga que pasar de pagina. Ese salto de pagina es justo lo
// que hacia que una labor del 2 de octubre no se viera el 28 de septiembre.
function getTablero(filtros) {
  filtros = filtros || {};
  var hoy = _hoyTarea();
  var todas = getAll('tareas');
  var predios = _mapear('predios', 'id_predio');
  var lotes   = _mapear('lotes',   'id_lote');
  var suc     = _indexarSucesoras(todas);

  var finSemana  = _sumarDias(hoy, 7);
  var desdeHecho = _sumarDias(hoy, -7);

  var col = { atrasadas: [], hoy: [], semana: [], adelante: [] };
  var hechas = [];
  var urgentes = 0;

  todas.forEach(function(raw) {
    if (filtros.id_predio && raw.id_predio !== filtros.id_predio) return;
    var t = _enriquecerTarea(raw, suc, predios, lotes, hoy);
    var f = String(t.fecha_programada);

    // Cancelada = decidimos que ya no aplica. No es trabajo pendiente ni
    // historial de ejecucion: no tiene columna en el tablero.
    if (t.estado === 'CANCELADA') return;

    if (t.estado === 'REALIZADA') {
      // Solo lo cerrado hace poco. El tablero es para trabajar, no un archivo:
      // el historial completo vive en el lote y en el calendario.
      if (String(t.fecha_ejecucion || f) >= desdeHecho) hechas.push(t);
      return;
    }

    // Una NO EJECUTADA que ya tiene sucesora esta resuelta: alguien decidio
    // cuando se rehace. La que NO la tiene sigue esperando una decision, y es
    // exactamente la que no puede perderse.
    if (t.estado === 'NO_EJECUTADA') {
      if (!t.reprogramada) col.atrasadas.push(t);
      return;
    }

    if (t.prioridad === 'URGENTE') urgentes++;
    if (f <  hoy)       col.atrasadas.push(t);
    else if (f === hoy) col.hoy.push(t);
    else if (f <= finSemana) col.semana.push(t);
    else col.adelante.push(t);
  });

  // Lo urgente arriba; a igual urgencia, lo mas viejo primero — que es lo que
  // lleva mas tiempo esperando.
  function ordenar(lista) {
    return lista.sort(function(a, b) {
      var pa = a.prioridad === 'URGENTE' ? 0 : 1, pb = b.prioridad === 'URGENTE' ? 0 : 1;
      if (pa !== pb) return pa - pb;
      return String(a.fecha_programada).localeCompare(String(b.fecha_programada));
    });
  }
  ['atrasadas','hoy','semana','adelante'].forEach(function(k) { col[k] = ordenar(col[k]); });
  hechas.sort(function(a, b) {
    return String(b.fecha_ejecucion || b.fecha_programada)
      .localeCompare(String(a.fecha_ejecucion || a.fecha_programada));
  });

  return {
    ok: true,
    hoy: hoy,
    columnas: col,
    hechas: hechas,
    resumen: {
      atrasadas: col.atrasadas.length,
      hoy:       col.hoy.length,
      semana:    col.semana.length,
      adelante:  col.adelante.length,
      hechas:    hechas.length,
      urgentes:  urgentes,
      abiertas:  col.atrasadas.length + col.hoy.length + col.semana.length + col.adelante.length
    },
    opciones: { predios: listPrediosLotes(false).predios, actividades: ACTIVIDADES_TAREA }
  };
}

// ── Una tarea suelta ──────────────────────────────────────────────────────
// El calendario solo trae el mes en pantalla mas las atrasadas. Si se pide una
// tarea que no esta en esa tanda —se movio a otro mes, se acaba de crear en
// otro dispositivo— el frontend se quedaba sin nada que mostrar y abria el
// formulario en blanco, como si fuera una tarea nueva. Con esto siempre hay
// de donde sacarla.
function getTarea(id_tarea) {
  var t = findOne('tareas', 'id_tarea', id_tarea);
  if (!t) return { ok: false, error: 'Esa tarea ya no existe.' };
  var todas = getAll('tareas');
  return {
    ok: true,
    data: _enriquecerTarea(t, _indexarSucesoras(todas),
            _mapear('predios', 'id_predio'), _mapear('lotes', 'id_lote'), _hoyTarea())
  };
}

// ── Borrar una tarea ──────────────────────────────────────────────────────
// Borrar de verdad, no marcar. Es para el duplicado que sale de un doble toque
// en "Programar": una fila que nunca debio existir y que no cuenta una historia.
//
// SOLO se borra lo que todavia no se cerro. Una tarea REALIZADA o NO_EJECUTADA
// es el registro de lo que paso ese dia en ese lote — el historial que este
// modulo existe para conservar — y borrarla dejaria el cumplimiento del mes
// contando sobre datos que ya no estan. Para esas esta "Cancelar", que deja
// constancia del motivo.
//
// Tampoco se borra una tarea de la que ya colgo otra: quedaria una sucesora
// apuntando a un origen inexistente y la cadena de reprogramaciones se rompe.
function eliminarTarea(payload) {
  payload = payload || {};
  var t = findOne('tareas', 'id_tarea', payload.id_tarea);
  if (!t) return { ok: false, error: 'Esa tarea ya no existe.' };

  if (t.estado === 'REALIZADA' || t.estado === 'NO_EJECUTADA') {
    return { ok: false, error: 'Esta tarea ya se cerró: es el registro de lo que pasó ese día y no se borra. ' +
      'Si quedó mal, corrígela o cancélala para que quede el motivo.' };
  }

  var hijas = getAll('tareas').filter(function(x) { return x.id_origen === t.id_tarea; });
  if (hijas.length) {
    return { ok: false, error: 'De esta tarea ya salió otra (' + _fmtDia(hijas[0].fecha_programada) +
      '). Borrarla dejaría esa suelta. Cancélala en vez de borrarla.' };
  }

  deleteRecord('tareas', 'id_tarea', t.id_tarea);
  return { ok: true, data: { id_tarea: t.id_tarea, actividad: t.actividad } };
}

function _fmtDia(iso) {
  return _esFechaISO(iso) ? String(iso).split('-').reverse().join('/') : String(iso || '');
}

// ── Historial de un lote ──────────────────────────────────────────────────
// Responde: qué se le ha hecho, cuándo, si se movió y por qué, quién, qué queda
// pendiente y cuánto hace de cada labor.
function getHistorialLote(id_lote) {
  var lote = findOne('lotes', 'id_lote', id_lote);
  if (!lote) return { ok: false, error: 'Lote no encontrado.' };
  var predio = findOne('predios', 'id_predio', lote.id_predio);
  var hoy = _hoyTarea();

  var todas   = getAll('tareas');
  var predios = _mapear('predios', 'id_predio');
  var lotes   = _mapear('lotes',   'id_lote');
  var suc     = _indexarSucesoras(todas);

  var propias = todas
    .filter(function(t) { return t.id_lote === id_lote; })
    .map(function(t) { return _enriquecerTarea(t, suc, predios, lotes, hoy); })
    .sort(function(a, b) { return String(b.fecha_programada).localeCompare(String(a.fecha_programada)); });

  // Resumen por labor: la última vez que se hizo de verdad y la próxima en pie.
  var porActividad = {};
  propias.forEach(function(t) {
    var a = porActividad[t.actividad] || (porActividad[t.actividad] = {
      actividad: t.actividad, veces: 0, ultimaEjecucion: '', diasDesde: '',
      proximaProgramada: '', pendientes: 0
    });
    if (t.estado === 'REALIZADA') {
      a.veces++;
      if (!a.ultimaEjecucion || t.fecha_ejecucion > a.ultimaEjecucion) a.ultimaEjecucion = t.fecha_ejecucion;
    }
    if (t.estado === 'PROGRAMADA' && String(t.fecha_programada) >= hoy) {
      if (!a.proximaProgramada || t.fecha_programada < a.proximaProgramada) a.proximaProgramada = t.fecha_programada;
    }
    if (t.pendiente || (t.estado === 'NO_EJECUTADA' && !t.reprogramada)) a.pendientes++;
  });
  var resumen = Object.keys(porActividad).map(function(k) {
    var a = porActividad[k];
    if (a.ultimaEjecucion) a.diasDesde = _diasEntre(a.ultimaEjecucion, hoy);
    return a;
  }).sort(function(a, b) { return String(a.actividad).localeCompare(String(b.actividad)); });

  return {
    ok: true, hoy: hoy,
    lote: lote,
    predio: predio || null,
    tareas: propias,
    porActividad: resumen,
    actividades: ACTIVIDADES_TAREA
  };
}
