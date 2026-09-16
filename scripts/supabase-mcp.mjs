// Uses Codex's authenticated MCP transport. No model turn and no copied credentials.
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import fs from "node:fs";
const child = spawn("codex", ["app-server", "--stdio"], {
  stdio: ["pipe", "pipe", "pipe"],
  windowsHide: true,
});
const waiting = new Map();
let id = 0;
child.stderr.on("data", () => {});
createInterface({ input: child.stdout }).on("line", (line) => {
  try {
    const x = JSON.parse(line);
    if (x.id != null && waiting.has(x.id)) {
      const { resolve, reject } = waiting.get(x.id);
      waiting.delete(x.id);
      x.error ? reject(Error(JSON.stringify(x.error))) : resolve(x.result);
    }
  } catch {}
});
const call = (method, params) =>
  new Promise((resolve, reject) => {
    const i = ++id;
    waiting.set(i, { resolve, reject });
    child.stdin.write(JSON.stringify({ id: i, method, params }) + "\n");
  });
const timer = setTimeout(() => {
  console.error("MCP request timed out");
  child.kill();
  process.exitCode = 1;
}, 90000);
try {
  await call("initialize", {
    clientInfo: { name: "ganax-setup", version: "1.0.0" },
    capabilities: { experimentalApi: true },
  });
  child.stdin.write(
    JSON.stringify({ method: "initialized", params: {} }) + "\n",
  );
  const thread = await call("thread/start", {
    cwd: process.cwd(),
    ephemeral: true,
  });
  const threadId = thread.thread.id;
  const status = await call("mcpServerStatus/list", { threadId });
  const sb = status.data.find((x) => x.name === "supabase");
  if (!sb) throw Error("Supabase MCP not found in this Codex profile");
  if (!process.argv[2]) {
    fs.mkdirSync(".local", { recursive: true });
    fs.writeFileSync(".local/mcp-tools.json", JSON.stringify(sb));
    console.log(
      JSON.stringify(
        {
          status: sb.runtimeStatus,
          auth: sb.authStatus,
          tools: Object.keys(sb.tools),
        },
        null,
        2,
      ),
    );
  } else {
    const request = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
    const result = await call("mcpServer/tool/call", {
      threadId,
      server: "supabase",
      tool: request.tool,
      arguments: request.arguments || {},
    });
    if (process.argv[3]) {
      fs.writeFileSync(process.argv[3], JSON.stringify(result));
      console.log("MCP result saved locally.");
    } else console.log(JSON.stringify(result));
  }
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  clearTimeout(timer);
  child.kill();
}
