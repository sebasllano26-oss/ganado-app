// Corregir una medicion ya guardada.
// Extrae editarMedicion() del propio mediciones.js y la corre contra una hoja
// simulada. No reimplementa la logica: eso solo probaria la copia.
//   node docs/tests/test_mediciones.js
const fs = require('fs');
const src = fs.readFileSync(
  require('path').resolve(__dirname, '..', '..', 'server','domain', 'mediciones.js'), 'utf8');

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

// ── Hoja simulada ─────────────────────────────────────────────────────────
// Tres pesajes de un mismo animal. HOY es 2026-09-15 para que la prueba no
// dependa del dia en que se corra.
const HOY = new Date(2026, 8, 15);
const ANIMALES = [{ codigo:'80', peso_inicial:180, fecha_ingreso:'2026-01-10', tipo:'NOVILLO' }];
let MEDS;
function reset() {
  MEDS = [
    { id_medicion:'M1', codigo:'80', fecha:'2026-03-01', peso:220, observacion:'' },
    { id_medicion:'M2', codigo:'80', fecha:'2026-06-01', peso:265, observacion:'primera' },
    { id_medicion:'M3', codigo:'80', fecha:'2026-09-01', peso:294.5, observacion:'' }
  ];
}
reset();

global.findOne = function(h, f, v) {
  const t = h === 'animales' ? ANIMALES : MEDS;
  return t.filter(r => String(r[f]) === String(v))[0] || null;
};
global.findMany = function(h, f, v) {
  const t = h === 'animales' ? ANIMALES : MEDS;
  return t.filter(r => String(r[f]) === String(v));
};
let ESCRITURAS = 0;
global.update = function(h, f, v, campos) {
  const fila = global.findOne(h, f, v);
  if (!fila) return false;
  Object.keys(campos).forEach(k => fila[k] = campos[k]);
  ESCRITURAS++;
  return true;
};
global._parseFecha = function(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v || ''));
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
};
// La cascada y la reclasificacion tienen su propia logica en Calculo.js y
// Clasificacion.js; aqui se simulan para poder aislar lo que decide
// editarMedicion: que entra a la hoja y que se rechaza.
let CASCADAS = 0;
global._recalcularSerieAnimal = function() { CASCADAS++; return { actualizadas: 2 }; };
global.reclasificarAnimal = function(a, o) { return o.pesoActual > 280 ? 'NOVILLO' : null; };
global._advertenciasDe = function() { return []; };

// El reloj se fija: sin esto "no puede ser futura" cambiaria de resultado
// segun el dia en que corran las pruebas.
const RealDate = Date;
global.Date = class extends RealDate {
  constructor(...a) { return a.length ? new RealDate(...a) : new RealDate(HOY); }
  static now() { return HOY.getTime(); }
};

eval(extraer('editarMedicion'));

let fallos = 0;
function check(cond, msg) { console.log((cond ? '  OK    ' : '  FALLA ') + msg); if (!cond) fallos++; }

console.log('\n── Corregir un peso mal anotado ─────────────────────────────────');
let r = editarMedicion({ id_medicion:'M2', fecha:'2026-06-01', peso:275 });
check(r.ok === true, 'acepta el cambio de peso');
check(global.findOne('mediciones','id_medicion','M2').peso === 275, 'el peso nuevo queda en la hoja');
check(CASCADAS === 1, 'recalcula la cadena del animal: el GDP de la siguiente depende de este dato');
check(r.cascada.actualizadas === 2, 'y dice cuantas filas se rehicieron');

console.log('\n── Corregir la fecha ────────────────────────────────────────────');
reset(); CASCADAS = 0;
r = editarMedicion({ id_medicion:'M2', fecha:'2026-06-10', peso:265 });
check(r.ok === true, 'acepta el cambio de fecha');
check(global.findOne('mediciones','id_medicion','M2').fecha === '2026-06-10', 'la fecha nueva queda guardada');

console.log('\n── Guardar SIN cambiar la fecha no debe chocar consigo mismo ────');
reset();
r = editarMedicion({ id_medicion:'M2', fecha:'2026-06-01', peso:270 });
check(r.ok === true, 'la propia fila no cuenta como duplicado (era el error facil de cometer)');

console.log('\n── Lo que NO puede entrar ───────────────────────────────────────');
reset(); ESCRITURAS = 0;
check(editarMedicion({ id_medicion:'M2', fecha:'2026-09-01', peso:270 }).ok === false,
  'dos pesajes el mismo dia se rechazan: el GDP quedaria sin definir');
check(editarMedicion({ id_medicion:'M2', fecha:'2026-12-01', peso:270 }).ok === false,
  'una fecha futura se rechaza, igual que al crear');
check(editarMedicion({ id_medicion:'M2', fecha:'2026-06-01', peso:0 }).ok === false,
  'peso cero se rechaza');
check(editarMedicion({ id_medicion:'M2', fecha:'2026-06-01', peso:'abc' }).ok === false,
  'peso ilegible se rechaza');
check(editarMedicion({ id_medicion:'M2', fecha:'', peso:270 }).ok === false,
  'sin fecha se rechaza');
check(editarMedicion({ id_medicion:'M2', fecha:'01/06/2026', peso:270 }).ok === false,
  'una fecha en otro formato se rechaza en vez de guardarse mal');
check(editarMedicion({ id_medicion:'NO-EXISTE', fecha:'2026-06-01', peso:270 }).ok === false,
  'una medicion que ya no existe avisa en vez de reventar');
check(ESCRITURAS === 0, 'NINGUNA de esas llego a tocar la hoja');

console.log('\n── La coma decimal, tambien aqui ────────────────────────────────');
reset();
r = editarMedicion({ id_medicion:'M2', fecha:'2026-06-01', peso:'294,5' });
check(r.ok === true && global.findOne('mediciones','id_medicion','M2').peso === 294.5,
  'un peso escrito con coma se guarda como 294.5, no se pierde');

console.log('\n── La observacion ───────────────────────────────────────────────');
reset();
editarMedicion({ id_medicion:'M2', fecha:'2026-06-01', peso:265, observacion:'  se remojo  ' });
check(global.findOne('mediciones','id_medicion','M2').observacion === 'se remojo',
  'se guarda sin los espacios de los lados');
reset();
editarMedicion({ id_medicion:'M2', fecha:'2026-06-01', peso:265 });
check(global.findOne('mediciones','id_medicion','M2').observacion === 'primera',
  'si no se manda, la que habia NO se borra');

console.log('\n── La categoria se decide con el peso mas RECIENTE ──────────────');
reset();
// Se corrige la del medio, no la ultima: la categoria debe seguir mirando a M3.
r = editarMedicion({ id_medicion:'M2', fecha:'2026-06-01', peso:200 });
check(r.reclasificado === 'NOVILLO',
  'aunque se edite una fila vieja, manda el peso de la ultima medicion (294.5)');

console.log('\n' + (fallos === 0 ? '  TODAS LAS COMPROBACIONES PASAN' : '  ' + fallos + ' FALLOS'));
process.exit(fallos === 0 ? 0 : 1);
