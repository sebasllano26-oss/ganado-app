import http from "node:http";
import { createServer } from "vite";
import { existsSync } from "node:fs";
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
else if (existsSync(".env")) process.loadEnvFile(".env");
const [{ default: rpcHandler }, { default: chatHandler }] = await Promise.all([
  import("../api/rpc.mjs"),
  import("../api/chat.mjs"),
]);
const vite = await createServer({
  server: { middlewareMode: true },
  appType: "spa",
});
http
  .createServer(async (req, res) => {
    const apiPath = req.url?.split("?")[0];
    if (apiPath === "/api/rpc" || apiPath === "/api/chat") {
      res.status = (code) => {
        res.statusCode = code;
        return res;
      };
      res.json = (obj) => {
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(obj));
      };
      let text = "";
      for await (const c of req) {
        text += c;
        if (Buffer.byteLength(text) > 4_000_000) {
          res.status(413).json({ error: "Archivo demasiado grande" });
          return;
        }
      }
      try {
        req.body = text ? JSON.parse(text) : {};
      } catch {
        res.status(400).json({ error: "Solicitud inválida" });
        return;
      }
      await (apiPath === "/api/chat" ? chatHandler : rpcHandler)(req, res);
    } else vite.middlewares(req, res);
  })
  .listen(5173, "127.0.0.1", () =>
    console.log("Gestión Ganadera: http://127.0.0.1:5173"),
  );
