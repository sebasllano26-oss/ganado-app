import { createClient } from "@supabase/supabase-js";
import {
  createRuntime,
  diffRows,
  readOnly,
  allowed,
} from "../server/runtime.mjs";
import { demoData } from "../server/demo.mjs";
import { randomUUID } from "node:crypto";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function validateText(value, max = 5000) {
  if (typeof value !== "string" || value.length > max)
    throw Error("Texto inválido");
  return value;
}
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST")
    return res.status(405).json({ error: "Método no permitido" });
  try {
    const {
      fn,
      args = [],
      org,
      demo,
    } = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    if (
      typeof fn !== "string" ||
      !Array.isArray(args) ||
      JSON.stringify(args).length > 3_500_000
    )
      return res.status(400).json({ error: "Solicitud inválida" });
    if (demo === true) {
      if (!readOnly.has(fn))
        return res.status(403).json({
          error:
            "La demostración es de consulta. Crea tu cuenta para registrar datos.",
        });
      return res.json({ data: createRuntime(demoData()).call(fn, args) });
    }
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const key =
      process.env.SUPABASE_PUBLISHABLE_KEY ||
      process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key)
      return res.status(503).json({
        error:
          "La conexión del servicio está pendiente. Puedes explorar la demostración.",
      });
    const auth = req.headers.authorization;
    if (!auth?.startsWith("Bearer "))
      return res.status(401).json({ error: "Inicia sesión para continuar." });
    const sb = createClient(url, key, {
      global: { headers: { Authorization: auth } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const {
      data: { user },
      error: authError,
    } = await sb.auth.getUser(auth.slice(7));
    if (authError || !user)
      return res
        .status(401)
        .json({ error: "Tu sesión venció. Ingresa de nuevo." });
    if (fn === "crearGanaderia") {
      const nombre =
        args[0] == null || args[0] === ""
          ? null
          : validateText(args[0], 100).trim();
      if (nombre != null && nombre.length < 2)
        throw Error("Escribe el nombre de tu ganadería.");
      const { data, error } = await sb.rpc("crear_ganaderia", { nombre });
      if (error) throw error;
      return res.json({ data });
    }
    if (!uuid.test(org || ""))
      return res.status(400).json({ error: "Selecciona una ganadería." });
    const { data: member, error: memberError } = await sb
      .from("miembros")
      .select("rol")
      .eq("organizacion_id", org)
      .eq("user_id", user.id)
      .maybeSingle();
    if (memberError || !member)
      return res
        .status(403)
        .json({ error: "No tienes acceso a esta ganadería." });
    if (fn === "cuenta") {
      const results = await Promise.all([
        sb.from("organizaciones").select("id,nombre").eq("id", org).single(),
        sb
          .from("soporte")
          .select("*")
          .eq("organizacion_id", org)
          .order("created_at", { ascending: false })
          .limit(20),
        sb
          .from("perfiles")
          .select(
            "user_id,correo,nombre_mostrar,ganaderia_solicitada,creado_el,actualizado_el",
          )
          .eq("user_id", user.id)
          .single(),
      ]);
      for (const x of results) if (x.error) throw x.error;
      return res.json({
        data: {
          organization: results[0].data,
          tickets: results[1].data,
          profile: results[2].data,
          role: member.rol,
          email: user.email,
        },
      });
    }
    if (fn === "invitarMiembro") {
      const correo = validateText(args[0], 320).trim();
      const rol = args[1];
      if (!correo || !["editor", "viewer"].includes(rol))
        throw Error("Escribe el correo y elige el tipo de acceso.");
      const { data, error } = await sb.rpc("invitar_miembro", {
        org,
        correo,
        nuevo_rol: rol,
      });
      if (error) throw error;
      return res.json({ data: { ok: true, userId: data } });
    }
    if (fn === "actualizarPerfil") {
      const nombre = validateText(args[0], 100).trim();
      if (nombre.length < 2) throw Error("Escribe tu nombre completo.");
      const { error } = await sb.rpc("actualizar_perfil", {
        nombre_mostrar: nombre,
      });
      if (error) throw error;
      return res.json({ data: { ok: true } });
    }
    if (fn === "crearTicket") {
      const { data, error } = await sb.rpc("crear_ticket", {
        org,
        asunto: validateText(args[0], 150),
        mensaje: validateText(args[1]),
      });
      if (error) throw error;
      return res.json({ data: { ok: true, id: data } });
    }
    if (!allowed.has(fn) && fn !== "exportarDatos")
      return res.status(400).json({ error: "Operación no disponible" });
    if (["subirFotoAnimal", "subirYLeerFactura"].includes(fn)) {
      if (member.rol === "viewer")
        return res.status(403).json({ error: "Tu acceso es de consulta." });
      const p = args[0] || {};
      const mime = p.mimeType || "image/jpeg";
      if (!["image/jpeg", "image/png", "image/webp"].includes(mime))
        throw Error("Usa una imagen JPG, PNG o WebP.");
      const bytes = Buffer.from(p.base64 || "", "base64");
      if (!bytes.length || bytes.length > 2_500_000)
        throw Error("La imagen debe pesar menos de 2,5 MB.");
      const valid =
        (mime === "image/jpeg" && bytes[0] === 255 && bytes[1] === 216) ||
        (mime === "image/png" && bytes.subarray(1, 4).toString() === "PNG") ||
        (mime === "image/webp" &&
          bytes.subarray(0, 4).toString() === "RIFF" &&
          bytes.subarray(8, 12).toString() === "WEBP");
      if (!valid)
        throw Error("El contenido no corresponde a una imagen válida.");
      const path = `${org}/${randomUUID()}.${mime.split("/")[1]}`;
      const { error } = await sb.storage
        .from("ganax-files")
        .upload(path, bytes, { contentType: mime });
      if (error) throw error;
      const ref = "storage://" + path;
      return res.json({
        data:
          fn === "subirFotoAnimal"
            ? { ok: true, url: ref, foto_url: ref }
            : {
                ok: true,
                drive_id: path,
                drive_url: ref,
                lecturaOk: false,
                campos: {},
                error:
                  "Revisa la imagen e ingresa los campos. La lectura automática se habilitará en una próxima versión.",
              },
      });
    }
    const { data: snapshot, error } = await sb.rpc("ganax_snapshot", { org });
    if (error) throw error;
    if (fn === "exportarDatos") return res.json({ data: snapshot });
    const runtime = createRuntime(snapshot),
      before = structuredClone(runtime.data);
    const result = runtime.call(fn, args);
    const changes = diffRows(before, runtime.data);
    if (changes.length && !readOnly.has(fn)) {
      // Failed compound operations are rolled back in full.
      if (result?.ok === false) return res.json({ data: result });
      for (const change of changes)
        for (const [k, v] of Object.entries(change.row)) {
          if (
            typeof v === "string" &&
            v.includes("/storage/v1/object/sign/ganax-files/")
          )
            change.row[k] =
              "storage://" +
              decodeURIComponent(
                v
                  .split("/storage/v1/object/sign/ganax-files/")[1]
                  .split("?")[0],
              );
          if (
            typeof change.row[k] === "string" &&
            change.row[k].startsWith("storage://") &&
            !change.row[k].startsWith(`storage://${org}/`)
          )
            throw Error("Archivo de otra ganadería");
        }
      const { error: commitError } = await sb.rpc("ganax_commit", {
        org,
        expected_revision: snapshot.revision,
        changes,
        action: fn,
      });
      if (commitError) throw commitError;
    }
    async function sign(value) {
      if (typeof value === "string" && value.startsWith(`storage://${org}/`)) {
        const { data, error } = await sb.storage
          .from("ganax-files")
          .createSignedUrl(value.slice(10), 3600);
        return error ? "" : data.signedUrl;
      }
      if (Array.isArray(value)) return Promise.all(value.map(sign));
      if (value && typeof value === "object")
        return Object.fromEntries(
          await Promise.all(
            Object.entries(value).map(async ([k, v]) => [k, await sign(v)]),
          ),
        );
      return value;
    }
    return res.json({ data: await sign(result) });
  } catch (e) {
    console.error(
      "La operación de Gestión Ganadera falló:",
      e.code || e.name || "Error",
    );
    const message = e.message || "No pudimos completar la operación.";
    const conflict = e.code === "40001";
    const safe = conflict
      ? "Los datos cambiaron mientras trabajabas. Actualiza la vista e intenta de nuevo."
      : e.code && /^23/.test(e.code)
        ? "Revisa los datos: hay un registro duplicado o una relación pendiente."
        : message;
    return res.status(conflict ? 409 : 400).json({ error: safe });
  }
}
