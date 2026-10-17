// Sandbox-only loader: lets `node --experimental-strip-types` resolve `./x.js` imports to `./x.ts`
// (the real project runs tests through tsx; this file is not needed there).
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
export async function resolve(specifier, context, next) {
  if (specifier.endsWith(".js") && (specifier.startsWith(".") || specifier.startsWith("/")) && context.parentURL) {
    const ts = new URL(specifier.replace(/\.js$/, ".ts"), context.parentURL);
    if (existsSync(fileURLToPath(ts))) return next(ts.href, context);
  }
  return next(specifier, context);
}
