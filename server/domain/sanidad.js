// ════════════════════════════════════════════════════════════════════════
//  sanidad.gs — Eventos sanitarios (vacunas, tratamientos, etc.)
// ════════════════════════════════════════════════════════════════════════

// Destinatarios adicionales de notificaciones sanitarias.
// El dueño del script se agrega automáticamente; aquí van los extras.
var NOTIF_EMAILS_EXTRA = [];

// Reglas de seguimiento automático: cuando se registra el tipo, si no hay proxima_fecha
// se calcula automáticamente según el protocolo sanitario.
var _REGLAS_SEGUIMIENTO = {
  'CARBÓN SINTOMÁTICO':  { dias: 21,  proxTipo: 'CARBÓN BACTERIDIANO' },
  'CARBÓN BACTERIDIANO': { dias: 180, proxTipo: 'CARBÓN SINTOMÁTICO'  },
  'AFTOSA':              { dias: 180, proxTipo: 'AFTOSA'               },
  'DESPARASITANTE':      { dias: 90,  proxTipo: 'DESPARASITANTE'       },
  'VITAMINA':            { dias: 90,  proxTipo: 'VITAMINA'             },
  'PURGA ORAL':          { dias: 90,  proxTipo: 'PURGA ORAL'           },
  'PURGA SUBCUTÁNEA':    { dias: 90,  proxTipo: 'PURGA SUBCUTÁNEA'     },
  'BAÑAR':               { dias: 21,  proxTipo: 'BAÑAR'                }
};

function saveEventoSanitario(payload) {
  payload = payload || {};
  if (!payload.codigo) return { ok: false, error: 'El código del animal es obligatorio.' };
  if (!payload.fecha)  return { ok: false, error: 'La fecha es obligatoria.' };
  if (!payload.tipo)   return { ok: false, error: 'El tipo de evento es obligatorio.' };

  var animal = findOne('animales', 'codigo', payload.codigo);
  if (!animal) return { ok: false, error: 'Animal no encontrado.' };

  // Calcular proxima_fecha solo si el usuario pidió seguimiento explícitamente
  var proximaFecha = payload.proxima_fecha || '';
  if (payload.requiere_seguimiento === 'si') {
    if (!proximaFecha) {
      var regla = _REGLAS_SEGUIMIENTO[payload.tipo];
      if (regla) {
        var base = new Date(payload.fecha);
        base.setDate(base.getDate() + regla.dias);
        proximaFecha = Utilities.formatDate(base, Session.getScriptTimeZone(), 'yyyy-MM-dd');
      }
    }
  } else {
    // Sin seguimiento explícito: no crear fecha automática
    proximaFecha = '';
  }

  var evento = {
    id_evento:           generarId('SAN'),
    codigo:              payload.codigo,
    fecha:               payload.fecha,
    tipo:                payload.tipo,
    medicamento:         payload.medicamento         || '',
    dosis:               payload.dosis               || '',
    responsable:         payload.responsable         || '',
    proxima_fecha:       proximaFecha,
    observacion:         payload.observacion         || '',
    estado_reproductivo: payload.estado_reproductivo || '',
    desarrollo_ovarico:  payload.desarrollo_ovarico  || ''
  };

  insert('sanidad', evento);
  // Nota: ya NO se envía un correo por cada evento (eso generaba 30 correos al
  // registrar 30 seguimientos). En su lugar, el trigger EnviarResumenRegistrosDelDia
  // manda UN solo correo al final del día con todo lo registrado (ver Triggers.gs).
  return { ok: true, data: evento, proxima_fecha: proximaFecha };
}

// Registra el MISMO evento sanitario para varios animales de una sola vez.
// payload = { codigos: [...], evento: { fecha, tipo, medicamento, dosis, responsable,
//             observacion, proxima_fecha, requiere_seguimiento } }
// Reutiliza saveEventoSanitario por animal (misma validación y cálculo de seguimiento).
function saveEventosSanitariosLote(payload) {
  payload = payload || {};
  var codigos = payload.codigos || [];
  var base    = payload.evento  || {};
  if (!codigos.length) return { ok: false, error: 'Selecciona al menos un animal.' };
  if (!base.fecha)     return { ok: false, error: 'La fecha es obligatoria.' };
  if (!base.tipo)      return { ok: false, error: 'El tipo de evento es obligatorio.' };

  var total = 0, errores = [];
  codigos.forEach(function(cod) {
    var p = {};
    Object.keys(base).forEach(function(k) { p[k] = base[k]; });
    p.codigo = cod;
    try {
      var r = saveEventoSanitario(p);
      if (r && r.ok) total++; else errores.push(cod);
    } catch (e) { errores.push(cod); }
  });
  return { ok: errores.length === 0, total: total, errores: errores };
}

// ⚠️ DORMIDA — actualmente NADIE la llama. Se dejó de enviar un correo por cada
// evento (generaba decenas de correos al registrar seguimientos en lote); ese aviso
// lo cubre ahora el trigger diario EnviarResumenRegistrosDelDia (ver Triggers.gs).
// Se conserva intacta por si se quiere reactivar el correo por-evento individual.
function _notificarNuevoEvento(animal, evento) {
  try {
    var owner = Session.getEffectiveUser().getEmail();
    var dest  = [owner].concat(NOTIF_EMAILS_EXTRA).filter(Boolean).join(',');
    if (!dest) return;

    var appUrl = '';
    try { appUrl = ScriptApp.getService().getUrl(); } catch(e) {}

    var asunto = '💉 Evento sanitario — ' + evento.codigo + ' · ' + evento.tipo;

    var filas = [
      ['Animal',        evento.codigo],
      ['Tipo de evento', evento.tipo],
      ['Fecha',         evento.fecha]
    ];
    if (evento.medicamento) filas.push(['Medicamento', evento.medicamento]);
    if (evento.dosis)       filas.push(['Dosis',       evento.dosis]);
    if (evento.responsable) filas.push(['Responsable', evento.responsable]);
    if (evento.proxima_fecha) filas.push(['📅 Próximo seguimiento', evento.proxima_fecha]);
    if (evento.observacion) filas.push(['Observación', evento.observacion]);

    var filasHtml = filas.map(function(f) {
      return '<tr><td style="padding:8px 12px;color:#6b7280;font-size:13px;white-space:nowrap">' + f[0] + '</td>' +
             '<td style="padding:8px 12px;font-weight:600;font-size:13px;color:#111827">' + f[1] + '</td></tr>';
    }).join('');

    var htmlBody =
      '<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto">' +
        '<div style="background:#14532d;padding:22px 24px;border-radius:10px 10px 0 0">' +
          '<p style="color:#86efac;margin:0 0 4px;font-size:12px;text-transform:uppercase;letter-spacing:.05em">Gestión Ganadera</p>' +
          '<h2 style="color:#fff;margin:0;font-size:20px">💉 Evento sanitario registrado</h2>' +
        '</div>' +
        '<div style="background:#f9fafb;border:1px solid #e5e7eb;border-top:none;padding:24px;border-radius:0 0 10px 10px">' +
          '<table style="width:100%;border-collapse:collapse;background:#fff;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb">' +
            filasHtml +
          '</table>' +
          (appUrl ? '<div style="margin-top:20px;text-align:center">' +
            '<a href="' + appUrl + '#/animal/' + evento.codigo + '" ' +
               'style="background:#15803d;color:#fff;padding:10px 24px;border-radius:8px;text-decoration:none;font-size:13px;font-weight:600">' +
              'Ver ficha del animal →' +
            '</a></div>' : '') +
          '<p style="margin:20px 0 0;font-size:11px;color:#9ca3af;text-align:center">Mensaje automático — Gestión Ganadera</p>' +
        '</div>' +
      '</div>';

    disabledMail({ to: dest, subject: asunto, htmlBody: htmlBody });
  } catch(e) {
    // No interrumpir el flujo si el correo falla
    Logger.log('Error enviando email evento sanitario: ' + e.message);
  }
}

function deleteEventoSanitario(idEvento) {
  return { ok: deleteRecord('sanidad', 'id_evento', idEvento) };
}

// Elimina varios eventos sanitarios de una vez. Lo usa la vista Sanidad para
// borrar todos los procedimientos que se registraron a un animal el mismo día
// (que en la tabla se muestran agrupados en un solo renglón).
function deleteEventosSanitarios(ids) {
  ids = ids || [];
  var total = 0;
  ids.forEach(function(id) {
    try { if (deleteRecord('sanidad', 'id_evento', id)) total++; } catch (e) {}
  });
  return { ok: true, total: total };
}

function getEventosAnimal(codigo) {
  return findMany('sanidad', 'codigo', codigo)
    .sort(function(a, b) { return new Date(b.fecha) - new Date(a.fecha); });
}

// ¿El recordatorio (proxima_fecha) de este evento ya fue cumplido por otro evento
// posterior del mismo protocolo? Refleja la MISMA lógica que el frontend
// (App._recordatorioCumplido) para que la vista Sanidad y la agenda del Dashboard
// muestren lo mismo: un seguimiento ya atendido no debe seguir alarmando.
// El "mismo protocolo" = el propio tipo o su proxTipo en _REGLAS_SEGUIMIENTO
// (p. ej. Carbón sintomático se atiende con Carbón bacteridiano).
function _recordatorioCumplido(evento, eventosAnimal) {
  if (!evento.proxima_fecha) return false;
  var prox = new Date(evento.proxima_fecha);
  if (isNaN(prox.getTime())) return false;
  var desde = new Date(prox); desde.setDate(desde.getDate() - 7);
  var hasta = new Date(prox); hasta.setDate(hasta.getDate() + 60);
  var tiposOk = {}; tiposOk[evento.tipo] = true;
  var regla = _REGLAS_SEGUIMIENTO[evento.tipo];
  if (regla && regla.proxTipo) tiposOk[regla.proxTipo] = true;
  var lista = eventosAnimal || [];
  for (var i = 0; i < lista.length; i++) {
    var e = lista[i];
    if (e.id_evento === evento.id_evento) continue;
    if (!tiposOk[e.tipo]) continue;
    var f = new Date(e.fecha);
    if (isNaN(f.getTime())) continue;
    if (f >= desde && f <= hasta) return true;
  }
  return false;
}

// Alertas sanitarias: eventos con proxima_fecha dentro de los próximos N días,
// EXCLUYENDO los recordatorios ya cumplidos por un evento posterior.
function getAlertasSanitarias(diasAviso) {
  diasAviso = diasAviso || 7;
  var limite = new Date();
  limite.setDate(limite.getDate() + diasAviso);

  var todos = getAll('sanidad');
  // Agrupar por animal para poder detectar recordatorios ya cumplidos.
  var porAnimal = {};
  todos.forEach(function(e) { (porAnimal[e.codigo] = porAnimal[e.codigo] || []).push(e); });

  return todos.filter(function(e) {
    if (!e.proxima_fecha || e.proxima_fecha === '') return false;
    if (new Date(e.proxima_fecha) > limite) return false;
    return !_recordatorioCumplido(e, porAnimal[e.codigo]);
  }).sort(function(a, b) { return new Date(a.proxima_fecha) - new Date(b.proxima_fecha); });
}

// Retorna todos los eventos sanitarios para la vista de historial.
// Incluye id_evento para permitir eliminación desde el panel.
function getHistorialSanitario() {
  var hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  return getAll('sanidad')
    .sort(function(a, b) { return new Date(b.fecha) - new Date(a.fecha); })
    .map(function(e) {
      var vencida = e.proxima_fecha && new Date(e.proxima_fecha) < hoy;
      return {
        id_evento:           e.id_evento,
        codigo:              e.codigo,
        fecha:               e.fecha,
        tipo:                e.tipo,
        medicamento:         e.medicamento         || '',
        dosis:               e.dosis               || '',
        responsable:         e.responsable         || '',
        proxima_fecha:       e.proxima_fecha        || '',
        observacion:         e.observacion          || '',
        estado_reproductivo: e.estado_reproductivo  || '',
        desarrollo_ovarico:  e.desarrollo_ovarico   || '',
        vencida:             vencida
      };
    });
}
