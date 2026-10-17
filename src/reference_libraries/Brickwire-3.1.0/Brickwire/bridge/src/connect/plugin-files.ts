/** Copies the Brickwire Figma plugin into <dataDir>/figma-plugin with the bridge port filled in (import manifest.json in Figma desktop). */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function pluginSourceDir() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const c = [path.resolve(here, "..", "..", "figma-plugin"), path.resolve(here, "..", "..", "..", "figma-plugin"), path.resolve(process.cwd(), "figma-plugin")];
  return c.find((d) => fs.existsSync(path.join(d, "manifest.json"))) ?? null;
}
export function preparePlugin(dataDir: string, port: number) {
  const src = pluginSourceDir();
  const dir = path.join(dataDir, "figma-plugin");
  if (!src) return { dir: null as string | null, error: "figma-plugin folder is missing from the Brickwire folder" };
  fs.mkdirSync(dir, { recursive: true });
  for (const f of ["manifest.json", "code.js", "ui.html"]) {
    let t = fs.readFileSync(path.join(src, f), "utf8");
    t = t.replace(/http:\/\/localhost:\d+/g, `http://localhost:${port}`).replace(/const PORT = \d+;/, `const PORT = ${port};`);
    const target = path.join(dir, f);
    if (!fs.existsSync(target) || fs.readFileSync(target, "utf8") !== t) fs.writeFileSync(target, t);
  }
  return { dir, manifest: path.join(dir, "manifest.json") };
}
