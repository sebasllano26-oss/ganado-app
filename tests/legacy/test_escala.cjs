// Coherencia de la escala de GDP: la ETIQUETA nunca puede contradecir la LÍNEA.
// Extrae clasificarRendimiento() del propio Calculo.js — no reimplementa nada.
//   node docs/tests/test_escala.js     (desde la raíz de sistema-ganadero)
const fs = require('fs');
const path = require('path');
const base = path.resolve(__dirname, '..', '..', 'server','domain');
const src = fs.readFileSync(path.join(base, 'Calculo.js'), 'utf8');

function extraer(nombre) {
  const ini = src.indexOf('function ' + nombre + '(');
  if (ini < 0) throw new Error('no se encontro ' + nombre);
  let i = src.indexOf('{', ini), nivel = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') nivel++;
    else if (src[i] === '}' && --nivel === 0) return src.slice(ini, i + 1);
  }
  throw new Error('llaves sin cerrar en ' + nombre);
}

// El objetivo se lee del archivo: si alguien lo cambia, la prueba lo sigue.
const OBJ = parseFloat(/gdpObjetivoKg\(\)\s*\{\s*return getConfigNum\('gdp_objetivo_kg_dia',\s*([\d.]+)\)/.exec(src)[1]);
const MULT = {};
['SUPERA','CASI','BAJO'].forEach(k => {
  MULT[k] = parseFloat(new RegExp('GDP_MULT_' + k + '\\s*=\\s*([\\d.]+)').exec(src)[1]);
});

global.gdpObjetivoKg = () => OBJ;
global.GDP_MULT_SUPERA = MULT.SUPERA;
global.GDP_MULT_CASI   = MULT.CASI;
global.GDP_MULT_BAJO   = MULT.BAJO;
eval(extraer('clasificarRendimiento'));

console.log('OBJETIVO leído del archivo = ' + OBJ + ' kg/dia\n');

// La línea de cada nivel, derivada del objetivo — nunca escrita a mano.
const LINEA = {
  SUPERA:  OBJ * MULT.SUPERA,
  CUMPLE:  OBJ,
  CASI:    OBJ * MULT.CASI,
  BAJO:    OBJ * MULT.BAJO,
  CRITICO: 0
};
const ORDEN = ['SUPERA','CUMPLE','CASI','BAJO','CRITICO'];

let fallos = 0;
// 116 valores de GDP entre 0 y 1.15
for (let i = 0; i <= 115; i++) {
  const gdp = i / 100;
  const et = clasificarRendimiento(gdp);
  const idx = ORDEN.indexOf(et);
  if (idx < 0) { console.log('  FALLA etiqueta desconocida ' + et + ' para ' + gdp); fallos++; continue; }
  // El GDP debe estar por encima de la línea de su nivel...
  if (gdp + 1e-9 < LINEA[et]) {
    console.log('  FALLA ' + gdp + ' -> ' + et + ' pero su linea es ' + LINEA[et]); fallos++;
  }
  // ...y por debajo de la del nivel inmediatamente superior.
  if (idx > 0 && gdp >= LINEA[ORDEN[idx - 1]] - 1e-9) {
    console.log('  FALLA ' + gdp + ' -> ' + et + ' pero alcanza ' + ORDEN[idx-1]); fallos++;
  }
  // Y la palabra no puede sonar aceptable si no llega al objetivo.
  if (gdp < OBJ && (et === 'SUPERA' || et === 'CUMPLE')) {
    console.log('  FALLA ' + gdp + ' no llega al objetivo pero dice ' + et); fallos++;
  }
}

console.log('-- Coherencia: la etiqueta nunca contradice la linea --');
console.log(fallos === 0 ? '  OK - 116 casos, 0 contradicciones' : '  ' + fallos + ' CONTRADICCIONES');

const vacios = ['', null, undefined, 'abc', NaN].map(v => JSON.stringify(clasificarRendimiento(v)));
const okVacios = vacios.every(v => v === '""');
console.log('\n  Valores no numericos -> ' + vacios.join(' ') + '  ' + (okVacios ? 'OK' : 'FALLA'));
process.exit(fallos === 0 && okVacios ? 0 : 1);
