// El costo de una venta se resuelve contra el precio VIVO del animal, no contra
// la utilidad congelada en la hoja. Extrae las funciones reales de ventas.js.
//   node docs/tests/test_costo_ventas.js
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(
  path.resolve(__dirname, '..', '..', 'server','domain', 'ventas.js'), 'utf8');

function extraer(nombre) {
  const ini = src.indexOf('function ' + nombre + '(');
  if (ini < 0) throw new Error('no se encontro ' + nombre + ' en ventas.js');
  let i = src.indexOf('{', ini), nivel = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') nivel++;
    else if (src[i] === '}' && --nivel === 0) return src.slice(ini, i + 1);
  }
  throw new Error('llaves sin cerrar en ' + nombre);
}

// El ejemplar 80 es el caso real que reportó el usuario: la venta se registró
// cuando el animal tenía 1.000.000, y después se corrigió en la base a 2.600.000.
const ANIMALES = [
  { codigo: '80', precio_compra: 2600000, fecha_ingreso: '2025-01-10' },
  { codigo: '81', precio_compra: 1800000, fecha_ingreso: '2025-02-01' },
  { codigo: '82', precio_compra: '',      fecha_ingreso: '2025-03-01' },
];
const VENTAS = [
  // Filas viejas: sin la columna precio_compra y con la utilidad congelada.
  { id_venta:'V1', codigo:'80', precio_salida:3200000, peso_salida:340, utilidad:2200000, precio_compra:'', dias_en_predio:400 },
  { id_venta:'V2', codigo:'81', precio_salida:2900000, peso_salida:320, utilidad:1100000, precio_compra:'', dias_en_predio:365 },
  // El caso del "|| 0": sin costo, la utilidad quedó = venta entera.
  { id_venta:'V3', codigo:'82', precio_salida:2500000, peso_salida:300, utilidad:2500000, precio_compra:'', dias_en_predio:300 },
];

global.getAll = function(hoja) { return hoja === 'animales' ? ANIMALES : VENTAS; };
eval(extraer('_resolverCostoVenta') + '\n' + extraer('_enriquecerVentas'));

const out = _enriquecerVentas(VENTAS);
let fallos = 0;
function check(c, m) { console.log((c ? '  OK   ' : '  FALLA ') + m); if (!c) fallos++; }

console.log('\n── El caso del ejemplar 80 ──────────────────────────────────────');
const a80 = out.find(v => v.codigo === '80');
console.log('   la hoja de ventas decia un costo de : ' + (a80.precio_salida - a80.utilidad_registrada).toLocaleString('es-CO'));
console.log('   la hoja de animales dice            : ' + a80.precio_compra.toLocaleString('es-CO'));
console.log('   ROI antes                           : ' + (a80.utilidad_registrada / 1000000 * 100).toFixed(1) + '%');
console.log('   ROI ahora                           : ' + (a80.utilidad / a80.precio_compra * 100).toFixed(1) + '%');

check(a80.precio_compra === 2600000, 'toma el costo VIVO del animal, no el congelado');
check(a80.utilidad === 600000,       'recalcula la utilidad: 3.200.000 - 2.600.000');
check(!!a80.desfase_costo,           'marca el desfase para poder avisar en pantalla');
check(a80.desfase_costo.costoImplicito === 1000000, 'nombra el costo viejo que asumia la venta');
check(a80.desfase_costo.diferencia   === 1600000,   'nombra la diferencia');

console.log('\n── Venta coherente (no debe marcarse) ───────────────────────────');
const a81 = out.find(v => v.codigo === '81');
check(a81.precio_compra === 1800000, 'costo correcto');
check(a81.utilidad      === 1100000, 'utilidad sin cambios');
check(a81.desfase_costo === null,    'NO se marca como desfasada');

console.log('\n── Animal sin costo (el caso del "|| 0") ────────────────────────');
const a82 = out.find(v => v.codigo === '82');
check(a82.costo_origen === 'sin_costo', 'se identifica como sin costo');
check(a82.precio_compra === '',         'no se inventa un cero');
check(a82.utilidad === '',              'no reporta una utilidad falsa del 100%');

console.log('\n── Una fila NUEVA, ya con su columna guardada ───────────────────');
const nuevas = _enriquecerVentas([
  { id_venta:'V4', codigo:'81', precio_salida:2900000, peso_salida:320, utilidad:1100000, precio_compra:1800000, dias_en_predio:365 }
]);
check(nuevas[0].precio_compra === 1800000, 'coincide con el animal');
check(nuevas[0].desfase_costo === null,    'sin desfase');

console.log('\n' + (fallos === 0 ? '  TODAS LAS COMPROBACIONES PASAN' : '  ' + fallos + ' FALLOS'));
process.exit(fallos === 0 ? 0 : 1);
