#!/usr/bin/env node
/**
 * Build + assemble release/Brickwire and zip it to release.zip.
 * Layout = repository layout (runs without npm install — the bridge has zero runtime deps):
 *   extension/dist/       unpacked MV3 extension (Load unpacked → this folder)
 *   bridge/dist/          bridge.mjs + dashboard.html
 *   scripts/studio-e2e.mjs, install.bat, start.bat, stop.bat, update.bat, start.command, docs/, README.md
 *   + full sources and tests (npm install && npm run test:all to rebuild/verify)
 */
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "release", "Brickwire");
const ZIP = path.join(ROOT, "release.zip");
const run = (cmd, args, cwd = ROOT) => execFileSync(cmd, args, { cwd, stdio: "inherit" });

if (!process.argv.includes("--no-build")) run(process.execPath, ["--import", "tsx", "scripts/build.mjs"]);

rmSync(path.join(ROOT, "release"), { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const copy = (from, to = from) => {
  const src = path.join(ROOT, from);
  if (!existsSync(src)) throw new Error("missing " + from);
  cpSync(src, path.join(OUT, to), { recursive: true });
};
// Built artifacts (ready to run, no npm install needed) …
copy("extension/dist");
copy("bridge/dist");
// … plus the full source so the project can be rebuilt / modified / tested.
for (const f of ["shared", "bridge/src", "extension/src", "extension/public", "tests", "scripts", "docs", "packs"]) copy(f);
for (const f of ["README.md", ".env.example", ".gitignore", "install.bat", "start.bat", "stop.bat", "update.bat", "start.command", "LICENSE", "package.json", "tsconfig.json"]) copy(f);
const pkg = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8"));
writeFileSync(path.join(OUT, "VERSION.txt"), `Brickwire ${pkg.version}\nbuilt ${new Date().toISOString()}\n`);

rmSync(ZIP, { force: true });
run("zip", ["-r", "-q", "-X", ZIP, "Brickwire"], path.join(ROOT, "release"));
console.log("release.zip →", ZIP);
