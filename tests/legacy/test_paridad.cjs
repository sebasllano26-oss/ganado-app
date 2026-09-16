// Paridad backend ↔ frontend: clasificarRendimiento() (Calculo.js) y
// App.clasificarGdp() (legacy.js) deben coincidir en TODO valor de GDP.
// Si divergen, el semáforo del dashboard y la ficha del animal se contradicen.
//   node docs/tests/test_paridad.js
const fs = require('fs');
const path = require('path');
const raiz = path.resolve(__dirname, '..', '..');
const gs  = fs.readFileSync(path.join(raiz, 'server','domain', 'Calculo.js'), 'utf8');
const js  = fs.readFileSync(path.join(raiz, 'src', 'legacy.js'), 'utf8');

function extraer(src, nombre, prefijo) {
  const ini = src.indexOf((prefijo || 'function ') + nombre + (prefijo ? ':' : '('));
  if (ini < 0) throw new Error('no se encontro ' + nombre);
  let i = src.indexOf('{', ini), nivel = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') nivel++;
    else if (src[i] === '}' && --nivel === 0) return src.slice(ini, i + 1);
  }
  throw new Error('llaves sin cerrar en ' + nombre);
}

// ── Backend ──
const OBJ = parseFloat(/gdpObjetivoKg\(\)\s*\{\s*return getConfigNum\('gdp_objetivo_kg_dia',\s*([\d.]+)\)/.exec(gs)[1]);
global.gdpObjetivoKg = () => OBJ;
['SUPERA','CASI','BAJO'].forEach(k => {
  global['GDP_MULT_' + k] = parseFloat(new RegExp('GDP_MULT_' + k + '\\s*=\\s*([\\d.]+)').exec(gs)[1]);
});
eval(extraer(gs, 'clasificarRendimiento'));

// ── Frontend ──
const escala = JSON.parse(
  /escala:\s*\{\s*SUPERA:\s*([\d.]+),\s*CUMPLE:\s*([\d.]+),\s*CASI:\s*([\d.]+),\s*BAJO:\s*([\d.]+)/.exec(js)
    .slice(1).reduce((o, v, i) => (o[['SUPERA','CUMPLE','CASI','BAJO'][i]] = +v, o), {}) &&
  JSON.stringify(/escala:\s*\{\s*SUPERA:\s*([\d.]+),\s*CUMPLE:\s*([\d.]+),\s*CASI:\s*([\d.]+),\s*BAJO:\s*([\d.]+)/.exec(js)
    .slice(1).reduce((o, v, i) => (o[['SUPERA','CUMPLE','CASI','BAJO'][i]] = +v, o), {})));
const objFront = parseFloat(/gdpObjetivo:\s*([\d.]+)/.exec(js)[1]);
const crecFront = parseFloat(/crecMensualEsperado:\s*([\d.]+)/.exec(js)[1]);

const App = { params: { escala: escala } };
eval('App.clasificarGdp = ' + extraer(js, 'clasificarGdp', '  ').replace(/^\s*clasificarGdp:\s*/, ''));

console.log('objetivo backend  = ' + OBJ);
console.log('objetivo frontend = ' + objFront);
console.log('escala frontend   = ' + JSON.stringify(escala) + '\n');

let fallos = 0;
for (let i = 0; i <= 150; i++) {
  const gdp = i / 100;
  const a = clasificarRendimiento(gdp), b = App.clasificarGdp(gdp);
  if (a !== b) { console.log('  FALLA ' + gdp + ': backend=' + a + ' frontend=' + b); fallos++; }
}
console.log(fallos === 0
  ? '  OK - 151 valores de GDP, backend y frontend coinciden en todos'
  : '  ' + fallos + ' DIVERGENCIAS');

const okObj = Math.abs(OBJ - objFront) < 1e-9;
console.log(okObj ? '  OK - el objetivo por defecto coincide en ambos lados'
                  : '  FALLA - el objetivo difiere entre backend y frontend');

const esperado = Math.round(OBJ * 30.44 * 100) / 100;
const okCrec = Math.abs(esperado - crecFront) < 0.01;
console.log(okCrec ? '  OK - crecimiento esperado (' + crecFront + ' kg/mes) = objetivo x 30.44'
                   : '  FALLA - crecimiento esperado ' + crecFront + ' != ' + esperado);

process.exit(fallos === 0 && okObj && okCrec ? 0 : 1);
