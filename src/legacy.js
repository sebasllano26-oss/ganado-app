// ════════════════════════════════════════════════════════════════════════
//  Scripts.html — Lógica SPA
//  PK del animal: codigo (ej. R3, Y1, AZ01) — no hay id_animal autogenerado
// ════════════════════════════════════════════════════════════════════════

var App = {
  // El PIN de Finanzas YA NO VIVE AQUÍ. Estaba escrito en esta línea y se
  // comparaba en el navegador, así que cualquiera que abriera la consola lo
  // leía. Ahora vive en las Propiedades del Script y lo comprueba el servidor
  // (seguridad.gs). El de antes, 1088, quedó público: no sirve como PIN nuevo.
  estado: {
    filtros:       { predio: '', lote: '', tipo: '', propietario: '', estado: '' },
    dashboardData: null,
    animalesLista: [],
    animalActual:  null,
    charts:        {},
    _cbSelector:   null   // callback temporal del selector de animales
  },

  init: function() {
    document.getElementById('footer-fecha').textContent = new Date().toLocaleDateString('es-CO');
    window.addEventListener('hashchange', App.rutear);
    document.querySelectorAll('.nav-link').forEach(function(l) {
      l.addEventListener('click', function() { App.closeSidebar(); });
    });
    App.rutear();
  },

  rutear: function() {
    var hash  = window.location.hash || '#/';
    var partes = hash.replace('#/', '').split('/');
    var view  = partes[0] || 'dashboard';
    var param = partes.slice(1).join('/') || null;  // el codigo puede tener caracteres especiales

    // Ventas y Finanzas ya no tienen entrada propia en la barra lateral: son
    // sub-pestañas de Para Venta, así que la que se resalta es esa. Sin esto la
    // barra quedaría sin nada marcado y parecería que estás fuera de la app.
    var NAV_PADRE = { ventas: 'salida', finanzas: 'salida', reportes: 'salida', facturas: 'salida', animal: 'animales',
                      predios: 'tareas', lote: 'tareas', lluvias: 'tareas', calendario: 'tareas' };
    var navActiva = NAV_PADRE[view] || view;
    document.querySelectorAll('.nav-link').forEach(function(l) {
      l.classList.toggle('active', l.getAttribute('data-view') === navActiva);
    });

    var titulos = {
      dashboard: 'Resumen', animales: 'Animales', animal: 'Ficha del Animal',
      tareas: 'Tareas', calendario: 'Calendario de tareas',
      predios: 'Predios y lotes', lote: 'Historial del lote',
      lluvias: 'Lluvias por finca',
      ventas: 'Ventas', sanidad: 'Sanidad', reportes: 'Reportes',
      finanzas: 'Finanzas', facturas: 'Facturas de gasto',
      situacion: 'Situación del Rebaño', salida: 'Para Venta',
      nacimientos: 'Nacimientos', planeacion: 'Planeación'
    };
    document.getElementById('topbar-title').textContent = titulos[view] || 'Dashboard';

    // "Nuevo animal" solo tiene sentido en Animales. En el resto de vistas cada
    // una ya trae su propio botón ("Nueva tarea", "Registrar lluvia"…), así que
    // en celular este se esconde: era el que partía el título en dos líneas.
    var _btnNuevo = document.getElementById('btn-nuevo-animal');
    if (_btnNuevo) _btnNuevo.classList.toggle('solo-en-animales', view !== 'animales');

    Object.values(App.estado.charts).forEach(function(c) { try { c.destroy(); } catch(e) {} });
    App.estado.charts = {};
    App._ocultarTip();   // si quedó un tooltip abierto al navegar, se cierra
    App._temaCharts();   // tooltips y tipografía de Chart.js según el tema activo (toda la app)

    switch(view) {
      case 'dashboard':  App.vistaDashboard();      break;
      case 'animales':   App.vistaAnimales();        break;
      case 'nacimientos':App.vistaNacimientos();      break;
      case 'animal':     App.vistaFicha(param);      break;
      case 'ventas':     App.vistaVentas();          break;
      case 'sanidad':    App.vistaSanidad();         break;
      case 'reportes':   App.vistaFinanzas();         break;  // reportes → finanzas
      case 'finanzas':   App.vistaFinanzas();         break;
      case 'facturas':   App.vistaFacturas();          break;
      case 'situacion':  App.vistaSituacion(param);   break;
      case 'planeacion': App.vistaPlaneacion();       break;
      case 'salida':     App.vistaSalida();           break;
      // El tablero es lo primero que se ve: responde "que me toca hoy".
      // El calendario sigue entero, a un toque de distancia.
      case 'tareas':     App.vistaTablero();         break;
      case 'calendario': App.vistaTareas();          break;
      case 'predios':    App.vistaPrediosLotes();    break;
      case 'lote':       App.vistaHistorialLote(param); break;
      case 'lluvias':    App.vistaLluvias();            break;
      default:           App.vistaDashboard();
    }
  },

  // ── API wrapper ──────────────────────────────────────────────────────
  api: function(fn, args, onSuccess, onError, opciones) {
    args = args || [];
    opciones = opciones || {};
    var terminado = false;
    App.mostrarLoading();

    var _mostrarError = function(titulo, detalle) {
      App.ocultarLoading();
      // Con `silencioso`, quien llama se encarga del error y aquí no se pinta
      // nada. Lo usa la pantalla del PIN: escribirlo mal es un dedazo, no una
      // avería, y no puede acabar en un "🚨 Error del servidor" a pantalla
      // completa delante de una persona mayor.
      if (opciones.silencioso) return;
      // Mostrar el error en pantalla completa para que sea visible
      document.getElementById('app-main').innerHTML =
        '<div class="flex flex-col items-center justify-center py-20 px-6 text-center">' +
          '<div class="text-5xl mb-4"><i class="ph ph-siren" aria-hidden="true"></i></div>' +
          '<h2 class="text-xl font-bold text-red-600 mb-2">' + titulo + '</h2>' +
          '<pre class="bg-red-50 border border-red-200 rounded-lg px-6 py-4 text-sm text-red-700 text-left max-w-2xl w-full whitespace-pre-wrap mb-4">' + detalle + '</pre>' +
          '<p class="text-gray-500 text-sm mb-6">Copia este error y compártelo para que lo puedan resolver.</p>' +
          '<button onclick="location.reload()" class="btn-primary px-8 py-3">↺ Recargar la página</button>' +
        '</div>';
    };

    // Timeout: 30 s para dar margen al cold-start de Apps Script
    var tid = setTimeout(function() {
      if (terminado) return;
      terminado = true;
      _mostrarError('La conexión tardó demasiado (30s)', 'Función llamada: ' + fn + '\n\nPosibles causas:\n• El script de Apps Script tiene un error\n• La Web App no fue republicada con los cambios\n• El script no tiene autorización\n\nSolución: Abre el editor de Apps Script, ejecuta la función DIAGNOSTICO() y comparte el resultado.');
      // Si no se pinta nada, hay que avisar a quien llamó: si no, se queda
      // mirando un spinner que ya no va a llegar a ninguna parte.
      if (opciones.silencioso) onError && onError(new Error('La conexión tardó demasiado.'));
    }, 30000);

    var runner = google.script.run
      .withSuccessHandler(function(r) {
        if (terminado) return;
        terminado = true;
        clearTimeout(tid);
        App.ocultarLoading();
        // Los umbrales vigentes viajan en la respuesta: se adoptan antes de pintar.
        if (r && r.params) App.params = r.params;
        onSuccess && onSuccess(r);
      })
      .withFailureHandler(function(e) {
        if (terminado) return;
        terminado = true;
        clearTimeout(tid);
        _mostrarError('Error del servidor en: ' + fn, (e.message || String(e)));
        onError && onError(e);
      });
    runner[fn].apply(runner, args);
  },

  mostrarLoading: function(msg) {
    document.getElementById('loading-msg').textContent = msg || 'Cargando…';
    document.getElementById('loading-global').classList.remove('hidden');
  },
  ocultarLoading: function() {
    document.getElementById('loading-global').classList.add('hidden');
  },
  toast: function(msg, tipo) {
    var el = document.createElement('div');
    el.className = 'toast toast-' + (tipo || 'success');
    el.textContent = msg;
    document.getElementById('toast-container').appendChild(el);
    setTimeout(function() { el.remove(); }, 3500);
  },
  abrirModal: function(html) {
    App.closeSidebar();
    document.getElementById('modal-content').innerHTML = html;
    document.getElementById('modal-overlay').classList.remove('hidden');
  },
  cerrarModal: function() {
    document.getElementById('modal-overlay').classList.add('hidden');
    document.getElementById('modal-content').innerHTML = '';
  },

  // ── Helpers ──────────────────────────────────────────────────────────
  // PARAMETROS DEL SISTEMA ---------------------------------------------
  // Llegan del backend con cada respuesta de getDashboardFull / getAnimal.
  // Lo de aqui es SOLO el respaldo por si una vista carga antes; es identico
  // a los defaults del backend, asi que sin params la app se ve igual.
  // REGLA: el frontend nunca decide un umbral. Lo consume.
  params: {
    gdpObjetivo: 0.40, gdpMinimo: 0.30,
    escala: { SUPERA: 0.48, CUMPLE: 0.40, CASI: 0.34, BAJO: 0.24 },
    crecMensualEsperado: 12.18, pesoTechoProyeccion: 650, pesoObjetivoVenta: 405
  },

  // Escala unica de rendimiento: un solo sitio define nombre, color y orden.
  // Antes habia tres escalas distintas y el mismo animal cambiaba de color
  // segun la pestana desde la que se mirara.
  GDP_ORDEN: ['SUPERA','CUMPLE','CASI','BAJO','CRITICO','SIN_DATOS'],
  // `hex` es el color de RELLENO en graficos (barras, dona): va sobre el lienzo
  // y solo necesita 3:1. `varTexto` es el color de TEXTO sobre tarjeta clara y
  // necesita 4.5:1, por eso apunta a un token que cambia con el tema. Antes
  // ambos usos compartian el hex brillante y el texto rendia ~2:1: ilegible a
  // pleno sol, que es justo donde se usa esta pantalla.
  GDP_INFO: {
    SUPERA:    { label:'Supera',    badge:'badge-green',  hex:'#2d6a4f', varTexto:'var(--gdp-supera)',     icon:'<i class="ph ph-trophy" aria-hidden="true"></i>' },
    CUMPLE:    { label:'Cumple',    badge:'badge-blue',   hex:'#3f665c', varTexto:'var(--gdp-cumple)',     icon:'<i class="ph ph-check-circle" aria-hidden="true"></i>' },
    CASI:      { label:'Casi',      badge:'badge-yellow', hex:'#b06a06', varTexto:'var(--gdp-casi)',       icon:'<i class="ph ph-chart-bar" aria-hidden="true"></i>' },
    BAJO:      { label:'Bajo',      badge:'badge-orange', hex:'#c05621', varTexto:'var(--gdp-bajo)',       icon:'<i class="ph ph-warning" aria-hidden="true"></i>' },
    CRITICO:   { label:'Crítico',   badge:'badge-red',    hex:'#a32e14', varTexto:'var(--gdp-critico)',    icon:'<i class="ph ph-siren" aria-hidden="true"></i>' },
    SIN_DATOS: { label:'Sin datos', badge:'badge-gray',   hex:'#8f8578', varTexto:'var(--gdp-sin-datos)',  icon:'<i class="ph ph-question" aria-hidden="true"></i>' }
  },
  // Misma logica que clasificarRendimiento() del backend, con los mismos cortes.
  clasificarGdp: function(gdp) {
    var g = parseFloat(gdp);
    if (gdp === '' || gdp === null || gdp === undefined || isNaN(g)) return '';
    var e = App.params.escala;
    return g >= e.SUPERA ? 'SUPERA' : g >= e.CUMPLE ? 'CUMPLE'
         : g >= e.CASI   ? 'CASI'   : g >= e.BAJO   ? 'BAJO' : 'CRITICO';
  },
  // OJO: textoGdp espera el GDP en kg/dia. Si ya tenes la clave del nivel
  // ('SUPERA', 'BAJO'...) usa hexNivel: pasarle la clave a una funcion que
  // clasifica devuelve el gris de SIN_DATOS sin avisar, porque
  // parseFloat('SUPERA') es NaN.
  hexNivel: function(key) {
    return (App.GDP_INFO[key] || App.GDP_INFO.SIN_DATOS).hex;
  },
  // Para pintar TEXTO. Devuelve un var() que sigue al tema, no un hex fijo.
  textoGdp: function(gdp) {
    var c = App.clasificarGdp(gdp);
    return (c ? App.GDP_INFO[c] : App.GDP_INFO.SIN_DATOS).varTexto;
  },
  // El rango se deriva del objetivo vigente; nunca se escribe a mano.
  descNivel: function(key) {
    var e = App.params.escala;
    if (key === 'SIN_DATOS') return 'Sin mediciones';
    if (key === 'CRITICO')   return '< ' + e.BAJO.toFixed(2) + ' kg/día';
    return '≥ ' + (e[key] !== undefined ? e[key].toFixed(2) : '?') + ' kg/día';
  },
  // Lee un token del tema. Los graficos NO deben tener colores escritos a mano:
  // cuando cambia la paleta, los que estan escritos se quedan atras sin avisar.
  _tok: function(nombre, respaldo) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(nombre);
    return (v || '').trim() || respaldo;
  },
  // crecMensualEsperado y pesoTechoProyeccion siguen llegando en App.params,
  // pero ya nadie los lee: alimentaban el "peso esperado" ideal, que se
  // sustituyo por la estimacion a ritmo real (calcularPesoHoy en Calculo.gs).

  badge: function(clasif) {
    var i = App.GDP_INFO[clasif];
    if (!i) return '<span class="badge badge-gray">' + (clasif || '—') + '</span>';
    return '<span class="badge ' + i.badge + '">' + i.label + '</span>';
  },

  // Texto explicativo de la alerta de una medición (tooltip ⚠ en la ficha).
  _alertaMedicionTxt: function(a) {
    switch (a) {
      case 'SIN_BASELINE':   return 'Sin peso/fecha de ingreso válidos: no hay punto de comparación para calcular GDP.';
      case 'FECHA_INVALIDA': return 'Fecha igual o anterior a otra medición: fila excluida del cálculo.';
      case 'GDP_ALTO':       return 'GDP superior a 1 kg/día: revisa el peso o la fecha.';
      case 'GDP_IMPOSIBLE':  return 'GDP físicamente imposible: revisa el peso o la fecha. No entra a promedios.';
      case 'DATO_INVALIDO':  return 'Peso o fecha ilegibles en esta fila.';
      default:               return a;
    }
  },

  // Pastilla teñida a partir de un token: texto en el color, fondo el mismo color
  // muy diluido. Así una insignia nueva no puede volver a nacer con un color claro
  // de Tailwind escrito a mano.
  _estiloPastilla: function(token) {
    return 'color:var(' + token + ');background:color-mix(in oklch,var(' + token + ') 16%,transparent);' +
           'border:1px solid color-mix(in oklch,var(' + token + ') 34%,transparent)';
  },

  _badgeReproductivo: function(estRepr) {
    if (!estRepr) return '';
    var mapa = {
      'Preñada':    { tk: '--ok',      icon: '<i class="ph ph-baby" aria-hidden="true"></i>' },
      'No preñada': { tk: '--muted',   icon: '○'  },
      'Dudosa':     { tk: '--warn',    icon: '<i class="ph ph-question" aria-hidden="true"></i>' },
      'En celo':    { tk: '--c-amber', icon: '<i class="ph ph-fire" aria-hidden="true"></i>' }
    };
    var b = mapa[estRepr];
    if (!b) return '<span class="text-xs" style="color:var(--muted)">' + estRepr + '</span>';
    return '<span class="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full" style="' + App._estiloPastilla(b.tk) + '">' + b.icon + ' ' + estRepr + '</span>';
  },

  _badgeDesOvar: function(desOvar) {
    if (!desOvar) return '';
    var mapa = {
      // Escala ORDINAL, no categorias sueltas: va de nada de actividad ovarica a
      // maxima. Por eso es una rampa cian -> azul -> violeta -> verde, y el estado
      // infantil se queda en gris: todavia no cicla, no es un color mas de la serie.
      'Infantil (anestro prepuberal)': { tk: '--muted',    short: 'Infantil'   },
      'Folículo presente':             { tk: '--c-cyan',   short: 'Fol. pres.' },
      'Folículo dominante':            { tk: '--c-blue',   short: 'Fol. dom.'  },
      'Cuerpo lúteo':                  { tk: '--c-violet', short: 'C. lúteo'   },
      'Folículos + cuerpo lúteo':      { tk: '--c-green',  short: 'Fol. + CL'  }
    };
    var b = mapa[desOvar];
    if (!b) return '<span class="text-xs" style="color:var(--muted)">' + desOvar + '</span>';
    return '<span class="inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full" style="' + App._estiloPastilla(b.tk) + '" title="' + desOvar + '">' + b.short + '</span>';
  },
  _badgeDescarte: function(estado) {
    if (!estado || estado === 'Pendiente') return '';
    if (estado === 'Marcado para descarte') return '<span class="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700"><i class="ph ph-scissors" aria-hidden="true"></i> Descarte</span>';
    return '<span class="text-xs text-gray-400">' + estado + '</span>';
  },

  fmt: function(n, dec) {
    if (n === '' || n === null || n === undefined) return '—';
    return parseFloat(n).toFixed(dec || 0);
  },
  // Fecha de hoy en yyyy-MM-dd segun el reloj LOCAL. No usar
  // toISOString(), que convierte a UTC: en Colombia (UTC-5) a partir de las
  // 19:00 devuelve el dia siguiente y los formularios se autocompletan mal.
  _hoyISO: function() { return App._fechaISO(new Date()); },
  _fechaISO: function(d) {
    if (!(d instanceof Date) || isNaN(d.getTime())) return '';
    var m = d.getMonth() + 1, dia = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (dia < 10 ? '0' : '') + dia;
  },

  // ── ENTRADA DE NÚMEROS ───────────────────────────────────────────────
  // <input type="number"> DESCARTA el valor cuando lleva coma decimal: al leer
  // .value devuelve CADENA VACÍA. Medido en el navegador:
  //     teclea "294,5"  ->  type=number: .value=""   parseFloat=NaN
  //                         type=text:   .value="294,5"  parseFloat=294.5
  // En Colombia la coma ES el separador decimal y el teclado del teléfono la
  // entrega, así que el peso se perdía en silencio y había que reintentar hasta
  // acertar a escribir un punto. El .replace(',','.') que había en el código
  // llegaba tarde: cuando corría, el valor ya se había perdido.
  //
  // Solución: campo de TEXTO con inputmode="decimal" (mismo teclado numérico en
  // el teléfono) y la normalización al leer.
  _numInput: function(id, opts) {
    opts = opts || {};
    return '<input type="text" inputmode="' + (opts.entero ? 'numeric' : 'decimal') + '" ' +
      'id="' + id + '"' +
      (opts.value !== undefined && opts.value !== null && opts.value !== '' ? ' value="' + App._esc(String(opts.value)) + '"' : '') +
      ' class="form-input' + (opts.clase ? ' ' + opts.clase : '') + '"' +
      (opts.placeholder ? ' placeholder="' + App._esc(opts.placeholder) + '"' : '') +
      (opts.oninput ? ' oninput="' + opts.oninput + '"' : '') +
      (opts.onblur  ? ' onblur="'  + opts.onblur  + '"' : '') +
      (opts.style ? ' style="' + opts.style + '"' : '') +
      (opts.autofocus ? ' autofocus' : '') +
      (opts.title ? ' title="' + App._esc(opts.title) + '"' : '') + '>';
  },

  // Normaliza lo que escribió una persona en Colombia:
  //   "294,5"      -> 294.5     (coma decimal)
  //   "294.5"      -> 294.5     (punto decimal)
  //   "1.800.000"  -> 1800000   (puntos de miles)
  //   "1.234,5"    -> 1234.5    (miles + coma decimal)
  // Regla: si hay coma, ella manda como decimal y los puntos son miles. Si no
  // hay coma y hay más de un punto, todos son separadores de miles.
  _aNumero: function(txt) {
    var t = String(txt == null ? '' : txt).trim().replace(/\s/g, '');
    if (t === '') return NaN;
    if (t.indexOf(',') >= 0) {
      // Con coma presente, ella es el decimal y los puntos son miles.
      t = t.replace(/\./g, '').replace(',', '.');
    } else if ((t.match(/\./g) || []).length > 1) {
      // Sin coma y con varios puntos: todos son separadores de miles.
      t = t.replace(/\./g, '');
    }
    if (!/^-?\d+(\.\d+)?$/.test(t)) return NaN;
    return parseFloat(t);
  },
  _leerNum: function(id) {
    var el = document.getElementById(id);
    return App._aNumero(el ? el.value : '');
  },
  // Para dinero: solo dígitos. "1.800.000" y "1800000" dan lo mismo, y unos
  // centavos escritos por error no cambian el total en pesos colombianos.
  // "1.800.000" y "1800000" dan lo mismo. Aquí NO hay ambigüedad posible como
  // en los decimales: en pesos colombianos no se escriben centavos, así que
  // todo lo que no sea dígito es separador y se descarta.
  _aPesos: function(txt) {
    var t = String(txt == null ? '' : txt).replace(/[^\d]/g, '');
    return t === '' ? NaN : parseInt(t, 10);
  },
  _leerPesos: function(id) {
    var el = document.getElementById(id);
    return App._aPesos(el ? el.value : '');
  },

  // ── El dinero se ESCRIBE con sus puntos ──────────────────────────────
  // "999600" y "$ 999.600" son el mismo número, pero solo uno se compara de
  // un vistazo contra el papel. En el formulario de facturas ese cotejo es
  // TODO el trabajo que hay que hacer, así que la cifra se muestra agrupada.
  //
  // Se formatea al cargar y al salir del campo, NO mientras se teclea: dar
  // formato en cada tecla mueve el cursor de sitio y escribir se vuelve una
  // pelea. Al leer, _leerPesos quita los puntos igual.
  _pesosCampo: function(v) {
    if (v === '' || v === null || v === undefined) return '';
    var n = (typeof v === 'number') ? v : App._aPesos(v);
    if (isNaN(n)) return '';
    return Math.round(n).toLocaleString('es-CO');
  },
  _pesosBlur: function(el) {
    if (!el) return;
    var n = App._aPesos(el.value);
    el.value = isNaN(n) ? '' : n.toLocaleString('es-CO');
  },

  // Marca un campo como erróneo y explica al lado, en vez de un toast que se va
  // solo y que la persona ni alcanza a leer.
  // Un segundo toque en "Guardar" mientras el primero todavía viaja crea una
  // fila gemela — dos tareas idénticas el mismo día, que es exactamente lo que
  // pasó con el movimiento de ganado en Bélgica. Apps Script tarda lo suyo en
  // arrancar en frío, así que el segundo toque es lo natural: parece que no
  // hizo nada. El botón se apaga y dice qué está haciendo hasta que hay
  // respuesta.
  _enviando: {},
  _unaVez: function(clave, idBoton, envio) {
    if (App._enviando[clave]) return;
    App._enviando[clave] = true;
    var b = idBoton ? document.getElementById(idBoton) : null;
    var antes = b ? b.innerHTML : '';
    if (b) { b.disabled = true; b.innerHTML = 'Guardando…'; }
    envio(function liberar() {
      delete App._enviando[clave];
      // El botón puede haber desaparecido: al guardar bien, el modal se cierra.
      if (b && b.parentNode) { b.disabled = false; b.innerHTML = antes; }
    });
  },

  _marcarCampo: function(id, mensaje) {
    var el = document.getElementById(id);
    if (!el) { App.toast(mensaje, 'error'); return; }
    el.classList.add('campo-malo');
    var prev = el.parentNode.querySelector('.campo-error');
    if (prev) prev.remove();
    var av = document.createElement('div');
    av.className = 'campo-error';
    av.textContent = mensaje;
    el.parentNode.insertBefore(av, el.nextSibling);
    el.focus();
    el.addEventListener('input', function limpiar() {
      el.classList.remove('campo-malo');
      var e = el.parentNode.querySelector('.campo-error');
      if (e) e.remove();
      el.removeEventListener('input', limpiar);
    });
  },

  fmtCOP: function(n) {
    if (!n && n !== 0) return '—';
    return '$ ' + parseInt(n).toLocaleString('es-CO');
  },
  // COP compacto para tarjetas KPI: $ 1.240 M · $ 850 mil. El valor exacto va en el sub o el tooltip.
  fmtCOPk: function(n) {
    n = parseFloat(n);
    if (isNaN(n)) return '—';
    var s = n < 0 ? '-' : '', abs = Math.abs(n);
    if (abs >= 1e9) return s + '$ ' + (abs / 1e6).toLocaleString('es-CO', { maximumFractionDigits: 0 }) + ' M';
    if (abs >= 1e6) return s + '$ ' + (abs / 1e6).toLocaleString('es-CO', { maximumFractionDigits: 1 }) + ' M';
    if (abs >= 1e3) return s + '$ ' + Math.round(abs / 1e3).toLocaleString('es-CO') + ' mil';
    return s + '$ ' + Math.round(abs).toLocaleString('es-CO');
  },
  // Porcentaje con signo explícito — deja claro si se gana o se pierde.
  fmtPct: function(n, dec) {
    if (n === null || n === undefined || isNaN(n)) return '—';
    return (n > 0 ? '+' : '') + parseFloat(n).toFixed(dec === undefined ? 1 : dec) + '%';
  },
  // Tarjeta KPI del sistema (misma pieza en dashboard y finanzas).
  _kpiTile: function(kc, icon, val, lab, sub) {
    return '<div class="dx-kpi" style="--kc:var(--c-' + kc + ')">' +
      '<div class="dx-kpi-top"><span class="dx-kpi-lab">' + lab + '</span>' +
      '<span class="dx-kpi-ico"><i class="ph ph-' + icon + '"></i></span></div>' +
      '<div class="dx-kpi-val">' + val + '</div>' +
      '<div class="dx-kpi-sub">' + (sub || '') + '</div></div>';
  },
  fmtFecha: function(s) {
    if (!s || s === '') return '—';
    // Si es string ISO (YYYY-MM-DD), parsear directo para evitar el desfase UTC→local
    // que hace que new Date('2026-05-28') muestre 27/05/2026 en UTC-5 (Colombia)
    if (typeof s === 'string') {
      var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (m) return m[3] + '/' + m[2] + '/' + m[1];
    }
    var d = new Date(s);
    return isNaN(d) ? String(s) : d.toLocaleDateString('es-CO', { day:'2-digit', month:'2-digit', year:'numeric' });
  },
  // Días vividos hasta la muerte: desde el nacimiento si se conoce, si no desde
  // el ingreso. Devuelve null si falta alguna fecha (registros antiguos).
  _edadAlMorir: function(a) {
    if (!a || !a.fecha_muerte) return null;
    var base = a.fecha_nacimiento || a.fecha_ingreso;
    if (!base) return null;
    var d1 = new Date(base), d2 = new Date(a.fecha_muerte);
    if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return null;
    return Math.max(0, Math.floor((d2 - d1) / 86400000));
  },
  // Días → texto entendible ("3 días", "2 meses", "1 año 4 meses").
  _edadLegible: function(dias) {
    if (dias === null || dias === undefined || isNaN(dias)) return '—';
    if (dias < 60)  return dias + ' día' + (dias !== 1 ? 's' : '');
    var meses = Math.floor(dias / 30.44);
    if (meses < 24) return meses + ' meses';
    var anios = Math.floor(meses / 12), resto = meses % 12;
    return anios + ' año' + (anios !== 1 ? 's' : '') + (resto ? ' ' + resto + ' m' : '');
  },

  // Meses calendario enteros entre una fecha ISO y hoy (o 'hasta').
  _mesesEntre: function(desdeIso, hasta) {
    var d = new Date(desdeIso); if (isNaN(d)) return 0;
    hasta = hasta || new Date();
    var m = (hasta.getFullYear() - d.getFullYear()) * 12 + (hasta.getMonth() - d.getMonth());
    if (hasta.getDate() < d.getDate()) m--;
    return Math.max(0, m);
  },

  // ── SANIDAD · recordatorios vs. eventos realizados ───────────────────
  // Cada registro sanitario ES un evento realizado (ocurrió en `fecha`). Su
  // `proxima_fecha` es un RECORDATORIO de seguimiento. Diferenciarlos evita
  // confundir "lo que ya se hizo" con "lo que queda por hacer".
  _SAN_ICONOS: {
    'AFTOSA':'<i class="ph ph-syringe" aria-hidden="true"></i>','CARBÓN SINTOMÁTICO':'<i class="ph ph-syringe" aria-hidden="true"></i>','CARBÓN BACTERIDIANO':'<i class="ph ph-syringe" aria-hidden="true"></i>','VACUNA':'<i class="ph ph-syringe" aria-hidden="true"></i>',
    'DESPARASITANTE':'<i class="ph ph-bug" aria-hidden="true"></i>','PURGA ORAL':'<i class="ph ph-bug" aria-hidden="true"></i>','PURGA SUBCUTÁNEA':'<i class="ph ph-bug" aria-hidden="true"></i>',
    'VITAMINA':'<i class="ph ph-pill" aria-hidden="true"></i>','TRATAMIENTO':'<i class="ph ph-bandaids" aria-hidden="true"></i>','REVISIÓN':'<i class="ph ph-magnifying-glass" aria-hidden="true"></i>','PALPACIÓN VETERINARIA':'<i class="ph ph-stethoscope" aria-hidden="true"></i>',
    'BAÑAR':'<i class="ph ph-shower" aria-hidden="true"></i>'
  },
  // Tipos que cuentan como "el mismo protocolo" para dar por cumplido un
  // recordatorio (refleja las reglas de seguimiento del backend en sanidad.gs).
  _SAN_PROX: { 'CARBÓN SINTOMÁTICO':'CARBÓN BACTERIDIANO','CARBÓN BACTERIDIANO':'CARBÓN SINTOMÁTICO' },
  _sanIcono: function(tipo) { return App._SAN_ICONOS[tipo] || '<i class="ph ph-clipboard-text" aria-hidden="true"></i>'; },

  // Une valores no vacíos y sin repetir (para agrupar medicamento/dosis/observación
  // de varios procedimientos del mismo día en una sola celda).
  _uniqJoin: function(valores, sep) {
    sep = sep || ', ';
    var vistos = {}, out = [];
    (valores || []).forEach(function(v) {
      v = (v == null ? '' : String(v)).trim();
      if (!v || vistos[v]) return;
      vistos[v] = true;
      out.push(v);
    });
    return out.join(sep);
  },

  // ── TAREAS DE PREDIO ─────────────────────────────────────────────────
  // Catálogo de labores. `dias` = intervalo sugerido para repetirla (0 = sin
  // sugerencia). Espeja ACTIVIDADES_TAREA de tareas.gs.
  ACTIVIDADES: [
    { tipo:'Guadañar',      dias:45,  icono:'<i class="ph ph-grains" aria-hidden="true"></i>' },
    { tipo:'Fumigar',       dias:60,  icono:'<i class="ph ph-wind" aria-hidden="true"></i>' },
    { tipo:'Machetear',     dias:60,  icono:'<i class="ph ph-knife" aria-hidden="true"></i>' },
    { tipo:'Abonar',        dias:120, icono:'<i class="ph ph-plant" aria-hidden="true"></i>' },
    { tipo:'Riego',         dias:15,  icono:'<i class="ph ph-drop" aria-hidden="true"></i>' },
    { tipo:'Cercas',        dias:180, icono:'<i class="ph ph-shield" aria-hidden="true"></i>' },
    { tipo:'Vacunar',       dias:0,   icono:'<i class="ph ph-syringe" aria-hidden="true"></i>' },
    { tipo:'Mantenimiento', dias:0,   icono:'<i class="ph ph-wrench" aria-hidden="true"></i>' },
    { tipo:'Otra',          dias:0,   icono:'<i class="ph ph-clipboard-text" aria-hidden="true"></i>' }
  ],
  _actIcono: function(a) {
    for (var i = 0; i < App.ACTIVIDADES.length; i++) if (App.ACTIVIDADES[i].tipo === a) return App.ACTIVIDADES[i].icono;
    return '<i class="ph ph-clipboard-text" aria-hidden="true"></i>';
  },
  _actDias: function(a) {
    for (var i = 0; i < App.ACTIVIDADES.length; i++) if (App.ACTIVIDADES[i].tipo === a) return App.ACTIVIDADES[i].dias || 0;
    return 0;
  },

  // Cómo se ve cada estado. "Pendiente" y "reprogramada" NO son columnas de la
  // hoja: los deduce el backend en cada consulta. Siempre icono + texto, nunca
  // color solo.
  TAREA_INFO: {
    PROGRAMADA:   { label:'Programada',   icono:'●', tk:'--muted'  },
    EN_CURSO:     { label:'En curso',     icono:'◐', tk:'--info'   },
    REALIZADA:    { label:'Realizada',    icono:'<i class="ph ph-check" aria-hidden="true"></i>', tk:'--ok'     },
    PENDIENTE:    { label:'Pendiente',    icono:'<i class="ph ph-warning" aria-hidden="true"></i>', tk:'--warn'   },
    NO_EJECUTADA: { label:'No ejecutada', icono:'<i class="ph ph-x" aria-hidden="true"></i>', tk:'--danger' },
    CANCELADA:    { label:'Cancelada',    icono:'⊘', tk:'--muted'  }
  },
  // La etiqueta que se muestra: "pendiente" gana sobre "programada" porque es la
  // que exige actuar. "Reprogramada" NO sustituye a ninguna: es un añadido, una
  // tarea puede estar no ejecutada Y reprogramada a la vez.
  _tareaEstado: function(t) {
    return (t.estado === 'PROGRAMADA' && t.pendiente) ? 'PENDIENTE' : t.estado;
  },
  _tareaInfo: function(t) {
    return App.TAREA_INFO[App._tareaEstado(t)] || App.TAREA_INFO.PROGRAMADA;
  },
  _tareaChip: function(t) {
    var i = App._tareaInfo(t);
    return '<span class="chip-tarea" style="' + App._estiloPastilla(i.tk) + '">' +
      i.icono + ' ' + i.label + '</span>' +
      (t.reprogramada ? '<span class="chip-tarea re">↷ reprogramada' +
        (t.sucesora_fecha ? ' al ' + App.fmtFecha(t.sucesora_fecha) : '') + '</span>' : '');
  },

  // Fecha local en yyyy-MM-dd sumando días. Nunca toISOString (convierte a UTC).
  _sumarDiasISO: function(iso, dias) {
    var p = String(iso).split('-');
    var d = new Date(+p[0], +p[1] - 1, +p[2]);
    d.setDate(d.getDate() + parseInt(dias, 10));
    return App._fechaISO(d);
  },

  // ── Catálogo ÚNICO de tipos sanitarios ───────────────────────────────
  // Fuente de verdad para TODOS los formularios (sanidad individual, por lote,
  // registro y alta de animal). `dias` = intervalo de seguimiento sugerido según
  // protocolo (0 = sin seguimiento automático). PALPACIÓN VETERINARIA queda aparte
  // porque tiene su propio flujo con campos reproductivos.
  // ⚠ Mantener sincronizado con _REGLAS_SEGUIMIENTO en sanidad.gs (backend).
  SAN_TIPOS: [
    { tipo:'CARBÓN SINTOMÁTICO',  dias:21  },
    { tipo:'CARBÓN BACTERIDIANO', dias:180 },
    { tipo:'AFTOSA',              dias:180 },
    { tipo:'VITAMINA',            dias:90  },
    { tipo:'PURGA ORAL',          dias:90  },
    { tipo:'PURGA SUBCUTÁNEA',    dias:90  },
    { tipo:'DESPARASITANTE',      dias:90  },
    // El baño garrapaticida se repite cada ~21 días: es el intervalo del ciclo de
    // la garrapata, no un número redondo. Igual queda editable en cada registro.
    { tipo:'BAÑAR',               dias:21  },
    { tipo:'VACUNA',              dias:0   },
    { tipo:'TRATAMIENTO',         dias:0   },
    { tipo:'REVISIÓN',            dias:0   }
  ],
  // Días de seguimiento sugeridos para un tipo (0 = sin sugerencia automática).
  _sanDiasSeguimiento: function(tipo) {
    for (var i = 0; i < App.SAN_TIPOS.length; i++) if (App.SAN_TIPOS[i].tipo === tipo) return App.SAN_TIPOS[i].dias || 0;
    return 0;
  },
  // Casillas (multi-selección) de tipos sanitarios. `cls` = clase para recolectar
  // los marcados; cada casilla lleva value y data-tipo con el nombre del tipo.
  // `pfx` opcional: si se pasa, cada casilla queda enlazada a su bloque de
  // detalle (`_procDetalles`) y lo muestra al marcarse. Sin `pfx` se comporta
  // como siempre — así el alta de animal, que no lleva detalle, no cambia.
  _sanCheckboxes: function(cls, pfx) {
    return App.SAN_TIPOS.map(function(t, i) {
      var id = pfx ? ' id="' + pfx + '-chk-' + i + '"' : '';
      var on = pfx ? ' onchange="App._procToggle(\'' + pfx + '\',' + i + ')"' : '';
      return '<label class="proc-checkbox-label">' +
        '<input type="checkbox"' + id + on + ' class="' + cls + ' w-4 h-4 accent-green-700" value="' + t.tipo + '" data-tipo="' + t.tipo + '">' +
        '<span><span class="san-ico">' + App._sanIcono(t.tipo) + '</span>' + t.tipo + '</span>' +
      '</label>';
    }).join('');
  },

  // ── DETALLE POR PROCEDIMIENTO ────────────────────────────────────────
  // Un bloque por tipo, oculto hasta que se marca su casilla. TODOS los campos
  // son opcionales: para guardar basta la fecha y una casilla marcada.
  // `fechaId` es el input de fecha del formulario: de ahí se cuenta la dosis
  // de continuación, así que si cambias la fecha las fechas de refuerzo se
  // recalculan solas.
  _procDetalles: function(pfx, fechaId) {
    return '<div class="proc-dets" id="' + pfx + '-dets" data-fecha-id="' + fechaId + '">' +
      App.SAN_TIPOS.map(function(t, i) {
        var dias = App._sanDiasSeguimiento(t.tipo) || 21;
        return '<div class="proc-det" id="' + pfx + '-det-' + i + '" data-tipo="' + App._esc(t.tipo) + '" data-i="' + i + '" hidden>' +
          '<div class="proc-det-head"><span class="san-ico">' + App._sanIcono(t.tipo) + '</span>' + App._esc(t.tipo) + '</div>' +
          '<div class="proc-det-campos">' +
            '<label>Medicamento / producto' +
              '<input type="text" id="' + pfx + '-med-' + i + '" class="form-input" placeholder="Opcional"></label>' +
            '<label>Dosis aplicada' +
              '<input type="text" id="' + pfx + '-dos-' + i + '" class="form-input" placeholder="Ej: 5 ml"></label>' +
          '</div>' +
          '<label class="proc-det-cont">' +
            '<input type="checkbox" id="' + pfx + '-cont-' + i + '" onchange="App._procCont(\'' + pfx + '\',' + i + ')">' +
            '<span>Continúa con otra dosis en</span>' +
            '<input type="number" min="1" max="365" id="' + pfx + '-dias-' + i + '" value="' + dias + '" class="proc-dias" disabled ' +
              'oninput="App._procCont(\'' + pfx + '\',' + i + ')">' +
            '<span>días</span><span class="proc-det-fecha" id="' + pfx + '-fec-' + i + '"></span>' +
          '</label>' +
          '<label class="proc-det-obs">Observación de este procedimiento' +
            '<input type="text" id="' + pfx + '-obs-' + i + '" class="form-input" placeholder="Qué se hizo, cómo reaccionó, qué queda pendiente…"></label>' +
        '</div>';
      }).join('') +
    '</div>';
  },

  _procToggle: function(pfx, i) {
    var chk = document.getElementById(pfx + '-chk-' + i);
    var det = document.getElementById(pfx + '-det-' + i);
    if (!chk || !det) return;
    det.hidden = !chk.checked;
    if (chk.checked) App._procCont(pfx, i);
  },

  _procCont: function(pfx, i) {
    var chk  = document.getElementById(pfx + '-cont-' + i);
    var dias = document.getElementById(pfx + '-dias-' + i);
    var fec  = document.getElementById(pfx + '-fec-' + i);
    if (!chk || !dias) return;
    dias.disabled = !chk.checked;
    var f = App._procProxima(pfx, i);
    if (fec) fec.textContent = f ? '→ ' + App.fmtFecha(f) : '';
  },

  // Fecha de la dosis de continuación = fecha del registro + los días indicados.
  _procProxima: function(pfx, i) {
    var chk = document.getElementById(pfx + '-cont-' + i);
    if (!chk || !chk.checked) return '';
    var num = parseInt(((document.getElementById(pfx + '-dias-' + i) || {}).value || ''), 10);
    if (isNaN(num) || num <= 0) return '';
    var cont = document.getElementById(pfx + '-dets');
    var base = ((document.getElementById(cont ? cont.getAttribute('data-fecha-id') : '') || {}).value || '');
    if (!base) return '';
    var d = new Date(base + 'T00:00:00');
    if (isNaN(d.getTime())) return '';
    d.setDate(d.getDate() + num);
    return App._fechaISO(d);
  },

  // Devuelve un payload por procedimiento marcado, listo para saveEventoSanitario.
  // OJO con requiere_seguimiento: el backend BORRA proxima_fecha si no llega en
  // 'si' (sanidad.gs). Mandar solo la fecha la perdería sin avisar.
  _procLeer: function(pfx) {
    var out = [];
    [].forEach.call(document.querySelectorAll('#' + pfx + '-dets .proc-det'), function(el) {
      var i = el.getAttribute('data-i');
      var chk = document.getElementById(pfx + '-chk-' + i);
      if (!chk || !chk.checked) return;
      var prox = App._procProxima(pfx, i);
      out.push({
        tipo:                 el.getAttribute('data-tipo'),
        medicamento:          ((document.getElementById(pfx + '-med-' + i) || {}).value || '').trim(),
        dosis:                ((document.getElementById(pfx + '-dos-' + i) || {}).value || '').trim(),
        observacion:          ((document.getElementById(pfx + '-obs-' + i) || {}).value || '').trim(),
        proxima_fecha:        prox,
        requiere_seguimiento: prox ? 'si' : 'no'
      });
    });
    return out;
  },

  // Recalcula todas las fechas de continuación visibles (al cambiar la fecha base).
  _procRefrescarFechas: function(pfx) {
    [].forEach.call(document.querySelectorAll('#' + pfx + '-dets .proc-det'), function(el) {
      App._procCont(pfx, el.getAttribute('data-i'));
    });
  },

  // ¿El recordatorio de este evento ya fue cumplido por otro evento posterior
  // del mismo tipo (o su tipo de seguimiento) dentro de una ventana razonable?
  _recordatorioCumplido: function(evento, eventosAnimal) {
    if (!evento.proxima_fecha) return false;
    var prox = new Date(evento.proxima_fecha); if (isNaN(prox)) return false;
    var desde = new Date(prox); desde.setDate(desde.getDate() - 7);
    var hasta = new Date(prox); hasta.setDate(hasta.getDate() + 60);
    var tiposOk = {}; tiposOk[evento.tipo] = 1;
    if (App._SAN_PROX[evento.tipo]) tiposOk[App._SAN_PROX[evento.tipo]] = 1;
    return (eventosAnimal || []).some(function(e) {
      if (e.id_evento === evento.id_evento) return false;
      if (!tiposOk[e.tipo]) return false;
      var f = new Date(e.fecha); if (isNaN(f)) return false;
      return f >= desde && f <= hasta;
    });
  },

  // Estado de un recordatorio: '' (no tiene) | 'vigente' | 'vencido' | 'cumplido'
  _recordatorioEstado: function(evento, eventosAnimal, hoy) {
    if (!evento.proxima_fecha) return { estado:'', dias:null };
    hoy = hoy || (function(){ var d=new Date(); d.setHours(0,0,0,0); return d; })();
    var dias = Math.round((new Date(evento.proxima_fecha) - hoy) / 86400000);
    if (App._recordatorioCumplido(evento, eventosAnimal)) return { estado:'cumplido', dias:dias };
    return { estado: dias < 0 ? 'vencido' : 'vigente', dias:dias };
  },

  // Chip visual del recordatorio para tablas de historial.
  _chipRecordatorio: function(evento, eventosAnimal, hoy) {
    var r = App._recordatorioEstado(evento, eventosAnimal, hoy);
    if (!r.estado) return '<span class="text-gray-300">—</span>';
    var f = App.fmtFecha(evento.proxima_fecha);
    if (r.estado === 'cumplido')
      return '<span class="chip-record cumplido" title="Recordatorio ya atendido por un evento posterior"><i class="ph ph-check" aria-hidden="true"></i> Cumplido · ' + f + '</span>';
    if (r.estado === 'vencido')
      return '<span class="chip-record vencido" title="Seguimiento programado que ya venció y sigue pendiente"><i class="ph ph-clock" aria-hidden="true"></i> Vencido · ' + f + ' <span class="op">(hace ' + Math.abs(r.dias) + ' d)</span></span>';
    return '<span class="chip-record vigente" title="Seguimiento programado, aún no realizado"><i class="ph ph-bell" aria-hidden="true"></i> ' + f + ' <span class="op">(' + (r.dias === 0 ? 'hoy' : 'en ' + r.dias + ' d') + ')</span></span>';
  },

  renderMain: function(html) {
    document.getElementById('app-main').innerHTML = html;
    App._compactarFiltros();
    App._verSubtabActiva();
  },

  // En celular las sub-pestañas van en una sola fila que se arrastra, y la
  // activa puede quedar fuera de pantalla: se llega a Facturas y no se ve en
  // cuál se está. Se desplaza la fila, NO la página — scrollIntoView movería
  // también el vertical y la vista arrancaría a media altura.
  _verSubtabActiva: function() {
    var on = document.querySelector('#app-main .subtab.is-on');
    if (!on || !on.parentNode) return;
    var fila = on.parentNode;
    if (fila.scrollWidth <= fila.clientWidth) return;   // caben todas, nada que mover
    fila.scrollLeft = Math.max(0, on.offsetLeft - 12);
  },

  // ── Los filtros, detrás de un botón en celular ───────────────────────
  // Medido en un teléfono de 390 px: en Situación los cuatro filtros ocupaban
  // media pantalla ANTES del primer dato. Uno entra a esa vista a ver animales,
  // no a ver desplegables.
  //
  // Se hace aquí, sobre el HTML ya pintado, y no en cada plantilla: son cinco
  // vistas con estructuras distintas y mantener cinco copias de lo mismo es
  // como se pudren estas cosas.
  //
  // SOLO se pliegan los <select>. Los botones de la barra son ACCIONES
  // ("Nueva tarea", "Programar semana") y esconderlas sería otra cosa; las
  // cajas de búsqueda se quedan fuera porque son lo que más se usa.
  _compactarFiltros: function() {
    if (window.innerWidth > 700) return;
    var main = document.getElementById('app-main');
    if (!main) return;

    main.querySelectorAll('.dx-toolbar, .flex.flex-wrap.gap-3.items-center').forEach(function(barra) {
      if (barra.querySelector('.filtros-btn')) return;             // ya plegada
      var sels = [].slice.call(barra.querySelectorAll('select'));
      if (sels.length < 2) return;                                 // con uno no compensa

      var panel = document.createElement('div');
      panel.className = 'filtros-panel';
      panel.hidden = true;
      sels.forEach(function(s) { panel.appendChild(s); });

      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'filtros-btn';
      btn.onclick = function() {
        panel.hidden = !panel.hidden;
        btn.classList.toggle('abierto', !panel.hidden);
      };
      barra.insertBefore(btn, barra.firstChild);
      barra.appendChild(panel);
      App._contarFiltros(barra);

      // El número del botón se mantiene al día solo.
      sels.forEach(function(s) {
        s.addEventListener('change', function() { App._contarFiltros(barra); });
      });
    });
  },

  // El botón dice CUÁNTOS filtros hay puestos: plegados, es lo único que avisa
  // de que la lista de abajo no es la lista completa.
  _contarFiltros: function(barra) {
    var btn = barra.querySelector('.filtros-btn');
    if (!btn) return;
    var n = 0;
    barra.querySelectorAll('.filtros-panel select').forEach(function(s) { if (s.value) n++; });
    btn.innerHTML = '<i class="ph ph-funnel" aria-hidden="true"></i> ' + (n ? 'Filtros (' + n + ')' : 'Filtros');
    btn.classList.toggle('con-filtros', n > 0);
  },
  // Grupos de sub-pestañas. La navegación lateral quedó con menos entradas:
  // lo comercial vive dentro de "Para venta" y el registro dentro de "Animales".
  _SUBTABS: {
    salida:   [{ hash:'#/salida',   label:'<i class="ph ph-target" aria-hidden="true"></i> Para venta' },
               { hash:'#/ventas',   label:'<i class="ph ph-receipt" aria-hidden="true"></i> Ventas' },
               { hash:'#/finanzas', label:'<i class="ph ph-lock" aria-hidden="true"></i> Finanzas' },
               { hash:'#/facturas', label:'<i class="ph ph-receipt" aria-hidden="true"></i> Facturas' }],
    animales: [{ hash:'#/animales', label:'<i class="ph ph-cow" aria-hidden="true"></i> Listado' },
               { accion:'App.abrirModalRegistro()', label:'<i class="ph ph-clipboard-text" aria-hidden="true"></i> Registro' }],
    tareas:   [{ hash:'#/tareas', label:'<i class="ph ph-clipboard-text" aria-hidden="true"></i> Tablero' },
               { hash:'#/calendario', label:'<i class="ph ph-calendar" aria-hidden="true"></i> Calendario' },
               { hash:'#/predios', label:'<i class="ph ph-map-trifold" aria-hidden="true"></i> Predios y lotes' },
               { hash:'#/lluvias', label:'<i class="ph ph-cloud-rain" aria-hidden="true"></i> Lluvias' }]
  },

  // `activa` es el hash de la sub-pestaña en curso. Las entradas con `accion`
  // no navegan: abren un modal (el Registro), y por eso nunca se marcan activas.
  _subtabs: function(grupo, activa) {
    var items = App._SUBTABS[grupo] || [];
    return '<div class="subtabs">' + items.map(function(it) {
      if (it.accion) {
        return '<button class="subtab" onclick="' + it.accion + '">' + it.label + '</button>';
      }
      var on = it.hash === activa;
      return '<a href="' + it.hash + '" class="subtab' + (on ? ' is-on' : '') + '">' + it.label + '</a>';
    }).join('') + '</div>';
  },

  irAnimal: function(codigo) {
    window.location.hash = '#/animal/' + encodeURIComponent(codigo);
  },

  // Abre la ficha recordando de donde se vino, para que la ficha pueda ofrecer
  // el camino de vuelta. Se guarda en memoria (no en el hash) porque el hash del
  // animal ya carga el codigo y ensuciarlo romperia los enlaces existentes.
  irAnimalDesde: function(codigo, hash, etiqueta) {
    App.estado._volver = { hash: hash, etiqueta: etiqueta };
    App.irAnimal(codigo);
    return false;
  },

  // Miga de pan de la ficha: "Animales › S1", o el origen real si se llego
  // desde otra vista. Se consume una sola vez para que al recargar la ficha
  // por su URL no aparezca un retorno que ya no corresponde.
  _migaFicha: function(codigo) {
    var v = App.estado._volver;
    App.estado._volver = null;
    var origen = (v && v.hash && v.etiqueta)
      ? { hash: v.hash, etiqueta: v.etiqueta }
      : { hash: '#/animales', etiqueta: 'Animales' };
    return '<div class="miga">' +
      '<a href="' + origen.hash + '" class="miga-volver">' +
        '<i class="ph ph-arrow-left"></i> ' + App._esc(origen.etiqueta) +
      '</a>' +
      '<span class="miga-sep">›</span>' +
      '<span class="miga-actual">' + App._esc(codigo) + '</span>' +
    '</div>';
  },

  // ¿Está preñada esta hembra? Consulta los datos ya cargados en el cliente:
  // el mapa reproductivo de Para Venta, la ficha abierta o el listado de animales.
  // Se usa como guarda anti-venta accidental en el modal de venta.
  _infoPrenada: function(codigo) {
    var m = (App.estado._reproMap || {})[codigo];
    if (m && m.prenada) return { prenada: true, meses: m.meses, vencida: m.vencida };
    var act = App.estado.animalActual;
    if (act && act.animal && act.animal.codigo === codigo && act.animal.estado_reproductivo === 'Preñada') {
      return { prenada: true, meses: parseInt(act.animal.meses, 10) || '' };
    }
    var a = (App.estado.animalesLista || []).find(function(x){ return x.codigo === codigo; });
    if (a && (a.estado_reproductivo === 'Preñada' || a.estadoReproductivo === 'Preñada')) {
      return { prenada: true, meses: parseInt(a.meses, 10) || '' };
    }
    return { prenada: false };
  },

  // Estado reproductivo de cara a la VENTA de una hembra:
  //   'prenada'    → gestación confirmada (bloqueo con confirmación)
  //   'dudosa'     → palpación no concluyente — podría estar preñada (bloqueo con confirmación)
  //   'sinchequeo' → hembra sin palpación registrada (aviso, sin bloqueo)
  //   null         → macho, o hembra palpada vacía / en celo (vía libre)
  _estadoReproVenta: function(codigo) {
    var p = App._infoPrenada(codigo);
    if (p.prenada) return { nivel: 'prenada', meses: p.meses, vencida: p.vencida };
    var est = null;
    var m = (App.estado._reproMap || {})[codigo];
    if (m && m.sexo === 'HEMBRA') est = m.estado || '';
    var act = App.estado.animalActual;
    if (est === null && act && act.animal && act.animal.codigo === codigo) {
      var sx = act.animal.sexo || (act.reproductivo || {}).sexo || '';
      if (sx === 'HEMBRA') est = act.animal.estado_reproductivo || '';
    }
    if (est === null) {
      var a = (App.estado.animalesLista || []).find(function(x){ return x.codigo === codigo; });
      if (a) {
        var sx2 = a.sexo || '';
        if (!sx2) {
          var t = String(a.tipo || '').toUpperCase();
          if (t.indexOf('VACA') >= 0 || t.indexOf('NOVILLA') >= 0 || t.indexOf('TERNERA') >= 0) sx2 = 'HEMBRA';
        }
        if (sx2 === 'HEMBRA') est = a.estado_reproductivo || '';
      }
    }
    if (est === null)       return { nivel: null };
    if (est === 'Preñada')  return { nivel: 'prenada', meses: '' };
    if (est === 'Dudosa')   return { nivel: 'dudosa' };
    if (est === '')         return { nivel: 'sinchequeo' };
    return { nivel: null };   // 'No preñada' / 'En celo' — vía libre
  },

  // Estado reproductivo para el LISTADO de animales: clave de filtro + chip a pintar.
  // Solo aplica a hembras; los machos quedan fuera de cualquier filtro reproductivo.
  // Se apoya ÚNICAMENTE en `estado_reproductivo` (resultado de la última palpación),
  // que es el dato inequívoco. NO usa `meses`, que en la hoja está sobrecargado
  // (el esquema lo documenta como meses en finca y repro.gs lo lee como gestación).
  _reproFila: function(a) {
    var sexo = a.sexo || '';
    if (!sexo) {
      // Registros viejos sin sexo: se deduce del tipo, igual que hace el backend.
      var t = String(a.tipo || '').toUpperCase();
      if (t.indexOf('VACA') >= 0 || t.indexOf('NOVILLA') >= 0 || t.indexOf('TERNERA') >= 0) sexo = 'HEMBRA';
    }
    if (sexo !== 'HEMBRA') return { key: '', chip: '<span class="text-gray-300">—</span>' };
    switch (String(a.estado_reproductivo || '').trim()) {
      case 'Preñada':    return { key:'PRENADA', chip:'<span class="chip-repro prenada"><i class="ph ph-baby" aria-hidden="true"></i> Preñada</span>' };
      case 'Dudosa':     return { key:'DUDOSA',  chip:'<span class="chip-repro dudosa"><i class="ph ph-question" aria-hidden="true"></i> Dudosa</span>' };
      case 'En celo':    return { key:'CELO',    chip:'<span class="chip-repro manual"><i class="ph ph-fire" aria-hidden="true"></i> En celo</span>' };
      case 'No preñada': return { key:'VACIA',   chip:'<span class="chip-repro vacia">○ Vacía</span>' };
      default:           return { key:'SINCHEQUEO', chip:'<span class="chip-repro sinchequeo">Sin chequeo</span>' };
    }
  },

  // Tematiza Chart.js según el tema activo (tooltips, tipografía, colores).
  // Se llama en cada ruteo, así TODOS los gráficos de la app lo heredan.
  _temaCharts: function() {
    if (!window.Chart) return;
    var light = document.documentElement.getAttribute('data-theme') === 'light';
    Chart.defaults.font.family = 'Geist, system-ui, sans-serif';
    Chart.defaults.font.size   = 12.5;
    Chart.defaults.color       = App._tok('--chart-tick', '#9c9384');
    var tt = Chart.defaults.plugins.tooltip;
    tt.backgroundColor = App._tok('--chart-tip-bg',     '#211d18');
    tt.titleColor      = App._tok('--chart-tip-title',  '#f0ece4');
    tt.bodyColor       = App._tok('--chart-tip-body',   '#cfc9bd');
    tt.borderColor     = App._tok('--chart-tip-border', '#4a4238');
    tt.borderWidth     = 1;
    tt.cornerRadius    = 10;
    tt.padding         = 10;
    tt.boxPadding      = 5;
    tt.caretSize       = 6;
    tt.usePointStyle   = true;
    tt.titleFont       = { weight: 700, family: '"Inter Tight", Inter, sans-serif' };
  },

  // ── TOOLTIP COMPARTIDO DE GRÁFICOS ───────────────────────────────────
  // Chart.js dibuja su tooltip DENTRO del canvas: en un gráfico pequeño (las donas
  // miden 184 px) cualquier texto largo queda recortado, y los elementos superpuestos
  // al canvas lo tapan. Este vive en <body> con position:fixed → no se recorta nunca
  // y siempre queda por encima.
  //   Uso: plugins: { tooltip: { enabled:false, external: App._tipExterno, callbacks:{…} } }
  // Respeta los callbacks de siempre (title/label/afterLabel/afterBody/footer).
  _esc: function(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  },
  _tooltipEl: function() {
    if (App.estado._tipEl && document.body.contains(App.estado._tipEl)) return App.estado._tipEl;
    var el = document.createElement('div');
    el.className = 'chart-tip';
    document.body.appendChild(el);
    App.estado._tipEl = el;
    return el;
  },
  _ocultarTip: function() {
    if (App.estado._tipEl) App.estado._tipEl.classList.remove('is-on');
  },
  _tipExterno: function(ctx) {
    var el = App._tooltipEl();
    var tt = ctx.tooltip;
    if (!tt || tt.opacity === 0) { el.classList.remove('is-on'); return; }
    var esc = App._esc, html = '';
    var titulo = (tt.title || []).join(' ');
    if (titulo) html += '<div class="chart-tip-t">' + esc(titulo) + '</div>';
    var colores = tt.labelColors || [];
    (tt.body || []).forEach(function(b, i) {
      var lc  = colores[i] || {};
      var col = lc.backgroundColor || lc.borderColor || '';
      (b.before || []).forEach(function(l){ html += '<div class="chart-tip-l">' + esc(l) + '</div>'; });
      (b.lines  || []).forEach(function(l, j) {
        html += '<div class="chart-tip-l">' +
          ((j === 0 && col) ? '<span class="chart-tip-dot" style="background:' + col + '"></span>' : '') +
          esc(l) + '</div>';
      });
      // afterLabel (explicaciones por punto) va como texto secundario.
      if ((b.after || []).length)
        html += '<div class="chart-tip-d">' + b.after.map(esc).join('<br>') + '</div>';
    });
    if ((tt.afterBody || []).length)
      html += '<div class="chart-tip-d">' + tt.afterBody.map(esc).join('<br>') + '</div>';
    if ((tt.footer || []).length)
      html += '<div class="chart-tip-f">' + tt.footer.map(esc).join('<br>') + '</div>';
    el.innerHTML = html;
    el.classList.add('is-on');
    // Se coloca junto al cursor y se reacomoda para no salirse de la ventana.
    var r = ctx.chart.canvas.getBoundingClientRect();
    var w = el.offsetWidth, h = el.offsetHeight;
    var x = r.left + tt.caretX + 14;
    var y = r.top  + tt.caretY - h / 2;
    if (x + w > window.innerWidth  - 8) x = r.left + tt.caretX - w - 14;  // se voltea a la izquierda
    if (x < 8) x = 8;
    if (y < 8) y = 8;
    if (y + h > window.innerHeight - 8) y = window.innerHeight - h - 8;
    el.style.left = Math.round(x) + 'px';
    el.style.top  = Math.round(y) + 'px';
  },

  toggleSidebar: function() {
    var sidebar = document.getElementById('sidebar');
    var overlay = document.getElementById('sidebar-overlay');
    if (sidebar) sidebar.classList.toggle('sidebar-open');
    if (overlay) overlay.classList.toggle('show');
  },

  closeSidebar: function() {
    var sidebar = document.getElementById('sidebar');
    var overlay = document.getElementById('sidebar-overlay');
    if (sidebar) sidebar.classList.remove('sidebar-open');
    if (overlay) overlay.classList.remove('show');
  },

  // ── Selector reutilizable de animal ──────────────────────────────────
  // Muestra una lista buscable de animales activos.
  // Cuando el usuario elige uno, dispara App.estado._cbSelector(codigo).
  _mostrarSelectorAnimal: function(titulo) {
    App.api('listAnimales', [{ soloActivos: true }], function(lista) {
      App.estado.animalesLista = lista;
      var seenF = {}, fincas = [];
      lista.forEach(function(a) {
        if (a.predio && !seenF[a.predio]) { seenF[a.predio] = 1; fincas.push(a.predio); }
      });
      fincas.sort();
      var html = '<div class="p-6">' +
        '<div class="flex items-center justify-between mb-4">' +
          '<h2 class="text-lg font-bold text-gray-800">' + titulo + '</h2>' +
          '<button onclick="App.cerrarModal()" class="text-gray-400 hover:text-gray-700 text-2xl leading-none">×</button>' +
        '</div>' +
        '<div class="flex gap-2 mb-3">' +
          '<input type="text" id="sel-q" placeholder="Escribe el código o nombre del animal…" ' +
            'class="form-input flex-1" autocomplete="off">' +
          '<select id="sel-finca" class="form-input w-40 text-sm">' +
            '<option value="">Todas las fincas</option>' +
            fincas.map(function(f){ return '<option value="' + f + '">' + f + '</option>'; }).join('') +
          '</select>' +
        '</div>' +
        '<div class="text-xs text-gray-400 mb-2" id="sel-count">' + lista.length + ' animales activos</div>' +
        '<div id="sel-lista" class="space-y-1 max-h-64 overflow-y-auto pr-1">';

      if (lista.length === 0) {
        html += '<p class="text-center text-gray-400 py-8 text-sm">No hay animales activos registrados.</p>';
      } else {
        lista.forEach(function(a) {
          var dias = a.dias_en_finca ? a.dias_en_finca + ' d' : '—';
          // data-busqueda: campo indexado para búsqueda — no depende de textContent
          var busq = (String(a.codigo) + ' ' + (a.tipo||'') + ' ' + (a.predio||'') + ' ' + (a.propietario||'')).toLowerCase();
          html += '<div class="sel-item flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer ' +
            'hover:bg-green-50 border border-transparent hover:border-green-200 transition-colors" ' +
            'data-predio="' + (a.predio || '') + '" ' +
            'data-busqueda="' + busq + '" ' +
            'onclick="App._elegirAnimal(\'' + String(a.codigo).replace(/'/g, "\\'") + '\')">' +
            '<div class="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center shrink-0">' +
              '<span class="text-green-800 font-bold text-sm">' + String(a.codigo).substring(0,3) + '</span>' +
            '</div>' +
            '<div class="flex-1 min-w-0">' +
              '<div class="font-semibold text-gray-800">' + a.codigo +
                (a.estado_reproductivo === 'Preñada' ? ' <span title="Preñada"><i class="ph ph-baby" aria-hidden="true"></i></span>' : '') + '</div>' +
              '<div class="text-gray-400 text-xs truncate">' + (a.tipo || '—') + ' · ' + (a.predio || '—') + '</div>' +
            '</div>' +
            '<div class="text-right text-xs text-gray-400 shrink-0">' +
              '<div class="font-medium">' + (a.propietario || '') + '</div>' +
              '<div>' + dias + ' en finca</div>' +
            '</div>' +
          '</div>';
        });
      }

      html += '</div></div>';
      App.abrirModal(html);
      // Adjuntar listeners JS directamente — más confiable que oninput inline en HtmlService
      setTimeout(function() {
        var q = document.getElementById('sel-q');
        var f = document.getElementById('sel-finca');
        if (q) {
          q.focus();
          ['input','keyup','keydown','change'].forEach(function(ev) {
            q.addEventListener(ev, function() { App._filtrarSelector(); });
          });
        }
        if (f) f.addEventListener('change', function() { App._filtrarSelector(); });
      }, 120);
    });
  },

  _filtrarSelector: function() {
    var q     = ((document.getElementById('sel-q')     || {}).value || '').toLowerCase().trim();
    var finca = ((document.getElementById('sel-finca') || {}).value || '');
    var vis = 0;
    document.querySelectorAll('.sel-item').forEach(function(el) {
      var busq = (el.dataset.busqueda || '');  // usa campo pre-indexado, no textContent
      var f    = (el.dataset.predio   || '');
      var ok   = (!q || busq.includes(q)) && (!finca || f === finca);
      el.style.display = ok ? '' : 'none';
      if (ok) vis++;
    });
    var cnt = document.getElementById('sel-count');
    if (cnt) cnt.textContent = vis + ' animal' + (vis !== 1 ? 'es' : '') + (q || finca ? ' encontrado' + (vis !== 1 ? 's' : '') : ' activos');
  },

  // Llamado cuando el usuario hace clic en un animal del selector.
  _elegirAnimal: function(codigo) {
    var cb = App.estado._cbSelector;
    App.estado._cbSelector = null;
    if (cb) cb(codigo);
  },

  // ── DASHBOARD ────────────────────────────────────────────────────────
  vistaDashboard: function() {
    App.renderMain('<div class="flex justify-center py-16"><div class="spinner text-green-700 w-8 h-8"></div></div>');
    // getDashboardFull devuelve { dashboard, evolucion } en una sola llamada
    // evitando el segundo cold-start que causaba el timeout de 15s
    App.api('getDashboardFull', [App.estado.filtros], function(data) {
      App.estado.dashboardData = data.dashboard;
      App._renderDashboard(data.dashboard, data.evolucion, data.dinamica);
    });
  },

  _renderDashboard: function(d, evol, dinamica) {
    var k    = d.kpis;
    var fmt  = App.fmt;
    // Los seis primeros son la paleta categorica (--c-*); el septimo es el neutro
    // para lo que sobra, y va en tierra como el resto del tema.
    var PAL  = ['#3fd08a','#31c7d6','#5b9df0','#f0b44a','#b48cf0','#f07a94','#8f8578'];
    var NICE = { 'VACA':'Vacas','NOVILLA VIENTRE':'Novillas de vientre','TERNERA LEVANTE':'Terneras de levante','TERNERA':'Terneras','TERNERO':'Terneros','TERNERO LEVANTE':'Terneros de levante','TORO':'Toros' };

    // ── Derivados de la tabla resumen ──
    var preds = {}, tipos = {}, fincaStats = {};
    d.tablaResumen.forEach(function(a) {
      var p = a.predio || 'Sin finca';
      preds[p] = (preds[p] || 0) + 1;
      if (!fincaStats[p]) fincaStats[p] = { n:0, pesoSum:0, pesoCnt:0, gdps:[], riesgo:0 };
      var s = fincaStats[p]; s.n++;
      var pw = parseFloat(a.pesoActual); if (!isNaN(pw)) { s.pesoSum += pw; s.pesoCnt++; }
      var gd = parseFloat(a.ultimaGdp);  if (a.ultimaGdp !== '' && !isNaN(gd)) s.gdps.push(gd);
      if (a.clasificacion === 'BAJO' || a.clasificacion === 'CRITICO') s.riesgo++;
      var t = a.tipo || 'Sin tipo'; tipos[t] = (tipos[t] || 0) + 1;
    });
    var numFincas = Object.keys(preds).length;
    var dist      = d.distribucion || {};
    var bajos     = (dist.BAJO || 0) + (dist.CRITICO || 0);   // exigen accion ya
    var totalDist = Object.keys(dist).reduce(function(s, kk){ return s + (dist[kk] || 0); }, 0);

    // Comparativo por finca (ordenado por GDP desc)
    var fincaArr = Object.keys(fincaStats).map(function(p) {
      var s = fincaStats[p];
      return { finca:p, n:s.n,
        peso:(s.pesoCnt ? s.pesoSum/s.pesoCnt : 0),
        gdp:(s.gdps.length ? s.gdps.reduce(function(a,b){ return a+b; }, 0)/s.gdps.length : 0),
        riesgoPct:(s.n ? Math.round(s.riesgo/s.n*100) : 0) };
    }).sort(function(a,b){ return b.gdp - a.gdp; });
    var gdpMax = fincaArr.reduce(function(m,f){ return Math.max(m, f.gdp); }, 0.001);

    // Rankings por GDP (mejores y peores)
    var conGdp = d.tablaResumen.filter(function(a){ var g = parseFloat(a.ultimaGdp); return a.ultimaGdp !== '' && !isNaN(g); })
      .map(function(a){ return { c:a.codigo, m:(NICE[String(a.tipo).toUpperCase()] || a.tipo || '—') + ' · ' + (a.predio || '—'), g:parseFloat(a.ultimaGdp) }; });
    var rankTop    = conGdp.slice().sort(function(a,b){ return b.g - a.g; }).slice(0, 5);
    var rankBottom = conGdp.slice().sort(function(a,b){ return a.g - b.g; }).slice(0, 6);

    // % del hato "en meta" (GDP ≥ 0.4 = NORMAL o mejor), sobre los animales con datos
    var conDatos = totalDist - (dist.SIN_DATOS || 0);
    var enMeta   = (dist.SUPERA || 0) + (dist.CUMPLE || 0);
    var pctMeta  = conDatos > 0 ? Math.round(enMeta / conDatos * 100) + '%' : '—';
    // Ojo: CASI tambien esta por debajo del objetivo. Confundir esta cifra con
    // "bajos" hacia que la tarjeta dijera "50%" y "4 de 6" a la vez.
    // Va aqui y no antes: depende de conDatos y enMeta, declarados justo arriba.
    var bajoMeta = Math.max(0, conDatos - enMeta);

    // Control de pesaje: animales con +45 días sin medición (o nunca medidos)
    var sinMedir = d.tablaResumen.filter(function(a) {
      return a.diasSinMedir === null || a.diasSinMedir === undefined || a.diasSinMedir >= 45;
    }).map(function(a) {
      return { c: a.codigo, p: a.predio || '—', t: NICE[String(a.tipo).toUpperCase()] || a.tipo || '—',
               dias: (a.diasSinMedir === null || a.diasSinMedir === undefined) ? null : a.diasSinMedir };
    }).sort(function(x, y) {
      var dx = (x.dias === null) ? 1e9 : x.dias, dy = (y.dias === null) ? 1e9 : y.dias;
      return dy - dx;
    });
    // La lista se guarda para que la tarjeta pueda abrirla: un número sin la
    // lista detrás obliga a buscar los quince animales a mano, uno por uno.
    App._sinMedir = sinMedir;

    // Crecimiento neto del hato en el período de la dinámica (entradas - salidas)
    var dinOk = dinamica && dinamica.length;
    var crec  = dinOk ? dinamica.reduce(function(s, x){ return s + (x.entradas - x.salidas); }, 0) : 0;

    // Agenda: alertas que NO son de rendimiento ni de pesaje (sanidad, partos, reproducción)
    var AGENDA_TIPOS = { SANITARIO:1, PARTO_PROXIMO:1, GESTACION_VENCIDA:1, INTERVALO_PARTO:1 };
    var agenda = d.alertas.filter(function(a){ return AGENDA_TIPOS[a.tipo]; });
    var partosProx = d.alertas.filter(function(a){ return a.tipo === 'PARTO_PROXIMO' || a.tipo === 'GESTACION_VENCIDA'; }).length;

    // Conclusiones rápidas — todas derivadas de datos reales, nunca inventadas
    var ins = [];
    if (fincaArr.length > 1 && fincaArr[0].gdp > 0) {
      ins.push({ ic:'medal', c:'var(--ok)', h:'<b>' + fincaArr[0].finca + '</b> lidera el rendimiento con GDP promedio de <b>' + fmt(fincaArr[0].gdp, 3) + ' kg/día</b>.' });
    }
    if (totalDist > 0) {
      ins.push(bajos > 0
        ? { ic:'warning', c:(Math.round(bajos/totalDist*100) >= 30 ? 'var(--danger)' : 'var(--warn)'), h:'<b>' + bajos + ' de ' + totalDist + '</b> animales (' + Math.round(bajos/totalDist*100) + '%) están en rendimiento bajo o crítico.' }
        : { ic:'check-circle', c:'var(--ok)', h:'Ningún animal en rendimiento bajo o crítico.' });
    }
    if (dinOk && crec !== 0) {
      ins.push({ ic:(crec > 0 ? 'trend-up' : 'trend-down'), c:(crec > 0 ? 'var(--ok)' : 'var(--warn)'),
        h:'El hato ' + (crec > 0 ? 'creció' : 'se redujo en') + ' <b>' + Math.abs(crec) + ' cabeza' + (Math.abs(crec) !== 1 ? 's' : '') + '</b> en los últimos ' + dinamica.length + ' meses.' });
    }
    ins.push(sinMedir.length > 0
      ? { ic:'clock-countdown', c:'var(--warn)', h:'<b>' + sinMedir.length + '</b> animal' + (sinMedir.length !== 1 ? 'es' : '') + ' sin pesaje reciente (+45 días o nunca medidos).' }
      : { ic:'check-circle', c:'var(--ok)', h:'Pesajes al día: ningún animal supera 45 días sin medición.' });
    if (partosProx > 0) {
      ins.push({ ic:'baby', c:'var(--c-cyan)', h:'<b>' + partosProx + '</b> gestación' + (partosProx !== 1 ? 'es' : '') + ' avanzada' + (partosProx !== 1 ? 's' : '') + ' — preparar seguimiento de parto.' });
    }

    // Clasificacion GDP: delega en la escala unica (App.clasificarGdp).
    function _clasifG(g) {
      var k = App.clasificarGdp(g) || 'SIN_DATOS';
      return [App.GDP_INFO[k].label, App.GDP_INFO[k].badge];
    }

    var html = '<div class="dx-wrap">';

    // Encabezado + filtros
    html += '<div class="dx-head">' +
      '<div><h2 class="dx-title">Mi ganadería · Sala de Control Ganadero</h2>' +
        '<div class="dx-sub"><b>' + k.totalActivos + ' animales activos</b> en ' + numFincas + ' finca' + (numFincas !== 1 ? 's' : '') + ' · <span style="color:var(--ok);font-weight:700">' + pctMeta + ' del hato en ganancia óptima</span> (≥ 0.400 kg/día)</div></div>' +
      '<div class="dx-toolbar">' +
        App._selectorFiltro('predio',      'Todas las fincas') +
        App._selectorFiltro('tipo',        'Todos los tipos') +
        App._selectorFiltro('propietario', 'Todos los propietarios') +
        App._selectorFiltro('estado',      'Todos los estados') +
      '</div>' +
    '</div>';

    // 1 · Cifras clave — 5 tarjetas KPI de alto impacto
    function _kpi(kc, icon, val, lab, sub, alTocar) {
      return '<div class="dx-kpi' + (alTocar ? ' dx-kpi-abre' : '') + '" style="--kc:var(--c-' + kc + ')"' +
        (alTocar ? ' onclick="' + alTocar + '" role="button" tabindex="0" title="Toca para ver cuáles son"' : '') + '>' +
        '<div class="dx-kpi-top"><span class="dx-kpi-lab">' + lab + '</span><span class="dx-kpi-ico"><i class="ph ph-' + icon + '"></i></span></div>' +
        '<div class="dx-kpi-val">' + val + '</div>' +
        '<div class="dx-kpi-sub">' + sub + (alTocar ? ' <span class="dx-kpi-ver">ver cuáles →</span>' : '') + '</div></div>';
    }
    var gdpClas = _clasifG(parseFloat(k.gdpPromedio) || 0);
    html += '<div class="dx-kpis">' +
      _kpi('green', 'cow',            k.totalActivos + ' <small>cabezas</small>',                    'Censo activo',     'En ' + numFincas + ' finca' + (numFincas !== 1 ? 's' : '')) +
      _kpi('blue',  'scales',         fmt(k.pesoPromedio, 1) + ' <small>kg</small>',                 'Peso promedio',    'Media actual del hato') +
      _kpi('amber', 'trend-up',       fmt(k.gdpPromedio, 3) + ' <small>kg/d</small>',                'GDP promedio',     '<span class="badge badge-mini ' + gdpClas[1] + '" style="vertical-align:middle">' + gdpClas[0] + '</span> Meta: 0.400') +
      _kpi('cyan',  'target',         pctMeta,                                                       'En meta ganadera', conDatos > 0 ? enMeta + ' de ' + conDatos + ' evaluados' : 'Sin mediciones') +
      _kpi(sinMedir.length ? 'rose' : 'violet', sinMedir.length ? 'clock-countdown' : 'calendar-check',
           (sinMedir.length ? sinMedir.length + ' <small>pendientes</small>' : k.medicionesMes + ' <small>pesajes</small>'),
           (sinMedir.length ? 'Sin báscula +45d' : 'Pesajes del mes'),
           (sinMedir.length ? 'Revisión en corral' : 'Hato al día ✓'),
           (sinMedir.length ? 'App.verSinMedir()' : '')) +
    '</div>';

    // 2 · Macro-Tendencias del Hato (Evolución de Peso + Dinámica Poblacional)
    html += '<div class="dx-grid2">' +
      '<div class="dx-panel"><div class="dx-phead"><span class="dx-secico" style="--sc:var(--c-green)"><i class="ph ph-trend-up"></i></span>' +
        '<div class="dx-ptitles"><div class="dx-ptitle">Evolución del Peso Promedio</div>' +
        '<div class="dx-psub">Tendencia histórica mensual del hato en kilogramos' + (evol && evol.length ? '.' : ' — datos en recopilación.') + '</div></div></div>' +
        '<div class="dx-chart dx-tall"><canvas id="chart-evol"></canvas></div></div>' +
      '<div class="dx-panel"><div class="dx-phead"><span class="dx-secico" style="--sc:var(--c-cyan)"><i class="ph ph-arrows-left-right"></i></span>' +
        '<div class="dx-ptitles"><div class="dx-ptitle">Dinámica Poblacional del Hato</div>' +
        '<div class="dx-psub">Entradas (compras/nacimientos) vs. Salidas (ventas/bajas)' + (dinOk ? ' · ' + (crec >= 0 ? 'Balance neto: +' : 'Balance neto: ') + crec + ' cabezas.' : '.') + '</div></div></div>' +
        '<div class="dx-chart dx-tall"><canvas id="chart-dinamica"></canvas></div></div>' +
    '</div>';

    // 3 · Fila de Estructura y Rendimiento (Composición · Estado GDP · Preñez)
    var REPRO_SLOTS = [
      { key:'PRENADA', lab:'Preñadas',    col:'#eab246',
        desc:'Gestación confirmada en la última palpación.' },
      { key:'VACIA',   lab:'Vacías',      col:'#31c7d6',
        desc:'Ya se les hizo el chequeo: confirmadas SIN preñez, o en celo.' },
      { key:'DUDOSA',  lab:'Dudosas',     col:'#f0843c',
        desc:'Palpación no concluyente: podría estar preñada. Conviene repetirla.' },
      { key:'SINCHK',  lab:'Sin chequeo', col:'#8f8578',
        desc:'Aún NO se les ha hecho el chequeo: no se conoce su estado reproductivo.' }
    ];
    var reproN = { PRENADA:0, VACIA:0, DUDOSA:0, SINCHK:0 };
    d.tablaResumen.forEach(function(a) {
      if (String(a.tipo || '').toUpperCase().indexOf('NOVILLA') < 0) return;
      var er = String(a.estadoReproductivo || '').trim();
      if      (er === 'Preñada')                        reproN.PRENADA++;
      else if (er === 'Dudosa')                         reproN.DUDOSA++;
      else if (er === 'No preñada' || er === 'En celo') reproN.VACIA++;
      else                                              reproN.SINCHK++;
    });
    var reproTot = reproN.PRENADA + reproN.VACIA + reproN.DUDOSA + reproN.SINCHK;
    var reproPct = reproTot ? Math.round(reproN.PRENADA / reproTot * 100) : 0;

    html += '<div class="dx-grid3">' +
      '<div class="dx-panel"><div class="dx-phead"><span class="dx-secico" style="--sc:var(--c-cyan)"><i class="ph ph-chart-donut"></i></span>' +
        '<div class="dx-ptitles"><div class="dx-ptitle">Composición por Categoría</div>' +
        '<div class="dx-psub">Inventario activo clasificado.</div></div></div>' +
        '<div class="dx-comp"><div class="dx-donut"><canvas id="chart-comp"></canvas>' +
          '<div class="dx-dcenter"><span class="dx-dnum">' + k.totalActivos + '</span><span class="dx-dlab">animales</span></div></div>' +
          '<div class="dx-legend" id="comp-legend"></div></div></div>' +
      '<div class="dx-panel"><div class="dx-phead"><span class="dx-secico" style="--sc:var(--c-amber)"><i class="ph ph-gauge"></i></span>' +
        '<div class="dx-ptitles"><div class="dx-ptitle">Semáforo de Rendimiento (GDP)</div>' +
        '<div class="dx-psub">' + (conDatos > 0 ? bajoMeta + ' de ' + conDatos + ' por debajo del objetivo.' : 'Sin mediciones para clasificar.') + '</div></div></div>' +
        '<div class="dx-comp"><div class="dx-donut"><canvas id="chart-estado"></canvas>' +
          '<div class="dx-dcenter"><span class="dx-dnum">' + pctMeta + '</span><span class="dx-dlab">en meta</span></div></div>' +
          '<div class="dx-legend" id="estado-legend"></div></div></div>' +
      '<div class="dx-panel"><div class="dx-phead"><span class="dx-secico" style="--sc:var(--pren)"><i class="ph ph-baby"></i></span>' +
        '<div class="dx-ptitles"><div class="dx-ptitle">Preñez en Novillas de Vientre</div>' +
        '<div class="dx-psub">' + (reproTot ? reproN.PRENADA + ' de ' + reproTot + ' preñadas' + (reproN.SINCHK ? ' · ' + reproN.SINCHK + ' sin palpar' : '') + '.' : 'Sin novillas de vientre en selección.') + '</div></div></div>' +
        (reproTot
          ? '<div class="dx-comp"><div class="dx-donut"><canvas id="chart-repro"></canvas>' +
              '<div class="dx-dcenter"><span class="dx-dnum">' + reproPct + '%</span><span class="dx-dlab">preñadas</span></div></div>' +
              '<div class="dx-legend" id="repro-legend"></div></div>'
          : '<div class="dx-psub" style="padding:16px 2px">No hay novillas de vientre registradas.</div>') +
      '</div>' +
    '</div>';

    // 4 · Alertas Operativas y Desempeño Individual (Split)
    var topRows = rankTop.map(function(a) {
      var cb = _clasifG(a.g);
      return '<tr onclick="App.irAnimal(\'' + String(a.c).replace(/'/g, "\\'") + '\')">' +
        '<td><span class="cod">' + a.c + '</span><span class="sec">' + a.m + '</span></td>' +
        '<td class="num"><b>+' + fmt(a.g, 3) + '</b> kg/d</td>' +
        '<td class="num"><span class="badge ' + cb[1] + '">' + cb[0] + '</span></td></tr>';
    }).join('');

    var atenderRows = rankBottom.map(function(a) {
      var cb = _clasifG(a.g);
      return '<tr onclick="App.irAnimal(\'' + String(a.c).replace(/'/g, "\\'") + '\')">' +
        '<td><span class="cod">' + a.c + '</span><span class="sec">' + a.m + '</span></td>' +
        '<td class="num"><b>' + (a.g >= 0 ? '+' : '') + fmt(a.g, 3) + '</b> kg/d</td>' +
        '<td class="num"><span class="badge ' + cb[1] + '">' + cb[0] + '</span></td></tr>';
    }).join('');

    html += '<div class="dx-split">' +
      '<div class="dx-panel"><div class="dx-phead"><span class="dx-secico" style="--sc:var(--c-amber)"><i class="ph ph-lightning"></i></span>' +
        '<div class="dx-ptitles"><div class="dx-ptitle">Alertas y Lectura del Hato</div>' +
        '<div class="dx-psub">Eventos sanitarios, partos y diagnósticos automáticos.</div></div></div>';

    if (agenda.length) {
      var AGENDA_MAX = 4;
      html += '<div class="dx-alerts" style="margin-bottom:14px">';
      agenda.slice(0, AGENDA_MAX).forEach(function(a) {
        var m = App._alertaMeta(a.tipo, a.nivel);
        html += '<a class="dx-alert" href="#/animal/' + encodeURIComponent(a.codigo) + '" style="--ac:' + m.color + '">' +
          '<span class="dx-aico"><i class="ph ph-' + m.icon + '"></i></span>' +
          '<span class="dx-abody"><span class="dx-atop"><span class="dx-acode">' + a.codigo + '</span><span class="dx-atag">' + m.tag + '</span></span>' +
            '<span class="dx-amsg">' + a.mensaje + '</span></span></a>';
      });
      html += '</div>';
    }

    html += '<div class="dx-ins">' + ins.map(function(i) {
      return '<div class="dx-irow" style="--ic:' + i.c + '"><i class="ph ph-' + i.ic + '"></i><span>' + i.h + '</span></div>';
    }).join('') + '</div></div>';

    html += '<div class="dx-panel"><div class="dx-phead"><span class="dx-secico" style="--sc:var(--c-green)"><i class="ph ph-trophy"></i></span>' +
        '<div class="dx-ptitles"><div class="dx-ptitle">Desempeño Individual de Reses</div>' +
        '<div class="dx-psub">Top convertidores vs. animales con ganancia crítica o bajo peso.</div></div></div>' +
        (rankTop.length || rankBottom.length
          ? '<div style="overflow-x:auto"><table class="dx-mtable"><thead><tr><th>Animal · Categoría · Finca</th><th class="num">Última GDP</th><th class="num">Estado</th></tr></thead><tbody>' +
            (rankTop.length ? topRows : '') +
            (rankBottom.length ? atenderRows : '') +
            '</tbody></table></div>' +
            '<a class="dx-more" href="#/situacion">Ver situación completa del rebaño <i class="ph ph-arrow-right"></i></a>'
          : '<div class="dx-psub" style="padding:8px 2px">Sin mediciones suficientes.</div>') + '</div>' +
    '</div>';

    // 5 · Comparativo por finca (tabla)
    html += '<div class="dx-panel"><div class="dx-phead"><span class="dx-secico" style="--sc:var(--c-violet)"><i class="ph ph-map-pin-area"></i></span>' +
      '<div class="dx-ptitles"><div class="dx-ptitle">Comparativo y Rendimiento por Predio</div>' +
      '<div class="dx-psub">Métricas consolidadas por finca. Clic en una fila para filtrar el panel.</div></div></div>' +
      '<div style="overflow-x:auto"><table class="dx-table"><thead><tr>' +
        '<th>Finca / Predio</th><th class="num">Animales</th><th class="num">Peso prom.</th><th class="num">GDP promedio</th><th class="num">En riesgo</th>' +
      '</tr></thead><tbody>';
    fincaArr.forEach(function(f) {
      var rc = f.riesgoPct >= 30 ? 'bad' : (f.riesgoPct >= 15 ? 'warn' : 'ok');
      var rv = f.riesgoPct >= 30 ? 'var(--danger)' : (f.riesgoPct >= 15 ? 'var(--warn)' : 'var(--ok)');
      html += '<tr onclick="App.aplicarFiltro(\'predio\', \'' + String(f.finca).replace(/'/g, "\\'") + '\')">' +
        '<td><span class="dx-fname"><span class="dx-fdot" style="background:' + rv + ';color:' + rv + '"></span>' + f.finca + '</span></td>' +
        '<td class="num"><b>' + f.n + '</b> cabezas</td>' +
        '<td class="num"><b>' + fmt(f.peso, 1) + '</b> kg</td>' +
        '<td class="num"><span class="dx-gdpcell"><span class="dx-gdptrack"><span class="dx-gdpfill" style="width:' + Math.round(f.gdp/gdpMax*100) + '%"></span></span><span class="dx-gdpval">+' + fmt(f.gdp, 3) + ' kg/d</span></span></td>' +
        '<td class="num"><span class="dx-risk ' + rc + '">' + f.riesgoPct + '%</span></td>' +
      '</tr>';
    });
    html += '</tbody></table></div></div>';

    html += '</div>';
    App.renderMain(html);

    // Poblar selects de filtros con TODAS las opciones (no en cascada).
    // El backend devuelve opcionesFiltro con los valores de todos los animales;
    // si no viniera (backend viejo), se deriva del resumen como respaldo.
    var ofs = d.opcionesFiltro;
    if (!ofs) {
      var seenP = {}, seenT = {}, seenProp = {}, predios = [], tiposL = [], propietarios = [];
      d.tablaResumen.forEach(function(a) {
        if (a.predio      && !seenP[a.predio])         { seenP[a.predio]         = 1; predios.push(a.predio); }
        if (a.tipo        && !seenT[a.tipo])           { seenT[a.tipo]           = 1; tiposL.push(a.tipo); }
        if (a.propietario && !seenProp[a.propietario]) { seenProp[a.propietario] = 1; propietarios.push(a.propietario); }
      });
      predios.sort(); tiposL.sort(); propietarios.sort();
      ofs = { predios: predios, tipos: tiposL, propietarios: propietarios };
    }
    var filterOpts = { predio: ofs.predios || [], tipo: ofs.tipos || [], propietario: ofs.propietarios || [], estado: ['ACTIVO', 'VENDIDO', 'MUERTO'] };
    ['predio', 'tipo', 'propietario', 'estado'].forEach(function(campo) {
      var el = document.getElementById('filtro-' + campo);
      if (!el) return;
      var cur = App.estado.filtros[campo];
      filterOpts[campo].forEach(function(v) {
        var opt = document.createElement('option');
        opt.value = v; opt.textContent = v;
        if (v === cur) opt.selected = true;
        el.appendChild(opt);
      });
    });

    // ── Gráficos (colores tomados del tema activo: oscuro / claro) ──────
    var isLight = document.documentElement.getAttribute('data-theme') === 'light';
    var SURF    = App._tok('--chart-surface', isLight ? '#fdfcf8' : '#211d18');
    var GRIDC   = App._tok('--chart-grid',  'rgba(150,140,120,0.22)');
    var TICKC   = App._tok('--chart-tick',  '#9c9384');
    var LABC    = App._tok('--chart-label', '#cfc9bd');
    var ACCENT  = isLight ? '#2f7f4e' : '#5cc46f';   // verde pasto del tema
    Chart.defaults.font.family = 'Geist, system-ui, sans-serif';
    Chart.defaults.font.size   = 12.5;
    Chart.defaults.color       = TICKC;

    // Destruir gráficos anteriores para evitar fugas al re-renderizar
    Object.keys(App.estado.charts || {}).forEach(function(kk){ try { App.estado.charts[kk].destroy(); } catch(e) {} });
    App.estado.charts = {};

    // Plugin: etiqueta de valor sobre/junto a cada barra (color de texto del tema)
    var dataLabel = { id: 'dxLabel', afterDatasetsDraw: function(chart) {
      var ctx = chart.ctx, horiz = chart.options.indexAxis === 'y';
      chart.data.datasets.forEach(function(ds, di) {
        chart.getDatasetMeta(di).data.forEach(function(el, i) {
          var v = ds.data[i]; if (v == null) return;
          ctx.save(); ctx.fillStyle = LABC; ctx.font = '700 12px Geist, system-ui, sans-serif';
          if (horiz) { ctx.textAlign = 'left';   ctx.textBaseline = 'middle'; ctx.fillText(v, el.x + 9, el.y); }
          else       { ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText(v, el.x, el.y - 7); }
          ctx.restore();
        });
      });
    }};

    // 1 · Composición del hato (dona) — por categoría estándar (normalizada)
    // Agrupa variantes de 'tipo' (mayúsculas/espacios/singular-plural) en las
    // categorías canónicas del sistema, así ninguna se pierde ni sale con nombre raro.
    function _catKey(t) {
      var s = String(t || '').toUpperCase().replace(/\s+/g, ' ').trim();
      if (s.indexOf('TORO') >= 0)    return 'TORO';
      if (s.indexOf('VACA') >= 0)    return 'VACA';
      if (s.indexOf('NOVILLA') >= 0) return 'NOVILLA VIENTRE';
      if (s.indexOf('TERNERA') >= 0) return (s.indexOf('LEVANTE') >= 0 ? 'TERNERA LEVANTE' : 'TERNERA');
      if (s.indexOf('TERNERO') >= 0) return (s.indexOf('LEVANTE') >= 0 ? 'TERNERO LEVANTE' : 'TERNERO');
      return s ? s : 'SIN CATEGORÍA';
    }
    var CAT_ORDER = ['VACA','NOVILLA VIENTRE','TERNERA LEVANTE','TERNERA','TERNERO LEVANTE','TERNERO','TORO','SIN CATEGORÍA'];
    var CAT_NICE  = { 'VACA':'Vacas','NOVILLA VIENTRE':'Novillas de vientre','TERNERA LEVANTE':'Terneras de levante','TERNERA':'Terneras','TERNERO LEVANTE':'Terneros de levante','TERNERO':'Terneros','TORO':'Toros','SIN CATEGORÍA':'Sin categoría' };
    var catCount = {};
    d.tablaResumen.forEach(function(a) { var kk = _catKey(a.tipo); catCount[kk] = (catCount[kk] || 0) + 1; });
    var comp = [];
    CAT_ORDER.forEach(function(kk){ if (catCount[kk]) comp.push({ label: CAT_NICE[kk] || kk, n: catCount[kk] }); });
    Object.keys(catCount).forEach(function(kk){ if (CAT_ORDER.indexOf(kk) < 0) comp.push({ label: kk, n: catCount[kk] }); }); // cualquier resto
    // Paleta fija sin reciclar: si hay más categorías que colores, el resto se agrupa en "Otros" (gris)
    if (comp.length > PAL.length) {
      var restoN = comp.slice(PAL.length - 1).reduce(function(s, c){ return s + c.n; }, 0);
      comp = comp.slice(0, PAL.length - 1);
      comp.push({ label: 'Otros', n: restoN });
    }
    comp.forEach(function(c, i) { c.color = PAL[i]; });
    var compTotal = comp.reduce(function(s, c){ return s + c.n; }, 0) || 1;
    var legEl = document.getElementById('comp-legend');
    if (legEl) legEl.innerHTML = comp.map(function(c) {
      var pct = Math.round(c.n / compTotal * 100);
      return '<div class="dx-clrow"><span class="dx-cldot" style="background:' + c.color + '"></span>' +
        '<span class="dx-clname">' + c.label + '</span><span class="dx-cln">' + c.n + '</span><span class="dx-clpct">' + pct + '%</span></div>';
    }).join('');
    var cComp = document.getElementById('chart-comp');
    if (cComp) App.estado.charts.comp = new Chart(cComp, {
      type: 'doughnut',
      data: { labels: comp.map(function(c){ return c.label; }), datasets: [{ data: comp.map(function(c){ return c.n; }), backgroundColor: comp.map(function(c){ return c.color; }), borderWidth: 3, borderColor: SURF, hoverOffset: 6 }] },
      options: { responsive: true, maintainAspectRatio: false, cutout: '70%',
        plugins: { legend: { display: false }, tooltip: { enabled: false, external: App._tipExterno, callbacks: {
          title: function(items){ return items.length ? items[0].label : ''; },
          label: function(c){ return c.parsed + ' de ' + compTotal + ' · ' + Math.round(c.parsed / compTotal * 100) + '%'; } } } } }
    });

    // 2 · Top 5 por rendimiento (barras horizontales — una sola serie, un solo color)
    var cTop5 = document.getElementById('chart-top5');
    if (cTop5 && rankTop.length) App.estado.charts.top5 = new Chart(cTop5, {
      type: 'bar',
      data: { labels: rankTop.map(function(a){ return a.c; }),
        datasets: [{ data: rankTop.map(function(a){ return a.g; }), backgroundColor: ACCENT,
          borderRadius: { topRight: 4, bottomRight: 4 }, borderSkipped: false, maxBarThickness: 18, categoryPercentage: 0.62 }] },
      options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y', layout: { padding: { right: 52 } },
        plugins: { legend: { display: false }, tooltip: { enabled: false, external: App._tipExterno, callbacks: {
          title: function(items){ return items.length ? rankTop[items[0].dataIndex].c : ''; },
          label: function(c){ return c.parsed.x.toFixed(3) + ' kg/día'; },
          afterLabel: function(c){ return rankTop[c.dataIndex].m; } } } },
        scales: { x: { beginAtZero: true, grid: { color: GRIDC }, border: { display: false }, ticks: { padding: 6 } },
                  y: { grid: { display: false }, ticks: { font: { weight: 700 } } } },
        onHover: function(evt, els){ if (evt.native) evt.native.target.style.cursor = els.length ? 'pointer' : 'default'; },
        onClick: function(evt, els){ if (!els.length) return; App.irAnimal(rankTop[els[0].index].c); } },
      plugins: [dataLabel]
    });

    // 3 · Estado del rendimiento (dona semáforo + leyenda clickeable → Situación)
    var RORDER = App.GDP_ORDEN;
    var RCOL = {}, RNAME = {};
    RORDER.forEach(function(k){ RCOL[k] = App.GDP_INFO[k].hex; RNAME[k] = App.GDP_INFO[k].label; });
    var rL = [], rD = [], rC = [], rKeys = [];
    RORDER.forEach(function(key){ if (dist[key]) { rL.push(RNAME[key]); rD.push(dist[key]); rC.push(RCOL[key]); rKeys.push(key); } });
    var legEst = document.getElementById('estado-legend');
    if (legEst) legEst.innerHTML = rKeys.map(function(key, i) {
      var pct = totalDist ? Math.round(rD[i] / totalDist * 100) : 0;
      return '<div class="dx-clrow" style="cursor:pointer" onclick="location.hash=\'#/situacion/' + key + '\'">' +
        '<span class="dx-cldot" style="background:' + rC[i] + '"></span>' +
        '<span class="dx-clname">' + rL[i] + '</span><span class="dx-cln">' + rD[i] + '</span><span class="dx-clpct">' + pct + '%</span></div>';
    }).join('');
    var cEstado = document.getElementById('chart-estado');
    if (cEstado && rD.length) App.estado.charts.estado = new Chart(cEstado, {
      type: 'doughnut',
      data: { labels: rL, datasets: [{ data: rD, backgroundColor: rC, borderWidth: 3, borderColor: SURF, hoverOffset: 6 }] },
      options: { responsive: true, maintainAspectRatio: false, cutout: '70%',
        plugins: { legend: { display: false }, tooltip: { enabled: false, external: App._tipExterno, callbacks: {
          title: function(items){ return items.length ? items[0].label : ''; },
          label: function(c){ return c.parsed + ' animal' + (c.parsed !== 1 ? 'es' : '') +
                                     ' · ' + (totalDist ? Math.round(c.parsed / totalDist * 100) : 0) + '%'; },
          afterLabel: function(){ return 'Clic para ver estos animales.'; } } } },
        onHover: function(evt, els){ if (evt.native) evt.native.target.style.cursor = els.length ? 'pointer' : 'default'; },
        onClick: function(evt, els){ if (!els.length) return; var key = rKeys[els[0].index]; if (key) location.hash = '#/situacion/' + key; } }
    });

    // 3b · Preñez de novillas (dona) — mismo patrón que las donas de arriba.
    // La leyenda lleva nombre + conteo + % como TEXTO: la identidad nunca depende
    // solo del color. Es obligatorio aquí porque en tema claro estos tonos quedan
    // por debajo de 3:1 de contraste sobre blanco.
    var reproSlots = REPRO_SLOTS.filter(function(s){ return reproN[s.key] > 0; });
    var legRepro = document.getElementById('repro-legend');
    if (legRepro) legRepro.innerHTML = reproSlots.map(function(s) {
      var pct = Math.round(reproN[s.key] / reproTot * 100);
      return '<div class="dx-clrow"><span class="dx-cldot" style="background:' + s.col + '"></span>' +
        '<span class="dx-clname">' + s.lab + '</span><span class="dx-cln">' + reproN[s.key] + '</span>' +
        '<span class="dx-clpct">' + pct + '%</span></div>';
    }).join('');
    var cRepro = document.getElementById('chart-repro');
    if (cRepro && reproSlots.length) App.estado.charts.repro = new Chart(cRepro, {
      type: 'doughnut',
      data: { labels: reproSlots.map(function(s){ return s.lab; }),
        datasets: [{ data: reproSlots.map(function(s){ return reproN[s.key]; }),
          backgroundColor: reproSlots.map(function(s){ return s.col; }),
          borderWidth: 3, borderColor: SURF, hoverOffset: 6 }] },
      options: { responsive: true, maintainAspectRatio: false, cutout: '70%',
        plugins: { legend: { display: false }, tooltip: { enabled: false, external: App._tipExterno, callbacks: {
          title: function(items){ return items.length ? items[0].label : ''; },
          label: function(c){ return c.parsed + ' de ' + reproTot + ' · ' + Math.round(c.parsed / reproTot * 100) + '%'; },
          // La descripción del estado. Se lee del arreglo YA FILTRADO (reproSlots),
          // el mismo que alimenta el gráfico: si una categoría queda en 0 y
          // desaparece, los índices siguen coincidiendo.
          afterBody: function(items) {
            var s = items.length ? reproSlots[items[0].dataIndex] : null;
            return s ? s.desc : '';
          } } } } }
    });

    // Etiquetas de mes cortas para los ejes ('2026-02' → 'Feb'; enero muestra el año)
    var MESN = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    function _mesCorto(ym, idx) {
      var s  = String(ym || '');
      var mm = parseInt(s.substring(5, 7), 10);
      if (isNaN(mm) || !MESN[mm - 1]) return s;
      var conAnio = (idx === 0 || mm === 1);
      return MESN[mm - 1] + (conAnio ? ' ' + s.substring(2, 4) : '');
    }

    // 4 · Evolución del peso promedio (línea suave con lavado de área esmeralda)
    var cEvol = document.getElementById('chart-evol');
    if (cEvol && evol && evol.length > 0) {
      var ctxE = cEvol.getContext('2d');
      var fill = ctxE.createLinearGradient(0, 0, 0, 260);
      fill.addColorStop(0, 'rgba(63,208,138,0.25)');
      fill.addColorStop(1, 'rgba(63,208,138,0.01)');
      App.estado.charts.evol = new Chart(cEvol, {
        type: 'line',
        data: { labels: evol.map(function(e, i){ return _mesCorto(e.mes, i); }),
          datasets: [{ data: evol.map(function(e){ return e.pesoPromedio; }), borderColor: '#3fd08a', backgroundColor: fill, borderWidth: 3, tension: 0.35, fill: true, pointRadius: 4, pointHoverRadius: 7, pointBackgroundColor: '#3fd08a', pointBorderColor: SURF, pointBorderWidth: 2 }] },
        options: { responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { enabled: false, external: App._tipExterno, callbacks: {
            title: function(i){ return 'Mes: ' + evol[i[0].dataIndex].mes; },
            label: function(c){ return 'Peso promedio: ' + c.parsed.y.toFixed(1) + ' kg'; },
            afterLabel: function(c){ return 'Sobre ' + evol[c.dataIndex].cantidad + ' animales pesados.'; } } } },
          scales: { y: { grid: { color: GRIDC }, border: { display: false }, ticks: { padding: 8, callback: function(v){ return v + ' kg'; } } }, x: { grid: { display: false } } } }
      });
    }

    // 5 · Dinámica del hato (entradas vs salidas por mes) — barras agrupadas
    var cDin = document.getElementById('chart-dinamica');
    if (cDin && dinamica && dinamica.length) {
      App.estado.charts.dinamica = new Chart(cDin, {
        type: 'bar',
        data: { labels: dinamica.map(function(x, i){ return _mesCorto(x.mes, i); }),
          datasets: [
            { label:'Altas (Ingresos)', data: dinamica.map(function(x){ return x.entradas; }), backgroundColor:'#3fd08a', borderRadius:{ topLeft:5, topRight:5 }, borderSkipped:false, maxBarThickness:28, categoryPercentage:0.65, barPercentage:0.9 },
            { label:'Bajas (Ventas/Bajas)',  data: dinamica.map(function(x){ return x.salidas;  }), backgroundColor:'#f07a94', borderRadius:{ topLeft:5, topRight:5 }, borderSkipped:false, maxBarThickness:28, categoryPercentage:0.65, barPercentage:0.9 }
          ] },
        options: { responsive: true, maintainAspectRatio: false,
          plugins: { legend: { position:'top', align:'end', labels:{ usePointStyle:true, pointStyle:'circle', padding:14, boxHeight:7 } },
            tooltip: { enabled: false, external: App._tipExterno, mode:'index', intersect:false,
              callbacks: { footer: function(items) {
                var e = 0, s = 0;
                items.forEach(function(i){ if (i.dataset.label && i.dataset.label.indexOf('Altas') >= 0) e = i.parsed.y; else s = i.parsed.y; });
                var n = e - s;
                return 'Balance neto: ' + (n >= 0 ? '+' : '') + n + ' cabeza' + (Math.abs(n) !== 1 ? 's' : '');
              } } } },
          scales: { y: { beginAtZero: true, grid: { color: GRIDC }, border: { display: false }, ticks: { padding: 8, precision: 0 } }, x: { grid: { display: false } } } }
      });
    }
  },

  // Metadatos visuales de una alerta (color por nivel, etiqueta + ícono por tipo).
  // Colores desaturados para un acabado sobrio/premium.
  _alertaMeta: function(tipo, nivel) {
    var col = { danger:'#d05f6e', warning:'#cfa24a', orange:'#d08248', info:'#5b9df0' };
    var T = {
      SIN_MEDICION:      { tag:'Sin medir',    icon:'clock-countdown' },
      BAJO_RENDIMIENTO:  { tag:'Rendimiento',  icon:'trend-down' },
      GESTACION_VENCIDA: { tag:'Gestación',    icon:'warning-octagon' },
      PARTO_PROXIMO:     { tag:'Parto',        icon:'baby' },
      SANITARIO:         { tag:'Sanidad',      icon:'first-aid-kit' },
      INTERVALO_PARTO:   { tag:'Reproducción', icon:'arrow-u-up-left' }
    };
    var m = T[tipo] || { tag:'Aviso', icon:'warning-circle' };
    // Para rendimiento la etiqueta refleja la severidad (Crítico / Bajo).
    if (tipo === 'BAJO_RENDIMIENTO') m = { tag: (nivel === 'danger' ? 'Crítico' : 'Bajo'), icon: (nivel === 'danger' ? 'warning-octagon' : 'trend-down') };
    return { tag: m.tag, icon: m.icon, color: (col[nivel] || col.warning) };
  },

  _filtrarTbodyPorClasif: function(clasif) {
    document.querySelectorAll('#tbody-animales tr').forEach(function(tr) {
      var show = clasif === 'SIN_DATOS'
        ? !tr.textContent.match(new RegExp(App.GDP_ORDEN.slice(0, 5).map(function(k){ return App.GDP_INFO[k].label; }).join('|'), 'i'))
        : tr.textContent.includes(clasif);
      tr.style.display = show ? '' : 'none';
    });
    var el = document.getElementById('busca-tabla');
    if (el) el.value = clasif !== 'SIN_DATOS' ? clasif : '';
  },

  _kpiCard: function(icon, label, valor, sub) {
    // Si icon es un nombre Phosphor (letras/guiones) -> tile con glow; si es emoji -> fallback
    var ic = /^[a-z][a-z-]*$/.test(icon)
      ? '<span class="kpi-ico"><i class="ph ph-' + icon + '"></i></span>'
      : '<div class="text-2xl mb-2">' + icon + '</div>';
    return '<div class="kpi-card"><div class="mb-3">' + ic + '</div>' +
      '<div class="kpi-value">' + valor + '</div><div class="kpi-label">' + label + '</div>' +
      (sub ? '<div class="kpi-sub">' + sub + '</div>' : '') + '</div>';
  },
  _selectorFiltro: function(campo, ph) {
    return '<select id="filtro-' + campo + '" onchange="App.aplicarFiltro(\'' + campo + '\', this.value)" class="form-input text-sm py-1.5 w-auto cursor-pointer">' +
      '<option value="">' + ph + '</option></select>';
  },
  aplicarFiltro: function(campo, val) {
    App.estado.filtros[campo] = val;
    App.vistaDashboard();
  },
  _filtrarTbody: function(tbodyId) {
    var q = (document.getElementById('busca-tabla') || document.getElementById('busca-ani') || { value: '' }).value.toLowerCase();
    document.querySelectorAll('#' + tbodyId + ' tr').forEach(function(tr) {
      tr.style.display = tr.textContent.toLowerCase().includes(q) ? '' : 'none';
    });
  },

  // ── LISTA ANIMALES ───────────────────────────────────────────────────
  vistaAnimales: function() {
    App.renderMain('<div class="flex justify-center py-16"><div class="spinner text-green-700 w-8 h-8"></div></div>');
    App.api('listAnimales', [{}], function(lista) {
      App.estado.animalesLista = lista;

      // Año, propietarios y predios únicos para los filtros
      var seenAnio = {}, seenProp2 = {}, seenPredio = {}, anios = [], props2 = [], predios2 = [];
      lista.forEach(function(a) {
        var anio = a.fecha_ingreso ? String(a.fecha_ingreso).substring(0, 4) : '';
        if (anio && !seenAnio[anio]) { seenAnio[anio] = 1; anios.push(anio); }
        if (a.propietario && !seenProp2[a.propietario]) { seenProp2[a.propietario] = 1; props2.push(a.propietario); }
        if (a.predio && !seenPredio[a.predio]) { seenPredio[a.predio] = 1; predios2.push(a.predio); }
      });
      anios.sort().reverse(); props2.sort(); predios2.sort();

      var meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

      var html = App._subtabs('animales', '#/animales') +
        '<div class="bg-white rounded-xl border border-gray-200 overflow-hidden" style="margin-top:16px">' +
        '<div class="px-5 py-3 border-b border-gray-100 flex flex-wrap items-center gap-2">' +
          '<input type="text" id="busca-ani" placeholder="Buscar código, tipo, predio…" oninput="App._filtrarListaAnimales()" class="form-input flex-1 min-w-36 text-sm py-1.5">' +
          '<select id="ani-estado" onchange="App._filtrarListaAnimales()" class="form-input w-36 text-sm py-1.5">' +
            '<option value="">Todos estados</option><option>ACTIVO</option><option>VENDIDO</option><option>MUERTO</option>' +
          '</select>' +
          '<select id="ani-predio" onchange="App._filtrarListaAnimales()" class="form-input w-40 text-sm py-1.5">' +
            '<option value="">Todos predios</option>' + predios2.map(function(p){ return '<option>' + p + '</option>'; }).join('') +
          '</select>' +
          '<select id="ani-prop" onchange="App._filtrarListaAnimales()" class="form-input w-44 text-sm py-1.5">' +
            '<option value="">Todos propietarios</option>' + props2.map(function(p){ return '<option>' + p + '</option>'; }).join('') +
          '</select>' +
          '<select id="ani-anio" onchange="App._filtrarListaAnimales()" class="form-input w-28 text-sm py-1.5">' +
            '<option value="">Todos años</option>' + anios.map(function(a){ return '<option>' + a + '</option>'; }).join('') +
          '</select>' +
          '<select id="ani-mes" onchange="App._filtrarListaAnimales()" class="form-input w-36 text-sm py-1.5">' +
            '<option value="">Todos meses</option>' + meses.map(function(m,i){ return '<option value="' + (i+1) + '">' + m + '</option>'; }).join('') +
          '</select>' +
          // Filtro reproductivo — solo afecta a hembras (los machos se ocultan al usarlo).
          '<select id="ani-repro" onchange="App._filtrarListaAnimales()" class="form-input w-44 text-sm py-1.5">' +
            '<option value="">Todo reproductivo</option>' +
            '<option value="PRENADA">Preñadas</option>' +
            '<option value="DUDOSA">Dudosas</option>' +
            '<option value="CELO">En celo</option>' +
            '<option value="VACIA">○ Vacías (no preñadas)</option>' +
            '<option value="SINCHEQUEO">Sin chequeo</option>' +
            '<option value="HEMBRAS">Todas las hembras</option>' +
          '</select>' +
          '<span id="ani-count" class="text-xs font-semibold ml-auto" style="color:var(--muted)"></span>' +
        '</div>' +
        '<div class="overflow-x-auto"><table class="tabla-ganadero"><thead><tr>' +
          '<th>Código</th><th>Tipo</th><th>Predio</th><th>Propietario</th><th>Indicaciones</th>' +
          '<th>Ingreso</th><th>Peso inicial</th><th>Días finca</th><th>Reproductivo</th><th>Estado</th><th></th>' +
        '</tr></thead><tbody id="tbody-lista">';

      lista.forEach(function(a) {
        var eb = a.estado === 'ACTIVO'  ? 'badge-green'
               : a.estado === 'VENDIDO' ? 'badge-blue' : 'badge-red';
        var aniAnio = a.fecha_ingreso ? String(a.fecha_ingreso).substring(0, 4) : '';
        var aniMes  = a.fecha_ingreso ? String(parseInt(String(a.fecha_ingreso).substring(5, 7), 10)) : '';
        var rf = App._reproFila(a);
        var filaCls = 'fila-link' + (rf.key === 'PRENADA' ? ' fila-prenada' : rf.key === 'DUDOSA' ? ' fila-dudosa' : '');
        html += '<tr class="' + filaCls + '" onclick="App.irAnimal(\'' + String(a.codigo).replace(/'/g, "\\'") + '\')" ' +
          'data-estado="' + (a.estado||'') + '" data-predio="' + (a.predio||'') + '" data-prop="' + (a.propietario||'') + '" data-anio="' + aniAnio + '" data-mes="' + aniMes + '" data-repro="' + rf.key + '">' +
          '<td class="font-semibold">' + a.codigo + '</td>' +
          '<td>' + (a.tipo || '—') + '</td>' +
          '<td>' + (a.predio || '—') + '</td>' +
          '<td>' + (a.propietario || '—') + '</td>' +
          '<td class="text-gray-500 text-xs max-w-xs truncate">' + (a.indicaciones || '—') + '</td>' +
          '<td>' + App.fmtFecha(a.fecha_ingreso) + '</td>' +
          '<td>' + App.fmt(a.peso_inicial, 1) + ' kg</td>' +
          '<td>' + (a.dias_en_finca || '—') + '</td>' +
          '<td>' + rf.chip + '</td>' +
          '<td><span class="badge ' + eb + '">' + a.estado + '</span></td>' +
          '<td class="flex gap-3 items-center">' +
            '<button onclick="event.stopPropagation();App.abrirModalAnimal(\'' + String(a.codigo).replace(/'/g,"'") + '\')" class="text-gray-400 hover:text-green-700 text-lg" title="Editar"><i class="ph ph-pencil-simple" aria-hidden="true"></i></button>' +
            '<button onclick="event.stopPropagation();App.eliminarAnimal(\'' + String(a.codigo).replace(/'/g,"'") + '\')" class="text-gray-300 hover:text-red-500 text-lg" title="Eliminar"><i class="ph ph-trash" aria-hidden="true"></i></button>' +
          '</td>' +
        '</tr>';
      });
      html += '</tbody></table></div></div>';
      App.renderMain(html);
      App._filtrarListaAnimales();   // inicializa el contador de resultados
    });
  },
  _filtrarListaAnimales: function() {
    var q      = ((document.getElementById('busca-ani') || {}).value || '').toLowerCase();
    var est    = ((document.getElementById('ani-estado') || {}).value || '');
    var predio = ((document.getElementById('ani-predio') || {}).value || '');
    var prop   = ((document.getElementById('ani-prop') || {}).value || '');
    var anio   = ((document.getElementById('ani-anio') || {}).value || '');
    var mes    = ((document.getElementById('ani-mes') || {}).value || '');
    var repro  = ((document.getElementById('ani-repro') || {}).value || '');
    var vis = 0, total = 0;
    document.querySelectorAll('#tbody-lista tr').forEach(function(tr) {
      var txt = tr.textContent.toLowerCase();
      var rep = tr.dataset.repro || '';
      var ok = true;
      if (q      && !txt.includes(q))                ok = false;
      if (est    && tr.dataset.estado !== est)        ok = false;
      if (predio && tr.dataset.predio !== predio)     ok = false;
      if (prop   && tr.dataset.prop   !== prop)       ok = false;
      if (anio   && tr.dataset.anio   !== anio)       ok = false;
      if (mes    && tr.dataset.mes    !== mes)        ok = false;
      // 'HEMBRAS' = cualquier hembra (tiene clave repro); el resto es coincidencia exacta.
      if (repro === 'HEMBRAS') { if (!rep) ok = false; }
      else if (repro && rep !== repro)                ok = false;
      total++;
      if (ok) vis++;
      tr.style.display = ok ? '' : 'none';
    });
    var c = document.getElementById('ani-count');
    if (c) c.textContent = (vis === total) ? (total + ' animales') : (vis + ' de ' + total + ' animales');
  },

  // ── NACIMIENTOS ──────────────────────────────────────────────────────
  vistaNacimientos: function() {
    App.renderMain('<div class="flex justify-center py-16"><div class="spinner text-green-700 w-8 h-8"></div></div>');
    App.api('getNacimientos', [], function(data) {
      App.estado._nac = data || { lista: [], totalReproductoras: 0 };
      if (!App.estado._nacDim) App.estado._nacDim = 'mes';
      var lista = App.estado._nac.lista || [];

      // Opciones únicas para los filtros
      var sP = {}, sA = {}, sO = {}, predios = [], anios = [], props = [];
      lista.forEach(function(n) {
        if (n.predio      && !sP[n.predio])      { sP[n.predio] = 1;      predios.push(n.predio); }
        if (n.anio        && !sA[n.anio])        { sA[n.anio] = 1;        anios.push(n.anio); }
        if (n.propietario && !sO[n.propietario]) { sO[n.propietario] = 1; props.push(n.propietario); }
      });
      predios.sort(); anios.sort().reverse(); props.sort();
      var opt = function(arr) { return arr.map(function(v){ return '<option>' + v + '</option>'; }).join(''); };

      var html = '<div class="space-y-6">' +
        '<div class="bg-white rounded-xl border border-gray-200 px-5 py-4">' +
          '<div class="flex items-center justify-between flex-wrap gap-3 mb-3">' +
            '<div><h2 class="text-lg font-bold text-gray-900">Análisis de nacimientos</h2>' +
            '<p class="text-xs text-gray-400">Animales nacidos en los predios. Filtrá por finca, año, propietario o sexo — todo se actualiza al instante.</p></div>' +
          '</div>' +
          '<div class="flex flex-wrap items-center gap-2">' +
            '<select id="nac-predio" onchange="App._pintarNacimientos()" class="filter-select w-48"><option value="">Todos los predios</option>' + opt(predios) + '</select>' +
            '<select id="nac-anio" onchange="App._pintarNacimientos()" class="filter-select w-36"><option value="">Todos los años</option>' + opt(anios) + '</select>' +
            '<select id="nac-prop" onchange="App._pintarNacimientos()" class="filter-select w-52"><option value="">Todos los propietarios</option>' + opt(props) + '</select>' +
            '<select id="nac-sexo" onchange="App._pintarNacimientos()" class="filter-select w-40"><option value="">Ambos sexos</option><option value="HEMBRA">Hembras</option><option value="MACHO">Machos</option></select>' +
            '<button onclick="App._limpiarFiltrosNac()" class="text-xs text-gray-400 hover:text-gray-700 ml-1 px-2 py-1.5">Limpiar</button>' +
          '</div>' +
        '</div>' +
        '<div id="nac-body"></div>' +
      '</div>';

      App.renderMain(html);
      App._pintarNacimientos();
    });
  },

  _limpiarFiltrosNac: function() {
    ['nac-predio','nac-anio','nac-prop','nac-sexo'].forEach(function(id){
      var el = document.getElementById(id); if (el) el.value = '';
    });
    App._pintarNacimientos();
  },

  _setNacDim: function(dim) { App.estado._nacDim = dim; App._pintarNacimientos(); },

  // Re-pinta KPIs + gráficos + tablas según los filtros actuales (todo en cliente).
  _pintarNacimientos: function() {
    var d     = App.estado._nac || { lista: [] };
    var lista = d.lista || [];
    var dim   = App.estado._nacDim || 'mes';
    var getV  = function(id){ return ((document.getElementById(id) || {}).value) || ''; };
    var body  = document.getElementById('nac-body');
    if (!body) return;

    // Destruir gráficos previos de esta vista
    ['nacMain','nacSexo'].forEach(function(k){
      if (App.estado.charts[k]) { try { App.estado.charts[k].destroy(); } catch(e) {} delete App.estado.charts[k]; }
    });

    if (lista.length === 0) {
      body.innerHTML = '<div class="bg-white rounded-xl border border-gray-200 p-10 text-center">' +
        '<div class="text-4xl mb-3"><i class="ph ph-baby-carriage" aria-hidden="true"></i></div>' +
        '<h3 class="font-semibold text-gray-700 mb-1">Aún no hay nacimientos registrados</h3>' +
        '<p class="text-sm text-gray-400 max-w-md mx-auto">Registrá un animal con origen <b>Nacimiento</b> y su madre, o desde la edición de un animal marcá <b>“Nació en la finca”</b>. Aparecerán aquí para su análisis.</p>' +
      '</div>';
      return;
    }

    var fp = getV('nac-predio'), fa = getV('nac-anio'), fo = getV('nac-prop'), fs = getV('nac-sexo');
    var filt = lista.filter(function(n){
      if (fp && n.predio !== fp)              return false;
      if (fa && n.anio !== fa)                return false;
      if (fo && n.propietario !== fo)         return false;
      if (fs && (n.sexo || 'HEMBRA') !== fs)  return false;
      return true;
    });

    var MESES_AB = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
    var lblMes = function(ym){
      if (!ym || ym.length < 7) return ym || '—';
      return (MESES_AB[parseInt(ym.substring(5,7),10) - 1] || '') + ' ' + ym.substring(2,4);
    };
    var esMacho = function(n){ return n.sexo === 'MACHO'; };

    // ── KPIs ──
    var total   = filt.length;
    var nM      = filt.filter(esMacho).length;
    var nH      = total - nM;
    var madres  = {}; filt.forEach(function(n){ if (n.madre_codigo) madres[n.madre_codigo] = 1; });
    var nMadres = Object.keys(madres).length;
    var promCria = nMadres ? Math.round(total / nMadres * 10) / 10 : 0;
    var hayFiltro = !!(fp || fa || fo || fs);

    var kpi = function(label, value, sub) {
      return '<div class="bg-white rounded-xl border border-gray-200 p-4">' +
        '<div class="text-[11px] text-gray-400 uppercase tracking-wide">' + label + '</div>' +
        '<div class="text-2xl font-bold text-gray-900 mt-1">' + value + '</div>' +
        (sub ? '<div class="text-xs text-gray-500 mt-0.5">' + sub + '</div>' : '') +
      '</div>';
    };

    // ── Agregación para el gráfico principal (apilado por sexo) ──
    var agg = function() {
      var map = {};
      filt.forEach(function(n){
        var k = (dim === 'mes') ? (n.mes || '—') : (dim === 'anio') ? (n.anio || '—') : (n.predio || 'Sin finca');
        if (!map[k]) map[k] = { M:0, H:0 };
        if (esMacho(n)) map[k].M++; else map[k].H++;
      });
      var keys = Object.keys(map).sort();
      return {
        labels:  keys.map(function(k){ return dim === 'mes' ? lblMes(k) : k; }),
        machos:  keys.map(function(k){ return map[k].M; }),
        hembras: keys.map(function(k){ return map[k].H; })
      };
    };

    var dimLabel = dim === 'mes' ? 'mes' : dim === 'anio' ? 'año' : 'predio';
    var tg = function(dd, txt) {
      return '<button onclick="App._setNacDim(\'' + dd + '\')" class="px-3 py-1.5 text-sm rounded-lg ' +
        (dim === dd ? 'bg-green-700 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200') + '">' + txt + '</button>';
    };

    // ── Top madres ──
    var mmap = {};
    filt.forEach(function(n){
      if (!n.madre_codigo) return;
      if (!mmap[n.madre_codigo]) mmap[n.madre_codigo] = { n:0, predio: n.madre_predio || n.predio || '' };
      mmap[n.madre_codigo].n++;
    });
    var top = Object.keys(mmap).map(function(k){ return { codigo:k, n:mmap[k].n, predio:mmap[k].predio }; })
      .sort(function(a,b){ return b.n - a.n; }).slice(0, 8);

    // ── Construir HTML ──
    var h = '';
    h += '<div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">' +
      kpi('Nacimientos', total, hayFiltro ? 'con los filtros activos' : 'en total') +
      kpi('Hembras', nH, total ? Math.round(nH/total*100) + '% del total' : '—') +
      kpi('Machos', nM, total ? Math.round(nM/total*100) + '% del total' : '—') +
      kpi('Madres distintas', nMadres, 'vacas con crías') +
      kpi('Prom. crías/madre', promCria, 'crías por vaca') +
    '</div>';

    h += '<div class="bg-white rounded-xl border border-gray-200 p-5 mb-6">' +
      '<div class="flex items-start justify-between flex-wrap gap-3 mb-2">' +
        '<div><h3 class="font-semibold text-gray-700">Nacimientos por ' + dimLabel + '</h3>' +
        '<p class="text-xs text-gray-400">Cada barra separa <span style="color:var(--c-rose);font-weight:600">hembras</span> y <span style="color:var(--c-blue);font-weight:600">machos</span>. Cambiá la dimensión para ver estacionalidad, tendencia anual o reparto por finca.</p></div>' +
        '<div class="flex gap-2 shrink-0">' + tg('mes','Por mes') + tg('anio','Por año') + tg('predio','Por predio') + '</div>' +
      '</div>' +
      '<div style="height:330px;position:relative">' + (total ? '<canvas id="nac-chart-main"></canvas>' : '<div class="flex items-center justify-center h-full text-sm text-gray-400">Sin nacimientos para los filtros seleccionados.</div>') + '</div>' +
    '</div>';

    h += '<div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">';
    h += '<div class="bg-white rounded-xl border border-gray-200 p-5">' +
      '<h3 class="font-semibold text-gray-700 mb-1">Distribución por sexo</h3>' +
      '<p class="text-xs text-gray-400 mb-3">Proporción de crías nacidas</p>' +
      '<div style="height:240px;position:relative">' + (total ? '<canvas id="nac-chart-sexo"></canvas>' : '<div class="flex items-center justify-center h-full text-sm text-gray-400">Sin datos.</div>') + '</div>' +
    '</div>';
    h += '<div class="bg-white rounded-xl border border-gray-200 p-5">' +
      '<h3 class="font-semibold text-gray-700 mb-1"><i class="ph ph-trophy" aria-hidden="true"></i> Vacas más productivas</h3>' +
      '<p class="text-xs text-gray-400 mb-3">Madres con más crías registradas</p>';
    if (top.length === 0) {
      h += '<p class="text-sm text-gray-400 py-3">Aún sin crías vinculadas a una madre.</p>';
    } else {
      var maxN = top[0].n;
      h += '<div class="space-y-2">';
      top.forEach(function(m){
        var pct = maxN ? Math.round(m.n / maxN * 100) : 0;
        h += '<a href="#/animal/' + encodeURIComponent(m.codigo) + '" class="flex items-center gap-3 group">' +
          '<span class="font-semibold text-gray-700 w-16 shrink-0 group-hover:text-green-700">' + m.codigo + '</span>' +
          '<span class="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden"><span style="width:' + pct + '%" class="block h-full bg-green-600 rounded-full"></span></span>' +
          '<span class="text-sm text-gray-600 w-20 text-right shrink-0">' + m.n + ' cría' + (m.n !== 1 ? 's' : '') + '</span>' +
        '</a>';
      });
      h += '</div>';
    }
    h += '</div></div>';

    // ── Tabla de nacimientos ──
    h += '<div class="bg-white rounded-xl border border-gray-200 overflow-hidden">' +
      '<div class="px-5 py-3 border-b border-gray-100"><h3 class="font-semibold text-gray-700">Detalle de nacimientos (' + total + ')</h3></div>' +
      '<div class="overflow-x-auto"><table class="tabla-ganadero"><thead><tr>' +
        '<th>Cría</th><th>Sexo</th><th>Nacimiento</th><th>Predio</th><th>Madre</th><th>Categoría</th><th>Estado</th><th></th>' +
      '</tr></thead><tbody>';
    if (total === 0) {
      h += '<tr><td colspan="8" class="text-center text-gray-400 py-6">Sin coincidencias con los filtros.</td></tr>';
    } else {
      filt.slice().sort(function(a,b){ return String(b.fecha).localeCompare(String(a.fecha)); }).forEach(function(n){
        var enc = encodeURIComponent(n.codigo);
        var eb  = n.estado === 'ACTIVO' ? 'badge-green' : n.estado === 'VENDIDO' ? 'badge-blue' : 'badge-red';
        var sx  = n.sexo === 'MACHO' ? '<span style="color:var(--c-blue)">♂ Macho</span>' : '<span style="color:var(--c-rose)">♀ Hembra</span>';
        h += '<tr class="fila-link" onclick="App.irAnimal(\'' + String(n.codigo).replace(/'/g, "\\'") + '\')">' +
          '<td class="font-semibold">' + n.codigo + '</td>' +
          '<td>' + sx + '</td>' +
          '<td>' + App.fmtFecha(n.fecha) + '</td>' +
          '<td>' + (n.predio || '—') + '</td>' +
          '<td>' + (n.madre_codigo ? '<a href="#/animal/' + encodeURIComponent(n.madre_codigo) + '" class="text-green-700 font-medium" onclick="event.stopPropagation()">' + n.madre_codigo + '</a>' : '—') + '</td>' +
          '<td>' + (n.tipo || '—') + '</td>' +
          '<td><span class="badge ' + eb + '">' + (n.estado || '—') + '</span></td>' +
          '<td><a href="#/animal/' + enc + '" class="text-green-700 font-medium text-sm" onclick="event.stopPropagation()">Ver →</a></td>' +
        '</tr>';
      });
    }
    h += '</tbody></table></div></div>';

    body.innerHTML = h;

    // ── Crear gráficos (después de inyectar los canvas) ──
    if (total) {
      var A = agg();
      var ctxM = document.getElementById('nac-chart-main');
      if (ctxM) {
        App.estado.charts['nacMain'] = new Chart(ctxM, {
          type: 'bar',
          data: { labels: A.labels, datasets: [
            { label: 'Hembras', data: A.hembras, backgroundColor: App._tok('--c-rose','#f07a94'), borderRadius: 5, borderSkipped: false },
            { label: 'Machos',  data: A.machos,  backgroundColor: App._tok('--c-blue','#5b9df0'), borderRadius: 5, borderSkipped: false }
          ]},
          options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
              legend: { position: 'top', labels: { usePointStyle: true, padding: 14 } },
              tooltip: { enabled: false, external: App._tipExterno,
                callbacks: { footer: function(items){ var t = 0; items.forEach(function(i){ t += i.parsed.y; }); return 'Total: ' + t + ' nacimiento' + (t !== 1 ? 's' : ''); } } }
            },
            scales: {
              x: { stacked: true, grid: { display: false } },
              y: { stacked: true, beginAtZero: true, ticks: { precision: 0, stepSize: 1 }, grid: { color: App._tok('--chart-grid','rgba(150,140,120,0.22)') } }
            }
          }
        });
      }
      var ctxS = document.getElementById('nac-chart-sexo');
      if (ctxS) {
        App.estado.charts['nacSexo'] = new Chart(ctxS, {
          type: 'doughnut',
          data: { labels: ['Hembras','Machos'], datasets: [{ data: [nH, nM], backgroundColor: [App._tok('--c-rose','#f07a94'), App._tok('--c-blue','#5b9df0')], borderWidth: 2, borderColor: App._tok('--chart-surface','#211d18'), hoverOffset: 8 }] },
          options: {
            responsive: true, maintainAspectRatio: false, cutout: '62%',
            plugins: {
              legend: { position: 'bottom', labels: { usePointStyle: true, padding: 12 } },
              tooltip: { enabled: false, external: App._tipExterno, callbacks: {
                title: function(items){ return items.length ? items[0].label : ''; },
                label: function(c){ var tot = nH + nM; return c.parsed + ' de ' + tot + ' · ' + (tot ? Math.round(c.parsed/tot*100) : 0) + '%'; } } }
            }
          }
        });
      }
    }
  },

  // ── FICHA ANIMAL ─────────────────────────────────────────────────────
  vistaFicha: function(codigoCrudo) {
    var codigo = decodeURIComponent(codigoCrudo || '');
    if (!codigo) { window.location.hash = '#/animales'; return; }
    App.renderMain('<div class="flex justify-center py-16"><div class="spinner text-green-700 w-8 h-8"></div></div>');
    App.api('getAnimal', [codigo], function(data) {
      if (!data) { App.toast('Animal no encontrado: ' + codigo, 'error'); return; }
      App.estado.animalActual = data;
      App._renderFicha(data);
    });
  },

  _renderFicha: function(data) {
    var a   = data.animal;
    var res = data.resumen;
    var ser = data.serie;
    var eb  = a.estado === 'ACTIVO' ? 'badge-green' : a.estado === 'VENDIDO' ? 'badge-blue' : 'badge-red';
    var rep          = data.reproductivo || null;
    var sexoA        = (a.sexo || (rep && rep.sexo) || '');
    var sexoLbl      = sexoA === 'MACHO' ? '♂ Macho' : sexoA === 'HEMBRA' ? '♀ Hembra' : '—';
    var esNacimiento = String(a.tipo_ingreso || 'COMPRA').toUpperCase() === 'NACIMIENTO';

    // Gestación PROYECTADA: el campo `meses` es la foto de la última palpación.
    // Se proyecta a hoy con la fecha de esa palpación (de los eventos de sanidad).
    var gestProy = null;
    if (sexoA === 'HEMBRA' && a.estado_reproductivo === 'Preñada') {
      var _repM = parseInt(a.meses, 10);
      if (!isNaN(_repM)) {
        var _palp = (data.sanidad || []).filter(function(e){
          return e.tipo === 'PALPACIÓN VETERINARIA' && e.estado_reproductivo === 'Preñada' && e.fecha;
        }).sort(function(x, y){ return new Date(y.fecha) - new Date(x.fecha); })[0];
        var _hoyM = _repM + (_palp ? App._mesesEntre(_palp.fecha) : 0);
        gestProy = { reportada: _repM, fecha: _palp ? _palp.fecha : '', hoy: _hoyM, vencida: _hoyM >= 9 };
      }
    }

    var html = '<div class="space-y-5">';
    html += App._migaFicha(a.codigo);

    // Cabecera
    html += '<div class="bg-white rounded-xl border border-gray-200 p-6">' +
      '<div class="flex flex-wrap items-start justify-between gap-4 mb-5">' +
        '<div class="flex items-start gap-4">' +
          (a.foto_url
            ? '<a href="' + a.foto_url + '" target="_blank" rel="noopener" class="shrink-0" title="Ver foto en grande">' +
                '<img src="' + a.foto_url + '" alt="Foto de ' + a.codigo + '" class="w-24 h-24 sm:w-28 sm:h-28 rounded-xl object-cover border border-gray-200" onerror="this.style.display=\'none\'"></a>'
            : '') +
        '<div>' +
          '<div class="flex items-center gap-3 mb-1 flex-wrap">' +
            '<span class="text-2xl font-bold">' + a.codigo + '</span>' +
            '<span class="badge ' + eb + '">' + a.estado + '</span>' +
            (res ? App.badge(res.clasificacionActual) : '') +
            App._badgeDescarte(a.estado_descarte) +
            // Insignia de preñez siempre visible en la cabecera — evita ventas accidentales
            (gestProy
              ? '<span class="chip-repro ' + (gestProy.vencida ? 'vencida' : 'prenada') + '"><i class="ph ph-baby" aria-hidden="true"></i> PREÑADA ~' + gestProy.hoy + ' m</span>'
              : (sexoA === 'HEMBRA' && a.estado_reproductivo === 'Preñada' ? '<span class="chip-repro prenada"><i class="ph ph-baby" aria-hidden="true"></i> PREÑADA</span>' : '')) +
          '</div>' +
          '<div class="text-sm text-gray-500">' + (a.tipo || '') + ' · ' + (a.predio || '') + (a.propietario ? ' · ' + a.propietario : '') + '</div>' +
          (a.indicaciones ? '<div class="text-xs text-gray-400 mt-1">' + a.indicaciones + '</div>' : '') +
        '</div></div>' +
        '<div class="flex flex-wrap gap-2">' +
          (a.estado === 'ACTIVO'
            ? '<button onclick="App.abrirModalRegistro(\'' + String(a.codigo).replace(/'/g, "\\'") + '\')" class="btn-primary px-4 py-2 text-sm"><i class="ph ph-clipboard-text" aria-hidden="true"></i> Registro</button>' +
              '<button onclick="App.abrirModalVenta(\'' + String(a.codigo).replace(/'/g, "\\'") + '\')" class="btn-secondary text-sm"><i class="ph ph-money" aria-hidden="true"></i> Registrar venta</button>' +
              '<button onclick="App.abrirModalDescarte(\'' + String(a.codigo).replace(/'/g, "\\'") + '\')" class="btn-secondary text-sm"><i class="ph ph-scissors" aria-hidden="true"></i> Descarte</button>' +
              '<button onclick="App.abrirModalMuerte(\'' + String(a.codigo).replace(/'/g, "\\'") + '\')" class="btn-secondary text-sm" title="Registra el fallecimiento conservando todo el historial del animal"><i class="ph ph-cross" aria-hidden="true"></i> Registrar muerte</button>'
            : '') +
          '<button onclick="App.abrirModalAnimal(\'' + String(a.codigo).replace(/'/g,"'") + '\')" class="btn-secondary text-sm"><i class="ph ph-pencil-simple" aria-hidden="true"></i> Editar</button>' +
          '<button onclick="App.eliminarAnimal(\'' + String(a.codigo).replace(/'/g,"'") + '\')" class="btn-danger text-sm" title="Borra el animal y todo su historial. Si murió, usa «Registrar muerte» para conservar la trazabilidad."><i class="ph ph-trash" aria-hidden="true"></i> Eliminar</button>' +
        '</div>' +
      '</div>' +
      '<div class="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-5 gap-4">' +
        App._dato('Fecha ingreso',  App.fmtFecha(a.fecha_ingreso)) +
        App._dato('Días en finca',  (a.dias_en_finca || '—') + ' días') +
        // Gestación: si está preñada se proyecta a hoy (palpada X m el [fecha] · hoy ≈ Y m);
        // si no hay palpación con fecha, cae al valor estático del campo meses.
        (gestProy
          ? App._dato(gestProy.vencida ? '<i class="ph ph-warning" aria-hidden="true"></i> Gestación (vencida)' : 'Gestación',
              gestProy.reportada + ' m' + (gestProy.fecha ? ' palpada ' + App.fmtFecha(gestProy.fecha) : '') + ' · hoy ≈ ' + gestProy.hoy + ' m')
          : ((sexoA === 'HEMBRA' && a.meses && String(a.meses) !== '0')
              ? App._dato('Meses de gestación', a.meses + ' meses') : '')) +
        App._dato(esNacimiento ? 'Peso al nacer' : 'Peso inicial', App.fmt(a.peso_inicial, 1) + ' kg') +
        App._dato('Sexo', sexoLbl) +
        App._dato('Origen', esNacimiento ? '<i class="ph ph-baby-carriage" aria-hidden="true"></i> Nacimiento' : '<i class="ph ph-shopping-cart" aria-hidden="true"></i> Compra') +
        (esNacimiento
          ? (data.madre ? App._dato('Madre', '<a href="#/animal/' + encodeURIComponent(data.madre.codigo) + '" class="text-green-700 font-medium" onclick="event.stopPropagation()">' + data.madre.codigo + '</a>') : App._dato('Madre', '—'))
          : App._dato('Precio compra', App.fmtCOP(a.precio_compra))) +
        // Para nacimientos: valor estimado al nacer (peso × precio/kg) si se registró.
        ((esNacimiento && a.precio_compra) ? App._dato('Valor al nacer', App.fmtCOP(a.precio_compra)) : '') +
        ((!esNacimiento && a.proveedor) ? App._dato('Proveedor', a.proveedor) : '') +
        // Categoría legible (Ternera de levante / Novilla de vientre / Vaca — Primer parto).
        ((rep && rep.esReproductora && rep.categoria) ? App._dato('Categoría', rep.categoria) : '') +
      '</div>' +
    '</div>';

    // ── Panel de fallecimiento ───────────────────────────────────────────
    // Va arriba de todo el historial, no lo reemplaza: el animal conserva su
    // nacimiento, pesos, madre y tratamientos; esto solo añade el desenlace.
    if (a.estado === 'MUERTO') {
      var edadM = App._edadAlMorir(a);
      var causaM = a.causa_muerte || '';
      var causaTxt = (causaM === 'Otra' && a.causa_muerte_otra) ? 'Otra — ' + a.causa_muerte_otra : (causaM || 'Sin especificar');
      var falta = [];
      if (!a.fecha_muerte) falta.push('la fecha');
      if (!causaM)         falta.push('la causa');
      html += '<div class="muerte-panel">' +
        '<div class="muerte-head">' +
          '<span class="muerte-ico"><i class="ph ph-asterisk"></i></span>' +
          '<div style="flex:1;min-width:0">' +
            '<div class="muerte-t">Animal fallecido</div>' +
            '<div class="muerte-s">Su historial se conserva completo. Este registro alimenta el análisis de mortalidad.</div>' +
          '</div>' +
          '<button onclick="App.abrirModalMuerte(\'' + String(a.codigo).replace(/'/g, "\\'") + '\')" class="btn-secondary text-xs px-3 py-1.5"><i class="ph ph-pencil-simple" aria-hidden="true"></i> Corregir</button>' +
        '</div>' +
        '<div class="muerte-datos">' +
          '<div><span class="l">Fecha de muerte</span><span class="v">' + (a.fecha_muerte ? App.fmtFecha(a.fecha_muerte) : '—') + '</span></div>' +
          '<div><span class="l">Causa</span><span class="v">' + causaTxt + '</span></div>' +
          '<div><span class="l">Edad al morir</span><span class="v">' + (edadM !== null ? App._edadLegible(edadM) : '—') + '</span></div>' +
          '<div><span class="l">Tiempo en la finca</span><span class="v">' + (a.dias_en_finca ? a.dias_en_finca + ' días' : '—') + '</span></div>' +
        '</div>' +
        (a.obs_muerte ? '<div class="muerte-obs"><b>Lo que ocurrió:</b> ' + a.obs_muerte + '</div>' : '') +
        (a.foto_muerte_url
          ? '<a href="' + a.foto_muerte_url + '" target="_blank" rel="noopener" class="muerte-eviden"><i class="ph ph-paperclip"></i> Ver evidencia adjunta</a>'
          : '') +
        (falta.length
          ? '<div class="muerte-falta"><i class="ph ph-warning"></i> Falta ' + falta.join(' y ') + ' de este registro. Sin esos datos no entra en los análisis de mortalidad por periodo, causa ni edad — pulsa «Corregir» para completarlo.</div>'
          : '') +
      '</div>';
    }

    // Banner de descarte
    if (a.estado_descarte === 'Marcado para descarte') {
      html += '<div class="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center justify-between gap-4">' +
        '<div class="flex items-center gap-3">' +
          '<span class="text-xl"><i class="ph ph-scissors" aria-hidden="true"></i></span>' +
          '<div>' +
            '<div class="font-semibold text-red-700 text-sm">Marcado para descarte</div>' +
            (a.motivo_descarte ? '<div class="text-xs text-red-600 mt-0.5">Motivo: ' + a.motivo_descarte + '</div>' : '') +
            (a.obs_descarte    ? '<div class="text-xs text-gray-500 mt-0.5">' + a.obs_descarte + '</div>' : '') +
            (a.fecha_descarte  ? '<div class="text-xs text-gray-400 mt-0.5">Marcado el ' + App.fmtFecha(a.fecha_descarte) + '</div>' : '') +
          '</div>' +
        '</div>' +
        '<button onclick="App.abrirModalDescarte(\'' + String(a.codigo).replace(/'/g, "\\'") + '\')" class="text-xs text-red-600 hover:text-red-800 font-medium">Actualizar →</button>' +
      '</div>';
    }

    // Historial reproductivo (solo hembras) — crías + partos + categoría
    if (rep && rep.esReproductora) {
      html += '<div class="bg-white rounded-xl border border-gray-200 p-5">' +
        '<div class="flex items-center justify-between mb-3 flex-wrap gap-2">' +
          '<h3 class="font-semibold text-gray-700"><i class="ph ph-baby-carriage" aria-hidden="true"></i> Historial reproductivo</h3>' +
          '<div class="flex items-center gap-2 flex-wrap">' +
            '<span class="badge badge-green">' + rep.numeroPartos + ' parto' + (rep.numeroPartos !== 1 ? 's' : '') + '</span>' +
            (rep.numeroPartos > 0 ? '<span class="badge badge-blue">' + rep.categoria + '</span>' : '<span class="badge badge-gray">Sin partos</span>') +
          '</div>' +
        '</div>';
      if (rep.crias.length === 0) {
        html += '<p class="text-sm text-gray-400 py-2">Aún no tiene crías registradas. Al registrar un nacimiento, selecciónala como madre y aparecerán aquí.</p>';
      } else {
        html += '<div class="overflow-x-auto"><table class="tabla-ganadero"><thead><tr>' +
          '<th>#</th><th>Cría</th><th>Sexo</th><th>Nacimiento</th><th>Categoría</th><th>Estado</th></tr></thead><tbody>';
        rep.crias.forEach(function(c, i) {
          var ce = c.estado === 'ACTIVO' ? 'badge-green' : c.estado === 'VENDIDO' ? 'badge-blue' : 'badge-red';
          html += '<tr class="fila-link" onclick="App.irAnimal(\'' + String(c.codigo).replace(/'/g, "\\'") + '\')">' +
            '<td>' + (i + 1) + '</td>' +
            '<td class="font-semibold text-green-700">' + c.codigo + '</td>' +
            '<td>' + (c.sexo === 'MACHO' ? '♂ Macho' : '♀ Hembra') + '</td>' +
            '<td>' + App.fmtFecha(c.fecha_nacimiento) + '</td>' +
            '<td>' + (c.tipo || '—') + '</td>' +
            '<td><span class="badge ' + ce + '">' + c.estado + '</span></td>' +
          '</tr>';
        });
        html += '</tbody></table></div>';
      }
      html += '</div>';
    }

    // <i class="ph ph-scales" aria-hidden="true"></i> El peso: lo medido y lo estimado para hoy. Va antes que nada más
    // porque es a lo que se entra a esta pantalla.
    html += App._cardPeso(data);

    // KPIs resumen GDP
    // "Peso actual" sale de aquí: la tarjeta de arriba ya lo da, y además con
    // su fecha. Repetirlo suelto invitaba a leerlo como el peso de hoy.
    var htmlKpis = '';
    if (res) {
      htmlKpis = '<div class="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-4">' +
        App._kpiCard('<i class="ph ph-chart-bar" aria-hidden="true"></i>', 'GDP promedio',   App.fmt(res.gdpPromedio, 3) + ' kg/d', '') +
        App._kpiCard('<i class="ph ph-trophy" aria-hidden="true"></i>', 'GDP máximo',     App.fmt(res.gdpMaximo, 3) + ' kg/d', '') +
        App._kpiCard('<i class="ph ph-calendar" aria-hidden="true"></i>+30', 'Proy. 30d',   App.fmt(res.proy30, 1) + ' kg', '') +
        App._kpiCard('<i class="ph ph-calendar" aria-hidden="true"></i>+60', 'Proy. 60d',   App.fmt(res.proy60, 1) + ' kg', '') +
        App._kpiCard('<i class="ph ph-calendar" aria-hidden="true"></i>+90', 'Proy. 90d',   App.fmt(res.proy90, 1) + ' kg', '') +
      '</div>';
    }

    // Gráfico curva
    var htmlCurva = '<div class="bg-white rounded-xl border border-gray-200 p-5">' +
      '<h3 class="font-semibold text-gray-700 mb-4">Curva de crecimiento</h3>' +
      '<canvas id="chart-curva" height="100"></canvas></div>';

    // Tabla mediciones — se arma aparte para poder colocarla ARRIBA de la curva
    // y de los KPIs: es la evidencia del peso, y va pegada a él.
    var htmlMed = '<div class="bg-white rounded-xl border border-gray-200 overflow-hidden">' +
      '<div class="px-5 py-3 border-b border-gray-100 flex items-center justify-between">' +
        '<h3 class="font-semibold text-gray-700">Historial de mediciones (' + ser.length + ')</h3>' +
        (ser.length ? '<span class="med-nota">Si un peso o una fecha quedó mal, corrígelo en su fila</span>' : '') +
      '</div>' +
      '<div class="overflow-x-auto"><table class="tabla-ganadero"><thead><tr>' +
        '<th>#</th><th>Fecha</th><th>Peso (kg)</th><th>Ganancia</th>' +
        '<th>Días ant.</th><th>GDP (kg/d)</th><th>GDP acum.</th><th>Proy. 30d</th><th>Clasificación</th><th>Observación</th><th>Corregir</th>' +
      '</tr></thead><tbody>';

    if (ser.length === 0) {
      htmlMed += '<tr><td colspan="11" class="text-center text-gray-400 py-6">Sin mediciones registradas</td></tr>';
    } else {
      ser.forEach(function(s, idx) {
        var idMed = (data.mediciones[idx] || {}).id_medicion || '';
        htmlMed += '<tr>' +
          '<td>' + s.numMed + '</td>' +
          '<td>' + App.fmtFecha(s.fecha) + '</td>' +
          '<td class="font-semibold">' + App.fmt(s.peso, 1) + '</td>' +
          '<td class="font-medium ' + (s.ganancia >= 0 ? 'text-green-700' : 'text-red-600') + '">' +
            (s.ganancia >= 0 ? '+' : '') + App.fmt(s.ganancia, 2) + '</td>' +
          '<td>' + s.diasDesdeAnterior + '</td>' +
          '<td class="font-semibold">' + App.fmt(s.gdpPer, 3) +
            (s.alerta ? ' <span title="' + App._esc(App._alertaMedicionTxt(s.alerta)) + '" style="cursor:help" class="' + (s.alerta === 'GDP_IMPOSIBLE' || s.alerta === 'FECHA_INVALIDA' ? 'text-red-500' : 'text-yellow-600') + '"><i class="ph ph-warning" aria-hidden="true"></i></span>' : '') + '</td>' +
          '<td>' + App.fmt(s.gdpAcum, 3) + '</td>' +
          '<td>' + App.fmt(s.proy30, 1) + '</td>' +
          '<td>' + App.badge(s.clasificacion) + '</td>' +
          '<td class="text-gray-500 max-w-xs truncate text-xs">' + (s.observacion || '—') + '</td>' +
          '<td class="acc-med">' + (idMed
            ? '<button onclick="App.abrirModalEditarMedicion(\'' + idMed + '\')" class="btn-fila">✎ Corregir</button>' +
              '<button onclick="App.eliminarMedicion(\'' + idMed + '\')" class="btn-fila borrar" title="Quitar esta medición">Quitar</button>'
            : '') + '</td>' +
        '</tr>';
      });
    }
    htmlMed += '</tbody></table></div></div>';

    // ── EL ORDEN DE LA FICHA ────────────────────────────────────────────
    // Primero el peso (ya está arriba), luego la tabla que lo sustenta, y
    // después el análisis. La curva y los GDP son para revisar de vez en
    // cuando; las mediciones se consultan a diario.
    html += htmlMed + htmlCurva + htmlKpis;

    // Ventas del animal
    if (data.ventas && data.ventas.length > 0) {
      html += '<div class="bg-white rounded-xl border border-gray-200 overflow-hidden">' +
        '<div class="px-5 py-3 border-b border-gray-100"><h3 class="font-semibold text-gray-700">Registro de venta</h3></div>' +
        '<table class="tabla-ganadero"><thead><tr>' +
          '<th>Fecha venta</th><th>Comprador</th><th>Precio salida</th><th>Precio/kg</th><th>Peso salida</th><th>Utilidad Bruta</th><th>Días en predio</th>' +
        '</tr></thead><tbody>';
      data.ventas.forEach(function(v) {
        var colorU = parseFloat(v.utilidad) >= 0 ? 'text-green-700' : 'text-red-600';
        html += '<tr>' +
          '<td>' + App.fmtFecha(v.fecha_venta) + '</td>' +
          '<td>' + (v.comprador || '—') + '</td>' +
          '<td class="font-semibold">' + App.fmtCOP(v.precio_salida) + '</td>' +
          '<td>' + App.fmtCOP(v.precio_kg) + '/kg</td>' +
          '<td>' + App.fmt(v.peso_salida, 1) + ' kg</td>' +
          '<td class="font-semibold ' + colorU + '">' + App.fmtCOP(v.utilidad) + '</td>' +
          '<td>' + (v.dias_en_predio || '—') + ' d</td>' +
        '</tr>';
      });
      html += '</tbody></table></div>';
    }

    // Historial sanitario
    if (data.sanidad && data.sanidad.length > 0) {
      var hoyS = new Date(); hoyS.setHours(0, 0, 0, 0);
      html += '<div class="bg-white rounded-xl border border-gray-200 overflow-hidden">' +
        '<div class="px-5 py-3 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">' +
          '<h3 class="font-semibold text-gray-700"><i class="ph ph-stethoscope" aria-hidden="true"></i> Historial sanitario</h3>' +
          '<span class="text-xs text-gray-400">Cada fila es un evento <b class="text-gray-600">realizado</b>; el <b class="text-gray-600">recordatorio</b> es el seguimiento que dejó programado.</span>' +
        '</div>' +
        '<table class="tabla-ganadero"><thead><tr><th>Fecha</th><th>Evento realizado</th><th>Medicamento</th><th>Dosis</th><th>Recordatorio</th><th>Observación</th></tr></thead><tbody>';
      // Un solo renglón por fecha: agrupamos todos los procedimientos registrados
      // el mismo día (el guardado sigue creando un registro por procedimiento; esto
      // es solo la presentación). data.sanidad ya viene ordenada por fecha desc.
      var gruposSan = {}, ordenSan = [];
      data.sanidad.forEach(function(e) {
        if (!gruposSan[e.fecha]) { gruposSan[e.fecha] = []; ordenSan.push(e.fecha); }
        gruposSan[e.fecha].push(e);
      });
      ordenSan.forEach(function(f) {
        var evs = gruposSan[f];
        // Tipos únicos con su icono; si un tipo se repite ese día se muestra "×N".
        var conteo = {}, ordenTipos = [];
        evs.forEach(function(e) {
          if (conteo[e.tipo] == null) { conteo[e.tipo] = 0; ordenTipos.push(e.tipo); }
          conteo[e.tipo]++;
        });
        var chips = ordenTipos.map(function(t) {
          return '<span class="san-chip"><span class="san-ico">' + App._sanIcono(t) + '</span>' + t +
                 (conteo[t] > 1 ? ' <span class="cnt">×' + conteo[t] + '</span>' : '') + '</span>';
        }).join('');
        // Recordatorios: un chip por evento que dejó seguimiento (sin duplicar iguales).
        var recVistos = {}, recs = [];
        evs.forEach(function(e) {
          if (!e.proxima_fecha) return;
          var k = e.tipo + '|' + e.proxima_fecha;
          if (recVistos[k]) return;
          recVistos[k] = true;
          recs.push(App._chipRecordatorio(e, data.sanidad, hoyS));
        });
        var recHtml = recs.length ? '<div class="san-recs">' + recs.join('') + '</div>' : '—';
        html += '<tr><td>' + App.fmtFecha(f) + '</td>' +
          '<td><div class="san-chips">' + chips + '</div></td>' +
          '<td>' + (App._uniqJoin(evs.map(function(e){ return e.medicamento; })) || '—') + '</td>' +
          '<td>' + (App._uniqJoin(evs.map(function(e){ return e.dosis; })) || '—') + '</td>' +
          '<td>' + recHtml + '</td>' +
          '<td>' + (App._uniqJoin(evs.map(function(e){ return e.observacion; }), '<br>') || '—') + '</td></tr>';
      });
      html += '</tbody></table></div>';
    }

    html += '</div>';
    App.renderMain(html);

    // Chart curva
    setTimeout(function() {
      var ctx = document.getElementById('chart-curva');
      if (!ctx || ser.length === 0) return;
      var pesoIni   = parseFloat(a.peso_inicial);
      var diasFinca = parseFloat(a.dias_en_finca) || 0;
      var labels  = [App.fmtFecha(a.fecha_ingreso)].concat(ser.map(function(s){ return App.fmtFecha(s.fecha); }));
      var pesos   = [pesoIni].concat(ser.map(function(s){ return s.peso; }));
      var diasArr = [0].concat(ser.map(function(s){ return s.diasDesde; }));
      var realCount = pesos.length;  // puntos reales (ingreso + mediciones); lo demás es proyección
      var gdpProy = 0;  // ritmo (kg/día) usado para proyectar
      var ph = data.pesoHoy;
      if (res && ser.length) {
        var ult = ser[ser.length - 1];
        // EL MISMO ritmo que la tarjeta del peso, que llega ya resuelto del
        // servidor. Antes aquí se usaba el último tramo y allí el acumulado:
        // la ficha habría enseñado dos pesos de hoy distintos.
        gdpProy = (ph && typeof ph.ritmo === 'number') ? ph.ritmo : 0;

        // El punto de HOY, antes de las proyecciones. Es el que la tarjeta
        // anuncia, y verlo en la curva ata las dos cosas.
        if (ph && ph.diasDesdeMedicion > 0) {
          labels.push('hoy');
          pesos.push(ph.pesoHoy);
          diasArr.push(diasFinca);
        }
        var dHoy = (ph && ph.diasDesdeMedicion > 0) ? ph.diasDesdeMedicion : 0;
        [30,60,90].forEach(function(d) {
          labels.push('+' + d + 'd');
          pesos.push(Math.round((ult.peso + gdpProy * (dHoy + d)) * 10) / 10);
          diasArr.push(diasFinca + d);
        });
      }
      // "Peso real" = SOLO mediciones reales (ingreso + pesajes). Los puntos +30/60/90
      // son una PROYECCIÓN a ritmo medio (último peso + ganancia media desde el ingreso,
      // acotada); van en una serie aparte, punteada, para no confundirla con datos medidos.
      var pesosReales = pesos.map(function(p, i){ return i <  realCount ? p : null; });
      var pesosProy   = pesos.map(function(p, i){ return i >= realCount - 1 ? p : null; });
      var hayProy = realCount < pesos.length;
      var dsets = [
        { label: 'Peso real (kg)', data: pesosReales,
          borderColor: '#56ad5f', backgroundColor: 'rgba(86,173,95,0.13)',
          tension: 0.4, fill: true, pointRadius: 5, pointHoverRadius: 7, order: 1 },
      ];
      if (hayProy) dsets.push({ label: 'Proyección (ritmo medio)', data: pesosProy,
        borderColor: '#56ad5f', backgroundColor: 'transparent', borderDash: [2,4],
        tension: 0.4, fill: false, pointRadius: 3, pointStyle: 'rectRot',
        pointBackgroundColor: 'transparent', pointHoverRadius: 6, order: 2 });
      // Explicación por punto: al pasar el cursor, dice cómo se calculó ese valor.
      function _explicaPunto(c) {
        var lbl = c.dataset.label, i = c.dataIndex;
        var mm = function(d){ return (d / 30.44).toFixed(1); };
        if (lbl.indexOf('Peso real') === 0) {
          if (i === 0) return ['Peso inicial registrado al ingreso', 'Fecha: ' + App.fmtFecha(a.fecha_ingreso)];
          var s = ser[i - 1]; if (!s) return '';
          var g = (s.ganancia >= 0 ? '+' : '') + App.fmt(s.ganancia, 1);
          return ['Pesaje real registrado ese día',
                  'Ganó ' + g + ' kg en ' + s.diasDesdeAnterior + ' días',
                  'GDP del período: ' + App.fmt(s.gdpPer, 3) + ' kg/día'];
        }        if (lbl.indexOf('Proyección') === 0) {
          var ult = ser[ser.length - 1];
          if (i === realCount - 1) return ['Punto de partida de la proyección', 'Último peso medido: ' + App.fmt(ult.peso, 1) + ' kg'];
          var dOff = Math.round(diasArr[i] - diasFinca);
          return ['Estimado a ritmo medio, no medido',
                  '= último peso ' + App.fmt(ult.peso, 1) + ' kg',
                  '  + ' + App.fmt(gdpProy, 3) + ' kg/día × ' + dOff + ' días'];
        }
        return '';
      }
      App.estado.charts['curva'] = new Chart(ctx, {
        type: 'line',
        data: { labels: labels, datasets: dsets },
        options: { responsive: true,
          interaction: { mode: 'nearest', intersect: true },
          plugins: { legend: { position: 'top' },
            tooltip: { enabled: false, external: App._tipExterno, callbacks: {
              label:      function(c){ return c.dataset.label + ': ' + c.parsed.y + ' kg'; },
              afterLabel: function(c){ return _explicaPunto(c); }
            } } },
          scales: { y: { beginAtZero: false, ticks: { callback: function(v){ return v + ' kg'; } } } } }
      });
    }, 100);
  },

  _dato: function(label, valor) {
    return '<div class="ficha-dato"><span class="label">' + label + '</span><span class="valor">' + valor + '</span></div>';
  },

  // ── LA TARJETA DEL PESO ──────────────────────────────────────────────
  // Sustituye al viejo "peso actual vs. peso esperado". Aquel comparaba contra
  // un ideal en kg/mes; en la finca pasan cosas —sequía, un lote sin pasto, una
  // enfermedad— y un número contra el que nada se cumple deja de mirarse.
  //
  // Y había un problema más callado: el peso actual NO DECÍA DE CUÁNDO ERA. Se
  // leía como el de hoy pudiendo ser de hace tres meses.
  //
  // El cálculo NO vive aquí: llega resuelto del servidor (calcularPesoHoy), que
  // es también de donde bebe la curva de crecimiento. Si cada uno calculara lo
  // suyo, la ficha acabaría contradiciéndose a sí misma.
  _cardPeso: function(data) {
    var ph = data.pesoHoy;
    var a  = data.animal;
    if (!ph) return '';   // muerto, vendido o sin peso de entrada

    var hayEstimacion = ph.ritmoOrigen !== 'NINGUNO' && ph.diasDesdeMedicion > 0;
    var dias = ph.diasDesdeMedicion;
    var cuando = dias === 0 ? 'hoy mismo'
               : dias === 1 ? 'ayer'
               : 'hace ' + dias + ' días';

    // ── Los dos números ──
    var html = '<div class="bg-white rounded-xl border border-gray-200 p-5" id="card-peso">' +
      '<div class="flex items-center justify-between mb-4 flex-wrap gap-3">' +
        '<h3 class="font-semibold text-gray-700"><i class="ph ph-scales" aria-hidden="true"></i> Peso</h3>' +
        '<button onclick="App.abrirModalMedicion(\'' + App._esc(a.codigo) + '\')" ' +
          'class="btn-secondary text-sm"><i class="ph ph-scales" aria-hidden="true"></i> Pesarlo</button>' +
      '</div>' +
      '<div class="peso-hoy">' +
        '<div class="ph-fig">' +
          '<div class="ph-n">' + App.fmt(ph.pesoMedido, 1) + '<small> kg</small></div>' +
          '<div class="ph-l">Último pesaje</div>' +
          '<div class="ph-f">' + App._fechaLarga(ph.fechaMedido) + ' · ' + cuando + '</div>' +
        '</div>';

    if (hayEstimacion) {
      html += '<div class="ph-flecha">→</div>' +
        '<div class="ph-fig est">' +
          '<div class="ph-n">' + App.fmt(ph.pesoHoy, 1) + '<small> kg</small></div>' +
          '<div class="ph-l">Estimado hoy</div>' +
          '<div class="ph-f">' + App._fechaLarga(data.hoy || App._hoyISO()) + '</div>' +
        '</div>';
    }
    html += '</div>';

    // ── De dónde sale el número ──
    // Se dice SIEMPRE. Una cifra estimada que no explica su origen se termina
    // leyendo como si la hubiera dado la báscula.
    html += '<div class="ph-nota">' + App._pesoHoyExplica(ph, a) + '</div>';

    if (!ph.confiable && hayEstimacion) {
      html += '<div class="ph-aviso"><span><i class="ph ph-warning" aria-hidden="true"></i></span><div>Hace <b>' + dias + ' días</b> del último ' +
        'pesaje: la estimación es poco confiable. Conviene pasarlo por la báscula.</div></div>';
    }
    return html + '</div>';
  },

  _pesoHoyExplica: function(ph, a) {
    if (ph.ritmoOrigen === 'NINGUNO') {
      return 'Todavía no hay con qué estimar el peso de hoy: se muestra el último peso conocido.';
    }
    var g = App.fmt(ph.ganancia, 1);
    var enEsos = ph.diasDesdeMedicion > 0
      ? ' En ' + (ph.diasDesdeMedicion === 1 ? 'el día' : 'los ' + ph.diasDesdeMedicion + ' días') +
        ' desde el último pesaje debería haber subido unos <b>' + g + ' kg</b>.'
      : '';
    if (ph.ritmoOrigen === 'PREDIO') {
      return 'Este animal <b>viene perdiendo peso</b>, así que se estima con el promedio de ' +
        '<b>' + App._esc(a.predio || 'su finca') + '</b>: ' + App.fmt(ph.ritmo, 3) +
        ' kg por día.' + enEsos;
    }
    return 'Viene ganando <b>' + App.fmt(ph.ritmo, 3) + ' kg por día</b> desde que entró.' + enEsos;
  },

  // ── Corregir una medición del historial ──────────────────────────────
  // Se anota un peso mal, o el día equivocado, y hasta ahora la única salida
  // era borrar la fila y volver a crearla de memoria. Aquí se cambia lo que
  // esté mal y el sistema rehace los cálculos que dependan de ello.
  abrirModalEditarMedicion: function(idMedicion) {
    var d = App.estado.animalActual;
    var m = ((d && d.mediciones) || []).filter(function(x) { return x.id_medicion === idMedicion; })[0];
    if (!m) { App.toast('No se encontró esa medición.', 'error'); return; }

    // Cuántas mediciones vienen DESPUÉS: son las que van a recalcularse, y
    // conviene decirlo antes, no después de haber tocado el botón.
    var posteriores = ((d && d.mediciones) || []).filter(function(x) {
      return String(x.fecha) > String(m.fecha);
    }).length;

    var html = '<div class="p-6">' +
      '<div class="flex items-center justify-between mb-1">' +
        '<h2 class="text-lg font-bold">✎ Corregir la medición</h2>' +
        '<button onclick="App.cerrarModal()" class="text-gray-400 hover:text-gray-700 text-2xl leading-none">×</button>' +
      '</div>' +
      '<div class="text-sm mb-5" style="color:var(--muted)">Animal <b>' + App._esc(m.codigo) +
        '</b> · registrada el ' + App.fmtFecha(m.fecha) + ' con ' + App.fmt(m.peso, 1) + ' kg</div>' +

      '<div class="grid grid-cols-2 gap-4">' +
        '<div class="form-group"><label class="form-label">Fecha del pesaje *</label>' +
          '<input type="date" id="em_fecha" value="' + App._esc(m.fecha) + '" max="' + App._hoyISO() + '" class="form-input"></div>' +
        '<div class="form-group"><label class="form-label">Peso (kg) *</label>' +
          App._numInput('em_peso', { value: m.peso, placeholder:'Ej: 285,5' }) + '</div>' +
      '</div>' +
      '<div class="form-group"><label class="form-label">Observación</label>' +
        '<input type="text" id="em_obs" value="' + App._esc(m.observacion || '') + '" class="form-input" placeholder="Opcional"></div>' +

      (posteriores
        ? '<div class="alerta-card alerta-warning"><div>Después de esta hay <b>' + posteriores +
          ' medición' + (posteriores !== 1 ? 'es' : '') + '</b> más. Al guardar se vuelven a calcular ' +
          'sus ganancias y su GDP, porque dependen de este dato.</div></div>'
        : '') +

      '<div class="flex justify-end gap-3 mt-4">' +
        '<button onclick="App.cerrarModal()" class="btn-secondary">Cancelar</button>' +
        '<button onclick="App._guardarEdicionMedicion(\'' + idMedicion + '\')" id="em_guardar" ' +
          'class="btn-primary px-6 py-2 text-sm">Guardar la corrección</button>' +
      '</div></div>';
    App.abrirModal(html);
  },

  _guardarEdicionMedicion: function(idMedicion) {
    var peso = App._leerNum('em_peso');
    if (isNaN(peso) || peso <= 0) {
      App._marcarCampo('em_peso', 'Escribe el peso, por ejemplo 285,5 o 285.5');
      return;
    }
    var fecha = (document.getElementById('em_fecha') || {}).value || '';
    if (!fecha) { App._marcarCampo('em_fecha', 'Indica el día del pesaje'); return; }

    App._unaVez('editarMedicion', 'em_guardar', function(liberar) {
      App.api('editarMedicion', [{
        id_medicion: idMedicion, fecha: fecha, peso: peso,
        observacion: (document.getElementById('em_obs') || {}).value || ''
      }], function(r) {
        liberar();
        if (!r || !r.ok) { App.toast((r && r.error) || 'No se pudo corregir.', 'error'); return; }
        App.toast('Medición corregida ✓' +
          (r.cascada && r.cascada.actualizadas
            ? ' · se recalcularon ' + r.cascada.actualizadas + ' fila' + (r.cascada.actualizadas !== 1 ? 's' : '')
            : ''), 'success');
        if (r.reclasificado) App.toast('Categoría actualizada → ' + r.reclasificado, 'info');
        // Las advertencias del propio cálculo (GDP imposible, fecha inválida)
        // se avisan: corregir un dato puede dejar otro en evidencia.
        (r.advertencias || []).forEach(function(a) { App.toast(a, 'info'); });
        App.cerrarModal();
        if (App.estado.animalActual) App.vistaFicha(encodeURIComponent(App.estado.animalActual.animal.codigo));
      }, liberar);
    });
  },

  eliminarMedicion: function(id) {
    // Se dice qué arrastra: borrar una medición del medio cambia el GDP de la
    // siguiente, y eso no es evidente desde la fila.
    if (!confirm('¿Quitar esta medición del historial?\n\nSe recalculan las mediciones posteriores del animal.\n\nSi solo quedó mal el peso o la fecha, usa «Corregir» en vez de quitarla.')) return;
    App.api('deleteMedicion', [id], function(r) {
      App.toast(r.ok ? 'Medición eliminada ✓' : 'Error al eliminar', r.ok ? 'success' : 'error');
      if (r.ok && App.estado.animalActual) App.vistaFicha(encodeURIComponent(App.estado.animalActual.animal.codigo));
    });
  },

  eliminarAnimal: function(codigo) {
    if (!confirm('¿Eliminar el animal "' + codigo + '" junto con todas sus mediciones y eventos sanitarios?\n\nEsta acción no se puede deshacer.')) return;
    App.api('deleteAnimal', [codigo], function(r) {
      if (!r.ok) { App.toast(r.error || 'Error al eliminar', 'error'); return; }
      App.toast('Animal "' + codigo + '" eliminado ✓', 'success');
      window.location.hash = '#/animales';
    });
  },

  // ── VENTAS ───────────────────────────────────────────────────────────
  // Orden de la tabla de ventas. Arranca por fecha descendente: lo último vendido
  // es lo que uno quiere ver al entrar.
  _ventasOrden: { campo: 'fecha_venta', dir: -1 },

  // Clic en un encabezado: si ya se ordenaba por ahí, invierte; si no, ordena por
  // esa columna empezando por lo más alto (o lo más reciente, en la fecha).
  _ordenarVentas: function(campo) {
    var o = App._ventasOrden;
    if (o.campo === campo) o.dir = -o.dir;
    else { o.campo = campo; o.dir = -1; }
    App._pintarVentas();
  },

  _ventasOrdenadas: function() {
    var o = App._ventasOrden;
    var lista = (App.estado._ventas || []).slice();
    // Las fechas se comparan como texto porque vienen en yyyy-MM-dd, que ordena
    // igual alfabéticamente que cronológicamente. Lo demás va como número.
    var esFecha = o.campo === 'fecha_venta';
    var esTexto = o.campo === 'codigo' || o.campo === 'comprador';
    lista.sort(function(a, b) {
      var x = a[o.campo], y = b[o.campo];
      if (esFecha || esTexto) {
        x = String(x == null ? '' : x); y = String(y == null ? '' : y);
        return x.localeCompare(y) * o.dir;
      }
      x = parseFloat(x); y = parseFloat(y);
      if (isNaN(x)) x = -Infinity;
      if (isNaN(y)) y = -Infinity;
      return (x - y) * o.dir;
    });
    return lista;
  },

  _thVenta: function(campo, etiqueta) {
    var o = App._ventasOrden;
    var activo = o.campo === campo;
    var flecha = activo ? (o.dir === -1 ? ' ↓' : ' ↑') : '';
    return '<th class="th-orden' + (activo ? ' is-on' : '') + '" ' +
      'onclick="App._ordenarVentas(\'' + campo + '\')" ' +
      'title="Ordenar por ' + etiqueta.toLowerCase() + '">' + etiqueta +
      '<span class="th-flecha">' + (flecha || ' ⇅') + '</span></th>';
  },

  vistaVentas: function() {
    App.api('listVentas', [{}], function(ventas) {
      App.estado._ventas = ventas || [];
      App._pintarVentas();
    });
  },

  // Aviso cuando el costo de una venta no cuadra con la ficha del animal.
  // Se nombran los códigos: "hay 3 ventas mal" no sirve para ir a arreglarlas.
  _avisoCostosVentas: function(ventas) {
    var sinCosto = ventas.filter(function(v){ return v.costo_origen === 'sin_costo'; });
    var desfase  = ventas.filter(function(v){ return v.desfase_costo; });
    if (!sinCosto.length && !desfase.length) return '';

    var partes = '';
    if (sinCosto.length) {
      partes += '<div class="aviso-costo-linea"><b>' + sinCosto.length + ' sin precio de compra</b> — ' +
        sinCosto.map(function(v){ return App._esc(v.codigo); }).join(', ') +
        '. No se puede calcular su utilidad; quedan fuera de los totales de rentabilidad. ' +
        'Registra el precio en la ficha del animal.</div>';
    }
    if (desfase.length) {
      partes += '<div class="aviso-costo-linea"><b>' + desfase.length + ' con el costo corregido después de la venta</b> — ' +
        desfase.slice(0, 8).map(function(v) {
          return App._esc(v.codigo) + ' (' + App.fmtCOP(v.desfase_costo.costoImplicito) +
                 ' → ' + App.fmtCOP(v.desfase_costo.costoReal) + ')';
        }).join(' · ') + (desfase.length > 8 ? ' y ' + (desfase.length - 8) + ' más' : '') +
        '. La tabla ya usa el precio real del animal; la hoja de ventas todavía guarda el viejo.</div>';
    }
    return '<div class="aviso-costo">' +
      '<i class="ph ph-warning-circle"></i>' +
      '<div><div class="aviso-costo-t">Revisa el costo de estas ventas</div>' + partes + '</div>' +
    '</div>';
  },

  _pintarVentas: function() {
    var ventas    = App._ventasOrdenadas();
    var totalPrec = ventas.reduce(function(s,v){ return s + (parseFloat(v.precio_salida)||0); }, 0);
    var totalUtil = ventas.reduce(function(s,v){ return s + (parseFloat(v.utilidad)||0); }, 0);

    var html = '<div class="space-y-5">' +
        App._subtabs('salida', '#/ventas') +
        '<div class="dx-head" style="margin-bottom:2px">' +
          '<div><h2 class="dx-title">Ventas registradas</h2>' +
            '<div class="dx-sub">Toca un encabezado para ordenar por esa columna.</div></div>' +
          '<button onclick="App.abrirModalVenta()" class="btn-primary px-4 py-2 text-sm">' +
            '<i class="ph ph-hand-coins"></i> Registrar venta</button>' +
        '</div>' +
        '<div class="grid grid-cols-3 gap-4">' +
          App._kpiCard('<i class="ph ph-cow" aria-hidden="true"></i>', 'Animales vendidos', ventas.length, '') +
          App._kpiCard('<i class="ph ph-currency-circle-dollar" aria-hidden="true"></i>', 'Ingresos brutos',   App.fmtCOP(totalPrec), 'valor total de ventas') +
          App._kpiCard('<i class="ph ph-chart-line-up" aria-hidden="true"></i>', 'Utilidad bruta',    App.fmtCOP(totalUtil), 'venta menos costo de compra') +
        '</div>' +
        App._avisoCostosVentas(ventas) +
        '<div class="bg-blue-50 border border-blue-200 rounded-xl px-5 py-3 text-xs text-blue-700 flex items-start gap-2">' +
          '<span class="text-base shrink-0"><i class="ph ph-info" aria-hidden="true"></i></span>' +
          '<span>Los valores mostrados son <strong>brutos</strong>. No incluyen costos fijos (alimentación, mano de obra, infraestructura) ni costos variables de operación, los cuales se incorporarán en una etapa posterior del sistema.</span>' +
        '</div>' +
        '<div class="bg-white rounded-xl border border-gray-200 overflow-hidden" style="overflow-x:auto">' +
        '<table class="tabla-ganadero"><thead><tr>' +
          App._thVenta('codigo',         'Código') +
          App._thVenta('comprador',      'Comprador') +
          App._thVenta('fecha_venta',    'Fecha venta') +
          App._thVenta('precio_compra',  'Costo compra') +
          App._thVenta('precio_salida',  'Precio salida') +
          App._thVenta('precio_kg',      'Precio/kg') +
          App._thVenta('peso_salida',    'Peso salida') +
          App._thVenta('utilidad',       'Utilidad bruta') +
          App._thVenta('dias_en_predio', 'Días en predio') +
        '</tr></thead><tbody>';

    if (ventas.length === 0) {
      html += '<tr><td colspan="9" class="text-center text-gray-400 py-6">Sin ventas registradas</td></tr>';
    } else {
      ventas.forEach(function(v) {
        var cu = parseFloat(v.utilidad) >= 0 ? 'text-green-700' : 'text-red-600';
        html += '<tr>' +
          '<td><a href="#/animal/' + encodeURIComponent(v.codigo) + '" class="font-semibold text-green-700" ' +
            'onclick="return App.irAnimalDesde(\'' + String(v.codigo).replace(/'/g, "\\'") + '\',\'#/ventas\',\'Ventas\')">' + App._esc(v.codigo) + '</a></td>' +
          '<td>' + App._esc(v.comprador || '—') + '</td>' +
          '<td>' + App.fmtFecha(v.fecha_venta) + '</td>' +
          '<td>' + (v.costo_origen === 'sin_costo'
            ? '<span class="chip-costo falta" title="El animal no tiene precio de compra registrado">sin costo</span>'
            : App.fmtCOP(v.precio_compra) +
              (v.desfase_costo
                ? ' <span class="chip-costo corregido" title="La hoja de ventas guarda ' +
                  App.fmtCOP(v.desfase_costo.costoImplicito) + '; se usa el precio actual del animal.">corregido</span>'
                : '')) + '</td>' +
          '<td class="font-semibold">' + App.fmtCOP(v.precio_salida) + '</td>' +
          '<td>' + App.fmtCOP(v.precio_kg) + '/kg</td>' +
          '<td>' + App.fmt(v.peso_salida,1) + ' kg</td>' +
          '<td class="font-semibold ' + cu + '">' + (v.utilidad === '' ? '—' : App.fmtCOP(v.utilidad)) + '</td>' +
          '<td>' + (v.dias_en_predio||'—') + ' d</td>' +
        '</tr>';
      });
    }
    html += '</tbody></table></div></div>';
    App.renderMain(html);
  },

  // ══════════════════════════════════════════════════════════════════════
  //  EL TABLERO — lo primero que se ve al entrar a Tareas
  //
  //  Pensado para quien no se defiende con la tecnología. Tres decisiones que
  //  gobiernan todo lo de abajo:
  //
  //  · Las columnas son CUÁNDO TOCA, no el estado interno. "Atrasadas · Hoy ·
  //    Esta semana · Más adelante" son ideas que cualquiera maneja; "programada
  //    / en curso / no ejecutada" hay que aprendérselas primero.
  //  · NADA se arrastra. Arrastrar exige pulso y práctica, y si se suelta en el
  //    sitio equivocado el cambio ya quedó hecho. Aquí todo son botones con
  //    palabras, grandes, y cada uno pide confirmación en la propia tarjeta.
  //  · Nunca se pide escribir. Los motivos y las fechas se eligen de una lista
  //    de un toque; teclear en el celular, de pie en el corral, es lo que hace
  //    que la gente deje de registrar.
  // ══════════════════════════════════════════════════════════════════════

  _tablero: { id_predio: '', datos: null, abierta: '', modo: '', motivo: '' },

  // Cada columna dice también QUÉ SIGNIFICA y qué hacer cuando está vacía: una
  // columna en blanco sin explicación se lee como que el sistema falló.
  _TK_COLS: [
    { k:'atrasadas', t:'Atrasadas',    s:'Se debían hacer y no se hicieron', ico:'<i class="ph ph-warning" aria-hidden="true"></i>', tk:'--danger',
      vacio:'Nada atrasado.', vacioS:'Todo lo de antes está resuelto.' },
    { k:'hoy',       t:'Hoy',          s:'Lo de este día',                   ico:'●', tk:'--accent',
      vacio:'Hoy no hay nada.', vacioS:'Ningún trabajo programado para hoy.' },
    { k:'semana',    t:'Esta semana',  s:'Los próximos 7 días',              ico:'▸', tk:'--info',
      vacio:'Nada esta semana.', vacioS:'La semana está libre.' },
    { k:'adelante',  t:'Más adelante', s:'De ocho días en adelante',         ico:'⋯', tk:'--muted',
      vacio:'Nada más adelante.', vacioS:'No hay nada programado todavía.' }
  ],

  vistaTablero: function() {
    App.mostrarLoading('Cargando las tareas…');
    App.api('getTablero', [{ id_predio: App._tablero.id_predio }], function(r) {
      App.ocultarLoading();
      if (!r || !r.ok) {
        App.renderMain('<div class="alerta-card alerta-danger">No se pudieron cargar las tareas: ' +
          App._esc((r && r.error) || 'error desconocido') + '</div>');
        return;
      }
      App._tablero.datos = r;
      // Las fincas y sus lotes ya vinieron aqui: se guardan para que abrir
      // "Nueva tarea" no dispare otra llamada. Cada llamada suelta a Apps
      // Script puede costar un arranque en frio de varios segundos, y en ese
      // rato lo normal es volver a tocar el boton.
      App._prediosCache = ((r.opciones || {}).predios) || App._prediosCache;
      App._tablero.abierta = ''; App._tablero.modo = ''; App._tablero.motivo = '';
      App._pintarTablero();
    });
  },

  // Guardar una tarea, borrarla o cerrarla se puede hacer desde el tablero Y
  // desde el calendario, y el modal es el mismo. Sin esto, cerrar una tarea
  // desde el tablero devolvia al calendario: la vista cambiaba sola bajo los
  // pies de quien acababa de tocar un boton.
  _refrescarTareas: function() {
    if (String(window.location.hash || '').indexOf('#/calendario') === 0) App.vistaTareas();
    else App.vistaTablero();
  },

  _predioTablero: function(id) {
    App._tablero.id_predio = id;
    App.vistaTablero();
  },

  // Lo que se lee de un vistazo antes de mirar ninguna columna. Va en frase,
  // no en cifras sueltas: "2 · 4 · 3 · 5" obliga a interpretar; una frase no.
  _tkFrase: function(R) {
    var p = [];
    if (R.hoy)       p.push('Hoy hay <b>' + R.hoy + ' ' + (R.hoy === 1 ? 'labor' : 'labores') + '</b>');
    if (R.atrasadas) p.push((p.length ? 'y quedan ' : 'Quedan ') + '<b>' + R.atrasadas +
                            ' ' + (R.atrasadas === 1 ? 'atrasada' : 'atrasadas') + '</b>');
    if (!p.length) {
      return R.semana
        ? 'Hoy no hay nada pendiente y no queda nada atrasado. Esta semana vienen <b>' + R.semana + '</b>.'
        : 'Todo al día. No hay nada atrasado ni pendiente para hoy.';
    }
    return p.join(' ') + '.' +
      (R.urgentes ? ' <b style="color:var(--danger)">' + R.urgentes +
        (R.urgentes === 1 ? ' es urgente' : ' son urgentes') + '.</b>' : '');
  },

  _pintarTablero: function() {
    var d = App._tablero.datos, R = d.resumen || {};
    var predios = ((d.opciones || {}).predios) || [];

    var html = '<div class="dx-wrap">' + App._subtabs('tareas', '#/tareas') +
      '<div class="dx-head">' +
        '<div><h2 class="dx-title">Tareas de la finca</h2>' +
          '<div class="tk-frase">' + App._tkFrase(R) + '</div></div>' +
        '<div class="dx-toolbar">' +
          '<select class="filter-select" onchange="App._predioTablero(this.value)">' +
            '<option value="">Todas las fincas</option>' +
            predios.map(function(pr) {
              return '<option value="' + App._esc(pr.id_predio) + '"' +
                (pr.id_predio === App._tablero.id_predio ? ' selected' : '') + '>' +
                App._esc(pr.nombre) + '</option>';
            }).join('') +
          '</select>' +
          '<button onclick="App.abrirModalTarea(null)" class="btn-primary tk-btn-nueva">' +
            '<i class="ph ph-plus"></i> Nueva tarea</button>' +
        '</div></div>';

    // ── Las cuatro columnas ──────────────────────────────────────────────
    html += '<div class="tk-board">' +
      App._TK_COLS.map(function(c) {
        return App._tkColumna(c, (d.columnas || {})[c.k] || []);
      }).join('') +
    '</div>';

    // ── Lo hecho, abajo y en pequeño ─────────────────────────────────────
    // No compite con lo que falta por hacer, pero se ve: sin ninguna señal de
    // avance el tablero solo enseña deudas.
    var hechas = d.hechas || [];
    html += '<div class="tk-hechas">' +
      '<div class="tk-hechas-t"><i class="ph ph-check" aria-hidden="true"></i> Ya hechas <span>· en los últimos 7 días</span></div>' +
      (hechas.length
        ? '<div class="tk-hechas-lista">' + hechas.map(function(t) {
            return '<button class="tk-hecha" onclick="App.abrirModalTarea(\'' + t.id_tarea + '\')">' +
              App._actIcono(t.actividad) + ' <b>' + App._esc(t.actividad) + '</b>' +
              '<span>' + App._esc(t.lote_nombre || t.predio_nombre || '') +
              ' · ' + App.fmtFecha(t.fecha_ejecucion || t.fecha_programada) + '</span></button>';
          }).join('') + '</div>'
        : '<div class="tk-hechas-v">Todavía no se ha cerrado ninguna labor esta semana.</div>') +
    '</div>';

    html += '</div>';
    App.renderMain(html);
  },

  _tkColumna: function(c, lista) {
    var html = '<div class="tk-col" style="--kc:var(' + c.tk + ')">' +
      '<div class="tk-col-cab">' +
        '<span class="tk-col-ico">' + c.ico + '</span>' +
        '<span class="tk-col-t">' + c.t + '</span>' +
        '<span class="tk-col-n">' + lista.length + '</span>' +
      '</div>' +
      '<div class="tk-col-s">' + c.s + '</div>';

    if (!lista.length) {
      html += '<div class="tk-vacio"><div class="tk-vacio-t">' + c.vacio + '</div>' +
        '<div class="tk-vacio-s">' + c.vacioS + '</div></div>';
    } else {
      html += '<div class="tk-cards">' + lista.map(function(t) {
        return App._tkCard(t, c.k);
      }).join('') + '</div>';
    }
    return html + '</div>';
  },

  // Cuándo tocaba, dicho como lo diría una persona. "hace 7 días" se entiende
  // sin restar fechas de cabeza; "2026-09-08" no.
  _tkCuando: function(t, col) {
    var f = t.fecha_programada;
    if (col === 'atrasadas') {
      var dd = t.dias_desfase;
      if (t.estado === 'NO_EJECUTADA') {
        return '<span class="tk-cuando mal"><i class="ph ph-x" aria-hidden="true"></i> No se pudo' +
          (t.motivo ? ': ' + App._esc(t.motivo) : '') + '</span>' +
          '<span class="tk-cuando">Falta decidir para cuándo</span>';
      }
      return '<span class="tk-cuando mal"><i class="ph ph-warning" aria-hidden="true"></i> Se debía hacer ' +
        (dd > 1 ? 'hace ' + dd + ' días' : dd === 1 ? 'ayer' : 'el ' + App.fmtFecha(f)) + '</span>';
    }
    if (col === 'hoy') {
      return '<span class="tk-cuando hoy">' +
        (t.estado === 'EN_CURSO' ? '◐ Ya está empezada' : '● Toca hoy') + '</span>';
    }
    return '<span class="tk-cuando">' + App._tkDia(f) + '</span>';
  },

  // "el miércoles 17" en vez de "17/09/2026": para lo cercano, el día de la
  // semana es lo que se usa al hablar con el encargado.
  _tkDia: function(iso) {
    var p = String(iso).split('-');
    var d = new Date(+p[0], +p[1] - 1, +p[2]);
    var DIAS  = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
    var MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto',
                 'septiembre','octubre','noviembre','diciembre'];
    var faltan = App._tkDiasHasta(iso);
    if (faltan === 1) return 'Mañana';
    if (faltan > 1 && faltan <= 7) return 'El ' + DIAS[d.getDay()] + ' ' + d.getDate();
    return d.getDate() + ' de ' + MESES[d.getMonth()];
  },
  _tkDiasHasta: function(iso) {
    var h = String(App._tablero.datos ? App._tablero.datos.hoy : App._hoyISO()).split('-');
    var p = String(iso).split('-');
    var a = new Date(+h[0], +h[1] - 1, +h[2]), b = new Date(+p[0], +p[1] - 1, +p[2]);
    return Math.round((b - a) / 86400000);
  },

  _tkCard: function(t, col) {
    var abierta = App._tablero.abierta === t.id_tarea;
    var urg = t.prioridad === 'URGENTE';
    var html = '<div class="tk-card' + (urg ? ' urgente' : '') + (abierta ? ' abierta' : '') + '">' +
      (urg ? '<div class="tk-urg"><i class="ph ph-caret-double-up" aria-hidden="true"></i> Urgente</div>' : '') +
      '<div class="tk-act">' + App._actIcono(t.actividad) + ' ' + App._esc(t.actividad) + '</div>' +
      '<div class="tk-donde">' + App._esc(t.predio_nombre || '') +
        (t.lote_nombre ? ' · <b>' + App._esc(t.lote_nombre) + '</b>' : ' · todo el predio') + '</div>' +
      App._tkCuando(t, col) +
      (t.responsable ? '<div class="tk-quien"><i class="ph ph-user" aria-hidden="true"></i> ' + App._esc(t.responsable) + '</div>' : '') +
      (t.descripcion ? '<div class="tk-desc">' + App._esc(t.descripcion) + '</div>' : '');

    html += abierta ? App._tkPanel(t) : App._tkBotones(t, col);
    return html + '</div>';
  },

  _tkBotones: function(t, col) {
    var id = t.id_tarea;
    // Una tarea que YA quedó marcada como no ejecutada no necesita que le
    // vuelvan a ofrecer "No se pudo": eso no la mueve de sitio. Lo único que
    // le falta es una fecha, y el botón lo dice con esas palabras.
    var yaFallida = t.estado === 'NO_EJECUTADA';
    var b = '<div class="tk-acc">';

    // Lo que más se usa va solo y ancho: es el que no se puede fallar.
    if (col !== 'adelante') {
      b += '<button class="tk-b ok" onclick="App._tkAbrir(\'' + id + '\',\'hecha\')"><i class="ph ph-check" aria-hidden="true"></i> Ya se hizo</button>';
    }
    // Los otros dos, en pareja: la tarjeta baja de alto y en la columna se ven
    // más tareas a la vez sin que ningún botón baje de lo que abarca un dedo.
    b += '<div class="tk-acc2">';
    if ((col === 'atrasadas' || col === 'hoy') && !yaFallida) {
      b += '<button class="tk-b no" onclick="App._tkAbrir(\'' + id + '\',\'no\')"><i class="ph ph-x" aria-hidden="true"></i> No se pudo</button>';
    }
    b += '<button class="tk-b mov" onclick="App._tkAbrir(\'' + id + '\',\'mover\')"><i class="ph ph-calendar" aria-hidden="true"></i> ' +
      (yaFallida ? 'Ponerle fecha' : 'Otro día') + '</button>';
    b += '</div>';

    b += '<button class="tk-ver" onclick="App.abrirModalTarea(\'' + id + '\')">Ver detalle</button>';
    return b + '</div>';
  },

  // ── El panel que se abre DENTRO de la tarjeta ─────────────────────────
  // No es un modal: el modal tapa la pantalla y hace perder el sitio. Aquí la
  // tarjeta se queda donde está y solo cambia su parte de abajo.
  _tkAbrir: function(id, modo) {
    App._tablero.abierta = id;
    App._tablero.modo = modo;
    App._tablero.motivo = '';
    App._pintarTablero();
  },
  _tkCancelar: function() {
    App._tablero.abierta = ''; App._tablero.modo = ''; App._tablero.motivo = '';
    App._pintarTablero();
  },

  // Motivos de un toque. Son los que de verdad pasan en la finca, y elegir de
  // una lista además deja el dato limpio: escrito a mano, "llovio", "lluvia" y
  // "por la lluvia" serían tres motivos distintos y no se podrían contar.
  _TK_MOTIVOS: ['Llovió', 'Faltó gente', 'Se dañó el equipo', 'Hubo otra urgencia', 'Otra razón'],

  _tkPanel: function(t) {
    var id = t.id_tarea, modo = App._tablero.modo;

    if (modo === 'hecha') {
      var dias = App._actDias(t.actividad);
      return '<div class="tk-panel">' +
        '<div class="tk-preg">¿Se hizo hoy, ' + App._tkDiaLargo(App._tablero.datos.hoy) + '?</div>' +
        (dias ? '<div class="tk-nota">Al cerrarla, la próxima vez de <b>' + App._esc(t.actividad) +
          '</b> queda programada para el ' + App._tkDiaLargo(App._sumarDiasISO(App._tablero.datos.hoy, dias)) +
          '.</div>' : '') +
        '<div class="tk-panel-acc">' +
          '<button class="tk-b ok grande" onclick="App._tkHecha(\'' + id + '\',' + (dias || 0) + ')">Sí, ya se hizo</button>' +
          '<button class="tk-b gris" onclick="App._tkCancelar()">No, volver</button>' +
        '</div></div>';
    }

    if (modo === 'no') {
      if (!App._tablero.motivo) {
        return '<div class="tk-panel">' +
          '<div class="tk-preg">¿Por qué no se pudo?</div>' +
          '<div class="tk-ops">' + App._TK_MOTIVOS.map(function(m) {
            return '<button class="tk-op" onclick="App._tkMotivo(' + JSON.stringify(m).replace(/"/g, '&quot;') + ')">' +
              App._esc(m) + '</button>';
          }).join('') + '</div>' +
          '<button class="tk-b gris ancho" onclick="App._tkCancelar()">Volver</button>' +
        '</div>';
      }
      return '<div class="tk-panel">' +
        '<div class="tk-preg">Queda anotado: <b>' + App._esc(App._tablero.motivo) + '</b></div>' +
        '<div class="tk-preg2">¿Cuándo se vuelve a intentar?</div>' +
        '<div class="tk-ops">' +
          App._tkOpsFecha(id, '_tkNoPudo') +
          '<button class="tk-op" onclick="App._tkNoPudo(\'' + id + '\',0)">Todavía no sé</button>' +
        '</div>' +
        '<button class="tk-b gris ancho" onclick="App._tkCancelar()">Volver</button>' +
      '</div>';
    }

    // modo === 'mover'
    return '<div class="tk-panel">' +
      '<div class="tk-preg">¿Para cuándo la movemos?</div>' +
      '<div class="tk-nota">No se marca como fallida: solo cambia de día.</div>' +
      '<div class="tk-ops">' + App._tkOpsFecha(id, '_tkMover') + '</div>' +
      '<div class="tk-fecha-libre">' +
        '<label>O escoge el día:</label>' +
        '<input type="date" id="tk_fecha_' + id + '" class="form-input" min="' + App._tablero.datos.hoy + '">' +
        '<button class="tk-b mov" onclick="App._tkMoverFecha(\'' + id + '\')">Mover</button>' +
      '</div>' +
      '<button class="tk-b gris ancho" onclick="App._tkCancelar()">Volver</button>' +
    '</div>';
  },

  // Los tres saltos que se usan al hablar: mañana, en tres días, la otra semana.
  _tkOpsFecha: function(id, fn) {
    return [[1, 'Mañana'], [3, 'En 3 días'], [7, 'La otra semana']].map(function(o) {
      return '<button class="tk-op" onclick="App.' + fn + '(\'' + id + '\',' + o[0] + ')">' +
        o[1] + '</button>';
    }).join('');
  },

  _tkDiaLargo: function(iso) { return App._fechaLarga(iso, true); },

  // "1 de septiembre" · con dia de la semana: "martes 1 de septiembre".
  // Nunca toISOString: se construye con el calendario local.
  _fechaLarga: function(iso, conDiaSemana) {
    var p = String(iso || '').split('-');
    if (p.length !== 3) return String(iso || '—');
    var d = new Date(+p[0], +p[1] - 1, +p[2]);
    if (isNaN(d.getTime())) return String(iso);
    var DIAS  = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
    var MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto',
                 'septiembre','octubre','noviembre','diciembre'];
    return (conDiaSemana ? DIAS[d.getDay()] + ' ' : '') + d.getDate() + ' de ' + MESES[d.getMonth()];
  },

  _tkMotivo: function(m) {
    App._tablero.motivo = m;
    App._pintarTablero();
  },

  // ── Las tres acciones ────────────────────────────────────────────────
  _tkHecha: function(id, dias) {
    App._tkEnviar('completarTarea',
      { id_tarea: id, fecha_ejecucion: App._tablero.datos.hoy, repetir_en_dias: dias || '' },
      function(r) {
        App.toast('Listo, queda como hecha ✓' +
          (r.siguiente ? ' · la próxima, el ' + App.fmtFecha(r.siguiente.fecha_programada) : ''), 'success');
      });
  },

  _tkNoPudo: function(id, dias) {
    var nueva = dias ? App._sumarDiasISO(App._tablero.datos.hoy, dias) : '';
    App._tkEnviar('noEjecutarTarea',
      { id_tarea: id, motivo: App._tablero.motivo, nueva_fecha: nueva },
      function() {
        App.toast(nueva ? 'Anotado · se vuelve a intentar el ' + App.fmtFecha(nueva)
                        : 'Anotado · queda en atrasadas hasta que le pongas fecha', 'info');
      });
  },

  _tkMover: function(id, dias) {
    var nueva = App._sumarDiasISO(App._tablero.datos.hoy, dias);
    App._tkEnviar('actualizarTarea', { id_tarea: id, fecha_programada: nueva }, function() {
      App.toast('Movida al ' + App.fmtFecha(nueva) + ' ✓', 'success');
    });
  },

  _tkMoverFecha: function(id) {
    var el = document.getElementById('tk_fecha_' + id);
    var v = el ? el.value : '';
    if (!v) { App._marcarCampo('tk_fecha_' + id, 'Escoge un día en el calendario'); return; }
    App._tkEnviar('actualizarTarea', { id_tarea: id, fecha_programada: v }, function() {
      App.toast('Movida al ' + App.fmtFecha(v) + ' ✓', 'success');
    });
  },

  // Un envío es un envío, también aquí: el tablero se toca con el dedo y el
  // toque doble es el pan de cada día.
  _tkEnviar: function(fn, payload, alSalirBien) {
    App._unaVez('tablero', '', function(liberar) {
      App.api(fn, [payload], function(r) {
        liberar();
        if (!r || !r.ok) { App.toast((r && r.error) || 'No se pudo guardar.', 'error'); return; }
        alSalirBien(r);
        App.vistaTablero();
      }, liberar);
    });
  },

  // ══════════════════════════════════════════════════════════════════════
  //  TAREAS DEL PREDIO — calendario, predios/lotes e historial
  //
  //  Regla que gobierna la vista: ninguna tarea desaparece. Un calendario
  //  mensual, por sí solo, esconde lo que quedó atrás en meses anteriores; por
  //  eso la franja de atrasadas es FIJA y se muestra sea cual sea el mes que
  //  estés mirando.
  // ══════════════════════════════════════════════════════════════════════

  _tareasEstado: { anio: null, mes: null, id_predio: '', diaAbierto: '', filtro: '', datos: null },

  vistaTareas: function() {
    var e = App._tareasEstado;
    if (e.anio === null) {
      var hoy = App._hoyISO();
      e.anio = parseInt(hoy.substring(0, 4), 10);
      e.mes  = parseInt(hoy.substring(5, 7), 10);
    }
    App.mostrarLoading('Cargando tareas…');
    App.api('getTareasCalendario', [{ anio: e.anio, mes: e.mes, id_predio: e.id_predio }], function(r) {
      App.ocultarLoading();
      if (!r || !r.ok) {
        App.renderMain('<div class="alerta-card alerta-danger">No se pudieron cargar las tareas: ' +
          App._esc((r && r.error) || 'error desconocido') + '</div>');
        return;
      }
      App._tareasEstado.datos = r;
      // Al entrar se abre el día de hoy: si no, la pantalla no muestra nada
      // hasta que uno adivine que hay que tocar una casilla.
      if (!App._tareasEstado.diaAbierto) App._tareasEstado.diaAbierto = r.hoy;
      App._pintarTareas();
    });
  },

  _mesTarea: function(delta) {
    var e = App._tareasEstado;
    var m = e.mes + delta, a = e.anio;
    if (m < 1)  { m = 12; a--; }
    if (m > 12) { m = 1;  a++; }
    e.mes = m; e.anio = a; e.diaAbierto = '';
    App.vistaTareas();
  },
  _hoyTareas: function() {
    var hoy = App._hoyISO(), e = App._tareasEstado;
    e.anio = parseInt(hoy.substring(0, 4), 10);
    e.mes  = parseInt(hoy.substring(5, 7), 10);
    e.diaAbierto = hoy;
    App.vistaTareas();
  },
  _predioTareas: function(id) {
    App._tareasEstado.id_predio = id;
    App._tareasEstado.diaAbierto = '';
    App.vistaTareas();
  },
  _abrirDia: function(iso) {
    App._tareasEstado.diaAbierto = (App._tareasEstado.diaAbierto === iso) ? '' : iso;
    App._pintarTareas();
  },

  _pintarTareas: function() {
    var e = App._tareasEstado, d = e.datos;
    var MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto',
                 'Septiembre','Octubre','Noviembre','Diciembre'];
    var hoy = d.hoy;

    var html = '<div class="dx-wrap">' + App._subtabs('tareas', '#/calendario');

    // Encabezado con el mes y los controles
    var predios = (d.opciones.predios || []);
    html += '<div class="dx-head">' +
      '<div><h2 class="dx-title">' + MESES[e.mes - 1] + ' ' + e.anio + '</h2>' +
        '<div class="dx-sub">' + d.tareas.length + ' tarea' + (d.tareas.length !== 1 ? 's' : '') +
        ' programada' + (d.tareas.length !== 1 ? 's' : '') + ' este mes' +
        (d.atrasadas.length ? ' · <b>' + d.atrasadas.length + ' sin cerrar</b>' : '') + '</div></div>' +
      '<div class="dx-toolbar">' +
        '<select class="filter-select" onchange="App._predioTareas(this.value)">' +
          '<option value="">Todos los predios</option>' +
          predios.map(function(pr) {
            return '<option value="' + App._esc(pr.id_predio) + '"' +
              (pr.id_predio === e.id_predio ? ' selected' : '') + '>' + App._esc(pr.nombre) + '</option>';
          }).join('') +
        '</select>' +
        '<button onclick="App._mesTarea(-1)" class="btn-secondary px-3 py-1.5" title="Mes anterior">‹</button>' +
        '<button onclick="App._hoyTareas()" class="btn-secondary px-3 py-1.5">Hoy</button>' +
        '<button onclick="App._mesTarea(1)" class="btn-secondary px-3 py-1.5" title="Mes siguiente">›</button>' +
        '<button onclick="App.abrirModalSemana()" class="btn-primary px-4 py-2 text-sm">' +
          '<i class="ph ph-calendar-plus"></i> Programar semana</button>' +
      '</div></div>';

    // ── Resumen del mes ──────────────────────────────────────────────────
    // Orienta de un vistazo y sirve de filtro. El cumplimiento se calcula solo
    // sobre lo YA CERRADO: las programadas a futuro no han tenido su oportunidad
    // y meterlas hundiría el porcentaje sin que nadie haya fallado en nada.
    var R = d.resumen || {};
    html += '<div class="res-fila">' +
      App._fichaResumen('PROGRAMADA', R.programadas || 0, 'Programadas', '--muted') +
      App._fichaResumen('PENDIENTE',  R.pendientes  || 0, 'Pendientes',  '--warn') +
      App._fichaResumen('EN_CURSO',   R.enCurso     || 0, 'En curso',    '--info') +
      App._fichaResumen('REALIZADA',  R.hechas      || 0, 'Hechas',      '--ok') +
      App._fichaResumen('NO_EJECUTADA', R.noEjecutadas || 0, 'No se hicieron', '--danger') +
      App._fichaResumen('', (R.cumplimiento === '' ? '—' : R.cumplimiento), 'Cumplimiento',
                        '--accent', R.cumplimiento === '' ? '' : '%') +
    '</div>' +
    (App._tareasEstado.filtro
      ? '<div class="filtro-activo">Mostrando solo <b>' +
        (App.TAREA_INFO[App._tareasEstado.filtro] || {}).label + '</b>' +
        '<button onclick="App._filtroTareas(\'' + App._tareasEstado.filtro + '\')">ver todo</button></div>'
      : '');

    // ── Franja de atrasadas ──────────────────────────────────────────────
    // Fija, con independencia del mes en pantalla. Es la garantía de que nada
    // se pierda al pasar de página: un mes solo nunca muestra lo de atrás.
    if (d.atrasadas.length) {
      html += '<div class="atrasadas">' +
        '<div class="atrasadas-t"><i class="ph ph-warning-circle"></i> Sin cerrar (' + d.atrasadas.length + ')' +
          '<span class="atrasadas-s">de cualquier mes — aquí siguen hasta que se resuelvan</span></div>' +
        '<div class="atrasadas-lista">' +
          d.atrasadas.map(function(t) { return App._fichaAtrasada(t, hoy); }).join('') +
        '</div></div>';
    }

    // ── Rejilla del mes ──────────────────────────────────────────────────
    var primero = new Date(e.anio, e.mes - 1, 1);
    var diasMes = new Date(e.anio, e.mes, 0).getDate();
    var arranque = (primero.getDay() + 6) % 7;   // lunes = 0

    var porDia = {};
    d.tareas.forEach(function(t) {
      if (App._tareasEstado.filtro && App._tareaEstado(t) !== App._tareasEstado.filtro) return;
      (porDia[t.fecha_programada] = porDia[t.fecha_programada] || []).push(t);
    });
    // Lo urgente sube dentro del día. Importa de verdad en la casilla del
    // calendario, donde solo caben tres fichas: si lo urgente quedara cuarto
    // desaparecería detrás de un "+2 más".
    Object.keys(porDia).forEach(function(k) {
      porDia[k].sort(function(a, b) {
        return (b.prioridad === 'URGENTE' ? 1 : 0) - (a.prioridad === 'URGENTE' ? 1 : 0);
      });
    });
    var lluvia = d.lluvia || {};

    html += '<div class="dx-panel"><div class="cal">';
    ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'].forEach(function(n) {
      html += '<div class="cal-cab">' + n + '</div>';
    });
    for (var i = 0; i < arranque; i++) html += '<div class="cal-dia vacio"></div>';

    for (var dia = 1; dia <= diasMes; dia++) {
      var iso = e.anio + '-' + (e.mes < 10 ? '0' : '') + e.mes + '-' + (dia < 10 ? '0' : '') + dia;
      var lista = porDia[iso] || [];
      var clases = 'cal-dia' + (iso === hoy ? ' hoy' : '') + (iso === e.diaAbierto ? ' abierto' : '') +
                   (lista.length ? ' con-tareas' : '');
      // En un celular la rejilla del mes se vuelve una lista (lo hace el CSS), y
      // ahí el número suelto no basta: "8" no dice nada, "lun 8" sí. El nombre
      // del día viaja en un atributo y solo el CSS de móvil lo muestra — ninguna
      // rama de lógica nueva, ningún segundo render que mantener.
      var DIAS_CORTO = ['dom','lun','mar','mié','jue','vie','sáb'];
      var nomDia = DIAS_CORTO[new Date(e.anio, e.mes - 1, dia).getDay()];
      html += '<div class="' + clases + '" onclick="App._abrirDia(\'' + iso + '\')">' +
        // El atributo va en cal-num y no en la casilla: attr() solo lee el
        // atributo del elemento al que pertenece el ::before.
        '<div class="cal-num" data-dia="' + nomDia + '">' + dia +
          // La lluvia del día va en la esquina: es lo que explica por qué una
          // labor no se pudo hacer, y verla junto a la tarea ahorra el cruce.
          ((lluvia[iso] !== undefined && lluvia[iso] > 0)
            ? '<span class="cal-mm" title="Llovió ' + lluvia[iso] + ' mm"><i class="ph ph-drop" aria-hidden="true"></i>' + lluvia[iso] + '</span>' : '') +
          (iso === hoy ? '<span class="cal-hoy">hoy</span>' : '') + '</div>';
      // Tres fichas y "+N": más no caben sin que la casilla reviente.
      lista.slice(0, 3).forEach(function(t) {
        var inf = App._tareaInfo(t);
        html += '<div class="cal-ficha' + (t.prioridad === 'URGENTE' ? ' urgente' : '') + '" ' +
          'style="--tc:var(' + inf.tk + ')" ' +
          // stopPropagation: sin esto el clic sube a la casilla, que hace toggle
          // del panel del día, y la tarea se cierra en vez de abrirse.
          'onclick="event.stopPropagation();App.abrirModalTarea(\'' + t.id_tarea + '\')" ' +
          'title="' + App._esc(t.actividad + ' · ' + (t.lote_nombre || t.predio_nombre) + ' · ' + inf.label) +
          ' — toca para abrirla">' +
          (t.prioridad === 'URGENTE' ? '<span class="cal-urg" title="Urgente"><i class="ph ph-caret-double-up" aria-hidden="true"></i></span>' : '') +
          '<span class="cal-pt">' + inf.icono + '</span>' +
          App._esc(t.actividad) + (t.lote_nombre ? ' <span class="cal-lo">' + App._esc(t.lote_nombre) + '</span>' : '') +
        '</div>';
      });
      if (lista.length > 3) html += '<div class="cal-mas">+' + (lista.length - 3) + ' más</div>';
      html += '</div>';
    }
    html += '</div></div>';

    // ── Panel del día abierto ────────────────────────────────────────────
    if (e.diaAbierto) {
      var delDia = porDia[e.diaAbierto] || [];
      html += '<div class="dx-panel">' +
        '<div class="dx-phead"><span class="dx-secico" style="--sc:var(--c-cyan)"><i class="ph ph-calendar-check"></i></span>' +
          '<div class="dx-ptitles"><div class="dx-ptitle">' + App.fmtFecha(e.diaAbierto) + '</div>' +
          '<div class="dx-psub">' + (delDia.length ? delDia.length + ' tarea' + (delDia.length !== 1 ? 's' : '') : 'Sin tareas este día') +
          (lluvia[e.diaAbierto] !== undefined ? ' · <i class="ph ph-drop" aria-hidden="true"></i> ' + lluvia[e.diaAbierto] + ' mm de lluvia' : '') + '</div></div>' +
          '<button onclick="App.abrirModalTarea(null,\'' + e.diaAbierto + '\')" class="btn-secondary text-sm">+ Agregar</button>' +
        '</div>' +
        (delDia.length ? '<div class="tarea-lista">' + delDia.map(App._filaTarea).join('') + '</div>'
                       : '<div class="text-sm" style="color:var(--muted)">Nada programado. Puedes agregar una tarea con el botón de arriba.</div>') +
      '</div>';
    }

    // Sin fincas cargadas el calendario es una rejilla muda: se dice qué falta.
    if (!predios.length) {
      html += '<div class="dx-panel"><div class="vacio-lluvia">' +
        '<div class="vacio-ico"><i class="ph ph-map-trifold" aria-hidden="true"></i></div>' +
        '<div class="vacio-t">Todavía no hay fincas registradas</div>' +
        '<div class="vacio-s">Las tareas se cuelgan de una finca y, si quieres, de un lote. ' +
        'Si ya tienes animales cargados, ejecuta una vez <b>SEMBRAR_PREDIOS_DESDE_ANIMALES()</b> ' +
        'desde el editor de Apps Script y tus fincas aparecerán solas.</div>' +
        '<a href="#/predios" class="btn-primary px-5 py-2.5 text-sm" style="margin-top:16px;text-decoration:none">' +
          'Ir a Predios y lotes</a>' +
      '</div></div>';
    }

    html += '</div>';
    App.renderMain(html);
  },

  _fichaAtrasada: function(t, hoy) {
    var inf = App._tareaInfo(t);
    var dias = t.dias_desfase;
    return '<button class="atrasada" onclick="App.abrirModalTarea(\'' + t.id_tarea + '\')">' +
      '<span class="atrasada-ic" style="color:var(' + inf.tk + ')">' + inf.icono + '</span>' +
      '<span class="atrasada-tx"><b>' + (t.prioridad === 'URGENTE' ? '<i class="ph ph-caret-double-up" aria-hidden="true"></i> ' : '') +
        App._actIcono(t.actividad) + ' ' + App._esc(t.actividad) + '</b>' +
        '<span>' + App._esc(t.lote_nombre || t.predio_nombre || '—') + ' · ' +
        (dias > 0 ? 'hace ' + dias + ' d' : App.fmtFecha(t.fecha_programada)) +
        (t.motivo ? ' · ' + App._esc(t.motivo) : '') + '</span></span>' +
    '</button>';
  },

  _filtroTareas: function(f) {
    App._tareasEstado.filtro = (App._tareasEstado.filtro === f) ? '' : f;
    App._pintarTareas();
  },

  // Ficha del resumen del mes. Además de informar, filtra: tocarla deja en el
  // calendario solo ese estado, que es la forma más rápida de responder
  // "¿qué me falta?".
  _fichaResumen: function(clave, valor, etiqueta, tk, sufijo) {
    var act = App._tareasEstado.filtro === clave;
    return '<button class="res-ficha' + (act ? ' is-on' : '') + '" style="--rc:var(' + tk + ')" ' +
      (clave ? 'onclick="App._filtroTareas(\'' + clave + '\')"' : 'disabled') + '>' +
      '<span class="res-val">' + valor + (sufijo || '') + '</span>' +
      '<span class="res-lab">' + etiqueta + '</span></button>';
  },

  _filaTarea: function(t) {
    return '<div class="tarea-fila">' +
      '<div class="tarea-info">' +
        '<div class="tarea-tit">' +
          (t.prioridad === 'URGENTE' ? '<span class="chip-urg"><i class="ph ph-caret-double-up" aria-hidden="true"></i> Urgente</span> ' : '') +
          App._actIcono(t.actividad) + ' ' + App._esc(t.actividad) +
          (t.lote_nombre ? ' <span class="tarea-lo">' + App._esc(t.lote_nombre) + '</span>' : '') + '</div>' +
        '<div class="tarea-sub">' + App._esc(t.predio_nombre || '') +
          (t.responsable ? ' · ' + App._esc(t.responsable) : '') +
          (t.descripcion ? ' · ' + App._esc(t.descripcion) : '') + '</div>' +
        (t.motivo ? '<div class="tarea-motivo"><i class="ph ph-x" aria-hidden="true"></i> ' + App._esc(t.motivo) + '</div>' : '') +
        (t.observacion ? '<div class="tarea-sub">“' + App._esc(t.observacion) + '”</div>' : '') +
      '</div>' +
      '<div class="tarea-acc">' + App._tareaChip(t) +
        (t.estado === 'PROGRAMADA' || t.estado === 'EN_CURSO'
          ? '<button onclick="App.abrirModalCerrar(\'' + t.id_tarea + '\',\'hecha\')" class="btn-secondary text-xs px-3 py-1"><i class="ph ph-check" aria-hidden="true"></i> Se hizo</button>' +
            '<button onclick="App.abrirModalCerrar(\'' + t.id_tarea + '\',\'no\')" class="btn-secondary text-xs px-3 py-1"><i class="ph ph-x" aria-hidden="true"></i> No se hizo</button>' +
            '<button onclick="App._moverTarea(\'' + t.id_tarea + '\',\'' + t.fecha_programada + '\')" ' +
              'class="btn-secondary text-xs px-3 py-1" title="Cambiar el día sin marcarla como fallida"><i class="ph ph-calendar" aria-hidden="true"></i> Mover</button>'
          : '') +
        '<button onclick="App.abrirModalTarea(\'' + t.id_tarea + '\')" class="btn-secondary text-xs px-3 py-1">Ver</button>' +
      '</div></div>';
  },

  // ══════════════════════════════════════════════════════════════════════
  //  MODALES DE TAREAS
  // ══════════════════════════════════════════════════════════════════════

  // Opciones de predio y de lote. El lote depende del predio elegido: ofrecer
  // lotes de otro predio dejaría el historial colgando del sitio equivocado, y
  // el backend lo rechaza de todos modos.
  _optPredios: function(sel) {
    var ps = ((App._tareasEstado.datos || {}).opciones || {}).predios || App._prediosCache || [];
    return '<option value="">— Predio —</option>' + ps.map(function(pr) {
      return '<option value="' + App._esc(pr.id_predio) + '"' + (pr.id_predio === sel ? ' selected' : '') +
        '>' + App._esc(pr.nombre) + '</option>';
    }).join('');
  },
  _optLotes: function(idPredio, sel) {
    var ps = ((App._tareasEstado.datos || {}).opciones || {}).predios || App._prediosCache || [];
    var pr = ps.filter(function(x) { return x.id_predio === idPredio; })[0];
    var ls = pr ? pr.lotes : [];
    return '<option value="">Todo el predio (sin lote)</option>' + ls.map(function(l) {
      return '<option value="' + App._esc(l.id_lote) + '"' + (l.id_lote === sel ? ' selected' : '') +
        '>' + App._esc(l.nombre) + '</option>';
    }).join('');
  },
  _optActividades: function(sel) {
    return '<option value="">— Labor —</option>' + App.ACTIVIDADES.map(function(a) {
      return '<option value="' + App._esc(a.tipo) + '"' + (a.tipo === sel ? ' selected' : '') +
        '>' + a.icono + ' ' + App._esc(a.tipo) + '</option>';
    }).join('');
  },
  // Al cambiar el predio se repueblan sus lotes y se descarta el que hubiera.
  _refrescarLotes: function(idSelPredio, idSelLote) {
    var pS = document.getElementById(idSelPredio), lS = document.getElementById(idSelLote);
    if (!pS || !lS) return;
    lS.innerHTML = App._optLotes(pS.value, '');
  },

  // Antes de abrir cualquier modal hacen falta los predios. Si el calendario ya
  // los trajo se reutilizan; si no, se piden una vez y se guardan.
  _conPredios: function(cb) {
    if (((App._tareasEstado.datos || {}).opciones || {}).predios || App._prediosCache) { cb(); return; }
    App.api('listPrediosLotes', [false], function(r) {
      App._prediosCache = (r && r.predios) || [];
      cb();
    });
  },

  // Consigue la tarea: primero de lo que ya trajo el calendario y, si no está
  // ahí, se la pide al servidor.
  //
  // El calendario solo carga el mes en pantalla más las atrasadas. Antes se daba
  // por hecho que la tarea estaría en esa tanda; cuando no estaba, quedaba en
  // null y el modal se abría COMO SI FUERA UNA TAREA NUEVA, con todo en blanco.
  // Desde fuera eso se ve exactamente como "no me deja abrirla, no puedo ver
  // qué es, ni editarla".
  _conTarea: function(idTarea, cb) {
    if (!idTarea) { cb(null); return; }
    var d = App._tareasEstado.datos;
    var todas = ((d && d.tareas) || []).concat((d && d.atrasadas) || []);
    var t = todas.filter(function(x) { return x.id_tarea === idTarea; })[0];
    if (t) { cb(t); return; }
    App.api('getTarea', [idTarea], function(r) {
      if (!r || !r.ok) { App.toast((r && r.error) || 'No se pudo abrir la tarea.', 'error'); return; }
      cb(r.data);
    });
  },

  // ── Crear / ver una tarea ────────────────────────────────────────────
  abrirModalTarea: function(idTarea, fecha, idPredio, idLote) {
    App._conPredios(function() { App._conTarea(idTarea, function(t) {
      var pSel = t ? t.id_predio : (idPredio || '');
      var lSel = t ? t.id_lote   : (idLote   || '');
      var fSel = t ? t.fecha_programada : (fecha || App._hoyISO());

      var html = '<div class="p-6">' +
        '<div class="flex items-center justify-between mb-5">' +
          '<h2 class="text-lg font-bold">' + (t ? 'Tarea' : 'Programar una labor') + '</h2>' +
          '<button onclick="App.cerrarModal()" class="text-gray-400 hover:text-gray-700 text-2xl leading-none">×</button>' +
        '</div>' +
        (t ? '<div class="mb-4">' + App._tareaChip(t) + '</div>' : '') +
        '<div class="grid grid-cols-2 gap-4">' +
          '<div class="form-group"><label class="form-label">Predio *</label>' +
            '<select id="tk_predio" class="form-input" onchange="App._refrescarLotes(\'tk_predio\',\'tk_lote\')">' +
              App._optPredios(pSel) + '</select></div>' +
          '<div class="form-group"><label class="form-label">Lote</label>' +
            '<select id="tk_lote" class="form-input">' + App._optLotes(pSel, lSel) + '</select></div>' +
        '</div>' +
        '<div class="grid grid-cols-2 gap-4">' +
          '<div class="form-group"><label class="form-label">Labor *</label>' +
            '<select id="tk_act" class="form-input">' + App._optActividades(t ? t.actividad : '') + '</select></div>' +
          '<div class="form-group"><label class="form-label">Fecha programada *</label>' +
            '<input type="date" id="tk_fecha" value="' + fSel + '" class="form-input"></div>' +
        '</div>' +
        '<div class="grid grid-cols-2 gap-4">' +
          '<div class="form-group"><label class="form-label">Responsable</label>' +
            '<input type="text" id="tk_resp" value="' + App._esc(t ? t.responsable : '') + '" class="form-input" placeholder="Quién la hace"></div>' +
          '<div class="form-group"><label class="form-label">Prioridad</label>' +
            '<select id="tk_prio" class="form-input">' +
              '<option value="NORMAL"' + (t && t.prioridad === 'URGENTE' ? '' : ' selected') + '>Normal</option>' +
              '<option value="URGENTE"' + (t && t.prioridad === 'URGENTE' ? ' selected' : '') + '>Urgente</option>' +
            '</select>' +
            '<div class="ayuda-campo">Urgente sube al principio del día y se marca en el calendario.</div></div>' +
        '</div>' +
        '<div class="form-group"><label class="form-label">Detalle</label>' +
          '<textarea id="tk_desc" rows="2" class="form-input" placeholder="Opcional">' + App._esc(t ? t.descripcion : '') + '</textarea></div>' +
        (t && t.motivo ? '<div class="alerta-card alerta-warning"><i class="ph ph-x" aria-hidden="true"></i> ' + App._esc(t.motivo) + '</div>' : '') +
        (t && t.reprogramada ? '<div class="alerta-card alerta-warning">↷ Reprogramada al ' +
          App.fmtFecha(t.sucesora_fecha) + '. Esta queda como registro de lo que pasó ese día.</div>' : '') +
        '<div class="flex justify-between items-center mt-4">' +
          (t && (t.estado === 'PROGRAMADA' || t.estado === 'EN_CURSO')
            ? '<div class="flex gap-4 items-center">' +
                '<button onclick="App._cancelarTarea(\'' + t.id_tarea + '\')" class="text-sm" style="color:var(--danger)">Cancelar la tarea</button>' +
                // Borrar es para el duplicado que sale de un doble toque: una fila
                // que no cuenta ninguna historia. Lo ya cerrado es historial y el
                // servidor lo protege — allí queda Cancelar, que deja el motivo.
                '<button onclick="App._eliminarTarea(\'' + t.id_tarea + '\',\'' + App._esc(t.actividad) + '\')" ' +
                  'class="text-sm" style="color:var(--muted)" title="Borrarla del todo — solo si sobra"><i class="ph ph-trash" aria-hidden="true"></i> Borrar</button>' +
              '</div>'
            : '<span></span>') +
          '<div class="flex gap-3">' +
            '<button onclick="App.cerrarModal()" class="btn-secondary">Cerrar</button>' +
            '<button onclick="App._guardarTarea(' + (t ? '\'' + t.id_tarea + '\'' : 'null') + ')" ' +
              'class="btn-primary px-6 py-2 text-sm" id="tk_guardar">' + (t ? 'Guardar cambios' : 'Programar') + '</button>' +
          '</div></div></div>';
      App.abrirModal(html);
    }); });
  },

  _leerTarea: function() {
    return {
      id_predio:        (document.getElementById('tk_predio') || {}).value || '',
      id_lote:          (document.getElementById('tk_lote')   || {}).value || '',
      actividad:        (document.getElementById('tk_act')    || {}).value || '',
      fecha_programada: (document.getElementById('tk_fecha')  || {}).value || '',
      responsable:      (document.getElementById('tk_resp')   || {}).value || '',
      prioridad:        (document.getElementById('tk_prio')   || {}).value || 'NORMAL',
      descripcion:      (document.getElementById('tk_desc')   || {}).value || ''
    };
  },

  _guardarTarea: function(idTarea) {
    var d = App._leerTarea();
    if (!d.id_predio)        { App.toast('Elige el predio.', 'error'); return; }
    if (!d.actividad)        { App.toast('Elige la labor.', 'error'); return; }
    if (!d.fecha_programada) { App.toast('Indica la fecha.', 'error'); return; }
    if (idTarea) d.id_tarea = idTarea;
    App._unaVez('tarea', 'tk_guardar', function(liberar) {
      App.api(idTarea ? 'actualizarTarea' : 'crearTarea', [d], function(r) {
        liberar();
        if (!r || !r.ok) { App.toast((r && r.error) || 'No se pudo guardar.', 'error'); return; }
        App.toast(idTarea ? 'Tarea actualizada ✓' : 'Tarea programada ✓', 'success');
        App.cerrarModal();
        App._refrescarTareas();
      }, liberar);
    });
  },

  // Borrar de verdad, para el duplicado que sobra. El servidor se niega si la
  // tarea ya se cerró o si de ella cuelga otra: eso es historial, y para eso
  // está Cancelar.
  _eliminarTarea: function(idTarea, actividad) {
    if (!confirm('¿Borrar «' + actividad + '»?\n\nDesaparece del calendario y no queda registro de ella. ' +
                 'Es para quitar una tarea repetida.\n\nSi la labor sí existió pero no se pudo hacer, ' +
                 'usa «No se hizo» o «Cancelar la tarea» para que quede el motivo.')) return;
    App.api('eliminarTarea', [{ id_tarea: idTarea }], function(r) {
      if (!r || !r.ok) { App.toast((r && r.error) || 'No se pudo borrar.', 'error'); return; }
      App.toast('Tarea borrada', 'info');
      App.cerrarModal();
      App._refrescarTareas();
    });
  },

  // Cambiar el día de una tarea que TODAVÍA no venció no es un incumplimiento:
  // se acordó un día y se prefiere otro. Por eso mueve la fecha sin tocar el
  // estado — marcarla "no ejecutada" ensuciaría el cumplimiento del mes.
  _moverTarea: function(idTarea, fechaActual) {
    var nueva = prompt('¿A qué día se mueve? (aaaa-mm-dd)', fechaActual);
    if (nueva === null) return;
    nueva = String(nueva).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(nueva)) {
      App.toast('La fecha debe ir como aaaa-mm-dd.', 'error'); return;
    }
    App.api('actualizarTarea', [{ id_tarea: idTarea, fecha_programada: nueva }], function(r) {
      if (!r || !r.ok) { App.toast((r && r.error) || 'No se pudo mover.', 'error'); return; }
      App.toast('Movida al ' + App.fmtFecha(nueva) + ' ✓', 'success');
      App._refrescarTareas();
    });
  },

  _cancelarTarea: function(idTarea) {
    var motivo = prompt('¿Por qué se cancela? (queda registrado)');
    if (motivo === null) return;
    if (!String(motivo).trim()) { App.toast('Hace falta el motivo.', 'error'); return; }
    App.api('cancelarTarea', [{ id_tarea: idTarea, motivo: motivo }], function(r) {
      if (!r || !r.ok) { App.toast((r && r.error) || 'No se pudo cancelar.', 'error'); return; }
      App.toast('Tarea cancelada', 'info');
      App.cerrarModal(); App._refrescarTareas();
    });
  },

  // ── Cerrar la tarea: se hizo, o no se hizo ───────────────────────────
  abrirModalCerrar: function(idTarea, modo) {
    App._conTarea(idTarea, function(t) { App._pintarModalCerrar(t, modo); });
  },
  _pintarModalCerrar: function(t, modo) {
    if (!t) return;
    var hoy = App._hoyISO();

    var html = '<div class="p-6">' +
      '<div class="flex items-center justify-between mb-1">' +
        '<h2 class="text-lg font-bold">' + App._actIcono(t.actividad) + ' ' + App._esc(t.actividad) + '</h2>' +
        '<button onclick="App.cerrarModal()" class="text-gray-400 hover:text-gray-700 text-2xl leading-none">×</button>' +
      '</div>' +
      '<div class="text-sm mb-5" style="color:var(--muted)">' +
        App._esc(t.lote_nombre || 'Todo el predio') + ' · ' + App._esc(t.predio_nombre) +
        ' · programada el ' + App.fmtFecha(t.fecha_programada) + '</div>';

    if (modo === 'hecha') {
      var dias = App._actDias(t.actividad);
      html += '<div class="grid grid-cols-2 gap-4">' +
          '<div class="form-group"><label class="form-label">¿Qué día se hizo? *</label>' +
            '<input type="date" id="ck_fecha" value="' + hoy + '" max="' + hoy + '" class="form-input"></div>' +
          '<div class="form-group"><label class="form-label">Quién</label>' +
            '<input type="text" id="ck_resp" value="' + App._esc(t.responsable) + '" class="form-input"></div>' +
        '</div>' +
        '<div class="form-group"><label class="form-label">Observación</label>' +
          '<textarea id="ck_obs" rows="2" class="form-input" placeholder="Cómo quedó, qué se notó…"></textarea></div>' +
        // La repetición se decide AQUÍ, al cerrar: nada aparece en el calendario
        // sin que alguien lo decida.
        '<label class="proc-det-cont" style="margin-top:0">' +
          '<input type="checkbox" id="ck_rep" ' + (dias ? 'checked' : '') + ' onchange="App._ckRep()">' +
          '<span>Vuelve a tocar en</span>' +
          '<input type="number" min="1" max="365" id="ck_dias" value="' + (dias || 45) + '" class="proc-dias" ' +
            (dias ? '' : 'disabled ') + 'oninput="App._ckRep()">' +
          '<span>días</span><span class="proc-det-fecha" id="ck_prox"></span>' +
        '</label>' +
        '<div class="flex justify-end gap-3 mt-4">' +
          '<button onclick="App.cerrarModal()" class="btn-secondary">Cancelar</button>' +
          '<button onclick="App._completar(\'' + t.id_tarea + '\')" class="btn-primary px-6 py-2 text-sm"><i class="ph ph-check" aria-hidden="true"></i> Registrar</button>' +
        '</div></div>';
    } else {
      html += '<div class="alerta-card alerta-warning" style="margin-bottom:14px">' +
          'La tarea no se borra: queda registrada en su fecha con el motivo, y si le pones una nueva ' +
          'fecha nace otra enlazada a ésta.</div>' +
        '<div class="form-group"><label class="form-label">¿Por qué no se pudo? *</label>' +
          '<input type="text" id="nk_motivo" class="form-input" placeholder="Llovió · emergencia · otra prioridad…"></div>' +
        '<div class="form-group"><label class="form-label">Nueva fecha <span class="text-xs font-normal" style="color:var(--muted)">— déjala vacía si aún no sabes cuándo</span></label>' +
          '<input type="date" id="nk_fecha" value="' + App._sumarDiasISO(hoy, 7) + '" class="form-input"></div>' +
        '<div class="form-group"><label class="form-label">Observación</label>' +
          '<textarea id="nk_obs" rows="2" class="form-input" placeholder="Opcional"></textarea></div>' +
        '<div class="flex justify-end gap-3 mt-4">' +
          '<button onclick="App.cerrarModal()" class="btn-secondary">Cancelar</button>' +
          '<button onclick="App._noEjecutar(\'' + t.id_tarea + '\')" class="btn-primary px-6 py-2 text-sm">Registrar</button>' +
        '</div></div>';
    }
    App.abrirModal(html);
    if (modo === 'hecha') setTimeout(App._ckRep, 30);
  },

  _ckRep: function() {
    var chk = document.getElementById('ck_rep'), dias = document.getElementById('ck_dias'),
        prox = document.getElementById('ck_prox'), fec = document.getElementById('ck_fecha');
    if (!chk || !dias) return;
    dias.disabled = !chk.checked;
    var n = parseInt(dias.value, 10);
    prox.textContent = (chk.checked && n > 0 && fec && fec.value)
      ? '→ ' + App.fmtFecha(App._sumarDiasISO(fec.value, n)) : '';
  },

  _completar: function(idTarea) {
    var chk = document.getElementById('ck_rep');
    var payload = {
      id_tarea:        idTarea,
      fecha_ejecucion: (document.getElementById('ck_fecha') || {}).value || '',
      observacion:     (document.getElementById('ck_obs')   || {}).value || '',
      responsable_siguiente: (document.getElementById('ck_resp') || {}).value || '',
      repetir_en_dias: (chk && chk.checked) ? ((document.getElementById('ck_dias') || {}).value || 0) : 0
    };
    App.api('completarTarea', [payload], function(r) {
      if (!r || !r.ok) { App.toast((r && r.error) || 'No se pudo registrar.', 'error'); return; }
      App.toast('Labor registrada ✓' + (r.siguiente ? ' · próxima el ' + App.fmtFecha(r.siguiente.fecha_programada) : ''), 'success');
      App.cerrarModal(); App._refrescarTareas();
    });
  },

  _noEjecutar: function(idTarea) {
    var motivo = (document.getElementById('nk_motivo') || {}).value || '';
    if (!motivo.trim()) { App.toast('Indica por qué no se pudo hacer.', 'error'); return; }
    App.api('noEjecutarTarea', [{
      id_tarea:    idTarea,
      motivo:      motivo,
      nueva_fecha: (document.getElementById('nk_fecha') || {}).value || '',
      observacion: (document.getElementById('nk_obs')   || {}).value || ''
    }], function(r) {
      if (!r || !r.ok) { App.toast((r && r.error) || 'No se pudo registrar.', 'error'); return; }
      App.toast(r.siguiente ? 'Registrada y reprogramada al ' + App.fmtFecha(r.siguiente.fecha_programada)
                            : 'Registrada como no ejecutada — queda en «sin cerrar»', 'info');
      App.cerrarModal(); App._refrescarTareas();
    });
  },

  // ── Programar la semana: el momento de la llamada del jueves ─────────
  _semanaFilas: 0,
  abrirModalSemana: function() {
    App._conPredios(function() {
      App._semanaFilas = 0;
      var lunes = App._proximoLunes();
      var html = '<div class="p-6">' +
        '<div class="flex items-center justify-between mb-1">' +
          '<h2 class="text-lg font-bold"><i class="ph ph-calendar" aria-hidden="true"></i> Programar la semana</h2>' +
          '<button onclick="App.cerrarModal()" class="text-gray-400 hover:text-gray-700 text-2xl leading-none">×</button>' +
        '</div>' +
        '<p class="text-xs mb-4" style="color:var(--muted)">Elige el predio y el responsable una vez, y agrega abajo las labores acordadas.</p>' +
        '<div class="grid grid-cols-2 gap-4">' +
          '<div class="form-group"><label class="form-label">Predio *</label>' +
            '<select id="sm_predio" class="form-input" onchange="App._semanaRepredio()">' + App._optPredios('') + '</select></div>' +
          '<div class="form-group"><label class="form-label">Responsable</label>' +
            '<input type="text" id="sm_resp" class="form-input" placeholder="El encargado del predio"></div>' +
        '</div>' +
        '<div id="sm_filas"></div>' +
        '<button onclick="App._semanaFila()" class="btn-secondary text-sm w-full" style="justify-content:center">+ Agregar labor</button>' +
        '<div class="flex justify-end gap-3 mt-4">' +
          '<button onclick="App.cerrarModal()" class="btn-secondary">Cancelar</button>' +
          '<button onclick="App._guardarSemana()" id="sm_guardar" class="btn-primary px-6 py-2 text-sm">Programar todas</button>' +
        '</div></div>';
      App.abrirModal(html);
      App._semanaBase = lunes;
      App._semanaFila(); App._semanaFila(); App._semanaFila();
    });
  },

  // Lunes de la semana siguiente: es lo que se acuerda el jueves o viernes.
  _proximoLunes: function() {
    var h = new Date();
    var faltan = (8 - h.getDay()) % 7 || 7;
    h.setDate(h.getDate() + faltan);
    return App._fechaISO(h);
  },

  _semanaFila: function() {
    var cont = document.getElementById('sm_filas'); if (!cont) return;
    var i = App._semanaFilas++;
    var pSel = (document.getElementById('sm_predio') || {}).value || '';
    var div = document.createElement('div');
    div.className = 'sm-fila';
    div.innerHTML =
      '<select id="sm_act_' + i + '" class="form-input">' + App._optActividades('') + '</select>' +
      '<select id="sm_lote_' + i + '" class="form-input sm-lote">' + App._optLotes(pSel, '') + '</select>' +
      '<input type="date" id="sm_fecha_' + i + '" value="' + App._semanaBase + '" class="form-input">' +
      '<button onclick="this.parentNode.remove()" class="sm-quitar" title="Quitar">×</button>';
    cont.appendChild(div);
  },

  // Al cambiar el predio hay que repoblar los lotes de TODAS las filas: los de
  // otro predio no valen y el backend los rechazaría.
  _semanaRepredio: function() {
    var pSel = (document.getElementById('sm_predio') || {}).value || '';
    for (var i = 0; i < App._semanaFilas; i++) {
      var sel = document.getElementById('sm_lote_' + i);
      if (sel) sel.innerHTML = App._optLotes(pSel, '');
    }
  },

  _guardarSemana: function() {
    var idPredio = (document.getElementById('sm_predio') || {}).value || '';
    if (!idPredio) { App.toast('Elige el predio.', 'error'); return; }
    var resp = (document.getElementById('sm_resp') || {}).value || '';

    var tareas = [];
    for (var i = 0; i < App._semanaFilas; i++) {
      var act = document.getElementById('sm_act_' + i);
      if (!act) continue;                       // fila quitada
      if (!act.value) continue;                 // fila sin labor: se ignora, no es un error
      tareas.push({
        id_predio:        idPredio,
        id_lote:          (document.getElementById('sm_lote_' + i)  || {}).value || '',
        actividad:        act.value,
        fecha_programada: (document.getElementById('sm_fecha_' + i) || {}).value || '',
        responsable:      resp
      });
    }
    if (!tareas.length) { App.toast('Agrega al menos una labor.', 'error'); return; }

    App._unaVez('semana', 'sm_guardar', function(liberar) {
      App.api('crearTareasSemana', [{ tareas: tareas }], function(r) {
        liberar();
        if (!r) { App.toast('No se pudo programar.', 'error'); return; }
        if (r.errores && r.errores.length) {
          App.toast(r.total + ' programadas · ' + r.errores.length + ' con problema: ' + r.errores[0], 'info');
        } else {
          App.toast(r.total + ' labor' + (r.total !== 1 ? 'es' : '') + ' programada' + (r.total !== 1 ? 's' : '') + ' ✓', 'success');
        }
        App.cerrarModal(); App._refrescarTareas();
      }, liberar);
    });
  },

  // ── Predio y lote ────────────────────────────────────────────────────
  abrirModalPredio: function(idPredio) {
    App._conPredios(function() {
      var ps = App._prediosCache || ((App._tareasEstado.datos || {}).opciones || {}).predios || [];
      var pr = ps.filter(function(x) { return x.id_predio === idPredio; })[0] || null;
      App.abrirModal('<div class="p-6">' +
        '<div class="flex items-center justify-between mb-5">' +
          '<h2 class="text-lg font-bold">' + (pr ? 'Editar predio' : 'Nuevo predio') + '</h2>' +
          '<button onclick="App.cerrarModal()" class="text-gray-400 hover:text-gray-700 text-2xl leading-none">×</button></div>' +
        '<div class="form-group"><label class="form-label">Nombre *</label>' +
          '<input type="text" id="pd_nombre" value="' + App._esc(pr ? pr.nombre : '') + '" class="form-input" placeholder="LA SIERRA"></div>' +
        '<div class="form-group"><label class="form-label">Propietario</label>' +
          '<input type="text" id="pd_prop" value="' + App._esc(pr ? pr.propietario : '') + '" class="form-input"></div>' +
        '<div class="form-group"><label class="form-label">Notas</label>' +
          '<textarea id="pd_notas" rows="2" class="form-input">' + App._esc(pr ? pr.notas : '') + '</textarea></div>' +
        '<div class="flex justify-end gap-3 mt-4">' +
          '<button onclick="App.cerrarModal()" class="btn-secondary">Cancelar</button>' +
          '<button onclick="App._guardarPredio(' + (pr ? '\'' + pr.id_predio + '\'' : 'null') + ')" class="btn-primary px-6 py-2 text-sm">Guardar</button>' +
        '</div></div>');
    });
  },
  _guardarPredio: function(id) {
    var d = {
      nombre:      (document.getElementById('pd_nombre') || {}).value || '',
      propietario: (document.getElementById('pd_prop')   || {}).value || '',
      notas:       (document.getElementById('pd_notas')  || {}).value || ''
    };
    if (id) d.id_predio = id;
    App.api('guardarPredio', [d], function(r) {
      if (!r || !r.ok) { App.toast((r && r.error) || 'No se pudo guardar.', 'error'); return; }
      App._prediosCache = null; App._tareasEstado.datos = null;
      App.toast('Predio guardado ✓', 'success');
      App.cerrarModal(); App.vistaPrediosLotes();
    });
  },

  abrirModalLote: function(idLote, idPredio) {
    App._conPredios(function() {
      var ps = App._prediosCache || ((App._tareasEstado.datos || {}).opciones || {}).predios || [];
      var lo = null;
      ps.forEach(function(pr) {
        (pr.lotes || []).forEach(function(l) { if (l.id_lote === idLote) lo = l; });
      });
      var pSel = lo ? lo.id_predio : (idPredio || '');
      App.abrirModal('<div class="p-6">' +
        '<div class="flex items-center justify-between mb-5">' +
          '<h2 class="text-lg font-bold">' + (lo ? 'Editar lote' : 'Nuevo lote') + '</h2>' +
          '<button onclick="App.cerrarModal()" class="text-gray-400 hover:text-gray-700 text-2xl leading-none">×</button></div>' +
        '<div class="grid grid-cols-2 gap-4">' +
          '<div class="form-group"><label class="form-label">Predio *</label>' +
            '<select id="lt_predio" class="form-input">' + App._optPredios(pSel) + '</select></div>' +
          '<div class="form-group"><label class="form-label">Nombre *</label>' +
            '<input type="text" id="lt_nombre" value="' + App._esc(lo ? lo.nombre : '') + '" class="form-input" placeholder="Lote 3"></div>' +
        '</div>' +
        '<div class="form-group"><label class="form-label">Área (hectáreas)</label>' +
          App._numInput('lt_area', { clase:'w-40', value: lo && lo.area_ha ? lo.area_ha : '', placeholder:'Opcional' }) + '</div>' +
        '<div class="form-group"><label class="form-label">Notas</label>' +
          '<textarea id="lt_notas" rows="2" class="form-input">' + App._esc(lo ? lo.notas : '') + '</textarea></div>' +
        '<div class="flex justify-end gap-3 mt-4">' +
          '<button onclick="App.cerrarModal()" class="btn-secondary">Cancelar</button>' +
          '<button onclick="App._guardarLote(' + (lo ? '\'' + lo.id_lote + '\'' : 'null') + ')" class="btn-primary px-6 py-2 text-sm">Guardar</button>' +
        '</div></div>');
    });
  },
  _guardarLote: function(id) {
    var d = {
      id_predio: (document.getElementById('lt_predio') || {}).value || '',
      nombre:    (document.getElementById('lt_nombre') || {}).value || '',
      area_ha:   (function(v){ return isNaN(v) ? '' : v; })(App._leerNum('lt_area')),
      notas:     (document.getElementById('lt_notas')  || {}).value || ''
    };
    if (id) d.id_lote = id;
    App.api('guardarLote', [d], function(r) {
      if (!r || !r.ok) { App.toast((r && r.error) || 'No se pudo guardar.', 'error'); return; }
      App._prediosCache = null; App._tareasEstado.datos = null;
      App.toast('Lote guardado ✓', 'success');
      App.cerrarModal(); App.vistaPrediosLotes();
    });
  },

  // ══════════════════════════════════════════════════════════════════════
  //  LLUVIAS — lectura del pluviómetro por finca
  //
  //  Se registra el dato de UN DÍA, no un acumulado del mes: del detalle diario
  //  sale el mes, pero de un total mensual no se puede recuperar qué día llovió
  //  — y ese día es justo el que explica por qué una labor no se pudo hacer.
  // ══════════════════════════════════════════════════════════════════════

  _lluviasEstado: { anio: null, id_predio: '', datos: null },

  vistaLluvias: function() {
    var e = App._lluviasEstado;
    if (e.anio === null) e.anio = parseInt(App._hoyISO().substring(0, 4), 10);
    App.mostrarLoading('Cargando lluvias…');
    App.api('getLluvias', [{ anio: e.anio, id_predio: e.id_predio }], function(r) {
      App.ocultarLoading();
      if (!r || !r.ok) {
        App.renderMain('<div class="alerta-card alerta-danger">No se pudieron cargar las lluvias: ' +
          App._esc((r && r.error) || 'error desconocido') + '</div>');
        return;
      }
      e.datos = r;
      App._pintarLluvias();
    });
  },

  _anioLluvia: function(a) { App._lluviasEstado.anio = parseInt(a, 10); App.vistaLluvias(); },
  _predioLluvia: function(id) { App._lluviasEstado.id_predio = id; App.vistaLluvias(); },

  _pintarLluvias: function() {
    var e = App._lluviasEstado, d = e.datos;
    var MESC = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

    var html = '<div class="dx-wrap">' + App._subtabs('tareas', '#/lluvias') +
      '<div class="dx-head"><div><h2 class="dx-title">Lluvias ' + d.anio + '</h2>' +
        '<div class="dx-sub">Lectura del pluviómetro de cada finca. ' +
        (d.hayDatos ? d.totalRegistros + ' lectura' + (d.totalRegistros !== 1 ? 's' : '') + ' registrada' + (d.totalRegistros !== 1 ? 's' : '')
                    : 'Todavía sin datos.') + '</div></div>' +
        '<div class="dx-toolbar">' +
          '<select class="filter-select" onchange="App._predioLluvia(this.value)">' +
            '<option value="">Todas las fincas</option>' +
            d.predios.map(function(pr) {
              return '<option value="' + App._esc(pr.id_predio) + '"' +
                (pr.id_predio === e.id_predio ? ' selected' : '') + '>' + App._esc(pr.nombre) + '</option>';
            }).join('') + '</select>' +
          '<select class="filter-select" onchange="App._anioLluvia(this.value)">' +
            d.anios.map(function(a) {
              return '<option value="' + a + '"' + (+a === d.anio ? ' selected' : '') + '>' + a + '</option>';
            }).join('') + '</select>' +
          '<button onclick="App.abrirModalLluvia()" class="btn-primary px-4 py-2 text-sm">' +
            '<i class="ph ph-drop"></i> Registrar lluvia</button>' +
        '</div></div>';

    // Sin datos, la pantalla explica qué hacer en vez de mostrar ceros y una
    // gráfica plana, que se leen como si el sistema estuviera roto.
    if (!d.hayDatos) {
      html += '<div class="dx-panel"><div class="vacio-lluvia">' +
        '<div class="vacio-ico"><i class="ph ph-cloud-rain" aria-hidden="true"></i></div>' +
        '<div class="vacio-t">La hoja de lluvias está lista y vacía</div>' +
        '<div class="vacio-s">Cada mañana, el encargado mira el pluviómetro y anota los milímetros. ' +
        'Con «Registrar lluvia» queda guardado por finca y por día.<br><br>' +
        'Un <b>cero también sirve</b>: «ese día no llovió» explica tanto como un aguacero, ' +
        'y es lo que después respalda por qué una labor no se pudo hacer.</div>' +
        '<button onclick="App.abrirModalLluvia()" class="btn-primary px-5 py-2.5 text-sm" style="margin-top:16px">' +
          '<i class="ph ph-drop"></i> Registrar la primera lectura</button>' +
      '</div></div></div>';
      App.renderMain(html);
      return;
    }

    // KPIs por finca del año
    html += '<div class="lluvia-cards">' +
      d.resumen.map(function(r) {
        return '<div class="lluvia-card">' +
          '<div class="lluvia-n">' + App._esc(r.nombre) + '</div>' +
          '<div class="lluvia-mm">' + App.fmt(r.total, 1) + '<small>mm</small></div>' +
          '<div class="lluvia-s">' + r.diasLluvia + ' día' + (r.diasLluvia !== 1 ? 's' : '') + ' con lluvia · ' +
            r.lecturas + ' lectura' + (r.lecturas !== 1 ? 's' : '') + '</div>' +
          (r.maxima ? '<div class="lluvia-s">Máxima: <b>' + App.fmt(r.maxima.mm, 1) + ' mm</b> el ' +
            App.fmtFecha(r.maxima.fecha) + '</div>' : '') +
          (r.promedioDiaLluvia ? '<div class="lluvia-s">Promedio los días que llovió: <b>' +
            App.fmt(r.promedioDiaLluvia, 1) + ' mm</b></div>' : '') +
        '</div>';
      }).join('') + '</div>';

    // Comparativo mensual entre fincas
    html += '<div class="dx-panel"><div class="dx-phead">' +
      '<span class="dx-secico" style="--sc:var(--c-cyan)"><i class="ph ph-chart-bar"></i></span>' +
      '<div class="dx-ptitles"><div class="dx-ptitle">Milímetros por mes</div>' +
      '<div class="dx-psub">Una barra por finca. Sirve para ver la temporada seca y la de lluvias.</div></div></div>' +
      '<div class="dx-chart-sm" style="height:280px"><canvas id="chart-lluvia"></canvas></div></div>';

    // Tabla mensual
    html += '<div class="dx-panel"><div class="dx-phead">' +
      '<span class="dx-secico" style="--sc:var(--c-blue)"><i class="ph ph-table"></i></span>' +
      '<div class="dx-ptitles"><div class="dx-ptitle">Detalle mes a mes</div>' +
      '<div class="dx-psub">Milímetros acumulados y días con lluvia.</div></div></div>' +
      '<div style="overflow-x:auto"><table class="tabla-ganadero"><thead><tr><th>Finca</th>' +
        MESC.map(function(m) { return '<th style="text-align:right">' + m + '</th>'; }).join('') +
        '<th style="text-align:right">Año</th></tr></thead><tbody>' +
      d.serie.map(function(sp) {
        return '<tr><td><b>' + App._esc(sp.nombre) + '</b></td>' +
          sp.meses.map(function(m) {
            return '<td style="text-align:right">' + (m.lecturas
              ? App.fmt(m.mm, 0) + '<span style="color:var(--muted);font-size:.72rem"> · ' + m.dias + 'd</span>'
              : '<span style="color:var(--muted)">—</span>') + '</td>';
          }).join('') +
          '<td style="text-align:right"><b style="color:var(--accent)">' + App.fmt(sp.total, 0) + '</b></td></tr>';
      }).join('') + '</tbody></table></div></div>';

    // Últimas lecturas
    html += '<div class="dx-panel"><div class="dx-phead">' +
      '<span class="dx-secico" style="--sc:var(--c-violet)"><i class="ph ph-list-bullets"></i></span>' +
      '<div class="dx-ptitles"><div class="dx-ptitle">Últimas lecturas</div>' +
      '<div class="dx-psub">Lo más reciente primero.</div></div></div>' +
      '<div style="overflow-x:auto"><table class="tabla-ganadero"><thead><tr>' +
        '<th>Fecha</th><th>Finca</th><th style="text-align:right">Milímetros</th><th>Quién</th><th>Observación</th><th></th>' +
      '</tr></thead><tbody>' +
      (d.lista.length ? d.lista.map(function(l) {
        return '<tr><td>' + App.fmtFecha(l.fecha) + '</td>' +
          '<td>' + App._esc(l.predio_nombre) + '</td>' +
          '<td style="text-align:right"><b>' + App.fmt(l.milimetros, 1) + ' mm</b></td>' +
          '<td>' + App._esc(l.registrado_por || '—') + '</td>' +
          '<td>' + App._esc(l.observacion || '—') + '</td>' +
          '<td><button onclick="App._borrarLluvia(\'' + l.id_lluvia + '\')" class="btn-secondary text-xs px-2 py-1">Quitar</button></td></tr>';
      }).join('') : '<tr><td colspan="6" class="text-center text-gray-400 py-6">Sin lecturas este año</td></tr>') +
      '</tbody></table></div></div>';

    App.renderMain(html + '</div>');

    // Gráfico: una serie por finca, con la paleta categórica del sistema.
    setTimeout(function() {
      var cv = document.getElementById('chart-lluvia');
      if (!cv || !d.serie.length) return;
      var COLS = ['--c-cyan','--c-blue','--c-violet','--c-green','--c-amber','--c-rose'];
      App.estado.charts['lluvia'] = new Chart(cv, {
        type: 'bar',
        data: {
          labels: MESC,
          datasets: d.serie.map(function(sp, i) {
            return { label: sp.nombre, data: sp.meses.map(function(m) { return m.mm; }),
                     backgroundColor: App._tok(COLS[i % COLS.length], '#31c7d6'),
                     borderRadius: 5, borderSkipped: false, maxBarThickness: 26 };
          })
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          scales: {
            x: { grid: { display: false }, ticks: { color: App._tok('--chart-tick', '#9c9384') } },
            y: { beginAtZero: true, grid: { color: App._tok('--chart-grid', 'rgba(150,140,120,0.22)') },
                 ticks: { color: App._tok('--chart-tick', '#9c9384'),
                          callback: function(v) { return v + ' mm'; } } }
          },
          plugins: { legend: { position: 'top', labels: { usePointStyle: true, boxWidth: 8 } } }
        }
      });
    }, 40);
  },

  abrirModalLluvia: function() {
    var d = App._lluviasEstado.datos || {};
    var predios = d.predios || [];
    var hoy = App._hoyISO();
    App.abrirModal('<div class="p-6">' +
      '<div class="flex items-center justify-between mb-1">' +
        '<h2 class="text-lg font-bold"><i class="ph ph-cloud-rain" aria-hidden="true"></i> Registrar lluvia</h2>' +
        '<button onclick="App.cerrarModal()" class="text-gray-400 hover:text-gray-700 text-2xl leading-none">×</button></div>' +
      '<p class="text-xs mb-4" style="color:var(--muted)">Los milímetros que marcó el pluviómetro ese día. ' +
        'Si no llovió, anota <b>0</b>: también es un dato.</p>' +
      '<div class="grid grid-cols-2 gap-4">' +
        '<div class="form-group"><label class="form-label">Finca *</label>' +
          '<select id="ll_predio" class="form-input"><option value="">— Finca —</option>' +
            predios.map(function(pr) {
              return '<option value="' + App._esc(pr.id_predio) + '">' + App._esc(pr.nombre) + '</option>';
            }).join('') + '</select></div>' +
        '<div class="form-group"><label class="form-label">Fecha *</label>' +
          '<input type="date" id="ll_fecha" value="' + hoy + '" max="' + hoy + '" class="form-input"></div>' +
      '</div>' +
      '<div class="grid grid-cols-2 gap-4">' +
        '<div class="form-group"><label class="form-label">Milímetros *</label>' +
          App._numInput('ll_mm', { placeholder:'Ej: 12,5' }) + '</div>' +
        '<div class="form-group"><label class="form-label">Quién lo midió</label>' +
          '<input type="text" id="ll_quien" class="form-input" placeholder="El encargado"></div>' +
      '</div>' +
      '<div class="form-group"><label class="form-label">Observación</label>' +
        '<input type="text" id="ll_obs" class="form-input" placeholder="Aguacero de la tarde, granizo…"></div>' +
      '<div class="flex justify-end gap-3 mt-4">' +
        '<button onclick="App.cerrarModal()" class="btn-secondary">Cancelar</button>' +
        '<button onclick="App._guardarLluvia()" class="btn-primary px-6 py-2 text-sm">Guardar</button>' +
      '</div></div>');
  },

  _guardarLluvia: function() {
    var p = {
      id_predio:      (document.getElementById('ll_predio') || {}).value || '',
      fecha:          (document.getElementById('ll_fecha')  || {}).value || '',
      milimetros:     App._leerNum('ll_mm'),
      registrado_por: (document.getElementById('ll_quien')  || {}).value || '',
      observacion:    (document.getElementById('ll_obs')    || {}).value || ''
    };
    if (!p.id_predio)  { App.toast('Elige la finca.', 'error'); return; }
    if (isNaN(p.milimetros)) { App._marcarCampo('ll_mm', 'Escribe los milímetros — 0 si no llovió'); return; }
    App.api('registrarLluvia', [p], function(r) {
      if (!r || !r.ok) { App.toast((r && r.error) || 'No se pudo guardar.', 'error'); return; }
      App.toast(r.actualizada ? 'Lectura actualizada ✓ (ya había una de ese día)' : 'Lluvia registrada ✓', 'success');
      App.cerrarModal(); App.vistaLluvias();
    });
  },

  _borrarLluvia: function(id) {
    if (!confirm('¿Quitar esta lectura?')) return;
    App.api('eliminarLluvia', [id], function(r) {
      if (!r || !r.ok) { App.toast((r && r.error) || 'No se pudo quitar.', 'error'); return; }
      App.toast('Lectura eliminada', 'info');
      App.vistaLluvias();
    });
  },

  // ── PREDIOS Y LOTES ──────────────────────────────────────────────────
  vistaPrediosLotes: function() {
    App.mostrarLoading('Cargando predios…');
    App.api('listPrediosLotes', [false], function(r) {
      App.ocultarLoading();
      if (!r || !r.ok) { App.renderMain('<div class="alerta-card alerta-danger">No se pudieron cargar los predios.</div>'); return; }

      var html = '<div class="dx-wrap">' + App._subtabs('tareas', '#/predios') +
        '<div class="dx-head"><div><h2 class="dx-title">Predios y lotes</h2>' +
          '<div class="dx-sub">Cada lote guarda su propio historial de labores.</div></div>' +
          '<div class="dx-toolbar">' +
            '<button onclick="App.abrirModalPredio()" class="btn-secondary text-sm">+ Predio</button>' +
            '<button onclick="App.abrirModalLote()" class="btn-primary px-4 py-2 text-sm"><i class="ph ph-plus"></i> Lote</button>' +
          '</div></div>';

      if (!r.predios.length) {
        html += '<div class="dx-panel"><div class="text-sm" style="color:var(--muted);line-height:1.7">' +
          'Todavía no hay predios registrados. Si ya tienes animales cargados, ejecuta una vez ' +
          '<b>SEMBRAR_PREDIOS_DESDE_ANIMALES()</b> desde el editor de Apps Script y aparecerán solos; ' +
          'después agrega los lotes de cada uno.</div></div>';
      } else {
        html += '<div class="predio-grid">';
        r.predios.forEach(function(pr) {
          html += '<div class="predio-card">' +
            '<div class="predio-cab"><div><div class="predio-n">' + App._esc(pr.nombre) + '</div>' +
              '<div class="predio-s">' + pr.lotes.length + ' lote' + (pr.lotes.length !== 1 ? 's' : '') +
              (pr.propietario ? ' · ' + App._esc(pr.propietario) : '') + '</div></div>' +
              '<button onclick="App.abrirModalPredio(\'' + pr.id_predio + '\')" class="btn-secondary text-xs px-3 py-1">Editar</button>' +
            '</div>' +
            (pr.lotes.length
              ? '<div class="lote-lista">' + pr.lotes.map(function(l) {
                  return '<a href="#/lote/' + encodeURIComponent(l.id_lote) + '" class="lote-item">' +
                    '<b>' + App._esc(l.nombre) + '</b>' +
                    '<span>' + (l.area_ha ? l.area_ha + ' ha' : 'sin área') + ' · ver historial →</span></a>';
                }).join('') + '</div>'
              : '<div class="lote-vacio">Sin lotes. Agrega el primero con el botón «Lote».</div>') +
            '<button onclick="App.abrirModalLote(null,\'' + pr.id_predio + '\')" class="lote-add">+ Agregar lote a ' + App._esc(pr.nombre) + '</button>' +
          '</div>';
        });
        html += '</div>';
      }
      App.renderMain(html + '</div>');
    });
  },

  // ── HISTORIAL DE UN LOTE ─────────────────────────────────────────────
  vistaHistorialLote: function(idLote) {
    if (!idLote) { window.location.hash = '#/predios'; return; }
    App.mostrarLoading('Cargando historial…');
    App.api('getHistorialLote', [decodeURIComponent(idLote)], function(r) {
      App.ocultarLoading();
      if (!r || !r.ok) { App.renderMain('<div class="alerta-card alerta-danger">Lote no encontrado.</div>'); return; }

      var html = '<div class="dx-wrap">' +
        '<div class="miga"><a href="#/predios" class="miga-volver"><i class="ph ph-arrow-left"></i> Predios y lotes</a>' +
          '<span class="miga-sep">›</span><span class="miga-actual">' + App._esc(r.lote.nombre) + '</span></div>' +
        '<div class="dx-head"><div><h2 class="dx-title">' + App._esc(r.lote.nombre) + '</h2>' +
          '<div class="dx-sub">' + App._esc(r.predio ? r.predio.nombre : '') +
          (r.lote.area_ha ? ' · ' + r.lote.area_ha + ' ha' : '') +
          ' · ' + r.tareas.length + ' tarea' + (r.tareas.length !== 1 ? 's' : '') + ' registrada' + (r.tareas.length !== 1 ? 's' : '') + '</div></div>' +
          '<div class="dx-toolbar"><button onclick="App.abrirModalTarea(null,null,\'' +
            r.lote.id_predio + '\',\'' + r.lote.id_lote + '\')" class="btn-primary px-4 py-2 text-sm">' +
            '<i class="ph ph-plus"></i> Programar labor</button></div></div>';

      // Resumen por labor: la respuesta a "¿cuándo toca volver a guadañar?"
      if (r.porActividad.length) {
        html += '<div class="dx-panel"><div class="dx-phead">' +
          '<span class="dx-secico" style="--sc:var(--c-green)"><i class="ph ph-repeat"></i></span>' +
          '<div class="dx-ptitles"><div class="dx-ptitle">Cada labor en este lote</div>' +
          '<div class="dx-psub">Cuándo se hizo por última vez y cuándo vuelve a tocar.</div></div></div>' +
          '<div style="overflow-x:auto"><table class="tabla-ganadero"><thead><tr>' +
            '<th>Labor</th><th>Veces</th><th>Última vez</th><th>Hace</th><th>Próxima</th><th>Sin cerrar</th>' +
          '</tr></thead><tbody>' +
          r.porActividad.map(function(a) {
            return '<tr><td><b>' + App._actIcono(a.actividad) + ' ' + App._esc(a.actividad) + '</b></td>' +
              '<td>' + a.veces + '</td>' +
              '<td>' + (a.ultimaEjecucion ? App.fmtFecha(a.ultimaEjecucion) : '—') + '</td>' +
              '<td>' + (a.diasDesde === '' ? '—' : a.diasDesde + ' d') + '</td>' +
              '<td>' + (a.proximaProgramada
                ? '<b style="color:var(--accent)">' + App.fmtFecha(a.proximaProgramada) + '</b>' : '—') + '</td>' +
              '<td>' + (a.pendientes ? '<b style="color:var(--warn)">' + a.pendientes + '</b>' : '—') + '</td></tr>';
          }).join('') + '</tbody></table></div></div>';
      }

      html += '<div class="dx-panel"><div class="dx-phead">' +
        '<span class="dx-secico" style="--sc:var(--c-blue)"><i class="ph ph-clock-counter-clockwise"></i></span>' +
        '<div class="dx-ptitles"><div class="dx-ptitle">Todo lo que se le ha hecho</div>' +
        '<div class="dx-psub">De lo más reciente a lo más antiguo, con lo que no se pudo hacer y por qué.</div></div></div>' +
        (r.tareas.length
          ? '<div class="tarea-lista">' + r.tareas.map(App._filaTarea).join('') + '</div>'
          : '<div class="text-sm" style="color:var(--muted)">Este lote todavía no tiene labores registradas.</div>') +
      '</div>';

      App.renderMain(html + '</div>');
    });
  },

  // ── PLANEACIÓN ───────────────────────────────────────────────────────
  // Histórico mensual del hato + proyección compra-venta mes a mes.
  // Toda la matemática vive en planeacion.gs; aquí solo se pinta.
  vistaPlaneacion: function() {
    App.mostrarLoading('Calculando planeación…');
    App.api('getPlaneacion', [App.estado.filtros], function(r) {
      App.ocultarLoading();
      if (!r || !r.ok) {
        App.renderMain('<div class="alerta-card alerta-danger">No se pudo calcular la planeación: ' + App._esc((r && r.error) || 'error desconocido') + '</div>');
        return;
      }
      var d   = r.data;
      var res = d.resumen;
      var est = d.estadisticasVenta;

      var isLight = document.documentElement.getAttribute('data-theme') === 'light';
      var SURF    = App._tok('--chart-surface', isLight ? '#fdfcf8' : '#211d18');
      var GRIDC   = App._tok('--chart-grid', 'rgba(150,140,120,0.22)');
      var ACCENT  = isLight ? '#2f7f4e' : '#5cc46f';
      var MESN    = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
      function _mesCorto(key) {
        var mm = parseInt(String(key).substring(5, 7), 10);
        return (MESN[mm - 1] || key) + ' ' + String(key).substring(2, 4);
      }

      function _kpi(kc, icon, val, lab, sub) {
        return '<div class="dx-kpi" style="--kc:var(--c-' + kc + ')">' +
          '<div class="dx-kpi-top"><span class="dx-kpi-lab">' + lab + '</span><span class="dx-kpi-ico"><i class="ph ph-' + icon + '"></i></span></div>' +
          '<div class="dx-kpi-val">' + val + '</div>' +
          '<div class="dx-kpi-sub">' + sub + '</div></div>';
      }
      function _fmtO(v, suf) { return (v === '' || v === null || v === undefined) ? '—' : v + (suf || ''); }

      var html = '<div class="dx-wrap">';

      // Encabezado
      // Filtrar por predio: la planeación de una finca no dice nada de la otra,
      // y el usuario planea finca por finca.
      var predios = (d.opciones && d.opciones.predios) || [];
      var predioAct = d.filtroPredio || '';
      var selPredio = '<select class="filter-select" onchange="App._planPredio(this.value)">' +
        '<option value=""' + (predioAct ? '' : ' selected') + '>Todos los predios</option>' +
        predios.map(function(pr) {
          return '<option value="' + App._esc(pr) + '"' + (pr === predioAct ? ' selected' : '') + '>' + App._esc(pr) + '</option>';
        }).join('') + '</select>';

      html += '<div class="dx-head"><div><h2 class="dx-title">Planeación del hato</h2>' +
        '<div class="dx-sub"><b>' + res.activosProyectados + ' animales proyectados</b>' +
        (res.fueraDelPlan ? ' · <b>' + res.fueraDelPlan + ' fuera del plan</b> (' +
          [res.fueraVacas ? res.fueraVacas + ' vaca' + (res.fueraVacas !== 1 ? 's' : '') : '',
           res.fueraPrenadas ? res.fueraPrenadas + ' preñada' + (res.fueraPrenadas !== 1 ? 's' : '') : '']
            .filter(Boolean).join(' y ') + ')' : '') +
        ' · horizonte ' + res.horizonte +
        ' meses · engorda de reposición ' + res.mesesEngorda + ' meses</div></div>' +
        '<div class="dx-toolbar">' + selPredio +
          (predioAct ? '<button onclick="App._planPredio(\'\')" class="btn-secondary text-xs px-3 py-1.5">Ver todos</button>' : '') +
        '</div></div>';

      // Parámetros editables + sugerencia estadística
      html += '<div class="dx-panel" style="margin-bottom:18px">' +
        '<div class="dx-phead"><span class="dx-secico" style="--sc:var(--c-violet)"><i class="ph ph-sliders-horizontal"></i></span>' +
          '<div class="dx-ptitles"><div class="dx-ptitle">Parámetros del plan</div>' +
          '<div class="dx-psub">Se guardan en el sistema y aplican a toda la planeación.</div></div></div>' +
        '<div style="display:flex;flex-wrap:wrap;gap:14px;align-items:end;padding:4px 2px 6px">' +
          '<label style="font-size:12.5px;color:var(--ink-2)">Peso objetivo de venta (kg)' +
            '<input type="number" id="plan-objetivo" value="' + d.configs.objetivo + '" min="100" max="900" step="5" class="form-input" style="width:110px;display:block;margin-top:4px"></label>' +
          '<label style="font-size:12.5px;color:var(--ink-2)">Meses de engorda de lo comprado' +
            '<input type="number" id="plan-engorda" value="' + d.configs.engorda + '" min="3" max="30" step="1" class="form-input" style="width:90px;display:block;margin-top:4px"></label>' +
          '<label style="font-size:12.5px;color:var(--ink-2)">Horizonte del plan (meses)' +
            '<input type="number" id="plan-horizonte" value="' + d.configs.horizonte + '" min="3" max="24" step="1" class="form-input" style="width:90px;display:block;margin-top:4px"></label>' +
          '<label style="font-size:12.5px;color:var(--ink-2)">Precio de venta (COP/kg)' +
            App._numInput('plan-pventa', { entero:true, value: d.configs.precioVenta, placeholder:'Sin definir', style:'width:130px;display:block;margin-top:4px' }) + '</label>' +
          '<label style="font-size:12.5px;color:var(--ink-2)">Precio de compra (COP/kg)' +
            App._numInput('plan-pcompra', { entero:true, value: d.configs.precioCompra, placeholder:'Histórico', style:'width:130px;display:block;margin-top:4px' }) + '</label>' +
          '<button onclick="App._guardarParamsPlaneacion()" class="btn-primary text-sm px-4 py-2"><i class="ph ph-floppy-disk"></i> Guardar y recalcular</button>' +
          (est.sugerenciaObjetivo !== ''
            ? '<span style="font-size:12.5px;color:var(--muted)">Histórico de ventas: prom ' + est.promedio + ' kg · mediana ' + est.mediana +
              ' kg · <a href="#" onclick="return App._usarSugerencia(' + est.sugerenciaObjetivo + ')" style="color:var(--accent);text-decoration:underline">usar sugerencia estadística (' + est.sugerenciaObjetivo + ' kg)</a></span>'
            : '') +
        '</div>' +
      '</div>';

      // KPIs del plan
      var origenTxt = res.gdpOrigen === 'hato' ? 'promedio real del hato' : (res.gdpOrigen === 'meta' ? 'meta mínima (sin mediciones válidas)' : '');
      // Subtexto que dice de dónde salió cada precio. Un número de plata sin
      // origen invita a creerle más de lo que vale.
      function _origenPrecio(origen, valor) {
        if (origen === 'parametro') return 'A ' + App.fmtCOP(valor) + '/kg, precio que definiste';
        if (origen === 'historico') return 'A ' + App.fmtCOP(valor) + '/kg del histórico de compras';
        return 'Define un precio arriba para verlo';
      }
      var saldo = res.hatoFinal - res.hatoInicial;
      html += '<div class="dx-kpis k6">' +
        _kpi('amber', 'trend-up', App.fmt(res.gdpPlanUsado, 3) + ' <small>kg/día</small>', 'GDP del plan', 'Ritmo usado para proyectar (' + origenTxt + ')') +
        _kpi('green', 'hand-coins', res.totalVentas, 'Ventas planeadas', 'En los próximos ' + res.horizonte + ' meses') +
        _kpi('cyan', 'cart-plus', res.totalCompras, 'Compras de reposición', '1 por cada venta, mismo mes') +
        _kpi('blue', 'cow', res.hatoFinal + ' <small>cabezas</small>', 'Saldo del hato',
             res.totalVentas + ' salen · ' + res.totalCompras + ' entran · ' +
             (saldo === 0 ? 'el hato se mantiene en ' + res.hatoInicial
                          : res.hatoInicial + ' hoy → ' + res.hatoFinal + ' al cierre (' + (saldo > 0 ? '+' : '−') + Math.abs(saldo) + ')')) +
        _kpi('violet', 'coins', (res.ingresoTotal !== '' && res.ingresoTotal > 0 ? App.fmtCOP(res.ingresoTotal) : '—'),
             'Ingreso estimado', _origenPrecio(res.origenPrecioVenta, res.precioVentaUsado)) +
        _kpi('rose', 'bank', (res.inversionTotal !== '' && res.inversionTotal > 0 ? App.fmtCOP(res.inversionTotal) : '—'),
             'Inversión estimada', _origenPrecio(res.origenPrecioCompra, res.precioCompraUsado)) +
      '</div>';


      // Gráficas: histórico mensual + proyección
      html += '<div class="dx-grid2" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:16px;margin-bottom:18px">' +
        '<div class="dx-panel"><div class="dx-phead"><span class="dx-secico" style="--sc:var(--c-cyan)"><i class="ph ph-chart-line-up"></i></span>' +
          '<div class="dx-ptitles"><div class="dx-ptitle">Comportamiento histórico del GDP</div>' +
          '<div class="dx-psub">Promedio mensual del hato · subidas vs bajadas entre mediciones.</div></div></div>' +
          '<div class="dx-chart-sm" style="height:240px"><canvas id="chart-plan-hist"></canvas></div></div>' +
        '<div class="dx-panel"><div class="dx-phead"><span class="dx-secico" style="--sc:var(--c-green)"><i class="ph ph-calendar-plus"></i></span>' +
          '<div class="dx-ptitles"><div class="dx-ptitle">Plan de ventas y compras</div>' +
          '<div class="dx-psub">Animales que alcanzan el objetivo de ' + res.objetivoUsado + ' kg cada mes.</div></div></div>' +
          '<div class="dx-chart-sm" style="height:240px"><canvas id="chart-plan-proy"></canvas></div></div>' +
      '</div>';

      // Tabla proyección mensual con detalle expandible
      html += '<div class="dx-panel" style="margin-bottom:18px">' +
        '<div class="dx-phead"><span class="dx-secico" style="--sc:var(--c-blue)"><i class="ph ph-table"></i></span>' +
          '<div class="dx-ptitles"><div class="dx-ptitle">Proyección mes a mes</div>' +
          '<div class="dx-psub">Abre un mes para ver qué animales cruzan el peso objetivo.</div></div></div>' +
        '<div style="overflow-x:auto"><table class="tabla-ganadero"><thead><tr>' +
          '<th>Mes</th><th>Ventas esperadas</th><th>Kg estimados</th><th>Ingreso estimado</th>' +
          '<th>Compras sugeridas</th><th>Peso de compra</th><th>Inversión estimada</th>' +
          '<th>Hato al cierre</th></tr></thead><tbody>';

      if (d.proyeccionMensual.length === 0) {
        html += '<tr><td colspan="8" class="text-center text-gray-400 py-6">Sin datos para proyectar.</td></tr>';
      } else {
        d.proyeccionMensual.forEach(function(p) {
          var detHtml = '';
          if (p.detalle.length) {
            detHtml = '<details style="margin-top:8px"><summary style="cursor:pointer;font-size:12px;color:var(--accent)">Ver ' +
              p.detalle.length + ' animal' + (p.detalle.length !== 1 ? 'es' : '') + '</summary>' +
              '<table class="tabla-ganadero" style="margin-top:6px"><thead><tr>' +
              '<th>Código</th><th>Tipo</th><th>Finca</th><th>Propietario</th>' +
              '<th>Peso hoy</th><th>Peso proyectado</th><th>GDP usado</th></tr></thead><tbody>' +
              p.detalle.map(function(x) {
                // El enlace lleva href real (se puede abrir en otra pestaña) y además
                // registra el origen para que la ficha ofrezca el camino de vuelta.
                return '<tr><td><a href="#/animal/' + encodeURIComponent(x.codigo) + '" class="font-semibold text-green-700" ' +
                    'onclick="return App.irAnimalDesde(\'' + String(x.codigo).replace(/'/g, "\\'") + '\',\'#/planeacion\',\'Planeación\')">' + App._esc(x.codigo) + '</a></td>' +
                  '<td>' + App._esc(x.tipo || '—') + '</td>' +
                  '<td>' + App._esc(x.predio || '—') + '</td>' +
                  '<td>' + App._esc(x.propietario || '—') + '</td>' +
                  '<td>' + x.pesoHoy + ' kg</td><td><b>' + x.pesoProyectado + ' kg</b></td>' +
                  '<td>' + App.fmt(x.gdpUsado, 3) + ' <small style="color:var(--muted)">(' + x.gdpOrigen + ')</small></td></tr>';
              }).join('') + '</tbody></table></details>';
          }
          html += '<tr' + (p.ventas === 0 ? ' style="opacity:.55"' : '') + '>' +
            '<td><b>' + _mesCorto(p.mes) + '</b></td>' +
            '<td>' + (p.ventas || 0) + detHtml + '</td>' +
            '<td>' + (p.kgEstimados ? App.fmt(p.kgEstimados, 0) + ' kg' : '—') + '</td>' +
            '<td>' + (p.ingresoEst !== '' ? '<b style="color:var(--ok)">' + App.fmtCOP(p.ingresoEst) + '</b>' : '—') + '</td>' +
            '<td>' + (p.compras || 0) + '</td>' +
            '<td><b>' + p.pesoCompraRec + ' kg</b></td>' +
            '<td>' + (p.inversionEst !== '' ? App.fmtCOP(p.inversionEst) : '—') + '</td>' +
            '<td>' + p.hatoFin + (p.saldoCabezas !== 0 ? ' <small style="color:var(--muted)">(' + (p.saldoCabezas > 0 ? '+' : '−') + Math.abs(p.saldoCabezas) + ')</small>' : '') + '</td></tr>';
        });
      }
      html += '</tbody></table></div>';

      if (res.notaCompra) {
        html += '<div class="alerta-card alerta-warning" style="margin:10px 2px 0;font-size:13px"><i class="ph ph-warning" aria-hidden="true"></i> ' + App._esc(res.notaCompra) + '</div>';
      }
      html += '</div>';

      // Metodología — fórmula explícita para que el número no sea caja negra
      html += '<div class="dx-panel">' +
        '<div class="dx-phead"><span class="dx-secico" style="--sc:var(--c-amber)"><i class="ph ph-math-operations"></i></span>' +
          '<div class="dx-ptitles"><div class="dx-ptitle">Cómo se calcula el peso de compra</div>' +
          '<div class="dx-psub">Con el ritmo actual del hato (' + App.fmt(res.gdpPlanUsado, 3) + ' kg/día):</div></div></div>' +
        '<div style="padding:6px 2px;font-size:14px;line-height:2">' +
          '<code style="background:var(--surface-2);border:1px solid var(--border);border-radius:8px;padding:6px 12px;display:inline-block">' +
            res.pesoCompraRecomendado + ' kg ≈ ' + res.objetivoUsado + ' kg (objetivo) − ' + App.fmt(res.gdpPlanUsado, 3) + ' kg/día × ' + (res.mesesEngorda * 30.44).toFixed(0) + ' días</code>' +
          '<div class="dx-psub" style="margin-top:8px">Un animal comprado hoy con ~' + res.pesoCompraRecomendado +
            ' kg llega al objetivo de ' + res.objetivoUsado + ' kg en ~' + res.mesesEngorda +
            ' meses, justo cuando toca reponer las ventas de ese mes.' +
            (res.pendientesHorizonte ? ' Además, ' + res.pendientesHorizonte + ' animal(es) activos no alcanzarían el objetivo dentro del horizonte actual.' : '') +
          '</div>' +
        '</div>' +
      '</div>';

      html += '</div>';
      App.renderMain(html);

      // ── Gráficas ──
      setTimeout(function() {
        // Histórico: barras subidas/bajadas + línea GDP mensual (eje derecho)
        var cH = document.getElementById('chart-plan-hist');
        if (cH && d.historicoMensual.length) {
          var hm = d.historicoMensual;
          App.estado.charts['plan-hist'] = new Chart(cH, {
            data: { labels: hm.map(function(x){ return _mesCorto(x.mes); }),
              datasets: [
                { type:'bar', label:'Subidas',   data: hm.map(function(x){ return x.subidas; }), backgroundColor:'#3fd08a', borderRadius:{ topLeft:4, topRight:4 }, borderSkipped:false, maxBarThickness:18, categoryPercentage:0.62, barPercentage:0.9 },
                { type:'bar', label:'Bajadas',   data: hm.map(function(x){ return x.bajadas; }), backgroundColor:'#f07a94', borderRadius:{ topLeft:4, topRight:4 }, borderSkipped:false, maxBarThickness:18, categoryPercentage:0.62, barPercentage:0.9 },
                { type:'line', label:'GDP promedio (kg/día)', data: hm.map(function(x){ return x.gdpPromedioMes === '' ? null : x.gdpPromedioMes; }),
                  borderColor:ACCENT, backgroundColor:'transparent', borderWidth:2, tension:0.35,
                  pointRadius:3.5, pointBackgroundColor:ACCENT, pointBorderColor:SURF, pointBorderWidth:2, yAxisID:'y1' }
              ] },
            options: { responsive:true, maintainAspectRatio:false,
              plugins: { legend: { position:'top', align:'end', labels:{ usePointStyle:true, pointStyle:'circle', padding:12, boxHeight:7 } },
                tooltip: { enabled:false, external:App._tipExterno, mode:'index', intersect:false, callbacks:{
                  title: function(items){ return 'Mes: ' + hm[items[0].dataIndex].mes; },
                  label: function(c){ return c.dataset.type === 'line'
                    ? 'GDP: ' + (c.parsed.y == null ? '—' : c.parsed.y.toFixed(3)) + ' kg/día'
                    : c.dataset.label + ': ' + c.parsed.y; },
                  footer: function(items){ var m = hm[items[0].dataIndex];
                    return [m.animalesMedidos + ' animal(es) medidos', 'Peso promedio: ' + (m.pesoPromedio === '' ? '—' : m.pesoPromedio + ' kg')]; } } } },
              scales: {
                y:  { beginAtZero:true, grid:{ color:GRIDC }, border:{ display:false }, ticks:{ padding:8, precision:0 }, title:{ display:true, text:'Mediciones', font:{ size:11 } } },
                y1: { position:'right', grid:{ display:false }, border:{ display:false }, ticks:{ padding:8, callback:function(v){ return Number(v).toFixed(1); } }, suggestedMin:0 },
                x:  { grid:{ display:false } }
              } }
          });
        }
        // Proyección: ventas esperadas vs compras sugeridas
        var cP = document.getElementById('chart-plan-proy');
        if (cP && d.proyeccionMensual.length) {
          var pm = d.proyeccionMensual;
          App.estado.charts['plan-proy'] = new Chart(cP, {
            type:'bar',
            data: { labels: pm.map(function(p){ return _mesCorto(p.mes); }),
              datasets: [
                { label:'Ventas esperadas',   data: pm.map(function(p){ return p.ventas;  }), backgroundColor: App._tok('--c-cyan','#31c7d6'), borderRadius:{ topLeft:4, topRight:4 }, borderSkipped:false, maxBarThickness:20, categoryPercentage:0.6, barPercentage:0.85 },
                { label:'Compras sugeridas',  data: pm.map(function(p){ return p.compras; }), backgroundColor: App._tok('--c-amber','#f0b44a'), borderRadius:{ topLeft:4, topRight:4 }, borderSkipped:false, maxBarThickness:20, categoryPercentage:0.6, barPercentage:0.85 }
              ] },
            options: { responsive:true, maintainAspectRatio:false,
              plugins: { legend: { position:'top', align:'end', labels:{ usePointStyle:true, pointStyle:'circle', padding:12, boxHeight:7 } },
                tooltip: { enabled:false, external:App._tipExterno, mode:'index', intersect:false, callbacks:{
                  label: function(c){ return c.dataset.label + ': ' + c.parsed.y + ' animal(es)'; },
                  footer: function(items){ var p = pm[items[0].dataIndex];
                    return p.kgEstimados ? ['~' + App.fmt(p.kgEstimados, 0) + ' kg a vender',
                      'Inversión compras: ' + (p.inversionEst !== '' ? App.fmtCOP(p.inversionEst) : '—')] : []; } } } },
              scales: { y: { beginAtZero:true, grid:{ color:GRIDC }, border:{ display:false }, ticks:{ padding:8, precision:0 } }, x: { grid:{ display:false } } } }
          });
        }
      }, 60);
    });
  },

  // Guarda los parámetros del plan y recalcula la vista.
  _guardarParamsPlaneacion: function() {
    var o = parseFloat((document.getElementById('plan-objetivo')  || {}).value);
    var e = parseFloat((document.getElementById('plan-engorda')   || {}).value);
    var h = parseFloat((document.getElementById('plan-horizonte') || {}).value);
    if (isNaN(o) || o <= 0)  { App.toast('Peso objetivo inválido.', 'error'); return; }
    if (isNaN(e) || e <= 0)  { App.toast('Meses de engorda inválidos.', 'error'); return; }
    if (isNaN(h) || h <= 0)  { App.toast('Horizonte inválido.', 'error'); return; }
    // Los precios son opcionales: vacío significa "no tengo precio propio" y se
    // manda como 0, que en el backend borra el parámetro. No es un error.
    var pvV = App._leerPesos('plan-pventa'), pcV = App._leerPesos('plan-pcompra');
    var pv = isNaN(pvV) ? 0 : pvV;
    var pc = isNaN(pcV) ? 0 : pcV;
    if (isNaN(pv) || pv < 0) { App.toast('Precio de venta inválido.', 'error'); return; }
    if (isNaN(pc) || pc < 0) { App.toast('Precio de compra inválido.', 'error'); return; }
    App.api('guardarParamsPlaneacion', [o, e, h, pv, pc], function(r) {
      if (r && r.ok) { App.toast('Parámetros guardados ✓'); App.vistaPlaneacion(); }
      else App.toast((r && r.error) || 'No se pudieron guardar los parámetros.', 'error');
    });
  },

  // Cambia el predio del plan. Vive en App.estado.filtros, que es lo que
  // getPlaneacion ya recibía: el backend siempre supo filtrar, faltaba el control.
  _planPredio: function(predio) {
    App.estado.filtros = App.estado.filtros || {};
    if (predio) App.estado.filtros.predio = predio;
    else delete App.estado.filtros.predio;
    App.vistaPlaneacion();
  },

  // Aplica la sugerencia estadística al input del objetivo (no guarda hasta pulsar Guardar).
  _usarSugerencia: function(kg) {
    var inp = document.getElementById('plan-objetivo');
    if (inp) inp.value = kg;
    return false;
  },

  // ── SANIDAD ──────────────────────────────────────────────────────────
  vistaSanidad: function() {
    App.mostrarLoading('Cargando sanidad…');
    App.api('getHistorialSanitario', [], function(todos) {
      App.ocultarLoading();
      var hoy = new Date(); hoy.setHours(0,0,0,0);

      // Eventos agrupados por animal — para saber si un recordatorio ya fue cumplido.
      var porAnimal = {};
      todos.forEach(function(e){ (porAnimal[e.codigo] = porAnimal[e.codigo] || []).push(e); });

      // Separar en grupos
      var vencidas  = [], proximas = [], historial = [];
      todos.forEach(function(e) {
        if (!e.proxima_fecha || e.proxima_fecha === '') {
          historial.push(e);
        } else {
          var fp = new Date(e.proxima_fecha);
          if (fp < hoy) {
            // Un recordatorio vencido que ya fue atendido por un evento posterior
            // no debe seguir alarmando: pasa al historial como cumplido.
            if (App._recordatorioCumplido(e, porAnimal[e.codigo])) historial.push(e);
            else vencidas.push(e);
          } else {
            var diff = Math.round((fp - hoy) / 86400000);
            if (diff <= 30) proximas.push(e);
            else historial.push(e);
          }
        }
      });

      // Tipos únicos para el filtro del historial
      var seenT = {}, tipos = [];
      todos.forEach(function(e) { if (e.tipo && !seenT[e.tipo]) { seenT[e.tipo]=1; tipos.push(e.tipo); } });
      // Animales únicos
      var seenC = {}, codigos = [];
      todos.forEach(function(e) { if (e.codigo && !seenC[e.codigo]) { seenC[e.codigo]=1; codigos.push(e.codigo); } });
      tipos.sort(); codigos.sort();

      function filaAlerta(e, nivel) {
        var fp = e.proxima_fecha ? new Date(e.proxima_fecha) : null;
        var diffDias = fp ? Math.round((fp - hoy) / 86400000) : null;
        var etiqueta = diffDias !== null
          ? (diffDias < 0 ? 'Venció hace ' + Math.abs(diffDias) + ' d' : (diffDias === 0 ? 'Es hoy' : 'En ' + diffDias + ' d'))
          : '';
        return '<div class="alerta-card alerta-' + nivel + ' flex items-center gap-3">' +
          '<div class="flex-1 min-w-0">' +
            '<div class="flex items-center gap-2 flex-wrap">' +
              '<span class="chip-record ' + (nivel === 'danger' ? 'vencido' : 'vigente') + '"><i class="ph ph-bell" aria-hidden="true"></i> Recordatorio</span>' +
              '<span class="font-bold">' + e.codigo + '</span>' +
              '<span class="text-gray-700 text-sm"><span class="san-ico">' + App._sanIcono(e.tipo) + '</span>' + e.tipo + '</span>' +
              (e.medicamento ? '<span class="text-gray-500 text-xs">· ' + e.medicamento + '</span>' : '') +
            '</div>' +
            '<div class="text-xs text-gray-400 truncate mt-0.5">Seguimiento del evento realizado el ' + App.fmtFecha(e.fecha) + (e.observacion ? ' · ' + e.observacion : '') + '</div>' +
          '</div>' +
          '<div class="text-right shrink-0">' +
            '<div class="font-semibold text-sm">' + App.fmtFecha(e.proxima_fecha) + '</div>' +
            (etiqueta ? '<div class="text-xs ' + (diffDias < 0 ? 'text-red-500' : 'text-yellow-600') + '">' + etiqueta + '</div>' : '') +
          '</div>' +
          '<a href="#/animal/' + encodeURIComponent(e.codigo) + '" class="text-blue-600 text-xs font-medium shrink-0 hover:underline">Ver</a>' +
          '<button onclick="App._eliminarEventoSanitario(\'' + e.id_evento + '\')" ' +
            'class="text-gray-300 hover:text-red-500 text-lg leading-none shrink-0" title="Eliminar recordatorio"><i class="ph ph-trash" aria-hidden="true"></i></button>' +
        '</div>';
      }

      var html = '<div class="space-y-5">';

      // ── Cabecera ──
      html += '<div class="flex items-center justify-between">' +
        '<div class="flex items-center gap-3">' +
          '<h2 class="text-lg font-bold text-gray-800"><i class="ph ph-syringe" aria-hidden="true"></i> Sanidad</h2>' +
          (vencidas.length ? '<span class="badge badge-red">' + vencidas.length + ' vencida' + (vencidas.length>1?'s':'') + '</span>' : '') +
          (proximas.length ? '<span class="badge badge-yellow">' + proximas.length + ' próxima' + (proximas.length>1?'s':'') + '</span>' : '') +
        '</div>' +
        '<div class="flex gap-2">' +
          '<button onclick="App.abrirModalEventoLote()" class="btn-secondary text-sm px-4 py-2"><i class="ph ph-syringe" aria-hidden="true"></i> Por lote</button>' +
          '<button onclick="App.abrirModalSanidad()" class="btn-primary text-sm px-4 py-2">+ Agregar evento</button>' +
        '</div>' +
      '</div>';

      // ── Leyenda: cómo distinguir recordatorios de eventos realizados ──
      // Panel neutro con tokens del sistema (no colores Tailwind crudos) para que
      // el texto tenga buen contraste tanto en tema claro como oscuro.
      html += '<div class="rounded-xl px-4 py-3 text-xs flex flex-wrap items-center gap-x-5 gap-y-2" ' +
          'style="background:var(--surface-2);border:1px solid var(--border)">' +
        '<span class="font-semibold" style="color:var(--ink)">Cómo leer esta vista:</span>' +
        '<span style="color:var(--ink-2)"><span class="chip-record vigente"><i class="ph ph-bell" aria-hidden="true"></i> Recordatorio</span> seguimiento programado, aún no realizado</span>' +
        '<span style="color:var(--ink-2)"><span class="chip-record vencido"><i class="ph ph-clock" aria-hidden="true"></i> Vencido</span> pasó su fecha y sigue pendiente</span>' +
        '<span style="color:var(--ink-2)"><span class="chip-record cumplido"><i class="ph ph-check" aria-hidden="true"></i> Cumplido</span> atendido por un evento posterior</span>' +
        '<span style="color:var(--muted)">Cada fila del historial es un <b style="color:var(--ink-2)">evento realizado</b>.</span>' +
      '</div>';

      // ── Sección vencidas ──
      if (vencidas.length > 0) {
        html += '<div class="bg-white rounded-xl border border-red-200 overflow-hidden">' +
          '<div class="px-5 py-3 bg-red-50 border-b border-red-200 flex items-center gap-2">' +
            '<span class="text-red-600 font-bold text-sm"><i class="ph ph-siren" aria-hidden="true"></i> Recordatorios vencidos (' + vencidas.length + ')</span>' +
            '<span class="text-xs text-red-400">— seguimientos pendientes cuya fecha ya pasó</span>' +
          '</div>' +
          '<div class="p-4 space-y-1">';
        vencidas.forEach(function(e) { html += filaAlerta(e, 'danger'); });
        html += '</div></div>';
      }

      // ── Sección próximas ──
      html += '<div class="bg-white rounded-xl border border-gray-200 overflow-hidden">' +
        '<div class="px-5 py-3 border-b border-gray-100 flex items-center gap-2">' +
          '<span class="font-semibold text-gray-700 text-sm"><i class="ph ph-bell" aria-hidden="true"></i> Recordatorios próximos — siguientes 30 días (' + proximas.length + ')</span>' +
        '</div>' +
        '<div class="p-4 space-y-1">';
      if (proximas.length === 0) {
        html += '<p class="text-sm text-gray-400 py-2">Sin eventos programados en los próximos 30 días ✓</p>';
      } else {
        proximas.forEach(function(e) { html += filaAlerta(e, 'warning'); });
      }
      html += '</div></div>';

      // ── Historial / cumplidas ──
      html += '<div class="bg-white rounded-xl border border-gray-200 overflow-hidden">' +
        '<div class="px-5 py-3 border-b border-gray-100">' +
          '<div class="flex flex-wrap items-center justify-between gap-3">' +
            '<span class="font-semibold text-gray-700 text-sm"><i class="ph ph-clipboard-text" aria-hidden="true"></i> Historial completo (' + todos.length + ' eventos)</span>' +
            '<div class="flex flex-wrap gap-2">' +
              '<input type="text" id="san-q" placeholder="Buscar animal…" oninput="App._filtrarHistorialSan()" class="form-input text-sm py-1.5 w-36">' +
              '<select id="san-tipo" onchange="App._filtrarHistorialSan()" class="form-input text-sm py-1.5 w-auto">' +
                '<option value="">Todos los tipos</option>' +
                tipos.map(function(t){ return '<option>' + t + '</option>'; }).join('') +
              '</select>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="overflow-x-auto">' +
          '<table class="tabla-ganadero" id="tabla-historial-san">' +
            '<thead><tr>' +
              '<th>Fecha</th><th>Animal</th><th>Evento realizado</th><th>Est. reproductivo</th>' +
              '<th>Medicamento</th><th>Recordatorio</th><th>Responsable</th><th>Observación</th><th></th>' +
            '</tr></thead>' +
            '<tbody id="tbody-san">';

      if (todos.length === 0) {
        html += '<tr><td colspan="9" class="text-center text-gray-400 py-6">Sin eventos registrados</td></tr>';
      } else {
        // Un solo renglón por animal + fecha: agrupa todos los procedimientos
        // registrados el mismo día (siguen guardados como registros separados).
        var grupos = {}, ordenG = [];
        todos.forEach(function(e) {
          var gk = (e.codigo || '') + '||' + (e.fecha || '');
          if (!grupos[gk]) { grupos[gk] = []; ordenG.push(gk); }
          grupos[gk].push(e);
        });
        ordenG.forEach(function(gk) {
          var evs = grupos[gk], e0 = evs[0];

          // Tipos con su icono; un tipo repetido ese día muestra "×N".
          var conteo = {}, ordenT = [];
          evs.forEach(function(e) {
            if (conteo[e.tipo] == null) { conteo[e.tipo] = 0; ordenT.push(e.tipo); }
            conteo[e.tipo]++;
          });
          var chips = ordenT.map(function(t) {
            return '<span class="san-chip"><span class="san-ico">' + App._sanIcono(t) + '</span>' + t +
                   (conteo[t] > 1 ? ' <span class="cnt">×' + conteo[t] + '</span>' : '') + '</span>';
          }).join('');

          // Est. reproductivo: badges de las palpaciones del grupo (sin duplicar).
          var repVistos = {}, repHtml = [];
          evs.forEach(function(e) {
            if (e.tipo !== 'PALPACIÓN VETERINARIA') return;
            var rk = (e.estado_reproductivo || '') + '|' + (e.desarrollo_ovarico || '');
            if (repVistos[rk]) return;
            var b = App._badgeReproductivo(e.estado_reproductivo) +
                    (e.desarrollo_ovarico ? '<div class="mt-0.5">' + App._badgeDesOvar(e.desarrollo_ovarico) + '</div>' : '');
            if (!b.trim()) return;
            repVistos[rk] = 1; repHtml.push(b);
          });
          var repCell = repHtml.length ? repHtml.join('') : '<span class="text-gray-300">—</span>';

          // Medicamento (+dosis), responsable y observación combinados sin repetir.
          var medCell = App._uniqJoin(evs.map(function(e) {
            return (e.medicamento || '') + (e.dosis ? ' · ' + e.dosis : '');
          }), '<br>') || '—';
          var respCell = App._uniqJoin(evs.map(function(e) { return e.responsable; })) || '—';
          var obsCell  = App._uniqJoin(evs.map(function(e) { return e.observacion; }), '<br>') || '—';

          // Recordatorios de los procedimientos que dejaron seguimiento.
          var recVistos = {}, recs = [];
          evs.forEach(function(e) {
            if (!e.proxima_fecha) return;
            var rk = e.tipo + '|' + e.proxima_fecha;
            if (recVistos[rk]) return;
            recVistos[rk] = 1;
            recs.push(App._chipRecordatorio(e, porAnimal[e.codigo], hoy));
          });
          var recCell = recs.length ? '<div class="san-recs">' + recs.join('') + '</div>' : '—';

          var ids = evs.map(function(e) { return e.id_evento; });
          html += '<tr data-codigo="' + (e0.codigo || '') + '" data-tipos="' + ordenT.join('|').toLowerCase().replace(/"/g, '') + '">' +
            '<td>' + App.fmtFecha(e0.fecha) + '</td>' +
            '<td><a href="#/animal/' + encodeURIComponent(e0.codigo) + '" class="font-semibold text-green-700 hover:underline">' + e0.codigo + '</a></td>' +
            '<td><div class="san-chips">' + chips + '</div></td>' +
            '<td>' + repCell + '</td>' +
            '<td>' + medCell + '</td>' +
            '<td>' + recCell + '</td>' +
            '<td>' + respCell + '</td>' +
            '<td class="text-gray-500 text-xs max-w-xs">' + obsCell + '</td>' +
            '<td><button onclick="App._eliminarGrupoSanitario(\'' + ids.join(',') + '\', ' + ids.length + ')" ' +
              'class="text-gray-300 hover:text-red-500 text-lg" title="Eliminar ' + ids.length + ' evento(s) de este día"><i class="ph ph-trash" aria-hidden="true"></i></button></td>' +
          '</tr>';
        });
      }

      html += '</tbody></table></div></div></div>';
      App.renderMain(html);
    });
  },

  _filtrarHistorialSan: function() {
    var q    = ((document.getElementById('san-q')    || {}).value || '').toLowerCase().trim();
    var tipo = ((document.getElementById('san-tipo') || {}).value || '').toLowerCase();
    document.querySelectorAll('#tbody-san tr').forEach(function(tr) {
      // Cada fila agrupa varios tipos (data-tipos); coincide si contiene el tipo elegido.
      var tipos = (tr.dataset.tipos || '').split('|');
      var ok = (!q    || (tr.dataset.codigo || '').toLowerCase().includes(q)) &&
               (!tipo || tipos.indexOf(tipo) !== -1);
      tr.style.display = ok ? '' : 'none';
    });
  },

  _eliminarEventoSanitario: function(idEvento) {
    if (!confirm('¿Eliminar este evento sanitario?\nEsta acción no se puede deshacer.')) return;
    App.api('deleteEventoSanitario', [idEvento], function(r) {
      if (!r.ok) { App.toast('Error al eliminar', 'error'); return; }
      App.toast('Evento eliminado ✓', 'success');
      App.vistaSanidad();
    });
  },

  // Borra todos los procedimientos agrupados en un renglón (mismo animal y día).
  _eliminarGrupoSanitario: function(idsCsv, n) {
    var ids = String(idsCsv).split(',').filter(Boolean);
    if (!ids.length) return;
    var msg = ids.length > 1
      ? '¿Eliminar los ' + ids.length + ' procedimientos registrados este día?\nEsta acción no se puede deshacer.'
      : '¿Eliminar este evento sanitario?\nEsta acción no se puede deshacer.';
    if (!confirm(msg)) return;
    App.api('deleteEventosSanitarios', [ids], function(r) {
      if (!r || !r.ok) { App.toast('Error al eliminar', 'error'); return; }
      App.toast((r.total || ids.length) + ' evento(s) eliminado(s) ✓', 'success');
      App.vistaSanidad();
    });
  },

  // ── MODALES ───────────────────────────────────────────────────────────
  abrirModalAnimal: function(codigo) {
    App.estado._fotoNueva = null;
    App.api('getOpcionesAnimal', [], function(opts) {
      var animal = codigo ? (App.estado.animalesLista.find(function(a){ return a.codigo === codigo; }) || null) : null;
      if (codigo && !animal && App.estado.animalActual) animal = App.estado.animalActual.animal;
      var esNuevo = !codigo;
      var hoy = App._hoyISO();

      // ── helper campo ────────────────────────────────────────────────
      function campo(id, label, tipo, val, hint, extra) {
        var h = '<div class="form-group"><label class="form-label">' + label + '</label>';
        if (tipo === 'text' || tipo === 'number' || tipo === 'date') {
          h += '<input type="' + tipo + '" id="f_' + id + '" value="' + (val||'') + '" ' + (extra||'class="form-input"') + '>';
        } else if (tipo === 'select') {
          h += '<select id="f_' + id + '" class="form-input">' + extra + '</select>';
        } else if (tipo === 'combo') {
          h += '<input list="dl_' + id + '" id="f_' + id + '" value="' + (val||'') + '" class="form-input" ' + (extra||'') + '>' +
            '<datalist id="dl_' + id + '">';
        }
        if (tipo === 'combo') h += '</datalist>';
        if (hint) h += '<p class="form-hint">' + hint + '</p>';
        h += '</div>';
        return h;
      }

      // opciones select
      function selectOpts(lista, cur, empty) {
        return (empty ? '<option value="">' + empty + '</option>' : '') +
          lista.map(function(o){ return '<option' + (cur === o ? ' selected' : '') + '>' + o + '</option>'; }).join('');
      }
      function datalistOpts(lista) {
        return lista.map(function(o){ return '<option value="' + o + '">'; }).join('');
      }

      var form = '<div>';

      // ── Header sticky ────────────────────────────────────────────────
      form += '<div class="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between z-10">' +
        '<div><h2 class="text-lg font-bold text-gray-900">' + (esNuevo ? '<i class="ph ph-cow" aria-hidden="true"></i> Registrar nuevo animal' : '<i class="ph ph-pencil-simple" aria-hidden="true"></i> Editar animal ' + codigo) + '</h2>' +
        (esNuevo ? '<p class="text-xs text-gray-400 mt-0.5">Completa los datos del animal para registrarlo en el sistema</p>' : '') +
        '</div>' +
        '<button onclick="App.cerrarModal()" class="text-gray-400 hover:text-gray-700 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-xl font-bold">×</button>' +
      '</div>';

      form += '<div class="px-6 py-5 space-y-7">';

      // ── PASO 0: Tipo de ingreso (Compra / Nacimiento) ───────────────
      var ingreso = animal ? String(animal.tipo_ingreso || 'COMPRA').toUpperCase() : 'COMPRA';
      form += '<input type="hidden" id="f_tipo_ingreso" value="' + ingreso + '">';
      if (esNuevo) {
        form += '<div><div class="form-step-header">' +
          '<div class="form-step-num">0</div>' +
          '<div><div class="form-step-title">¿Cómo ingresa el animal?</div>' +
          '<div class="text-xs text-gray-400">Elegí el origen — los datos requeridos cambian según el caso</div></div>' +
        '</div><div class="grid grid-cols-2 gap-3">' +
          '<button type="button" id="ti_compra" onclick="App._setTipoIngreso(\'COMPRA\')" class="ingreso-card">' +
            '<i class="ph ph-shopping-cart-simple"></i><span class="t">Compra</span><span class="s">Animal adquirido</span></button>' +
          '<button type="button" id="ti_nac" onclick="App._setTipoIngreso(\'NACIMIENTO\')" class="ingreso-card">' +
            '<i class="ph ph-baby"></i><span class="t">Nacimiento</span><span class="s">Nació en la finca</span></button>' +
        '</div></div>';
      } else {
        var _esNacAhora = ingreso === 'NACIMIENTO';
        form += '<div class="flex items-center justify-between flex-wrap gap-3">' +
          '<span class="badge ' + (_esNacAhora ? 'badge-blue' : 'badge-green') + '" id="badge_ingreso">' +
            'Ingreso: ' + (_esNacAhora ? '<i class="ph ph-baby-carriage" aria-hidden="true"></i> Nacimiento' : '<i class="ph ph-shopping-cart" aria-hidden="true"></i> Compra') + '</span>' +
          '<label class="flex items-center gap-2 text-sm text-gray-600 cursor-pointer" ' +
            'title="Para reses que en realidad nacieron en la finca y se habían registrado como compra.">' +
            '<input type="checkbox" id="chk_es_nacimiento" class="w-4 h-4 accent-green-700" ' +
              (_esNacAhora ? 'checked' : '') + ' onchange="App._toggleEsNacimientoEdicion(this)">' +
            'Nació en la finca (asignar madre)' +
          '</label>' +
        '</div>';
      }

      // ── SECCIÓN 1: Identificación ───────────────────────────────────
      form += '<div><div class="form-step-header">' +
        '<div class="form-step-num">1</div>' +
        '<div><div class="form-step-title">Identificación del animal</div>' +
        '<div class="text-xs text-gray-400">Datos básicos para identificar el animal</div></div>' +
      '</div><div class="grid grid-cols-2 gap-x-5">';

      form += campo('codigo', 'Código *', 'text', animal ? animal.codigo : '',
        'Identificador único: número, letras o combinación (ej: 42, R3, Y1).',
        animal ? 'readonly class="form-input bg-gray-50 text-gray-500 cursor-not-allowed"' : 'class="form-input" placeholder="Ej: 42, R3, Y1"');

      form += '<div class="' + (esNuevo ? 'ing-only ing-compra' : '') + '"><div class="form-group"><label class="form-label">Tipo de animal' + (esNuevo ? ' *' : '') + '</label>' +
        '<select id="f_tipo" class="form-input">' + selectOpts(opts.tipos, animal ? animal.tipo : '', '— Seleccionar tipo —') + '</select>' +
        '<p class="form-hint">' + (esNuevo ? 'Categoría según la etapa productiva del animal.' : 'Podés corregir la categoría manualmente.') + '</p></div></div>';

      form += '<div class="ing-only ing-nacimiento"><div class="form-group"><label class="form-label">Sexo de la cría *</label>' +
        '<select id="f_sexo" class="form-input">' + selectOpts(opts.sexos || ['HEMBRA','MACHO'], animal ? animal.sexo : '', '— Seleccionar —') + '</select>' +
        '<p class="form-hint">Hembra → ternera de levante · Macho → ternero de levante.</p></div></div>';

      var predioActual = animal ? (animal.predio || '') : '';
      form += '<div class="form-group"><label class="form-label">Finca / Predio *</label>' +
        '<input type="hidden" id="f_predio" value="' + predioActual + '">' +
        '<select id="f_predio_sel" class="form-input" onchange="App._onCambioPredi(this)">' +
          selectOpts(opts.predios, predioActual, '— Seleccionar finca —') +
          '<option value="__nueva__">Escribir nueva finca…</option>' +
        '</select>' +
        '<input type="text" id="f_predio_nueva" class="form-input mt-2" placeholder="Nombre de la nueva finca…" style="display:none" oninput="document.getElementById(\'f_predio\').value=this.value">' +
        '<p class="form-hint">Cambia la finca cuando el animal sea trasladado a otro predio.</p></div>';

      var propietarioActual = animal ? (animal.propietario || '') : '';
      var propietariosDisponibles = (opts.propietarios || []).slice();
      if (propietarioActual && propietariosDisponibles.indexOf(propietarioActual) < 0) {
        propietariosDisponibles.push(propietarioActual);
      }
      form += '<div class="form-group"><label class="form-label">Propietario</label>' +
        '<input type="hidden" id="f_propietario" value="' + App._esc(propietarioActual) + '">' +
        '<select id="f_propietario_sel" class="form-input" onchange="App._onCambioPropietario(this)">' +
          selectOpts(propietariosDisponibles, propietarioActual, '— Seleccionar propietario —') +
          '<option value="__nuevo__">Escribir nuevo propietario…</option>' +
        '</select>' +
        '<input type="text" id="f_propietario_nuevo" class="form-input mt-2" placeholder="Nombre de la persona o empresa…" maxlength="200" style="display:none" oninput="document.getElementById(\'f_propietario\').value=this.value">' +
        '<p class="form-hint">Puedes elegir uno existente o registrar uno nuevo.</p></div>';

      form += '<div class="form-group"><label class="form-label" id="lbl_fecha">Fecha de ingreso *</label>' +
        '<input type="date" id="f_fecha_ingreso" value="' + (animal ? animal.fecha_ingreso : hoy) + '" class="form-input">' +
        '<p class="form-hint" id="hint_fecha">Día en que el animal llegó a la finca.</p></div>';

      // Madre (solo nacimiento) — buscador desplegable de hembras candidatas
      var _madres = opts.madres || [];
      App.estado._madresCandidatas = _madres;
      form += '<div class="ing-only ing-nacimiento"><div class="form-group"><label class="form-label">Madre *</label>' +
        '<div class="madre-combo">' +
          '<input type="text" id="f_madre_codigo" value="' + (animal ? (animal.madre_codigo || '') : '') + '" class="form-input" ' +
            'placeholder="Tocá para ver las madres o escribí el código…" autocomplete="off" ' +
            'oninput="App._filtrarMadres()" onfocus="App._filtrarMadres()" onblur="App._cerrarMadreSug()">' +
          '<div id="madre-sugerencias" class="madre-sugerencias hidden"></div>' +
        '</div>' +
        '<p class="form-hint" id="madre-hint">Solo vacas y novillas de vientre activas (' + _madres.length + ' disponible' + (_madres.length !== 1 ? 's' : '') + '). La cría hereda su finca y propietario.</p></div></div>';

      form += '<div class="form-group"><label class="form-label">Descripción / Indicaciones</label>' +
        '<input type="text" id="f_indicaciones" value="' + (animal ? animal.indicaciones||'' : '') + '" class="form-input" placeholder="Color, marca, seña particular…">' +
        '<p class="form-hint">Ayuda a identificarlo visualmente. Ej: "negra con mancha blanca".</p></div>';

      // Foto del animal
      form += '<div class="form-group col-span-2"><label class="form-label">Foto del animal</label>' +
        '<div class="flex items-center gap-4">' +
          '<div id="foto-preview" class="w-24 h-24 rounded-xl border border-gray-200 bg-gray-50 overflow-hidden flex items-center justify-center text-gray-300 shrink-0">' +
            (animal && animal.foto_url
              ? '<img src="' + animal.foto_url + '" class="w-full h-full object-cover" onerror="this.style.display=\'none\'">'
              : '<i class="ph ph-image" style="font-size:30px"></i>') +
          '</div>' +
          '<div>' +
            '<input type="file" id="f_foto" accept="image/*" class="hidden" onchange="App._previewFoto(this)">' +
            '<button type="button" onclick="document.getElementById(\'f_foto\').click()" class="btn-secondary text-sm">' +
              '<i class="ph ph-upload-simple"></i> ' + (animal && animal.foto_url ? 'Cambiar foto' : 'Subir foto') +
            '</button>' +
            '<p class="form-hint">JPG o PNG · se optimiza automáticamente antes de subir. Podés tomar la foto con la cámara desde el celular.</p>' +
          '</div>' +
        '</div></div>';

      form += '</div></div>'; // grid + sección 1

      // ── SECCIÓN 2: Datos del ingreso (compra o nacimiento) ──────────
      form += '<div><div class="form-step-header">' +
        '<div class="form-step-num">2</div>' +
        '<div><div class="form-step-title" id="lbl_sec2">Datos de compra</div>' +
        '<div class="text-xs text-gray-400" id="hint_sec2">Información económica al momento de adquisición</div></div>' +
      '</div><div class="grid grid-cols-2 gap-x-5">';

      form += '<div class="form-group"><label class="form-label" id="lbl_peso">Peso inicial (kg) *</label>' +
        App._numInput('f_peso_inicial', { value: animal ? (animal.peso_inicial || '') : '',
          placeholder:'Ej: 180,5', oninput:'App._calcTotalNacimiento()' }) +
        '<p class="form-hint" id="hint_peso">Peso en kilogramos cuando llegó. Ej: 180.5</p></div>';

      form += '<div class="ing-only ing-compra"><div class="form-group"><label class="form-label">Precio de compra (COP)</label>' +
        App._numInput('f_precio_compra', { entero:true, value: animal ? (animal.precio_compra || '') : '', placeholder:'Ej: 1.800.000' }) +
        '<p class="form-hint">Valor total pagado en pesos colombianos.</p></div></div>';

      // Nacimiento: no hay precio de compra; se estima igual que una venta →
      // peso al nacer × precio por kilo del momento = precio total (precio_compra).
      var _pkgNac = '';
      if (animal && String(animal.tipo_ingreso || '').toUpperCase() === 'NACIMIENTO' &&
          parseFloat(animal.precio_compra) > 0 && parseFloat(animal.peso_inicial) > 0) {
        _pkgNac = Math.round(parseFloat(animal.precio_compra) / parseFloat(animal.peso_inicial));
      }
      form += '<div class="ing-only ing-nacimiento"><div class="form-group"><label class="form-label">Precio por kilo al nacer (COP/kg)</label>' +
        App._numInput('f_precio_kg_nac', { entero:true, value:_pkgNac, placeholder:'Ej: 8.000', oninput:'App._calcTotalNacimiento()' }) +
        '<p class="form-hint">El precio total se calcula solo: <b>peso al nacer × precio/kg</b>.</p>' +
        '<div id="nac-total-preview" class="text-sm font-semibold text-green-700 mt-1"></div></div></div>';

      form += '<div class="ing-only ing-compra"><div class="form-group"><label class="form-label">Proveedor / Origen</label>' +
        '<input type="text" id="f_proveedor" value="' + (animal ? (animal.proveedor || '') : '') + '" class="form-input" placeholder="Vendedor o feria (si aplica)">' +
        '<p class="form-hint">De quién o dónde se compró el animal.</p></div></div>';

      // ── Palpación veterinaria reproductiva ────────────────────────────
      var palEstReprVal = animal ? (animal.estado_reproductivo || '') : '';
      var palDesOvarVal = animal ? (animal.desarrollo_ovarico  || '') : '';
      var palMesesVal   = animal ? (animal.meses || '') : '';
      var tienePal = animal && (
        (palMesesVal !== '' && palMesesVal !== '0') ||
        palEstReprVal !== '' || palDesOvarVal !== ''
      );
      var _estDescs = {
        'Preñada':    'Animal en gestación confirmada. Habilita el campo de meses.',
        'No preñada': 'El animal no está gestando al momento del diagnóstico.',
        'Dudosa':     'Diagnóstico no concluyente. Se recomienda repetir la palpación.',
        'En celo':    'Muestra signos de celo, apto para servicio o inseminación artificial.'
      };
      var _estOpts = '<option value="">— Seleccionar —</option>' +
        ['Preñada','No preñada','Dudosa','En celo'].map(function(o) {
          return '<option value="' + o + '" title="' + _estDescs[o] + '"' + (palEstReprVal === o ? ' selected' : '') + '>' + o + '</option>';
        }).join('');
      var _ovarDescs = {
        'Infantil (anestro prepuberal)': 'No ha alcanzado madurez reproductiva; poca o ninguna actividad ovárica.',
        'Folículo presente':             'Folículos pequeños o medianos en desarrollo; el ovario está activo.',
        'Folículo dominante':            'Folículo grande, normalmente próximo al celo o a la ovulación.',
        'Cuerpo lúteo':                  'La vaca ya está ciclando y tiene capacidad reproductiva.',
        'Folículos + cuerpo lúteo':      'Actividad ovárica normal dentro del ciclo reproductivo.'
      };
      var _ovarOpts = '<option value="">— Seleccionar —</option>' +
        ['Infantil (anestro prepuberal)','Folículo presente','Folículo dominante','Cuerpo lúteo','Folículos + cuerpo lúteo'].map(function(o) {
          return '<option value="' + o + '" title="' + _ovarDescs[o] + '"' + (palDesOvarVal === o ? ' selected' : '') + '>' + o + '</option>';
        }).join('');
      form += '<div class="form-group col-span-2 ing-only ing-compra">' +
        '<div class="border border-blue-200 rounded-xl bg-blue-50/30 p-4">' +
          '<label class="flex items-center gap-3 cursor-pointer">' +
            '<input type="checkbox" id="chk_palpacion" class="w-4 h-4 accent-blue-700" ' + (tienePal ? 'checked' : '') + ' onchange="App._togglePalpacion()">' +
            '<div>' +
              '<span class="font-semibold text-gray-800 text-sm">Palpación veterinaria realizada</span>' +
              '<div class="text-xs text-gray-400">Diagnóstico reproductivo registrado por el veterinario</div>' +
            '</div>' +
          '</label>' +
          '<div id="sec_palpacion" class="' + (tienePal ? '' : 'hidden') + ' mt-4 space-y-4">' +
            '<div class="grid grid-cols-2 gap-4">' +
              '<div class="form-group mb-0">' +
                '<label class="form-label" style="display:flex;align-items:center;gap:6px">Estado reproductivo' +
                  '<span style="position:relative;display:inline-flex">' +
                    '<button type="button" style="cursor:help;color:var(--info);font-size:10px;font-weight:700;border:1px solid color-mix(in oklch,var(--info) 45%,transparent);border-radius:50%;width:15px;height:15px;display:inline-flex;align-items:center;justify-content:center;background:var(--info-soft);padding:0;line-height:1" ' +
                      'onmouseenter="document.getElementById(\'_tip_est\').style.display=\'block\'" ' +
                      'onmouseleave="document.getElementById(\'_tip_est\').style.display=\'none\'">?</button>' +
                    '<div id="_tip_est" style="display:none;position:absolute;bottom:calc(100% + 6px);left:-8px;width:260px;background:var(--surface);color:var(--ink-2);font-size:11px;border-radius:10px;padding:12px 14px;z-index:500;border:1px solid var(--border-2);box-shadow:var(--shadow-lg);line-height:1.65;pointer-events:none">' +
                      '<b style="color:var(--accent);display:block;margin-bottom:7px">Estados reproductivos</b>' +
                      '<div style="margin-bottom:4px"><b style="color:var(--ok)"><i class="ph ph-baby" aria-hidden="true"></i> Preñada</b> — En gestación confirmada. Se habilita el campo de meses.</div>' +
                      '<div style="margin-bottom:4px"><b style="color:var(--muted)">○ No preñada</b> — No está gestando en el momento del diagnóstico.</div>' +
                      '<div style="margin-bottom:4px"><b style="color:var(--warn)"><i class="ph ph-question" aria-hidden="true"></i> Dudosa</b> — Diagnóstico no concluyente; se recomienda repetir la palpación.</div>' +
                      '<div><b style="color:var(--c-amber)"><i class="ph ph-fire" aria-hidden="true"></i> En celo</b> — Apta para servicio o inseminación artificial.</div>' +
                    '</div>' +
                  '</span>' +
                '</label>' +
                '<select id="pal_est_repr" class="form-input" onchange="App._toggleMesesGestacion(\'pal_est_repr\',\'grp_pal_meses\')">' +
                  _estOpts +
                '</select></div>' +
              '<div id="grp_pal_meses" class="form-group mb-0' + (palEstReprVal === 'Preñada' ? '' : ' hidden') + '">' +
                '<label class="form-label">Meses de gestación</label>' +
                '<input type="number" id="f_meses" min="1" max="9" value="' + palMesesVal + '" class="form-input" placeholder="1 – 9">' +
                '<p class="form-hint">Meses de preñez según diagnóstico.</p>' +
              '</div>' +
            '</div>' +
            '<div class="form-group mb-0">' +
              '<label class="form-label" style="display:flex;align-items:center;gap:6px">Desarrollo ovárico / estado fisiológico' +
                '<span style="position:relative;display:inline-flex">' +
                  '<button type="button" style="cursor:help;color:var(--info);font-size:10px;font-weight:700;border:1px solid color-mix(in oklch,var(--info) 45%,transparent);border-radius:50%;width:15px;height:15px;display:inline-flex;align-items:center;justify-content:center;background:var(--info-soft);padding:0;line-height:1" ' +
                    'onmouseenter="document.getElementById(\'_tip_des\').style.display=\'block\'" ' +
                    'onmouseleave="document.getElementById(\'_tip_des\').style.display=\'none\'">?</button>' +
                  '<div id="_tip_des" style="display:none;position:absolute;bottom:calc(100% + 6px);left:-8px;width:290px;background:var(--surface);color:var(--ink-2);font-size:11px;border-radius:10px;padding:12px 14px;z-index:500;border:1px solid var(--border-2);box-shadow:var(--shadow-lg);line-height:1.65;pointer-events:none">' +
                    '<b style="color:var(--accent);display:block;margin-bottom:7px">Desarrollo ovárico</b>' +
                    '<div style="margin-bottom:4px"><b style="color:var(--c-violet)">Infantil</b> — Sin madurez reproductiva; ovarios con poca o ninguna actividad.</div>' +
                    '<div style="margin-bottom:4px"><b style="color:var(--c-blue)">Folículo presente</b> — Folículos en desarrollo; el ovario está activo.</div>' +
                    '<div style="margin-bottom:4px"><b style="color:var(--c-cyan)">Folículo dominante</b> — Folículo grande, próximo al celo o a la ovulación.</div>' +
                    '<div style="margin-bottom:4px"><b style="color:var(--c-blue)">Cuerpo lúteo</b> — Vaca ciclando con capacidad reproductiva.</div>' +
                    '<div><b style="color:var(--c-violet)">Folículos + CL</b> — Actividad ovárica normal del ciclo reproductivo.</div>' +
                  '</div>' +
                '</span>' +
              '</label>' +
              '<select id="pal_des_ovar" class="form-input">' + _ovarOpts + '</select>' +
            '</div>' +
            '<div class="form-group mb-0"><label class="form-label">Observación veterinaria</label>' +
              '<input type="text" id="pal_diagnostico" class="form-input" placeholder="Notas adicionales del veterinario"></div>' +
          '</div>' +
        '</div>' +
      '</div>';

      form += '<div class="form-group"><label class="form-label">Estado</label>' +
        '<select id="f_estado" class="form-input" onchange="App._toggleCausaMuerte()">' + selectOpts(opts.estados, animal ? animal.estado : 'ACTIVO', '') + '</select></div>';
      // La muerte NO se registra desde aquí: tiene su propio flujo con fecha, causa
      // normalizada y evidencia. Si se marca MUERTO en este select, se avisa y se
      // ofrece el camino correcto — así los datos de mortalidad nunca quedan a medias.
      form += '<div class="form-group col-span-2" id="grp_causa_muerte" style="display:' + (animal && animal.estado === 'MUERTO' ? 'block' : 'none') + '">' +
        '<div class="muerte-nota">' +
          '<i class="ph ph-info"></i>' +
          '<span>La muerte se registra aparte para guardar <b>fecha, causa y evidencia</b> — esos datos son los que alimentan el análisis de mortalidad.' +
          (codigo ? ' <button type="button" onclick="App.cerrarModal();App.abrirModalMuerte(\'' + String(codigo).replace(/'/g, "\\'") + '\')" class="muerte-link">Abrir registro de muerte →</button>' : '') +
          '</span></div></div>';

      form += '<div class="form-group col-span-2"><label class="form-label">Lote (opcional)</label>' +
        '<input list="dl_lote" id="f_lote" value="' + (animal ? animal.lote||'' : '') + '" class="form-input" placeholder="Agrupación operativa (por defecto igual al predio)">' +
        '<datalist id="dl_lote">' + datalistOpts(opts.lotes) + '</datalist></div>';

      form += '</div></div>'; // grid + sección 2

      // ── SECCIÓN 3: Procedimientos (solo nuevo animal) ───────────────
      if (esNuevo) {
        form += '<div class="border-2 border-dashed border-green-300 rounded-2xl p-5 bg-green-50/40">' +
          '<div class="form-step-header mb-1">' +
            '<div class="form-step-num" style="background:#16a34a">3</div>' +
            '<div><div class="form-step-title">Procedimientos del día de ingreso</div>' +
            '<div class="text-xs text-gray-400">Opcional — marca uno o varios si ese día se le realizaron procedimientos al animal</div></div>' +
          '</div>' +
          '<div class="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">' + App._sanCheckboxes('np-check', 'np') + '</div>' +
          App._procDetalles('np', 'f_fecha_ingreso') +
          '<div class="bg-white/80 rounded-xl p-4 border border-green-100">' +
            '<div class="form-group"><label class="form-label">Responsable de la jornada</label>' +
              '<input type="text" id="np_resp" class="form-input" placeholder="Nombre de quien lo hizo"></div>' +
            '<div class="form-group mb-0"><label class="form-label">Observación general del día de ingreso</label>' +
              '<textarea id="np_obs" rows="2" class="form-input" placeholder="Notas del día — cada procedimiento tiene además la suya arriba…"></textarea></div>' +
          '</div>' +
        '</div>'; // sección 3
      }

      form += '</div>'; // space-y-7

      // ── Footer sticky ────────────────────────────────────────────────
      form += '<div class="sticky bottom-0 bg-white border-t border-gray-100 px-6 py-4 flex items-center justify-between">' +
        (codigo
          ? '<button onclick="App.cerrarModal();App.abrirModalCambiarCodigo(\'' + String(codigo).replace(/'/g, "\\'") + '\')" class="text-sm text-orange-600 hover:text-orange-800 font-medium flex items-center gap-1"><span><i class="ph ph-warning" aria-hidden="true"></i></span> Cambiar código</button>'
          : '<span></span>') +
        '<div class="flex gap-3">' +
          '<button onclick="App.cerrarModal()" class="btn-secondary">Cancelar</button>' +
          '<button onclick="App._guardarAnimal(\'' + (codigo||'') + '\')" class="btn-primary px-7 py-2.5 text-sm">' +
            (esNuevo ? '+ Registrar animal' : '✓ Guardar cambios') +
          '</button>' +
        '</div></div>';

      form += '</div>'; // outer div
      App.abrirModal(form);
      App._setTipoIngreso(ingreso);   // aplica visibilidad inicial (compra/nacimiento)

      // Respaldo: si el backend (deploy viejo) no devolvió la lista de madres,
      // se derivan del listado de animales (hembra activa, tipo vaca/novilla).
      if (!(opts.madres && opts.madres.length)) {
        App.api('listAnimales', [{}], function(lista) {
          var cand = (lista || []).filter(function(x) {
            if (x.estado === 'VENDIDO' || x.estado === 'MUERTO') return false;
            var t = String(x.tipo || '').toUpperCase();
            return t.indexOf('VACA') >= 0 || t.indexOf('NOVILLA') >= 0;
          }).map(function(x) {
            return { codigo: x.codigo, tipo: x.tipo, predio: x.predio, propietario: x.propietario };
          });
          App.estado._madresCandidatas = cand;
          var h = document.getElementById('madre-hint');
          if (h) h.textContent = 'Solo vacas y novillas de vientre activas (' + cand.length + ' disponible' + (cand.length !== 1 ? 's' : '') + '). La cría hereda su finca y propietario.';
        });
      }
    });
  },

  // Conmuta el formulario entre Compra y Nacimiento mostrando/ocultando campos.
  _setTipoIngreso: function(val) {
    val = (val === 'NACIMIENTO') ? 'NACIMIENTO' : 'COMPRA';
    var hid = document.getElementById('f_tipo_ingreso'); if (hid) hid.value = val;
    var esNac = (val === 'NACIMIENTO');
    document.querySelectorAll('.ing-compra').forEach(function(el){ el.style.display = esNac ? 'none' : ''; });
    document.querySelectorAll('.ing-nacimiento').forEach(function(el){ el.style.display = esNac ? '' : 'none'; });
    var c = document.getElementById('ti_compra'), n = document.getElementById('ti_nac');
    if (c) c.classList.toggle('is-on', !esNac);
    if (n) n.classList.toggle('is-on', esNac);
    // Relabel de campos compartidos según el origen
    var set = function(id, txt){ var e = document.getElementById(id); if (e) e.textContent = txt; };
    set('lbl_fecha', esNac ? 'Fecha de nacimiento *' : 'Fecha de ingreso *');
    set('hint_fecha', esNac ? 'Día en que nació la cría.' : 'Día en que el animal llegó a la finca.');
    set('lbl_peso',  esNac ? 'Peso al nacer (kg)' : 'Peso inicial (kg) *');
    set('hint_peso', esNac ? 'Opcional — peso de la cría al nacer.' : 'Peso en kilogramos cuando llegó. Ej: 180.5');
    set('lbl_sec2',  esNac ? 'Datos del nacimiento' : 'Datos de compra');
    set('hint_sec2', esNac ? 'Origen genealógico y datos de la cría' : 'Información económica al momento de adquisición');
  },

  // En la edición: marca/desmarca que un animal nació en la finca (corrección de
  // origen). Reusa _setTipoIngreso para mostrar/ocultar el selector de madre.
  _toggleEsNacimientoEdicion: function(chk) {
    var esNac = !!(chk && chk.checked);
    App._setTipoIngreso(esNac ? 'NACIMIENTO' : 'COMPRA');
    var badge = document.getElementById('badge_ingreso');
    if (badge) {
      badge.className = 'badge ' + (esNac ? 'badge-blue' : 'badge-green');
      badge.innerHTML = 'Ingreso: ' + (esNac ? '<i class="ph ph-baby-carriage" aria-hidden="true"></i> Nacimiento' : '<i class="ph ph-shopping-cart" aria-hidden="true"></i> Compra');
    }
  },

  // ── Buscador desplegable de madre (solo candidatas: vaca / novilla vientre) ──
  _filtrarMadres: function() {
    var inp = document.getElementById('f_madre_codigo');
    var box = document.getElementById('madre-sugerencias');
    if (!inp || !box) return;
    var q     = (inp.value || '').toLowerCase().trim();
    var lista = App.estado._madresCandidatas || [];
    var filt  = lista.filter(function(m) {
      if (!q) return true;
      return String(m.codigo).toLowerCase().indexOf(q) >= 0 ||
             String(m.tipo || '').toLowerCase().indexOf(q) >= 0 ||
             String(m.predio || '').toLowerCase().indexOf(q) >= 0;
    });
    if (filt.length === 0) {
      box.innerHTML = '<div class="madre-empty">' +
        (lista.length === 0
          ? 'No hay vacas ni novillas de vientre disponibles como madre.'
          : 'Sin coincidencias.') + '</div>';
    } else {
      box.innerHTML = filt.slice(0, 80).map(function(m) {
        // onmousedown (no onclick): se dispara antes del blur del input
        return '<div class="madre-item" onmousedown="App._elegirMadre(\'' + String(m.codigo).replace(/'/g, "\\'") + '\')">' +
          '<span class="mc">' + m.codigo + '</span>' +
          '<span class="md">' + (m.tipo || '') + (m.predio ? ' · ' + m.predio : '') + (m.propietario ? ' · ' + m.propietario : '') + '</span>' +
        '</div>';
      }).join('');
    }
    box.classList.remove('hidden');
  },
  _elegirMadre: function(codigo) {
    var inp = document.getElementById('f_madre_codigo');
    if (inp) inp.value = codigo;
    var box = document.getElementById('madre-sugerencias');
    if (box) box.classList.add('hidden');
  },
  _cerrarMadreSug: function() {
    // Retraso para permitir que el onmousedown del ítem se registre antes de cerrar
    setTimeout(function() {
      var box = document.getElementById('madre-sugerencias');
      if (box) box.classList.add('hidden');
    }, 150);
  },

  _toggleCausaMuerte: function() {
    var sel = document.getElementById('f_estado');
    var grp = document.getElementById('grp_causa_muerte');
    if (grp) grp.style.display = (sel && sel.value === 'MUERTO') ? 'block' : 'none';
  },

  _onCambioPredi: function(sel) {
    var hidden = document.getElementById('f_predio');
    var nueva  = document.getElementById('f_predio_nueva');
    if (sel.value === '__nueva__') {
      if (nueva) { nueva.style.display = 'block'; nueva.focus(); }
      if (hidden) hidden.value = '';
    } else {
      if (nueva) nueva.style.display = 'none';
      if (hidden) hidden.value = sel.value;
    }
  },

  _onCambioPropietario: function(sel) {
    var hidden = document.getElementById('f_propietario');
    var nuevo  = document.getElementById('f_propietario_nuevo');
    if (sel.value === '__nuevo__') {
      if (nuevo) { nuevo.style.display = 'block'; nuevo.focus(); }
      if (hidden) hidden.value = '';
    } else {
      if (nuevo) { nuevo.style.display = 'none'; nuevo.value = ''; }
      if (hidden) hidden.value = sel.value;
    }
  },

  // Lee la imagen elegida, la redimensiona (máx 1200px) y la deja lista en
  // App.estado._fotoNueva para subirla al guardar. Muestra vista previa.
  _previewFoto: function(input) {
    var file = input.files && input.files[0];
    if (!file) return;
    if (!/^image\//.test(file.type)) { App.toast('Selecciona un archivo de imagen.', 'error'); return; }
    var reader = new FileReader();
    reader.onload = function(ev) {
      var img = new Image();
      img.onload = function() {
        var max = 1200, w = img.width, h = img.height;
        if (w > max || h > max) {
          if (w > h) { h = Math.round(h * max / w); w = max; }
          else       { w = Math.round(w * max / h); h = max; }
        }
        var canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        var dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        App.estado._fotoNueva = { base64: dataUrl.split(',')[1], mimeType: 'image/jpeg' };
        var prev = document.getElementById('foto-preview');
        if (prev) prev.innerHTML = '<img src="' + dataUrl + '" class="w-full h-full object-cover">';
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  },

  _togglePalpacion: function() {
    var chk = document.getElementById('chk_palpacion');
    var sec = document.getElementById('sec_palpacion');
    if (!sec) return;
    if (chk && chk.checked) {
      sec.classList.remove('hidden');
    } else {
      sec.classList.add('hidden');
      ['f_meses','pal_est_repr','pal_des_ovar','pal_diagnostico'].forEach(function(id) {
        var el = document.getElementById(id); if (el) el.value = '';
      });
      var grp = document.getElementById('grp_pal_meses');
      if (grp) grp.classList.add('hidden');
    }
  },

  // Calcula en vivo el precio total de una cría: peso al nacer × precio por kilo.
  _calcTotalNacimiento: function() {
    var box = document.getElementById('nac-total-preview');
    if (!box) return;
    var peso = App._leerNum('f_peso_inicial');
    var pkg  = App._leerPesos('f_precio_kg_nac');
    if (!isNaN(peso) && peso > 0 && !isNaN(pkg) && pkg > 0) {
      box.textContent = 'Precio total: ' + App.fmtCOP(Math.round(peso * pkg));
    } else {
      box.textContent = '';
    }
  },

  _toggleMesesGestacion: function(selectId, grpId) {
    var sel = document.getElementById(selectId);
    var grp = document.getElementById(grpId);
    if (!grp) return;
    var mostrar = sel && sel.value === 'Preñada';
    grp.classList.toggle('hidden', !mostrar);
    if (!mostrar) {
      var inp = grp.querySelector('input[type="number"]');
      if (inp) inp.value = '';
    }
  },

  _guardarAnimal: function(codigoEditar) {
    var campos = ['codigo','tipo','predio','lote','propietario','indicaciones','fecha_ingreso','meses','peso_inicial','precio_compra','estado','causa_muerte',
      'tipo_ingreso','sexo','madre_codigo','proveedor'];
    var payload = {};
    campos.forEach(function(c) {
      var el = document.getElementById('f_' + c);
      if (el) payload[c] = el.value;
    });

    // Los dos campos numéricos van normalizados: el backend hace parseFloat, y
    // parseFloat("1.800.000") da 1 — un animal de un peso. Así es como un precio
    // de compra podía quedar guardado por un valor irrisorio sin que nadie lo
    // notara hasta mirar la rentabilidad.
    var _pesoIni = App._leerNum('f_peso_inicial');
    payload.peso_inicial = isNaN(_pesoIni) ? '' : _pesoIni;
    var _precioC = App._leerPesos('f_precio_compra');
    if (document.getElementById('f_precio_compra')) {
      payload.precio_compra = isNaN(_precioC) ? '' : _precioC;
    }

    // Nacimiento: la fecha de ingreso al inventario ES la fecha de nacimiento.
    // Validaciones rápidas en cliente (el backend revalida).
    // Vale tanto para el alta como para la corrección de un animal ya existente
    // que en realidad nació en la finca (conversión desde la edición).
    var _esNacimiento = String(payload.tipo_ingreso || '').toUpperCase() === 'NACIMIENTO';
    if (_esNacimiento) {
      payload.fecha_nacimiento = payload.fecha_ingreso;
      if (!payload.madre_codigo) { App.toast('Selecciona la madre de la cría.', 'error'); return; }
      if (String(payload.madre_codigo).trim() === String(payload.codigo || codigoEditar || '').trim()) {
        App.toast('Un animal no puede ser su propia madre.', 'error'); return;
      }
      if (!payload.sexo)         { App.toast('Indica el sexo de la cría.', 'error'); return; }
      // Precio/kg al nacer → el backend calcula el precio total (peso × precio/kg).
      payload.precio_kg = (function(v){ return isNaN(v) ? '' : v; })(App._leerPesos('f_precio_kg_nac'));
    } else {
      // No es nacimiento: evita dejar un vínculo de madre colgando.
      payload.madre_codigo = '';
      if (!codigoEditar) payload.tipo_ingreso = 'COMPRA';
    }

    // Recoger procedimientos de la sección 3 (solo nuevo animal)
    var procs = [];
    if (!codigoEditar) {
      document.querySelectorAll('.np-check:checked').forEach(function(cb) {
        procs.push(cb.dataset.tipo);
      });
    }
    // Detalle capturado por procedimiento (medicamento, dosis, refuerzo y
    // observación propios). La palpación entra aparte, más abajo.
    var npDet = {};
    if (!codigoEditar) App._procLeer('np').forEach(function(pr){ npDet[pr.tipo] = pr; });
    var np_resp  = ((document.getElementById('np_resp')  || {}).value || '');
    var np_obs   = ((document.getElementById('np_obs')   || {}).value || '');
    var np_fecha = payload.fecha_ingreso || App._hoyISO();
    var obsPalpacion = '';

    // Si palpación está marcada, agregar sanidad event en la cola
    var chkPal     = document.getElementById('chk_palpacion');
    var palEstRepr = ((document.getElementById('pal_est_repr')    || {}).value || '').trim();
    var palDesOvar = ((document.getElementById('pal_des_ovar')    || {}).value || '').trim();
    var palMeses   = ((document.getElementById('f_meses')         || {}).value || '').trim();
    var palDiag    = ((document.getElementById('pal_diagnostico') || {}).value || '').trim();
    if (chkPal && chkPal.checked && (palEstRepr || palMeses || palDesOvar || palDiag)) {
      var partesPal = [];
      if (palEstRepr) partesPal.push(palEstRepr);
      if (palMeses)   partesPal.push('Gestación: ' + palMeses + ' meses');
      if (palDesOvar) partesPal.push(palDesOvar);
      if (palDiag)    partesPal.push(palDiag);
      obsPalpacion = partesPal.join(' | ');
      procs.unshift('__palpacion__');
      payload.estado_reproductivo = palEstRepr;
      payload.desarrollo_ovarico  = palDesOvar;
      if (palEstRepr && palEstRepr !== 'Preñada') payload.meses = '0';
    }

    var _continuarGuardado = function() {
    App.api('saveAnimal', [payload], function(r) {
      if (!r.ok) { App.toast(r.error, 'error'); return; }

      var codigo = (payload.codigo || codigoEditar || '').trim();

      if (procs.length > 0) {
        App.mostrarLoading('Guardando procedimientos…');
        var idx = 0;
        function siguienteProc() {
          if (idx >= procs.length) {
            App.cerrarModal();
            App.toast((codigoEditar ? 'Animal actualizado' : 'Animal registrado') + ' con ' + procs.length + ' procedimiento' + (procs.length > 1 ? 's' : '') + ' ✓', 'success');
            if (codigoEditar) App.vistaFicha(encodeURIComponent(codigoEditar));
            else App.irAnimal(codigo);
            return;
          }
          var tipo = procs[idx++];
          var esPal = tipo === '__palpacion__';
          if (esPal) tipo = 'PALPACIÓN VETERINARIA';
          var det = npDet[tipo] || {};
          App.api('saveEventoSanitario', [{ codigo: codigo, fecha: np_fecha, tipo: tipo,
            medicamento: det.medicamento || '', dosis: det.dosis || '', responsable: np_resp,
            observacion: esPal ? App._uniqJoin([obsPalpacion, np_obs], ' | ')
                               : App._uniqJoin([det.observacion, np_obs], ' | '),
            proxima_fecha:        det.proxima_fecha        || '',
            requiere_seguimiento: det.requiere_seguimiento || 'no',
            estado_reproductivo: esPal ? palEstRepr : '',
            desarrollo_ovarico:  esPal ? palDesOvar : '' }],
            function() { siguienteProc(); }, function() { siguienteProc(); });
        }
        siguienteProc();
      } else {
        App.toast(codigoEditar ? 'Animal actualizado ✓' : 'Animal registrado ✓', 'success');
        App.cerrarModal();
        if (codigoEditar) App.vistaFicha(encodeURIComponent(codigoEditar));
        else App.irAnimal(codigo);
      }
    });
    };

    // Si hay una foto nueva seleccionada, súbela a Drive antes de guardar el animal
    if (App.estado._fotoNueva) {
      App.mostrarLoading('Subiendo imagen…');
      App.api('subirFotoAnimal',
        [{ codigo: payload.codigo || codigoEditar || '', mimeType: App.estado._fotoNueva.mimeType, base64: App.estado._fotoNueva.base64 }],
        function(rf) { if (rf && rf.ok && rf.url) payload.foto_url = rf.url; App.estado._fotoNueva = null; _continuarGuardado(); },
        function()   { App.estado._fotoNueva = null; _continuarGuardado(); });
    } else {
      _continuarGuardado();
    }
  },

  // ── Quiénes son los que llevan sin pesar ─────────────────────────────
  // La tarjeta decía "15 pendientes" y ahí se acababa: para saber cuáles había
  // que recorrer el hato animal por animal. La lista ya estaba calculada; lo
  // único que faltaba era enseñarla, agrupada por finca, que es como se sale a
  // trabajar — un día se va a Bélgica y se pesa lo de Bélgica.
  _sinMedir: [],
  verSinMedir: function(finca) {
    var lista = App._sinMedir || [];
    if (!lista.length) { App.toast('Todo el hato tiene pesaje reciente.', 'success'); return; }

    var fincas = {};
    lista.forEach(function(a) { fincas[a.p] = (fincas[a.p] || 0) + 1; });
    var nombres = Object.keys(fincas).sort();
    var sel = (finca && fincas[finca]) ? finca : '';
    var ver = sel ? lista.filter(function(a) { return a.p === sel; }) : lista;

    var html = '<div class="p-6">' +
      '<div class="flex items-start justify-between mb-1">' +
        '<h2 class="text-lg font-bold"><i class="ph ph-timer" aria-hidden="true"></i> Sin pesar hace más de 45 días</h2>' +
        '<button onclick="App.cerrarModal()" class="text-gray-400 hover:text-gray-700 text-2xl leading-none">×</button>' +
      '</div>' +
      '<div class="text-sm mb-4" style="color:var(--muted)">' + lista.length + ' animal' +
        (lista.length !== 1 ? 'es' : '') + ' en total. Los que llevan más tiempo van primero.</div>';

    if (nombres.length > 1) {
      html += '<div class="subtabs" style="margin-bottom:14px">' +
        '<button class="subtab' + (sel ? '' : ' is-on') + '" onclick="App.verSinMedir()">Todas (' + lista.length + ')</button>' +
        nombres.map(function(n) {
          return '<button class="subtab' + (sel === n ? ' is-on' : '') + '" ' +
            'onclick="App.verSinMedir(' + JSON.stringify(n).replace(/"/g, '&quot;') + ')">' +
            App._esc(n) + ' (' + fincas[n] + ')</button>';
        }).join('') + '</div>';
    }

    html += '<div style="max-height:52vh;overflow:auto"><table class="tabla-ganadero">' +
      '<thead><tr><th>Código</th><th>Tipo</th><th>Finca</th><th>Sin pesar</th><th></th></tr></thead><tbody>' +
      ver.map(function(a) {
        // "Nunca" no es un número grande: es una categoría distinta y se dice
        // con palabras. Un animal sin ninguna medición no tiene GDP, y ese es
        // un agujero peor que llevar 60 días sin pasar por la báscula.
        var txt = (a.dias === null)
          ? '<span class="badge badge-red">Nunca medido</span>'
          : '<b>' + a.dias + '</b> días';
        return '<tr><td class="font-mono font-bold">' + App._esc(a.c) + '</td>' +
          '<td>' + App._esc(a.t) + '</td><td>' + App._esc(a.p) + '</td><td>' + txt + '</td>' +
          '<td class="text-right"><button onclick="App.abrirModalMedicion(' +
            JSON.stringify(a.c).replace(/"/g, '&quot;') + ')" class="btn-secondary text-xs px-3 py-1"><i class="ph ph-scales" aria-hidden="true"></i> Pesar</button></td></tr>';
      }).join('') +
      '</tbody></table></div>' +
      '<div class="flex justify-end mt-4"><button onclick="App.cerrarModal()" class="btn-secondary">Cerrar</button></div>' +
    '</div>';
    App.abrirModal(html);
  },

  abrirModalMedicion: function(codigo) {
    if (!codigo) {
      // Sin código: mostrar selector de animal primero
      App.estado._cbSelector = function(c) { App.abrirModalMedicion(c); };
      App._mostrarSelectorAnimal('<i class="ph ph-ruler" aria-hidden="true"></i> Registrar pesaje — selecciona el animal');
      return;
    }

    // Con código: mostrar formulario directamente
    var animalInfo = App.estado.animalesLista.find(function(a){ return a.codigo === codigo; });
    var subtitulo  = animalInfo
      ? codigo + ' <span class="text-sm font-normal text-gray-400">· ' + (animalInfo.tipo||'') + ' · ' + (animalInfo.predio||'') + '</span>'
      : codigo;

    var html = '<div class="p-6">' +
      '<div class="flex items-center justify-between mb-5">' +
        '<h2 class="text-lg font-bold">' + subtitulo + '</h2>' +
        '<button onclick="App.cerrarModal()" class="text-gray-400 hover:text-gray-700 text-2xl leading-none">×</button>' +
      '</div>' +
      '<div class="form-group"><label class="form-label">Fecha *</label>' +
        '<input type="date" id="m_fecha" value="' + App._hoyISO() + '" class="form-input"></div>' +
      '<div class="form-group"><label class="form-label">Peso (kg) *</label>' +
        App._numInput('m_peso', { placeholder:'Ej: 285,5', autofocus:true }) + '</div>' +
      '<div class="form-group"><label class="form-label">Observación</label>' +
        '<textarea id="m_obs" rows="2" class="form-input" placeholder="Estado del animal, condición corporal…"></textarea></div>' +
      '<div class="flex justify-between items-center mt-4">' +
        '<button onclick="App.abrirModalMedicion()" class="text-sm text-gray-400 hover:text-gray-700">← Cambiar animal</button>' +
        '<div class="flex gap-3">' +
          '<button onclick="App.cerrarModal()" class="btn-secondary">Cancelar</button>' +
          '<button onclick="App._guardarMedicion(\'' + codigo.replace(/'/g,"'") + '\')" class="btn-primary px-6 py-2 text-sm">Guardar pesaje</button>' +
        '</div>' +
      '</div></div>';
    App.abrirModal(html);
    setTimeout(function(){ var el=document.getElementById('m_peso'); if(el) el.focus(); }, 80);
  },

  _guardarMedicion: function(codigo) {
    var pesoNum = App._leerNum('m_peso');
    if (isNaN(pesoNum) || pesoNum <= 0) {
      App._marcarCampo('m_peso', 'Escribe el peso, por ejemplo 285,5 o 285.5');
      return;
    }
    var payload = {
      codigo:      codigo,
      fecha:       document.getElementById('m_fecha').value,
      peso:        pesoNum,
      observacion: document.getElementById('m_obs').value
    };
    App.api('saveMedicion', [payload], function(r) {
      if (!r.ok) { App.toast(r.error || 'Error al guardar la medición.', 'error'); return; }
      App.toast('Medición guardada ✓', 'success');
      // Si el nuevo peso promovió la categoría (p. ej. Ternera de levante → Novilla de vientre).
      if (r.reclasificado) App.toast('Categoría actualizada → ' + r.reclasificado, 'info');
      App.cerrarModal();
      App.irAnimal(codigo); // actualiza URL + navega a la ficha
    });
  },

  abrirModalVenta: function(codigo) {
    if (!codigo) {
      App.estado._cbSelector = function(c) { App.abrirModalVenta(c); };
      App._mostrarSelectorAnimal('<i class="ph ph-money" aria-hidden="true"></i> Registrar venta — selecciona el animal');
      return;
    }

    var animalInfo = App.estado.animalesLista.find(function(a){ return a.codigo === codigo; });
    var subtitulo  = animalInfo
      ? codigo + ' <span class="text-sm font-normal text-gray-400">· ' + (animalInfo.tipo||'') + ' · ' + (animalInfo.predio||'') + '</span>'
      : codigo;

    // Mostrar precio de compra como referencia
    var infoCompra = animalInfo && animalInfo.precio_compra
      ? '<div class="bg-gray-50 rounded-lg px-4 py-2 mb-4 text-sm text-gray-500">' +
          'Precio de compra: <span class="font-semibold text-gray-700">' + App.fmtCOP(animalInfo.precio_compra) + '</span>' +
          (animalInfo.peso_inicial ? ' · Peso inicial: <span class="font-semibold text-gray-700">' + animalInfo.peso_inicial + ' kg</span>' : '') +
        '</div>'
      : '';

    // Guarda anti-venta accidental según el estado reproductivo:
    // preñada / dudosa → banner + casilla obligatoria; sin chequeo → aviso informativo.
    var repro = App._estadoReproVenta(codigo);
    var bannerPrenada = '', chipModal = '';
    if (repro.nivel === 'prenada' || repro.nivel === 'dudosa') {
      var esDudosa = repro.nivel === 'dudosa';
      chipModal = esDudosa ? ' <span class="chip-repro dudosa"><i class="ph ph-question" aria-hidden="true"></i> DUDOSA</span>' : ' <span class="chip-repro prenada"><i class="ph ph-baby" aria-hidden="true"></i> PREÑADA</span>';
      bannerPrenada = '<div class="venta-alerta-prenada">' +
        '<div class="vap-head">' + (esDudosa
          ? '<i class="ph ph-question" aria-hidden="true"></i> OJO: la última palpación quedó DUDOSA — podría estar preñada'
          : '<i class="ph ph-baby" aria-hidden="true"></i> ¡CUIDADO! Esta hembra está PREÑADA' +
            (repro.meses ? ' — gestación ~' + repro.meses + ' meses' : '') +
            (repro.vencida ? ' (a término: ¿ya parió?)' : '')) + '</div>' +
        '<p>' + (esDudosa
          ? 'El diagnóstico no fue concluyente. Lo seguro es re-palpar antes de vender. La venta queda bloqueada hasta que confirmes.'
          : 'Vender una vaca preñada casi siempre es un error. Verifica el código y la palpación antes de continuar. La venta queda bloqueada hasta que confirmes.') + '</p>' +
        '<label><input type="checkbox" id="v_conf_prenada"> Entiendo el estado de <b>' + codigo + '</b> y aun así deseo venderla</label>' +
      '</div>';
    } else if (repro.nivel === 'sinchequeo') {
      chipModal = ' <span class="chip-repro sinchequeo"><i class="ph ph-question" aria-hidden="true"></i> Sin chequeo</span>';
      bannerPrenada = '<div class="venta-alerta-chequeo"><i class="ph ph-question" aria-hidden="true"></i> <b>' + codigo + '</b> es hembra <b>sin chequeo reproductivo registrado</b> — el sistema no puede saber si está preñada. Confírmalo en el corral antes de cerrar la venta.</div>';
    }

    var html = '<div class="p-6">' +
      '<div class="flex items-center justify-between mb-5">' +
        '<h2 class="text-lg font-bold">' + subtitulo + chipModal + '</h2>' +
        '<button onclick="App.cerrarModal()" class="text-gray-400 hover:text-gray-700 text-2xl leading-none">×</button>' +
      '</div>' +
      bannerPrenada +
      infoCompra +
      '<div class="grid grid-cols-2 gap-4">' +
        '<div class="form-group"><label class="form-label">Fecha de venta *</label>' +
          '<input type="date" id="v_fecha" value="' + App._hoyISO() + '" class="form-input"></div>' +
        '<div class="form-group"><label class="form-label">Comprador</label>' +
          '<input type="text" id="v_comprador" class="form-input" placeholder="Nombre o empresa"></div>' +
      '</div>' +
      '<div class="venta-precio-nota">' +
        '<i class="ph ph-calculator"></i>' +
        '<span>Pon el peso y <b>uno de los dos precios</b> — el otro se calcula solo. ' +
        'Si vendiste <b>al bulto</b>, escribe el total y el sistema saca el precio por kilo.</span>' +
      '</div>' +
      '<div class="grid grid-cols-3 gap-3">' +
        '<div class="form-group"><label class="form-label">Peso de salida (kg) *</label>' +
          App._numInput('v_peso', { oninput:"App._calcVenta('peso')", placeholder:'Ej: 320' }) + '</div>' +
        '<div class="form-group"><label class="form-label">Precio por kilo (COP)</label>' +
          App._numInput('v_preckg', { entero:true, oninput:"App._calcVenta('kg')", placeholder:'Ej: 9.200' }) +
          '<p class="form-hint" id="v_hint_kg"></p></div>' +
        '<div class="form-group"><label class="form-label">Precio total, al bulto (COP) *</label>' +
          App._numInput('v_precsal', { entero:true, oninput:"App._calcVenta('total')", placeholder:'Ej: 3.100.000' }) +
          '<p class="form-hint" id="v_hint_total"></p></div>' +
      '</div>' +
      '<div class="flex justify-between items-center mt-4">' +
        '<button onclick="App.abrirModalVenta()" class="text-sm text-gray-400 hover:text-gray-700">← Cambiar animal</button>' +
        '<div class="flex gap-3">' +
          '<button onclick="App.cerrarModal()" class="btn-secondary">Cancelar</button>' +
          '<button onclick="App._guardarVenta(\'' + codigo.replace(/'/g, "\\'") + '\')" class="btn-primary px-6 py-2 text-sm">Registrar venta</button>' +
        '</div>' +
      '</div></div>';
    App.abrirModal(html);
  },

  _calcVenta: function(origen) {
    var peso  = App._leerNum('v_peso')      || 0;
    var kg    = App._leerPesos('v_preckg')  || 0;
    var total = App._leerPesos('v_precsal') || 0;
    var hKg   = document.getElementById('v_hint_kg');
    var hTot  = document.getElementById('v_hint_total');
    if (hKg)  hKg.textContent  = '';
    if (hTot) hTot.textContent = '';
    // Se dice cuál campo lo calculó el sistema, para que nadie dude de si el
    // número que ve lo escribió él o salió de una cuenta.
    if (origen === 'peso' || origen === 'kg') {
      if (peso && kg) {
        var el = document.getElementById('v_precsal');
        if (el) el.value = Math.round(peso * kg);
        if (hTot) hTot.textContent = 'Calculado: ' + App.fmt(peso, 1) + ' kg × ' + App.fmtCOP(kg);
      }
    } else if (origen === 'total') {
      if (peso && total) {
        var el2 = document.getElementById('v_preckg');
        if (el2) el2.value = Math.round(total / peso);
        if (hKg) hKg.textContent = 'Calculado: ' + App.fmtCOP(total) + ' ÷ ' + App.fmt(peso, 1) + ' kg';
      }
    }
  },

  _guardarVenta: function(codigo) {
    // Guarda anti-venta accidental: si el modal mostró el banner de preñez,
    // la casilla de confirmación es obligatoria para poder registrar la venta.
    var confPren = document.getElementById('v_conf_prenada');
    if (confPren && !confPren.checked) {
      App.toast('Esta hembra está preñada (o con palpación dudosa). Marca la casilla de confirmación si realmente deseas venderla.', 'error');
      return;
    }
    var peso   = App._leerNum('v_peso');
    var precio = App._leerPesos('v_precsal');
    if (isNaN(peso)   || peso   <= 0) { App._marcarCampo('v_peso',    'Escribe el peso de salida, por ejemplo 320 o 320,5'); return; }
    if (isNaN(precio) || precio <= 0) { App._marcarCampo('v_precsal', 'Escribe el precio total, por ejemplo 3.100.000'); return; }
    var payload = {
      codigo:        codigo,
      fecha_venta:   (document.getElementById('v_fecha')      || {}).value || '',
      precio_salida: precio,
      peso_salida:   peso,
      comprador:     (document.getElementById('v_comprador')  || {}).value || ''
    };
    App.api('registrarVenta', [payload], function(r) {
      if (!r.ok) {
        // Sin precio de compra la venta se rechaza a propósito: registrarla
        // produciría una utilidad falsa. Se dice qué falta y dónde arreglarlo.
        if (r.sinCosto) {
          App.toast('Falta el precio de compra de ' + codigo + '. Sin ese dato la utilidad saldría falsa.', 'error');
          var cont = document.getElementById('modal-content');
          if (cont) {
            var av = document.createElement('div');
            av.className = 'aviso-costo';
            av.innerHTML = '<i class="ph ph-warning-circle"></i><div>' +
              '<div class="aviso-costo-t">Este animal no tiene precio de compra</div>' +
              '<div class="aviso-costo-linea">Sin él la utilidad se calcularía como si el animal hubiera ' +
              'costado cero. Regístralo en la ficha y vuelve a intentar la venta.</div></div>';
            cont.insertBefore(av, cont.firstChild.nextSibling);
          }
          return;
        }
        App.toast(r.error || 'Error al registrar la venta.', 'error');
        return;
      }
      App.toast('Venta registrada ✓', 'success');
      App.cerrarModal();
      App.irAnimal(codigo);
    });
  },

  abrirModalSanidad: function(codigo) {
    if (!codigo) {
      App.estado._cbSelector = function(c) { App.abrirModalSanidad(c); };
      App._mostrarSelectorAnimal('<i class="ph ph-syringe" aria-hidden="true"></i> Evento sanitario — selecciona el animal');
      return;
    }

    var animalInfo = App.estado.animalesLista.find(function(a){ return a.codigo === codigo; });
    var subtitulo  = animalInfo
      ? codigo + ' <span class="text-sm font-normal text-gray-400">· ' + (animalInfo.tipo||'') + ' · ' + (animalInfo.predio||'') + '</span>'
      : codigo;

    var html = '<div class="p-6">' +
      '<div class="flex items-center justify-between mb-5">' +
        '<h2 class="text-lg font-bold">' + subtitulo + '</h2>' +
        '<button onclick="App.cerrarModal()" class="text-gray-400 hover:text-gray-700 text-2xl leading-none">×</button>' +
      '</div>' +
      '<div class="grid grid-cols-2 gap-4">' +
        '<div class="form-group"><label class="form-label">Fecha *</label>' +
          '<input type="date" id="s_fecha" value="' + App._hoyISO() + '" class="form-input" ' +
            'onchange="App._procRefrescarFechas(\'s\')"></div>' +
        '<div class="form-group"><label class="form-label">Responsable</label>' +
          '<input type="text" id="s_resp" class="form-input"></div>' +
      '</div>' +
      '<div class="form-group"><label class="form-label">Procedimiento(s) * <span class="text-xs font-normal text-gray-400">— marca uno o varios; al marcarlo se abre su detalle</span></label>' +
        '<div class="grid grid-cols-2 sm:grid-cols-3 gap-2">' + App._sanCheckboxes('s-tipo-chk', 's') + '</div></div>' +
      App._procDetalles('s', 's_fecha') +
      '<div class="form-group"><label class="form-label">Observación general <span class="text-xs font-normal text-gray-400">— del día, no de un procedimiento</span></label>' +
        '<textarea id="s_obs" rows="2" class="form-input" placeholder="Opcional"></textarea></div>' +
      '<div class="flex justify-between items-center mt-4">' +
        '<button onclick="App.abrirModalSanidad()" class="text-sm text-gray-400 hover:text-gray-700">← Cambiar animal</button>' +
        '<div class="flex gap-3">' +
          '<button onclick="App.cerrarModal()" class="btn-secondary">Cancelar</button>' +
          '<button onclick="App._guardarSanidad(\'' + codigo.replace(/'/g,"'") + '\')" class="btn-primary px-6 py-2 text-sm">Guardar evento</button>' +
        '</div>' +
      '</div></div>';
    App.abrirModal(html);
  },

  // ── EVENTO SANITARIO POR LOTE ────────────────────────────────────────────
  // Un solo procedimiento aplicado a varios animales: se filtra por finca y se
  // marcan con casillas los animales a los que se les realiza. No reemplaza el
  // flujo individual; es una opción adicional.
  abrirModalEventoLote: function() {
    App.api('listAnimales', [{ soloActivos: true }], function(lista) {
      App.estado.animalesLista = lista;
      var seenP = {}, predios = [];
      lista.forEach(function(a){ if (a.predio && !seenP[a.predio]) { seenP[a.predio]=1; predios.push(a.predio); } });
      predios.sort();
      var hoy = App._hoyISO();

      var html = '<div class="p-6">' +
        '<div class="flex items-center justify-between mb-1">' +
          '<h2 class="text-lg font-bold"><i class="ph ph-syringe" aria-hidden="true"></i> Evento sanitario por lote</h2>' +
          '<button onclick="App.cerrarModal()" class="text-gray-400 hover:text-gray-700 text-2xl leading-none">×</button>' +
        '</div>' +
        '<p class="text-xs text-gray-400 mb-4">Define el procedimiento una sola vez y marca los animales a los que se aplica.</p>' +

        // ── Datos del evento ──
        '<div class="grid grid-cols-2 gap-4">' +
          '<div class="form-group"><label class="form-label">Fecha *</label>' +
            '<input type="date" id="lote_fecha" value="' + hoy + '" class="form-input" onchange="App._procRefrescarFechas(\'lote\')"></div>' +
          '<div class="form-group"><label class="form-label">Responsable</label><input type="text" id="lote_resp" class="form-input"></div>' +
        '</div>' +
        '<div class="form-group"><label class="form-label">Procedimiento(s) * <span class="text-xs font-normal text-gray-400">— marca uno o varios; al marcarlo se abre su detalle</span></label>' +
          '<div class="grid grid-cols-2 sm:grid-cols-3 gap-2">' + App._sanCheckboxes('lote-tipo-chk', 'lote') + '</div></div>' +
        App._procDetalles('lote', 'lote_fecha') +
        '<div class="form-group"><label class="form-label">Observación general <span class="text-xs font-normal text-gray-400">— del día, no de un procedimiento</span></label>' +
          '<textarea id="lote_obs" rows="2" class="form-input" placeholder="Opcional"></textarea></div>' +

        // ── Selección de animales ──
        '<div class="border-t border-gray-100 mt-2 pt-4">' +
          '<div class="flex items-center justify-between mb-2">' +
            '<label class="form-label mb-0">Animales a los que se aplica</label>' +
            '<span id="lote_count" class="text-xs font-semibold text-green-700">0 seleccionados</span>' +
          '</div>' +
          '<div class="flex flex-wrap gap-2 mb-2">' +
            '<select id="lote_predio" onchange="App._loteFiltrar()" class="form-input w-auto text-sm py-1.5"><option value="">Todas las fincas</option>' + predios.map(function(p){ return '<option>'+p+'</option>'; }).join('') + '</select>' +
            '<input type="text" id="lote_q" placeholder="Buscar código…" oninput="App._loteFiltrar()" class="form-input flex-1 min-w-32 text-sm py-1.5">' +
            '<button type="button" onclick="App._loteTodos(true)" class="btn-secondary text-xs px-3 py-1.5 whitespace-nowrap">Marcar visibles</button>' +
            '<button type="button" onclick="App._loteTodos(false)" class="text-xs text-gray-400 hover:text-gray-700 px-2">Limpiar</button>' +
          '</div>' +
          '<div id="lote_lista" class="border border-gray-200 rounded-lg max-h-56 overflow-y-auto">';

      lista.forEach(function(a) {
        var busq = (String(a.codigo)+' '+(a.tipo||'')+' '+(a.predio||'')+' '+(a.propietario||'')).toLowerCase();
        html += '<label class="lote-item flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-green-50 border-b border-gray-50" data-predio="'+(a.predio||'')+'" data-busq="'+busq+'">' +
          '<input type="checkbox" class="lote-chk w-4 h-4 accent-green-700 shrink-0" value="'+String(a.codigo).replace(/"/g,'&quot;')+'" onchange="App._loteContar()">' +
          '<span class="font-semibold text-gray-800 text-sm w-16 shrink-0">'+a.codigo+'</span>' +
          '<span class="text-xs text-gray-400 truncate">'+(a.tipo||'—')+' · '+(a.predio||'—')+(a.propietario ? ' · '+a.propietario : '')+'</span>' +
        '</label>';
      });

      html += '</div></div>' +
        '<div class="flex justify-end gap-3 mt-5">' +
          '<button onclick="App.cerrarModal()" class="btn-secondary">Cancelar</button>' +
          '<button id="lote_guardar" onclick="App._guardarEventoLote()" class="btn-primary px-6 py-2 text-sm">Registrar evento</button>' +
        '</div>' +
      '</div>';
      App.abrirModal(html);
    });
  },

  _loteFiltrar: function() {
    var pr = ((document.getElementById('lote_predio') || {}).value || '');
    var q  = ((document.getElementById('lote_q')      || {}).value || '').toLowerCase().trim();
    document.querySelectorAll('.lote-item').forEach(function(el) {
      var ok = (!pr || el.dataset.predio === pr) && (!q || (el.dataset.busq || '').includes(q));
      el.style.display = ok ? '' : 'none';
    });
  },
  _loteTodos: function(val) {
    document.querySelectorAll('.lote-item').forEach(function(el) {
      if (el.style.display === 'none') return;   // solo afecta a los visibles (filtrados)
      var chk = el.querySelector('.lote-chk');
      if (chk) chk.checked = val;
    });
    App._loteContar();
  },
  _loteContar: function() {
    var n = document.querySelectorAll('.lote-chk:checked').length;
    var c = document.getElementById('lote_count');
    if (c) c.textContent = n + ' seleccionado' + (n !== 1 ? 's' : '');
    var b = document.getElementById('lote_guardar');
    if (b) b.textContent = n > 0 ? 'Registrar a ' + n + ' animal' + (n !== 1 ? 'es' : '') : 'Registrar evento';
  },
  // Con multi-selección la fecha de seguimiento es opcional y por-tipo la calcula el
  // backend; aquí solo se muestra/oculta el campo y se limpia al desactivarlo.
  _guardarEventoLote: function() {
    var codigos = [];
    document.querySelectorAll('.lote-chk:checked').forEach(function(c) { codigos.push(c.value); });
    if (codigos.length === 0) { App.toast('Marca al menos un animal.', 'error'); return; }
    var fecha = (document.getElementById('lote_fecha') || {}).value || '';
    if (!fecha) { App.toast('La fecha es obligatoria.', 'error'); return; }
    var procs = App._procLeer('lote');
    if (procs.length === 0) { App.toast('Marca al menos un procedimiento.', 'error'); return; }
    var resp   = (document.getElementById('lote_resp') || {}).value || '';
    var obsGen = ((document.getElementById('lote_obs')  || {}).value || '').trim();
    var tipos  = procs.map(function(pr){ return pr.tipo; });
    // Un tratamiento por procedimiento × todos los animales, cada uno con SU
    // medicamento, SU dosis y SU refuerzo (reutiliza saveEventosSanitariosLote).
    App.mostrarLoading('Registrando ' + tipos.length + ' tratamiento' + (tipos.length !== 1 ? 's' : '') +
                       ' a ' + codigos.length + ' animal' + (codigos.length !== 1 ? 'es' : '') + '…');
    var idx = 0, avisos = [];
    function siguiente() {
      if (idx >= procs.length) {
        App.cerrarModal();
        if (avisos.length) App.toast('Registrado con avisos: ' + avisos.join(' · '), 'info');
        else App.toast(tipos.length + ' tratamiento' + (tipos.length !== 1 ? 's' : '') + ' registrado' + (tipos.length !== 1 ? 's' : '') +
                       ' a ' + codigos.length + ' animal' + (codigos.length !== 1 ? 'es' : '') + ' ✓', 'success');
        App.vistaSanidad();
        return;
      }
      var pr = procs[idx++];
      var ev = {
        fecha:                fecha,
        tipo:                 pr.tipo,
        medicamento:          pr.medicamento,
        dosis:                pr.dosis,
        responsable:          resp,
        observacion:          App._uniqJoin([pr.observacion, obsGen], ' | '),
        proxima_fecha:        pr.proxima_fecha,
        requiere_seguimiento: pr.requiere_seguimiento
      };
      App.api('saveEventosSanitariosLote', [{ codigos: codigos, evento: ev }], function(r) {
        if (!r || (!r.ok && !r.total)) avisos.push(ev.tipo + ': falló');
        else if (r.errores && r.errores.length) avisos.push(ev.tipo + ': ' + r.errores.length + ' con error');
        siguiente();
      }, function() { avisos.push(ev.tipo + ': error de red'); siguiente(); });
    }
    siguiente();
  },

  // ── MORTALIDAD ───────────────────────────────────────────────────────────
  // Registrar la muerte no borra nada: el animal queda como fallecido pero
  // conserva nacimiento, pesos, madre, tratamientos y controles. Sirve tanto
  // para registrar por primera vez como para corregir un registro existente.
  CAUSAS_MUERTE: ['Ahogado al nacer','Enfermedad','Fiebre de garrapata','Accidente','Picadura de serpiente','Otra'],

  abrirModalMuerte: function(codigo) {
    if (!codigo) {
      App.estado._cbSelector = function(c) { App.abrirModalMuerte(c); };
      App._mostrarSelectorAnimal('<i class="ph ph-cross" aria-hidden="true"></i> Registrar muerte — selecciona el animal');
      return;
    }
    App.estado._fotoMuerte = null;

    var a = (App.estado.animalActual && App.estado.animalActual.animal.codigo === codigo)
      ? App.estado.animalActual.animal
      : (App.estado.animalesLista.find(function(x){ return x.codigo === codigo; }) || { codigo: codigo });
    var yaMuerto = a.estado === 'MUERTO';
    var hoy = App._hoyISO();

    // Causa previa: si no es una de las normalizadas (registros viejos con texto
    // libre) se preselecciona "Otra" y el texto se conserva en el campo libre.
    var causaPrev = a.causa_muerte || '';
    var esEstandar = App.CAUSAS_MUERTE.indexOf(causaPrev) >= 0;
    var causaSel   = esEstandar ? causaPrev : (causaPrev ? 'Otra' : '');
    var otraPrev   = esEstandar ? (a.causa_muerte_otra || '') : causaPrev;

    var opciones = '<option value="">— Selecciona la causa —</option>' +
      App.CAUSAS_MUERTE.map(function(c) {
        return '<option value="' + c + '"' + (causaSel === c ? ' selected' : '') + '>' +
          (c === 'Otra' ? 'Otra causa (especificar)' : c) + '</option>';
      }).join('');

    // Contexto del animal: ayuda a confirmar que es el correcto antes de guardar.
    var nacIso = a.fecha_nacimiento || a.fecha_ingreso || '';
    var ctx = [];
    if (a.tipo)   ctx.push(a.tipo);
    if (a.predio) ctx.push(a.predio);
    if (a.propietario) ctx.push(a.propietario);

    var html = '<div class="p-6">' +
      '<div class="flex items-center justify-between mb-1">' +
        '<h2 class="text-lg font-bold">' + (yaMuerto ? '<i class="ph ph-pencil-simple" aria-hidden="true"></i> Corregir registro de muerte' : '<i class="ph ph-cross" aria-hidden="true"></i> Registrar muerte') + ' — <span style="color:var(--accent)">' + codigo + '</span></h2>' +
        '<button onclick="App.cerrarModal()" class="text-gray-400 hover:text-gray-700 text-2xl leading-none">×</button>' +
      '</div>' +
      '<p class="text-xs text-gray-400 mb-4">' + (ctx.join(' · ') || 'Animal registrado') +
        (nacIso ? ' · ' + (a.fecha_nacimiento ? 'nació' : 'ingresó') + ' el ' + App.fmtFecha(nacIso) : '') + '</p>' +

      '<div class="muerte-nota"><i class="ph ph-shield-check"></i>' +
        '<span>El animal <b>no se elimina</b>. Todo su historial — nacimiento, pesos, madre, tratamientos — se conserva; solo se añade el desenlace para poder analizar después la mortalidad.</span></div>' +

      '<div class="grid grid-cols-2 gap-4 mt-4">' +
        '<div class="form-group"><label class="form-label">Fecha de muerte *</label>' +
          '<input type="date" id="mu_fecha" value="' + (a.fecha_muerte || hoy) + '" max="' + hoy + '" ' +
            (nacIso ? 'min="' + String(nacIso).substring(0,10) + '" ' : '') +
            'class="form-input" onchange="App._calcEdadMuerte(\'' + String(nacIso).substring(0,10) + '\')">' +
          '<p class="form-hint" id="mu_edad_hint">Sin esta fecha no se puede analizar mortalidad por periodo ni por edad.</p></div>' +
        '<div class="form-group"><label class="form-label">Causa de muerte *</label>' +
          '<select id="mu_causa" class="form-input" onchange="App._toggleOtraCausa()">' + opciones + '</select>' +
          '<p class="form-hint">Se agrupan por causa para detectar patrones.</p></div>' +
      '</div>' +

      '<div class="form-group' + (causaSel === 'Otra' ? '' : ' hidden') + '" id="grp_mu_otra">' +
        '<label class="form-label">¿Cuál fue la causa? *</label>' +
        '<input type="text" id="mu_otra" value="' + String(otraPrev).replace(/"/g, '&quot;') + '" class="form-input" placeholder="Describe la causa en pocas palabras"></div>' +

      '<div class="form-group"><label class="form-label">Observaciones sobre lo ocurrido</label>' +
        '<textarea id="mu_obs" rows="3" class="form-input" placeholder="Cómo se encontró, síntomas previos, si hubo tratamiento, quién lo reportó…">' + (a.obs_muerte || '') + '</textarea>' +
        '<p class="form-hint">Estos detalles son los que después explican <i>por qué</i> ocurren las muertes.</p></div>' +

      '<div class="form-group"><label class="form-label">Evidencia o soporte (opcional)</label>' +
        '<div class="flex items-center gap-4">' +
          '<div id="mu-foto-preview" class="w-20 h-20 rounded-xl border border-gray-200 overflow-hidden flex items-center justify-center shrink-0" style="background:var(--surface-2);color:var(--muted)">' +
            (a.foto_muerte_url
              ? '<img src="' + a.foto_muerte_url + '" class="w-full h-full object-cover" onerror="this.style.display=\'none\'">'
              : '<i class="ph ph-image" style="font-size:26px"></i>') +
          '</div>' +
          '<div>' +
            '<input type="file" id="mu_foto" accept="image/*" class="hidden" onchange="App._previewFotoMuerte(this)">' +
            '<button type="button" onclick="document.getElementById(\'mu_foto\').click()" class="btn-secondary text-sm">' +
              '<i class="ph ph-upload-simple"></i> ' + (a.foto_muerte_url ? 'Cambiar evidencia' : 'Adjuntar foto') + '</button>' +
            '<p class="form-hint">Foto del animal, informe del veterinario o cualquier soporte.</p>' +
          '</div>' +
        '</div></div>' +

      '<div class="flex justify-between items-center mt-5 flex-wrap gap-3">' +
        (yaMuerto
          ? '<button onclick="App.revertirMuerte(\'' + String(codigo).replace(/'/g, "\\'") + '\')" class="text-xs text-gray-400 hover:text-red-500"><i class="ph ph-arrow-u-up-left" aria-hidden="true"></i> No murió — devolver a activo</button>'
          : '<span></span>') +
        '<div class="flex gap-3">' +
          '<button onclick="App.cerrarModal()" class="btn-secondary">Cancelar</button>' +
          '<button onclick="App._guardarMuerte(\'' + String(codigo).replace(/'/g, "\\'") + '\')" class="btn-primary px-6 py-2.5 text-sm">' +
            (yaMuerto ? '✓ Guardar cambios' : '<i class="ph ph-cross" aria-hidden="true"></i> Registrar muerte') + '</button>' +
        '</div>' +
      '</div></div>';

    App.abrirModal(html);
    App._calcEdadMuerte(String(nacIso).substring(0, 10));
  },

  _toggleOtraCausa: function() {
    var sel = document.getElementById('mu_causa');
    var grp = document.getElementById('grp_mu_otra');
    if (!grp) return;
    var otra = sel && sel.value === 'Otra';
    grp.classList.toggle('hidden', !otra);
    if (otra) { var i = document.getElementById('mu_otra'); if (i) i.focus(); }
  },

  // Muestra en vivo qué edad tenía el animal en la fecha elegida: es la forma
  // más rápida de detectar que se escribió una fecha equivocada.
  _calcEdadMuerte: function(nacIso) {
    var hint = document.getElementById('mu_edad_hint');
    var f    = (document.getElementById('mu_fecha') || {}).value || '';
    if (!hint) return;
    if (!f || !nacIso) {
      hint.textContent = 'Sin esta fecha no se puede analizar mortalidad por periodo ni por edad.';
      return;
    }
    var d1 = new Date(nacIso), d2 = new Date(f);
    if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return;
    var dias = Math.floor((d2 - d1) / 86400000);
    if (dias < 0) { hint.innerHTML = '<span style="color:var(--danger);font-weight:600">La fecha es anterior al nacimiento/ingreso del animal.</span>'; return; }
    hint.innerHTML = 'Habría vivido <b>' + App._edadLegible(dias) + '</b>' + (dias <= 30 ? ' — se contará como <b>muerte neonatal</b>.' : '.');
  },

  _previewFotoMuerte: function(input) {
    var file = input.files && input.files[0];
    if (!file) return;
    if (!/^image\//.test(file.type)) { App.toast('Selecciona un archivo de imagen.', 'error'); return; }
    var reader = new FileReader();
    reader.onload = function(ev) {
      var img = new Image();
      img.onload = function() {
        var max = 1200, w = img.width, h = img.height;
        if (w > max || h > max) {
          if (w > h) { h = Math.round(h * max / w); w = max; } else { w = Math.round(w * max / h); h = max; }
        }
        var canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        var dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        App.estado._fotoMuerte = { base64: dataUrl.split(',')[1], mimeType: 'image/jpeg' };
        var prev = document.getElementById('mu-foto-preview');
        if (prev) prev.innerHTML = '<img src="' + dataUrl + '" class="w-full h-full object-cover">';
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  },

  _guardarMuerte: function(codigo) {
    var fecha = ((document.getElementById('mu_fecha') || {}).value || '').trim();
    var causa = ((document.getElementById('mu_causa') || {}).value || '').trim();
    var otra  = ((document.getElementById('mu_otra')  || {}).value || '').trim();
    var obs   = ((document.getElementById('mu_obs')   || {}).value || '').trim();

    if (!fecha) { App.toast('La fecha de muerte es obligatoria.', 'error'); return; }
    if (!causa) { App.toast('Selecciona la causa de muerte.', 'error'); return; }
    if (causa === 'Otra' && !otra) { App.toast('Especifica cuál fue la otra causa.', 'error'); return; }

    var payload = { codigo: codigo, fecha_muerte: fecha, causa_muerte: causa,
                    causa_muerte_otra: otra, obs_muerte: obs };

    var _guardar = function() {
      App.api('registrarMuerte', [payload], function(r) {
        if (!r || !r.ok) { App.toast((r && r.error) || 'No se pudo registrar la muerte.', 'error'); return; }
        App.cerrarModal();
        App.toast('Muerte registrada ✓ · el historial de ' + codigo + ' se conserva completo', 'success');
        App.vistaFicha(encodeURIComponent(codigo));
      });
    };

    if (App.estado._fotoMuerte) {
      App.mostrarLoading('Subiendo evidencia…');
      App.api('subirFotoAnimal',
        [{ codigo: codigo + '_muerte', mimeType: App.estado._fotoMuerte.mimeType, base64: App.estado._fotoMuerte.base64 }],
        function(rf) { if (rf && rf.ok && rf.url) payload.foto_muerte_url = rf.url; App.estado._fotoMuerte = null; _guardar(); },
        function()   { App.estado._fotoMuerte = null; _guardar(); });
    } else {
      _guardar();
    }
  },

  revertirMuerte: function(codigo) {
    if (!confirm('¿Devolver a "' + codigo + '" al estado ACTIVO?\n\nSe borrarán la fecha, la causa y las observaciones de la muerte. El resto de su historial no se toca.')) return;
    App.api('revertirMuerte', [codigo], function(r) {
      if (!r || !r.ok) { App.toast((r && r.error) || 'No se pudo revertir.', 'error'); return; }
      App.cerrarModal();
      App.toast(codigo + ' volvió a estado ACTIVO ✓', 'success');
      App.vistaFicha(encodeURIComponent(codigo));
    });
  },

  // ── DESCARTE ─────────────────────────────────────────────────────────────
  abrirModalDescarte: function(codigo) {
    var a = (App.estado.animalActual && App.estado.animalActual.animal.codigo === codigo)
      ? App.estado.animalActual.animal
      : (App.estado.animalesLista.find(function(x){ return x.codigo === codigo; }) || {});
    var estDesc = a.estado_descarte || 'Pendiente';
    var motDesc = a.motivo_descarte || '';
    var obsDesc = a.obs_descarte    || '';
    var subtitulo = codigo + (a.tipo ? ' <span class="text-sm font-normal text-gray-400">· ' + a.tipo + '</span>' : '');
    var motivos = ['Baja condición corporal','No crece','No gana peso','Tamaño inferior al esperado','Bajo rendimiento productivo','Otro'];
    var motOpts = '<option value="">— Sin motivo —</option>' +
      motivos.map(function(m){ return '<option value="' + m + '"' + (motDesc === m ? ' selected' : '') + '>' + m + '</option>'; }).join('');
    var html = '<div class="p-6">' +
      '<div class="flex items-center justify-between mb-5">' +
        '<h2 class="text-lg font-bold"><i class="ph ph-scissors" aria-hidden="true"></i> Descarte — ' + subtitulo + '</h2>' +
        '<button onclick="App.cerrarModal()" class="text-gray-400 hover:text-gray-700 text-2xl leading-none">×</button>' +
      '</div>' +
      '<div class="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 text-xs text-amber-800">' +
        'Marcar un animal para descarte lo agrega al listado de venta con el motivo de salida identificado.' +
      '</div>' +
      '<div class="form-group"><label class="form-label">Estado de descarte</label>' +
        '<select id="desc_estado" class="form-input" onchange="App._toggleDescarteMarcado()">' +
          '<option value="Pendiente"' + (estDesc === 'Pendiente' ? ' selected' : '') + '>Pendiente — en evaluación</option>' +
          '<option value="Marcado para descarte"' + (estDesc === 'Marcado para descarte' ? ' selected' : '') + '>Marcado para descarte</option>' +
        '</select>' +
      '</div>' +
      '<div id="grp_desc_motivo"' + (estDesc !== 'Marcado para descarte' ? ' class="hidden"' : '') + '>' +
        '<div class="form-group"><label class="form-label">Motivo del descarte</label>' +
          '<select id="desc_motivo" class="form-input">' + motOpts + '</select>' +
        '</div>' +
      '</div>' +
      '<div class="form-group"><label class="form-label">Observación</label>' +
        '<textarea id="desc_obs" rows="3" class="form-input" placeholder="Condición corporal, historial de tratamientos, criterio de salida…">' + obsDesc + '</textarea>' +
      '</div>' +
      '<div class="flex justify-end gap-3 mt-5">' +
        '<button onclick="App.cerrarModal()" class="btn-secondary">Cancelar</button>' +
        '<button onclick="App._guardarDescarte(\'' + String(codigo).replace(/'/g, "\\'") + '\')" class="btn-primary px-7 py-2.5 text-sm">Guardar</button>' +
      '</div>' +
    '</div>';
    App.abrirModal(html);
  },

  _toggleDescarteMarcado: function() {
    var sel = document.getElementById('desc_estado');
    var grp = document.getElementById('grp_desc_motivo');
    if (grp) grp.classList.toggle('hidden', !sel || sel.value !== 'Marcado para descarte');
  },

  _guardarDescarte: function(codigo) {
    var estado = ((document.getElementById('desc_estado') || {}).value || 'Pendiente');
    var motivo = ((document.getElementById('desc_motivo') || {}).value || '');
    var obs    = ((document.getElementById('desc_obs')    || {}).value || '');
    var payload = {
      codigo:          codigo,
      estado_descarte: estado,
      motivo_descarte: estado === 'Marcado para descarte' ? motivo : '',
      obs_descarte:    obs,
      fecha_descarte:  estado === 'Marcado para descarte' ? App._hoyISO() : ''
    };
    App.api('saveAnimal', [payload], function(r) {
      if (!r.ok) { App.toast(r.error || 'Error al guardar descarte', 'error'); return; }
      App.toast(estado === 'Marcado para descarte' ? 'Animal marcado para descarte ✓' : 'Descarte actualizado ✓', 'success');
      App.cerrarModal();
      App.vistaFicha(encodeURIComponent(codigo));
    });
  },

  // ── REGISTRO UNIFICADO ───────────────────────────────────────────────────
  // Permite registrar pesaje, vitaminización, vacunas y purgas en un solo formulario.
  abrirModalRegistro: function(codigo) {
    if (!codigo) {
      App.estado._cbSelector = function(c) { App.abrirModalRegistro(c); };
      App._mostrarSelectorAnimal('<i class="ph ph-clipboard-text" aria-hidden="true"></i> Registro — selecciona el animal');
      return;
    }

    App.api('getAnimal', [codigo], function(data) {
      if (!data) { App.toast('Animal no encontrado', 'error'); return; }
      var a   = data.animal;
      var ser = data.serie;
      var meds = data.mediciones;

      // Historial reciente (últimas 3 mediciones)
      var historial = '';
      var ultimas = meds.slice(-3).reverse();
      if (ultimas.length > 0) {
        historial = '<div class="bg-gray-50 rounded-lg p-3 mb-4 text-xs">' +
          '<span class="font-semibold text-gray-600">Mediciones recientes:</span> ';
        historial += ultimas.map(function(m) {
          return '<span class="ml-3">' + App.fmtFecha(m.fecha) + ': <b>' + App.fmt(m.peso, 1) + ' kg</b>' +
            (m.gdp ? ' (GDP ' + App.fmt(m.gdp, 3) + ')' : '') + '</span>';
        }).join('');
        historial += '</div>';
      }

      var html = '<div class="p-6 max-h-screen overflow-y-auto">' +
        '<div class="flex items-center justify-between mb-4">' +
          '<h2 class="text-lg font-bold"><i class="ph ph-clipboard-text" aria-hidden="true"></i> Registro — <span class="text-green-700">' + a.codigo + '</span></h2>' +
          '<button onclick="App.cerrarModal()" class="text-gray-400 hover:text-gray-700 text-2xl leading-none">×</button>' +
        '</div>' +
        '<div class="text-sm text-gray-500 mb-3">' + (a.tipo || '') + ' · ' + (a.predio || '') + (a.propietario ? ' · ' + a.propietario : '') + '</div>' +
        historial +
        '<div class="form-group"><label class="form-label">Fecha *</label>' +
          '<input type="date" id="reg_fecha" value="' + App._hoyISO() + '" class="form-input w-48" ' +
            'onchange="App._procRefrescarFechas(\'reg\')"></div>' +

        // Sección pesaje
        '<div class="border border-gray-200 rounded-lg p-4 mb-4">' +
          '<label class="flex items-center gap-2 cursor-pointer mb-3">' +
            '<input type="checkbox" id="chk_pesaje" onchange="App._toggleRegSec(\'sec_pesaje\')" class="w-4 h-4 rounded text-green-700">' +
            '<span class="font-semibold text-gray-700"><i class="ph ph-scales" aria-hidden="true"></i> Pesaje</span>' +
          '</label>' +
          '<div id="sec_pesaje" class="hidden pl-2">' +
            '<div class="form-group"><label class="form-label">Peso (kg) *</label>' +
              App._numInput('reg_peso', { clase:'w-40', placeholder:'Ej: 285,5' }) + '</div>' +
            '<div class="form-group mb-0"><label class="form-label">Observación del pesaje</label>' +
              '<input type="text" id="reg_obs_peso" class="form-input" placeholder="Opcional — cómo se vio el animal en la báscula"></div>' +
          '</div>' +
        '</div>' +

        // Sección procedimientos
        '<div class="border border-gray-200 rounded-lg p-4 mb-4">' +
          '<p class="font-semibold text-gray-700 mb-3"><i class="ph ph-syringe" aria-hidden="true"></i> Procedimientos realizados</p>' +
          '<div class="grid grid-cols-2 sm:grid-cols-3 gap-2">' + App._sanCheckboxes('proc-check', 'reg') +
            '<label class="proc-checkbox-label"><input type="checkbox" id="proc_pal" class="proc-check w-4 h-4 accent-green-700" value="PALPACIÓN VETERINARIA" data-tipo="PALPACIÓN VETERINARIA"><span><span class="san-ico"><i class="ph ph-stethoscope" aria-hidden="true"></i></span> Palpación Vet.</span></label>' +
          '</div>' +
          App._procDetalles('reg', 'reg_fecha') +
        '</div>' +

        // Resultado palpación (visible solo cuando proc_pal está marcado)
        '<div id="sec_reg_palpacion" class="hidden bg-blue-50 border border-blue-200 rounded-xl p-4 mb-2">' +
          '<div class="text-xs font-semibold text-blue-700 mb-3"><i class="ph ph-stethoscope" aria-hidden="true"></i> Resultado de la palpación veterinaria</div>' +
          '<div class="space-y-3">' +
            '<div class="grid grid-cols-2 gap-4">' +
              '<div class="form-group mb-0">' +
                '<label class="form-label" style="display:flex;align-items:center;gap:6px">Estado reproductivo' +
                  '<span style="position:relative;display:inline-flex">' +
                    '<button type="button" style="cursor:help;color:var(--info);font-size:10px;font-weight:700;border:1px solid color-mix(in oklch,var(--info) 45%,transparent);border-radius:50%;width:15px;height:15px;display:inline-flex;align-items:center;justify-content:center;background:var(--info-soft);padding:0;line-height:1" ' +
                      'onmouseenter="document.getElementById(\'_tip_est\').style.display=\'block\'" ' +
                      'onmouseleave="document.getElementById(\'_tip_est\').style.display=\'none\'">?</button>' +
                    '<div id="_tip_est" style="display:none;position:absolute;bottom:calc(100% + 6px);left:-8px;width:260px;background:var(--surface);color:var(--ink-2);font-size:11px;border-radius:10px;padding:12px 14px;z-index:500;border:1px solid var(--border-2);box-shadow:var(--shadow-lg);line-height:1.65;pointer-events:none">' +
                      '<b style="color:var(--accent);display:block;margin-bottom:7px">Estados reproductivos</b>' +
                      '<div style="margin-bottom:4px"><b style="color:var(--ok)"><i class="ph ph-baby" aria-hidden="true"></i> Preñada</b> — En gestación confirmada. Se habilita el campo de meses.</div>' +
                      '<div style="margin-bottom:4px"><b style="color:var(--muted)">○ No preñada</b> — No está gestando en el momento del diagnóstico.</div>' +
                      '<div style="margin-bottom:4px"><b style="color:var(--warn)"><i class="ph ph-question" aria-hidden="true"></i> Dudosa</b> — Diagnóstico no concluyente; se recomienda repetir la palpación.</div>' +
                      '<div><b style="color:var(--c-amber)"><i class="ph ph-fire" aria-hidden="true"></i> En celo</b> — Apta para servicio o inseminación artificial.</div>' +
                    '</div>' +
                  '</span>' +
                '</label>' +
                '<select id="reg_pal_est_repr" class="form-input" onchange="App._toggleMesesGestacion(\'reg_pal_est_repr\',\'grp_reg_pal_meses\')">' +
                  '<option value="">— Seleccionar —</option>' +
                  '<option value="Preñada" title="Animal en gestación confirmada. Habilita el campo de meses.">Preñada</option>' +
                  '<option value="No preñada" title="El animal no está gestando al momento del diagnóstico.">No preñada</option>' +
                  '<option value="Dudosa" title="Diagnóstico no concluyente. Se recomienda repetir la palpación.">Dudosa</option>' +
                  '<option value="En celo" title="Muestra signos de celo, apto para servicio o inseminación artificial.">En celo</option>' +
                '</select></div>' +
              '<div id="grp_reg_pal_meses" class="form-group mb-0 hidden">' +
                '<label class="form-label">Meses de gestación</label>' +
                '<input type="number" id="reg_pal_meses" min="1" max="9" class="form-input" placeholder="1 – 9 meses"></div>' +
            '</div>' +
            '<div class="form-group mb-0">' +
              '<label class="form-label" style="display:flex;align-items:center;gap:6px">Desarrollo ovárico / estado fisiológico' +
                '<span style="position:relative;display:inline-flex">' +
                  '<button type="button" style="cursor:help;color:var(--info);font-size:10px;font-weight:700;border:1px solid color-mix(in oklch,var(--info) 45%,transparent);border-radius:50%;width:15px;height:15px;display:inline-flex;align-items:center;justify-content:center;background:var(--info-soft);padding:0;line-height:1" ' +
                    'onmouseenter="document.getElementById(\'_tip_des\').style.display=\'block\'" ' +
                    'onmouseleave="document.getElementById(\'_tip_des\').style.display=\'none\'">?</button>' +
                  '<div id="_tip_des" style="display:none;position:absolute;bottom:calc(100% + 6px);left:-8px;width:290px;background:var(--surface);color:var(--ink-2);font-size:11px;border-radius:10px;padding:12px 14px;z-index:500;border:1px solid var(--border-2);box-shadow:var(--shadow-lg);line-height:1.65;pointer-events:none">' +
                    '<b style="color:var(--accent);display:block;margin-bottom:7px">Desarrollo ovárico</b>' +
                    '<div style="margin-bottom:4px"><b style="color:var(--c-violet)">Infantil</b> — Sin madurez reproductiva; ovarios con poca o ninguna actividad.</div>' +
                    '<div style="margin-bottom:4px"><b style="color:var(--c-blue)">Folículo presente</b> — Folículos en desarrollo; el ovario está activo.</div>' +
                    '<div style="margin-bottom:4px"><b style="color:var(--c-cyan)">Folículo dominante</b> — Folículo grande, próximo al celo o a la ovulación.</div>' +
                    '<div style="margin-bottom:4px"><b style="color:var(--c-blue)">Cuerpo lúteo</b> — Vaca ciclando con capacidad reproductiva.</div>' +
                    '<div><b style="color:var(--c-violet)">Folículos + CL</b> — Actividad ovárica normal del ciclo reproductivo.</div>' +
                  '</div>' +
                '</span>' +
              '</label>' +
              '<select id="reg_pal_des_ovar" class="form-input">' +
                '<option value="">— Seleccionar —</option>' +
                '<option value="Infantil (anestro prepuberal)" title="No ha alcanzado madurez reproductiva; poca o ninguna actividad ovárica.">Infantil (anestro prepuberal)</option>' +
                '<option value="Folículo presente" title="Folículos en desarrollo; el ovario está activo.">Folículo presente</option>' +
                '<option value="Folículo dominante" title="Folículo grande, próximo al celo o a la ovulación.">Folículo dominante</option>' +
                '<option value="Cuerpo lúteo" title="La vaca está ciclando con capacidad reproductiva.">Cuerpo lúteo</option>' +
                '<option value="Folículos + cuerpo lúteo" title="Actividad ovárica normal dentro del ciclo reproductivo.">Folículos + cuerpo lúteo</option>' +
              '</select></div>' +
            '<div class="form-group mb-0"><label class="form-label">Observación veterinaria</label>' +
              '<input type="text" id="reg_pal_diag" class="form-input" placeholder="Notas adicionales del veterinario"></div>' +
          '</div>' +
        '</div>' +

        // El responsable sí es uno solo para toda la jornada. El medicamento ya
        // no: vive dentro de cada procedimiento, que es donde de verdad aplica.
        '<div class="form-group"><label class="form-label">Responsable de la jornada</label>' +
          '<input type="text" id="reg_resp" class="form-input w-64" placeholder="Nombre"></div>' +
        '<div class="form-group"><label class="form-label">Observación general <span class="text-green-600 font-normal text-xs">(puede guardar solo esto, sin pesaje ni procedimiento)</span></label>' +
          '<textarea id="reg_obs" rows="2" class="form-input" placeholder="Estado del animal, comportamiento, condición corporal…"></textarea></div>' +

        '<div class="flex justify-between items-center mt-4">' +
          '<button onclick="App.abrirModalRegistro()" class="text-sm text-gray-400 hover:text-gray-700">← Cambiar animal</button>' +
          '<div class="flex gap-3">' +
            '<button onclick="App.cerrarModal()" class="btn-secondary">Cancelar</button>' +
            '<button onclick="App._guardarRegistro(\'' + String(a.codigo).replace(/'/g, "\\'") + '\')" class="btn-primary px-6 py-2 text-sm">Guardar registro</button>' +
          '</div>' +
        '</div>' +
      '</div>';
      App.abrirModal(html);
      // Escuchar el checkbox de palpación para mostrar/ocultar sección
      setTimeout(function() {
        var palChk = document.getElementById('proc_pal');
        if (palChk) palChk.addEventListener('change', function() {
          var sec = document.getElementById('sec_reg_palpacion');
          if (sec) sec.classList.toggle('hidden', !palChk.checked);
        });
      }, 120);
    });
  },

  _toggleRegSec: function(secId) {
    var sec = document.getElementById(secId);
    if (sec) sec.classList.toggle('hidden');
  },

  _guardarRegistro: function(codigo) {
    var fecha   = (document.getElementById('reg_fecha') || {}).value || '';
    var peso    = App._leerNum('reg_peso');
    var resp    = (document.getElementById('reg_resp') || {}).value || '';
    var obs     = ((document.getElementById('reg_obs')      || {}).value || '').trim();
    var obsPeso = ((document.getElementById('reg_obs_peso') || {}).value || '').trim();
    var pesaje  = (document.getElementById('chk_pesaje') || {}).checked;

    // Detalle por procedimiento (medicamento, dosis, refuerzo y observación propios).
    // La palpación no está en SAN_TIPOS: es una casilla aparte con su propio bloque.
    var detalle = {};
    App._procLeer('reg').forEach(function(pr){ detalle[pr.tipo] = pr; });
    var procs = [];
    document.querySelectorAll('.proc-check:checked').forEach(function(cb) {
      procs.push(cb.dataset.tipo);
    });

    // Palpación: capturar todos los campos estructurados
    var palEstRepr = ((document.getElementById('reg_pal_est_repr') || {}).value || '').trim();
    var palDesOvar = ((document.getElementById('reg_pal_des_ovar') || {}).value || '').trim();
    var palMeses   = ((document.getElementById('reg_pal_meses')    || {}).value || '').trim();
    var palDiag    = ((document.getElementById('reg_pal_diag')     || {}).value || '').trim();
    var tienePal = procs.indexOf('PALPACIÓN VETERINARIA') >= 0;

    if (!fecha) { App.toast('La fecha es obligatoria.', 'error'); return; }
    if (pesaje && (isNaN(peso) || peso <= 0)) {
      // Se marca el campo en vez de un toast que se va solo: la persona que
      // pesa está de pie en el corral y no alcanza a leerlo.
      App._marcarCampo('reg_peso', 'Escribe el peso, por ejemplo 285,5 o 285.5');
      return;
    }
    if (!pesaje && procs.length === 0) {
      if (!obs.trim()) { App.toast('Ingresa un pesaje, un procedimiento o al menos una observación.', 'error'); return; }
      procs.push('REVISIÓN'); // observación sola → guardar como evento REVISIÓN
    }

    var llamadas = [];
    if (pesaje) {
      // El pesaje lleva SU observación. Antes se le metía la lista de
      // procedimientos del día, que no dice nada sobre el peso.
      llamadas.push({ fn: 'saveMedicion', args: [{ codigo: codigo, fecha: fecha, peso: peso,
        observacion: App._uniqJoin([obsPeso, obs], ' | ') }] });
    }
    procs.forEach(function(tipo) {
      var d = detalle[tipo] || {};
      var obsEv, estReprEv = '', desOvarEv = '';
      if (tipo === 'PALPACIÓN VETERINARIA') {
        var pp = [];
        if (palEstRepr) pp.push(palEstRepr);
        if (palMeses)   pp.push('Gestación: ' + palMeses + ' meses');
        if (palDesOvar) pp.push(palDesOvar);
        if (palDiag)    pp.push(palDiag);
        if (obs)        pp.push(obs);
        obsEv = pp.join(' | ');
        estReprEv = palEstRepr;
        desOvarEv = palDesOvar;
      } else {
        obsEv = App._uniqJoin([d.observacion, obs], ' | ');
      }
      llamadas.push({ fn: 'saveEventoSanitario', args: [{ codigo: codigo, fecha: fecha, tipo: tipo,
        medicamento: d.medicamento || '', dosis: d.dosis || '',
        responsable: resp, observacion: obsEv,
        proxima_fecha:        d.proxima_fecha        || '',
        requiere_seguimiento: d.requiere_seguimiento || 'no',
        estado_reproductivo: estReprEv, desarrollo_ovarico: desOvarEv }] });
    });
    // Si hay palpación, actualizar estado reproductivo y meses en el animal
    if (tienePal && (palEstRepr || palMeses)) {
      var animalUpd = { codigo: codigo };
      if (palEstRepr) animalUpd.estado_reproductivo = palEstRepr;
      if (palDesOvar) animalUpd.desarrollo_ovarico  = palDesOvar;
      if (palEstRepr === 'Preñada' && palMeses) animalUpd.meses = palMeses;
      else if (palEstRepr && palEstRepr !== 'Preñada') animalUpd.meses = '0';
      llamadas.push({ fn: 'saveAnimal', args: [animalUpd] });
    }

    // Ejecutar llamadas en cadena
    var idx = 0;
    var errores = [];
    function siguiente() {
      if (idx >= llamadas.length) {
        App.cerrarModal();
        if (errores.length) App.toast('Parcialmente guardado (' + errores.join(', ') + ')', 'error');
        else App.toast('Registro guardado ✓ (' + llamadas.length + ' evento' + (llamadas.length > 1 ? 's' : '') + ')', 'success');
        App.irAnimal(codigo);
        return;
      }
      var ll = llamadas[idx++];
      App.api(ll.fn, ll.args, function(r) {
        if (!r.ok) errores.push(ll.fn);
        siguiente();
      }, function() { errores.push(ll.fn); siguiente(); });
    }
    App.mostrarLoading('Guardando registro…');
    siguiente();
  },

  // ── CAMBIAR CÓDIGO DE ANIMAL ─────────────────────────────────────────────
  abrirModalCambiarCodigo: function(codigoActual) {
    var html = '<div class="p-6">' +
      '<div class="flex items-center justify-between mb-5">' +
        '<h2 class="text-lg font-bold text-orange-700"><i class="ph ph-warning" aria-hidden="true"></i> Cambiar código de animal</h2>' +
        '<button onclick="App.cerrarModal()" class="text-gray-400 hover:text-gray-700 text-2xl leading-none">×</button>' +
      '</div>' +
      '<div class="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-4 text-sm text-orange-800">' +
        'Esta acción actualiza el código en <strong>todos los registros</strong> relacionados (mediciones, ventas, sanidad). ' +
        'El sistema conserva la trazabilidad completa.' +
      '</div>' +
      '<div class="form-group"><label class="form-label">Código actual</label>' +
        '<input type="text" value="' + codigoActual + '" readonly class="form-input bg-gray-100"></div>' +
      '<div class="form-group"><label class="form-label">Nuevo código *</label>' +
        '<input type="text" id="cc_nuevo" class="form-input" placeholder="Ej: R12" autofocus></div>' +
      '<div class="flex justify-end gap-3 mt-4">' +
        '<button onclick="App.cerrarModal()" class="btn-secondary">Cancelar</button>' +
        '<button onclick="App._ejecutarCambioCodigo(\'' + String(codigoActual).replace(/'/g, "\\'") + '\')" class="bg-orange-600 text-white rounded-lg px-6 py-2 text-sm font-medium hover:bg-orange-700">Cambiar código</button>' +
      '</div>' +
    '</div>';
    App.abrirModal(html);
    setTimeout(function() { var el=document.getElementById('cc_nuevo'); if(el) el.focus(); }, 80);
  },

  _ejecutarCambioCodigo: function(codigoActual) {
    var nuevo = ((document.getElementById('cc_nuevo') || {}).value || '').trim();
    if (!nuevo) { App.toast('Ingresa el nuevo código.', 'error'); return; }
    if (!confirm('¿Cambiar el código "' + codigoActual + '" → "' + nuevo.toUpperCase() + '"?\n\nSe actualizarán todos los registros relacionados.')) return;
    App.api('cambiarCodigo', [codigoActual, nuevo], function(r) {
      if (!r.ok) { App.toast(r.error, 'error'); return; }
      App.toast('Código cambiado: ' + r.codigoAnterior + ' → ' + r.codigoNuevo + ' ✓', 'success');
      App.cerrarModal();
      App.irAnimal(r.codigoNuevo);
    });
  },

  // ── FINANZAS (protegidas con PIN) ────────────────────────────────────────
  // Lo que se guarda en sessionStorage es lo que el usuario tecleó, para no
  // volver a pedírselo en cada pantalla. NO es una llave: quien se invente uno
  // no pasa del servidor, que es donde se comprueba de verdad.
  _pinFin: function() {
    return sessionStorage.getItem('sga_pin') || '';
  },

  vistaFinanzas: function() {
    if (!App._pinFin()) { App._pantallaPin(''); return; }
    App._renderFinanzas();
  },

  // El aviso es lo que devolvió el servidor: "PIN incorrecto", o que quedó
  // cerrada un rato por demasiados intentos. Se dice en la misma pantalla y se
  // queda ahí — un toast de tres segundos no lo alcanza a leer.
  _pantallaPin: function(aviso) {
    App.renderMain(
      App._subtabs('salida', '#/finanzas') +
      '<div class="flex flex-col items-center justify-center py-20">' +
        '<div class="bg-white rounded-xl border border-gray-200 p-8 max-w-sm w-full text-center">' +
          '<div class="text-4xl mb-4"><i class="ph ph-lock" aria-hidden="true"></i></div>' +
          '<h2 class="text-xl font-bold text-gray-800 mb-2">Sección financiera</h2>' +
          '<p class="text-sm text-gray-500 mb-6">Ingresa el PIN para acceder a los datos financieros</p>' +
          '<input type="password" id="pin-input" maxlength="12" placeholder="••••" ' +
            'class="form-input text-center text-xl tracking-widest mb-3" ' +
            'onkeydown="if(event.key===\'Enter\') App._verificarPin()">' +
          (aviso ? '<div class="pin-aviso">' + aviso + '</div>' : '') +
          '<button onclick="App._verificarPin()" class="btn-primary w-full py-2.5">Entrar</button>' +
        '</div>' +
      '</div>'
    );
    setTimeout(function() { var el=document.getElementById('pin-input'); if(el) el.focus(); }, 100);
  },

  _verificarPin: function() {
    var pin = (document.getElementById('pin-input') || {}).value || '';
    if (!pin) { App._pantallaPin('Escribe el PIN.'); return; }
    // Aquí ya no hay nada que comparar: la respuesta la da el servidor.
    App.api('verificarPinFinanzas', [{ pin: pin }], function(r) {
      if (r && r.ok) {
        sessionStorage.setItem('sga_pin', pin);
        App._renderFinanzas();
      } else {
        sessionStorage.removeItem('sga_pin');
        App._pantallaPin((r && r.error) || 'PIN incorrecto');
      }
    });
  },

  // ── Costo operativo estimado (% de la utilidad bruta) ────────────────────
  // El sistema conoce el costo del animal y su venta, pero no los costos de
  // operación (alimentación, sanidad, mano de obra). Este porcentaje lo pone el
  // usuario y alimenta todas las cifras "netas". Se guarda en el navegador.
  _costoPct: function() {
    var v = parseFloat(localStorage.getItem('ganax_costo_pct'));
    return isNaN(v) ? 25 : Math.min(90, Math.max(0, v));
  },
  _setCostoPct: function(val) {
    var n = parseFloat(val);
    if (isNaN(n)) return;
    localStorage.setItem('ganax_costo_pct', Math.min(90, Math.max(0, n)));
    App._pintarFinanzas();
  },

  _renderFinanzas: function() {
    App.renderMain('<div class="flex justify-center py-16"><div class="spinner w-8 h-8" style="color:var(--accent)"></div></div>');
    // Dos fuentes: getFinanzasCompleto (compras y ventas) + el resumen del
    // dashboard (peso actual de cada animal) para valorizar el hato vivo.
    App.api('getFinanzasCompleto', [{ pin: App._pinFin() }], function(data) {
      App.api('getDashboardFull', [{}], function(dash) {
        App.estado._fin = { data: data, resumen: (dash && dash.dashboard ? dash.dashboard.tablaResumen : []) };
        App._pintarFinanzas();
      }, function() {
        App.estado._fin = { data: data, resumen: [] };
        App._pintarFinanzas();
      });
    }, function(e) {
      // El PIN guardado dejó de servir: lo cambiaron en el servidor, o la
      // sesión venía de antes de esta fase. Se vuelve a pedir, sin pantalla
      // roja de por medio.
      sessionStorage.removeItem('sga_pin');
      App._pantallaPin((e && e.message) || 'Vuelve a escribir el PIN.');
    }, { silencioso: true });
  },

  // Recalcula y repinta toda la vista financiera con el % de costos vigente.
  _pintarFinanzas: function() {
    var fin = App.estado._fin;
    if (!fin) return;
    var activos  = fin.data.activos || [];
    var ventas   = fin.data.ventas  || [];
    var costoPct = App._costoPct();
    var fmt = App.fmt, COP = App.fmtCOP, COPk = App.fmtCOPk, PCT = App.fmtPct;

    // Peso actual por animal (del dashboard) para valorizar el inventario vivo
    var pesoDe = {};
    (fin.resumen || []).forEach(function(a) { pesoDe[a.codigo] = parseFloat(a.pesoActual); });

    // ── Análisis de cada venta ────────────────────────────────────────────
    // El costo YA NO se reconstruye restando (compra = venta − utilidad). Antes se
    // hacía así, y por eso una corrección del precio en la ficha del animal nunca
    // llegaba aquí: la venta conservaba una utilidad congelada y el costo derivado
    // contradecía la base de datos. Ahora el backend manda `precio_compra` resuelto
    // contra la hoja de animales y la utilidad ya recalculada.
    var V = ventas.map(function(v) {
      var venta  = parseFloat(v.precio_salida) || 0;
      var compra = parseFloat(v.precio_compra);
      var util   = parseFloat(v.utilidad);
      var dias   = parseInt(v.dias_en_predio, 10);
      if (isNaN(compra)) compra = 0;
      var ok     = venta > 0 && compra > 0 && !isNaN(util);
      var roi    = ok ? (util / compra * 100) : null;
      return {
        codigo:  v.codigo,
        fecha:   v.fecha_venta,
        mes:     String(v.fecha_venta || '').substring(0, 7),
        venta:   venta,
        compra:  compra,
        util:    isNaN(util) ? 0 : util,
        dias:    (isNaN(dias) || dias <= 0) ? null : dias,
        peso:    parseFloat(v.peso_salida) || 0,
        precioKg: parseFloat(v.precio_kg) || 0,
        roi:     roi,
        roiMes:  (roi !== null && !isNaN(dias) && dias > 0) ? (roi / dias * 30) : null,
        utilDia: (ok && !isNaN(dias) && dias > 0) ? (util / dias) : null,
        margen:  ok ? (util / venta * 100) : null
      };
    });
    var conRoi  = V.filter(function(x){ return x.roi    !== null; });
    var conDias = V.filter(function(x){ return x.roiMes !== null; });

    function media(arr, key) {
      if (!arr.length) return null;
      return arr.reduce(function(s, x){ return s + x[key]; }, 0) / arr.length;
    }
    function suma(arr, key) { return arr.reduce(function(s, x){ return s + (x[key] || 0); }, 0); }

    // ── Indicadores de rentabilidad ───────────────────────────────────────
    var roiMedio    = media(conRoi, 'roi');     // tasa de rendimiento media por animal
    var margenMedio = media(conRoi, 'margen');  // rentabilidad sobre el precio de venta
    var diasTot     = conDias.reduce(function(s,x){ return s + x.dias; }, 0);
    var diasProm    = conDias.length ? (diasTot / conDias.length) : null;

    // Retorno mensual y utilidad/día se miden SOBRE EL CONJUNTO, no promediando
    // porcentajes: una venta con pocos días y pérdida casi total dispara su propio
    // porcentaje mensual y arrastraría la media a negativo aunque el negocio global
    // sea rentable. Aquí el peso de cada animal es su capital × el tiempo que ocupó.
    var capDias     = conDias.reduce(function(s,x){ return s + x.compra * x.dias; }, 0);
    var utilConDias = conDias.reduce(function(s,x){ return s + x.util; }, 0);
    var roiMesMedio = capDias > 0 ? (utilConDias / capDias * 30 * 100) : null;
    var utilDiaProm = diasTot > 0 ? (utilConDias / diasTot) : null;

    // Ventas con pérdida casi total: casi siempre es un precio de venta mal
    // registrado (por ejemplo el valor por kilo en vez del total), no una pérdida real.
    var extremos = conRoi.filter(function(x){ return x.roi <= -90; });

    var invVendidos = suma(conRoi, 'compra');
    var utilVend    = suma(conRoi, 'util');
    var ingresos    = suma(V,      'venta');
    var roiGlobal   = invVendidos > 0 ? (utilVend / invVendidos * 100) : null;   // ponderado por capital
    var utilNeta    = utilVend * (1 - costoPct / 100);
    var roiNeto     = invVendidos > 0 ? (utilNeta / invVendidos * 100) : null;

    // Precio por kilo promedio de venta (ponderado) — base para valorizar el hato
    var kgVend       = suma(conRoi, 'peso');
    var precioKgProm = kgVend > 0 ? (suma(conRoi, 'venta') / kgVend) : null;

    // ── Inventario activo ─────────────────────────────────────────────────
    var invActiva = 0, kgActivos = 0, sinPeso = 0;
    activos.forEach(function(a) {
      invActiva += parseFloat(a.precio_compra) || 0;
      var p = pesoDe[a.codigo];
      if (isNaN(p) || !p) p = parseFloat(a.peso_inicial);
      if (!isNaN(p) && p > 0) kgActivos += p; else sinPeso++;
    });
    var valorHato   = (precioKgProm !== null) ? kgActivos * precioKgProm : null;
    var utilLatente = (valorHato !== null) ? (valorHato - invActiva) : null;
    var roiLatente  = (utilLatente !== null && invActiva > 0) ? (utilLatente / invActiva * 100) : null;

    var claseUtil = function(n) { return n >= 0 ? 'style="color:var(--ok)"' : 'style="color:var(--danger)"'; };

    // ══════════════════ HTML ══════════════════
    var html = '<div class="dx-wrap">';
    html += App._subtabs('salida', '#/finanzas');

    // Encabezado
    html += '<div class="dx-head">' +
      '<div><h2 class="dx-title">Análisis financiero del hato</h2>' +
        '<div class="dx-sub"><b>' + conRoi.length + ' venta' + (conRoi.length !== 1 ? 's' : '') + ' analizada' + (conRoi.length !== 1 ? 's' : '') + '</b>' +
        (diasProm !== null ? ' · permanencia promedio de ' + fmt(diasProm, 0) + ' días' : '') + '</div></div>' +
      '<button onclick="sessionStorage.removeItem(\'sga_pin\'); App.vistaDashboard()" class="btn-secondary text-sm">' +
        '<i class="ph ph-lock-simple"></i> Bloquear sesión</button>' +
    '</div>';

    // ── KPIs ──
    html += '<div class="dx-kpis k6">' +
      App._kpiTile('blue', 'wallet', COPk(invActiva), 'Capital invertido',
        activos.length + ' animales en el hato') +
      App._kpiTile('cyan', 'hand-coins', COPk(ingresos), 'Ingresos por ventas',
        V.length + ' animal' + (V.length !== 1 ? 'es' : '') + ' vendido' + (V.length !== 1 ? 's' : '')) +
      App._kpiTile('green', 'trend-up', COPk(utilVend), 'Utilidad bruta',
        'Neta est. ' + COPk(utilNeta) + ' (−' + fmt(costoPct, 0) + '% costos)') +
      App._kpiTile('amber', 'percent', PCT(roiMedio), 'Rentabilidad media',
        'Por animal · global ' + PCT(roiGlobal)) +
      App._kpiTile('violet', 'calendar-check', (roiMesMedio !== null ? PCT(roiMesMedio) + ' <small>/mes</small>' : '—'), 'Retorno mensual',
        (diasProm !== null ? 'Sobre el capital y ' + fmt(diasProm, 0) + ' días promedio' : 'Sin días registrados')) +
      App._kpiTile('rose', 'coins', (utilDiaProm !== null ? COP(Math.round(utilDiaProm)) + ' <small>/día</small>' : '—'), 'Utilidad por día',
        'Del conjunto, por día de tenencia') +
    '</div>';

    // ── Panel: cómo leer + control de costos ──
    html += '<div class="dx-split">' +
      '<div class="dx-panel"><div class="dx-phead">' +
        '<span class="dx-secico" style="--sc:var(--c-amber)"><i class="ph ph-sliders-horizontal"></i></span>' +
        '<div class="dx-ptitles"><div class="dx-ptitle">Costos de operación</div>' +
        '<div class="dx-psub">El sistema conoce la compra y la venta, pero no lo que cuesta mantener el animal.</div></div></div>' +
        '<label class="form-label">Costo operativo estimado (% de la utilidad bruta)</label>' +
        '<div class="flex items-center gap-3">' +
          '<input type="number" id="fin-costo" min="0" max="90" step="1" value="' + fmt(costoPct, 0) + '" ' +
            'class="form-input" style="width:110px;font-weight:700" onchange="App._setCostoPct(this.value)"> ' +
          '<span style="font-size:.85rem;color:var(--muted)">Alimentación, sanidad y mano de obra</span>' +
        '</div>' +
        '<div class="dx-ins" style="margin-top:14px">' +
          '<div class="dx-irow" style="--ic:var(--ok)"><i class="ph ph-equals"></i><span>Utilidad neta estimada: <b>' + COP(Math.round(utilNeta)) + '</b>' + (roiNeto !== null ? ' · rentabilidad neta <b>' + PCT(roiNeto) + '</b>' : '') + '</span></div>' +
          (extremos.length
            ? '<div class="dx-irow" style="--ic:var(--danger)"><i class="ph ph-warning-octagon"></i><span><b>' + extremos.length + ' venta' + (extremos.length !== 1 ? 's' : '') + '</b> aparece' + (extremos.length !== 1 ? 'n' : '') + ' con pérdida casi total (' + extremos.slice(0,6).map(function(x){ return x.codigo; }).join(', ') + (extremos.length > 6 ? '…' : '') + '). Suele ser un <b>precio de venta mal registrado</b> — revísalo, porque distorsiona todos los promedios.</span></div>'
            : '') +
          '<div class="dx-irow" style="--ic:var(--muted)"><i class="ph ph-info"></i><span>Cuando tengas el costo real por animal/día lo cambiamos por ese cálculo, que es más preciso.</span></div>' +
        '</div></div>' +
      '<div class="dx-panel"><div class="dx-phead">' +
        '<span class="dx-secico" style="--sc:var(--c-blue)"><i class="ph ph-book-open-text"></i></span>' +
        '<div class="dx-ptitles"><div class="dx-ptitle">Qué significa cada número</div>' +
        '<div class="dx-psub">En palabras simples, para leer la tabla sin dudas.</div></div></div>' +
        '<div class="dx-ins">' +
          '<div class="dx-irow" style="--ic:var(--c-amber)"><i class="ph ph-percent"></i><span><b>Rentabilidad (ROI)</b> — por cada $100 invertidos en el animal, cuántos volvieron como ganancia. <i>Utilidad ÷ precio de compra.</i></span></div>' +
          '<div class="dx-irow" style="--ic:var(--c-violet)"><i class="ph ph-calendar-check"></i><span><b>Retorno mensual</b> — esa misma rentabilidad repartida en los meses que el animal estuvo en la finca. Permite comparar un animal de 6 meses con uno de 2 años.</span></div>' +
          '<div class="dx-irow" style="--ic:var(--c-rose)"><i class="ph ph-coins"></i><span><b>Utilidad por día</b> — cuántos pesos dejó cada día de tenencia. Sirve para decidir si conviene sostener o vender.</span></div>' +
          '<div class="dx-irow" style="--ic:var(--c-cyan)"><i class="ph ph-scales"></i><span><b>Margen</b> — qué parte del precio de venta fue ganancia. <i>Utilidad ÷ precio de venta.</i></span></div>' +
        '</div></div>' +
    '</div>';

    if (conRoi.length === 0) {
      html += '<div class="dx-panel" style="text-align:center;padding:48px 22px">' +
        '<div style="font-size:2.6rem;margin-bottom:10px"><i class="ph ph-chart-bar" aria-hidden="true"></i></div>' +
        '<div class="dx-ptitle">Aún no hay ventas para analizar</div>' +
        '<div class="dx-psub" style="margin-top:6px">Cuando registres ventas, aquí verás la rentabilidad de cada animal, el retorno mensual y la utilidad por día.</div></div>';
    } else {
      // ── Fila de análisis: tiempo · distribución · mejores ──
      // Los rangos son una sola serie (el largo de la barra ya dice cuántas ventas hay),
      // así que todas comparten el color de acento; solo la pérdida usa el rojo de estado.
      var rangos = [
        { lab:'Pérdida',  test:function(r){ return r < 0; },             perdida:true },
        { lab:'0 – 15%',  test:function(r){ return r >= 0  && r < 15; } },
        { lab:'15 – 30%', test:function(r){ return r >= 15 && r < 30; } },
        { lab:'30 – 50%', test:function(r){ return r >= 30 && r < 50; } },
        { lab:'50%+',     test:function(r){ return r >= 50; } }
      ];
      var distrib = rangos.map(function(r) {
        return { lab: r.lab, perdida: !!r.perdida, n: conRoi.filter(function(x){ return r.test(x.roi); }).length };
      });
      var topRoi = conRoi.slice().sort(function(a,b){ return b.roi - a.roi; }).slice(0, 6);

      // La dispersión va sola a lo ancho: con 37 puntos necesita aire para leerse.
      html += '<div class="dx-panel"><div class="dx-phead"><span class="dx-secico" style="--sc:var(--c-violet)"><i class="ph ph-chart-scatter"></i></span>' +
        '<div class="dx-ptitles"><div class="dx-ptitle">Rentabilidad según el tiempo</div>' +
        '<div class="dx-psub">Cada punto es una venta: días que estuvo en la finca (horizontal) vs. rentabilidad que dejó (vertical). ' +
        'Arriba-izquierda es lo ideal: mucho retorno en poco tiempo. Clic en un punto para abrir la ficha.</div></div></div>' +
        '<div class="dx-chart-sm" style="min-height:330px"><canvas id="fin-tiempo"></canvas></div></div>';

      html += '<div class="dx-grid2">' +
        '<div class="dx-panel"><div class="dx-phead"><span class="dx-secico" style="--sc:var(--c-cyan)"><i class="ph ph-chart-bar"></i></span>' +
          '<div class="dx-ptitles"><div class="dx-ptitle">Distribución de la rentabilidad</div>' +
          '<div class="dx-psub">Cuántas ventas caen en cada rango de retorno.</div></div></div>' +
          '<div class="dx-chart-sm" style="min-height:260px"><canvas id="fin-distrib"></canvas></div></div>' +
        '<div class="dx-panel"><div class="dx-phead"><span class="dx-secico" style="--sc:var(--c-green)"><i class="ph ph-trophy"></i></span>' +
          '<div class="dx-ptitles"><div class="dx-ptitle">Ventas más rentables</div>' +
          '<div class="dx-psub">Mejor retorno sobre lo invertido · clic para ver la ficha.</div></div></div>' +
          '<div class="dx-chart-sm" style="min-height:260px"><canvas id="fin-top"></canvas></div></div>' +
      '</div>';

      // ── Resultado por mes ──
      var porMes = {};
      V.forEach(function(x) {
        if (!x.mes) return;
        if (!porMes[x.mes]) porMes[x.mes] = { inv:0, util:0, n:0 };
        porMes[x.mes].inv  += x.compra;
        porMes[x.mes].util += x.util;
        porMes[x.mes].n++;
      });
      var mesesK = Object.keys(porMes).sort();
      App.estado._finMeses = mesesK.map(function(m){ return { mes:m, d:porMes[m] }; });

      html += '<div class="dx-panel"><div class="dx-phead"><span class="dx-secico" style="--sc:var(--c-blue)"><i class="ph ph-chart-bar-horizontal"></i></span>' +
        '<div class="dx-ptitles"><div class="dx-ptitle">Resultado por mes de venta</div>' +
        '<div class="dx-psub">Capital recuperado (lo que costó el animal) y utilidad generada en cada mes.</div></div></div>' +
        '<div class="dx-chart-sm" style="min-height:250px"><canvas id="fin-mes"></canvas></div></div>';

      // ── Tabla de ventas ──
      var filas = conRoi.slice().sort(function(a,b){ return String(b.fecha).localeCompare(String(a.fecha)); }).map(function(x) {
        var cR = x.roi >= 30 ? 'ok' : x.roi >= 10 ? 'warn' : 'bad';
        return '<tr onclick="App.irAnimal(\'' + String(x.codigo).replace(/'/g, "\\'") + '\')">' +
          '<td><span class="cod">' + x.codigo + '</span><span class="sec">' + App.fmtFecha(x.fecha) + '</span></td>' +
          '<td class="num">' + (x.dias !== null ? x.dias + ' d' : '—') + '</td>' +
          '<td class="num">' + COP(Math.round(x.compra)) + '</td>' +
          '<td class="num">' + COP(Math.round(x.venta)) + '</td>' +
          '<td class="num">' + (x.precioKg ? COP(Math.round(x.precioKg)) + '/kg' : '—') + '</td>' +
          '<td class="num" ' + claseUtil(x.util) + '><b>' + COP(Math.round(x.util)) + '</b></td>' +
          '<td class="num"><span class="dx-risk ' + cR + '">' + PCT(x.roi) + '</span></td>' +
          '<td class="num">' + (x.roiMes !== null ? PCT(x.roiMes) + ' /mes' : '—') + '</td>' +
          '<td class="num">' + (x.utilDia !== null ? COP(Math.round(x.utilDia)) + '/d' : '—') + '</td>' +
        '</tr>';
      }).join('');

      html += '<div class="dx-panel"><div class="dx-phead"><span class="dx-secico" style="--sc:var(--c-amber)"><i class="ph ph-list-checks"></i></span>' +
        '<div class="dx-ptitles"><div class="dx-ptitle">Detalle de cada venta</div>' +
        '<div class="dx-psub">Rentabilidad animal por animal · ordenado de la venta más reciente a la más antigua.</div></div></div>' +
        '<div style="overflow-x:auto"><table class="dx-mtable"><thead><tr>' +
          '<th>Animal · fecha</th><th class="num">Días</th><th class="num">Compra</th><th class="num">Venta</th>' +
          '<th class="num">$/kg</th><th class="num">Utilidad</th><th class="num">Rentab.</th><th class="num">Mensual</th><th class="num">Por día</th>' +
        '</tr></thead><tbody>' + filas + '</tbody></table></div></div>';
    }

    // ── Inventario activo valorizado ──
    html += '<div class="dx-panel"><div class="dx-phead"><span class="dx-secico" style="--sc:var(--c-green)"><i class="ph ph-barn"></i></span>' +
      '<div class="dx-ptitles"><div class="dx-ptitle">Valor del hato en pie</div>' +
      '<div class="dx-psub">' + (precioKgProm !== null
        ? 'Estimación: peso actual de los ' + activos.length + ' animales activos × ' + COP(Math.round(precioKgProm)) + '/kg (precio promedio de tus ventas).'
        : 'Aún no hay ventas para estimar un precio por kilo de referencia.') + '</div></div></div>';
    if (precioKgProm !== null) {
      html += '<div class="dx-ins">' +
        '<div class="dx-irow" style="--ic:var(--c-blue)"><i class="ph ph-wallet"></i><span>Invertido en el hato activo: <b>' + COP(Math.round(invActiva)) + '</b></span></div>' +
        '<div class="dx-irow" style="--ic:var(--c-cyan)"><i class="ph ph-scales"></i><span>Kilos vivos en inventario: <b>' + fmt(kgActivos, 0) + ' kg</b>' + (sinPeso ? ' <span style="color:var(--muted)">(' + sinPeso + ' sin peso registrado)</span>' : '') + '</span></div>' +
        '<div class="dx-irow" style="--ic:var(--c-green)"><i class="ph ph-tag"></i><span>Valor estimado hoy: <b>' + COP(Math.round(valorHato)) + '</b></span></div>' +
        '<div class="dx-irow" style="--ic:' + (utilLatente >= 0 ? 'var(--ok)' : 'var(--danger)') + '"><i class="ph ph-trend-up"></i><span>Utilidad latente (si vendieras hoy): <b ' + claseUtil(utilLatente) + '>' + COP(Math.round(utilLatente)) + '</b>' + (roiLatente !== null ? ' · <b>' + PCT(roiLatente) + '</b> sobre lo invertido' : '') + '</span></div>' +
        '<div class="dx-irow" style="--ic:var(--muted)"><i class="ph ph-warning-circle"></i><span>Es una <b>estimación</b>, no un valor comercial cerrado: depende del precio de mercado del día y de la calidad de cada animal.</span></div>' +
      '</div>';
    }
    html += '</div>';

    html += '</div>';
    App.renderMain(html);

    // ══════════════════ Gráficos ══════════════════
    Object.keys(App.estado.charts || {}).forEach(function(k){ try { App.estado.charts[k].destroy(); } catch(e) {} });
    App.estado.charts = {};
    if (conRoi.length === 0) return;

    var isLight = document.documentElement.getAttribute('data-theme') === 'light';
    var GRIDC   = App._tok('--chart-grid', 'rgba(150,140,120,0.22)');
    var ACC     = isLight ? '#2f7f4e' : '#5cc46f';
    var SURF    = App._tok('--chart-surface', isLight ? '#fdfcf8' : '#211d18');

    // 1 · Rentabilidad vs días (dispersión) — ¿pagar más tiempo de tenencia rinde?
    var cT = document.getElementById('fin-tiempo');
    if (cT && conDias.length) {
      App.estado.charts.finTiempo = new Chart(cT, {
        type: 'scatter',
        data: { datasets: [{ data: conDias.map(function(x){ return { x:x.dias, y:Math.round(x.roi*10)/10, c:x.codigo }; }),
          backgroundColor: ACC, borderColor: SURF, borderWidth: 2, pointRadius: 6, pointHoverRadius: 9 }] },
        options: { responsive:true, maintainAspectRatio:false,
          plugins: { legend:{ display:false }, tooltip:{ enabled:false, external: App._tipExterno, callbacks:{
            title: function(i){ return i.length ? i[0].raw.c : ''; },
            label: function(c){ return c.raw.y.toFixed(1) + '% de rentabilidad'; },
            afterLabel: function(c){ return c.raw.x + ' días en la finca'; } } } },
          scales: { x:{ beginAtZero:true, grid:{ color:GRIDC }, border:{display:false},
                        title:{ display:true, text:'Días en la finca' }, ticks:{ padding:6 } },
                    y:{ grid:{ color:GRIDC }, border:{display:false},
                        title:{ display:true, text:'Rentabilidad (%)' }, ticks:{ padding:6, callback:function(v){ return v + '%'; } } } },
          onHover: function(e, el){ if (e.native) e.native.target.style.cursor = el.length ? 'pointer' : 'default'; },
          onClick: function(e, el){ if (el.length) App.irAnimal(conDias[el[0].index].codigo); } }
      });
    }

    // 2 · Distribución por rango de rentabilidad (ordinal: pérdida → excelente)
    var cD = document.getElementById('fin-distrib');
    if (cD) {
      var dLab = distrib.map(function(r){ return r.lab; });
      var dVal = distrib.map(function(r){ return r.n; });
      // Chart.js pinta sobre canvas: necesita colores literales, no var(--token).
      var dCol = distrib.map(function(r){ return r.perdida ? '#e8615a' : ACC; });
      App.estado.charts.finDistrib = new Chart(cD, {
        type: 'bar',
        data: { labels: dLab, datasets: [{ data: dVal, backgroundColor: dCol, borderRadius:{ topLeft:4, topRight:4 }, borderSkipped:false, maxBarThickness: 40 }] },
        options: { responsive:true, maintainAspectRatio:false, layout:{ padding:{ top:14 } },
          plugins: { legend:{ display:false }, tooltip:{ enabled:false, external: App._tipExterno, callbacks:{
            label: function(c){ return c.parsed.y + ' venta' + (c.parsed.y !== 1 ? 's' : ''); } } } },
          scales: { y:{ beginAtZero:true, grid:{ color:GRIDC }, border:{display:false}, ticks:{ padding:8, precision:0 } },
                    x:{ grid:{ display:false } } } }
      });
    }

    // 3 · Top ventas por rentabilidad (una serie, un color)
    var cTop = document.getElementById('fin-top');
    if (cTop && topRoi.length) {
      App.estado.charts.finTop = new Chart(cTop, {
        type: 'bar',
        data: { labels: topRoi.map(function(x){ return x.codigo; }),
          datasets: [{ data: topRoi.map(function(x){ return Math.round(x.roi*10)/10; }), backgroundColor: ACC,
            borderRadius:{ topRight:4, bottomRight:4 }, borderSkipped:false, maxBarThickness:18, categoryPercentage:0.62 }] },
        options: { responsive:true, maintainAspectRatio:false, indexAxis:'y', layout:{ padding:{ right:56 } },
          plugins: { legend:{ display:false }, tooltip:{ enabled:false, external: App._tipExterno, callbacks:{
            title: function(i){ return i.length ? topRoi[i[0].dataIndex].codigo : ''; },
            label: function(c){ return c.parsed.x.toFixed(1) + '% de rentabilidad'; },
            afterLabel: function(c){ return 'Utilidad ' + COP(Math.round(topRoi[c.dataIndex].util)); } } } },
          scales: { x:{ beginAtZero:true, grid:{ color:GRIDC }, border:{display:false}, ticks:{ padding:6, callback:function(v){ return v + '%'; } } },
                    y:{ grid:{ display:false }, ticks:{ font:{ weight:700 } } } },
          onHover: function(e, el){ if (e.native) e.native.target.style.cursor = el.length ? 'pointer' : 'default'; },
          onClick: function(e, el){ if (el.length) App.irAnimal(topRoi[el[0].index].codigo); } }
      });
    }

    // 4 · Resultado por mes — capital recuperado vs utilidad (barras agrupadas, un solo eje)
    var cM = document.getElementById('fin-mes');
    var MESN = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    var serieMes = App.estado._finMeses || [];
    if (cM && serieMes.length) {
      App.estado.charts.finMes = new Chart(cM, {
        type: 'bar',
        data: { labels: serieMes.map(function(m, i) {
            var mm = parseInt(m.mes.substring(5,7), 10);
            return (MESN[mm-1] || m.mes) + ((i === 0 || mm === 1) ? ' ' + m.mes.substring(2,4) : '');
          }),
          datasets: [
            { label:'Capital recuperado', data: serieMes.map(function(m){ return Math.round(m.d.inv); }),  backgroundColor:'#5b9df0', borderRadius:{topLeft:4,topRight:4}, borderSkipped:false, maxBarThickness:26 },
            { label:'Utilidad',           data: serieMes.map(function(m){ return Math.round(m.d.util); }), backgroundColor:'#3fd08a', borderRadius:{topLeft:4,topRight:4}, borderSkipped:false, maxBarThickness:26 }
          ] },
        options: { responsive:true, maintainAspectRatio:false,
          plugins: { legend:{ position:'top', align:'end', labels:{ usePointStyle:true, pointStyle:'circle', padding:14, boxHeight:7 } },
            tooltip:{ enabled:false, external: App._tipExterno, mode:'index', intersect:false, callbacks:{
              label: function(c){ return c.dataset.label + ': ' + COP(c.parsed.y); },
              afterBody: function(items){ var m = serieMes[items[0].dataIndex]; return m.d.n + ' animal' + (m.d.n !== 1 ? 'es' : '') + ' vendido' + (m.d.n !== 1 ? 's' : ''); } } } },
          scales: { y:{ beginAtZero:true, grid:{ color:GRIDC }, border:{display:false},
                        ticks:{ padding:8, callback:function(v){ return App.fmtCOPk(v); } } },
                    x:{ grid:{ display:false } } } }
      });
    }
  },

  // ══════════════════════════════════════════════════════════════════════
  //  FACTURAS DE GASTO
  //
  //  Se fotografía la factura, Gemini la lee, y el usuario CONFIRMA los campos
  //  antes de que se guarde nada. Esa confirmación no es un paso de más: el
  //  dato va a una contadora, y un total mal leído que nadie miró es peor que
  //  no tener el módulo.
  //
  //  Vive detrás del PIN, como el resto de lo que habla de dinero.
  // ══════════════════════════════════════════════════════════════════════

  _fac: { mes: '', datos: null, subiendo: null },

  vistaFacturas: function() {
    if (!App._pinFin()) { App._pantallaPin(''); return; }
    if (!App._fac.mes) App._fac.mes = App._hoyISO().substring(0, 7);
    App._cargarFacturas();
  },

  _cargarFacturas: function() {
    App.renderMain('<div class="flex justify-center py-16"><div class="spinner w-8 h-8" style="color:var(--accent)"></div></div>');
    App.api('listFacturas', [{ pin: App._pinFin(), mes: App._fac.mes }], function(r) {
      if (!r || !r.ok) { App.toast((r && r.error) || 'No se pudieron cargar las facturas.', 'error'); return; }
      App._fac.datos = r;
      App._pintarFacturas();
    }, function(e) {
      // Mismo trato que en Finanzas: el PIN dejó de servir, se vuelve a pedir
      // sin la pantalla roja de error del servidor.
      sessionStorage.removeItem('sga_pin');
      App._pantallaPin((e && e.message) || 'Vuelve a escribir el PIN.');
    }, { silencioso: true });
  },

  _facMes: function(m) { App._fac.mes = m; App._cargarFacturas(); },

  // "2026-09" -> "septiembre de 2026"
  _facMesLargo: function(m) {
    var p = String(m || '').split('-');
    if (p.length !== 2) return m || '—';
    var MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto',
                 'septiembre','octubre','noviembre','diciembre'];
    return (MESES[parseInt(p[1], 10) - 1] || p[1]) + ' de ' + p[0];
  },

  _FAC_ESTADO: {
    PENDIENTE: { tk:'--muted',  ico:'●', lab:'Sin enviar' },
    ENVIADA:   { tk:'--info',   ico:'<i class="ph ph-envelope-simple" aria-hidden="true"></i>', lab:'Enviada' },
    APROBADA:  { tk:'--ok',     ico:'<i class="ph ph-check" aria-hidden="true"></i>', lab:'Aprobada' },
    DEVUELTA:  { tk:'--danger', ico:'<i class="ph ph-x" aria-hidden="true"></i>', lab:'Devuelta' }
  },
  _facChip: function(f) {
    var e = App._FAC_ESTADO[f.estado] || App._FAC_ESTADO.PENDIENTE;
    return '<span class="chip-tarea" style="' + App._estiloPastilla(e.tk) + '">' +
      e.ico + ' ' + e.lab + '</span>';
  },

  _pintarFacturas: function() {
    var d = App._fac.datos, R = d.resumen || {}, lista = d.lista || [];
    var meses = d.meses || [];

    var html = '<div class="dx-wrap">' + App._subtabs('salida', '#/facturas');

    html += '<div class="dx-head">' +
      '<div><h2 class="dx-title">Facturas de ' + App._facMesLargo(App._fac.mes) + '</h2>' +
        '<div class="dx-sub">' + (R.cuantas || 0) + ' factura' + (R.cuantas !== 1 ? 's' : '') +
        ' · <b>' + App.fmtCOP(R.total || 0) + '</b>' +
        (R.sinRevisar ? ' · <b style="color:var(--warn)">' + R.sinRevisar + ' sin revisar</b>' : '') +
        '</div></div>' +
      '<div class="dx-toolbar">' +
        '<select class="filter-select" onchange="App._facMes(this.value)">' +
          meses.map(function(m) {
            return '<option value="' + m + '"' + (m === App._fac.mes ? ' selected' : '') + '>' +
              App._facMesLargo(m) + '</option>';
          }).join('') +
        '</select>' +
        '<button onclick="App._facElegirFoto()" class="btn-primary tk-btn-nueva">' +
          '<i class="ph ph-camera" aria-hidden="true"></i> Subir factura</button>' +
      '</div></div>';

    // El input vive escondido en la página: el botón de arriba es el que se ve.
    // En un celular, accept="image/*" abre directamente la cámara o la galería.
    html += '<input type="file" id="fac-file" accept="image/*" style="display:none" ' +
      'onchange="App._facAlElegir(this)">';

    // ── Por categoría ──
    if ((R.porCategoria || []).length) {
      html += '<div class="dx-panel"><div class="dx-phead">' +
        '<span class="dx-secico" style="--sc:var(--c-amber)"><i class="ph ph-chart-pie-slice"></i></span>' +
        '<div class="dx-ptitles"><div class="dx-ptitle">En qué se fue el mes</div>' +
        '<div class="dx-psub">Total por categoría de gasto.</div></div></div>' +
        '<div class="fac-cats">' + R.porCategoria.map(function(c) {
          var pct = R.total > 0 ? Math.round(c.total / R.total * 100) : 0;
          return '<div class="fac-cat">' +
            '<div class="fac-cat-t"><span>' + App._esc(c.categoria) + '</span>' +
              '<b>' + App.fmtCOP(c.total) + '</b></div>' +
            '<div class="fac-cat-barra"><span style="width:' + pct + '%"></span></div>' +
            '<div class="fac-cat-pct">' + pct + '% del mes</div>' +
          '</div>';
        }).join('') + '</div></div>';
    }

    // ── La lista ──
    if (!lista.length) {
      html += '<div class="dx-panel"><div class="vacio-lluvia">' +
        '<div class="vacio-ico"><i class="ph ph-receipt" aria-hidden="true"></i></div>' +
        '<div class="vacio-t">No hay facturas de ' + App._facMesLargo(App._fac.mes) + '</div>' +
        '<div class="vacio-s">Toma una foto de la factura con <b><i class="ph ph-camera" aria-hidden="true"></i> Subir factura</b>. ' +
        'El sistema la lee y te muestra los datos para que los revises antes de guardarlos.<br><br>' +
        'Si la lectura no sale bien, el formulario se llena a mano y <b>la foto queda guardada igual</b>.</div>' +
      '</div></div>';
    } else {
      html += '<div class="dx-panel"><div class="dx-phead">' +
        '<span class="dx-secico" style="--sc:var(--c-green)"><i class="ph ph-receipt"></i></span>' +
        '<div class="dx-ptitles"><div class="dx-ptitle">Las facturas del mes</div>' +
        '<div class="dx-psub">De la más reciente a la más antigua.</div></div></div>' +
        '<div class="fac-lista">' + lista.map(App._facFila).join('') + '</div></div>';
    }

    App.renderMain(html + '</div>');
  },

  _facFila: function(f) {
    var sinRevisar = String(f.revisada).toUpperCase() !== 'SI';
    return '<div class="fac-fila' + (sinRevisar ? ' sin-revisar' : '') + '">' +
      '<div class="fac-info">' +
        '<div class="fac-prov">' + App._esc(f.proveedor || 'Sin proveedor') +
          (sinRevisar ? ' <span class="fac-aviso">sin revisar</span>' : '') + '</div>' +
        '<div class="fac-meta">' + App.fmtFecha(f.fecha) +
          (f.categoria ? ' · ' + App._esc(f.categoria) : '') +
          (f.numero ? ' · N.º ' + App._esc(f.numero) : '') + '</div>' +
        (f.concepto ? '<div class="fac-concepto">' + App._esc(f.concepto) + '</div>' : '') +
      '</div>' +
      '<div class="fac-cifra">' +
        '<div class="fac-total">' + App.fmtCOP(f.total) + '</div>' +
        App._facChip(f) +
      '</div>' +
      '<div class="fac-acc">' +
        (f.drive_url
          ? '<a href="' + App._esc(f.drive_url) + '" target="_blank" rel="noopener" class="btn-fila"><i class="ph ph-camera" aria-hidden="true"></i> Ver foto</a>'
          : '') +
        '<button onclick="App._facEditar(\'' + f.id_factura + '\')" class="btn-fila">✎ Corregir</button>' +
        (f.estado === 'PENDIENTE'
          ? '<button onclick="App._facBorrar(\'' + f.id_factura + '\')" class="btn-fila borrar">Quitar</button>'
          : '') +
      '</div>' +
    '</div>';
  },

  // ── Subir la foto ────────────────────────────────────────────────────────
  _facElegirFoto: function() {
    var inp = document.getElementById('fac-file');
    if (inp) { inp.value = ''; inp.click(); }
  },

  // Encoger ANTES de subir. Una foto de celular pesa entre 3 y 8 MB y
  // google.script.run no la pasa bien; reducida al lado largo de 1600 px pesa
  // unos 300 KB y se lee igual. Esto no es un ahorro: es lo que hace que
  // funcione desde un teléfono.
  _comprimirImagen: function(file, ladoMax, calidad, alTerminar, alFallar) {
    var lector = new FileReader();
    lector.onerror = function() { alFallar && alFallar('No se pudo leer el archivo.'); };
    lector.onload = function(ev) {
      var img = new Image();
      img.onerror = function() { alFallar && alFallar('Ese archivo no parece una imagen.'); };
      img.onload = function() {
        var w = img.width, h = img.height;
        if (w > ladoMax || h > ladoMax) {
          if (w > h) { h = Math.round(h * ladoMax / w); w = ladoMax; }
          else       { w = Math.round(w * ladoMax / h); h = ladoMax; }
        }
        var lienzo = document.createElement('canvas');
        lienzo.width = w; lienzo.height = h;
        lienzo.getContext('2d').drawImage(img, 0, 0, w, h);
        var url = lienzo.toDataURL('image/jpeg', calidad);
        alTerminar(url.split(',')[1], 'image/jpeg', url);
      };
      img.src = ev.target.result;
    };
    lector.readAsDataURL(file);
  },

  _facAlElegir: function(input) {
    var file = input.files && input.files[0];
    if (!file) return;
    if (!/^image\//.test(file.type)) {
      App.toast('Por ahora solo se pueden subir fotos, no archivos PDF.', 'error');
      return;
    }
    App.mostrarLoading('Preparando la foto…');
    App._comprimirImagen(file, 1600, 0.8, function(b64, mime, dataUrl) {
      App.mostrarLoading('Subiendo el soporte…');
      App.api('subirYLeerFactura', [{ pin: App._pinFin(), base64: b64, mimeType: mime }], function(r) {
        if (!r || !r.ok) { App.toast((r && r.error) || 'No se pudo subir la factura.', 'error'); return; }
        App._fac.subiendo = { drive_id: r.drive_id, drive_url: r.drive_url, vista: dataUrl };
        if (!r.lecturaOk) {
          // No se pierde nada: la imagen ya está en Drive y el formulario se
          // llena a mano. Se dice por qué falló, sin esconderlo.
          App.toast('La foto quedó guardada, pero no se pudo leer sola. Escribe los datos.', 'info');
        }
        App._facFormulario(null, r.campos, r.lecturaOk ? '' : (r.error || ''));
      }, function() {
        App.toast('No se pudo subir la factura. Revisa la conexión.', 'error');
      });
    }, function(msg) {
      App.ocultarLoading();
      App.toast(msg, 'error');
    });
  },

  // ── El formulario de revisión ────────────────────────────────────────────
  // La foto va AL LADO de los campos, no en otra pantalla: comparar el número
  // con el papel es todo el trabajo que hay que hacer aquí.
  _facFormulario: function(idExistente, c, avisoLectura) {
    var d = App._fac.datos || {};
    var op = d.opciones || { categorias: [], predios: [] };
    c = c || {};
    var sub = App._fac.subiendo;
    var urlFoto = sub ? sub.vista : (c.drive_url || '');

    function opts(lista, sel, vacio) {
      return '<option value="">' + vacio + '</option>' + (lista || []).map(function(o) {
        var v = (typeof o === 'string') ? o : o.id_predio;
        var t = (typeof o === 'string') ? o : o.nombre;
        return '<option value="' + App._esc(v) + '"' + (v === sel ? ' selected' : '') + '>' +
          App._esc(t) + '</option>';
      }).join('');
    }

    var confianza = '';
    if (c.confianza === 'BAJA') {
      confianza = '<div class="ph-aviso"><span><i class="ph ph-warning" aria-hidden="true"></i></span><div>La foto se leía con dificultad. ' +
        '<b>Revisa cifra por cifra</b> contra el papel antes de guardar.</div></div>';
    } else if (avisoLectura) {
      confianza = '<div class="ph-aviso"><span><i class="ph ph-warning" aria-hidden="true"></i></span><div>No se pudo leer la factura sola: ' +
        App._esc(avisoLectura) + '<br>La foto está guardada; escribe los datos a mano.</div></div>';
    }

    var html = '<div class="p-6">' +
      '<div class="flex items-center justify-between mb-1">' +
        '<h2 class="text-lg font-bold">' + (idExistente ? '✎ Corregir la factura' : '<i class="ph ph-receipt" aria-hidden="true"></i> Revisa lo que se leyó') + '</h2>' +
        '<button onclick="App._facCerrar()" class="text-gray-400 hover:text-gray-700 text-2xl leading-none">×</button>' +
      '</div>' +
      '<div class="text-sm mb-4" style="color:var(--muted)">' +
        (idExistente ? 'Cambia lo que esté mal y guarda.'
                     : 'Nada se guarda hasta que toques «Guardar». Compara con el papel.') + '</div>' +
      confianza +
      '<div class="fac-form">' +
        (urlFoto
          ? '<div class="fac-foto"><img src="' + App._esc(urlFoto) + '" alt="Foto de la factura">' +
            (sub && sub.drive_url
              ? '<a href="' + App._esc(sub.drive_url) + '" target="_blank" rel="noopener" class="fac-foto-link">Abrirla en grande <i class="ph ph-arrow-up-right" aria-hidden="true"></i></a>'
              : '') + '</div>'
          : '') +
        '<div class="fac-campos">' +
          '<div class="grid grid-cols-2 gap-4">' +
            '<div class="form-group"><label class="form-label">Fecha de la factura *</label>' +
              '<input type="date" id="fc_fecha" value="' + App._esc(c.fecha || '') + '" class="form-input"></div>' +
            '<div class="form-group"><label class="form-label">Total *</label>' +
              App._numInput('fc_total', { entero:true, value: App._pesosCampo(c.total), placeholder:'Ej: 1.234.567', onblur:'App._pesosBlur(this)' }) + '</div>' +
          '</div>' +
          '<div class="form-group"><label class="form-label">Proveedor *</label>' +
            '<input type="text" id="fc_prov" value="' + App._esc(c.proveedor || '') + '" class="form-input" placeholder="Quién expidió la factura"></div>' +
          '<div class="grid grid-cols-2 gap-4">' +
            '<div class="form-group"><label class="form-label">NIT</label>' +
              '<input type="text" id="fc_nit" value="' + App._esc(c.nit || '') + '" class="form-input" placeholder="900.123.456-7"></div>' +
            '<div class="form-group"><label class="form-label">N.º de factura</label>' +
              '<input type="text" id="fc_num" value="' + App._esc(c.numero || '') + '" class="form-input"></div>' +
          '</div>' +
          '<div class="form-group"><label class="form-label">Concepto</label>' +
            '<input type="text" id="fc_concepto" value="' + App._esc(c.concepto || '') + '" class="form-input" placeholder="Qué se compró"></div>' +
          '<div class="grid grid-cols-2 gap-4">' +
            '<div class="form-group"><label class="form-label">Categoría</label>' +
              '<select id="fc_cat" class="form-input">' + opts(op.categorias, c.categoria || '', '— Sin categoría —') + '</select>' +
              '<div class="ayuda-campo">Es lo que agrupa el resumen del mes.</div></div>' +
            '<div class="form-group"><label class="form-label">Finca</label>' +
              '<select id="fc_predio" class="form-input">' + opts(op.predios, c.id_predio || '', '— No aplica —') + '</select>' +
              '<div class="ayuda-campo">Opcional: a qué finca se carga el gasto.</div></div>' +
          '</div>' +
          '<div class="grid grid-cols-2 gap-4">' +
            '<div class="form-group"><label class="form-label">Subtotal</label>' +
              App._numInput('fc_sub', { entero:true, value: App._pesosCampo(c.subtotal), placeholder:'Opcional', onblur:'App._pesosBlur(this)' }) + '</div>' +
            '<div class="form-group"><label class="form-label">IVA</label>' +
              App._numInput('fc_iva', { entero:true, value: App._pesosCampo(c.iva), placeholder:'Opcional', onblur:'App._pesosBlur(this)' }) + '</div>' +
          '</div>' +
          '<div class="form-group"><label class="form-label">Notas</label>' +
            '<input type="text" id="fc_notas" value="' + App._esc(c.notas || '') + '" class="form-input" placeholder="Opcional"></div>' +
        '</div>' +
      '</div>' +
      '<div id="fac-repetida"></div>' +
      '<div class="flex justify-end gap-3 mt-4">' +
        '<button onclick="App._facCerrar()" class="btn-secondary">Cancelar</button>' +
        '<button onclick="App._facGuardar(' + (idExistente ? '\'' + idExistente + '\'' : 'null') + ')" ' +
          'id="fc_guardar" class="btn-primary px-6 py-2 text-sm">Guardar factura</button>' +
      '</div></div>';
    App.abrirModal(html);
  },

  _facCerrar: function() {
    App._fac.subiendo = null;
    App.cerrarModal();
  },

  _facLeerForm: function() {
    return {
      pin:       App._pinFin(),
      fecha:     (document.getElementById('fc_fecha')    || {}).value || '',
      proveedor: (document.getElementById('fc_prov')     || {}).value || '',
      nit:       (document.getElementById('fc_nit')      || {}).value || '',
      numero:    (document.getElementById('fc_num')      || {}).value || '',
      concepto:  (document.getElementById('fc_concepto') || {}).value || '',
      categoria: (document.getElementById('fc_cat')      || {}).value || '',
      id_predio: (document.getElementById('fc_predio')   || {}).value || '',
      subtotal:  (function(v){ return isNaN(v) ? '' : v; })(App._leerPesos('fc_sub')),
      iva:       (function(v){ return isNaN(v) ? '' : v; })(App._leerPesos('fc_iva')),
      total:     (function(v){ return isNaN(v) ? '' : v; })(App._leerPesos('fc_total')),
      notas:     (document.getElementById('fc_notas')    || {}).value || ''
    };
  },

  _facGuardar: function(idExistente, confirmarRepetida) {
    var p = App._facLeerForm();
    if (!p.fecha)              { App._marcarCampo('fc_fecha', 'Indica la fecha de la factura'); return; }
    if (!String(p.proveedor).trim()) { App._marcarCampo('fc_prov', 'Escribe quién expidió la factura'); return; }
    if (p.total === '' || p.total <= 0) { App._marcarCampo('fc_total', 'Escribe el total, por ejemplo 1.234.567'); return; }

    if (idExistente) p.id_factura = idExistente;
    else {
      var sub = App._fac.subiendo || {};
      p.drive_id  = sub.drive_id  || '';
      p.drive_url = sub.drive_url || '';
    }
    if (confirmarRepetida) p.confirmarRepetida = true;

    App._unaVez('factura', 'fc_guardar', function(liberar) {
      App.api(idExistente ? 'editarFactura' : 'guardarFactura', [p], function(r) {
        liberar();
        if (r && r.repetida) { App._facAvisarRepetida(r.repetida, idExistente); return; }
        if (!r || !r.ok) { App.toast((r && r.error) || 'No se pudo guardar.', 'error'); return; }
        App.toast(idExistente ? 'Factura corregida ✓' : 'Factura guardada ✓', 'success');
        (r.advertencias || []).forEach(function(a) { App.toast(a, 'info'); });
        App._facCerrar();
        App._cargarFacturas();
      }, liberar);
    });
  },

  // La repetida se avisa DENTRO del formulario, no con un confirm() del
  // navegador: hay que poder ver el dato que ya existe mientras se decide.
  _facAvisarRepetida: function(g, idExistente) {
    var caja = document.getElementById('fac-repetida');
    if (!caja) return;
    caja.innerHTML = '<div class="aviso-costo" style="margin-top:14px">' +
      '<i class="ph ph-warning-circle"></i>' +
      '<div><div class="aviso-costo-t">Esta factura ya estaba registrada</div>' +
        '<div class="aviso-costo-linea">Con el mismo NIT y el mismo número: ' +
          '<b>' + App._esc(g.proveedor || '—') + '</b>, ' + App.fmtFecha(g.fecha) +
          ', por <b>' + App.fmtCOP(g.total) + '</b>.</div>' +
        '<div class="aviso-costo-linea">Hay proveedores que repiten numeración cada año. ' +
          'Si de verdad son dos facturas distintas, guárdala igual.</div>' +
        '<button onclick="App._facGuardar(' + (idExistente ? '\'' + idExistente + '\'' : 'null') + ',true)" ' +
          'class="btn-secondary text-sm" style="margin-top:10px">Sí, guardarla igual</button>' +
      '</div></div>';
    caja.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  },

  _facEditar: function(id) {
    var f = ((App._fac.datos || {}).lista || []).filter(function(x) { return x.id_factura === id; })[0];
    if (!f) { App.toast('No se encontró esa factura.', 'error'); return; }
    App._fac.subiendo = null;
    App._facFormulario(id, f, '');
  },

  _facBorrar: function(id) {
    var f = ((App._fac.datos || {}).lista || []).filter(function(x) { return x.id_factura === id; })[0];
    if (!f) return;
    if (!confirm('¿Quitar la factura de ' + (f.proveedor || 'sin proveedor') + ' por ' +
                 App.fmtCOP(f.total) + '?\n\nLa foto se conserva en el almacenamiento privado: ' +
                 'solo desaparece de esta lista.')) return;
    App.api('eliminarFactura', [{ pin: App._pinFin(), id_factura: id }], function(r) {
      if (!r || !r.ok) { App.toast((r && r.error) || 'No se pudo quitar.', 'error'); return; }
      App.toast('Factura quitada · la foto sigue guardada', 'info');
      App._cargarFacturas();
    });
  },

  // ── SITUACIÓN DEL REBAÑO ────────────────────────────────────────────────
  // Vista de tarjetas color-coded por clasificación GDP — filtrables e interactivas.
  vistaSituacion: function(clasifInicial) {
    App.renderMain('<div class="flex justify-center py-16"><div class="spinner text-green-700 w-8 h-8"></div></div>');
    App.api('getDashboardFull', [App.estado.filtros], function(data) {
      var animales = data.dashboard.tablaResumen;
      // Derivado de la escala unica: los rangos se calculan del objetivo
      // vigente, ya no hay textos escritos a mano que se desactualicen.
      var BGC = { SUPERA:['bg-green-50','border-green-300'], CUMPLE:['bg-blue-50','border-blue-300'],
                  CASI:['bg-yellow-50','border-yellow-300'], BAJO:['bg-orange-50','border-orange-300'],
                  CRITICO:['bg-red-50','border-red-400'],    SIN_DATOS:['bg-gray-50','border-gray-200'] };
      var CLASIF_INFO = {};
      App.GDP_ORDEN.forEach(function(k) {
        var i = App.GDP_INFO[k];
        CLASIF_INFO[k] = { icon:i.icon, label:i.label, desc:App.descNivel(k),
                           bg:BGC[k][0], border:BGC[k][1], badge:i.badge };
      });

      // Resumen conteo por clasificación
      var conteos = {}; App.GDP_ORDEN.forEach(function(k){ conteos[k] = 0; });
      animales.forEach(function(a) { var c = a.clasificacion || 'SIN_DATOS'; if (conteos[c] !== undefined) conteos[c]++; });

      // Propietarios y predios únicos para filtros
      var seenPr = {}, seenProp = {}, predios2 = [], props2 = [];
      animales.forEach(function(a) {
        if (a.predio && !seenPr[a.predio]) { seenPr[a.predio]=1; predios2.push(a.predio); }
        if (a.propietario && !seenProp[a.propietario]) { seenProp[a.propietario]=1; props2.push(a.propietario); }
      });
      predios2.sort(); props2.sort();

      var html = '<div class="space-y-5">';

      // Barra de filtros
      html += '<div class="bg-white rounded-xl border border-gray-200 p-4">' +
        '<div class="flex flex-wrap gap-3 items-center">' +
          '<span class="text-sm font-semibold text-gray-600 etiqueta-filtros">Filtrar por:</span>' +
          '<select id="sit-clasif" onchange="App._filtrarSituacion()" class="form-input w-auto text-sm py-1.5">' +
            '<option value="">Todas las clasificaciones</option>' +
            Object.keys(CLASIF_INFO).map(function(c){ return '<option value="'+c+'">'+(CLASIF_INFO[c].icon)+' '+CLASIF_INFO[c].label+'</option>'; }).join('') +
          '</select>' +
          '<select id="sit-predio" onchange="App._filtrarSituacion()" class="form-input w-auto text-sm py-1.5">' +
            '<option value="">Todas las fincas</option>' +
            predios2.map(function(p){ return '<option>'+p+'</option>'; }).join('') +
          '</select>' +
          '<select id="sit-prop" onchange="App._filtrarSituacion()" class="form-input w-auto text-sm py-1.5">' +
            '<option value="">Todos los propietarios</option>' +
            props2.map(function(p){ return '<option>'+p+'</option>'; }).join('') +
          '</select>' +
          '<input type="text" id="sit-q" placeholder="Buscar código…" oninput="App._filtrarSituacion()" class="form-input w-40 text-sm py-1.5">' +
          '<span id="sit-count" class="text-xs text-gray-400 ml-auto">' + animales.length + ' animales</span>' +
        '</div>' +
      '</div>';

      // Chips de conteo por clasificación (clicables).
      // Se pintan LOS SEIS aunque valgan cero: los ceros se ocultan luego desde
      // _filtrarSituacion. Si se saltaran aquí, al cambiar de finca una
      // categoría que estaba vacía no tendría dónde reaparecer.
      html += '<div class="flex flex-wrap gap-2" id="sit-chips">';
      Object.keys(CLASIF_INFO).forEach(function(c) {
        var ci = CLASIF_INFO[c];
        html += '<button id="sit-chip-' + c + '" data-clasif="' + c + '" ' +
          'onclick="App._setFiltroSituacion(\'' + c + '\')" ' +
          'class="sit-chip flex items-center gap-2 px-3 py-1.5 rounded-full border-2 ' + ci.border + ' ' + ci.bg + ' text-sm font-semibold hover:shadow-sm transition-all">' +
          ci.icon + ' ' + ci.label + ' <span class="sit-chip-n bg-white rounded-full px-2 py-0.5 text-xs">' + conteos[c] + '</span></button>';
      });
      html += '</div>';

      // Grid de tarjetas animales
      html += '<div id="sit-grid" class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">';
      animales.forEach(function(a) {
        var cl = a.clasificacion || 'SIN_DATOS';
        var ci = CLASIF_INFO[cl] || CLASIF_INFO['SIN_DATOS'];
        var diasAlerta = a.diasSinMedir > 45 ? '<div class="text-xs text-red-500 font-semibold mt-1"><i class="ph ph-calendar" aria-hidden="true"></i> Sin medir ' + a.diasSinMedir + 'd</div>' : '';
        html += '<div class="sit-card ' + ci.bg + ' border-2 ' + ci.border + ' rounded-xl p-3 cursor-pointer hover:shadow-md transition-all" ' +
          'data-clasif="' + cl + '" data-predio="' + (a.predio||'') + '" data-prop="' + (a.propietario||'') + '" data-codigo="' + String(a.codigo) + '" ' +
          'onclick="App.irAnimal(\'' + String(a.codigo).replace(/'/g, "\\'") + '\')">' +
          '<div class="flex items-start justify-between mb-2">' +
            '<span class="font-black text-gray-900 text-base leading-tight">' + a.codigo + '</span>' +
            '<span class="text-lg leading-none">' + ci.icon + '</span>' +
          '</div>' +
          '<div class="text-xs text-gray-500 truncate mb-1">' + (a.tipo || '—') + '</div>' +
          '<div class="text-xs font-medium text-gray-700 truncate">' + (a.predio || '—') + '</div>' +
          (a.propietario ? '<div class="text-xs text-gray-400 truncate">' + a.propietario + '</div>' : '') +
          '<div class="mt-2 border-t border-white/60 pt-2">' +
            '<div class="text-sm font-bold text-gray-900">' + App.fmt(a.pesoActual, 1) + ' <span class="text-xs font-normal text-gray-500">kg</span></div>' +
            '<div class="text-xs font-semibold" style="color:' + (a.ultimaGdp !== '' ? App.textoGdp(a.ultimaGdp) : 'var(--muted)') + '">' +
              'GDP: ' + (a.ultimaGdp !== '' ? App.fmt(a.ultimaGdp, 3) + ' kg/d' : '—') +
            '</div>' +
          '</div>' +
          diasAlerta +
        '</div>';
      });
      html += '</div>' +
        '<div id="sit-vacio" class="dx-panel" style="display:none">' +
          '<div class="vacio-lluvia"><div class="vacio-ico"><i class="ph ph-magnifying-glass" aria-hidden="true"></i></div>' +
          '<div class="vacio-t">Ningún animal con ese filtro</div>' +
          '<div class="vacio-s">Prueba con otra finca, otro propietario, u otra clasificación.</div></div>' +
        '</div></div>';
      App.renderMain(html);
      // Si se entró con una clasificación (p. ej. clic en el dashboard), pre-filtrar.
      if (clasifInicial) {
        var _sc = document.getElementById('sit-clasif');
        if (_sc) _sc.value = clasifInicial;
      }
      // Siempre, no solo al venir con filtro: es lo que oculta los chips que
      // están en cero y deja los números cuadrados desde el primer momento.
      App._filtrarSituacion();
    });
  },

  _filtrarSituacion: function() {
    var cl   = ((document.getElementById('sit-clasif') || {}).value || '');
    var pr   = ((document.getElementById('sit-predio') || {}).value || '');
    var prop = ((document.getElementById('sit-prop')   || {}).value || '');
    var q    = ((document.getElementById('sit-q')      || {}).value || '').toLowerCase().trim();
    var vis  = 0;
    var conteos = {};

    document.querySelectorAll('.sit-card').forEach(function(el) {
      // Los conteos de los chips se cuentan SIN el filtro de clasificación, a
      // propósito. El chip ES el selector de clasificación: si se contara con
      // él puesto, al elegir "Supera" los otros cinco dirían 0 y no habría
      // forma de saltar a otra categoría — el filtro se volvería un callejón.
      var base = (!pr   || el.dataset.predio === pr) &&
                 (!prop || el.dataset.prop   === prop) &&
                 (!q    || el.dataset.codigo.toLowerCase().includes(q));
      if (base) {
        var k = el.dataset.clasif || 'SIN_DATOS';
        conteos[k] = (conteos[k] || 0) + 1;
      }
      var ok = base && (!cl || el.dataset.clasif === cl);
      el.style.display = ok ? '' : 'none';
      if (ok) vis++;
    });

    // Los números de los chips se rehacen. Antes se calculaban una sola vez al
    // cargar la vista y se quedaban en el total de todas las fincas: al filtrar
    // por una, los chips seguían diciendo lo mismo y contradecían a la lista
    // que ellos mismos filtraban.
    document.querySelectorAll('.sit-chip').forEach(function(chip) {
      var n = conteos[chip.dataset.clasif] || 0;
      var span = chip.querySelector('.sit-chip-n');
      if (span) span.textContent = n;
      chip.style.display = n ? '' : 'none';          // una categoría sin nadie no se muestra
      chip.classList.toggle('sit-chip-on', cl === chip.dataset.clasif);
    });

    var cnt = document.getElementById('sit-count');
    if (cnt) cnt.textContent = vis + ' animal' + (vis !== 1 ? 'es' : '');
    var vacio = document.getElementById('sit-vacio');
    if (vacio) vacio.style.display = vis ? 'none' : '';
  },

  _setFiltroSituacion: function(clasif) {
    var el = document.getElementById('sit-clasif');
    if (el) { el.value = (el.value === clasif ? '' : clasif); App._filtrarSituacion(); }
  },

  // ── PARA VENTA — por peso y por descarte ────────────────────────────────
  // tabInicial (opcional): 'peso' | 'vacas' | 'desc' — pestaña a mostrar tras recargar.
  vistaSalida: function(tabInicial) {
    App.renderMain('<div class="flex justify-center py-16"><div class="spinner text-green-700 w-8 h-8"></div></div>');
    App.api('getDashboardFull', [{}], function(data) {
    App.api('getVacasIntervalo', [], function(vacasInt) {
      var todos    = data.dashboard.tablaResumen
                      .sort(function(a, b) { return parseFloat(b.pesoActual) - parseFloat(a.pesoActual); });
      var descarte = todos.filter(function(a) { return a.estadoDescarte === 'Marcado para descarte'; });
      var umbral   = 340;

      // Vacas madres (con su intervalo reproductivo) y mapa de pesos del inventario.
      var mapaVaca = {}; (vacasInt || []).forEach(function(v){ mapaVaca[v.codigo] = v; });

      // Mapa reproductivo para la guarda anti-venta accidental (lo consulta el modal de venta).
      App.estado._reproMap = {};
      (vacasInt || []).forEach(function(v) {
        App.estado._reproMap[v.codigo] = {
          prenada: v.estadoGestacion === 'PRENADA_OK' || v.estadoGestacion === 'GESTACION_VENCIDA',
          vencida: v.estadoGestacion === 'GESTACION_VENCIDA',
          meses:   v.gestProyectada
        };
      });
      // Enriquecer con TODAS las hembras del inventario: la que no tiene palpación
      // registrada ("sin chequeo") o quedó dudosa también le importa al modal de venta.
      todos.forEach(function(a) {
        if (a.sexo !== 'HEMBRA' && !App.estado._reproMap[a.codigo]) return;
        var e = App.estado._reproMap[a.codigo] ||
          (App.estado._reproMap[a.codigo] = { prenada: a.estadoReproductivo === 'Preñada', vencida: false, meses: '' });
        e.sexo   = 'HEMBRA';
        e.estado = a.estadoReproductivo || '';
      });
      var mapaRes  = {}; todos.forEach(function(a){ mapaRes[a.codigo] = a; });
      var vacas    = (vacasInt || []).slice();                    // ya viene ordenada (peor intervalo primero)
      var vacasAlerta = vacas.filter(function(v){ return v.alerta; }).length;

      var seenPr = {}, seenProp = {}, preds = [], prps = [];
      todos.forEach(function(a) {
        if (a.predio      && !seenPr[a.predio])        { seenPr[a.predio]=1;        preds.push(a.predio); }
        if (a.propietario && !seenProp[a.propietario]) { seenProp[a.propietario]=1; prps.push(a.propietario); }
      });
      preds.sort(); prps.sort();

      var html = '<div class="space-y-5">';
      html += App._subtabs('salida', '#/salida');

      // Tabs
      html += '<div class="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">' +
        '<button id="tab-sal-peso" onclick="App._tabSalida(\'peso\')" class="tab-sal-btn px-5 py-2 rounded-lg text-sm font-semibold bg-white shadow text-green-700"><i class="ph ph-scales" aria-hidden="true"></i> Por peso</button>' +
        '<button id="tab-sal-vacas" onclick="App._tabSalida(\'vacas\')" class="tab-sal-btn px-5 py-2 rounded-lg text-sm font-semibold text-gray-500 hover:text-gray-700">' +
          '<i class="ph ph-cow" aria-hidden="true"></i> Vacas' + (vacasAlerta > 0 ? ' <span class="bg-amber-500 text-white text-xs font-bold rounded-full px-1.5 py-0.5 ml-1">' + vacasAlerta + '</span>' : '') +
        '</button>' +
        '<button id="tab-sal-desc" onclick="App._tabSalida(\'desc\')" class="tab-sal-btn px-5 py-2 rounded-lg text-sm font-semibold text-gray-500 hover:text-gray-700">' +
          '<i class="ph ph-scissors" aria-hidden="true"></i> Descarte' + (descarte.length > 0 ? ' <span class="bg-red-500 text-white text-xs font-bold rounded-full px-1.5 py-0.5 ml-1">' + descarte.length + '</span>' : '') +
        '</button>' +
      '</div>';

      // ── Sección Por Peso ──────────────────────────────────────────────────
      html += '<div id="sec-sal-peso" class="space-y-4">';

      html += '<div class="bg-white rounded-xl border border-gray-200 p-5 flex flex-wrap items-center gap-4">' +
        '<div class="flex-1">' +
          '<h2 class="text-lg font-bold text-gray-900"><i class="ph ph-target" aria-hidden="true"></i> Animales con peso ≥ ' +
            '<input type="number" id="umbral-kg" value="' + umbral + '" min="50" max="800" step="5" ' +
              'class="form-input w-24 inline-block text-center font-bold text-green-700 py-1 px-2" ' +
              'oninput="App._aplicarFiltroSalida()"> kg' +
          '</h2>' +
          '<p class="text-sm text-gray-400 mt-1">Cambia el número para ajustar el criterio. Se actualiza instantáneamente. · Las vacas madres y las hembras <b><i class="ph ph-baby" aria-hidden="true"></i> preñadas</b> no aparecen aquí: se analizan en la pestaña <b><i class="ph ph-cow" aria-hidden="true"></i> Vacas</b>. Usa <b><i class="ph ph-cow" aria-hidden="true"></i> A Vacas</b> para mandar una hembra al grupo a mano.</p>' +
          '<p class="text-sm mt-2" style="color:var(--muted)">Cada hembra muestra su estado: ' +
            '<span class="chip-repro vacia">✓ Vacía</span> palpada sin preñez · ' +
            '<span class="chip-repro sinchequeo"><i class="ph ph-question" aria-hidden="true"></i> Sin chequeo</span> nunca palpada — <b>verificar antes de vender</b> · ' +
            '<span class="chip-repro dudosa"><i class="ph ph-question" aria-hidden="true"></i> DUDOSA</span> palpación no concluyente.</p>' +
        '</div>' +
        '<div class="flex gap-6">' +
          '<div class="text-center"><div id="sal-cnt-num" class="text-2xl font-black text-green-700">—</div><div class="text-xs text-gray-500">animales</div></div>' +
          '<div class="text-center"><div id="sal-avg-num" class="text-2xl font-black text-gray-800">— kg</div><div class="text-xs text-gray-500">peso prom.</div></div>' +
        '</div>' +
      '</div>';

      html += '<div class="flex flex-wrap gap-2 items-center">' +
        '<span class="text-xs text-gray-500 font-semibold">Filtrar por:</span>' +
        '<select id="sal-predio" onchange="App._aplicarFiltroSalida()" class="form-input w-auto text-sm py-1.5">' +
          '<option value="">Todas las fincas</option>' + preds.map(function(p){ return '<option>'+p+'</option>'; }).join('') +
        '</select>' +
        '<select id="sal-prop" onchange="App._aplicarFiltroSalida()" class="form-input w-auto text-sm py-1.5">' +
          '<option value="">Todos los propietarios</option>' + prps.map(function(p){ return '<option>'+p+'</option>'; }).join('') +
        '</select>' +
        '<span id="sal-count" class="text-xs text-gray-400 ml-auto"></span>' +
      '</div>';

      html += '<div id="sal-empty" class="hidden bg-white rounded-xl border border-gray-200 p-12 text-center">' +
        '<div class="text-5xl mb-3"><i class="ph ph-cow" aria-hidden="true"></i></div>' +
        '<h3 class="text-lg font-semibold text-gray-700 mb-1">Ningún animal alcanza ese peso todavía</h3>' +
        '<p class="text-sm text-gray-400">Reduce el umbral de peso o registra más mediciones.</p>' +
      '</div>';

      html += '<div class="bg-white rounded-xl border border-gray-200 overflow-hidden" id="sal-tabla">' +
        '<div class="overflow-x-auto"><table class="tabla-ganadero">' +
        '<thead><tr>' +
          '<th>Código</th><th>Tipo</th><th>Finca</th><th>Propietario</th>' +
          '<th class="text-right">Peso actual</th><th class="text-right">Peso inicial</th>' +
          '<th class="text-right">Ganancia</th><th>GDP</th><th>Días finca</th><th>Clasif.</th><th></th>' +
        '</tr></thead><tbody id="tbody-salida">';

      todos.forEach(function(a) {
        if (mapaVaca[a.codigo]) return;   // las vacas madres se analizan aparte (pestaña 🐄 Vacas)
        var peso     = parseFloat(a.pesoActual) || 0;
        var ganancia = peso - (parseFloat(a.pesoInicial) || 0);
        // El color sale de la escala unica, igual que en el resto de la app.
        var gdpStyle = a.ultimaGdp !== '' ? ' style="color:' + App.textoGdp(a.ultimaGdp) + '"' : '';
        // Estado reproductivo visible en cada HEMBRA de la lista de venta:
        // sólido = certeza (preñada), punteado = incertidumbre (dudosa / sin chequeo).
        var chipRepro = '', rowExtra = '';
        if (a.sexo === 'HEMBRA') {
          var er = a.estadoReproductivo || '';
          if (er === 'Preñada')         { chipRepro = ' <span class="chip-repro prenada"><i class="ph ph-baby" aria-hidden="true"></i> PREÑADA</span>'; rowExtra = ' fila-prenada'; }
          else if (er === 'Dudosa')     { chipRepro = ' <span class="chip-repro dudosa" title="Palpación no concluyente — podría estar preñada. Confirmar antes de vender."><i class="ph ph-question" aria-hidden="true"></i> DUDOSA</span>'; rowExtra = ' fila-dudosa'; }
          else if (er === 'No preñada') { chipRepro = ' <span class="chip-repro vacia" title="Palpada vacía — libre para venta.">✓ Vacía</span>'; }
          else if (er === 'En celo')    { chipRepro = ' <span class="chip-repro vacia" title="En celo — libre para venta."><i class="ph ph-fire" aria-hidden="true"></i> En celo</span>'; }
          else                          { chipRepro = ' <span class="chip-repro sinchequeo" title="Hembra SIN palpación registrada — confirmar que no esté preñada antes de vender."><i class="ph ph-question" aria-hidden="true"></i> Sin chequeo</span>'; }
        }
        html += '<tr class="fila-link sal-row' + rowExtra + '" ' +
          'data-peso="' + peso + '" ' +
          'data-predio="' + (a.predio||'') + '" ' +
          'data-prop="' + (a.propietario||'') + '" ' +
          'onclick="App.irAnimal(\'' + String(a.codigo).replace(/'/g, "\\'") + '\')">' +
          '<td class="font-bold text-gray-900">' + a.codigo + chipRepro + '</td>' +
          '<td>' + (a.tipo||'—') + '</td>' +
          '<td>' + (a.predio||'—') + '</td>' +
          '<td>' + (a.propietario||'—') + '</td>' +
          '<td class="text-right font-black text-green-700 text-base">' + App.fmt(peso, 1) + ' kg</td>' +
          '<td class="text-right text-gray-400">' + App.fmt(a.pesoInicial, 1) + ' kg</td>' +
          '<td class="text-right font-semibold ' + (ganancia >= 0 ? 'text-green-700' : 'text-red-600') + '">' +
            (ganancia >= 0 ? '+' : '') + App.fmt(ganancia, 1) + ' kg</td>' +
          '<td class="font-semibold"' + gdpStyle + '>' + (a.ultimaGdp !== '' ? App.fmt(a.ultimaGdp, 3) + ' kg/d' : '—') + '</td>' +
          '<td>' + (a.diasEnFinca||'—') + ' d</td>' +
          '<td>' + App.badge(a.clasificacion) + '</td>' +
          '<td class="whitespace-nowrap">' +
            (a.sexo === 'HEMBRA'
              ? '<button onclick="event.stopPropagation();App.moverAVacas(\'' + String(a.codigo).replace(/'/g, "\\'") + '\')" ' +
                  'class="btn-secondary text-xs px-2.5 py-1.5 whitespace-nowrap mr-1" ' +
                  'title="Mandar al grupo Vacas (reproductora). Dejará de aparecer para venta por peso."><i class="ph ph-cow" aria-hidden="true"></i> A Vacas</button>'
              : '') +
            '<button onclick="event.stopPropagation();App.abrirModalVenta(\'' + String(a.codigo).replace(/'/g, "\\'") + '\')" ' +
              'class="btn-primary text-xs px-3 py-1.5 whitespace-nowrap"><i class="ph ph-money" aria-hidden="true"></i> Vender</button>' +
          '</td>' +
        '</tr>';
      });

      html += '</tbody></table></div></div>';
      html += '</div>'; // fin sec-sal-peso

      // ── Sección Vacas (madres) ────────────────────────────────────────────
      html += '<div id="sec-sal-vacas" class="space-y-4 hidden">';
      html += '<div class="bg-white rounded-xl border border-gray-200 p-5">' +
        '<h2 class="text-lg font-bold text-gray-900"><i class="ph ph-cow" aria-hidden="true"></i> Vacas y reproductoras</h2>' +
        '<p class="text-sm text-gray-400 mt-1">Aquí están las hembras que ya tuvieron crías, las que están <b><i class="ph ph-baby" aria-hidden="true"></i> preñadas</b> (aunque sea su primer embarazo) y las que mandaste a mano. No se venden como el resto: primero se evalúa su productividad. ' +
          'Una vaca <b><i class="ph ph-baby" aria-hidden="true"></i> preñada</b> no es candidata aunque su último parto sea viejo. ' +
          'La <span class="text-amber-600 font-semibold"><i class="ph ph-warning" aria-hidden="true"></i> candidata a venta</span> es la que está <b>vacía</b> y lleva <b>' + (vacas[0] ? vacas[0].umbral : 13) + '+ meses sin parir</b>.</p>' +
      '</div>';
      if (vacas.length === 0) {
        html += '<div class="bg-white rounded-xl border border-gray-200 p-12 text-center">' +
          '<div class="text-5xl mb-3"><i class="ph ph-cow" aria-hidden="true"></i></div>' +
          '<h3 class="text-lg font-semibold text-gray-700 mb-1">Aún no hay vacas con crías registradas</h3>' +
          '<p class="text-sm text-gray-400">Cuando registres nacimientos, las madres aparecerán aquí con su intervalo entre partos.</p>' +
        '</div>';
      } else {
        html += '<div class="bg-white rounded-xl border border-gray-200 overflow-hidden">' +
          '<div class="overflow-x-auto"><table class="tabla-ganadero"><thead><tr>' +
            '<th>Código</th><th>Finca</th><th>Propietario</th><th class="text-center">Partos</th>' +
            '<th>Último parto</th><th class="text-center">Sin parir</th><th>Estado reproductivo</th><th class="text-right">Peso actual</th><th></th>' +
          '</tr></thead><tbody>';
        vacas.forEach(function(v) {
          var r    = mapaRes[v.codigo] || {};
          var peso = parseFloat(r.pesoActual) || 0;
          // Preñada (vigente o vencida) = señal de máxima visibilidad: fila teñida + chip ámbar.
          var esPren = v.estadoGestacion === 'PRENADA_OK' || v.estadoGestacion === 'GESTACION_VENCIDA';
          // Sin historial de partos (entró por preñez o a mano) → no aplica "meses sin parir".
          var badge = !v.tienePartos
            ? '<span class="text-xs text-gray-400">—</span>'
            : v.alerta
            ? '<span class="text-xs font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">' + v.mesesSinParir + ' meses</span>'
            : '<span class="text-xs font-medium text-gray-600 bg-gray-100 px-2 py-0.5 rounded-full">' + v.mesesSinParir + ' meses</span>';
          // Estado reproductivo proyectado a hoy — chips de estado reservados (ícono + texto, nunca color solo).
          var estadoRepro = v.estadoGestacion === 'PRENADA_OK'
            ? '<span class="chip-repro prenada" title="Hembra preñada — NO es candidata a venta."><i class="ph ph-baby" aria-hidden="true"></i> PREÑADA ~' + v.gestProyectada + ' m</span>'
            : v.estadoGestacion === 'GESTACION_VENCIDA'
            ? '<span class="chip-repro vencida" title="Preñez que ya pasó el término: ¿ya parió? Registrar el nacimiento o re-palpar antes de vender."><i class="ph ph-baby" aria-hidden="true"></i> VENCIDA ~' + v.gestProyectada + ' m</span>'
            : v.soloManual
            ? '<span class="chip-repro manual" title="Mandada al grupo de vacas a mano."><i class="ph ph-cow" aria-hidden="true"></i> Grupo manual</span>'
            : '<span class="chip-repro vacia">Vacía</span>';
          // Solo se puede devolver a venta la que entró únicamente por marcación manual.
          var btnQuitar = v.soloManual
            ? '<button onclick="event.stopPropagation();App.quitarDeVacas(\'' + String(v.codigo).replace(/'/g, "\\'") + '\')" class="btn-secondary text-xs px-2.5 py-1.5 whitespace-nowrap mr-1" title="Quitarla del grupo de vacas. Volverá a aparecer para venta por peso."><i class="ph ph-arrow-u-up-left" aria-hidden="true"></i> Quitar</button>'
            : '';
          // El botón de venta cambia para preñadas: guarda visual + confirmación extra en el modal.
          var btnVender = esPren
            ? '<button onclick="event.stopPropagation();App.abrirModalVenta(\'' + String(v.codigo).replace(/'/g, "\\'") + '\')" class="btn-vender-guard" title="PREÑADA — el modal pedirá una confirmación adicional antes de permitir la venta."><i class="ph ph-baby" aria-hidden="true"></i> Vender</button>'
            : '<button onclick="event.stopPropagation();App.abrirModalVenta(\'' + String(v.codigo).replace(/'/g, "\\'") + '\')" class="btn-secondary text-xs px-3 py-1.5 whitespace-nowrap"><i class="ph ph-money" aria-hidden="true"></i> Vender</button>';
          html += '<tr class="fila-link' + (esPren ? ' fila-prenada' : '') + '" onclick="App.irAnimal(\'' + String(v.codigo).replace(/'/g, "\\'") + '\')">' +
            '<td class="font-bold text-gray-900">' + v.codigo + (esPren ? ' <span title="Preñada — no vender"><i class="ph ph-baby" aria-hidden="true"></i></span>' : (v.alerta ? ' <span title="Candidata a venta por bajo rendimiento reproductivo"><i class="ph ph-warning" aria-hidden="true"></i></span>' : '')) + '</td>' +
            '<td>' + (v.predio || '—') + '</td>' +
            '<td>' + (v.propietario || '—') + '</td>' +
            '<td class="text-center font-semibold">' + v.partos + '</td>' +
            '<td>' + (v.ultimaCria ? App.fmtFecha(v.ultimaCria) : '—') + '</td>' +
            '<td class="text-center">' + badge + '</td>' +
            '<td>' + estadoRepro + '</td>' +
            '<td class="text-right font-semibold text-gray-800">' + (peso ? App.fmt(peso, 1) + ' kg' : '—') + '</td>' +
            '<td class="whitespace-nowrap">' + btnQuitar + btnVender + '</td>' +
          '</tr>';
        });
        html += '</tbody></table></div></div>';
      }
      html += '</div>'; // fin sec-sal-vacas

      // ── Sección Por Descarte ──────────────────────────────────────────────
      html += '<div id="sec-sal-desc" class="space-y-4 hidden">';
      if (descarte.length === 0) {
        html += '<div class="bg-white rounded-xl border border-gray-200 p-12 text-center">' +
          '<div class="text-5xl mb-3"><i class="ph ph-scissors" aria-hidden="true"></i></div>' +
          '<h3 class="text-lg font-semibold text-gray-700 mb-1">Sin animales marcados para descarte</h3>' +
          '<p class="text-sm text-gray-400">Cuando marques un animal para descarte desde su ficha, aparecerá aquí.</p>' +
        '</div>';
      } else {
        html += '<div class="bg-white rounded-xl border border-gray-200 overflow-hidden">' +
          '<div class="overflow-x-auto"><table class="tabla-ganadero">' +
          '<thead><tr><th>Código</th><th>Tipo</th><th>Finca</th><th>Propietario</th>' +
            '<th class="text-right">Peso actual</th><th>GDP</th><th>Motivo</th><th>Marcado el</th><th>Observación</th><th></th>' +
          '</tr></thead><tbody>';
        descarte.forEach(function(a) {
          var peso     = parseFloat(a.pesoActual) || 0;
          // El color sale de la escala unica, igual que en el resto de la app.
          var gdpStyle = a.ultimaGdp !== '' ? ' style="color:' + App.textoGdp(a.ultimaGdp) + '"' : '';
          // Una preñada marcada para descarte también debe gritar su estado antes de venderse.
          var vrD = mapaVaca[a.codigo];
          var esPrenD = (a.estadoReproductivo === 'Preñada') ||
            (vrD && (vrD.estadoGestacion === 'PRENADA_OK' || vrD.estadoGestacion === 'GESTACION_VENCIDA'));
          html += '<tr class="fila-link' + (esPrenD ? ' fila-prenada' : '') + '" onclick="App.irAnimal(\'' + String(a.codigo).replace(/'/g, "\\'") + '\')">' +
            '<td class="font-bold text-gray-900">' + a.codigo +
              (esPrenD ? ' <span class="chip-repro prenada" title="Hembra preñada — verificar antes de vender."><i class="ph ph-baby" aria-hidden="true"></i> PREÑADA</span>' : '') + '</td>' +
            '<td>' + (a.tipo||'—') + '</td>' +
            '<td>' + (a.predio||'—') + '</td>' +
            '<td>' + (a.propietario||'—') + '</td>' +
            '<td class="text-right font-bold text-gray-800">' + App.fmt(peso, 1) + ' kg</td>' +
            '<td class="font-semibold"' + gdpStyle + '>' + (a.ultimaGdp !== '' ? App.fmt(a.ultimaGdp, 3) + ' kg/d' : '—') + '</td>' +
            '<td><span class="text-xs font-medium text-red-700 bg-red-50 px-2 py-0.5 rounded-full">' + (a.motivoDescarte || '—') + '</span></td>' +
            '<td class="text-gray-400 text-xs">' + (a.fechaDescarte ? App.fmtFecha(a.fechaDescarte) : '—') + '</td>' +
            '<td class="text-gray-500 text-xs max-w-xs truncate">' + (a.obsDescarte || '—') + '</td>' +
            '<td><button onclick="event.stopPropagation();App.abrirModalVenta(\'' + String(a.codigo).replace(/'/g, "\\'") + '\')" ' +
              'class="bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs px-3 py-1.5 font-medium whitespace-nowrap"><i class="ph ph-money" aria-hidden="true"></i> Vender</button></td>' +
          '</tr>';
        });
        html += '</tbody></table></div></div>';
      }
      html += '</div>'; // fin sec-sal-desc

      html += '</div>'; // fin space-y-5
      App.renderMain(html);
      App._aplicarFiltroSalida();
      if (tabInicial) App._tabSalida(tabInicial);
    });
    });
  },

  // Manda una hembra de "Por peso" al grupo <i class="ph ph-cow" aria-hidden="true"></i> Vacas (reproductora). Tras guardar,
  // recarga la vista quedándose en la pestaña Vacas para confirmar el movimiento.
  moverAVacas: function(codigo) {
    App.api('marcarEnVacas', [codigo, true], function(r) {
      if (!r || !r.ok) { App.toast((r && r.error) || 'No se pudo mover.', 'error'); return; }
      App.toast(codigo + ' movida al grupo Vacas. Ya no aparece para venta por peso.', 'success');
      App.vistaSalida('vacas');
    });
  },

  // Quita una hembra del grupo <i class="ph ph-cow" aria-hidden="true"></i> Vacas (solo aplica a las que entraron a mano).
  // Vuelve a aparecer para venta por peso. Recarga quedándose en la pestaña Por peso.
  quitarDeVacas: function(codigo) {
    App.api('marcarEnVacas', [codigo, false], function(r) {
      if (!r || !r.ok) { App.toast((r && r.error) || 'No se pudo quitar.', 'error'); return; }
      App.toast(codigo + ' quitada del grupo de vacas. Vuelve a venta por peso.', 'success');
      App.vistaSalida('peso');
    });
  },

  // Filtro unificado para la vista Para Venta — lee umbral + predio + propietario
  _aplicarFiltroSalida: function() {
    var kg   = parseFloat(((document.getElementById('umbral-kg')  || {}).value) || 340);
    var pr   = ((document.getElementById('sal-predio') || {}).value || '');
    var prop = ((document.getElementById('sal-prop')   || {}).value || '');

    var vis = 0, totalPeso = 0;
    document.querySelectorAll('.sal-row').forEach(function(tr) {
      var peso = parseFloat(tr.dataset.peso) || 0;
      var ok   = peso >= kg &&
                 (!pr   || tr.dataset.predio === pr) &&
                 (!prop || tr.dataset.prop   === prop);
      tr.style.display = ok ? '' : 'none';
      if (ok) { vis++; totalPeso += peso; }
    });

    // Actualizar stats
    var cntEl  = document.getElementById('sal-cnt-num');
    var avgEl  = document.getElementById('sal-avg-num');
    var cntTxt = document.getElementById('sal-count');
    var empty  = document.getElementById('sal-empty');
    var tabla  = document.getElementById('sal-tabla');

    if (cntEl)  cntEl.textContent  = vis;
    if (avgEl)  avgEl.textContent  = (vis > 0 ? App.fmt(totalPeso / vis, 1) : '—') + ' kg';
    if (cntTxt) cntTxt.textContent = vis + ' animal' + (vis !== 1 ? 'es' : '');
    if (empty)  empty.classList.toggle('hidden', vis > 0);
    if (tabla)  tabla.classList.toggle('hidden', vis === 0);
  },

  _tabSalida: function(tab) {
    var secs = { peso: 'sec-sal-peso', vacas: 'sec-sal-vacas', desc: 'sec-sal-desc' };
    var tabs = { peso: 'tab-sal-peso', vacas: 'tab-sal-vacas', desc: 'tab-sal-desc' };
    Object.keys(secs).forEach(function(k) {
      var sec = document.getElementById(secs[k]);
      if (sec) sec.classList.toggle('hidden', k !== tab);
      var btn = document.getElementById(tabs[k]);
      if (btn) {
        var on = (k === tab);
        btn.classList.toggle('bg-white', on);
        btn.classList.toggle('shadow', on);
        btn.classList.toggle('text-green-700', on);
        btn.classList.toggle('text-gray-500', !on);
      }
    });
  },

  // Con multi-selección la fecha de seguimiento es opcional y por-tipo la calcula el
  // backend; aquí solo se muestra/oculta el campo y se limpia al desactivarlo.
  _guardarSanidad: function(codigo) {
    var fecha = (document.getElementById('s_fecha') || {}).value || '';
    if (!fecha) { App.toast('La fecha es obligatoria.', 'error'); return; }
    var procs = App._procLeer('s');
    if (procs.length === 0) { App.toast('Marca al menos un procedimiento.', 'error'); return; }
    var resp   = (document.getElementById('s_resp') || {}).value || '';
    var obsGen = ((document.getElementById('s_obs') || {}).value || '').trim();

    // Cada procedimiento va con SU medicamento, SU dosis y SU observación. La
    // observación general se anexa a todos, separada, para no perderla ni
    // confundirla con la del procedimiento.
    var eventos = procs.map(function(pr) {
      return {
        codigo:               codigo,
        fecha:                fecha,
        tipo:                 pr.tipo,
        medicamento:          pr.medicamento,
        dosis:                pr.dosis,
        responsable:          resp,
        observacion:          App._uniqJoin([pr.observacion, obsGen], ' | '),
        proxima_fecha:        pr.proxima_fecha,
        requiere_seguimiento: pr.requiere_seguimiento
      };
    });
    App._guardarEventosEnCadena(eventos, codigo);
  },

  // Guarda una lista de eventos sanitarios uno tras otro y resume el resultado.
  // Compartido por el formulario individual y por el de Registro.
  _guardarEventosEnCadena: function(eventos, codigo, extras) {
    extras = extras || [];
    var total = eventos.length + extras.length;
    App.mostrarLoading('Guardando ' + total + ' registro' + (total !== 1 ? 's' : '') + '…');
    var idx = 0, errores = [], conSeg = 0;
    function siguiente() {
      if (idx >= extras.length + eventos.length) {
        App.cerrarModal();
        if (errores.length === total) { App.toast('No se pudo guardar nada.', 'error'); return; }
        var okN = total - errores.length;
        var msg = okN + ' registro' + (okN !== 1 ? 's' : '') + ' guardado' + (okN !== 1 ? 's' : '') + ' ✓' +
                  (conSeg ? ' · ' + conSeg + ' con refuerzo programado' : '');
        if (errores.length) msg += ' · ' + errores.length + ' con error (' + errores.join(', ') + ')';
        App.toast(msg, errores.length ? 'info' : 'success');
        App.irAnimal(codigo);
        return;
      }
      var esExtra = idx < extras.length;
      var item    = esExtra ? extras[idx] : eventos[idx - extras.length];
      var fn      = esExtra ? item.fn   : 'saveEventoSanitario';
      var args    = esExtra ? item.args : [item];
      var etiqueta = esExtra ? (item.etiqueta || fn) : item.tipo;
      idx++;
      App.api(fn, args, function(r) {
        if (r && r.ok) { if (r.proxima_fecha) conSeg++; } else errores.push(etiqueta);
        siguiente();
      }, function() { errores.push(etiqueta); siguiente(); });
    }
    siguiente();
  }
};



window.App = App;
