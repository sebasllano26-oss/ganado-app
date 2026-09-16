// El peso estimado para HOY.
// Extrae las funciones reales de Calculo.js y animal.js y las corre contra datos
// simulados. No reimplementa la logica: eso solo probaria la copia.
//   node docs/tests/test_peso_hoy.js
const fs = require('fs');
const path = require('path');
const R = (f) => fs.readFileSync(path.resolve(__dirname, '..', '..', 'server','domain', f), 'utf8');
const CALC = R('Calculo.js');
const ANIM = R('animal.js');

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

// ── Hojas simuladas ───────────────────────────────────────────────────────
// Un predio con cuatro animales: dos que ganan, uno que pierde y uno sin pesar.
let ANIMALES, MEDICIONES;
function reset() {
  ANIMALES = [
    { codigo:'80', predio:'LA SIERRA', estado:'ACTIVO', peso_inicial:180, fecha_ingreso:'2026-01-10' },
    { codigo:'81', predio:'LA SIERRA', estado:'ACTIVO', peso_inicial:200, fecha_ingreso:'2026-01-10' },
    { codigo:'82', predio:'LA SIERRA', estado:'ACTIVO', peso_inicial:300, fecha_ingreso:'2026-01-10' },
    { codigo:'83', predio:'LA SIERRA', estado:'ACTIVO', peso_inicial:190, fecha_ingreso:'2026-01-10' },
    // De otro predio y muerto: ninguno debe entrar en el promedio de LA SIERRA.
    { codigo:'90', predio:'BELGICA',   estado:'ACTIVO', peso_inicial:200, fecha_ingreso:'2026-01-10' },
    { codigo:'91', predio:'LA SIERRA', estado:'MUERTO', peso_inicial:200, fecha_ingreso:'2026-01-10' }
  ];
  MEDICIONES = [
    { codigo:'80', fecha:'2026-03-01', peso:220   },
    { codigo:'80', fecha:'2026-06-01', peso:265   },
    { codigo:'80', fecha:'2026-09-01', peso:294.5 },
    { codigo:'81', fecha:'2026-09-01', peso:320   },   // (320-200)/234 = 0.513
    { codigo:'82', fecha:'2026-09-01', peso:270   },   // PIERDE: (270-300)/234 < 0
    // 83 no tiene ninguna medicion
    { codigo:'90', fecha:'2026-09-01', peso:400   },   // otro predio
    { codigo:'91', fecha:'2026-09-01', peso:400   }    // muerto
  ];
}
reset();

global.getAll = function(h) { return h === 'animales' ? ANIMALES : MEDICIONES; };
global.Utilities = { formatDate: () => HOY };
global.Session = { getScriptTimeZone: () => 'America/Bogota' };

// Un solo eval en el ambito del modulo: dentro de un callback las funciones
// quedarian encerradas en el y no se verian desde aqui.
eval(
  'var GDP_PROY_MIN = ' + /var GDP_PROY_MIN = ([-\d.]+)/.exec(CALC)[1] + ';\n' +
  'var GDP_PROY_MAX = ' + /var GDP_PROY_MAX = ([-\d.]+)/.exec(CALC)[1] + ';\n' +
  'var DIAS_ESTIMACION_DUDOSA = ' + /var DIAS_ESTIMACION_DUDOSA = (\d+)/.exec(CALC)[1] + ';\n' +
  ['_parseFecha','calcularDiasEntre','_ritmoAcumulado','calcularPesoHoy']
    .map(n => extraer(CALC, n)).join('\n') + '\n' +
  extraer(ANIM, 'gdpPromedioPredio')
);

let fallos = 0;
function check(cond, msg) { console.log((cond ? '  OK    ' : '  FALLA ') + msg); if (!cond) fallos++; }
const A = c => ANIMALES.filter(x => x.codigo === c)[0];
// Serie minima: calcularPesoHoy solo mira la ultima fila (peso y fecha).
const serie = c => MEDICIONES.filter(m => m.codigo === c)
  .map(m => ({ peso: m.peso, fecha: m.fecha }));

console.log('\n── El ritmo se mide hasta la FECHA DEL PESAJE, no hasta hoy ──────');
// Es el error central que este diseño evita. Del 10-ene al 1-sep hay 234 dias;
// hasta hoy (13-sep) serian 246. Dividir por 246 haria parecer al animal mas
// lento de lo que fue, y el error crece cuanto mas lleve sin pesarse.
const r80 = _ritmoAcumulado(180, '2026-01-10', 294.5, '2026-09-01');
console.log('   (294.5 - 180) / 234 d = ' + r80.toFixed(4));
check(calcularDiasEntre('2026-01-10','2026-09-01') === 234, 'del ingreso al ultimo pesaje hay 234 dias');
check(Math.abs(r80 - 114.5/234) < 1e-9, 'el ritmo usa 234 dias, no los 246 que van hasta hoy');
check(Math.abs(r80 - 0.4893) < 0.0005, 'da 0.489 kg/dia');

console.log('\n── El peso de hoy ───────────────────────────────────────────────');
let p = calcularPesoHoy(A('80'), serie('80'), '', HOY);
console.log('   ultimo pesaje ' + p.pesoMedido + ' kg el ' + p.fechaMedido +
            ' (hace ' + p.diasDesdeMedicion + ' d) -> hoy ' + p.pesoHoy + ' kg');
check(p.pesoMedido === 294.5,        'conserva el peso medido de verdad');
check(p.fechaMedido === '2026-09-01','y DICE de que dia es (era lo que faltaba)');
check(p.diasDesdeMedicion === 12,    'han pasado 12 dias');
check(p.pesoHoy === 300.4,           '294.5 + 0.489 x 12 = 300.4 kg');
check(p.ganancia === 5.9,            'son 5.9 kg estimados desde el pesaje');
check(p.ritmoOrigen === 'PROPIO',    'con su propio ritmo');
check(p.confiable === true,          'y es de fiar: hace solo 12 dias');

console.log('\n── Un animal recien pesado hoy no se estima de mas ───────────────');
MEDICIONES.push({ codigo:'80', fecha:HOY, peso:300 });
p = calcularPesoHoy(A('80'), serie('80'), '', HOY);
check(p.diasDesdeMedicion === 0 && p.pesoHoy === 300,
  'pesado hoy -> el estimado es exactamente el medido, sin sumar nada');
reset();

console.log('\n── El que PIERDE peso cae al promedio del predio ─────────────────');
const prom = gdpPromedioPredio('LA SIERRA');
console.log('   promedio LA SIERRA = ' + prom + ' kg/dia');
// Solo 80 (0.4893) y 81 (0.5128) entran. 82 pierde, 83 no tiene pesajes,
// 90 es de otro predio y 91 esta muerto.
check(Math.abs(prom - (114.5/234 + 120/234) / 2) < 0.001,
  'promedia SOLO a los dos que ganan (80 y 81)');
check(prom > 0, 'y por tanto es positivo aunque en el predio haya animales perdiendo');

p = calcularPesoHoy(A('82'), serie('82'), prom, HOY);
console.log('   82 pierde (-30 kg) -> se le estima con ' + p.ritmo + ' kg/dia del predio');
check(p.ritmoOrigen === 'PREDIO',  'el que pierde usa el ritmo del predio');
check(p.ritmo === prom,            'exactamente el promedio del predio');
check(p.pesoHoy > p.pesoMedido,    'y no se le proyecta mas perdida hacia adelante');

console.log('\n── Un animal sin ningun pesaje ──────────────────────────────────');
p = calcularPesoHoy(A('83'), [], prom, HOY);
check(p.ritmoOrigen === 'PREDIO',     'se estima con el predio');
check(p.pesoMedido === 190,           'partiendo del peso de entrada');
check(p.fechaMedido === '2026-01-10', 'y de la fecha de ingreso');
check(p.confiable === false,          'marcada como poco confiable: hace 246 dias');

console.log('\n── Si en el predio no gana NADIE, no se inventa nada ─────────────');
p = calcularPesoHoy(A('82'), serie('82'), '', HOY);
check(p.ritmoOrigen === 'NINGUNO', 'sin respaldo, el origen es NINGUNO');
check(p.ritmo === 0,               'el ritmo es cero');
check(p.pesoHoy === p.pesoMedido,  'y el estimado es el ultimo peso conocido, sin adornos');
check(gdpPromedioPredio('PREDIO QUE NO EXISTE') === '', 'un predio sin animales no da promedio');

console.log('\n── Lo que NO se estima ──────────────────────────────────────────');
check(calcularPesoHoy({ estado:'MUERTO', peso_inicial:180, fecha_ingreso:'2026-01-10' }, serie('80'), '', HOY) === null,
  'un animal MUERTO no tiene peso de hoy');
check(calcularPesoHoy({ estado:'VENDIDO', peso_inicial:180, fecha_ingreso:'2026-01-10' }, serie('80'), '', HOY) === null,
  'uno VENDIDO tampoco');
check(calcularPesoHoy({ estado:'ACTIVO', peso_inicial:'', fecha_ingreso:'2026-01-10' }, [], '', HOY) === null,
  'sin peso de entrada no hay de donde partir');
check(calcularPesoHoy({ estado:'ACTIVO', peso_inicial:0, fecha_ingreso:'2026-01-10' }, [], '', HOY) === null,
  'un peso de entrada en cero tampoco sirve');
check(calcularPesoHoy(null, [], '', HOY) === null, 'sin animal devuelve null en vez de reventar');

console.log('\n── El tope biologico ────────────────────────────────────────────');
// Un pesaje disparatado no puede convertirse en una estimacion disparatada.
const loco = { codigo:'X', predio:'LA SIERRA', estado:'ACTIVO', peso_inicial:100, fecha_ingreso:'2026-09-01' };
p = calcularPesoHoy(loco, [{ peso:900, fecha:'2026-09-11' }], '', HOY);
console.log('   ritmo real ' + p.ritmoPropio + ' kg/dia -> se usa ' + p.ritmo);
check(p.ritmoPropio === 80, 'el ritmo real seria 80 kg/dia (dato absurdo)');
check(p.ritmo === GDP_PROY_MAX, 'se acota al mismo tope que ya usan las proyecciones a 30/60/90 d');

console.log('\n── El aviso por antiguedad ──────────────────────────────────────');
const viejo = { codigo:'V', predio:'LA SIERRA', estado:'ACTIVO', peso_inicial:180, fecha_ingreso:'2026-01-10' };
check(calcularPesoHoy(viejo, [{ peso:250, fecha:'2026-08-29' }], '', HOY).confiable === true,
  'a 15 dias todavia es de fiar');
check(calcularPesoHoy(viejo, [{ peso:250, fecha:'2026-07-30' }], '', HOY).confiable === false,
  'a 45 dias deja de serlo');

console.log('\n── Una medicion con fecha futura no resta ───────────────────────');
p = calcularPesoHoy(viejo, [{ peso:250, fecha:'2026-12-01' }], '', HOY);
check(p.diasDesdeMedicion === 0 && p.pesoHoy === 250,
  'no se proyecta hacia atras: se muestra el peso tal cual');

console.log('\n' + (fallos === 0 ? '  TODAS LAS COMPROBACIONES PASAN' : '  ' + fallos + ' FALLOS'));
process.exit(fallos === 0 ? 0 : 1);
