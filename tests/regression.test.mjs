import test from "node:test";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
for (const name of [
  "test_escala",
  "test_paridad",
  "test_costo_ventas",
  "test_tareas",
  "test_numeros",
  "test_mediciones",
  "test_peso_hoy",
  "test_facturas",
]) {
  test("original regression: " + name, () => {
    try {
      execFileSync(
        process.execPath,
        [fileURLToPath(new URL("./legacy/" + name + ".cjs", import.meta.url))],
        { encoding: "utf8" },
      );
    } catch (e) {
      throw Error((e.stdout || "") + "\n" + (e.stderr || e.message));
    }
  });
}
