// ════════════════════════════════════════════════════════════════════════
//  repro.gs — Genealogía, historial reproductivo y ciclo de vida del hato
//
//  Principio de diseño: la relación madre-cría se guarda UNA sola vez, en la
//  cría (animales.madre_codigo). El número de partos y la categoría NO se
//  almacenan: se DERIVAN contando las crías → fuente única de verdad, nunca
//  se desincroniza. Pensado para futuros árboles genealógicos e indicadores
//  por línea materna.
// ════════════════════════════════════════════════════════════════════════

// Deduce el sexo a partir del tipo (para registros viejos sin columna sexo).
function _sexoDeTipo(tipo) {
  var t = String(tipo || '').toUpperCase();
  if (t.indexOf('TERNERO') >= 0 || t.indexOf('TORO') >= 0) return 'MACHO';
  if (t.indexOf('TERNERA') >= 0 || t.indexOf('NOVILLA') >= 0 || t.indexOf('VACA') >= 0) return 'HEMBRA';
  return '';
}

// ── Configuración parametrizable ─────────────────────────────────────────
// Lee un número de la hoja catalogos (categoria = 'config_<clave>', valor = n).
// Permite ajustar reglas de negocio sin tocar el código.
function getConfigNum(clave, porDefecto) {
  var vals = getCatalogo('config_' + clave);
  if (vals.length && vals[0] !== '' && !isNaN(parseFloat(vals[0]))) return parseFloat(vals[0]);
  return porDefecto;
}

// Meses enteros transcurridos entre una fecha ISO y hoy (o 'hasta').
function _mesesDesde(fechaIso, hasta) {
  var d = new Date(fechaIso);
  if (isNaN(d)) return 0;
  hasta = hasta || new Date();
  var meses = (hasta.getFullYear() - d.getFullYear()) * 12 + (hasta.getMonth() - d.getMonth());
  if (hasta.getDate() < d.getDate()) meses--;
  return Math.max(0, meses);
}

// Ordinal en español para la etiqueta de parto.
function ordinalParto(n) {
  var nombres = ['primer', 'segundo', 'tercer', 'cuarto', 'quinto', 'sexto',
                 'séptimo', 'octavo', 'noveno', 'décimo'];
  return nombres[n - 1] || (n + '.º');
}

// ── Genealogía ───────────────────────────────────────────────────────────
// Todas las crías registradas de una madre, ordenadas por fecha de nacimiento.
function getCriasDeMadre(codigo) {
  codigo = String(codigo || '').trim();
  if (!codigo) return [];
  return getAll('animales').filter(function(a) {
    return String(a.madre_codigo || '').trim() === codigo;
  }).sort(function(a, b) {
    return new Date(a.fecha_nacimiento || a.fecha_ingreso) - new Date(b.fecha_nacimiento || b.fecha_ingreso);
  });
}

// Número de partos = fechas de nacimiento distintas entre las crías
// (mellizos del mismo día cuentan como un solo parto).
function contarPartos(codigo) {
  var fechas = {};
  getCriasDeMadre(codigo).forEach(function(c) {
    fechas[c.fecha_nacimiento || c.fecha_ingreso || c.codigo] = 1;
  });
  return Object.keys(fechas).length;
}

// Etiqueta de categoría reproductiva del animal (para mostrar en la interfaz).
// La categoría CANÓNICA la decide Clasificacion.gs; aquí solo se le da formato:
//   • con partos  → "Vaca — Primer parto", "Vaca — Segundo parto", …
//   • sin partos  → nombre legible de su categoría actual (Ternera de levante / Novilla de vientre)
function categoriaReproductiva(animal, partos) {
  if (!animal) return '';
  var sexo = animal.sexo || _sexoDeTipo(animal.tipo);
  if (sexo === 'MACHO') return nombreCategoria(animal.tipo);
  if (partos === undefined) partos = contarPartos(animal.codigo);
  if (partos >= 1) return 'Vaca — ' + _ordinalPartoCap(partos) + ' parto';
  return nombreCategoria(animal.tipo);
}

// Resumen reproductivo completo de una hembra (para la ficha).
function getResumenReproductivo(codigo) {
  var animal = findOne('animales', 'codigo', codigo);
  if (!animal) return null;
  var sexo   = animal.sexo || _sexoDeTipo(animal.tipo);
  var crias  = getCriasDeMadre(codigo);
  var partos = contarPartos(codigo);
  return {
    sexo:          sexo,
    esReproductora: sexo === 'HEMBRA',
    numeroPartos:  partos,
    categoria:     categoriaReproductiva(animal, partos),
    crias: crias.map(function(c) {
      return {
        codigo:           c.codigo,
        sexo:             c.sexo || _sexoDeTipo(c.tipo),
        tipo:             c.tipo,
        fecha_nacimiento: c.fecha_nacimiento || c.fecha_ingreso,
        estado:           c.estado,
        predio:           c.predio
      };
    })
  };
}

// Hembras candidatas a ser madre (para el selector del formulario de nacimiento).
// Es madre cualquier hembra activa cuya categoría CANÓNICA sea Novilla de vientre
// o Vaca — se consulta al servicio central (Clasificacion.gs), NO el texto guardado
// en `tipo`. Así una novilla de vientre por peso (>280 kg) aparece aunque su `tipo`
// almacenado esté desactualizado (era el caso de R06).
function getHembrasReproductoras() {
  var mapaPeso = _mapaUltimaMedicion();
  return getAll('animales').filter(function(a) {
    if (a.estado === 'VENDIDO' || a.estado === 'MUERTO') return false;
    if ((a.sexo || _sexoDeTipo(a.tipo)) !== 'HEMBRA') return false;
    var cat = clasificarAnimal(a, { mapaPeso: mapaPeso });
    return cat === 'NOVILLA VIENTRE' || cat === 'VACA';
  }).map(function(a) {
    return { codigo: a.codigo, tipo: a.tipo, predio: a.predio, propietario: a.propietario };
  }).sort(function(a, b) { return String(a.codigo).localeCompare(String(b.codigo)); });
}

// ── Análisis de nacimientos ───────────────────────────────────────────────
// Devuelve la lista de animales nacidos en la finca (tipo_ingreso = NACIMIENTO),
// enriquecida para que el frontend filtre y grafique de forma dinámica en cliente.
// Incluye totalReproductoras (hembras aptas hoy) para estimar la tasa de natalidad.
function getNacimientos() {
  var animales = getAll('animales');
  // Índice de madres para resolver el predio/propietario de la madre de cada cría.
  var porCodigo = {};
  animales.forEach(function(a) { porCodigo[String(a.codigo).trim()] = a; });

  var lista = animales.filter(function(a) {
    return String(a.tipo_ingreso || '').toUpperCase() === 'NACIMIENTO';
  }).map(function(a) {
    var f      = a.fecha_nacimiento || a.fecha_ingreso || '';
    var fStr   = String(f);
    var madre  = a.madre_codigo ? porCodigo[String(a.madre_codigo).trim()] : null;
    return {
      codigo:        a.codigo,
      predio:        a.predio || '',
      propietario:   a.propietario || '',
      sexo:          a.sexo || _sexoDeTipo(a.tipo),
      tipo:          a.tipo || '',
      estado:        a.estado || '',
      fecha:         fStr,
      anio:          fStr.length >= 4  ? fStr.substring(0, 4) : '',
      mes:           fStr.length >= 7  ? fStr.substring(0, 7) : '',   // yyyy-MM
      madre_codigo:  a.madre_codigo || '',
      madre_predio:  madre ? (madre.predio || '') : ''
    };
  });

  return {
    lista:              lista,
    totalReproductoras: getHembrasReproductoras().length,
    generado:           Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm')
  };
}

// ── Intervalo entre partos · vacas que llevan mucho sin parir ──────────────
// Umbral configurable en meses (catalogos: 'config_meses_sin_parir_alerta').
// Por defecto 13 meses: pasado ese tiempo sin una nueva cría, la vaca ya no
// está siendo productiva y debería evaluarse para venta.
function umbralMesesSinParir() {
  return getConfigNum('meses_sin_parir_alerta', 13);
}
function setUmbralMesesSinParir(n) {
  n = parseInt(n, 10);
  if (isNaN(n) || n <= 0) return { ok: false, error: 'Debe ser un número de meses positivo.' };
  var cat = 'config_meses_sin_parir_alerta';
  if (findMany('catalogos', 'categoria', cat).length) update('catalogos', 'categoria', cat, { valor: String(n) });
  else insert('catalogos', { categoria: cat, valor: String(n) });
  return { ok: true, msg: 'Umbral fijado en ' + n + ' meses sin parir.' };
}

// Nº de partos = fechas de nacimiento distintas (mellizos del mismo día = 1 parto).
function _partosDistintos(fechas) {
  var s = {}; fechas.forEach(function(f){ s[f] = 1; }); return Object.keys(s).length;
}

// ── Proyección de gestación ────────────────────────────────────────────────
// Duración de referencia (meses) para considerar que una preñez ya llegó a término.
// Configurable en catalogos: 'config_gestacion_meses'. Por defecto 9 (bovino ≈283 d).
function umbralGestacionMeses() {
  return getConfigNum('gestacion_meses', 9);
}

// Mapa codigo → fecha de la palpación "Preñada" más reciente.
// El campo animales.meses guarda la FOTO de esa palpación; con esta fecha se proyecta.
function _mapaUltimaPalpacionPrenada() {
  var map = {};
  getAll('sanidad').forEach(function(e) {
    if (String(e.tipo) !== 'PALPACIÓN VETERINARIA') return;
    if (String(e.estado_reproductivo || '') !== 'Preñada') return;
    var c = String(e.codigo).trim();
    if (!map[c] || new Date(e.fecha) > new Date(map[c])) map[c] = e.fecha;
  });
  return map;
}

// Proyecta la gestación de un animal a HOY. El campo `meses` es estático (la foto
// del último reporte); aquí se le suman los meses transcurridos desde la palpación.
// Devuelve estado: 'NO_PRENADA' | 'PRENADA_OK' | 'GESTACION_VENCIDA'.
function proyectarGestacion(animal, fechaPalpacion, hoy) {
  hoy = hoy || new Date();
  if (String(animal.estado_reproductivo || '') !== 'Preñada') {
    return { prenada: false, estado: 'NO_PRENADA' };
  }
  var gestRep = parseInt(animal.meses, 10);
  if (isNaN(gestRep)) {
    // Preñada pero sin meses reportados: no se puede proyectar (no se alerta venta).
    return { prenada: true, estado: 'PRENADA_OK', gestReportada: '', gestProyectada: '', fechaPalpacion: fechaPalpacion || '' };
  }
  var transcurridos = fechaPalpacion ? _mesesDesde(fechaPalpacion, hoy) : 0;
  var gestProy = gestRep + transcurridos;
  return {
    prenada:        true,
    estado:         (gestProy >= umbralGestacionMeses()) ? 'GESTACION_VENCIDA' : 'PRENADA_OK',
    gestReportada:  gestRep,
    gestProyectada: gestProy,
    fechaPalpacion: fechaPalpacion || ''
  };
}

// Devuelve las hembras ACTIVAS que pertenecen al grupo 🐄 Vacas (reproductoras).
// Una hembra entra al grupo si cumple CUALQUIERA de estas condiciones:
//   (1) ya tuvo al menos una cría (historial de partos),
//   (2) está PREÑADA hoy (estado_reproductivo = 'Preñada'), aunque nunca haya parido,
//   (3) fue mandada al grupo a mano (en_vacas = 'SI').
// Para las que tienen partos se calcula el intervalo entre partos y la alerta de
// venta; las que entran solo por preñez o por marcación manual aparecen como
// reproductoras pero NUNCA como candidatas a venta.
// Pensado para: (1) la alerta del dashboard y (2) la sección "Vacas" de Para Venta.
function getVacasIntervalo() {
  var umbral = umbralMesesSinParir();
  var hoy = new Date();
  var mapaPalp = _mapaUltimaPalpacionPrenada();
  // Fechas de nacimiento de las crías agrupadas por madre (una sola pasada).
  var criasPorMadre = {};
  getAll('animales').forEach(function(a) {
    var mc = String(a.madre_codigo || '').trim();
    if (!mc) return;
    var f = a.fecha_nacimiento || a.fecha_ingreso;
    if (!f) return;
    (criasPorMadre[mc] = criasPorMadre[mc] || []).push(String(f).substring(0, 10));
  });
  var res = [];
  getAll('animales').forEach(function(a) {
    if (a.estado === 'VENDIDO' || a.estado === 'MUERTO') return;
    if ((a.sexo || _sexoDeTipo(a.tipo)) !== 'HEMBRA') return;   // el grupo Vacas es solo hembras

    var fechas      = criasPorMadre[String(a.codigo).trim()];
    var tienePartos = !!(fechas && fechas.length);
    var prenada     = String(a.estado_reproductivo || '') === 'Preñada';
    var manual      = String(a.en_vacas || '').toUpperCase() === 'SI';

    // No pertenece al grupo si no tuvo crías, no está preñada y no se marcó a mano.
    if (!tienePartos && !prenada && !manual) return;

    var ultima = '', meses = '', partos = 0;
    if (tienePartos) {
      fechas.sort();                             // ISO yyyy-MM-dd ordena cronológicamente
      ultima = fechas[fechas.length - 1];
      meses  = _mesesDesde(ultima, hoy);
      partos = _partosDistintos(fechas);
    }
    // Estado reproductivo proyectado a hoy (preñada / vencida / vacía).
    var g = proyectarGestacion(a, mapaPalp[String(a.codigo).trim()], hoy);

    res.push({
      codigo:          a.codigo,
      predio:          a.predio || '',
      propietario:     a.propietario || '',
      tipo:            a.tipo || '',
      partos:          partos,
      ultimaCria:      ultima,
      mesesSinParir:   meses,
      estadoGestacion: g.estado,                                              // NO_PRENADA | PRENADA_OK | GESTACION_VENCIDA
      gestReportada:   (g.gestReportada  === undefined ? '' : g.gestReportada),
      gestProyectada:  (g.gestProyectada === undefined ? '' : g.gestProyectada),
      fechaPalpacion:  g.fechaPalpacion || '',
      // Candidata a venta SOLO si tuvo crías, NO está preñada y su intervalo supera el umbral.
      alerta:          (tienePartos && g.estado === 'NO_PRENADA' && meses >= umbral),
      // Preñez que ya pasó el término sin nacimiento registrado → revisar.
      revisarGestacion:(g.estado === 'GESTACION_VENCIDA'),
      tienePartos:     tienePartos,
      prenada:         prenada,
      enVacasManual:   manual,
      // Está en el grupo SOLO por marcación manual (sin partos ni preñez) → se puede devolver a venta.
      soloManual:      (manual && !tienePartos && !prenada),
      umbral:          umbral
    });
  });
  // Peor intervalo primero; las que no tienen historial de partos quedan al final.
  res.sort(function(x, y) {
    var mx = (x.mesesSinParir === '' ? -1 : x.mesesSinParir);
    var my = (y.mesesSinParir === '' ? -1 : y.mesesSinParir);
    return my - mx;
  });
  return res;
}

// Manda una hembra al grupo 🐄 Vacas (o la devuelve) a mano. Marca/limpia en_vacas.
// valor truthy → la mueve al grupo; falsy → la quita. Solo aplica a hembras.
function marcarEnVacas(codigo, valor) {
  var animal = findOne('animales', 'codigo', codigo);
  if (!animal) return { ok: false, error: 'Animal no encontrado: ' + codigo };
  if ((animal.sexo || _sexoDeTipo(animal.tipo)) !== 'HEMBRA') {
    return { ok: false, error: 'Solo las hembras pueden ir al grupo de vacas.' };
  }
  var nuevo = valor ? 'SI' : '';
  update('animales', 'codigo', codigo, { en_vacas: nuevo });
  return { ok: true, en_vacas: nuevo };
}

// Diagnóstico: ejecutar desde el editor y revisar el Registro de ejecución.
// Dice cuántas madres ve el sistema y QUÉ valores exactos tiene la columna tipo.
function verMadres() {
  var cand = getHembrasReproductoras();
  var tipos = {};
  getAll('animales').forEach(function(a) {
    var t = (a.tipo === '' || a.tipo == null) ? '(vacío)' : a.tipo;
    tipos[t] = (tipos[t] || 0) + 1;
  });
  Logger.log('Candidatas a madre: ' + cand.length);
  cand.forEach(function(m) { Logger.log('  • ' + m.codigo + ' — ' + m.tipo + ' — ' + (m.predio || '')); });
  Logger.log('Valores de "tipo" presentes en la hoja: ' + JSON.stringify(tipos));
  return { candidatas: cand.length, tipos: tipos };
}

// ── Transiciones de categoría (ciclo de vida) ────────────────────────────
// Al registrar un parto: la madre pasa a VACA (lo decide el servicio central a
// partir del nº de partos, que ya incluye la cría recién insertada) y se resetea
// su gestación. El cambio se refleja de inmediato en todo el sistema porque
// update() invalida la caché y los listados se vuelven a leer.
function _promoverMadreTrasParto(madreCodigo) {
  var madre = findOne('animales', 'codigo', madreCodigo);
  if (!madre) return;
  var cambios = { estado_reproductivo: 'No preñada', meses: '' };  // resetea gestación
  if (!madre.sexo) cambios.sexo = 'HEMBRA';
  // La cría ya está insertada ⇒ contarPartos ≥ 1 ⇒ categoría VACA (fuente única de verdad).
  var nuevaCat = clasificarAnimal(madre, { partos: contarPartos(madreCodigo) });
  if (nuevaCat && nuevaCat !== madre.tipo) cambios.tipo = nuevaCat;
  update('animales', 'codigo', madreCodigo, cambios);
}

// Compatibilidad: cualquier trigger antiguo apuntando a esta función sigue
// funcionando, pero ahora delega en el servicio central (Clasificacion.gs),
// que reclasifica HEMBRAS por peso/partos y MACHOS por edad en una sola pasada.
function revisarCategoriasPorEdad() {
  return reclasificarHato();
}

// ── Trigger diario ────────────────────────────────────────────────────────
// Ejecutar UNA SOLA VEZ desde el editor para instalar la reclasificación
// automática diaria del hato (hembras por peso/partos, machos por edad).
function instalarTriggerPromocionDiaria() {
  // Evita duplicados (incluye nombres antiguos por si quedó algún trigger viejo)
  ScriptApp.getProjectTriggers().forEach(function(t) {
    var fn = t.getHandlerFunction();
    if (fn === 'reclasificarHato' || fn === 'revisarCategoriasPorEdad' || fn === 'promoverTernerasANovillas') {
      ScriptApp.deleteTrigger(t);
    }
  });
  ScriptApp.newTrigger('reclasificarHato')
    .timeBased().everyDays(1).atHour(3).create();
  return { ok: true, msg: 'Trigger diario instalado (~3:00 AM). Reclasifica el hato según peso, partos y edad.' };
}

// Ajusta los umbrales de edad (en meses) de las transiciones por edad.
// Guarda los valores en la hoja catalogos. Ej: setEdadesTransicion(12, 15).
function setEdadesTransicion(mesesTerneraLevante, mesesLevanteNovilla) {
  function _set(clave, val) {
    val = parseInt(val, 10);
    if (isNaN(val) || val <= 0) return;
    var cat = 'config_' + clave;
    if (findMany('catalogos', 'categoria', cat).length) {
      update('catalogos', 'categoria', cat, { valor: String(val) });
    } else {
      insert('catalogos', { categoria: cat, valor: String(val) });
    }
  }
  _set('edad_ternera_a_levante_meses', mesesTerneraLevante);
  _set('edad_levante_a_novilla_meses', mesesLevanteNovilla);
  return { ok: true, msg: 'Edades fijadas — ternera→levante: ' + mesesTerneraLevante + ' m, levante→novilla: ' + mesesLevanteNovilla + ' m.' };
}
