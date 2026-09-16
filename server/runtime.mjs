import vm from "node:vm";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
export const schemas = JSON.parse(
  fs.readFileSync(new URL("./schema.json", import.meta.url)),
);
export const primaryKeys = Object.fromEntries(
  Object.entries(schemas).map(([t, c]) => [
    t,
    t === "catalogos" ? ["categoria", "valor"] : [c[0]],
  ]),
);
const names = [
  "Calculo",
  "Clasificacion",
  "animal",
  "mediciones",
  "ventas",
  "sanidad",
  "dashboard",
  "repro",
  "planeacion",
  "tareas",
  "lluvias",
  "facturas",
];
const scripts = names.map(
  (n) =>
    new vm.Script(
      fs.readFileSync(new URL(`./domain/${n}.js`, import.meta.url), "utf8"),
      { filename: n + ".js" },
    ),
);
export const allowed = new Set(
  JSON.parse(fs.readFileSync(new URL("./allowed.json", import.meta.url))),
);
export const readOnly = new Set(
  [...allowed].filter((n) => /^(get|list|verificarPin)/.test(n)),
);
export function dateFormat(d, zone, format) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(d))
      .map((x) => [x.type, x.value]),
  );
  return format.replace(
    /yyyy|MM|dd|HH|mm/g,
    (k) =>
      p[{ yyyy: "year", MM: "month", dd: "day", HH: "hour", mm: "minute" }[k]],
  );
}
export function createRuntime(input) {
  const data = Object.fromEntries(
    Object.entries(schemas).map(([t, cols]) => [
      t,
      (input[t] || []).map((row) =>
        Object.fromEntries(cols.map((k) => [k, row[k] ?? ""])),
      ),
    ]),
  );
  const clean = (t, row) =>
    Object.fromEntries(schemas[t].map((k) => [k, row[k] ?? ""]));
  const eq = (a, b) => String(a ?? "").trim() === String(b ?? "").trim();
  const context = {
    console,
    SCHEMAS: schemas,
    getAll: (t) => data[t],
    findOne: (t, k, v) => data[t].find((r) => eq(r[k], v)) || null,
    findMany: (t, k, v) => data[t].filter((r) => eq(r[k], v)),
    insert: (t, row) => {
      const r = clean(t, row);
      data[t].push(r);
      return r;
    },
    update: (t, k, v, changes) => {
      const i = data[t].findIndex((r) => eq(r[k], v));
      if (i < 0) throw Error("Registro no encontrado");
      data[t][i] = clean(t, { ...data[t][i], ...changes });
      return data[t][i];
    },
    deleteRecord: (t, k, v) => {
      const i = data[t].findIndex((r) => eq(r[k], v));
      if (i < 0) return false;
      data[t].splice(i, 1);
      return true;
    },
    codigoExiste: (code, except) =>
      data.animales.some((a) => eq(a.codigo, code) && !eq(a.codigo, except)),
    getUniqueValues: (t, k) =>
      [...new Set(data[t].map((r) => r[k]).filter(Boolean))].sort(),
    getCatalogo: (k) =>
      data.catalogos.filter((r) => r.categoria === k).map((r) => r.valor),
    generarId: (prefix) => prefix + "-" + randomUUID(),
    _invalidarCache: () => {},
    Session: { getScriptTimeZone: () => "America/Bogota" },
    Utilities: { formatDate: dateFormat, getUuid: randomUUID },
    _exigirPinFinanzas: () => {},
    verificarPinFinanzas: () => ({ ok: true }),
    _propTexto: (key, fallback) => fallback || "",
    disabledMail: () => {},
    limpiarCacheServidor: () => ({ ok: true, msg: "Datos actualizados." }),
    getSheet: (t) => ({
      getDataRange: () => ({
        getValues: () => [
          schemas[t],
          ...data[t].map((r) => schemas[t].map((k) => r[k] ?? "")),
        ],
      }),
      getRange: (row, col) => ({
        setValue: (value) => {
          data[t][row - 2][schemas[t][col - 1]] = value;
        },
        setValues: (rows) => {
          data[t][row - 2] = Object.fromEntries(
            schemas[t].map((k, i) => [k, rows[0][i] ?? ""]),
          );
        },
      }),
    }),
  };
  vm.createContext(context, {
    codeGeneration: { strings: false, wasm: false },
  });
  scripts.forEach((s) => s.runInContext(context, { timeout: 2000 }));
  // External integrations are replaced by the API, never by Google services.
  context.enviarNotificacionSanitaria = () => {};
  return {
    data,
    context,
    call(fn, args = []) {
      if (!allowed.has(fn) || typeof context[fn] !== "function")
        throw Error("Operación no disponible");
      context.__args = JSON.parse(JSON.stringify(args));
      return new vm.Script(`${fn}(...__args)`).runInContext(context, {
        timeout: 5000,
      });
    },
  };
}
export function diffRows(before, after) {
  const changes = [];
  for (const table of Object.keys(schemas)) {
    const key = (r) =>
      JSON.stringify(primaryKeys[table].map((k) => r[k] ?? ""));
    const a = new Map((before[table] || []).map((r) => [key(r), r]));
    const b = new Map((after[table] || []).map((r) => [key(r), r]));
    for (const [k, row] of a)
      if (!b.has(k)) changes.push({ table, remove: true, row });
    for (const [k, row] of b)
      if (JSON.stringify(row) !== JSON.stringify(a.get(k)))
        changes.push({ table, row });
  }
  return changes;
}
