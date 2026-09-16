// ════════════════════════════════════════════════════════════════════════
//  animal.gs — CRUD de animales
//  PK: codigo (el código original del animal, ej. R3, Y1, AZ01)
// ════════════════════════════════════════════════════════════════════════

// Fecha de hoy en aaaa-mm-dd con el calendario LOCAL de la finca.
// Nunca toISOString(): convierte a UTC y en Colombia, a partir de las 19:00,
// devolveria el dia siguiente.
function _hoyISOServidor() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

// Lista animales con filtros opcionales.
function listAnimales(filtros) {
  filtros = filtros || {};
  return getAll('animales').filter(function(a) {
    if (filtros.predio       && a.predio       !== filtros.predio)       return false;
    if (filtros.lote         && a.lote         !== filtros.lote)         return false;
    if (filtros.tipo         && a.tipo         !== filtros.tipo)         return false;
    if (filtros.propietario  && a.propietario  !== filtros.propietario)  return false;
    if (filtros.estado       && a.estado       !== filtros.estado)       return false;
    // soloActivos: excluye solo VENDIDO y MUERTO — cualquier otro estado (Vacia, Preñada,
    // Cuerpo Luteo, Ovario Liso, etc.) se considera como animal en activo en la finca.
    if (filtros.soloActivos && (a.estado === 'VENDIDO' || a.estado === 'MUERTO')) return false;
    return true;
  });
}

// ── Ritmo promedio de un predio ───────────────────────────────────────────
// Es el respaldo para estimar el peso de hoy de un animal que viene PERDIENDO
// peso: sin esto habria que proyectarle la perdida hacia adelante, que ni
// ayuda a decidir ni es lo que suele pasar.
//
// SOLO PROMEDIA A LOS QUE GANAN. Incluir a los que pierden haria que un predio
// en mal año diera un respaldo tambien negativo, y el respaldo existe
// justamente para no proyectar perdida. Si en el predio no gana nadie, no hay
// respaldo y se dice: es mas honesto que inventar una cifra.
//
// Vive aqui y no en Calculo.gs porque lee hojas; el calculo puro esta alli.
function gdpPromedioPredio(predio) {
  if (!predio) return '';

  // Las mediciones se indexan de una vez: pedirlas animal por animal dentro
  // del bucle multiplicaria las lecturas por el tamaño del predio.
  var porAnimal = {};
  getAll('mediciones').forEach(function(m) {
    (porAnimal[m.codigo] = porAnimal[m.codigo] || []).push(m);
  });

  var suma = 0, n = 0;
  getAll('animales').forEach(function(a) {
    if (a.predio !== predio) return;
    if (a.estado === 'VENDIDO' || a.estado === 'MUERTO') return;

    var meds = (porAnimal[a.codigo] || []).slice().sort(function(x, y) {
      return new Date(x.fecha) - new Date(y.fecha);
    });
    if (!meds.length) return;                   // sin pesar no aporta ritmo

    var ult = meds[meds.length - 1];
    var r = _ritmoAcumulado(a.peso_inicial, a.fecha_ingreso, ult.peso, ult.fecha);
    if (r === null || r <= 0) return;           // los que pierden no entran
    suma += Math.min(r, GDP_PROY_MAX);          // un dato disparatado no arrastra la media
    n++;
  });

  return n ? Math.round((suma / n) * 1000) / 1000 : '';
}

// Devuelve ficha completa de un animal: datos + mediciones + serie + sanidad + ventas.
function getAnimal(codigo) {
  var animal = findOne('animales', 'codigo', codigo);
  if (!animal) return null;

  var mediciones = findMany('mediciones', 'codigo', codigo)
    .sort(function(a, b) { return new Date(a.fecha) - new Date(b.fecha); });

  var serie   = calcularSerieMediciones(mediciones, animal.peso_inicial, animal.fecha_ingreso);
  var resumen = calcularResumenGdp(serie);
  var eventos = findMany('sanidad', 'codigo', codigo)
    .sort(function(a, b) { return new Date(b.fecha) - new Date(a.fecha); });
  var ventas  = findMany('ventas', 'codigo', codigo);

  // Datos de la madre (si la cría nació en la finca)
  var madre = null;
  if (animal.madre_codigo && String(animal.madre_codigo).trim() !== '') {
    var m = findOne('animales', 'codigo', String(animal.madre_codigo).trim());
    if (m) madre = { codigo: m.codigo, tipo: m.tipo, predio: m.predio, estado: m.estado };
  }

  return {
    params:       getParametrosPublicos(),
    animal:       animal,
    mediciones:   mediciones,
    serie:        serie,
    resumen:      resumen,
    // El peso estimado para hoy. Se calcula en el servidor, no en la ficha,
    // para que la tarjeta y la curva de crecimiento usen el MISMO numero.
    pesoHoy:      calcularPesoHoy(animal, serie,
                    gdpPromedioPredio(animal.predio), _hoyISOServidor()),
    // La fecha que se uso para ese calculo. Va en la respuesta para que la
    // ficha rotule "estimado hoy" con el dia de la FINCA: si tomara el del
    // navegador, un dispositivo en otro huso mostraria una fecha distinta de
    // la que produjo el numero.
    hoy:          _hoyISOServidor(),
    sanidad:      eventos,
    ventas:       ventas,
    diasSinMedir: diasSinMedir(mediciones),
    reproductivo: getResumenReproductivo(codigo),  // partos, categoría, crías
    madre:        madre                            // origen genealógico
  };
}

// Guarda o actualiza un animal. payload.codigo es obligatorio y sirve como PK.
// Para actualizaciones parciales (palpación, descarte, etc.) solo se requiere codigo.
function saveAnimal(payload) {
  payload = payload || {};

  if (!payload.codigo || String(payload.codigo).trim() === '') {
    return { ok: false, error: 'El código del animal es obligatorio.' };
  }

  var codigo    = String(payload.codigo).trim();
  var existente = findOne('animales', 'codigo', codigo);

  if (existente) {
    // ── Conversión a nacimiento desde la edición ─────────────────────────
    // Caso real: una res que nació en la finca pero fue registrada como compra
    // (sin vínculo madre-cría, solo como observación). Aquí se le asigna la madre
    // y se establece la relación, reutilizando la lógica de clasificación.
    var convertirACria = String(payload.tipo_ingreso || '').toUpperCase() === 'NACIMIENTO';
    var madreAnterior  = String(existente.madre_codigo || '').trim();
    var eraNacimiento  = String(existente.tipo_ingreso || '').toUpperCase() === 'NACIMIENTO';

    if (convertirACria) {
      var mc = String(payload.madre_codigo || '').trim();
      if (!mc)            return { ok: false, error: 'Debe seleccionar la madre de la cría.' };
      if (mc === codigo)  return { ok: false, error: 'Un animal no puede ser su propia madre.' };
      var madreEx = findOne('animales', 'codigo', mc);
      if (!madreEx)       return { ok: false, error: 'La madre indicada no existe: ' + mc };
      payload.madre_codigo = mc;
      payload.tipo_ingreso = 'NACIMIENTO';
      if (!payload.fecha_nacimiento) payload.fecha_nacimiento = payload.fecha_ingreso || existente.fecha_ingreso;
      // Si se indicó un precio por kilo al nacer, recalcula el valor total.
      var _pkg  = parseFloat(payload.precio_kg);
      var _peso = parseFloat(payload.peso_inicial !== undefined ? payload.peso_inicial : existente.peso_inicial);
      if (!isNaN(_pkg) && _pkg > 0 && !isNaN(_peso) && _peso > 0) {
        payload.precio_compra = Math.round(_peso * _pkg);
      }
    }

    // Actualización parcial: solo fusiona los campos enviados
    var actualizado = update('animales', 'codigo', codigo, payload);
    var dias = calcularDiasFinca(actualizado.fecha_ingreso, null);
    update('animales', 'codigo', codigo, { dias_en_finca: dias });

    // Si se estableció una relación madre-cría NUEVA (o cambió la madre), la madre
    // pasa a Vaca por la fuente única de verdad. OJO: a diferencia de un parto
    // reciente, NO se toca su estado_reproductivo/gestación actual — es una
    // corrección histórica, la madre puede estar preñada de nuevo hoy.
    if (convertirACria && (!eraNacimiento || payload.madre_codigo !== madreAnterior)) {
      var madreObj = findOne('animales', 'codigo', payload.madre_codigo);
      if (madreObj) reclasificarAnimal(madreObj, { partos: contarPartos(payload.madre_codigo) });
    }

    return { ok: true, data: actualizado };
  } else {
    // ── Creación: depende del tipo de ingreso (COMPRA / NACIMIENTO) ──────
    var tipoIngreso = String(payload.tipo_ingreso || 'COMPRA').trim().toUpperCase();
    payload.tipo_ingreso = tipoIngreso;

    if (tipoIngreso === 'NACIMIENTO') {
      if (!payload.fecha_nacimiento) {
        return { ok: false, error: 'La fecha de nacimiento es obligatoria.' };
      }
      if (!payload.madre_codigo || String(payload.madre_codigo).trim() === '') {
        return { ok: false, error: 'Debe seleccionar la madre de la cría.' };
      }
      var sexoCria = String(payload.sexo || '').trim().toUpperCase();
      if (sexoCria !== 'HEMBRA' && sexoCria !== 'MACHO') {
        return { ok: false, error: 'Debe indicar el sexo de la cría.' };
      }
      var madre = findOne('animales', 'codigo', String(payload.madre_codigo).trim());
      if (!madre) {
        return { ok: false, error: 'La madre indicada no existe: ' + payload.madre_codigo };
      }
      payload.madre_codigo = String(payload.madre_codigo).trim();
      payload.sexo = sexoCria;
      // El tipo inicial se deriva del sexo. Para hembras la cadena por peso es de
      // dos etapas (Ternera de levante ≤280 kg → Novilla de vientre), así que la
      // cría hembra arranca como TERNERA LEVANTE. La línea macho arranca en TERNERO.
      if (!payload.tipo) payload.tipo = (sexoCria === 'HEMBRA') ? 'TERNERA LEVANTE' : 'TERNERO';
      // La fecha de ingreso al inventario = fecha de nacimiento
      payload.fecha_ingreso = payload.fecha_nacimiento;
      // Hereda ubicación y propietario de la madre si no se indicó
      if (!payload.predio)      payload.predio      = madre.predio;
      if (!payload.lote)        payload.lote        = madre.lote || madre.predio;
      if (!payload.propietario) payload.propietario = madre.propietario;
      // Peso al nacer es opcional.
      if (payload.peso_inicial === undefined || payload.peso_inicial === null) payload.peso_inicial = '';
      // Precio total estimado = peso al nacer × precio por kilo (mismo criterio que la venta).
      // Solo se calcula si hay ambos datos; si no, queda vacío.
      var _pkgNac  = parseFloat(payload.precio_kg);
      var _pesoNac = parseFloat(payload.peso_inicial);
      payload.precio_compra = (!isNaN(_pkgNac) && _pkgNac > 0 && !isNaN(_pesoNac) && _pesoNac > 0)
        ? Math.round(_pesoNac * _pkgNac)
        : '';
      payload.proveedor     = '';

    } else {
      // COMPRA — flujo actual
      if (!payload.peso_inicial || isNaN(parseFloat(payload.peso_inicial))) {
        return { ok: false, error: 'El peso inicial debe ser un número.' };
      }
      if (!payload.fecha_ingreso) {
        return { ok: false, error: 'La fecha de ingreso es obligatoria.' };
      }
      if (!payload.sexo) payload.sexo = _sexoDeTipo(payload.tipo);
    }

    payload.codigo        = codigo;
    payload.estado        = payload.estado || 'ACTIVO';
    payload.dias_en_finca = calcularDiasFinca(payload.fecha_ingreso, null);
    insert('animales', payload);

    // Clasificación automática por la fuente única de verdad (Clasificacion.gs):
    // p. ej. una compra de hembra con peso inicial > umbral entra como Novilla de
    // vientre sin depender de la categoría elegida a mano. Solo avanza, nunca retrocede.
    reclasificarAnimal(payload, { pesoActual: parseFloat(payload.peso_inicial) || 0 });

    // Nacimiento → actualiza el historial reproductivo de la madre
    // (promueve novilla→vaca y resetea su gestación).
    if (tipoIngreso === 'NACIMIENTO') {
      _promoverMadreTrasParto(payload.madre_codigo);
    }
    return { ok: true, data: payload };
  }
}

// Guarda la meta de crecimiento mensual (kg/mes) de un animal.
// Valor vacío / 0 = el animal usa la meta genérica del sistema.
function setMetaCrecimiento(codigo, meta) {
  codigo = String(codigo || '').trim();
  if (!codigo) return { ok: false, error: 'Código del animal requerido.' };
  var animal = findOne('animales', 'codigo', codigo);
  if (!animal) return { ok: false, error: 'Animal no encontrado: ' + codigo };

  var val = '';
  if (meta !== '' && meta !== null && meta !== undefined) {
    var n = parseFloat(meta);
    if (isNaN(n) || n <= 0) return { ok: false, error: 'La meta debe ser un número mayor que 0.' };
    val = Math.round(n * 100) / 100;  // 2 decimales
  }

  update('animales', 'codigo', codigo, { meta_crec: val });
  return { ok: true, meta_crec: val };
}

// ════════════════════════════════════════════════════════════════════════
//  MORTALIDAD
//  Registrar una muerte NO borra ni altera el historial del animal: solo le
//  añade el desenlace. El registro sigue existiendo con su nacimiento, pesos,
//  madre, tratamientos y controles — eso es lo que da trazabilidad completa y
//  lo que permite después analizar por qué se están muriendo los animales.
// ════════════════════════════════════════════════════════════════════════

// Causas normalizadas. Se guardan tal cual para que agrupar por causa sea
// exacto; el texto libre solo se usa cuando la causa es 'Otra'.
var CAUSAS_MUERTE = [
  'Ahogado al nacer',
  'Enfermedad',
  'Fiebre de garrapata',
  'Accidente',
  'Picadura de serpiente',
  'Otra'
];

// Registra (o corrige) la muerte de un animal existente.
// payload = { codigo, fecha_muerte, causa_muerte, causa_muerte_otra, obs_muerte, foto_muerte_url }
function registrarMuerte(payload) {
  payload = payload || {};
  var codigo = String(payload.codigo || '').trim();
  if (!codigo)               return { ok: false, error: 'El código del animal es obligatorio.' };
  if (!payload.fecha_muerte) return { ok: false, error: 'La fecha de muerte es obligatoria.' };
  if (!payload.causa_muerte) return { ok: false, error: 'Selecciona la causa de muerte.' };

  var animal = findOne('animales', 'codigo', codigo);
  if (!animal) return { ok: false, error: 'Animal no encontrado: ' + codigo };
  if (animal.estado === 'VENDIDO') {
    return { ok: false, error: 'El animal figura como VENDIDO. Corrige primero su estado si la venta fue un error.' };
  }

  // La fecha no puede ser futura ni anterior a que el animal existiera.
  var fMuerte = new Date(payload.fecha_muerte);
  if (isNaN(fMuerte.getTime())) return { ok: false, error: 'La fecha de muerte no es válida.' };
  var hoy = new Date(); hoy.setHours(23, 59, 59, 999);
  if (fMuerte > hoy) return { ok: false, error: 'La fecha de muerte no puede ser futura.' };
  var inicio = animal.fecha_nacimiento || animal.fecha_ingreso;
  if (inicio) {
    var fIni = new Date(inicio);
    if (!isNaN(fIni.getTime()) && fMuerte < fIni) {
      return { ok: false, error: 'La fecha de muerte es anterior a la de ' +
        (animal.fecha_nacimiento ? 'nacimiento' : 'ingreso') + ' (' + inicio + ').' };
    }
  }

  var causa = String(payload.causa_muerte).trim();
  var otra  = (causa === 'Otra') ? String(payload.causa_muerte_otra || '').trim() : '';
  if (causa === 'Otra' && !otra) {
    return { ok: false, error: 'Especifica cuál fue la otra causa.' };
  }

  var cambios = {
    estado:            'MUERTO',
    fecha_muerte:      payload.fecha_muerte,
    causa_muerte:      causa,
    causa_muerte_otra: otra,
    obs_muerte:        String(payload.obs_muerte || '').trim(),
    // Los días en finca se congelan al día de la muerte (dejan de crecer con el trigger).
    dias_en_finca:     calcularDiasFinca(animal.fecha_ingreso, payload.fecha_muerte)
  };
  if (payload.foto_muerte_url) cambios.foto_muerte_url = payload.foto_muerte_url;

  var actualizado = update('animales', 'codigo', codigo, cambios);
  return { ok: true, data: actualizado, edadDias: _edadAlMorir(actualizado) };
}

// Revierte un registro de muerte (por si se registró el animal equivocado).
// Devuelve el animal a ACTIVO y limpia los campos de mortalidad.
function revertirMuerte(codigo) {
  var animal = findOne('animales', 'codigo', codigo);
  if (!animal) return { ok: false, error: 'Animal no encontrado: ' + codigo };
  if (animal.estado !== 'MUERTO') return { ok: false, error: 'El animal no figura como fallecido.' };
  update('animales', 'codigo', codigo, {
    estado: 'ACTIVO', fecha_muerte: '', causa_muerte: '',
    causa_muerte_otra: '', obs_muerte: '', foto_muerte_url: '',
    dias_en_finca: calcularDiasFinca(animal.fecha_ingreso, null)
  });
  return { ok: true };
}

// Días vividos: desde el nacimiento si se conoce; si no, desde el ingreso.
// Devuelve null cuando falta alguna de las dos fechas (registros viejos).
function _edadAlMorir(animal) {
  if (!animal || !animal.fecha_muerte) return null;
  var base = animal.fecha_nacimiento || animal.fecha_ingreso;
  if (!base) return null;
  var d1 = new Date(base), d2 = new Date(animal.fecha_muerte);
  if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return null;
  return Math.max(0, Math.floor((d2 - d1) / 86400000));
}

// Elimina un animal y todos sus registros asociados.
function deleteAnimal(codigo) {
  var animal = findOne('animales', 'codigo', codigo);
  if (!animal) return { ok: false, error: 'Animal no encontrado.' };

  deleteRecord('animales', 'codigo', codigo);

  // Integridad: si era madre, desvincula a las crías (evita FK colgante).
  // El conteo de partos se deriva, así que no queda nada desincronizado.
  getAll('animales').filter(function(a) {
    return String(a.madre_codigo || '').trim() === String(codigo).trim();
  }).forEach(function(h) {
    update('animales', 'codigo', h.codigo, { madre_codigo: '' });
  });

  findMany('mediciones', 'codigo', codigo).forEach(function(m) {
    deleteRecord('mediciones', 'id_medicion', m.id_medicion);
  });
  findMany('sanidad', 'codigo', codigo).forEach(function(e) {
    deleteRecord('sanidad', 'id_evento', e.id_evento);
  });

  return { ok: true };
}

// Normaliza estados inválidos en la hoja animales → ACTIVO.
// Ejecutar una sola vez desde el editor de Apps Script para corregir datos existentes.
function normalizarEstados() {
  var sheet = getSheet('animales');
  var data  = sheet.getDataRange().getValues();
  var cols  = SCHEMAS['animales'];
  var eIdx  = cols.indexOf('estado');
  var VALIDOS = { 'ACTIVO': true, 'VENDIDO': true, 'MUERTO': true };
  var corregidos = 0;
  var ejemplos = [];

  for (var i = 1; i < data.length; i++) {
    var cod = String(data[i][0]).trim();
    if (!cod) continue;
    var est = String(data[i][eIdx]).trim();
    if (!VALIDOS[est]) {
      if (ejemplos.length < 5) ejemplos.push(cod + ': "' + est + '"');
      sheet.getRange(i + 1, eIdx + 1).setValue('ACTIVO');
      corregidos++;
    }
  }
  _invalidarCache('animales');
  SpreadsheetApp.getUi().alert(
    '✅ Estados normalizados: ' + corregidos + ' animales corregidos a ACTIVO.\n\n' +
    'Ejemplos corregidos:\n' + ejemplos.join('\n') +
    (corregidos > 5 ? '\n… y ' + (corregidos - 5) + ' más.' : '')
  );
}

// Cambia el código de un animal actualizando todos los registros relacionados.
// El código anterior queda guardado en el campo codigo_anterior del animal.
function cambiarCodigo(codigoActual, nuevoCodigo) {
  nuevoCodigo = String(nuevoCodigo || '').trim().toUpperCase();
  codigoActual = String(codigoActual || '').trim();
  if (!nuevoCodigo) return { ok: false, error: 'El nuevo código es obligatorio.' };
  if (nuevoCodigo === codigoActual) return { ok: false, error: 'El nuevo código es igual al actual.' };
  if (codigoExiste(nuevoCodigo)) return { ok: false, error: 'El código "' + nuevoCodigo + '" ya está en uso.' };

  var animal = findOne('animales', 'codigo', codigoActual);
  if (!animal) return { ok: false, error: 'Animal no encontrado: ' + codigoActual };

  // Actualizar todas las mediciones
  var meds = findMany('mediciones', 'codigo', codigoActual);
  meds.forEach(function(m) { update('mediciones', 'id_medicion', m.id_medicion, { codigo: nuevoCodigo }); });

  // Actualizar todas las ventas
  var ventas = findMany('ventas', 'codigo', codigoActual);
  ventas.forEach(function(v) { update('ventas', 'id_venta', v.id_venta, { codigo: nuevoCodigo }); });

  // Actualizar todos los eventos sanitarios
  var eventos = findMany('sanidad', 'codigo', codigoActual);
  eventos.forEach(function(e) { update('sanidad', 'id_evento', e.id_evento, { codigo: nuevoCodigo }); });

  // Actualizar la relación madre-cría: las crías que apuntaban al código viejo
  getAll('animales').filter(function(a) {
    return String(a.madre_codigo || '').trim() === codigoActual;
  }).forEach(function(h) { update('animales', 'codigo', h.codigo, { madre_codigo: nuevoCodigo }); });

  // Actualizar el animal (cambiar codigo, guardar codigo_anterior)
  // Hay que borrar el registro viejo e insertar con el nuevo codigo (PK no se puede actualizar en update)
  var _sheetAnimales = getSheet('animales');
  var data = _sheetAnimales.getDataRange().getValues();
  var cols = SCHEMAS['animales'];
  var colIdx = cols.indexOf('codigo');
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][colIdx]).trim() === codigoActual) {
      // Reemplazar codigo en la fila
      data[i][colIdx] = nuevoCodigo;
      _sheetAnimales.getRange(i + 1, 1, 1, data[i].length).setValues([data[i]]);
      break;
    }
  }
  _invalidarCache('animales');
  _invalidarCache('mediciones');
  _invalidarCache('ventas');
  _invalidarCache('sanidad');

  return { ok: true, codigoAnterior: codigoActual, codigoNuevo: nuevoCodigo };
}

// Opciones para dropdowns del formulario.
function getOpcionesAnimal() {
  return {
    predios:      getUniqueValues('animales', 'predio'),
    lotes:        getUniqueValues('animales', 'lote'),
    tipos:        ['TERNERA', 'TERNERA LEVANTE', 'NOVILLA VIENTRE', 'VACA', 'TERNERO', 'TERNERO LEVANTE', 'TORO'],
    estados:      ['ACTIVO', 'VENDIDO', 'MUERTO'],
    causasMuerte: CAUSAS_MUERTE,
    propietarios: getCatalogo('propietario'),
    tiposIngreso: ['COMPRA', 'NACIMIENTO'],
    sexos:        ['HEMBRA', 'MACHO'],
    madres:       getHembrasReproductoras()   // candidatas para el selector de nacimiento
  };
}

// ════════════════════════════════════════════════════════════════════════
//  Fotos de animales — almacenadas en una carpeta de Drive
// ════════════════════════════════════════════════════════════════════════
var FOTOS_FOLDER_NAME = 'GanaX - Fotos de Animales';

// Devuelve (creándola si no existe) la carpeta de Drive donde se guardan las fotos.
function _getCarpetaFotos() {
  var it = DriveApp.getFoldersByName(FOTOS_FOLDER_NAME);
  if (it.hasNext()) return it.next();
  return DriveApp.createFolder(FOTOS_FOLDER_NAME);
}

// Recibe la imagen en base64 desde el frontend, la guarda en Drive (compartida
// con cualquiera que tenga el enlace) y devuelve una URL apta para mostrar en <img>.
// payload = { codigo, mimeType, base64 }
function subirFotoAnimal(payload) {
  try {
    payload = payload || {};
    if (!payload.base64) return { ok: false, error: 'No se recibió ninguna imagen.' };

    var codigo = String(payload.codigo || 'animal').trim().replace(/[^\w\-]/g, '_');
    var mime   = payload.mimeType || 'image/jpeg';
    var ext    = mime.indexOf('png') >= 0 ? 'png' : (mime.indexOf('webp') >= 0 ? 'webp' : 'jpg');
    var bytes  = Utilities.base64Decode(payload.base64);
    var nombre = 'animal_' + codigo + '_' + new Date().getTime() + '.' + ext;
    var blob   = Utilities.newBlob(bytes, mime, nombre);

    var folder = _getCarpetaFotos();
    var file   = folder.createFile(blob);
    try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) {}

    var id  = file.getId();
    // URL directa apta para <img>; sz controla el ancho máximo de render.
    var url = 'https://drive.google.com/thumbnail?id=' + id + '&sz=w1600';

    return { ok: true, url: url, fileId: id };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
