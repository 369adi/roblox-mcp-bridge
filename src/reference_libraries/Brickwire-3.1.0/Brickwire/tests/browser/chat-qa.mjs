// Browser QA for the in-app chat ("Чаты" + "Чат плагина"). Self-contained: starts a fake OpenAI-compatible LLM and a
// bridge on free ports with a temporary data dir, then drives /app with Playwright.
//   npm run build && npm run test:chat          (CHROMIUM=/path/to/chrome to override the browser)
import { chromium } from "playwright";
import http from "node:http";
import net from "node:net";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const freePort = () => new Promise((res) => { const s = net.createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => res(p)); }); });
const LLM_PORT = await freePort(), PORT = await freePort(), BASE = `http://127.0.0.1:${PORT}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "bw-chatqa-"));
// ---- fake LLM: streams a markdown answer in small chunks
let n = 0;
const llm = http.createServer(async (req, res) => {
  if (req.url.endsWith("/models")) { res.writeHead(200, { "Content-Type": "application/json" }); return res.end(JSON.stringify({ data: [{ id: "fake-1" }, { id: "fake-2" }] })); }
  let raw = ""; for await (const c of req) raw += c;
  const b = JSON.parse(raw || "{}");
  const last = JSON.stringify(b.messages?.at(-1)?.content ?? ""), sys = JSON.stringify(b.messages?.[0]?.content ?? "");
  n++;
  const wantsJson = /JSON/i.test(sys) && /(plan|review|verif|steps|issues)/i.test(sys);
  if (!b.stream) { res.writeHead(200, { "Content-Type": "application/json" }); return res.end(JSON.stringify({ choices: [{ message: { content: wantsJson ? JSON.stringify({ steps: [{ id: "s1", title: "Do it", deps: [] }], ok: true, issues: [] }) : "Ответ #" + n } }] })); }
  res.writeHead(200, { "Content-Type": "text/event-stream" });
  const text = `Ответ №${n} на: ${last.slice(1, 60)}\n\n## План\n- шаг один\n- шаг **два**\n\n\`\`\`lua\nlocal x = ${n}\nprint(x)\n\`\`\`\nКонец ответа ${n}.`;
  for (const p of text.match(/[\s\S]{1,6}/g)) { if (res.destroyed) return; res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: p } }] })}\n\n`); await new Promise((r) => setTimeout(r, Number(process.env.DELAY || 60))); }
  res.write("data: [DONE]\n\n"); res.end();
}).listen(LLM_PORT, "127.0.0.1");
// ---- bridge
const bridgeJs = path.join(root, "bridge/dist/bridge.mjs");
if (!fs.existsSync(bridgeJs)) { console.error("bridge/dist/bridge.mjs missing — run `npm run build` first"); process.exit(2); }
const bridge = spawn(process.execPath, [bridgeJs], { cwd: root, stdio: ["ignore", "ignore", "pipe"], env: { ...process.env, BRICKWIRE_DATA_DIR: dataDir, BRICKWIRE_PORT: String(PORT), BRICKWIRE_MCP_COMMAND: "none", BRICKWIRE_LLM_PROVIDER: "custom", BRICKWIRE_LLM_URL: `http://127.0.0.1:${LLM_PORT}/v1`, BRICKWIRE_LLM_KEY: "k", BRICKWIRE_LLM_MODEL: "fake-1" } });
let bridgeErr = ""; bridge.stderr.on("data", (d) => (bridgeErr = (bridgeErr + d).slice(-4000)));
function stopAll() { try { bridge.kill(); } catch {} llm.close(); try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch {} }
process.on("exit", () => { try { bridge.kill(); } catch {} });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 80; i++) { try { if ((await fetch(BASE + "/api/health")).ok) break; } catch {} await sleep(250); if (i === 79) { console.error("bridge did not start\n" + bridgeErr); stopAll(); process.exit(2); } }
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || (fs.existsSync("/usr/local/bin/chromium") ? "/usr/local/bin/chromium" : undefined), args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text().slice(0, 200) + " @" + (m.location()?.url || "")); });
page.on("pageerror", (e) => errors.push("pageerror: " + e.message.slice(0, 200)));
const toasts = [];
await page.exposeFunction("__bwToast", (t) => toasts.push(t));
await page.addInitScript(() => { new MutationObserver(() => { const t = document.getElementById("toast"); if (t && t.classList.contains("bad") && !t.classList.contains("hide") && t.textContent !== window.__lastT) { window.__lastT = t.textContent; window.__bwToast(t.textContent); } }).observe(document, { subtree: true, childList: true, attributes: true, characterData: true }); });
const results = [];
const check = (name, ok, info = "") => { results.push({ name, ok: !!ok, info }); console.log(`${ok ? "✔" : "✖"} ${name}${info ? " — " + info : ""}`); };
const until = async (fn, ms = 15000) => { const e = Date.now() + ms; while (Date.now() < e) { try { if (await fn()) return true; } catch {} await sleep(150); } return false; };
const R = "#bw3-chats";
const botTexts = () => page.$$eval(`${R} .b3-msg.bot .b3-text`, (els) => els.map((e) => e.innerText));
const userCount = () => page.$$eval(`${R} .b3-msg.user`, (els) => els.length);
const idle = () => page.$eval(`${R} .b3-send`, (b) => !b.disabled);
const typeSend = async (t, key = true) => { await page.fill("#b3-in", t); if (key) await page.press("#b3-in", "Enter"); else await page.click(`${R} .b3-send`); };

await page.goto(BASE + "/app#chats");
await until(() => page.$(`${R} .b3-send`));
await sleep(800);
// A. basic send + full stream
await typeSend("Привет, сделай обби");
check("A user bubble shown once", await until(async () => (await userCount()) === 1, 5000));
check("A answer streams and finishes", await until(async () => (await botTexts()).some((t) => t.includes("Конец ответа")) && (await idle()), 25000));
let t = await botTexts();
check("A answer starts correctly", t.at(-1)?.startsWith("Ответ №"), JSON.stringify(t.at(-1)?.slice(0, 40)));
check("A no typing indicator after end", !(await page.$(`${R} .b3-typing`)));
// B. double Enter
await page.fill("#b3-in", "Второй вопрос");
await page.press("#b3-in", "Enter"); await page.press("#b3-in", "Enter");
await sleep(1500);
check("B double Enter → one message", (await userCount()) === 2, "users=" + (await userCount()) + " " + JSON.stringify(await page.evaluate(() => window.Brickwire3.Chat.conv.messages.map(m=>m.role[0]+":"+m.text.slice(0,12)))));
// C. Enter while an answer is still streaming
await until(idle, 30000);
await typeSend("Третий вопрос");
await until(async () => (await page.evaluate(() => Object.values(window.Brickwire3.Chat.runs).some((r) => r.state === "running"))), 8000);
const usersBefore = await userCount();
await page.fill("#b3-in", "Четвёртый во время ответа");
await page.press("#b3-in", "Enter"); await page.press("#b3-in", "Enter");
await sleep(700);
const usersC = await userCount();
const runningRuns = await page.evaluate(() => Object.values(window.Brickwire3.Chat.runs).filter((r) => !["done", "partial", "blocked", "failed", "cancelled", "interrupted"].includes(r.state)).length);
check("C Enter during an answer starts no parallel run", runningRuns <= 1 && usersC === usersBefore, `users ${usersBefore}→${usersC} running=${runningRuns}`);
check("C typed text kept in the box", (await page.inputValue("#b3-in")) === "Четвёртый во время ответа");
await until(idle, 30000);
await sleep(300);
await page.press("#b3-in", "Enter");
check("C queued text sends after the answer", await until(async () => (await userCount()) === usersBefore + 1, 5000));
await until(idle, 30000);
// D. switch chat mid-stream and back
const convA = await page.evaluate(() => window.Brickwire3.Chat.conv.id);
await typeSend("Длинный ответ для проверки переключения");
await sleep(900);
await page.click(`${R} .b3-new`);
await sleep(700);
await page.click(`${R} .b3-citem[data-id="${convA}"]`);
await until(idle, 30000); await sleep(400);
t = await botTexts();
check("D after switching away/back: answer complete & correct start", t.at(-1)?.startsWith("Ответ №") && t.at(-1)?.includes("Конец ответа"), JSON.stringify(t.at(-1)?.slice(0, 30)));
// D2: mid-stream — check partial text beginning while still running
await typeSend("Ещё ответ — смотрим середину");
await sleep(900);
await page.click(`${R} .b3-new`); await sleep(500);
await page.click(`${R} .b3-citem[data-id="${convA}"]`); await sleep(700);
t = await botTexts();
const midOk = !t.at(-1) || t.at(-1).startsWith("Ответ №");
check("D2 partial text after switch starts at the beginning", midOk, JSON.stringify(t.at(-1)?.slice(0, 30)));
await until(idle, 30000);
// E. reload mid-stream
await typeSend("Перезагрузка во время ответа");
await sleep(900);
await page.reload(); await until(() => page.$(`${R} .b3-send`)); await sleep(1200);
t = await botTexts();
check("E after reload mid-stream partial starts at the beginning", !t.at(-1) || t.at(-1).startsWith("Ответ №"), JSON.stringify(t.at(-1)?.slice(0, 30)));
check("E after reload the answer completes", await until(async () => (await botTexts()).at(-1)?.includes("Конец ответа") && (await idle()), 30000));
// F. rapid switching
const convs = await page.$$eval(`${R} .b3-citem`, (els) => els.map((e) => e.dataset.id));
for (let i = 0; i < 6; i++) await page.click(`${R} .b3-citem[data-id="${convs[i % convs.length]}"]`, { noWaitAfter: true }).catch(() => {});
const lastClicked = convs[5 % convs.length];
await sleep(2500);
const shown = await page.evaluate(() => window.Brickwire3.Chat.conv?.id);
const hl = await page.$eval(`${R} .b3-citem.on`, (e) => e.dataset.id).catch(() => null);
check("F rapid switching shows the last clicked chat", shown === lastClicked && hl === lastClicked, `shown=${shown} hl=${hl} want=${lastClicked}`);
// G. cancel mid-stream
await page.click(`${R} .b3-citem[data-id="${convA}"]`); await sleep(600);
await typeSend("Отмена посреди ответа");
await sleep(800);
await page.click(`${R} .b3-cancel`).catch(() => {});
check("G cancel → composer usable again", await until(idle, 10000));
const st = await page.evaluate(() => Object.values(window.Brickwire3.Chat.runs).at(-1)?.state);
check("G last run cancelled", ["cancelled", "done", "partial"].includes(st), st);
// H. WebGL contexts / DOM growth: count canvases
check("H no leaked canvases", (await page.$$eval("canvas.b3-canvas", (e) => e.length)) < 4);
// I. plugin chat duplicate user rows
await page.evaluate(() => window.go("chat")); await sleep(500);
await page.fill("#chatIn", "Сообщение в чат плагина");
await page.press("#chatIn", "Enter");
await sleep(2500);
const pluginRows = await page.$$eval("#msgs > *", (els) => els.filter((e) => e.textContent.includes("Сообщение в чат плагина")).length);
check("I plugin chat shows the user message once", pluginRows === 1, "rows=" + pluginRows);
check("I plugin input cleared", (await page.inputValue("#chatIn")) === "");
const badToasts = toasts.filter((t) => !/Откройте вкладку ИИ/.test(t)); // expected: no AI tab in this test
check("J no error toasts", badToasts.length === 0, badToasts.slice(0, 3).join(" | "));
// J. errors
check("J no page errors", errors.length === 0, errors.slice(0, 5).join(" | "));
await browser.close(); stopAll();
const bad = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - bad}/${results.length} passed`);
process.exit(bad ? 1 : 0);
