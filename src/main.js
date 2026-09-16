import { createClient } from "@supabase/supabase-js";
import { hasConfirmedEmail } from "./auth-session.js";
import "@fontsource/geist/latin-400.css";
import "@fontsource/geist/latin-500.css";
import "@fontsource/geist/latin-600.css";
import "@fontsource/fraunces/latin-500.css";
import "@phosphor-icons/web/regular";
import "./legacy.css";
import "../tokens.css";
import "./style.css";
import shell from "./shell.html?raw";

let Chart, App;
const root = document.getElementById("root");
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const sb = url && key ? createClient(url, key) : null;
const pendingEmailKey = "gestion-ganadera-pending-email";
let authCallbackPending =
  /(?:[?#&])(?:access_token|refresh_token|code|token_hash)=/.test(
    location.href,
  );
const state = {
  demo: new URLSearchParams(location.search).has("demo"),
  session: null,
  org: null,
  memberships: [],
  account: null,
  started: false,
  booting: false,
  pending: 0,
};
const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const num = (v, d = 0) =>
  new Intl.NumberFormat("es-CO", { maximumFractionDigits: d }).format(
    Number(v) || 0,
  );
const date = (v) =>
  v
    ? new Intl.DateTimeFormat("es-CO", {
        dateStyle: "medium",
        timeZone: "America/Bogota",
      }).format(new Date(v))
    : "—";
const dateKey = (value = new Date()) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Bogota",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(value)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
};
const icon = (name) => `<i class="ph ph-${name}" aria-hidden="true"></i>`;
const brand = `<a class="wordmark" href="/" aria-label="Gestión Ganadera, inicio"><span class="brand-mark">G</span>Gestión <span>Ganadera</span></a>`;

async function request(fn, args = []) {
  if (!state.demo) {
    const { data } = await sb.auth.getSession();
    state.session = data.session;
    if (!state.session) throw Error("Inicia sesión para continuar.");
  }
  const response = await fetch("/api/rpc", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(state.session
        ? { Authorization: "Bearer " + state.session.access_token }
        : {}),
    },
    body: JSON.stringify({ fn, args, org: state.org, demo: state.demo }),
    signal: AbortSignal.timeout(30000),
  });
  const body = await response.json();
  if (!response.ok)
    throw Error(body.error || "No se pudo completar la operación.");
  return body.data;
}
function alertText(el, message, error = false) {
  el.textContent = message;
  el.className = "form-notice " + (error ? "is-error" : "is-success");
  el.hidden = false;
}

function authUrlParams() {
  const params = new URLSearchParams(location.search);
  const hash = location.hash.slice(1);
  if (hash.includes("=")) {
    new URLSearchParams(hash).forEach((value, name) => params.set(name, value));
  }
  return params;
}

function hasAuthCallback() {
  const params = authUrlParams();
  return ["access_token", "refresh_token", "code", "token_hash"].some((key) =>
    params.has(key),
  );
}

function authIssue() {
  const params = authUrlParams();
  const code = params.get("error_code");
  if (!code && !params.get("error")) return null;
  return {
    code,
    description:
      params.get("error_description") || "No pudimos validar el enlace.",
  };
}

function authErrorMessage(error) {
  const message = error?.message || "No pudimos completar la solicitud.";
  if (/email rate limit/i.test(message))
    return "Espera un momento antes de solicitar otro correo.";
  if (/email address not authorized/i.test(message))
    return "El servicio de correo todavía no está habilitado para este destinatario.";
  if (/invalid login credentials/i.test(message))
    return "El correo o la contraseña no coinciden.";
  if (/user already registered/i.test(message))
    return "Este correo ya tiene una cuenta. Ingresa o solicita una nueva confirmación.";
  if (/password should be at least/i.test(message))
    return "La contraseña debe tener al menos 10 caracteres.";
  return message;
}

function landing() {
  document.body.className = "marketing";
  root.innerHTML = `<nav class="site-nav">${brand}<div class="site-links"><a href="#funciones">La plataforma</a><a href="#planes">Planes</a></div><a class="button secondary" href="#login">Ingresar ${icon("arrow-up-right")}</a></nav>
 <main class="landing-main"><section class="hero"><div class="hero-copy"><p class="lead-in">Del campo a las decisiones.</p><h1>Tu ganadería,<br><em>en orden.</em></h1><p class="hero-description">Conoce cada animal. Sigue su crecimiento. Organiza el trabajo de tu finca, con toda la información en un solo lugar.</p><div class="hero-actions"><a class="button primary" href="#registro">Empieza tu prueba ${icon("arrow-right")}</a><a class="text-link" href="/?demo=1">Explorar demostración ${icon("arrow-up-right")}</a></div><p class="quiet">14 días de prueba · Sin tarjeta de crédito</p></div>
 <div class="hero-art" aria-label="Vista de ejemplo del seguimiento ganadero"><div class="art-heading"><span>El Porvenir</span><span class="sample-tag">Datos de ejemplo</span></div><div class="landscape"><div class="sun"></div><div class="hill hill-back"></div><div class="hill hill-front"></div><div class="field-line"></div><div class="cattle-icon">${icon("cow")}</div></div><div class="art-data"><div><span>El hato, a la vista</span><strong>26 <small>animales activos</small></strong></div><a href="/?demo=1" aria-label="Abrir demostración">${icon("arrow-up-right")}</a></div><div class="art-rule"><span>Pesajes</span><span>Sanidad</span><span>Resultados</span></div></div></section>
 <section class="product-section" id="funciones"><div class="section-heading"><h2>Menos datos sueltos.<br>Más claridad para tu finca.</h2><p>Desde el primer registro hasta la venta, conserva la historia que necesitas para decidir.</p></div><div class="feature-list"><a href="/?demo=1#/animales"><span class="feature-icon">${icon("cow")}</span><div><h3>Cada animal tiene su historia</h3><p>Ingresos, nacimientos, parentesco, fotografías y movimientos del hato.</p></div>${icon("arrow-up-right")}</a><a href="/?demo=1#/planeacion"><span class="feature-icon">${icon("chart-line-up")}</span><div><h3>El crecimiento, con perspectiva</h3><p>Pesajes, ganancia diaria y proyecciones que distinguen estimaciones de datos medidos.</p></div>${icon("arrow-up-right")}</a><a href="/?demo=1#/tareas"><span class="feature-icon">${icon("calendar-check")}</span><div><h3>El trabajo del campo, organizado</h3><p>Tareas por predio y potrero, seguimiento sanitario y registro de lluvias.</p></div>${icon("arrow-up-right")}</a><a href="/?demo=1#/finanzas"><span class="feature-icon">${icon("wallet")}</span><div><h3>Cuentas que puedes consultar</h3><p>Compras, ventas y gastos de operación, junto a sus soportes.</p></div>${icon("arrow-up-right")}</a></div></section>
 <section id="planes" class="plans-section"><div class="section-heading"><h2>Un espacio para<br>cada ganadería.</h2><p>Empieza con 14 días de prueba y hasta 100 animales activos. Los planes comerciales estarán disponibles próximamente.</p></div><div class="plan-table"><div class="plan-row"><div><h3>Esencial</h3><p>Para llevar el control diario de tu finca.</p></div><span>Hasta 250 animales</span><span class="quiet">Precio por anunciar</span><a class="text-link" href="#registro">Empezar prueba ${icon("arrow-right")}</a></div><div class="plan-row"><div><h3>Profesional</h3><p>Más capacidad para una operación en crecimiento.</p></div><span>Hasta 1.000 animales</span><span class="quiet">Precio por anunciar</span><a class="text-link" href="#registro">Empezar prueba ${icon("arrow-right")}</a></div></div><p class="quiet">No se realizan cobros automáticos. Tus datos siguen disponibles para consulta y exportación al finalizar la prueba.</p></section></main>
 <footer class="site-footer">${brand}<span>Hecho para el trabajo del campo.</span><a href="#login">Acceder a mi ganadería ${icon("arrow-right")}</a></footer>`;
}
function authScreen(mode = "login", context = {}) {
  document.body.className = "marketing";
  const signup = mode === "registro",
    recover = mode === "recuperar",
    reset = mode === "nueva-clave",
    resend = mode === "reenviar-confirmacion",
    confirmation = mode === "confirmar",
    confirming = mode === "confirmando";
  const pendingEmail =
    context.email || localStorage.getItem(pendingEmailKey) || "";
  const expired = context.issue?.code === "otp_expired";
  const cardTitle = signup
    ? "Crear una cuenta"
    : recover
      ? "Recuperar contraseña"
      : reset
        ? "Nueva contraseña"
        : resend
          ? expired
            ? "Este enlace ya venció"
            : "Reenviar confirmación"
          : confirmation
            ? "Confirma tu correo"
            : confirming
              ? "Confirmando tu cuenta"
              : "Ingresar a Gestión Ganadera";
  const cardCopy = signup
    ? "Empieza con 14 días para organizar tu hato y tu operación."
    : recover
      ? "Te enviaremos un enlace seguro para recuperar tu acceso."
      : reset
        ? "Elige una contraseña de al menos 10 caracteres."
        : resend
          ? expired
            ? "Los enlaces de seguridad son temporales. Escribe tu correo y te enviaremos uno nuevo."
            : "Escribe el correo con el que creaste tu cuenta."
          : confirmation
            ? `Enviamos un enlace a <strong>${esc(pendingEmail)}</strong>. Ábrelo para activar tu cuenta.`
            : confirming
              ? "Estamos validando el enlace y preparando tu ganadería."
              : "Usa el correo de tu cuenta para continuar.";
  const introTitle = signup
    ? "Tu operación,<br>en un solo lugar."
    : recover || reset || resend
      ? "Recupera<br>tu acceso."
      : "El campo sigue.<br>Tú también.";
  const passwordField = `<label>Contraseña<div class="password-field"><input name="password" type="password" required minlength="${signup || reset ? 10 : 1}" autocomplete="${signup || reset ? "new-password" : "current-password"}" ${signup || reset ? 'placeholder="Mínimo 10 caracteres" aria-describedby="password-help"' : ""}><button type="button" data-toggle-password aria-label="Mostrar contraseña">${icon("eye")}</button></div>${signup || reset ? '<small id="password-help" class="field-help">Usa 10 caracteres o más.</small>' : ""}</label>`;
  const authForm = confirmation
    ? `<div class="confirmation-state">${icon("envelope-simple-open")}<p>Si no lo ves, revisa correo no deseado o solicita un enlace nuevo.</p><a class="button secondary wide" href="#reenviar-confirmacion">Enviar otro enlace</a></div>`
    : confirming
      ? `<div class="confirmation-state" role="status">${icon("circle-notch")}<p>Este proceso puede tardar unos segundos.</p></div>`
      : `<form id="auth-form">${signup ? '<div class="auth-steps" aria-label="Proceso de creación"><span class="is-current">1. Cuenta</span><span>2. Confirma</span><span>3. Empieza</span></div><label>Tu nombre<input name="displayName" required minlength="2" maxlength="100" autocomplete="name" placeholder="Ej. María Pérez"></label><label>Nombre de tu ganadería<input name="farm" required minlength="2" maxlength="100" autocomplete="organization" placeholder="Ej. Ganadería El Porvenir"></label>' : ""}${!reset ? `<label>Correo electrónico<input name="email" type="email" required autocomplete="email" placeholder="tu@correo.com" value="${esc(pendingEmail)}"></label>` : ""}${!recover && !resend ? passwordField : ""}<p class="form-notice" id="auth-notice" role="status" aria-live="polite" hidden></p><button class="button primary wide" ${!sb ? "disabled" : ""}>${signup ? "Crear cuenta" : recover ? "Enviar enlace" : resend ? "Enviar otro enlace" : reset ? "Guardar contraseña" : "Ingresar"} ${icon("arrow-right")}</button>${resend ? '<p class="auth-reassurance">El nuevo enlace llegará al correo de tu cuenta y abrirá esta aplicación.</p>' : ""}</form>`;
  root.innerHTML = `<nav class="site-nav">${brand}<a class="text-link" href="/">Volver al inicio</a></nav><main class="auth-layout"><div class="auth-intro"><div><p class="lead-in">Gestión segura, desde cualquier lugar.</p><h1>${introTitle}</h1><p>Tus animales, pesajes, sanidad y tareas quedan conectados a una cuenta protegida.</p><a class="text-link" href="/?demo=1">Explorar la demostración ${icon("arrow-up-right")}</a></div><div class="auth-field-note"><span>${icon("shield-check")}</span><div><strong>Información protegida</strong><small>Cada ganadería conserva su propio espacio de trabajo.</small></div></div></div><section class="auth-card"><div class="auth-card-mark">${icon(resend ? "envelope" : signup ? "barn" : "cow")}</div><p class="auth-eyebrow">${resend ? "Confirmación de cuenta" : signup ? "Nueva ganadería" : "Acceso a tu espacio"}</p><h2>${cardTitle}</h2><p>${cardCopy}</p>${authForm}${!sb && !confirmation && !confirming ? '<p class="form-notice is-error">El acceso está pendiente de configuración. La demostración sí está disponible.</p>' : ""}<div class="auth-links">${mode === "login" ? '<a href="#recuperar">Olvidé mi contraseña</a><span>¿Primera vez? <a href="#registro">Crear cuenta</a></span>' : confirmation ? '<a href="#login">Ya confirmé mi correo</a>' : confirming ? "" : '<a href="#login">Volver a ingresar</a>'}</div></section></main>`;
  document.querySelectorAll("[data-toggle-password]").forEach((toggle) => {
    toggle.onclick = () => {
      const input = toggle.previousElementSibling;
      const showing = input.type === "text";
      input.type = showing ? "password" : "text";
      toggle.setAttribute(
        "aria-label",
        showing ? "Mostrar contraseña" : "Ocultar contraseña",
      );
      toggle.innerHTML = icon(showing ? "eye" : "eye-slash");
    };
  });
  const authFormElement = document.getElementById("auth-form");
  if (!authFormElement) return;
  authFormElement.onsubmit = async (e) => {
    e.preventDefault();
    const form = e.currentTarget,
      button = form.querySelector("button"),
      notice = document.getElementById("auth-notice");
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    const values = Object.fromEntries(new FormData(form));
    try {
      let result;
      if (signup)
        result = await sb.auth.signUp({
          email: values.email,
          password: values.password,
          options: {
            data: {
              farm_name: values.farm,
              display_name: values.displayName,
            },
            emailRedirectTo: location.origin + "/",
          },
        });
      else if (recover)
        result = await sb.auth.resetPasswordForEmail(values.email, {
          redirectTo: location.origin + "/",
        });
      else if (resend)
        result = await sb.auth.resend({
          type: "signup",
          email: values.email,
          options: { emailRedirectTo: location.origin + "/" },
        });
      else if (reset)
        result = await sb.auth.updateUser({ password: values.password });
      else
        result = await sb.auth.signInWithPassword({
          email: values.email,
          password: values.password,
        });
      if (result.error) throw result.error;
      if (signup) {
        if (result.data.session) await sb.auth.signOut({ scope: "local" });
        localStorage.setItem(pendingEmailKey, values.email);
        authScreen("confirmar", { email: values.email });
        return;
      }
      if (recover) {
        alertText(
          notice,
          "Si el correo tiene una cuenta, recibirás un enlace de recuperación.",
        );
        return;
      }
      if (resend) {
        localStorage.setItem(pendingEmailKey, values.email);
        alertText(notice, "Listo. Revisa tu correo para confirmar la cuenta.");
        return;
      }
      if (reset) {
        alertText(notice, "Contraseña actualizada. Ya puedes ingresar.");
        location.hash = "#login";
        return;
      }
      if (result.data.session && !hasConfirmedEmail(result.data.session)) {
        await sb.auth.signOut({ scope: "local" });
        throw Error("Confirma tu correo antes de ingresar.");
      }
      state.session = result.data.session;
      location.hash = "#/";
      await bootApp();
    } catch (error) {
      alertText(notice, authErrorMessage(error), true);
    } finally {
      button.disabled = false;
      button.removeAttribute("aria-busy");
    }
  };
}

async function bootApp() {
  if (state.started || state.booting) return;
  state.booting = true;
  const loaded = await Promise.all([
    import("chart.js/auto"),
    import("./legacy.js"),
  ]);
  Chart = loaded[0].default;
  window.Chart = Chart;
  App = window.App;
  if (!state.demo) {
    if (!sb) {
      state.booting = false;
      authScreen();
      return;
    }
    const { data } = await sb.auth.getSession();
    state.session = data.session;
    if (!state.session) {
      state.booting = false;
      authScreen();
      return;
    }
    const { data: verifiedUser, error: userError } = await sb.auth.getUser();
    if (userError || !verifiedUser.user) {
      await sb.auth.signOut({ scope: "local" });
      state.session = null;
      state.booting = false;
      authScreen();
      alertText(
        document.getElementById("auth-notice"),
        "La sesión anterior terminó. Ingresa de nuevo para continuar.",
        true,
      );
      return;
    }
    state.session = { ...state.session, user: verifiedUser.user };
    if (!hasConfirmedEmail(state.session)) {
      const pendingEmail = state.session.user?.email || "";
      await sb.auth.signOut({ scope: "local" });
      state.session = null;
      state.booting = false;
      authScreen("reenviar-confirmacion", { email: pendingEmail });
      alertText(
        document.getElementById("auth-notice"),
        "Confirma tu correo antes de ingresar.",
        true,
      );
      return;
    }
    try {
      const { data: members, error } = await sb
        .from("miembros")
        .select("organizacion_id,rol,organizaciones(nombre)")
        .eq("user_id", state.session.user.id)
        .order("organizacion_id");
      if (error) throw error;
      state.memberships = members || [];
      const savedOrg = localStorage.getItem("gestion-ganadera-org");
      state.org =
        state.memberships.find((member) => member.organizacion_id === savedOrg)
          ?.organizacion_id ||
        state.memberships.find((member) => member.rol === "owner")
          ?.organizacion_id ||
        state.memberships[0]?.organizacion_id ||
        (await request("crearGanaderia"));
      state.account = await request("cuenta");
    } catch (e) {
      state.booting = false;
      authScreen();
      alertText(
        document.getElementById("auth-notice"),
        "No pudimos abrir tu ganadería. " + e.message,
        true,
      );
      return;
    }
  }
  document.body.className = "workspace";
  root.innerHTML = shell;
  state.started = true;
  state.booting = false;
  const name = state.demo
    ? "Ganadería de demostración"
    : state.account.organization.nombre;
  const banner = document.getElementById("workspace-banner");
  banner.innerHTML = state.demo
    ? `<span>${icon("flask")} Demostración · Todos los datos son ficticios</span><a href="/#registro">Crear mi cuenta ${icon("arrow-right")}</a>`
    : `<span>${icon("barn")} ${esc(name)}</span><a href="#/cuenta">${state.account.subscription.estado === "trialing" ? "Prueba hasta " + date(state.account.subscription.trial_ends_at) : "Mi plan"} ${icon("arrow-right")}</a>`;
  window.GestionGanaderaLogin = {
    salir: async () => {
      if (sb && !state.demo) await sb.auth.signOut();
      location.href = "/";
    },
  };
  window.GestionGanaderaTheme = {
    toggle: () => {
      const theme =
        document.documentElement.dataset.theme === "light" ? "dark" : "light";
      document.documentElement.dataset.theme = theme;
      localStorage.setItem("gestion-ganadera-theme", theme);
      App.rutear();
    },
  };
  document.documentElement.dataset.theme =
    localStorage.getItem("gestion-ganadera-theme") || "light";
  App.api = (fn, args, success, failure) => {
    state.pending++;
    App.mostrarLoading();
    request(fn, args)
      .then((r) => {
        if (r?.params) App.params = r.params;
        success?.(r);
      })
      .catch((e) => {
        App.toast(
          e.name === "TimeoutError"
            ? "La conexión tardó demasiado. Actualiza la vista."
            : e.message,
          "error",
        );
        failure?.(e);
      })
      .finally(() => {
        state.pending--;
        if (!state.pending) App.ocultarLoading();
      });
  };
  App._pinFin = () => (state.demo ? "demo" : "authenticated");
  // The authenticated workspace replaces the old local PIN gate.
  App._pantallaPin = () => App._renderFinanzas();
  const previousRoute = App.rutear;
  App.rutear = () => {
    if (!state.started) return;
    if (location.hash === "#/cuenta") {
      Object.values(App.estado.charts).forEach((c) => c.destroy());
      App.estado.charts = {};
      accountView();
    } else previousRoute();
  };
  App.vistaDashboard = dashboard;
  const closeModal = App.cerrarModal;
  let focusBeforeModal = null;
  const openModal = App.abrirModal;
  App.abrirModal = (html) => {
    focusBeforeModal = document.activeElement;
    openModal(html);
    const box = document.getElementById("modal-box");
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");
    box.setAttribute("aria-label", "Formulario de registro");
    box.querySelector("input,select,button")?.focus();
  };
  App.cerrarModal = () => {
    closeModal();
    focusBeforeModal?.focus();
  };
  document.addEventListener("keydown", (e) => {
    const overlay = document.getElementById("modal-overlay");
    if (!overlay || overlay.classList.contains("hidden")) return;
    if (e.key === "Escape") {
      App.cerrarModal();
      return;
    }
    if (e.key === "Tab") {
      const items = [
        ...overlay.querySelectorAll("button,input,select,textarea,a[href]"),
      ].filter((x) => !x.disabled && x.getClientRects().length);
      if (!items.length) return;
      const first = items[0],
        last = items.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });
  App.init();
}
function dashboard() {
  App.renderMain(
    '<div class="loading-placeholder" role="status">Preparando el resumen de tu ganadería…</div>',
  );
  App.api("getDashboardFull", [{}], (summary) => {
    const animals = summary.dashboard.tablaResumen.map((a) => ({
      ...a,
      estado: "ACTIVO",
      peso_actual: a.pesoActual,
      gdp_actual: a.ultimaGdp,
    }));
    const active = animals.filter((a) => a.estado === "ACTIVO");
    const values = active
      .map((a) => Number(a.peso_actual || a.ultimo_peso))
      .filter((x) => x > 0);
    const measured = active.filter((a) => Number(a.gdp_actual ?? a.gdp) > 0);
    const avg = measured.length
      ? measured.reduce((s, a) => s + Number(a.gdp_actual ?? a.gdp), 0) /
        measured.length
      : null;
    const groups = {};
    active.forEach((a) => {
      const p = a.predio || "Sin predio";
      groups[p] = (groups[p] || 0) + 1;
    });
    const title = state.demo
      ? "Así se ve una finca en orden."
      : state.account.organization.nombre;
    App.renderMain(`<div class="dashboard-heading"><div><p class="view-date">${new Intl.DateTimeFormat("es-CO", { weekday: "long", day: "numeric", month: "long" }).format(new Date())}</p><h1>${esc(title)}</h1><p>Una mirada al hato y a lo que sigue.</p></div><a class="button secondary" href="#/tareas">Ver tareas ${icon("arrow-right")}</a></div>
  <section class="metrics" aria-label="Indicadores principales"><div><div class="metric-top"><span>Animales activos</span>${icon("cow")}</div><strong>${num(active.length)}</strong><small>En tu inventario actual</small></div><div><div class="metric-top"><span>Peso promedio</span>${icon("scales")}</div><strong>${values.length ? num(values.reduce((a, b) => a + b, 0) / values.length, 1) : "—"} <small>kg</small></strong><small>Último pesaje registrado</small></div><div><div class="metric-top"><span>Ganancia diaria</span>${icon("trend-up")}</div><strong>${avg === null ? "—" : num(avg, 2)} <small>kg/día</small></strong><small>Promedio de registros válidos</small></div><div><div class="metric-top"><span>Predios con ganado</span>${icon("map-pin-area")}</div><strong>${Object.keys(groups).length}</strong><small>Ubicaciones del hato activo</small></div></section>
  <div class="overview-grid"><section class="surface growth-panel"><div class="panel-heading"><h2>El crecimiento del hato</h2><a href="#/planeacion" class="text-link">Planeación ${icon("arrow-up-right")}</a></div><p class="quiet">Promedio de peso registrado por mes · kg</p><div class="growth-chart"><canvas id="growth-chart" aria-label="Evolución del peso promedio" role="img"></canvas><p id="chart-empty" hidden>Aún no hay pesajes. Registra el primero desde la ficha de un animal.</p></div></section><section class="surface distribution"><h2>Tu hato, por predio</h2><div class="distribution-list">${
    Object.entries(groups)
      .map(
        ([p, n]) =>
          `<div><div><span>${esc(p)}</span><strong>${n}</strong></div><meter min="0" max="${active.length}" value="${n}" aria-label="${esc(p)}: ${n} animales"></meter></div>`,
      )
      .join("") ||
    '<p class="quiet">Los predios aparecerán al registrar tus animales.</p>'
  }</div><a class="text-link" href="#/predios">Organizar predios ${icon("arrow-right")}</a></section></div>
  <section class="surface recent-panel"><div class="panel-heading"><h2>Un vistazo a tus animales</h2><a class="text-link" href="#/animales">Ver inventario ${icon("arrow-right")}</a></div>${
    animals.length
      ? `<div class="clean-table-wrap"><table class="clean-table"><thead><tr><th>Animal</th><th>Predio</th><th>Categoría</th><th>Último peso</th><th>Estado</th><th><span class="sr-only">Ver ficha</span></th></tr></thead><tbody>${animals
          .slice(0, 5)
          .map(
            (a) =>
              `<tr><td><a href="#/animal/${encodeURIComponent(a.codigo)}">${icon("cow")} <strong>${esc(a.codigo)}</strong></a></td><td>${esc(a.predio || "—")}</td><td>${esc(a.tipo || "—")}</td><td>${a.peso_actual || a.ultimo_peso ? num(a.peso_actual || a.ultimo_peso, 1) + " kg" : "—"}</td><td><span class="status-pill">${esc(a.estado)}</span></td><td><a href="#/animal/${encodeURIComponent(a.codigo)}" aria-label="Ver ${esc(a.codigo)}">${icon("arrow-up-right")}</a></td></tr>`,
          )
          .join("")}</tbody></table></div>`
      : `<div class="empty-state">${icon("cow")}<h3>Tu ganadería empieza aquí</h3><p>Agrega tu primer animal para construir su historia.</p><button class="button primary" onclick="App.abrirModalAnimal()">Registrar animal ${icon("plus")}</button></div>`
  }</section>`);
    ((data) => {
      const records = Array.isArray(data)
        ? data
        : data?.meses || data?.evolucion || [];
      const usable = records.filter(
        (x) => Number(x.pesoPromedio ?? x.peso_promedio ?? x.promedio) > 0,
      );
      if (!usable.length) {
        document.getElementById("chart-empty")?.removeAttribute("hidden");
        return;
      }
      const canvas = document.getElementById("growth-chart");
      if (!canvas) return;
      const styles = getComputedStyle(document.documentElement);
      App.estado.charts.overview = new Chart(canvas, {
        type: "line",
        data: {
          labels: usable.map((x) => x.mes || x.label),
          datasets: [
            {
              data: usable.map(
                (x) => x.pesoPromedio ?? x.peso_promedio ?? x.promedio,
              ),
              borderColor: styles.getPropertyValue("--accent").trim(),
              backgroundColor: styles.getPropertyValue("--accent-soft").trim(),
              fill: true,
              tension: 0.25,
              pointRadius: 3,
              borderWidth: 2,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { grid: { display: false } },
            y: { beginAtZero: false },
          },
        },
      });
    })(summary.evolucion);
  });
}
async function accountView() {
  App.closeSidebar();
  document.getElementById("topbar-title").textContent = "Cuenta y plan";
  App.renderMain('<p class="loading-placeholder">Cargando tu cuenta…</p>');
  if (state.demo) {
    App.renderMain(
      `<section class="surface account-box"><h1>Tu ganadería merece su propio espacio.</h1><p>Esta es una demostración con datos ficticios. Crea una cuenta para guardar tus registros, consultar tu plan y solicitar soporte.</p><a class="button primary" href="/#registro">Crear mi cuenta ${icon("arrow-right")}</a></section>`,
    );
    return;
  }
  try {
    const account = await request("cuenta");
    state.account = account;
    const sub = account.subscription;
    const status = {
      trialing: "En periodo de prueba",
      active: "Suscripción activa",
      past_due: "Pago pendiente",
      canceled: "Suscripción cancelada",
    }[sub.estado];
    const organizationPicker =
      state.memberships.length > 1
        ? `<section class="surface"><h2>Tus ganaderías</h2><p class="quiet">Elige el espacio que quieres consultar.</p><label>Ganadería activa<select id="organization-picker">${state.memberships
            .map(
              (member) =>
                `<option value="${esc(member.organizacion_id)}" ${member.organizacion_id === state.org ? "selected" : ""}>${esc(member.organizaciones?.nombre || member.organizacion_id)} · ${member.rol === "owner" ? "propietario" : member.rol === "editor" ? "edición" : "consulta"}</option>`,
            )
            .join("")}</select></label></section>`
        : "";
    const teamSection =
      account.role === "owner"
        ? `<section class="surface"><h2>Equipo</h2><p class="quiet">La persona debe crear primero su cuenta con el mismo correo. Después podrá elegir esta ganadería desde su cuenta.</p><form id="team-form"><label>Correo de la persona<input name="email" type="email" required maxlength="320" autocomplete="email" placeholder="persona@correo.com"></label><label>Tipo de acceso<select name="role"><option value="editor">Puede registrar y editar</option><option value="viewer">Solo consulta</option></select></label><button class="button primary">Agregar al equipo ${icon("arrow-right")}</button><p id="team-notice" class="form-notice" role="status" hidden></p></form></section>`
        : "";
    const profileSection = `<section class="surface"><h2>Tu perfil</h2><form id="profile-form"><label>Nombre para mostrar<input name="displayName" required minlength="2" maxlength="100" autocomplete="name" value="${esc(account.profile.nombre_mostrar)}"></label><button class="button primary">Guardar nombre ${icon("arrow-right")}</button><p id="profile-notice" class="form-notice" role="status" hidden></p></form></section>`;
    App.renderMain(
      `<div class="dashboard-heading"><div><p class="view-date">Mi cuenta</p><h1>${esc(account.organization.nombre)}</h1><p>${esc(account.profile.nombre_mostrar)} · ${esc(account.profile.correo)}</p></div><button id="export-data" class="button secondary">${icon("download-simple")} Exportar datos</button></div>${organizationPicker}<div class="account-grid"><section class="surface"><h2>Tu plan</h2><span class="status-pill">${status}</span><h3 class="plan-name">${esc(account.plans.find((p) => p.id === sub.plan_id)?.nombre)}</h3><p>${sub.estado === "trialing" ? "Prueba hasta " + date(sub.trial_ends_at) : "Vigencia hasta " + date(sub.current_period_end)}</p><p class="quiet">Al finalizar la vigencia puedes consultar y exportar tus datos. Los nuevos registros requieren un plan activo.</p><form id="plan-form"><label>Solicitar un plan<select name="plan"><option value="esencial">Esencial · hasta 250 animales</option><option value="profesional">Profesional · hasta 1.000 animales</option></select></label><button class="button primary" ${account.role !== "owner" ? "disabled" : ""}>Solicitar información ${icon("arrow-right")}</button><p class="quiet">Los precios y el cobro se anunciarán próximamente. Esta solicitud no genera cargos.</p><p id="plan-notice" class="form-notice" role="status" ${account.request ? "" : "hidden"}>${account.request ? "Solicitud registrada: " + esc(account.request.plan_id) : ""}</p></form></section>${profileSection}<section class="surface"><h2>Cuéntanos qué necesitas</h2><p class="quiet">Tu solicitud quedará registrada para que el equipo de soporte pueda revisarla.</p><form id="support-form"><label>Asunto<input name="subject" required minlength="3" maxlength="150" placeholder="¿Con qué necesitas ayuda?"></label><label>Mensaje<textarea name="message" required minlength="10" maxlength="5000" rows="4" placeholder="Describe lo que ocurrió o lo que necesitas."></textarea></label><button class="button primary">Registrar solicitud ${icon("arrow-right")}</button><p id="support-notice" class="form-notice" role="status" hidden></p></form></section>${teamSection}</div><section class="surface"><h2>Solicitudes de soporte</h2>${account.tickets.length ? account.tickets.map((t) => `<div class="ticket-row"><div><strong>${esc(t.asunto)}</strong><p class="quiet">${date(t.created_at)}</p></div><span class="status-pill">${esc(t.estado.replace("_", " "))}</span></div>`).join("") : '<p class="quiet">Todavía no has registrado solicitudes.</p>'}</section>`,
    );
    const picker = document.getElementById("organization-picker");
    if (picker)
      picker.onchange = () => {
        localStorage.setItem("gestion-ganadera-org", picker.value);
        location.reload();
      };
    document.getElementById("plan-form").onsubmit = (e) =>
      submitForm(e, "plan-notice", async (f) => {
        await request("solicitarPlan", [f.get("plan")]);
        return "Solicitud registrada. No se ha realizado ningún cobro.";
      });
    document.getElementById("support-form").onsubmit = (e) =>
      submitForm(e, "support-notice", async (f) => {
        await request("crearTicket", [f.get("subject"), f.get("message")]);
        return "Tu solicitud quedó registrada.";
      });
    document.getElementById("profile-form").onsubmit = (e) =>
      submitForm(e, "profile-notice", async (f) => {
        const displayName = f.get("displayName");
        await request("actualizarPerfil", [displayName]);
        account.profile.nombre_mostrar = displayName;
        return "Tu nombre quedó actualizado.";
      });
    const teamForm = document.getElementById("team-form");
    if (teamForm)
      teamForm.onsubmit = (e) =>
        submitForm(e, "team-notice", async (f) => {
          await request("invitarMiembro", [f.get("email"), f.get("role")]);
          teamForm.reset();
          return "La persona ya tiene acceso a esta ganadería.";
        });
    document.getElementById("export-data").onclick = async (e) => {
      e.target.disabled = true;
      try {
        const data = await request("exportarDatos");
        const a = document.createElement("a");
        const u = URL.createObjectURL(
          new Blob([JSON.stringify(data, null, 2)], {
            type: "application/json",
          }),
        );
        a.href = u;
        a.download = "gestion-ganadera-respaldo-" + dateKey() + ".json";
        a.click();
        setTimeout(() => URL.revokeObjectURL(u), 1000);
      } catch (err) {
        App.toast(err.message, "error");
      } finally {
        e.target.disabled = false;
      }
    };
  } catch (e) {
    App.renderMain(
      '<p class="form-notice is-error">' + esc(e.message) + "</p>",
    );
  }
}
async function submitForm(e, id, action) {
  e.preventDefault();
  const button = e.currentTarget.querySelector("button");
  button.disabled = true;
  try {
    alertText(
      document.getElementById(id),
      await action(new FormData(e.currentTarget)),
    );
  } catch (err) {
    alertText(document.getElementById(id), err.message, true);
  } finally {
    button.disabled = false;
  }
}
function route() {
  if (state.started) return;
  const hash = location.hash;
  const issue = authIssue();
  if (issue) {
    authScreen("reenviar-confirmacion", { issue });
  } else if (hasAuthCallback()) {
    authCallbackPending = true;
    authScreen("confirmando");
  } else if (
    [
      "#login",
      "#registro",
      "#recuperar",
      "#nueva-clave",
      "#reenviar-confirmacion",
    ].includes(hash)
  )
    authScreen(hash.slice(1));
  else if (state.demo || hash.startsWith("#/")) bootApp();
  else landing();
}
window.addEventListener("hashchange", route);
if (sb)
  sb.auth.onAuthStateChange((event, session) => {
    state.session = session;
    if (event === "PASSWORD_RECOVERY") {
      state.started = false;
      authScreen("nueva-clave");
    }
    if (
      event === "SIGNED_IN" &&
      hasConfirmedEmail(session) &&
      (authCallbackPending || hasAuthCallback())
    ) {
      authCallbackPending = false;
      localStorage.removeItem(pendingEmailKey);
      history.replaceState(null, "", location.pathname + "#/");
      state.started = false;
      bootApp();
    }
    if (event === "SIGNED_OUT" && state.started && !state.demo)
      location.href = "/";
  });
route();
