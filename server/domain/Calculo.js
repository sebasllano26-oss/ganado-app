// ════════════════════════════════════════════════════════════════════════
//  Calculo.gs — Lógica de negocio y cálculos ganaderos
//  Funciones PURAS (no tocan hojas) + umbrales configurables en catalogos.
//
//  Reglas del GDP (ganancia diaria de peso, kg/día):
//    • Un bovino de ceba crece típicamente entre 0.3 y 1.0 kg/día.
//    • config_gdp_meta_kg_dia        (0.3) — meta mínima esperada
//    • config_gdp_sospechoso_kg_dia  (1.0) — por encima se marca GDP_ALTO
//    • config_gdp_imposible_kg_dia   (5.0) — físicamente imposible
//
//  Toda fecha pasa por _parseFecha() y todo intervalo por calcularDiasEntre().
//  PROHIBIDO el viejo Math.max(1, dias): si el intervalo no es válido el GDP
//  queda vacío con su alerta — jamás se divide entre "1 día" inventado.
// ════════════════════════════════════════════════════════════════════════

// ── Umbrales de GDP parametrizables (hoja catalogos) ──────────────────────
// EL OBJETIVO DE LA FINCA: cuánto debe ganar un animal por día. Es el único
// número del que dependen la escala de clasificación Y el peso esperado.
// Cambiarlo aquí (o con setUmbralGdpObjetivo) mueve todo el sistema a la vez.
// ── EL NUMERO DE UNA FACTURA ──────────────────────────────────────────────
// Pura y probada a proposito: es la misma clase de error que hizo perder el
// peso 294,5 en la fase 12, pero con dinero y sin nadie mirando.
//
// Una factura colombiana escribe "$ 1.234.567", el punto es separador de miles
// y la coma el decimal. Pero Gemini devuelve lo que VE, y hay proveedores que
// imprimen al estilo gringo ("1,234,567.89"). Las dos formas tienen que caer
// en el mismo numero.
//
// La regla: cuando aparecen los dos signos, el ULTIMO es el decimal. Cuando
// aparece uno solo seguido de EXACTAMENTE tres digitos, es separador de miles
// — "1.234" en una factura son mil doscientos treinta y cuatro pesos, no uno
// con doscientos treinta y cuatro.
function _aNumeroFactura(v) {
  // Gemini puede devolverlo ya como numero: entonces no hay nada que adivinar.
  if (typeof v === 'number') return isFinite(v) ? v : NaN;

  var t = String(v == null ? '' : v).replace(/[^0-9.,\-]/g, '').trim();
  if (t === '' || t === '-') return NaN;

  var negativo = t.charAt(0) === '-';
  t = t.split('-').join('');

  var hayPunto = t.indexOf('.') >= 0;
  var hayComa  = t.indexOf(',') >= 0;

  if (hayPunto && hayComa) {
    var decimal = t.lastIndexOf('.') > t.lastIndexOf(',') ? '.' : ',';
    var miles   = decimal === '.' ? ',' : '.';
    t = t.split(miles).join('');
    t = t.split(decimal).join('.');
  } else if (hayPunto || hayComa) {
    var sep    = hayPunto ? '.' : ',';
    var partes = t.split(sep);
    if (partes.length > 2) {
      t = partes.join('');                       // varios iguales = todos miles
    } else {
      t = (partes[1].length === 3) ? partes.join('') : partes.join('.');
    }
  }

  if (!/^[0-9]+(\.[0-9]+)?$/.test(t)) return NaN;
  var n = parseFloat(t);
  return negativo ? -n : n;
}

function gdpObjetivoKg()    { return getConfigNum('gdp_objetivo_kg_dia', 0.40); }

// Piso conservador para suponer crecimiento cuando NO hay datos (planeación).
// Lee la clave histórica 'gdp_meta_kg_dia'; el alias solo hace honesto el nombre.
function gdpMinimoKg()      { return getConfigNum('gdp_meta_kg_dia', 0.3); }
function gdpMetaKg()        { return gdpMinimoKg(); }   // compat: no usar en código nuevo
function gdpSospechosoKg()  { return getConfigNum('gdp_sospechoso_kg_dia', 1.0); }
function gdpImposibleKg()   { return getConfigNum('gdp_imposible_kg_dia', 5.0); }

function setUmbralGdpObjetivo(kg)   { return _setConfigGdp('gdp_objetivo_kg_dia', kg); }
function setUmbralGdpMeta(kg)       { return _setConfigGdp('gdp_meta_kg_dia', kg); }
function setUmbralGdpSospechoso(kg) { return _setConfigGdp('gdp_sospechoso_kg_dia', kg); }
function setUmbralGdpImposible(kg)  { return _setConfigGdp('gdp_imposible_kg_dia', kg); }

function _setConfigGdp(clave, kg) {
  kg = parseFloat(kg);
  if (isNaN(kg)) return { ok: false, error: 'El umbral debe ser un número.' };
  if (findMany('catalogos', 'categoria', 'config_' + clave).length) {
    update('catalogos', 'categoria', 'config_' + clave, { valor: String(kg) });
  } else {
    insert('catalogos', { categoria: 'config_' + clave, valor: String(kg) });
  }
  return { ok: true, msg: 'Umbral ' + clave + ' fijado en ' + kg + ' kg/día.' };
}

// Ritmo acotado para PROYECCIONES a futuro (la ficha ya lo usaba así).
var GDP_PROY_MIN = -0.5;   // un bovino no pierde más de esto de forma sostenida
var GDP_PROY_MAX = 1.5;    // ni gana más de esto de forma sostenida

// ── Parseo robusto de fechas ──────────────────────────────────────────────
// Acepta: Date | 'yyyy-MM-dd' | 'dd/MM/yyyy' | serial Excel. Devuelve Date en
// hora local a medianoche, o null si no se puede interpretar. Nunca lanza.
function _parseFecha(v) {
  if (v === '' || v === null || v === undefined) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : new Date(v.getFullYear(), v.getMonth(), v.getDate());
  var s = String(v).trim();
  if (!s) return null;

  // Serial de Excel (~1954..2064)
  if (/^\d+(\.\d+)?$/.test(s)) {
    var n = parseFloat(s);
    if (n > 20000 && n < 60000) return new Date(Math.round((n - 25569) * 86400000));
    return null;
  }
  // dd/mm/yyyy o dd-mm-yyyy (formato colombiano; mm/dd solo si es inequívoco)
  var m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) {
    var d = parseInt(m[1], 10), mo = parseInt(m[2], 10), y = parseInt(m[3], 10);
    if (mo > 12 && d <= 12) return new Date(y, d - 1, mo);   // venía en mm/dd
    return new Date(y, mo - 1, d);
  }
  // ISO yyyy-MM-dd (con o sin hora) — constructor local evita corrimientos UTC
  m = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (m) return new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));

  var dt = new Date(s);
  return isNaN(dt.getTime()) ? null : new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
}

// Días ENTEROS entre dos fechas (hasta − desde). Puede ser negativo o 0:
// el llamador decide si eso es válido. Devuelve null si alguna fecha falla.
function calcularDiasEntre(fechaDesde, fechaHasta) {
  var a = _parseFecha(fechaDesde), b = _parseFecha(fechaHasta);
  if (!a || !b) return null;
  return Math.floor((b.getTime() - a.getTime()) / 86400000);
}

// ── Días en finca ─────────────────────────────────────────────────────────
function calcularDiasFinca(fechaIngreso, fechaSalida) {
  var dias = calcularDiasEntre(fechaIngreso, fechaSalida || Date.now());
  return (dias === null || dias < 0) ? '' : dias;
}

// ── Clasificación de GDP — SIEMPRE relativa al objetivo ───────────────────
// Cada etiqueta dice su relación con el objetivo; ninguna palabra por encima
// de la línea suena a fracaso ni ninguna por debajo suena a que está bien.
// Hay más resolución debajo de la línea a propósito: ahí es donde hay que
// actuar, y saber "cuánto le falta" cambia la decisión. Arriba basta con
// saber que cumple.
//
//   SUPERA   >= objetivo x 1.20   un 20% arriba: diferencia real, no ruido
//   CUMPLE   >= objetivo          la línea
//   CASI     >= objetivo x 0.85   le falta menos del 15%, se recupera
//   BAJO     >= objetivo x 0.60   a más de un tercio del objetivo
//   CRITICO   < objetivo x 0.60
var GDP_MULT_SUPERA = 1.20;
var GDP_MULT_CASI   = 0.85;
var GDP_MULT_BAJO   = 0.60;

function clasificarRendimiento(gdp) {
  if (gdp === '' || gdp === null || isNaN(gdp)) return '';
  gdp = parseFloat(gdp);
  var obj = gdpObjetivoKg();
  return gdp >= obj * GDP_MULT_SUPERA ? 'SUPERA'
       : gdp >= obj                   ? 'CUMPLE'
       : gdp >= obj * GDP_MULT_CASI   ? 'CASI'
       : gdp >= obj * GDP_MULT_BAJO   ? 'BAJO'
       : 'CRITICO';
}

// ── Parámetros que el frontend DEBE consumir en vez de inventar ───────────
// El frontend no decide umbrales: los recibe. Se adjuntan a las respuestas que
// ya existen (getDashboardFull, getAnimal) para no añadir una llamada extra,
// que en Apps Script significaría otro arranque en frío.
function getParametrosPublicos() {
  var obj = gdpObjetivoKg();
  return {
    gdpObjetivo: obj,
    gdpMinimo:   gdpMinimoKg(),
    escala: {
      SUPERA: Math.round(obj * GDP_MULT_SUPERA * 1000) / 1000,
      CUMPLE: Math.round(obj * 1000) / 1000,
      CASI:   Math.round(obj * GDP_MULT_CASI   * 1000) / 1000,
      BAJO:   Math.round(obj * GDP_MULT_BAJO   * 1000) / 1000
    },
    // Peso esperado y clasificación salen del MISMO objetivo: es imposible que
    // la ficha diga "por debajo de lo esperado" mientras el semáforo dice que cumple.
    crecMensualEsperado: Math.round(obj * 30.44 * 100) / 100,
    pesoTechoProyeccion: getConfigNum('peso_techo_proyeccion_kg', 650),
    pesoObjetivoVenta:   getConfigNum('peso_objetivo_venta_kg', 405)
  };
}

// ── Color semáforo por clasificación ──────────────────────────────────────
function colorClasificacion(clasif) {
  var mapa = {
    'SUPERA':    'green',
    'CUMPLE':    'blue',
    'CASI':      'yellow',
    'BAJO':      'orange',
    'CRITICO':   'red',
    // Etiquetas anteriores: sirven mientras la hoja aún tenga valores viejos.
    'EXCELENTE': 'green',
    'BUENO':     'green',
    'NORMAL':    'blue',
    '':          'gray'
  };
  return mapa[clasif] || 'gray';
}

// ── Alerta de una fila de medición según su GDP ───────────────────────────
// Devuelve '' | 'GDP_ALTO' | 'GDP_IMPOSIBLE'
function _alertaDeGdp(gdp) {
  if (gdp === '' || gdp === null || isNaN(gdp)) return '';
  var abs = Math.abs(parseFloat(gdp));
  if (abs > gdpImposibleKg())  return 'GDP_IMPOSIBLE';
  if (parseFloat(gdp) > gdpSospechosoKg()) return 'GDP_ALTO';
  return '';
}

// Clasificación visible de una fila: los imposibles NO se clasifican
// (no pueden pintar al animal como EXCELENTE cuando son un error de dato).
function _clasifDeFila(gdp, alerta) {
  if (alerta === 'GDP_IMPOSIBLE') return '';
  return clasificarRendimiento(gdp);
}

// ── Serie completa de indicadores de mediciones para la ficha ─────────────
// Recibe [{fecha, peso, observacion, …}] + {peso_inicial, fecha_ingreso}.
//
// Devuelve por medición: {numMed, fecha, peso, observacion, diasDesde,
//   diasDesdeAnterior, ganancia, gdpPer, gdpAcum, proy30, clasificacion,
//   color, alerta}
//
// alerta ∈ '' | 'DATO_INVALIDO' | 'SIN_BASELINE' | 'FECHA_INVALIDA' |
//          'GDP_ALTO' | 'GDP_IMPOSIBLE'
//
// Reglas:
//   • El baseline (peso_inicial + fecha_ingreso) solo se usa si AMBOS son válidos.
//   • Intervalo ≤ 0 días (misma fecha, fechas desordenadas) → sin GDP, FECHA_INVALIDA.
//   • Una fila con FECHA_INVALIDA o DATO_INVALIDO NO se usa como referencia
//     de la siguiente (evita contaminar la cadena de cálculo).
//   • Filas GDP_ALTO/GDP_IMPOSIBLE sí avanzan la referencia (el peso es real).
function calcularSerieMediciones(mediciones, pesoInicial, fechaIngreso) {
  var serie = [];
  var umbSosch = gdpSospechosoKg();
  var umbImpo  = gdpImposibleKg();

  var pIni = parseFloat(pesoInicial);
  var fIni = _parseFecha(fechaIngreso);
  var tieneBaseline = (!isNaN(pIni) && pIni > 0 && !!fIni);

  var sorted = (mediciones || []).slice().sort(function(a, b) {
    var fa = _parseFecha(a.fecha), fb = _parseFecha(b.fecha);
    if (!fa && !fb) return 0;
    if (!fa) return 1;
    if (!fb) return -1;
    return fa.getTime() - fb.getTime();
  });

  // Referencia para la fila siguiente: última medición VÁLIDA procesada.
  var pesoRef  = tieneBaseline ? pIni : null;
  var fechaRef = tieneBaseline ? fIni : null;

  sorted.forEach(function(med, idx) {
    var pesoM  = parseFloat(med.peso);
    var fechaM = _parseFecha(med.fecha);

    // Fila corrupta: se muestra marcada pero no participa en cálculos.
    if (isNaN(pesoM) || pesoM <= 0 || !fechaM) {
      serie.push({
        numMed: idx + 1, fecha: med.fecha || '', peso: (isNaN(pesoM) ? '' : pesoM),
        observacion: med.observacion || '', diasDesde: '', diasDesdeAnterior: '',
        ganancia: '', gdpPer: '', gdpAcum: '', proy30: '',
        clasificacion: '', color: 'gray', alerta: 'DATO_INVALIDO'
      });
      return;
    }

    var alerta = '';
    var item = {
      numMed: idx + 1,
      fecha: med.fecha,
      peso: pesoM,
      observacion: med.observacion || '',
      diasDesde: '', diasDesdeAnterior: '', ganancia: '',
      gdpPer: '', gdpAcum: '', proy30: '',
      clasificacion: '', color: 'gray', alerta: ''
    };

    // Días reales desde el ingreso (para gdpAcum)
    var dIng = tieneBaseline ? Math.floor((fechaM.getTime() - fIni.getTime()) / 86400000) : null;

    // Intervalo vs referencia previa
    var dAnt = fechaRef ? Math.floor((fechaM.getTime() - fechaRef.getTime()) / 86400000) : null;

    if (pesoRef !== null) {
      item.ganancia = Math.round((pesoM - pesoRef) * 100) / 100;
    } else {
      alerta = 'SIN_BASELINE';   // primera medición sin peso/fecha de ingreso válidos
    }

    if (dAnt !== null && dAnt <= 0) {
      alerta = 'FECHA_INVALIDA'; // misma fecha que la anterior o desordenada
      item.diasDesdeAnterior = '';
    } else if (dAnt !== null) {
      item.diasDesdeAnterior = dAnt;
    }

    // GDP del período — SOLO con intervalo válido
    if (item.ganancia !== '' && dAnt !== null && dAnt > 0) {
      var gdpPer = Math.round((item.ganancia / dAnt) * 1000) / 1000;
      item.gdpPer = gdpPer;
      var alGdp = _alertaDeGdp(gdpPer);
      if (alGdp) alerta = alGdp;
      item.clasificacion = _clasifDeFila(gdpPer, alGdp);
      item.color = colorClasificacion(item.clasificacion);
      if (alGdp !== 'GDP_IMPOSIBLE') {
        var ritmo = Math.max(GDP_PROY_MIN, Math.min(GDP_PROY_MAX, gdpPer));
        item.proy30 = Math.round((pesoM + ritmo * 30) * 10) / 10;
      }
    }

    // GDP acumulado desde el ingreso — SOLO con baseline y días reales positivos
    if (tieneBaseline && dIng !== null && dIng > 0) {
      item.diasDesde = dIng;
      item.gdpAcum = Math.round(((pesoM - pIni) / dIng) * 1000) / 1000;
    }

    item.alerta = alerta;
    serie.push(item);

    // La referencia avanza solo con filas utilizables como punto de partida.
    // Las GDP_IMPOSIBLE presumen un PESO erróneo: no contaminan la cadena.
    // Las GDP_ALTO sí avanzan (crecimiento alto pero creíble).
    if (alerta === 'FECHA_INVALIDA' || alerta === 'DATO_INVALIDO' || alerta === 'GDP_IMPOSIBLE') {
      // la referencia se mantiene en el último punto confiable
    } else {
      pesoRef  = pesoM;
      fechaRef = fechaM;
    }
  });

  return serie;
}

// ── Resumen GDP de una serie ──────────────────────────────────────────────
// Solo usa filas con GDP válido (excluye GDP_IMPOSIBLE). Las proyecciones
// usan el último GDP válido acotado a un rango biológico realista.
function calcularResumenGdp(serie) {
  if (!serie || serie.length === 0) return null;

  var gdps = [], nAlertas = 0, nSospechosos = 0;
  serie.forEach(function(s) {
    if (s.alerta === 'GDP_IMPOSIBLE' || s.alerta === 'GDP_ALTO') nAlertas++;
    if (s.alerta === 'GDP_IMPOSIBLE') nSospechosos++;
    if (s.gdpPer !== '' && s.alerta !== 'GDP_IMPOSIBLE') gdps.push(s.gdpPer);
  });

  var ultValido = null;
  for (var i = serie.length - 1; i >= 0; i--) {
    if (serie[i].gdpPer !== '' && serie[i].alerta !== 'GDP_IMPOSIBLE') { ultValido = serie[i]; break; }
  }
  var ultItem = serie[serie.length - 1];

  var gdpProm = gdps.length ? gdps.reduce(function(a, b) { return a + b; }, 0) / gdps.length : 0;
  var gdpMax  = gdps.length ? Math.max.apply(null, gdps) : 0;
  var ultimoPeso = typeof ultItem.peso === 'number' ? ultItem.peso : '';
  var ultimoGdp  = ultValido ? ultValido.gdpPer : '';

  var proyBase = (ultimoGdp !== '') ? Math.max(GDP_PROY_MIN, Math.min(GDP_PROY_MAX, ultimoGdp)) : null;
  function _proy(dias) {
    if (ultimoPeso === '' || proyBase === null) return '';
    return Math.round((ultimoPeso + proyBase * dias) * 10) / 10;
  }

  return {
    gdpPromedio:  gdps.length ? Math.round(gdpProm * 1000) / 1000 : '',
    gdpMaximo:    gdps.length ? Math.round(gdpMax * 1000) / 1000 : '',
    gdpUltimo:    ultimoGdp,
    ultimoPeso:   ultimoPeso,
    proy30:       _proy(30),
    proy60:       _proy(60),
    proy90:       _proy(90),
    totalMediciones: serie.length,
    medicionesValidas: gdps.length + 1,   // períodos con GDP válido (+1 = tramo inicial vs baseline)
    clasificacionActual: (ultimoGdp !== '') ? clasificarRendimiento(ultimoGdp) : '',
    colorActual:         colorClasificacion((ultimoGdp !== '') ? clasificarRendimiento(ultimoGdp) : ''),
    alertas:      nAlertas,
    sospechosos:  nSospechosos
  };
}

// ══════════════════════════════════════════════════════════════════════════
//  EL PESO DE HOY
//
//  Antes la ficha comparaba el peso actual contra un "peso esperado" sacado de
//  una meta en kg/mes. Es el caso ideal, y en la finca pasan cosas: sequia, un
//  lote sin pasto, una enfermedad. Un numero contra el que nada se cumple deja
//  de mirarse.
//
//  Y habia un problema mas silencioso: el peso actual NO DECIA DE CUANDO ERA.
//  Se lee como el peso de hoy, pero puede ser de hace tres meses.
//
//  Esto lo reemplaza por una estimacion honesta: cuanto pesaria el animal hoy
//  al ritmo que el mismo ha llevado. Es UNA SOLA FUENTE DE VERDAD — la tarjeta
//  y la curva de crecimiento consumen esta misma funcion, o la ficha se
//  contradiria a si misma.
// ══════════════════════════════════════════════════════════════════════════

// Ritmo real del animal: lo que ha ganado por dia entre que entro y su ultimo
// pesaje.
//
// OJO CON EL DENOMINADOR: son los dias hasta la FECHA DEL PESAJE, no hasta hoy.
// Usar los dias en finca (que llegan hasta hoy) repartiria la ganancia real
// entre dias que todavia no se han pesado, y el animal pareceria mas lento de
// lo que es. El error crece justo cuando mas tiempo lleva sin pesarse, que es
// cuando mas importa acertar.
function _ritmoAcumulado(pesoIni, fechaIng, pesoUlt, fechaUlt) {
  var pi = parseFloat(pesoIni), pu = parseFloat(pesoUlt);
  if (isNaN(pi) || isNaN(pu) || pi <= 0) return null;
  var dias = calcularDiasEntre(fechaIng, fechaUlt);
  if (dias === '' || dias === null || !(dias > 0)) return null;
  return (pu - pi) / dias;
}

// Cuantos dias sin pesar hacen que la estimacion deje de ser de fiar.
// Es el MISMO 45 del KPI "Sin bascula +45d" del tablero, y con el mismo
// criterio (>=, no >): si aqui fuera ">", un animal que ya figura en esa lista
// tendria su estimacion dada por buena, y las dos pantallas se contradirian.
var DIAS_ESTIMACION_DUDOSA = 45;

// animal   : fila de la hoja animales (peso_inicial, fecha_ingreso, estado)
// serie    : salida de calcularSerieMediciones (puede venir vacia)
// gdpPredio: promedio del predio, o '' si no hay — lo calcula animal.gs
// hoyISO   : fecha de hoy en aaaa-mm-dd (se pasa para poder probarlo)
function calcularPesoHoy(animal, serie, gdpPredio, hoyISO) {
  if (!animal) return null;

  // Un animal muerto o vendido ya no "deberia pesar" nada hoy. Proyectarle un
  // peso no significa nada y en una ficha de muerte resulta chocante.
  if (animal.estado === 'MUERTO' || animal.estado === 'VENDIDO') return null;

  var pesoIni = parseFloat(animal.peso_inicial);
  if (isNaN(pesoIni) || pesoIni <= 0) return null;   // sin punto de partida no hay nada que medir

  // El ultimo dato REAL: la ultima medicion, o el ingreso si nunca se ha pesado.
  var ult = (serie && serie.length) ? serie[serie.length - 1] : null;
  var pesoMedido  = (ult && typeof ult.peso === 'number') ? ult.peso : pesoIni;
  var fechaMedido = (ult && ult.fecha) ? ult.fecha : animal.fecha_ingreso;

  var dias = calcularDiasEntre(fechaMedido, hoyISO);
  if (dias === '' || dias === null || isNaN(dias)) dias = 0;
  if (dias < 0) dias = 0;   // una medicion con fecha futura no proyecta hacia atras

  // ── El ritmo, en orden ────────────────────────────────────────────────
  var propio = ult ? _ritmoAcumulado(pesoIni, animal.fecha_ingreso, pesoMedido, fechaMedido) : null;
  var ritmo, origen;

  if (propio !== null && propio > 0) {
    // Mismo tope que ya usan las proyecciones a 30/60/90 dias: no se inventa
    // otro umbral que despues habria que mantener en dos sitios.
    ritmo = Math.min(propio, GDP_PROY_MAX);
    origen = 'PROPIO';
  } else {
    var pred = parseFloat(gdpPredio);
    if (!isNaN(pred) && pred > 0) {
      ritmo = Math.min(pred, GDP_PROY_MAX);
      origen = 'PREDIO';
    } else {
      // Ni ritmo propio ni respaldo del predio: no se inventa una ganancia.
      ritmo = 0;
      origen = 'NINGUNO';
    }
  }

  var pesoHoy = Math.round((pesoMedido + ritmo * dias) * 10) / 10;

  return {
    pesoMedido:        Math.round(pesoMedido * 10) / 10,
    fechaMedido:       fechaMedido,
    diasDesdeMedicion: dias,
    ritmo:             Math.round(ritmo * 1000) / 1000,
    ritmoOrigen:       origen,
    pesoHoy:           pesoHoy,
    ganancia:          Math.round((pesoHoy - pesoMedido) * 10) / 10,
    confiable:         dias < DIAS_ESTIMACION_DUDOSA,
    // Solo por si hace falta explicarlo en pantalla.
    ritmoPropio:       propio === null ? '' : Math.round(propio * 1000) / 1000
  };
}

// ── Última medición VÁLIDA de una serie (KPI "por última medición") ───────
// Devuelve {gdpPer, clasificacion, color, fecha} o null si nada es utilizable.
function ultimaMedicionValida(serie) {
  if (!serie || serie.length === 0) return null;
  for (var i = serie.length - 1; i >= 0; i--) {
    var s = serie[i];
    if (s.gdpPer !== '' && s.clasificacion !== '') {
      return { gdpPer: s.gdpPer, clasificacion: s.clasificacion, color: colorClasificacion(s.clasificacion), fecha: s.fecha };
    }
  }
  return null;
}

// ── Último peso conocido de un animal ─────────────────────────────────────
//   (usa mediciones si existen, sino peso_inicial)
function ultimoPesoConocido(animal, mediciones) {
  if (!mediciones || mediciones.length === 0) return parseFloat(animal.peso_inicial) || 0;
  var mejor = null, mejorT = -Infinity;
  mediciones.forEach(function(m) {
    var f = _parseFecha(m.fecha);
    if (f && f.getTime() > mejorT) { mejorT = f.getTime(); mejor = m; }
  });
  return (mejor && !isNaN(parseFloat(mejor.peso))) ? parseFloat(mejor.peso)
       : (parseFloat(animal.peso_inicial) || 0);
}

// ── Días desde la última medición ─────────────────────────────────────────
function diasSinMedir(mediciones) {
  if (!mediciones || mediciones.length === 0) return null;
  var mejorT = -Infinity;
  mediciones.forEach(function(m) {
    var f = _parseFecha(m.fecha);
    if (f && f.getTime() > mejorT) mejorT = f.getTime();
  });
  if (mejorT === -Infinity) return null;
  return Math.floor((Date.now() - mejorT) / 86400000);
}
