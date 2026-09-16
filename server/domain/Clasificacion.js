// ════════════════════════════════════════════════════════════════════════
//  Clasificacion.gs — SERVICIO CENTRAL DE CLASIFICACIÓN DEL GANADO
//
//  ★ FUENTE ÚNICA DE VERDAD ★
//  Toda la lógica que decide la categoría (tipo) de un animal vive AQUÍ.
//  Ningún otro archivo debe decidir categorías con condiciones sueltas:
//  llaman a clasificarAnimal() / reclasificarAnimal() / reclasificarHato().
//
//  Reglas de negocio (validadas con el cliente):
//    HEMBRAS  ── por PESO y eventos reproductivos (NO por edad) ──
//      • Ternera de levante : peso ≤ umbral (280 kg por defecto)
//      • Novilla de vientre : peso > umbral
//      • Vaca               : al registrar su PRIMER parto (permanente)
//    MACHOS   ── por edad (sin cambios) ──
//      • Ternero            : < edad de levante
//      • Ternero de levante : ≥ edad de levante (12 meses por defecto)
//      • Toro               : se mantiene manual
//
//  Principio: las transiciones son de UNA sola vía (crecimiento / reproducción).
//  Un animal nunca retrocede de categoría aunque pierda peso (ver _rangoCategoria).
// ════════════════════════════════════════════════════════════════════════

// ── Umbral de peso parametrizable ─────────────────────────────────────────
// Se guarda en la hoja catalogos: categoria='config_peso_novilla_kg', valor=280.
// Modificable sin tocar el código con setUmbralNovilla(kg).
function umbralNovillaKg() {
  return getConfigNum('peso_novilla_kg', 280);
}

// Ajusta el umbral de peso (kg) Ternera de levante → Novilla de vientre.
function setUmbralNovilla(kg) {
  kg = parseFloat(kg);
  if (isNaN(kg) || kg <= 0) return { ok: false, error: 'El umbral debe ser un número positivo.' };
  if (findMany('catalogos', 'categoria', 'config_peso_novilla_kg').length) {
    update('catalogos', 'categoria', 'config_peso_novilla_kg', { valor: String(kg) });
  } else {
    insert('catalogos', { categoria: 'config_peso_novilla_kg', valor: String(kg) });
  }
  return { ok: true, msg: 'Umbral Novilla de vientre fijado en ' + kg + ' kg.' };
}

// ── Normalización de `tipo` a la categoría CANÓNICA ───────────────────────
// Unifica las variantes de escritura (plural, "DE", espacios de más, minúsculas)
// en el valor canónico del sistema. Es una corrección de ORTOGRAFÍA, no de
// clasificación: NO mira peso ni partos, así que nunca cambia la categoría real
// de un animal. Refleja la misma lógica que _catKey en el frontend.
//   'NOVILLAS DE VIENTRE' → 'NOVILLA VIENTRE'   'VACAS' → 'VACA'
//   'TERNERAS LEVANTE'    → 'TERNERA LEVANTE'   'TERNEROS LEVANTE' → 'TERNERO LEVANTE'
function tipoCanonico(tipo) {
  var s = String(tipo || '').toUpperCase().replace(/\s+/g, ' ').trim();
  if (!s) return '';
  if (s.indexOf('TORO') >= 0)    return 'TORO';
  if (s.indexOf('VACA') >= 0)    return 'VACA';
  if (s.indexOf('NOVILLA') >= 0) return 'NOVILLA VIENTRE';
  if (s.indexOf('TERNERA') >= 0) return (s.indexOf('LEVANTE') >= 0 ? 'TERNERA LEVANTE' : 'TERNERA');
  if (s.indexOf('TERNERO') >= 0) return (s.indexOf('LEVANTE') >= 0 ? 'TERNERO LEVANTE' : 'TERNERO');
  return s;   // desconocido: se devuelve tal cual, nunca se inventa una categoría
}

// ── Jerarquía de categorías (para impedir retrocesos) ─────────────────────
var _RANGO_CATEGORIA = {
  'TERNERA': 0, 'TERNERA LEVANTE': 1, 'NOVILLA VIENTRE': 2, 'VACA': 3,
  'TERNERO': 0, 'TERNERO LEVANTE': 1, 'TORO': 2
};
// Se normaliza antes de rankear: si no, una variante como 'VACAS' rankeaba -1 y
// el guardarraíl "no retrocede" no la protegía — reclasificarHato() podía
// degradarla a NOVILLA VIENTRE por peso. Con el canónico, 'VACAS' rankea 3.
function _rangoCategoria(tipo) {
  var r = _RANGO_CATEGORIA[tipoCanonico(tipo)];
  return (r === undefined) ? -1 : r;
}

// ── Peso actual de un animal (kg) ─────────────────────────────────────────
// Usa la última medición; si no hay, cae al peso_inicial.
// mapaPeso opcional (codigo → última medición) evita lecturas repetidas en lote.
function _ultimoPesoAnimal(animal, mapaPeso) {
  if (mapaPeso) {
    var m = mapaPeso[animal.codigo];
    return m ? (parseFloat(m.peso) || 0) : (parseFloat(animal.peso_inicial) || 0);
  }
  var meds = findMany('mediciones', 'codigo', animal.codigo);
  if (!meds.length) return parseFloat(animal.peso_inicial) || 0;
  meds.sort(function(a, b) { return new Date(b.fecha) - new Date(a.fecha); });
  return parseFloat(meds[0].peso) || parseFloat(animal.peso_inicial) || 0;
}

// Mapa codigo → última medición — una sola pasada para reclasificar todo el hato.
function _mapaUltimaMedicion() {
  var map = {};
  getAll('mediciones').forEach(function(m) {
    var c = m.codigo;
    if (!map[c] || new Date(m.fecha) > new Date(map[c].fecha)) map[c] = m;
  });
  return map;
}

// Mapa codigo de madre → nº de partos (fechas de nacimiento distintas entre crías).
// Evita recalcular partos animal por animal en la reclasificación masiva.
function _mapaPartos() {
  var fechasPorMadre = {};
  getAll('animales').forEach(function(a) {
    var mc = String(a.madre_codigo || '').trim();
    if (!mc) return;
    if (!fechasPorMadre[mc]) fechasPorMadre[mc] = {};
    fechasPorMadre[mc][a.fecha_nacimiento || a.fecha_ingreso || a.codigo] = 1;
  });
  var count = {};
  Object.keys(fechasPorMadre).forEach(function(mc) {
    count[mc] = Object.keys(fechasPorMadre[mc]).length;
  });
  return count;
}

// ════════════════════════════════════════════════════════════════════════
//  clasificarAnimal — decide la categoría CANÓNICA de un animal.
//  ctx opcional para rendimiento: { pesoActual, partos, mapaPeso }.
//  No escribe nada; solo decide. Para persistir, usar reclasificarAnimal().
// ════════════════════════════════════════════════════════════════════════
function clasificarAnimal(animal, ctx) {
  ctx = ctx || {};
  if (!animal) return '';
  var sexo = animal.sexo || _sexoDeTipo(animal.tipo);
  return (sexo === 'MACHO')
    ? _clasificarMacho(animal, ctx)
    : _clasificarHembra(animal, ctx);
}

// HEMBRAS — por peso y partos (NO por edad).
function _clasificarHembra(animal, ctx) {
  var partos = (ctx.partos !== undefined) ? ctx.partos : contarPartos(animal.codigo);
  if (partos >= 1) return 'VACA';                    // primer parto ⇒ vaca (permanente)
  var peso = (ctx.pesoActual !== undefined) ? ctx.pesoActual : _ultimoPesoAnimal(animal, ctx.mapaPeso);
  if (peso > umbralNovillaKg()) return 'NOVILLA VIENTRE';
  return 'TERNERA LEVANTE';
}

// MACHOS — por edad. Toro se mantiene manual.
function _clasificarMacho(animal, ctx) {
  if (String(animal.tipo || '').toUpperCase().indexOf('TORO') >= 0) return 'TORO';
  var edadLevante = getConfigNum('edad_ternero_a_levante_meses', 12);
  var base = animal.fecha_nacimiento || animal.fecha_ingreso;
  var meses = base ? _mesesDesde(base) : 0;
  return (meses >= edadLevante) ? 'TERNERO LEVANTE' : 'TERNERO';
}

// ════════════════════════════════════════════════════════════════════════
//  reclasificarAnimal — calcula y PERSISTE la categoría si el animal avanzó.
//  Nunca retrocede (transición de una sola vía). Devuelve el nuevo tipo o null.
// ════════════════════════════════════════════════════════════════════════
function reclasificarAnimal(animal, ctx) {
  if (!animal || animal.estado === 'VENDIDO' || animal.estado === 'MUERTO') return null;
  var nuevo = clasificarAnimal(animal, ctx);
  if (!nuevo || nuevo === animal.tipo) return null;
  if (_rangoCategoria(nuevo) <= _rangoCategoria(animal.tipo)) return null;  // no retrocede
  update('animales', 'codigo', animal.codigo, { tipo: nuevo });
  return nuevo;
}

// ════════════════════════════════════════════════════════════════════════
//  reclasificarHato — recorre todos los animales y actualiza categorías.
//  • Pensado para el trigger diario y para una pasada de corrección inicial
//    (sincroniza los datos viejos con las nuevas reglas — p. ej. arregla R06).
//  Devuelve { ok, total, cambios:[ 'COD: ANTES → DESPUES', … ] }.
// ════════════════════════════════════════════════════════════════════════
function reclasificarHato() {
  var mapaPeso   = _mapaUltimaMedicion();
  var mapaPartos = _mapaPartos();
  var cambios = [];
  getAll('animales').forEach(function(a) {
    var anterior = a.tipo;
    var nuevo = reclasificarAnimal(a, { mapaPeso: mapaPeso, partos: mapaPartos[a.codigo] || 0 });
    if (nuevo) cambios.push(a.codigo + ': ' + (anterior || '(vacío)') + ' → ' + nuevo);
  });
  return { ok: true, total: cambios.length, cambios: cambios };
}

// ── Etiquetas legibles para la interfaz ───────────────────────────────────
var _NOMBRE_CATEGORIA = {
  'TERNERA': 'Ternera',
  'TERNERA LEVANTE': 'Ternera de levante',
  'NOVILLA VIENTRE': 'Novilla de vientre',
  'VACA': 'Vaca',
  'TERNERO': 'Ternero',
  'TERNERO LEVANTE': 'Ternero de levante',
  'TORO': 'Toro'
};
function nombreCategoria(tipo) {
  return _NOMBRE_CATEGORIA[tipoCanonico(tipo)] || tipo || '';
}

// Ordinal de parto capitalizado para la etiqueta "Vaca — Primer parto".
function _ordinalPartoCap(n) {
  var s = ordinalParto(n);
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : (n + '.º');
}
