// Prueba la logica REAL de tareas.js: extrae las funciones del archivo y las
// corre contra hojas simuladas. No reimplementa nada — eso solo probaria la copia.
const fs = require('fs');
const src = fs.readFileSync(
  require('path').resolve(__dirname,'..','..','server','domain','tareas.js'), 'utf8');

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

const HOY = '2026-09-15';

// ── Hojas simuladas ───────────────────────────────────────────────────────
const PREDIOS = [{ id_predio:'PRE-1', nombre:'LA SIERRA', activo:'SI' }];
const LOTES   = [{ id_lote:'LOT-1', id_predio:'PRE-1', nombre:'Lote 3', activo:'SI' },
                 { id_lote:'LOT-2', id_predio:'PRE-1', nombre:'3',      activo:'SI' }];

function T(id, act, fecha, estado, extra) {
  return Object.assign({ id_tarea:id, id_predio:'PRE-1', id_lote:'LOT-1', actividad:act,
    descripcion:'', responsable:'Jairo', fecha_programada:fecha, fecha_ejecucion:'',
    estado:estado, motivo:'', observacion:'', id_origen:'', origen_tipo:'',
    creada_el:'2026-09-01' }, extra || {});
}

const TAREAS = [
  // Cadena de reprogramacion: no se hizo el 10 (lluvia) -> se rehace el 14
  T('T1','Guadañar','2026-09-10','NO_EJECUTADA',{ motivo:'Lluvia' }),
  T('T2','Guadañar','2026-09-14','REALIZADA',{ fecha_ejecucion:'2026-09-14',
      id_origen:'T1', origen_tipo:'REPROGRAMACION' }),
  // Repeticion nacida al cerrar T2: NO debe marcar a T2 como reprogramada
  T('T3','Guadañar','2026-10-29','PROGRAMADA',{ id_origen:'T2', origen_tipo:'REPETICION' }),
  // Programada con fecha pasada -> PENDIENTE deducida
  T('T4','Fumigar','2026-09-08','PROGRAMADA'),
  // Programada a futuro -> ni pendiente ni atrasada
  T('T5','Abonar','2026-09-20','PROGRAMADA'),
  // No ejecutada SIN sucesora -> es la que no puede perderse
  T('T6','Machetear','2026-08-02','NO_EJECUTADA',{ motivo:'Emergencia' }),
  // Cancelada -> nunca atrasada
  T('T7','Riego','2026-08-05','CANCELADA',{ motivo:'Ya no aplica' }),
];

global.getAll = function(h) {
  return h === 'tareas' ? TAREAS : h === 'predios' ? PREDIOS : h === 'lotes' ? LOTES : [];
};
global.findOne = function(h, f, v) { return global.getAll(h).filter(r => r[f] === v)[0] || null; };
// Borrar de verdad toca la hoja: se simula para poder comprobar que las reglas
// frenan ANTES de llegar aqui, y no despues de haber borrado.
const BORRADAS = [];
global.deleteRecord = function(h, f, v) {
  const i = TAREAS.findIndex(r => r[f] === v);
  if (i < 0) return false;
  BORRADAS.push(TAREAS.splice(i, 1)[0].id_tarea);
  return true;
};
global.Utilities = { formatDate: (d) => {
  const p = n => String(n).padStart(2,'0');
  return d.getFullYear() + '-' + p(d.getMonth()+1) + '-' + p(d.getDate());
}};
global.Session = { getScriptTimeZone: () => 'America/Bogota' };

// _hoyTarea se fija para que la prueba no dependa del dia en que se corra.
global._hoyTarea = () => HOY;

// Un solo eval en el ambito del modulo: dentro de un callback las funciones
// quedarian encerradas en el y no se verian desde aqui.
eval(
  'var ACTIVIDADES_TAREA = ' + /var ACTIVIDADES_TAREA = (\[[\s\S]*?\]);/.exec(src)[1] + ';\n' +
  ['_esFechaISO','_diasEntre','_sumarDias','_normPrioridad','_fmtDia','_indexarSucesoras','_enriquecerTarea','_mapear',
   'listPrediosLotes','getTareasCalendario','getHistorialLote','getTarea','eliminarTarea','getTablero'].map(extraer).join('\n')
);

let fallos = 0;
function check(cond, msg) { console.log((cond ? '  OK    ' : '  FALLA ') + msg); if (!cond) fallos++; }

console.log('\n── Estados deducidos ────────────────────────────────────────────');
const cal = getTareasCalendario({ anio:2026, mes:9 });
// Indice sobre AMBAS listas: T6 es de agosto, asi que no esta en la rejilla de
// septiembre — aparece solo en la franja de atrasadas, que es justo lo correcto.
const por = {};
cal.tareas.concat(cal.atrasadas).forEach(t => por[t.id_tarea] = t);

check(por.T4.pendiente === true,  'T4 programada con fecha pasada -> PENDIENTE');
check(por.T5.pendiente === false, 'T5 programada a futuro -> NO pendiente');
check(por.T1.reprogramada === true,  'T1 no ejecutada con sucesora -> REPROGRAMADA');
check(por.T1.sucesora_fecha === '2026-09-14', 'T1 sabe a que fecha se movio');
check(por.T6.reprogramada === false, 'T6 no ejecutada sin sucesora -> NO reprogramada');

console.log('\n── El error que motivo origen_tipo ──────────────────────────────');
check(por.T2.reprogramada === false,
  'T2 se REALIZO y engendro una REPETICION -> NO debe figurar como reprogramada');

console.log('\n── Franja de atrasadas ──────────────────────────────────────────');
const ids = cal.atrasadas.map(t => t.id_tarea).sort();
console.log('   atrasadas: ' + ids.join(', '));
check(ids.indexOf('T4') >= 0, 'incluye la pendiente (T4)');
check(ids.indexOf('T6') >= 0, 'incluye la no ejecutada sin reprogramar (T6), de AGOSTO');
check(ids.indexOf('T1') < 0,  'excluye la ya reprogramada (T1) — la lleva su sucesora');
check(ids.indexOf('T7') < 0,  'excluye la cancelada (T7)');
check(ids.indexOf('T5') < 0,  'excluye la programada a futuro (T5)');

console.log('\n── El mes solo trae su mes ──────────────────────────────────────');
check(cal.tareas.every(t => t.fecha_programada.substring(0,7) === '2026-09'),
  'ninguna tarea de otro mes se cuela en la rejilla');
check(cal.tareas.length === 4, 'las 4 de septiembre (T3 es de octubre; T6 y T7 de agosto)');

console.log('\n── Nombres legibles ─────────────────────────────────────────────');
check(por.T1.predio_nombre === 'LA SIERRA', 'resuelve el nombre del predio');
check(por.T1.lote_nombre === 'Lote 3',      'resuelve el nombre del lote');

console.log('\n── Historial del lote ───────────────────────────────────────────');
const h = getHistorialLote('LOT-1');
const g = h.porActividad.filter(a => a.actividad === 'Guadañar')[0];
console.log('   Guadañar: ' + g.veces + ' vez/veces · ultima ' + g.ultimaEjecucion +
            ' (hace ' + g.diasDesde + ' d) · proxima ' + g.proximaProgramada);
check(g.veces === 1,                        'cuenta solo las realizadas');
check(g.ultimaEjecucion === '2026-09-14',   'la ultima ejecucion es la real, no la programada');
check(g.diasDesde === 1,                    'dice cuantos dias hace');
check(g.proximaProgramada === '2026-10-29', 'sabe cuando toca de nuevo');
const m = h.porActividad.filter(a => a.actividad === 'Machetear')[0];
check(m.pendientes === 1, 'Machetear figura con 1 pendiente');

console.log('\n── Un lote llamado "3" no se confunde con el numero ─────────────');
check(findOne('lotes','id_lote','LOT-2').nombre === '3', 'el lote "3" existe con ese nombre');
check(getHistorialLote('LOT-2').ok === true, 'su historial se puede pedir sin error');

console.log('\n── Prioridad ────────────────────────────────────────────────────');
// Las tareas del fixture no traen la columna: son las que ya existian antes de
// que la columna se creara, y tienen que leerse como NORMAL, no como vacio.
check(por.T4.prioridad === 'NORMAL',  'una tarea sin la columna se lee NORMAL');
check(_normPrioridad('urgente') === 'URGENTE', 'acepta la palabra en minusculas');
check(_normPrioridad('')        === 'NORMAL',  'vacio es NORMAL');
check(_normPrioridad('ALTA')    === 'NORMAL',  'cualquier otra cosa cae en NORMAL');

console.log('\n── Traer una tarea suelta ───────────────────────────────────────');
// Esto es lo que evita que el formulario se abra en blanco cuando la tarea no
// esta en el mes cargado: T6 es de agosto y no sale en la rejilla de septiembre.
check(getTarea('T6').ok === true,                        'trae una tarea de otro mes');
check(getTarea('T6').data.actividad === 'Machetear',     'con sus datos completos');
check(getTarea('T6').data.predio_nombre === 'LA SIERRA', 'y con los nombres ya resueltos');
check(getTarea('NO-EXISTE').ok === false,                'una que no existe da error, no un formulario vacio');

console.log('\n── El tablero: columnas por CUANDO TOCA ─────────────────────────');
// Se anaden aqui y no en el fixture de arriba porque las comprobaciones del
// calendario cuentan cuantas tareas trae septiembre; meterlas antes las romperia.
TAREAS.push(T('T20','Riego','2026-09-15','PROGRAMADA',{ prioridad:'URGENTE' }));
TAREAS.push(T('T21','Cercas','2026-09-15','PROGRAMADA'));

const tb = getTablero({});
const cols = tb.columnas;
const en = k => cols[k].map(t => t.id_tarea).sort().join(',');
console.log('   atrasadas: ' + en('atrasadas') + '  | hoy: ' + en('hoy') +
            '  | semana: ' + en('semana') + '  | adelante: ' + en('adelante'));

check(en('atrasadas') === 'T4,T6', 'atrasadas = la pendiente (T4) y la no ejecutada sin fecha nueva (T6)');
check(en('hoy')       === 'T20,T21', 'hoy = solo lo programado para el dia de hoy');
check(en('semana')    === 'T5',    'esta semana = lo de los proximos 7 dias (T5, el 20)');
check(en('adelante')  === 'T3',    'mas adelante = lo que cae despues (T3, el 29 de octubre)');

// Las tres reglas que evitan que el tablero mienta:
check(cols.atrasadas.every(t => t.id_tarea !== 'T1'),
  'la ya reprogramada (T1) NO figura atrasada: alguien ya decidio cuando se rehace');
check(Object.keys(cols).every(k => cols[k].every(t => t.id_tarea !== 'T7')),
  'la cancelada (T7) no aparece en ninguna columna');
check(tb.hechas.map(t => t.id_tarea).join() === 'T2',
  'lo hecho hace poco va aparte (T2), no mezclado con lo que falta');

check(cols.hoy[0].id_tarea === 'T20', 'lo urgente sale de primero dentro de su columna');
check(tb.resumen.urgentes === 1 && tb.resumen.abiertas === 6,
  'el resumen cuenta 1 urgente y 6 tareas abiertas');

// El limite de "esta semana" cae en el dia 7 y se cuenta desde hoy, no desde
// el lunes: asi la semana nunca se queda vacia por el dia en que se mire.
check(_sumarDias('2026-09-15', 7) === '2026-09-22', 'la semana llega hasta 7 dias despues');

console.log('\n── Borrar: solo lo que no cuenta ninguna historia ───────────────');
check(eliminarTarea({ id_tarea:'T2' }).ok === false, 'una REALIZADA no se borra: es el historial');
check(eliminarTarea({ id_tarea:'T6' }).ok === false, 'una NO_EJECUTADA tampoco');
check(eliminarTarea({ id_tarea:'T1' }).ok === false, 'ni una de la que ya colgo otra (T2 la sucede)');
check(BORRADAS.length === 0,                         'ninguna de esas llego a tocar la hoja');
check(eliminarTarea({ id_tarea:'T5' }).ok === true,  'una PROGRAMADA a futuro si se borra');
check(BORRADAS.join() === 'T5',                      'y se borro exactamente esa');
check(eliminarTarea({ id_tarea:'T5' }).ok === false, 'borrarla dos veces avisa en vez de reventar');

console.log('\n' + (fallos === 0 ? '  TODAS LAS COMPROBACIONES PASAN' : '  ' + fallos + ' FALLOS'));
process.exit(fallos === 0 ? 0 : 1);
