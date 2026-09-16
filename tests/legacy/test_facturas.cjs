// Prueba la logica REAL de facturas.js: extrae las funciones del archivo y las
// corre contra una hoja simulada. No reimplementa nada — eso solo probaria la
// copia.
//
// Lo que de verdad importa aqui: el dinero. Un total mal leido o una factura
// contada dos veces llega a una contadora, y nadie lo va a notar mirando la
// pantalla.
const fs = require('fs');
const path = require('path');
const FAC  = fs.readFileSync(path.resolve(__dirname,'..','..','server','domain','facturas.js'), 'utf8');
const CAL  = fs.readFileSync(path.resolve(__dirname,'..','..','server','domain','Calculo.js'),  'utf8');

function extraer(src, nombre) {
  const ini = src.indexOf('function ' + nombre + '(');
  if (ini < 0) throw new Error('no se encontro ' + nombre);
  let i = src.indexOf('{', ini), nivel = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') nivel++;
    else if (src[i] === '}' && --nivel === 0) return src.slice(ini, i + 1);
  }
  throw new Error('llaves sin cerrar en ' + nombre);
}

const HOY = '2026-09-13';

// ── La hoja simulada ──────────────────────────────────────────────────────
let HOJA = [];
function F(id, extra) {
  return Object.assign({
    id_factura:id, fecha:'2026-09-04', proveedor:'Agroinsumos del Valle',
    nit:'900123456-7', numero:'0087', concepto:'Sal mineralizada',
    categoria:'Concentrado y sal', id_predio:'PRE-1',
    subtotal:1000000, iva:190000, total:1190000,
    estado:'PENDIENTE', revisada:'SI', drive_id:'d1', drive_url:'http://x/1',
    mes:'2026-09', notas:'', subida_el:HOY, enviada_el:'', aprobada_el:''
  }, extra || {});
}

global.getAll = function(h) { return h === 'facturas' ? HOJA.slice() : []; };
global.findOne = function(h, campo, valor) {
  return global.getAll(h).filter(function(x) { return x[campo] === valor; })[0] || null;
};
global.insert = function(h, obj) { HOJA.push(obj); return obj; };
global.update = function(h, campo, valor, cambios) {
  for (let i = 0; i < HOJA.length; i++) {
    if (HOJA[i][campo] === valor) {
      Object.keys(cambios).forEach(function(k) { HOJA[i][k] = cambios[k]; });
      return HOJA[i];
    }
  }
  throw new Error('no encontrado');
};
const BORRADAS = [];
global.deleteRecord = function(h, campo, valor) {
  BORRADAS.push(valor);
  HOJA = HOJA.filter(function(x) { return x[campo] !== valor; });
};
global.generarId = function(p) { return p + '-NUEVA'; };
global.getCatalogo = function() { return []; };
global._hoyISOServidor = function() { return HOY; };
global._propTexto = function() { return ''; };

// El guardian: solo deja pasar con la palabra magica. Sirve para comprobar que
// CADA funcion expuesta pregunta por el PIN antes de tocar nada.
let PIN_PEDIDO = 0;
global._exigirPinFinanzas = function(p) {
  PIN_PEDIDO++;
  if (!p || p.pin !== 'buena') throw new Error('PIN incorrecto');
  return true;
};

// ── Las funciones reales ──────────────────────────────────────────────────
eval(
  FAC.match(/^var FAC_ESTADOS\s*=\s*\[[^\]]*\];/m)[0] + '\n' +
  extraer(CAL, '_aNumeroFactura') + '\n' +
  ['_facEsFecha','_facMes','_facHoy','_normalizarLectura','_facturaRepetida',
   '_validarFactura','_avisosCuadre','guardarFactura','editarFactura',
   'eliminarFactura','marcarEstadoFactura','_resumenFacturas','_mesesConFacturas']
    .map(function(n) { return extraer(FAC, n); }).join('\n')
);

let fallos = 0;
function check(cond, msg) { console.log((cond ? '  OK    ' : '  FALLA ') + msg); if (!cond) fallos++; }
function lanza(fn) { try { fn(); return null; } catch (e) { return e.message; } }

console.log('\n── El numero, escrito de mil formas ─────────────────────────────');
// Es la misma clase de error que hizo perder el peso "294,5" en la fase 12,
// pero con dinero. Una factura colombiana usa el punto para los miles.
[['$ 1.234.567',1234567], ['1.234.567,89',1234567.89], ['1,234,567.89',1234567.89],
 ['1.234',1234], ['285.5',285.5], ['12,5',12.5], ['$1.800.000 COP',1800000],
 ['0',0], [1234567,1234567], ['-45.000',-45000]].forEach(function(c) {
  check(_aNumeroFactura(c[0]) === c[1], JSON.stringify(c[0]) + ' -> ' + c[1]);
});
['', 'abc', null, undefined, '-'].forEach(function(v) {
  check(isNaN(_aNumeroFactura(v)), JSON.stringify(v) + ' no es un numero');
});

console.log('\n── La frontera con Gemini ───────────────────────────────────────');
// Todo lo que devuelve el modelo pasa por _normalizarLectura. De ahi en
// adelante los tipos son los de la app, no los que se le ocurrieron al modelo.
let n = _normalizarLectura({ proveedor:'  Agro SAS ', nit:'0012345', numero:'0087',
  fecha:'2026-09-04', total:'1.234.567', iva:'234.567', confianza:'alta' });
check(n.proveedor === 'Agro SAS', 'recorta los espacios del proveedor');
check(n.nit === '0012345', 'el NIT conserva los ceros de la izquierda');
check(n.total === 1234567, 'el total en formato colombiano se vuelve numero');
check(n.confianza === 'ALTA', 'la confianza se normaliza a mayusculas');

n = _normalizarLectura({ fecha:'04/09/2026', total:'no se lee', confianza:'quiza' });
check(n.fecha === '', 'una fecha que no es yyyy-MM-dd se descarta, no se adivina');
check(n.total === '', 'un total ilegible queda vacio, NO en cero');
check(n.confianza === '', 'una confianza inventada se descarta');

n = _normalizarLectura({});
check(n.proveedor === '' && n.nit === '' && n.total === '',
  'una lectura vacia devuelve campos vacios y no revienta');
check(_normalizarLectura(null).total === '', 'ni con null');

console.log('\n── La categoria que propone el modelo ───────────────────────────');
// Gemini ve "Melaza" y propone una categoria. Pero solo vale si EXISTE en el
// catalogo: si no se validara, entrarian variantes inventadas y el resumen del
// mes las contaria como rubros distintos sin que nadie lo note.
const CATS = ['Droguería y veterinario', 'Concentrado y sal', 'Combustible'];
check(_normalizarLectura({ categoria:'Combustible' }, CATS).categoria === 'Combustible',
  'una de la lista se acepta');
check(_normalizarLectura({ categoria:'  combustible  ' }, CATS).categoria === 'Combustible',
  'y se devuelve en su forma canonica, no como la escribio el modelo');
check(_normalizarLectura({ categoria:'Gasolina' }, CATS).categoria === '',
  'una inventada se descarta: el usuario la escoge a mano');
check(_normalizarLectura({ categoria:'Combustible' }, []).categoria === '',
  'sin catalogo no hay categoria que valga');
check(_normalizarLectura({ categoria:'Combustible' }).categoria === '',
  'ni cuando no se le pasa la lista');
check(_normalizarLectura({}, CATS).categoria === '', 'y si no propone nada, queda vacia');

console.log('\n── Sin PIN no se toca nada ──────────────────────────────────────');
HOJA = [F('F1')];
check(lanza(function(){ guardarFactura({ pin:'mala' }); }) === 'PIN incorrecto', 'guardarFactura exige el PIN');
check(lanza(function(){ editarFactura({ pin:'mala' }); }) === 'PIN incorrecto', 'editarFactura tambien');
check(lanza(function(){ eliminarFactura({ pin:'mala' }); }) === 'PIN incorrecto', 'eliminarFactura tambien');
check(lanza(function(){ marcarEstadoFactura({ pin:'mala' }); }) === 'PIN incorrecto', 'marcarEstadoFactura tambien');
check(HOJA.length === 1, 'y despues de los cuatro intentos la hoja sigue intacta');

console.log('\n── Lo que no se puede guardar ───────────────────────────────────');
const base = { pin:'buena', fecha:'2026-09-10', proveedor:'Droguer', total:50000, confirmarRepetida:true };
check(guardarFactura(Object.assign({}, base, { fecha:'' })).ok === false, 'sin fecha, no');
check(guardarFactura(Object.assign({}, base, { fecha:'10/09/2026' })).ok === false, 'con la fecha al reves, no');
check(guardarFactura(Object.assign({}, base, { proveedor:'   ' })).ok === false, 'sin proveedor, no');
check(guardarFactura(Object.assign({}, base, { total:0 })).ok === false, 'con total cero, no');
check(guardarFactura(Object.assign({}, base, { total:-5 })).ok === false, 'con total negativo, no');
check(HOJA.length === 1, 'ninguno de los cinco escribio una fila');

console.log('\n── La misma factura dos veces ───────────────────────────────────');
HOJA = [F('F1')];
let r = guardarFactura({ pin:'buena', fecha:'2026-09-11', proveedor:'Agroinsumos del Valle',
  nit:'900123456-7', numero:'0087', total:990000 });
check(r.ok === false && !!r.repetida, 'mismo NIT y mismo numero -> avisa');
check(r.repetida.total === 1190000, 'y dice cuanto valia la que ya estaba: ' + r.repetida.total);
check(HOJA.length === 1, 'sin escribir nada mientras el usuario decide');

r = guardarFactura({ pin:'buena', fecha:'2026-09-11', proveedor:'Agroinsumos del Valle',
  nit:'900123456-7', numero:'0087', total:990000, confirmarRepetida:true });
check(r.ok === true && HOJA.length === 2, 'confirmando, se guarda: hay proveedores que repiten numeracion');

HOJA = [F('F1')];
r = guardarFactura({ pin:'buena', fecha:'2026-09-11', proveedor:'Otro', nit:'', numero:'', total:5000 });
check(r.ok === true, 'sin NIT ni numero no puede haber repetida: se guarda directo');

console.log('\n── Lo que se guarda, como se guarda ─────────────────────────────');
HOJA = [];
r = guardarFactura({ pin:'buena', fecha:'2026-08-29', proveedor:'Ferreteria',
  total:'1.250.000', subtotal:'1.050.420', iva:'199.580', categoria:'Herramienta y repuestos' });
check(r.ok === true, 'se guarda');
check(HOJA[0].mes === '2026-08', 'el mes se deriva de la fecha de la factura, no de hoy');
check(HOJA[0].total === 1250000, 'el total colombiano llega a la hoja como numero');
check(HOJA[0].estado === 'PENDIENTE', 'nace sin enviar');
check(HOJA[0].revisada === 'SI', 'y marcada como revisada: viene del formulario que el usuario confirmo');
check(HOJA[0].id_factura === 'FAC-NUEVA', 'con su id propio');
check(HOJA[0].subida_el === HOY, 'y la fecha de subida del servidor');

console.log('\n── Los avisos que NO frenan ─────────────────────────────────────');
// Frenar a alguien porque el IVA no cuadra al peso seria pelear con el papel.
check(_avisosCuadre({ subtotal:1000000, iva:190000, total:1190000, categoria:'X', nit:'9' }).length === 0,
  'cuando cuadra, no dice nada');
check(_avisosCuadre({ subtotal:1000000, iva:190000, total:1190001, categoria:'X', nit:'9' }).length === 0,
  'un peso de diferencia es redondeo del proveedor, no un error');
check(_avisosCuadre({ subtotal:1000000, iva:190000, total:1500000, categoria:'X', nit:'9' }).length === 1,
  'una diferencia de verdad si se avisa');
check(_avisosCuadre({ total:5000, categoria:'', nit:'9' })
  .join(' ').indexOf('categoría') >= 0, 'sin categoria avisa: el resumen no la podria agrupar');
check(_avisosCuadre({ total:5000, categoria:'X', nit:'' })
  .join(' ').indexOf('NIT') >= 0, 'sin NIT tambien');

console.log('\n── El recorrido del estado ──────────────────────────────────────');
HOJA = [F('F1')];
check(marcarEstadoFactura({ pin:'buena', id_factura:'F1', estado:'APROBADA' }).ok === false,
  'no se puede aprobar lo que nunca se envio');
check(marcarEstadoFactura({ pin:'buena', id_factura:'F1', estado:'DEVUELTA' }).ok === false,
  'ni devolverlo');
check(marcarEstadoFactura({ pin:'buena', id_factura:'F1', estado:'INVENTADO' }).ok === false,
  'ni ponerle un estado que no existe');

marcarEstadoFactura({ pin:'buena', id_factura:'F1', estado:'ENVIADA' });
r = marcarEstadoFactura({ pin:'buena', id_factura:'F1', estado:'APROBADA' });
check(r.ok === true, 'enviada primero, aprobada despues: ese si es el camino');
check(HOJA[0].aprobada_el === HOY, 'y queda la fecha de aprobacion');
check(marcarEstadoFactura({ pin:'buena', id_factura:'NO-EXISTE', estado:'ENVIADA' }).ok === false,
  'una factura que no existe no se puede marcar');

console.log('\n── Borrar ───────────────────────────────────────────────────────');
HOJA = [F('F1'), F('F2', { estado:'ENVIADA' }), F('F3', { estado:'APROBADA' })];
check(eliminarFactura({ pin:'buena', id_factura:'F2' }).ok === false,
  'no se borra una que ya se le mando a la contadora');
check(eliminarFactura({ pin:'buena', id_factura:'F3' }).ok === false, 'ni una aprobada');
check(HOJA.length === 3, 'las dos siguen ahi');
r = eliminarFactura({ pin:'buena', id_factura:'F1' });
check(r.ok === true && HOJA.length === 2, 'la que no se ha enviado si');
check(r.imagenConservada === true, 'y se dice que la foto se queda en Drive');

console.log('\n── El resumen del mes ───────────────────────────────────────────');
const mes = [
  F('A', { total:100000, categoria:'Combustible' }),
  F('B', { total:250000, categoria:'Combustible' }),
  F('C', { total:50000,  categoria:'Transporte', revisada:'NO' }),
  F('D', { total:'',     categoria:'Transporte' })     // total ilegible
];
const res = _resumenFacturas(mes);
check(res.cuantas === 4, 'cuenta las cuatro');
check(res.total === 400000, 'suma 400.000 e ignora el total ilegible: ' + res.total);
check(res.sinRevisar === 1, 'y avisa de la que nadie reviso');
check(res.porCategoria[0].categoria === 'Combustible' && res.porCategoria[0].total === 350000,
  'la categoria mas cara va primero');
check(_resumenFacturas([]).total === 0, 'un mes vacio da cero, no NaN');

console.log('\n── Los meses que se ofrecen ─────────────────────────────────────');
HOJA = [F('X', { mes:'2026-07' }), F('Y', { mes:'2026-05' })];
const ms = _mesesConFacturas();
check(ms[0] === '2026-09', 'el mes en curso va de primero aunque este vacio: es donde se sube hoy');
check(ms.indexOf('2026-07') >= 0 && ms.indexOf('2026-05') >= 0, 'y estan los que tienen facturas');
check(ms.join(',') === '2026-09,2026-07,2026-05', 'del mas nuevo al mas viejo: ' + ms.join(','));

console.log('\n' + (fallos === 0 ? '  TODAS LAS COMPROBACIONES PASAN' : '  ' + fallos + ' FALLOS'));
process.exit(fallos === 0 ? 0 : 1);
