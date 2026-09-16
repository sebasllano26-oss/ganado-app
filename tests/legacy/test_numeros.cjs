// Lectura de números escritos por una persona en Colombia.
// Extrae _aNumero() del propio legacy.js — no reimplementa la lógica.
//   node docs/tests/test_numeros.js
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(
  path.resolve(__dirname, '..', '..', 'src', 'legacy.js'), 'utf8');

// Recorta la función contando llaves desde su declaración dentro del objeto App.
function extraer(nombre) {
  const ini = src.indexOf('  ' + nombre + ': function');
  if (ini < 0) throw new Error('no se encontro ' + nombre);
  let i = src.indexOf('{', ini), nivel = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') nivel++;
    else if (src[i] === '}' && --nivel === 0) {
      return src.slice(src.indexOf('function', ini), i + 1);
    }
  }
  throw new Error('llaves sin cerrar en ' + nombre);
}

const App = {};
App._aNumero = eval('(' + extraer('_aNumero') + ')');
App._aPesos  = eval('(' + extraer('_aPesos')  + ')');

let fallos = 0;
function check(entrada, esperado) {
  const r = App._aNumero(entrada);
  const ok = Number.isNaN(esperado) ? Number.isNaN(r) : r === esperado;
  console.log((ok ? '  OK    ' : '  FALLA ') +
    '"' + entrada + '" -> ' + r + (ok ? '' : '   (se esperaba ' + esperado + ')'));
  if (!ok) fallos++;
}

console.log('\n── El caso que rompía: coma decimal ─────────────────────────────');
check('294,5', 294.5);
check('294.5', 294.5);
check('294',   294);
check('0',     0);

console.log('\n── Formato colombiano de miles ──────────────────────────────────');
check('1.800.000',  1800000);
check('1.234,5',    1234.5);
check('1.000.000,5', 1000000.5);

// "12.000" con UN solo punto es genuinamente ambiguo: doce mil, o doce coma
// cero. En un campo DECIMAL (peso, mm, hectáreas) el punto se lee como decimal,
// que es lo correcto para "294.5". El dinero no pasa por aquí: va por _aPesos,
// donde no hay ambigüedad posible.
check('12.000',     12);

console.log('\n── Basura y vacíos: no deben pasar como número ──────────────────');
check('',       NaN);
check('   ',    NaN);
check('abc',    NaN);
check('294 kg', NaN);
check('--3',    NaN);

console.log('\n── Espacios alrededor, que el teclado del teléfono suele meter ──');
check(' 294,5 ', 294.5);

console.log('\n── Dinero: aquí los puntos SIEMPRE son miles ────────────────────');
function checkP(entrada, esperado) {
  const r = App._aPesos(entrada);
  const ok = Number.isNaN(esperado) ? Number.isNaN(r) : r === esperado;
  console.log((ok ? '  OK    ' : '  FALLA ') +
    '"' + entrada + '" -> ' + r + (ok ? '' : '   (se esperaba ' + esperado + ')'));
  if (!ok) fallos++;
}
checkP('1.800.000', 1800000);
checkP('1800000',   1800000);
checkP('12.000',    12000);      // sin ambigüedad: doce mil
checkP('$ 1.800.000', 1800000);  // aunque pegue el signo
checkP('',          NaN);
checkP('abc',       NaN);

console.log('\n' + (fallos === 0 ? '  TODAS LAS COMPROBACIONES PASAN' : '  ' + fallos + ' FALLOS'));
process.exit(fallos === 0 ? 0 : 1);
