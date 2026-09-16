// ════════════════════════════════════════════════════════════════════════
//  mediciones.gs — CRUD de mediciones de peso
//
//  El cálculo del GDP vive SOLO en Calculo.gs (calcularSerieMediciones).
//  Aquí se valida la entrada, se persiste y se mantiene la hoja coherente:
//  cualquier inserción/borrado retroactivo recalcula en cascada las filas
//  posteriores del animal (_recalcularSerieAnimal).
// ════════════════════════════════════════════════════════════════════════

// Guarda una nueva medición y calcula GDP automáticamente.
function saveMedicion(payload) {
  payload = payload || {};
  if (!payload.codigo) return { ok: false, error: 'El código del animal es obligatorio.' };
  if (!payload.fecha)  return { ok: false, error: 'La fecha es obligatoria.' };
  if (!payload.peso || isNaN(parseFloat(payload.peso))) {
    return { ok: false, error: 'El peso debe ser un número.' };
  }

  var animal = findOne('animales', 'codigo', payload.codigo);
  if (!animal) return { ok: false, error: 'Animal no encontrado: ' + payload.codigo };

  var fechaNueva = _parseFecha(payload.fecha);
  if (!fechaNueva) return { ok: false, error: 'Fecha inválida: "' + payload.fecha + '". Usa formato AAAA-MM-DD.' };

  var hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  if (fechaNueva.getTime() > hoy.getTime()) {
    return { ok: false, error: 'La fecha no puede ser futura.' };
  }

  var previas = findMany('mediciones', 'codigo', payload.codigo);

  // No se permiten dos mediciones del mismo animal el mismo día:
  // el intervalo sería 0 días y el GDP indefinido.
  var duplicada = previas.some(function(m) {
    var f = _parseFecha(m.fecha);
    return f && f.getTime() === fechaNueva.getTime();
  });
  if (duplicada) {
    return { ok: false, error: 'Ya existe una medición de ' + payload.codigo + ' el ' + payload.fecha + '. Edítala o elimínala desde la ficha del animal.' };
  }

  var nueva = {
    id_medicion:         generarId('MED'),
    codigo:              payload.codigo,
    fecha:               payload.fecha,
    peso:                parseFloat(payload.peso),
    ganancia_peso:       '',
    dias_desde_anterior: '',
    gdp:                 '',
    clasificacion:       '',
    observacion:         payload.observacion || '',
    alerta:              ''
  };
  insert('mediciones', nueva);

  // Recalcula TODA la cadena del animal (incluye la fila recién insertada y
  // corrige las posteriores si la fecha fue retroactiva).
  var cascada = _recalcularSerieAnimal(payload.codigo);

  // Fila fresca con sus valores calculados definitivos
  var guardada = findOne('mediciones', 'id_medicion', nueva.id_medicion) || nueva;

  // Reclasificación automática por peso (fuente única de verdad, Clasificacion.gs):
  // se usa el peso vigente (el más reciente por fecha), no necesariamente el recién cargado.
  var pesoVigente = parseFloat(payload.peso);
  var fechaVigente = fechaNueva;
  previas.forEach(function(m) {
    var f = _parseFecha(m.fecha);
    if (f && f.getTime() > fechaVigente.getTime()) {
      fechaVigente = f;
      pesoVigente = parseFloat(m.peso);
    }
  });
  var reclasificado = reclasificarAnimal(animal, { pesoActual: pesoVigente });

  return {
    ok: true,
    data: guardada,
    advertencias: _advertenciasDe(guardada),
    cascada: { actualizadas: cascada.actualizadas },
    reclasificado: reclasificado
  };
}

// Mensajes humanos según la alerta que quedó en la fila guardada.
function _advertenciasDe(fila) {
  var msgs = [];
  if (!fila || !fila.alerta) return msgs;
  var gdpTxt = fila.gdp !== '' ? fila.gdp : '?';
  switch (fila.alerta) {
    case 'SIN_BASELINE':
      msgs.push('Este animal no tiene peso y/o fecha de ingreso válidos. La medición quedó registrada como punto de partida, pero sin GDP.');
      break;
    case 'FECHA_INVALIDA':
      msgs.push('La fecha coincide con o es anterior a otra medición. La fila quedó marcada FECHA_INVALIDA y no entra al cálculo del GDP.');
      break;
    case 'GDP_ALTO':
      msgs.push('GDP de ' + gdpTxt + ' kg/día supera el umbral de ' + gdpSospechosoKg() + ' kg/día. Verifica el peso o la fecha.');
      break;
    case 'GDP_IMPOSIBLE':
      msgs.push('GDP de ' + gdpTxt + ' kg/día es físicamente imposible (> ' + gdpImposibleKg() + '). La medición quedó marcada GDP_IMPOSIBLE y NO entra a promedios ni clasificaciones.');
      break;
  }
  return msgs;
}

// ── Recalcula en cascada todas las mediciones de UN animal ────────────────
// Reusa calcularSerieMediciones (misma matemática que ve el usuario en la
// ficha) y escribe de vuelta solo las filas cuyo valor cambió.
function _recalcularSerieAnimal(codigo) {
  var animal = findOne('animales', 'codigo', codigo);
  var meds = findMany('mediciones', 'codigo', codigo);
  if (!animal || meds.length === 0) return { total: 0, actualizadas: 0, alertas: [] };

  var sorted = meds.slice().sort(function(a, b) {
    var fa = _parseFecha(a.fecha), fb = _parseFecha(b.fecha);
    if (!fa && !fb) return 0;
    if (!fa) return 1;
    if (!fb) return -1;
    return fa.getTime() - fb.getTime();
  });

  var serie = calcularSerieMediciones(sorted, animal.peso_inicial, animal.fecha_ingreso);

  var actualizadas = 0, alertas = [];
  for (var i = 0; i < sorted.length; i++) {
    var fila = sorted[i], s = serie[i];
    var nuevo = {
      ganancia_peso:       s.ganancia,
      dias_desde_anterior: s.diasDesdeAnterior,
      gdp:                 s.gdpPer,
      clasificacion:       s.clasificacion,
      alerta:              s.alerta
    };
    if (_filaDifiere(fila, nuevo)) {
      update('mediciones', 'id_medicion', fila.id_medicion, nuevo);
      actualizadas++;
    }
    if (s.alerta === 'GDP_IMPOSIBLE' || s.alerta === 'GDP_ALTO') {
      alertas.push({ id_medicion: fila.id_medicion, codigo: codigo, fecha: s.fecha, gdp: s.gdpPer, alerta: s.alerta });
    }
  }
  return { total: sorted.length, actualizadas: actualizadas, alertas: alertas };
}

// Comparación tolerante entre lo almacenado y lo recalculado.
function _filaDifiere(fila, nuevo) {
  function norm(v) { return (v === undefined || v === null) ? '' : v; }
  function numEq(a, b) {
    var na = parseFloat(a), nb = parseFloat(b);
    if (isNaN(na) && isNaN(nb)) return norm(a).toString().trim() === norm(b).toString().trim();
    if (isNaN(na) || isNaN(nb)) return false;
    return Math.abs(na - nb) < 0.0005;
  }
  return !numEq(fila.ganancia_peso, nuevo.ganancia_peso) ||
         !numEq(fila.dias_desde_anterior, nuevo.dias_desde_anterior) ||
         !numEq(fila.gdp, nuevo.gdp) ||
         String(norm(fila.clasificacion)) !== String(norm(nuevo.clasificacion)) ||
         String(norm(fila.alerta)) !== String(norm(nuevo.alerta));
}

// ── Corregir una medición ya guardada ────────────────────────────────────
// Un peso se anota mal, o se teclea el día equivocado, y hasta ahora la unica
// salida era borrar la fila y volver a crearla — que ademas perdia el orden
// original y obligaba a acordarse de los datos.
//
// Valida EXACTAMENTE lo mismo que saveMedicion. Tiene que ser asi: si la
// creacion rechaza una fecha futura y la edicion no, basta con guardar bien y
// corregir despues para meter en la hoja lo que la creacion no dejaba entrar.
//
// La unica diferencia esta en el duplicado: al comprobar si ya hay otra
// medicion de ese dia hay que EXCLUIR LA PROPIA FILA, o guardar sin cambiar la
// fecha se rechazaria a si misma.
function editarMedicion(payload) {
  payload = payload || {};
  var fila = findOne('mediciones', 'id_medicion', payload.id_medicion);
  if (!fila) return { ok: false, error: 'Esa medición ya no existe.' };

  var animal = findOne('animales', 'codigo', fila.codigo);
  if (!animal) return { ok: false, error: 'Animal no encontrado: ' + fila.codigo };

  // Lo que no se toca: el animal al que pertenece. Mover una medicion de un
  // animal a otro descuadraria las dos cadenas de GDP a la vez, y no es una
  // correccion sino otra cosa — para eso se borra y se crea donde toca.
  var peso = parseFloat(String(payload.peso == null ? '' : payload.peso).replace(',', '.'));
  if (isNaN(peso) || peso <= 0) return { ok: false, error: 'El peso debe ser un número mayor que cero.' };

  if (!payload.fecha) return { ok: false, error: 'La fecha es obligatoria.' };
  var fechaNueva = _parseFecha(payload.fecha);
  if (!fechaNueva) return { ok: false, error: 'Fecha inválida: "' + payload.fecha + '". Usa formato AAAA-MM-DD.' };

  var hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  if (fechaNueva.getTime() > hoy.getTime()) return { ok: false, error: 'La fecha no puede ser futura.' };

  var choca = findMany('mediciones', 'codigo', fila.codigo).some(function(m) {
    if (m.id_medicion === fila.id_medicion) return false;   // la propia no cuenta
    var f = _parseFecha(m.fecha);
    return f && f.getTime() === fechaNueva.getTime();
  });
  if (choca) {
    return { ok: false, error: 'Ya hay otra medición de ' + fila.codigo + ' el ' + payload.fecha +
      '. Dos pesajes del mismo día dejarían el GDP sin definir.' };
  }

  update('mediciones', 'id_medicion', fila.id_medicion, {
    fecha:       payload.fecha,
    peso:        peso,
    observacion: payload.observacion !== undefined
                   ? String(payload.observacion || '').trim() : fila.observacion
  });

  // Toda la cadena del animal, no solo esta fila: cambiar un peso mueve la
  // ganancia y el GDP de la medicion siguiente, y cambiar la fecha puede
  // ademas reordenar la serie entera.
  var cascada = _recalcularSerieAnimal(fila.codigo);
  var guardada = findOne('mediciones', 'id_medicion', fila.id_medicion) || fila;

  // El peso que manda para la categoria es el MAS RECIENTE por fecha, que
  // despues de editar puede ser otro distinto del que se acaba de tocar.
  var pesoVigente = null, fechaVigente = null;
  findMany('mediciones', 'codigo', fila.codigo).forEach(function(m) {
    var f = _parseFecha(m.fecha);
    if (f && (!fechaVigente || f.getTime() > fechaVigente.getTime())) {
      fechaVigente = f; pesoVigente = parseFloat(m.peso);
    }
  });
  var reclasificado = pesoVigente ? reclasificarAnimal(animal, { pesoActual: pesoVigente }) : null;

  return {
    ok: true,
    data: guardada,
    advertencias: _advertenciasDe(guardada),
    cascada: { actualizadas: cascada.actualizadas },
    reclasificado: reclasificado
  };
}

// Elimina una medición por id_medicion y recalcula la cadena del animal.
function deleteMedicion(idMedicion) {
  var fila = findOne('mediciones', 'id_medicion', idMedicion);
  var okBorrado = deleteRecord('mediciones', 'id_medicion', idMedicion);
  if (!okBorrado) return { ok: false, error: 'Medición no encontrada: ' + idMedicion };
  var cascada = fila ? _recalcularSerieAnimal(fila.codigo) : { actualizadas: 0 };
  return { ok: true, cascada: { actualizadas: cascada.actualizadas } };
}

// Todas las mediciones de un animal ordenadas por fecha.
function getMedicionesAnimal(codigo) {
  return findMany('mediciones', 'codigo', codigo)
    .sort(function(a, b) {
      var fa = _parseFecha(a.fecha), fb = _parseFecha(b.fecha);
      if (!fa && !fb) return 0;
      if (!fa) return 1;
      if (!fb) return -1;
      return fa.getTime() - fb.getTime();
    });
}

// ════════════════════════════════════════════════════════════════════════
//  recalcularGdpTodo() — CORRECCIÓN EN LOTE (solo editor de Apps Script)
//
//  Recalcula ganancia_peso / dias_desde_anterior / gdp / clasificacion /
//  alerta de TODAS las filas de la hoja mediciones con las reglas nuevas.
//  Las filas imposibles quedan marcadas (columna alerta) para revisión
//  manual — NUNCA se borran datos.
//
//  Ejecutar UNA VEZ tras desplegar esta versión (ver DEPLOY.md paso 6.6).
// ════════════════════════════════════════════════════════════════════════
function recalcularGdpTodo() {
  var mapaAnim = {};
  getAll('animales').forEach(function(a) { mapaAnim[a.codigo] = a; });

  var porCodigo = {};
  getAll('mediciones').forEach(function(m) {
    (porCodigo[m.codigo] = porCodigo[m.codigo] || []).push(m);
  });

  var res = { animales: 0, filas: 0, actualizadas: 0, huerfanas: 0, sospechosas: [] };

  Object.keys(porCodigo).forEach(function(codigo) {
    var meds = porCodigo[codigo];

    // Mediciones huérfanas: el animal ya no existe (o cambió de código).
    if (!mapaAnim[codigo]) {
      res.huerfanas += meds.length;
      meds.forEach(function(m) {
        if (String(m.alerta || '') !== 'HUERFANA') {
          try { update('mediciones', 'id_medicion', m.id_medicion, { alerta: 'HUERFANA' }); } catch (e) {}
        }
      });
      return;
    }

    var r = _recalcularSerieAnimal(codigo);
    res.animales++;
    res.filas += r.total;
    res.actualizadas += r.actualizadas;
    r.alertas.forEach(function(a) {
      if (res.sospechosas.length < 50) res.sospechosas.push(a);   // muestra máx 50 en el reporte
    });
  });

  var msg = '✅ Recálculo terminado.\n\n' +
    '• Animales procesados: ' + res.animales + '\n' +
    '• Mediciones revisadas: ' + res.filas + '\n' +
    '• Filas corregidas: ' + res.actualizadas + '\n' +
    (res.huerfanas ? '• ⚠ Huérfanas (sin animal): ' + res.huerfanas + '\n' : '') +
    '• Sospechosas (GDP > ' + gdpSospechosoKg() + ' kg/día): ' + res.sospechosas.length;

  if (res.sospechosas.length) {
    msg += '\n\nPrimeras sospechosas:\n';
    res.sospechosas.slice(0, 15).forEach(function(s) {
      msg += '  ' + s.codigo + ' · ' + s.fecha + ' · ' + s.gdp + ' kg/d [' + s.alerta + ']\n';
    });
    if (res.sospechosas.length > 15) msg += '  …y ' + (res.sospechosas.length - 15) + ' más.';
  }
  msg += '\n\nLas filas marcadas NO entraron a promedios ni clasificaciones.\nRevísalas en la hoja mediciones, columna alerta.';

  try {
    SpreadsheetApp.getUi().alert(msg);
  } catch (e) {
    Logger.log(msg);   // ejecución headless (trigger/test)
  }
  return res;
}
