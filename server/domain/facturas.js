// ════════════════════════════════════════════════════════════════════════
//  facturas.gs — Lectura de facturas de gasto
// ════════════════════════════════════════════════════════════════════════
//  Diseño: docs/specs/2026-09-13-facturas-design.md
//
//  EL PRINCIPIO QUE GOBIERNA TODO ESTE ARCHIVO:
//  la lectura de la máquina NUNCA se guarda sola. Se le muestra al usuario
//  junto a la foto, él corrige lo que esté mal, y solo entonces se escribe.
//  Esto va a una contadora: un total mal leído que nadie miró es peor que no
//  tener el módulo.
//
//  Y la imagen se guarda en Drive ANTES de intentar leerla. Al revés, una
//  lectura fallida dejaría al usuario sin foto y sin registro.
// ════════════════════════════════════════════════════════════════════════

// El nombre del modelo vive en una PROPIEDAD del script, no aquí: los modelos
// se retiran cada pocos meses y así se cambia sin tocar archivos ni volver a
// publicar la web app. Esta constante es solo el valor de arranque.
var GEMINI_MODELO_POR_DEFECTO = 'gemini-2.5-flash';
var GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';

var FAC_ESTADOS = ['PENDIENTE', 'ENVIADA', 'APROBADA', 'DEVUELTA'];

// Si el catálogo de la hoja está vacío se usan estas. Así el módulo funciona
// desde el primer día y el usuario ajusta después sin tocar código.
var FAC_CATEGORIAS_DEFECTO = [
  'Droguería y veterinario',
  'Concentrado y sal',
  'Combustible',
  'Herramienta y repuestos',
  'Mano de obra',
  'Transporte',
  'Servicios públicos',
  'Impuestos y trámites',
  'Otros'
];

function _geminiModelo() {
  return _propTexto('GEMINI_MODELO', GEMINI_MODELO_POR_DEFECTO);
}

// ── Utilidades de fecha ──────────────────────────────────────────────────
// NUNCA toISOString(): en Colombia (UTC−5) devuelve el día siguiente a partir
// de las 19:00, y una factura registrada de noche quedaría en el mes que no es.
function _facEsFecha(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
}
function _facMes(fechaISO) {
  return _facEsFecha(fechaISO) ? String(fechaISO).substring(0, 7) : '';
}
function _facHoy() {
  return _hoyISOServidor();
}

// ══════════════════════════════════════════════════════════════════════════
//  DRIVE
// ══════════════════════════════════════════════════════════════════════════

// La carpeta del mes, creándola si no existe. La raíz se guarda en una
// propiedad: si el usuario ya tenía una carpeta suya, pone ahí su id y el
// sistema escribe dentro de la que él eligió.
function _carpetaFacturas(mes) {
  var raiz = null;
  var idRaiz = _propTexto('CARPETA_FACTURAS_ID');
  if (idRaiz) {
    try { raiz = DriveApp.getFolderById(idRaiz); } catch (e) { raiz = null; }
  }
  if (!raiz) {
    raiz = DriveApp.createFolder('GanaX — Facturas');
    _segProps().setProperty('CARPETA_FACTURAS_ID', raiz.getId());
  }
  if (!mes) return raiz;

  var it = raiz.getFoldersByName(mes);
  return it.hasNext() ? it.next() : raiz.createFolder(mes);
}

// ══════════════════════════════════════════════════════════════════════════
//  GEMINI
// ══════════════════════════════════════════════════════════════════════════

// Lo que se le pide. Está escrito en español y es explícito en las dos cosas
// que más se equivocan: el formato de los números colombianos y la tentación
// de rellenar lo que no se ve.
var FAC_INSTRUCCION =
  'Eres un asistente que lee facturas de compra colombianas para una hacienda ganadera.\n' +
  'Extrae SOLO lo que está escrito en la imagen.\n\n' +
  'REGLAS:\n' +
  '1. Si un dato no aparece o no se alcanza a leer, déjalo vacío. NO lo inventes ni lo deduzcas.\n' +
  '2. Los importes son pesos colombianos. En Colombia el punto separa los miles y la coma los\n' +
  '   decimales: "1.234.567" son un millón doscientos treinta y cuatro mil quinientos sesenta\n' +
  '   y siete pesos. Devuelve los importes como NÚMERO, sin puntos, comas ni el signo $.\n' +
  '3. La fecha va en formato yyyy-MM-dd. Si la factura la escribe como dd/MM/yyyy, conviértela.\n' +
  '   Recuerda que en Colombia el día va primero.\n' +
  '4. El NIT y el número de factura son TEXTO, tal como están impresos, conservando los ceros\n' +
  '   de la izquierda y los guiones.\n' +
  '5. "concepto" es una línea corta que resuma qué se compró, en español.\n' +
  '6. "confianza" dice qué tan legible estaba la factura: ALTA si se leía bien,\n' +
  '   MEDIA si hubo que forzar la vista, BAJA si la foto está borrosa o cortada.\n' +
  '7. "categoria" debe ser EXACTAMENTE una de las de la lista que se te pasa, la que\n' +
  '   mejor describa lo comprado. Si ninguna encaja, déjala vacía. No inventes otras.';

var FAC_ESQUEMA = {
  type: 'OBJECT',
  properties: {
    proveedor: { type: 'STRING' },
    nit:       { type: 'STRING' },
    numero:    { type: 'STRING' },
    fecha:     { type: 'STRING' },
    concepto:  { type: 'STRING' },
    subtotal:  { type: 'NUMBER' },
    iva:       { type: 'NUMBER' },
    total:     { type: 'NUMBER' },
    categoria: { type: 'STRING' },
    confianza: { type: 'STRING' }
  }
};

// Devuelve { ok, campos, error }. NUNCA lanza por culpa de la lectura: quien
// llama necesita poder guardar la imagen igual y dejar que el usuario escriba
// los datos a mano.
function _leerConGemini(base64, mimeType, categorias) {
  var clave = _propTexto('GEMINI_API_KEY');
  if (!clave) {
    return { ok: false, error: 'Falta configurar GEMINI_API_KEY en las propiedades del script.' };
  }

  var cuerpo = {
    contents: [{
      parts: [
        { text: FAC_INSTRUCCION + '\n\nCATEGORÍAS PERMITIDAS:\n- ' +
                (categorias || []).join('\n- ') },
        { inline_data: { mime_type: mimeType || 'image/jpeg', data: base64 } }
      ]
    }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: FAC_ESQUEMA,
      // Cero temperatura: leer una factura no es una tarea creativa. Con
      // temperatura alta, la misma foto puede dar dos totales distintos.
      temperature: 0
    }
  };

  var resp;
  try {
    resp = UrlFetchApp.fetch(
      GEMINI_BASE + '/models/' + encodeURIComponent(_geminiModelo()) +
      ':generateContent?key=' + encodeURIComponent(clave),
      { method: 'post', contentType: 'application/json',
        payload: JSON.stringify(cuerpo), muteHttpExceptions: true });
  } catch (e) {
    return { ok: false, error: 'No se pudo conectar con Gemini: ' + e.message };
  }

  var codigo = resp.getResponseCode();
  var texto  = resp.getContentText();
  if (codigo !== 200) {
    return { ok: false, error: 'Gemini respondió ' + codigo + '. ' + texto.slice(0, 300) };
  }

  var datos;
  try { datos = JSON.parse(texto); } catch (e) {
    return { ok: false, error: 'Respuesta ilegible de Gemini.' };
  }

  var cand = (datos.candidates || [])[0];
  if (!cand) {
    // Sin candidatos suele ser un bloqueo de seguridad o una imagen que no
    // pudo procesar. Se dice tal cual: el usuario escribe los datos a mano.
    return { ok: false, error: 'Gemini no devolvió ninguna lectura de esta imagen.' };
  }

  var crudo = (((cand.content || {}).parts || [])[0] || {}).text || '';
  var leido;
  try { leido = JSON.parse(crudo); } catch (e) {
    return { ok: false, error: 'Gemini no devolvió los campos en el formato esperado.' };
  }

  return { ok: true, campos: _normalizarLectura(leido, categorias) };
}

// Todo lo que llega de Gemini pasa por aquí. Es la frontera: de este punto en
// adelante los tipos son los de la app, no los que se le ocurrieron al modelo.
function _normalizarLectura(x, categorias) {
  x = x || {};
  var fecha = String(x.fecha || '').trim();
  if (!_facEsFecha(fecha)) fecha = '';           // lo que no cuadre, se descarta

  var conf = String(x.confianza || '').toUpperCase();
  if (['ALTA', 'MEDIA', 'BAJA'].indexOf(conf) < 0) conf = '';

  function num(v) {
    var n = _aNumeroFactura(v);
    return isNaN(n) ? '' : n;
  }

  // La categoria que propone el modelo solo vale si EXISTE en el catalogo.
  // Comparando sin mayusculas ni acentos de por medio, y devolviendo siempre
  // la forma canonica de la lista: si no, entrarian variantes como
  // "combustible" y "Combustible" y el resumen del mes las contaria aparte.
  var cat = '';
  var propuesta = String(x.categoria || '').trim().toLowerCase();
  if (propuesta) {
    (categorias || []).forEach(function(c) {
      if (!cat && String(c).trim().toLowerCase() === propuesta) cat = c;
    });
  }

  return {
    categoria: cat,
    proveedor: String(x.proveedor || '').trim(),
    nit:       String(x.nit       || '').trim(),
    numero:    String(x.numero    || '').trim(),
    fecha:     fecha,
    concepto:  String(x.concepto  || '').trim(),
    subtotal:  num(x.subtotal),
    iva:       num(x.iva),
    total:     num(x.total),
    confianza: conf
  };
}

// ══════════════════════════════════════════════════════════════════════════
//  LO QUE LLAMA EL FRONTEND
// ══════════════════════════════════════════════════════════════════════════

// Sube la foto y la lee, EN ESE ORDEN, en una sola llamada.
//
// Una sola y no dos porque la imagen viaja en base64: partirlo en "subir" y
// "leer" obligaría a mandarla dos veces por la red, y desde un celular en la
// finca eso se nota.
//
// Si la lectura falla, la respuesta sigue siendo ok:true — con la imagen ya
// guardada y los campos vacíos. Perder la factura no es una opción.
function subirYLeerFactura(payload) {
  _exigirPinFinanzas(payload);

  var b64 = (payload && payload.base64) || '';
  if (!b64) return { ok: false, error: 'No llegó la imagen.' };

  var mime = String((payload && payload.mimeType) || 'image/jpeg');
  if (mime.indexOf('image/') !== 0) {
    return { ok: false, error: 'Por ahora solo se pueden subir imágenes, no archivos PDF.' };
  }

  var mesCarpeta = _facMes(_facHoy());
  var archivo;
  try {
    var ext  = mime.indexOf('png') >= 0 ? '.png' : '.jpg';
    var blob = Utilities.newBlob(Utilities.base64Decode(b64), mime,
                                 'factura-' + new Date().getTime() + ext);
    archivo = _carpetaFacturas(mesCarpeta).createFile(blob);
  } catch (e) {
    return { ok: false, error: 'No se pudo guardar la imagen en Drive: ' + e.message };
  }

  var lectura = _leerConGemini(b64, mime, _opcionesFacturas().categorias);

  return {
    ok:         true,
    drive_id:   archivo.getId(),
    drive_url:  archivo.getUrl(),
    lecturaOk:  lectura.ok,
    campos:     lectura.ok ? lectura.campos : _normalizarLectura({}),
    error:      lectura.ok ? '' : lectura.error
  };
}

// ¿Ya hay una factura con este NIT y este número?
// No bloquea: hay proveedores que reinician la numeración cada año. Solo avisa
// para que el usuario decida con el dato delante.
function _facturaRepetida(nit, numero, idExcluir) {
  var n = String(nit || '').trim();
  var f = String(numero || '').trim();
  if (!n || !f) return null;
  var todas = getAll('facturas');
  for (var i = 0; i < todas.length; i++) {
    var x = todas[i];
    if (idExcluir && x.id_factura === idExcluir) continue;
    if (String(x.nit).trim() === n && String(x.numero).trim() === f) return x;
  }
  return null;
}

function _validarFactura(p) {
  var errores = [];
  if (!_facEsFecha(p.fecha))                 errores.push('Indica la fecha de la factura.');
  if (!String(p.proveedor || '').trim())     errores.push('Escribe quién la expidió.');
  var total = _aNumeroFactura(p.total);
  if (isNaN(total) || total <= 0)            errores.push('El total tiene que ser mayor que cero.');
  return errores;
}

function guardarFactura(payload) {
  _exigirPinFinanzas(payload);
  var p = payload || {};

  var errores = _validarFactura(p);
  if (errores.length) return { ok: false, error: errores[0], errores: errores };

  // El aviso de repetida se da ANTES de escribir. El usuario vuelve a mandar
  // lo mismo con confirmarRepetida y entonces sí se guarda.
  if (!p.confirmarRepetida) {
    var gemela = _facturaRepetida(p.nit, p.numero, null);
    if (gemela) {
      return { ok: false, repetida: {
        id_factura: gemela.id_factura,
        fecha:      gemela.fecha,
        proveedor:  gemela.proveedor,
        total:      gemela.total
      } };
    }
  }

  function n(v) { var x = _aNumeroFactura(v); return isNaN(x) ? '' : x; }

  var fila = {
    id_factura: generarId('FAC'),
    fecha:      p.fecha,
    proveedor:  String(p.proveedor || '').trim(),
    nit:        String(p.nit       || '').trim(),
    numero:     String(p.numero    || '').trim(),
    concepto:   String(p.concepto  || '').trim(),
    categoria:  String(p.categoria || '').trim(),
    id_predio:  String(p.id_predio || '').trim(),
    subtotal:   n(p.subtotal),
    iva:        n(p.iva),
    total:      n(p.total),
    estado:     'PENDIENTE',
    // La guarda el usuario desde el formulario de revisión, así que por
    // definición alguien la miró. Se escribe explícito igual: el día que entre
    // una factura por otra vía, este campo tiene que decir la verdad.
    revisada:   p.revisada === false ? 'NO' : 'SI',
    drive_id:   String(p.drive_id  || '').trim(),
    drive_url:  String(p.drive_url || '').trim(),
    mes:        _facMes(p.fecha),
    notas:      String(p.notas || '').trim(),
    subida_el:  _facHoy(),
    enviada_el: '',
    aprobada_el: ''
  };

  insert('facturas', fila);
  return { ok: true, data: fila, advertencias: _avisosCuadre(fila) };
}

function editarFactura(payload) {
  _exigirPinFinanzas(payload);
  var p = payload || {};
  if (!p.id_factura) return { ok: false, error: 'Falta la factura a corregir.' };

  var actual = findOne('facturas', 'id_factura', p.id_factura);
  if (!actual) return { ok: false, error: 'Esa factura ya no existe.' };

  var errores = _validarFactura(p);
  if (errores.length) return { ok: false, error: errores[0], errores: errores };

  function n(v) { var x = _aNumeroFactura(v); return isNaN(x) ? '' : x; }

  var cambios = {
    fecha:     p.fecha,
    proveedor: String(p.proveedor || '').trim(),
    nit:       String(p.nit       || '').trim(),
    numero:    String(p.numero    || '').trim(),
    concepto:  String(p.concepto  || '').trim(),
    categoria: String(p.categoria || '').trim(),
    id_predio: String(p.id_predio || '').trim(),
    subtotal:  n(p.subtotal),
    iva:       n(p.iva),
    total:     n(p.total),
    revisada:  'SI',
    mes:       _facMes(p.fecha),
    notas:     String(p.notas || '').trim()
  };

  var guardada = update('facturas', 'id_factura', p.id_factura, cambios);
  return { ok: true, data: guardada, advertencias: _avisosCuadre(guardada) };
}

// Avisos que NO impiden guardar: son cosas para mirar, no errores.
// Se devuelven después de escribir, a propósito — frenar a alguien por un IVA
// que no cuadra al peso sería pelear con la realidad del papel.
function _avisosCuadre(f) {
  var avisos = [];
  var sub = _aNumeroFactura(f.subtotal);
  var iva = _aNumeroFactura(f.iva);
  var tot = _aNumeroFactura(f.total);

  if (!isNaN(sub) && !isNaN(iva) && !isNaN(tot) && sub > 0) {
    // Un peso de diferencia es redondeo del proveedor, no un error de nadie.
    if (Math.abs(sub + iva - tot) > 1) {
      avisos.push('Ojo: subtotal más IVA no da el total (' + Math.round(sub + iva) +
                  ' contra ' + Math.round(tot) + '). Revisa el papel.');
    }
  }
  if (!f.categoria) avisos.push('Quedó sin categoría: el resumen del mes no la va a poder agrupar.');
  if (!f.nit)       avisos.push('Quedó sin NIT. La contadora suele necesitarlo.');
  return avisos;
}

// Borrar quita la fila y DEJA la imagen en Drive. Es la misma regla que ya
// sigue la app con las bajas de animales: el registro sale de la vista, la
// evidencia no se destruye.
function eliminarFactura(payload) {
  _exigirPinFinanzas(payload);
  var id = (payload || {}).id_factura;
  if (!id) return { ok: false, error: 'Falta la factura a borrar.' };

  var f = findOne('facturas', 'id_factura', id);
  if (!f) return { ok: false, error: 'Esa factura ya no existe.' };
  if (f.estado === 'ENVIADA' || f.estado === 'APROBADA') {
    return { ok: false, error: 'Esta factura ya se le envió a la contadora. ' +
             'Si está mal, corrígela en vez de borrarla.' };
  }

  deleteRecord('facturas', 'id_factura', id);
  return { ok: true, imagenConservada: !!f.drive_url };
}

// Cambia el estado cuando la contadora contesta.
function marcarEstadoFactura(payload) {
  _exigirPinFinanzas(payload);
  var p = payload || {};
  var estado = String(p.estado || '').toUpperCase();
  if (FAC_ESTADOS.indexOf(estado) < 0) return { ok: false, error: 'Estado desconocido: ' + estado };

  var f = findOne('facturas', 'id_factura', p.id_factura);
  if (!f) return { ok: false, error: 'Esa factura ya no existe.' };

  // No se puede aprobar lo que nunca se envió: el estado contaría una historia
  // que no ocurrió, y es justo lo que el cierre mensual va a mirar.
  if ((estado === 'APROBADA' || estado === 'DEVUELTA') && f.estado === 'PENDIENTE') {
    return { ok: false, error: 'Esta factura todavía no se ha enviado a la contadora.' };
  }

  var cambios = { estado: estado };
  if (estado === 'APROBADA') cambios.aprobada_el = _facHoy();
  return { ok: true, data: update('facturas', 'id_factura', p.id_factura, cambios) };
}

// ══════════════════════════════════════════════════════════════════════════
//  CONSULTAS
// ══════════════════════════════════════════════════════════════════════════

function listFacturas(payload) {
  _exigirPinFinanzas(payload);
  var p = payload || {};
  var lista = getAll('facturas');

  if (p.mes)       lista = lista.filter(function(f) { return f.mes === p.mes; });
  if (p.estado)    lista = lista.filter(function(f) { return f.estado === p.estado; });
  if (p.categoria) lista = lista.filter(function(f) { return f.categoria === p.categoria; });

  // De la más reciente a la más antigua: lo que se acaba de subir va arriba.
  lista.sort(function(a, b) { return String(b.fecha).localeCompare(String(a.fecha)); });

  return {
    ok:       true,
    lista:    lista,
    resumen:  _resumenFacturas(lista),
    meses:    _mesesConFacturas(),
    opciones: _opcionesFacturas(),
    hoy:      _facHoy()
  };
}

function _resumenFacturas(lista) {
  var total = 0, sinRevisar = 0, porEstado = {}, porCategoria = {};
  FAC_ESTADOS.forEach(function(e) { porEstado[e] = 0; });

  lista.forEach(function(f) {
    var t = _aNumeroFactura(f.total);
    if (!isNaN(t)) total += t;
    if (String(f.revisada).toUpperCase() !== 'SI') sinRevisar++;
    if (porEstado[f.estado] !== undefined) porEstado[f.estado]++;
    var c = f.categoria || 'Sin categoría';
    porCategoria[c] = (porCategoria[c] || 0) + (isNaN(t) ? 0 : t);
  });

  var cats = Object.keys(porCategoria).map(function(c) {
    return { categoria: c, total: porCategoria[c] };
  }).sort(function(a, b) { return b.total - a.total; });

  return { cuantas: lista.length, total: total, sinRevisar: sinRevisar,
           porEstado: porEstado, porCategoria: cats };
}

// Los meses que tienen algo, de más nuevo a más viejo. El mes en curso va
// siempre, aunque esté vacío: es donde se va a subir lo de hoy.
function _mesesConFacturas() {
  var vistos = {};
  getAll('facturas').forEach(function(f) { if (f.mes) vistos[f.mes] = true; });
  vistos[_facMes(_facHoy())] = true;
  return Object.keys(vistos).sort().reverse();
}

function _opcionesFacturas() {
  var cats = getCatalogo('CATEGORIAS_GASTO');
  if (!cats || !cats.length) cats = FAC_CATEGORIAS_DEFECTO;

  var predios = getAll('predios')
    .filter(function(p) { return String(p.activo).toUpperCase() !== 'NO'; })
    .map(function(p) { return { id_predio: p.id_predio, nombre: p.nombre }; });

  return { categorias: cats, predios: predios };
}

// ══════════════════════════════════════════════════════════════════════════
//  DIAGNÓSTICO — se ejecuta DESDE EL EDITOR, no desde la web
// ══════════════════════════════════════════════════════════════════════════
// Responde tres preguntas de una vez: ¿la clave sirve?, ¿qué modelos puede
// usar esta cuenta?, y ¿el que está configurado es uno de ellos?
//
// Nunca imprime la clave. Un diagnóstico que muestra el secreto que está
// comprobando lo deja escrito en los registros de ejecución para siempre.
function DIAGNOSTICO_GEMINI() {
  var log = [];

  var clave = _propTexto('GEMINI_API_KEY');
  if (!clave) {
    SpreadsheetApp.getUi().alert(
      'DIAGNÓSTICO DE GEMINI\n\n' +
      '❌ No hay clave configurada.\n\n' +
      'Configuración del proyecto → Propiedades de la secuencia de comandos →\n' +
      'crea la propiedad GEMINI_API_KEY con la clave de aistudio.google.com');
    return;
  }
  log.push('✅ Clave configurada (' + clave.length + ' caracteres)');

  var resp;
  try {
    resp = UrlFetchApp.fetch(GEMINI_BASE + '/models?key=' + encodeURIComponent(clave), {
      method: 'get',
      muteHttpExceptions: true   // para poder LEER el error en vez de que estalle
    });
  } catch (e) {
    SpreadsheetApp.getUi().alert('DIAGNÓSTICO DE GEMINI\n\n' +
      '❌ No se pudo conectar: ' + e.message);
    return;
  }

  var codigo = resp.getResponseCode();
  var cuerpo = resp.getContentText();

  if (codigo !== 200) {
    SpreadsheetApp.getUi().alert('DIAGNÓSTICO DE GEMINI\n\n' +
      '❌ El servidor respondió ' + codigo + '\n\n' +
      cuerpo.slice(0, 900) + '\n\n' +
      'Si dice "API key not valid", la clave está mal copiada.\n' +
      'Si dice "has not been used" o "disabled", falta habilitar la\n' +
      'Generative Language API en ese proyecto de Google Cloud.');
    return;
  }

  var datos;
  try {
    datos = JSON.parse(cuerpo);
  } catch (e) {
    SpreadsheetApp.getUi().alert('DIAGNÓSTICO DE GEMINI\n\n' +
      '❌ Respuesta ilegible del servidor:\n' + cuerpo.slice(0, 500));
    return;
  }

  // Solo interesan los que sirven para lo nuestro: generar contenido a partir
  // de una imagen. La lista trae además modelos de embeddings y otros que no.
  var utiles = (datos.models || []).filter(function(m) {
    return (m.supportedGenerationMethods || []).indexOf('generateContent') >= 0;
  }).map(function(m) {
    return String(m.name || '').replace('models/', '');
  });

  log.push('✅ La clave funciona: ' + utiles.length + ' modelos disponibles');
  log.push('');

  var configurado = _geminiModelo();
  var puesto = _propTexto('GEMINI_MODELO');
  log.push('Modelo en uso: ' + configurado +
           (puesto ? '  (de la propiedad)' : '  (el de por defecto)'));

  if (utiles.indexOf(configurado) >= 0) {
    log.push('✅ Ese modelo está disponible para tu cuenta.');
  } else {
    log.push('⚠️ Ese modelo NO aparece en tu lista.');
    log.push('   Copia uno de los de abajo en la propiedad GEMINI_MODELO.');
  }

  log.push('');
  log.push('── Modelos que puedes usar ──');
  // Los "flash" son los rápidos y baratos: es lo que queremos para leer una
  // foto de factura. Se listan primero para que la elección sea la obvia.
  var flash = utiles.filter(function(n) { return n.indexOf('flash') >= 0; });
  var resto = utiles.filter(function(n) { return n.indexOf('flash') < 0; });
  flash.slice(0, 12).forEach(function(n) { log.push('  ⚡ ' + n); });
  if (resto.length) {
    log.push('  ── otros ──');
    resto.slice(0, 12).forEach(function(n) { log.push('  · ' + n); });
  }
  if (utiles.length > 24) log.push('  …y ' + (utiles.length - 24) + ' más');

  SpreadsheetApp.getUi().alert('DIAGNÓSTICO DE GEMINI\n\n' + log.join('\n'));
}
