import type { AgentCategory, AgentStage, CallEnvelope, HealthResponse, SafetyMode } from "../../../shared/src/protocol.js";
import { AGENT_CATEGORIES } from "../../../shared/src/protocol.js";
import { CATEGORY_INFO } from "../../../shared/src/instructions.js";
import { PROVIDERS } from "../../../shared/src/providers.js";
import type { ActivityState, AgentUI } from "../core/agent-core.js";
import type { ProviderPrefs } from "../core/settings.js";
import { KITS, KIND_LABELS, type KitInfo, type KitKind } from "../../../shared/src/library/catalog.js";
import { ICONS, ICON_IDS, iconSvg } from "../../../shared/src/library/icons.js";
import { resourceTask, packTask, type ResourceMode, type PackLite, type PackItemLite, type PackMode } from "../../../shared/src/library/tasks.js";
import { communityTask, type CommunityData, type CommunityItem } from "../../../shared/src/library/community.js";

const MODE_INFO: Record<SafetyMode, { label: string; hint: string }> = {
  full: { label: "Full auto", hint: "Runs everything without asking (undo with Ctrl+Z in Studio)" },
  auto: { label: "Ask before deleting", hint: "Creates/changes run automatically; deleting asks first" },
  approval: { label: "Ask every change", hint: "Every write or delete waits for your Approve" },
  safe: { label: "Read-only", hint: "Only reads Studio; all changes are blocked" },
};
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

const CSS = `
:host{all:initial}
*{box-sizing:border-box;font-family:Inter,"Segoe UI Variable Text","Segoe UI",system-ui,-apple-system,sans-serif;-webkit-font-smoothing:antialiased}
.wrap{--bg:#0B0B0E;--bg2:#111116;--card:#17171D;--line:rgba(255,255,255,.08);--line2:rgba(255,255,255,.14);--text:#F3F1EC;--mut:#9A97A1;--faint:#5E5C66;--btn:#17171D;--code:#08080A;--codetx:#CFCBC2;--opt:#17171D;
 --gold:#D8B878;--goldT:rgba(216,184,120,.10);--blue:#D8B878;--purple:#B08F55;--cyan:#D8B878;--green:#7BC99A;--yellow:#E2B866;--red:#E8806F;--acc:linear-gradient(180deg,#E3C68C,#C9A462);--accTx:#17130A;
 margin:8px auto 10px;max-width:820px;width:100%;color:var(--text);background:var(--bg);border:1px solid var(--line);border-radius:16px;
 box-shadow:0 1px 0 rgba(255,255,255,.04) inset,0 18px 40px -18px rgba(0,0,0,.55);font-size:12.5px;line-height:1.45;overflow:hidden;letter-spacing:.005em}
.wrap.light{--bg:#FBFAF7;--bg2:#F4F2EC;--card:#EFECE4;--line:rgba(20,17,9,.09);--line2:rgba(20,17,9,.16);--text:#1A1813;--mut:#6E6A60;--faint:#A29D91;--btn:#FFFFFF;--code:#F4F2EC;--codetx:#2A261D;--opt:#FFFFFF;--gold:#A9874A;--goldT:rgba(169,135,74,.10);--blue:#A9874A;--cyan:#A9874A;box-shadow:0 10px 30px -14px rgba(40,30,10,.22)}
.wrap.light .note.error{color:#A33A2A}.wrap.light .note.warn{color:#7A5A12}.wrap.light .note.info{color:#6B5226}
.wrap.float{margin:0;max-width:none;box-shadow:0 24px 60px -16px rgba(0,0,0,.6)}
.wrap.float .bar{cursor:move}
.note.pre{white-space:pre-wrap;font-family:"JetBrains Mono","Cascadia Code",ui-monospace,Consolas,monospace}
.bar{display:flex;align-items:center;gap:10px;padding:10px 12px;min-height:48px;background:var(--bg2)}
.logo{width:24px;height:24px;border-radius:7px;background:var(--acc);display:grid;place-items:center;font-size:0;flex:none;box-shadow:0 4px 12px -5px rgba(216,184,120,.7);position:relative}
.logo::after{content:"";width:8px;height:8px;border:1.6px solid #17130A;border-radius:1.5px;transform:rotate(45deg)}
.title{font-weight:600;font-size:13px;white-space:nowrap;letter-spacing:.01em}
button.ic svg{display:block}
.st{display:flex;align-items:center;gap:7px;color:var(--mut);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;font-size:11.5px;padding:4px 11px;border-radius:99px;border:1px solid var(--line)}
.st b{color:var(--text);font-weight:500}
.dot{width:7px;height:7px;border-radius:50%;background:var(--faint);flex:none}
.g{background:var(--green);box-shadow:0 0 0 3px rgba(123,201,154,.15)}.y{background:var(--yellow);box-shadow:0 0 0 3px rgba(226,184,102,.15)}.r{background:var(--red)}.b{background:var(--gold);animation:pulse 1.4s infinite}
@keyframes pulse{50%{opacity:.4}}
.sp{flex:1}
.tabs{display:flex;border:1px solid var(--line);border-radius:99px;padding:2px;gap:2px;flex:none}
.tabs button{border:0;background:transparent;padding:5px 12px;color:var(--mut);border-radius:99px;font-weight:500}
.tabs button.on{background:var(--card);color:var(--text)}
button{all:unset;cursor:pointer;padding:6px 13px;border-radius:99px;border:1px solid var(--line2);background:transparent;color:var(--text);font-size:12px;font-weight:500;white-space:nowrap;transition:border-color .18s,background .18s,color .18s,filter .18s}
button:hover{border-color:rgba(216,184,120,.5)}
button.pri{background:var(--acc);border-color:transparent;color:var(--accTx);font-weight:600;box-shadow:0 1px 0 rgba(255,255,255,.35) inset,0 6px 16px -8px rgba(216,184,120,.6)}
button.pri:hover{filter:brightness(1.07)}
button.ok{background:var(--green);color:#0A160F;border-color:transparent;font-weight:600}
button.no{color:var(--red);border-color:rgba(232,128,111,.4)}
button.ghost{border-color:transparent;background:transparent;color:var(--mut)}
button.ghost:hover{color:var(--text);background:var(--card)}
button.ic{padding:6px 8px;color:var(--mut);border-color:transparent;background:transparent;border-radius:8px}
button.ic:hover{color:var(--text);background:var(--card)}
.body{border-top:1px solid var(--line)}
.body.hide{display:none}
.view{padding:14px 16px 14px;display:grid;grid-template-columns:1fr 1fr;gap:12px 20px}
.lbl{font-size:9.5px;letter-spacing:.18em;color:var(--gold);text-transform:uppercase;margin-bottom:6px;font-weight:600}
.task{font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.stages{display:flex;gap:4px;flex-wrap:wrap}
.stg{padding:3px 8px;border-radius:99px;font-size:9.5px;font-weight:600;letter-spacing:.08em;color:var(--faint);border:1px solid var(--line)}
.stg.on{color:var(--accTx);background:var(--acc);border-color:transparent}
.stg.past{color:var(--gold);border-color:rgba(216,184,120,.3)}
.act{grid-column:1/-1;max-height:124px;overflow:auto;display:flex;flex-direction:column;gap:3px;font-family:"JetBrains Mono","Cascadia Code",ui-monospace,Consolas,monospace;font-size:11.5px;background:var(--bg2);border:1px solid var(--line);border-radius:12px;padding:9px 12px;min-height:34px}
.act:empty::before{content:"No activity yet — type a task in the message box and press Start, or pick something in Library.";color:var(--mut);font-family:Inter,"Segoe UI",system-ui,sans-serif}
.act div{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.i-done{color:var(--green)}.i-run{color:var(--gold)}.i-wait{color:var(--yellow)}.i-error{color:var(--red)}.i-info{color:var(--mut)}
.appr{grid-column:1/-1;border:1px solid rgba(216,184,120,.35);background:linear-gradient(90deg,var(--goldT),transparent);border-radius:12px;padding:10px 12px;display:flex;gap:12px;align-items:flex-start}
.appr .t{flex:1;min-width:0}.appr .t div{white-space:normal}
.appr .acts{display:flex;flex-direction:column;gap:6px}
.note{margin:10px 16px 0;font-size:11.5px;padding:8px 12px;border-radius:10px;border:1px solid var(--line)}
.note.error{background:rgba(232,128,111,.07);color:#F2B3A8;border-color:rgba(232,128,111,.25)}.note.warn{background:rgba(226,184,102,.06);color:#EBD3A0;border-color:rgba(226,184,102,.22)}.note.info{background:var(--goldT);color:#E7D6B2;border-color:rgba(216,184,120,.2)}
.btns{grid-column:1/-1;display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.paintRow{grid-column:1/-1;display:flex;gap:10px;align-items:center;padding:7px 10px;border:1px solid var(--line);border-radius:12px;background:var(--bg2)}
.paintBtn{background:transparent!important;color:var(--gold)!important;border:1px solid rgba(216,184,120,.4)!important;font-weight:500}
.paintHint{color:var(--mut);font-size:11px}
.hidden{display:none!important}
.cfg{grid-column:1/-1;display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.cfg label{display:flex;align-items:center;gap:6px;color:var(--mut);font-size:9.5px;letter-spacing:.14em;text-transform:uppercase;font-weight:600}
select{all:unset;cursor:pointer;padding:5px 26px 5px 11px;border-radius:99px;border:1px solid var(--line2);background:transparent url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%239A97A1' fill='none' stroke-width='1.4'/%3E%3C/svg%3E") no-repeat right 10px center;color:var(--text);font-size:12px;font-weight:500;letter-spacing:0;text-transform:none}
select:hover{border-color:rgba(216,184,120,.5)}
select:disabled{opacity:.5;cursor:default}
select.m-full{border-color:rgba(232,128,111,.55)}select.m-safe{border-color:rgba(123,201,154,.55)}
option{background:var(--opt);color:var(--text)}
.code{margin-top:8px;max-height:240px;overflow:auto;background:var(--code);border:1px solid var(--line);border-radius:10px;padding:8px 10px;font-family:"JetBrains Mono","Cascadia Code",ui-monospace,Consolas,monospace;font-size:11.5px;white-space:pre;color:var(--codetx)}
/* library */
.lib{padding:14px 16px 16px;display:flex;flex-direction:column;gap:12px}
.ltop{display:flex;gap:10px;align-items:center}
input.q,textarea{all:unset;box-sizing:border-box;flex:1;padding:8px 14px;border-radius:99px;border:1px solid var(--line);background:var(--bg2);color:var(--text);font-size:12px;transition:border-color .18s}
textarea{width:100%;min-height:44px;white-space:pre-wrap;border-radius:12px}
input.q:focus,textarea:focus{border-color:rgba(216,184,120,.5)}
.chips{display:flex;gap:6px;flex-wrap:wrap}
.chip{padding:4px 11px;border-radius:99px;font-size:11px;background:transparent;border-color:var(--line);color:var(--mut)}
.chip.on{background:var(--goldT);border-color:rgba(216,184,120,.45);color:var(--gold)}
.chip i{font-style:normal;opacity:.6;margin-left:5px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px;max-height:340px;overflow:auto;padding-right:2px}
.card{all:unset;cursor:pointer;display:flex;flex-direction:column;border-radius:12px;background:var(--bg2);border:1px solid var(--line);overflow:hidden;transition:border-color .18s,transform .18s}
.card:hover{border-color:rgba(216,184,120,.45);transform:translateY(-1px)}
.pv{height:88px;display:grid;place-items:center;background:radial-gradient(120% 90% at 50% 0%,rgba(216,184,120,.07),transparent 70%)}
.pv img{max-width:100%;max-height:100%;display:block}
.pv.ico img{height:46px}
.card .nm{padding:8px 10px 2px;font-weight:500;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.card .ds{padding:0 10px 9px;color:var(--mut);font-size:10.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.det{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);gap:16px}
.det .big{border-radius:12px;background:var(--bg2);border:1px solid var(--line);display:grid;place-items:center;min-height:170px;padding:8px}
.det .big img{max-width:100%;max-height:220px}
.det h3{margin:0 0 4px;font-size:15px;font-weight:600;letter-spacing:-.005em}
.det .kd{color:var(--mut);font-size:11px;margin-bottom:8px}
.det .opt{font-family:"JetBrains Mono",ui-monospace,Consolas,monospace;font-size:11px;color:var(--codetx);background:var(--code);border:1px solid var(--line);border-radius:8px;padding:5px 8px;margin:8px 0;word-break:break-word}
.det .acts2{display:flex;flex-direction:column;gap:7px;margin-top:10px}
.det .acts2 button{text-align:center}
.hint{color:var(--mut);font-size:11px}
.empty{color:var(--mut);padding:20px;text-align:center;grid-column:1/-1}
.src{display:flex;gap:2px;border:1px solid var(--line);border-radius:99px;padding:2px}
.src button{padding:5px 12px;border-radius:99px;font-size:11.5px;background:transparent;border-color:transparent;color:var(--mut)}
.src button.on{background:var(--card);color:var(--gold)}
.pv.cm{background:repeating-conic-gradient(rgba(255,255,255,.035) 0 25%,transparent 0 50%) 0 0/14px 14px}
.pv.cm img{width:100%;height:100%;object-fit:contain}
.det .big.pv.cm{height:auto;min-height:190px}
.pv.pk{background:linear-gradient(180deg,rgba(255,255,255,.05),rgba(255,255,255,.01))}
.pv.pk .ph{color:var(--mut);font-size:10px;text-transform:uppercase;letter-spacing:.12em}
.spr{image-rendering:auto;border-radius:6px}
.det .big.pv.pk{min-height:120px}
.pv.cm .ph{color:var(--mut);font-size:10.5px;padding:6px;text-align:center}
.det input.q{width:100%;flex:none}
.det a{color:var(--gold)}
.more{grid-column:1/-1;justify-self:center}
::-webkit-scrollbar{width:8px;height:8px}::-webkit-scrollbar-thumb{background:rgba(255,255,255,.1);border-radius:8px}::-webkit-scrollbar-track{background:transparent}
@media (max-width:560px){.view{grid-template-columns:1fr}.det{grid-template-columns:1fr}}
`;

const ICON: Record<ActivityState, string> = { done: "✓", run: "→", wait: "○", error: "✕", info: "·" };

export interface PanelHandlers {
  start(): void;
  stop(): void;
  pause(): void;
  approve(id: string, ok: boolean): void;
  approveAll(id: string): void;
  setCategory(c: AgentCategory): void;
  setMode(m: SafetyMode): void;
  switchProvider(url: string): void;
  openBridge(): void;
  /** Paint overlay on this chat page; "Send to chat" posts into this chat. */
  openPaint?(): void;
  /** Compact chat: hide tool calls / results / instructions behind short chips. Returns the new state. */
  toggleCompact?(): boolean;
  compactState?(): boolean;
  openSettings(): void;
  toggleCollapsed(collapsed: boolean): void;
  /** Panel ⧉: floating window ↔ docked above the composer. */
  toggleFloating?(floating: boolean): void;
  /** "Site check": self-test of the integration on this page. */
  siteCheck?(): string[];
  /** Notion mode: Dev Log page on/off. */
  setNotionLog?(on: boolean): void;
  /** 1.8: SUPER mode (deep thinking) on/off. */
  setSuperMode?(on: boolean): void;
  /** Library: run a resource request (starts the agent, or sends it as a new turn when already running). */
  useResource?(text: string): void;
  /** Library: put text into the message box without sending (user attaches a screenshot first). */
  fillComposer?(text: string): Promise<boolean>;
  /** Library: SVG previews by kit id (bundled extension resource). */
  loadPreviews?(): Promise<Record<string, string>>;
  /** Library → Community: bundled (or last refreshed) catalogue. */
  loadCommunity?(): Promise<CommunityData>;
  /** Library → Community: fetch the live catalogue (and remember it). */
  refreshCommunity?(): Promise<CommunityData>;
  /** Library → Packs: bundled asset-pack index (extension/public/library/packs.json). */
  loadPacks?(): Promise<PackLite[]>;
  /** Extension resource URL (pack thumbnail sprites). */
  resourceUrl?(path: string): string;
  /** Library → Community: thumbnail data URL for an image URL (fetched by the background worker). */
  thumb?(url: string): Promise<string>;
}

/** Roblox Agent panel — Shadow-DOM isolated so it never inherits or breaks site styles. */
export class AgentPanel implements AgentUI {
  readonly host: HTMLElement;
  private root: ShadowRoot;
  private el: Record<string, HTMLElement> = {};
  private acts = new Map<string, HTMLElement>();
  private stage: AgentStage = "IDLE";
  private approvalId: string | null = null;
  private collapsed: boolean;
  private active = false;

  private providerName: string;
  private h: PanelHandlers;
  private providerId: string;
  private prefs: ProviderPrefs;

  constructor(providerName: string, h: PanelHandlers, collapsed = false, providerId = "", prefs: ProviderPrefs = { category: "general", mode: "auto" }) {
    this.providerName = providerName;
    this.h = h;
    this.providerId = providerId;
    this.prefs = prefs;
    this.collapsed = collapsed;
    this.host = document.createElement("div");
    this.host.setAttribute("data-brickwire-host", "");
    this.host.style.cssText = "display:block;width:100%;position:relative;z-index:5";
    this.root = this.host.attachShadow({ mode: "open" });
    this.root.innerHTML = `<style>${CSS}</style>
<div class="wrap" part="panel">
  <div class="bar">
    <div class="logo"></div><div class="title">Brickwire</div>
    <div class="st" id="conn"><span class="dot" id="dot"></span><b id="state">Checking…</b><span id="studio"></span><span id="project"></span></div>
    <div class="sp"></div>
    <div class="tabs"><button id="tabAgent" class="on">Agent</button><button id="tabLib" title="Ready-made builds, furniture, gameplay systems, UI, effects, animations and icons">Library</button></div>
    <button class="pri" id="start">Start Agent</button>
    <button class="ic" id="float" title="Floating window / dock above the message box"><svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="1" y="3.5" width="7.5" height="7.5" rx="1.5"/><path d="M4 1h6.2c.4 0 .8.4.8.8V8"/></svg></button>
    <button class="ic" id="collapse" title="Collapse">−</button>
  </div>
  <div class="body" id="body">
    <div class="note hidden" id="note"></div>
    <div class="view" id="vAgent">
      <div class="cfg">
        <label>AI <select id="ai" title="Settings below are saved separately for each AI">${PROVIDERS.filter((p) => p.id === providerId || p.enabledByDefault)
          .map((p) => `<option value="${p.id}" ${p.id === providerId ? "selected" : ""}>${esc(p.name)}${p.status === "beta" ? "" : " (experimental)"}</option>`)
          .join("")}</select></label>
        <label title="What the AI focuses on: Build, Scripting, UI, VFX, Animation, Gameplay, Debug">Focus <select id="cat">${AGENT_CATEGORIES.map((c) => `<option value="${c}" ${c === prefs.category ? "selected" : ""} title="${esc(CATEGORY_INFO[c].hint)}">${esc(CATEGORY_INFO[c].label)}</option>`).join("")}</select></label>
        ${providerId === "notion" ? `<label title="Notion mode: Notion AI also keeps a 'Roblox Dev Log' page in your workspace up to date">Dev log <select id="nlog"><option value="off">Off</option><option value="on" ${prefs.notionLog ? "selected" : ""}>Notion page</option></select></label>` : ""}
        <label title="Super: the AI thinks long, proposes variants, writes a design doc, builds in phases and reviews its own result — slower, much better">Brain <select id="brain"><option value="normal">Normal</option><option value="super" ${prefs.superMode ? "selected" : ""}>Super</option></select></label>
        <label>Approvals <select id="mode">${(Object.keys(MODE_INFO) as SafetyMode[]).map((m) => `<option value="${m}" ${m === prefs.mode ? "selected" : ""} title="${esc(MODE_INFO[m].hint)}">${esc(MODE_INFO[m].label)}</option>`).join("")}</select></label>
      </div>
      <div><div class="lbl">Current task</div><div class="task" id="task">—</div></div>
      <div><div class="lbl">Stage</div><div class="stages" id="stages"></div></div>
      <div class="appr hidden" id="appr"><div class="t"><div><b>Approval required:</b> <span id="apTool"></span> <span id="apWhy" style="color:var(--mut)"></span></div><div class="code" id="apCode"></div></div><div class="acts"><button class="ok" id="approve">Approve</button><button class="ok" id="approveAll" title="Approve this and every further action until the agent stops">Approve all (session)</button><button class="no" id="reject">Reject</button></div></div>
      <div class="act" id="act"></div>
      <div class="paintRow"><button id="paint" class="paintBtn" title="Draw a picture and send it straight into this chat">Paint</button><span class="paintHint">draw \u2192 send into this chat</span></div>
      <div class="btns">
        <button id="pause" class="hidden">Pause</button>
        <button id="stop" class="no hidden">Stop</button>
        <button id="approveTop" class="ok hidden">Approve</button>
        <div class="sp"></div>
        <button id="compact" class="ghost" title="Show / hide the code of tool calls and results in the chat">Code: hidden</button>
        <button id="bridge" class="ghost">Bridge</button>
        <button id="check" class="ghost" title="Self-test: message box, send button, reply reader, background timers">Site check</button>
        <button id="settings" class="ghost">Settings</button>
      </div>
    </div>
    <div class="lib hidden" id="vLib">
      <div id="libList">
        <div class="ltop"><div class="src" id="libSrc"><button data-s="bw" class="on" title="Ready-made, tested Brickwire resources (one click builds them)">Brickwire</button><button data-s="pk" title="Asset packs: ~2370 real Roblox meshes, textures, decals, skies, sounds and VFX with meaningful names (NDC Build Kit, Retro Roblox Pack, Ultimate Building Asset Pack, texture swatches, VFX meshes)">Packs</button><button data-s="cm" title="Community resources from ui-resources.com and other free sites: effects, backgrounds, textures, icons, references">Community</button></div><input class="q" id="libQ" placeholder="Search: house, shop, obby, portal, coin…"></div>
        <div class="chips" id="libCats" style="margin:8px 0"></div>
        <div class="grid" id="libGrid"></div>
        <div class="hint" style="margin-top:8px">Two ways to work: describe anything in the chat and press Start (the agent uses these resources on its own), or pick a resource here.</div>
      </div>
      <div id="libDet" class="hidden"></div>
    </div>
  </div>
</div>`;
    for (const id of ["dot", "state", "studio", "project", "start", "collapse", "body", "task", "stages", "appr", "apTool", "apWhy", "approve", "approveAll", "apCode", "ai", "cat", "mode", "reject", "note", "act", "pause", "stop", "approveTop", "bridge", "paint", "compact", "settings", "check", "float", "nlog", "brain", "tabAgent", "tabLib", "vAgent", "vLib", "libQ", "libSrc", "libCats", "libGrid", "libList", "libDet"])
      this.el[id] = this.root.getElementById(id) as HTMLElement;
    this.el.start.onclick = () => (this.active ? this.h.stop() : this.h.start());
    this.el.stop.onclick = () => this.h.stop();
    this.el.pause.onclick = () => this.h.pause();
    this.el.approve.onclick = this.el.approveTop.onclick = () => this.approvalId && this.h.approve(this.approvalId, true);
    this.el.reject.onclick = () => this.approvalId && this.h.approve(this.approvalId, false);
    this.el.approveAll.onclick = () => this.approvalId && this.h.approveAll(this.approvalId);
    const ai = this.el.ai as HTMLSelectElement;
    ai.onchange = () => {
      const p = PROVIDERS.find((x) => x.id === ai.value);
      ai.value = this.providerId; // this tab stays on its own AI; the other one opens in a new tab
      if (p && p.id !== this.providerId) this.h.switchProvider(p.url);
    };
    const cat = this.el.cat as HTMLSelectElement;
    cat.onchange = () => this.h.setCategory(cat.value as AgentCategory);
    const mode = this.el.mode as HTMLSelectElement;
    mode.onchange = () => {
      this.styleMode();
      this.h.setMode(mode.value as SafetyMode);
    };
    this.styleMode();
    this.el.bridge.onclick = () => this.h.openBridge();
    if (this.el.paint) this.el.paint.onclick = () => this.h.openPaint?.();
    if (this.el.compact) {
      const label = (on: boolean) => (this.el.compact.textContent = on ? "Code: hidden" : "Code: shown");
      label(this.h.compactState?.() ?? true);
      this.el.compact.onclick = () => label(this.h.toggleCompact?.() ?? true);
    }
    this.el.settings.onclick = () => this.h.openSettings();
    this.el.check.onclick = () => {
      const lines = this.h.siteCheck?.() ?? ["Site check is not available here."];
      this.notify(lines.join("\n"), lines.some((l) => l.startsWith("✕")) ? "error" : "info", 45000, true);
    };
    this.el.float.onclick = () => {
      this.setFloating(!this.floating);
      this.h.toggleFloating?.(this.floating);
    };
    const brain = this.el.brain as HTMLSelectElement | null;
    if (brain) brain.onchange = () => this.h.setSuperMode?.(brain.value === "super");
    const nlog = this.el.nlog as HTMLSelectElement | null;
    if (nlog) nlog.onchange = () => this.h.setNotionLog?.(nlog.value === "on");
    this.applyTheme();
    window.setInterval(() => this.applyTheme(), 3000);
    this.el.collapse.onclick = () => {
      this.collapsed = !this.collapsed;
      this.applyCollapse();
      this.h.toggleCollapsed(this.collapsed);
    };
    this.el.tabAgent.onclick = () => this.showTab("agent");
    this.el.tabLib.onclick = () => this.showTab("lib");
    (this.el.libQ as HTMLInputElement).oninput = () => {
      this.cmLimit = 60;
      this.renderLibrary();
    };
    for (const b of Array.from(this.el.libSrc.querySelectorAll("button"))) (b as HTMLElement).onclick = () => this.setSource((b as HTMLElement).dataset.s as "bw" | "cm" | "pk");
    this.renderStages();
    this.applyCollapse();
  }

  // -------------------------------------------------------------- Library
  private tab: "agent" | "lib" = "agent";
  private libCat: KitKind | "icon" | "all" = "all";
  private previews: Record<string, string> | null = null;
  private previewsLoading = false;

  showTab(t: "agent" | "lib") {
    this.tab = t;
    this.el.tabAgent.classList.toggle("on", t === "agent");
    this.el.tabLib.classList.toggle("on", t === "lib");
    this.el.vAgent.classList.toggle("hidden", t !== "agent");
    this.el.vLib.classList.toggle("hidden", t !== "lib");
    if (this.collapsed) {
      this.collapsed = false;
      this.applyCollapse();
    }
    if (t === "lib") {
      this.renderLibrary();
      if (!this.previews && !this.previewsLoading && this.h.loadPreviews) {
        this.previewsLoading = true;
        this.h.loadPreviews().then((p) => {
          this.previews = p;
          this.renderLibrary();
        }, () => (this.previewsLoading = false));
      }
    }
  }

  private img(svg: string, alt: string) {
    return `<img alt="${esc(alt)}" src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}">`;
  }

  private previewOf(id: string): string {
    if (ICONS[id]) return this.img(iconSvg(id, 96), id);
    const svg = this.previews?.[id];
    if (svg) return this.img(svg, id);
    const k = KITS.find((x) => x.id === id);
    return `<span class="hint">${esc(k ? KIND_LABELS[k.kind].en : "")}</span>`;
  }

  // ---------------------------------------------------- Community (ui-resources.com + curated links)
  private libSource: "bw" | "cm" | "pk" = "bw";
  private packs: PackLite[] | null = null;
  private packsLoading = false;
  private pkSel = "all";
  private community: CommunityData | null = null;
  private communityLoading = false;
  private cmCat = "All";
  private cmLimit = 60;
  private thumbCache = new Map<string, string>();
  private thumbObserver: IntersectionObserver | null = null;

  setSource(s: "bw" | "cm" | "pk") {
    if (s !== this.libSource) (this.el.libQ as HTMLInputElement).value = "";
    this.libSource = s;
    for (const b of Array.from(this.el.libSrc.querySelectorAll("button"))) (b as HTMLElement).classList.toggle("on", (b as HTMLElement).dataset.s === s);
    (this.el.libQ as HTMLInputElement).placeholder = s === "cm" ? "Search: halftone, sparkle, background, glow, icon…" : s === "pk" ? "Search: barrel, sword, brick, sky, shockwave, graffiti…" : "Search: house, shop, obby, portal, coin…";
    this.cmLimit = 60;
    if (s === "pk" && !this.packs && !this.packsLoading && this.h.loadPacks) {
      this.packsLoading = true;
      this.h.loadPacks().then(
        (d) => {
          this.packs = d;
          this.packsLoading = false;
          this.renderLibrary();
        },
        (e) => {
          this.packsLoading = false;
          this.el.libGrid.innerHTML = `<div class="empty">Could not load asset packs: ${esc((e as Error).message)}</div>`;
        },
      );
    }
    this.el.libDet.classList.add("hidden");
    this.el.libList.classList.remove("hidden");
    if (s === "cm" && !this.community && !this.communityLoading && this.h.loadCommunity) {
      this.communityLoading = true;
      this.h.loadCommunity().then(
        (d) => {
          this.community = d;
          this.communityLoading = false;
          this.renderLibrary();
        },
        (e) => {
          this.communityLoading = false;
          this.el.libGrid.innerHTML = `<div class="empty">Could not load community resources: ${esc((e as Error).message)}</div>`;
        },
      );
    }
    this.renderLibrary();
  }

  private cmThumb(it: CommunityItem): string {
    if (!it.i) return `<div class="ph">${esc(it.s)}<br>${esc(it.c)}</div>`;
    const hit = this.thumbCache.get(it.i);
    return hit ? `<img alt="" src="${hit}">` : `<div class="ph" data-th="${esc(it.i)}">…</div>`;
  }

  private observeThumbs() {
    if (!this.h.thumb) return;
    const load = (el: HTMLElement) => {
      const url = el.dataset.th!;
      delete el.dataset.th;
      this.h.thumb!(url).then(
        (data) => {
          this.thumbCache.set(url, data);
          if (el.isConnected) el.outerHTML = `<img alt="" src="${data}">`;
        },
        () => {
          if (el.isConnected) el.textContent = "no preview";
        },
      );
    };
    this.thumbObserver?.disconnect();
    const els = Array.from(this.root.querySelectorAll("[data-th]")) as HTMLElement[];
    if (typeof IntersectionObserver === "undefined") {
      els.slice(0, 24).forEach(load);
      return;
    }
    this.thumbObserver = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) {
        this.thumbObserver?.unobserve(e.target);
        load(e.target as HTMLElement);
      }
    }, { root: this.el.libGrid, rootMargin: "120px" });
    for (const el of els) this.thumbObserver.observe(el);
  }

  private renderCommunity() {
    const d = this.community;
    if (!d) {
      this.el.libCats.innerHTML = "";
      this.el.libGrid.innerHTML = `<div class="empty">${this.communityLoading ? "Loading community resources…" : "Community resources are not available."}</div>`;
      return;
    }
    const counts = new Map<string, number>([["All", d.items.length]]);
    for (const it of d.items) counts.set(it.c, (counts.get(it.c) ?? 0) + 1);
    const cats = [...counts.keys()].sort((a, b) => (a === "All" ? -1 : b === "All" ? 1 : (counts.get(b)! - counts.get(a)!)));
    this.el.libCats.innerHTML = cats.map((c) => `<button class="chip ${c === this.cmCat ? "on" : ""}" data-c="${esc(c)}">${esc(c)}<i>${counts.get(c)}</i></button>`).join("") +
      `<button class="chip" id="cmRefresh" title="Fetch the latest catalogue from ui-resources.com">↻ Refresh</button>`;
    for (const b of Array.from(this.el.libCats.querySelectorAll("button[data-c]"))) (b as HTMLElement).onclick = () => {
      this.cmCat = (b as HTMLElement).dataset.c!;
      this.cmLimit = 60;
      this.renderLibrary();
    };
    const rf = this.root.getElementById("cmRefresh") as HTMLElement | null;
    if (rf) rf.onclick = () => {
      if (!this.h.refreshCommunity) return;
      rf.textContent = "↻ …";
      this.h.refreshCommunity().then(
        (nd) => {
          this.community = nd;
          this.notify(`Community: ${nd.count} resources (updated ${nd.lastUpdated ?? nd.fetchedAt.slice(0, 10)}).`, "info", 6000);
          this.renderLibrary();
        },
        (e) => {
          rf.textContent = "↻ Refresh";
          this.notify("Refresh failed: " + (e as Error).message, "error", 8000);
        },
      );
    };
    const q = (this.el.libQ as HTMLInputElement).value.trim().toLowerCase();
    const match = (it: CommunityItem) => !q || q.split(/\s+/).every((w) => `${it.t} ${it.a} ${it.c} ${it.g} ${it.d} ${it.s}`.toLowerCase().includes(w));
    const list = d.items.filter((it) => (this.cmCat === "All" || it.c === this.cmCat) && match(it));
    const shown = list.slice(0, this.cmLimit);
    this.el.libGrid.innerHTML = shown.length
      ? shown.map((it) => `<button class="card" data-id="${esc(it.id)}" title="${esc(`${it.t}${it.a ? " — by " + it.a : ""}`)}"><div class="pv cm">${this.cmThumb(it)}</div><div class="nm">${esc(it.t)}</div><div class="ds">${esc(`${it.c}${it.a ? " · " + it.a : ""}${it.g ? " · " + it.g : ""}`)}</div></button>`).join("") +
        (list.length > shown.length ? `<button class="ghost more" id="cmMore">Show more (${list.length - shown.length})</button>` : "")
      : `<div class="empty">Nothing found.</div>`;
    for (const c of Array.from(this.el.libGrid.querySelectorAll(".card"))) (c as HTMLElement).onclick = () => this.openCommunity((c as HTMLElement).dataset.id!);
    const more = this.root.getElementById("cmMore") as HTMLElement | null;
    if (more) more.onclick = () => {
      this.cmLimit += 60;
      this.renderLibrary();
    };
    this.observeThumbs();
  }

  openCommunity(id: string) {
    const it = this.community?.items.find((x) => x.id === id);
    if (!it) return;
    const det = this.el.libDet;
    const imageLike = !!it.i;
    det.innerHTML = `<div class="det"><div class="big pv cm">${this.cmThumb(it)}</div><div>
      <h3>${esc(it.t)}</h3><div class="kd">${esc(`${it.c}${it.a ? " · by " + it.a : ""} · ${it.s}`)}</div>
      ${it.d ? `<div>${esc(it.d)}</div>` : ""}${it.g ? `<div class="hint">Tags: ${esc(it.g)}</div>` : ""}
      <div class="acts2" style="flex-direction:row;flex-wrap:wrap">${it.w ? `<button class="ghost" id="cmOpen">Open page ↗</button>` : ""}${it.dl ? `<button class="ghost" id="cmDl">Download file ↗</button>` : ""}</div>
      ${imageLike ? `<input class="q" id="cmAsset" placeholder="Roblox asset id (optional): rbxassetid://… or number" style="margin-top:8px">` : ""}
      <textarea id="libNotes" placeholder="Optional notes: where to use it, colours, size…" style="margin-top:6px"></textarea>
      <div class="acts2">
        <button class="pri" id="cmUse" title="The agent puts it into your game (uses the asset id if you have one; never invents ids)">${imageLike ? "Use in my game" : "Apply to my game"}</button>
        <button id="cmLike" title="The agent uses it only as a visual reference and builds its own version with the BW helpers — no upload needed">Make something inspired by it</button>
        <button class="ghost" id="libBack">← Back to community</button>
      </div>
      <div class="hint" style="margin-top:6px">Resources belong to their authors — check the terms on the source page and credit them when required.</div></div></div>`;
    this.el.libList.classList.add("hidden");
    det.classList.remove("hidden");
    this.observeThumbs();
    const val = (id2: string) => ((this.root.getElementById(id2) as HTMLInputElement | HTMLTextAreaElement | null)?.value ?? "");
    const open = (url: string) => this.h.switchProvider(url);
    const o = this.root.getElementById("cmOpen") as HTMLElement | null;
    if (o) o.onclick = () => open(it.w);
    const dl = this.root.getElementById("cmDl") as HTMLElement | null;
    if (dl) dl.onclick = () => open(it.dl);
    const run = (mode: "use" | "inspired") => {
      const asset = val("cmAsset").trim();
      if (asset && !/^(rbxassetid:\/\/)?\d{5,}$/.test(asset)) {
        this.notify("Asset id must be a number (e.g. 1234567890) or rbxassetid://1234567890.", "error", 8000);
        return;
      }
      this.h.useResource?.(communityTask(it, mode, asset, val("libNotes")));
      det.classList.add("hidden");
      this.el.libList.classList.remove("hidden");
      this.showTab("agent");
    };
    (this.root.getElementById("cmUse") as HTMLElement).onclick = () => run("use");
    (this.root.getElementById("cmLike") as HTMLElement).onclick = () => run("inspired");
    (this.root.getElementById("libBack") as HTMLElement).onclick = () => {
      det.classList.add("hidden");
      this.el.libList.classList.remove("hidden");
    };
  }

  // ---------------------------------------------------- Packs (bundled .rbxm asset packs)
  private pkThumb(p: PackLite, it: PackItemLite, size = 48): string {
    if (p.sprite && it.t >= 0 && this.h.resourceUrl) {
      const sc = size / p.tile;
      const x = (it.t % p.cols) * size;
      const y = Math.floor(it.t / p.cols) * size;
      return `<div class="spr" style="width:${size}px;height:${size}px;background:url('${this.h.resourceUrl(p.sprite)}') -${x}px -${y}px/${p.cols * p.tile * sc}px auto no-repeat"></div>`;
    }
    return `<div class="ph">${esc(it.k)}</div>`;
  }

  private renderPacks() {
    const d = this.packs;
    if (!d) {
      this.el.libCats.innerHTML = "";
      this.el.libGrid.innerHTML = `<div class="empty">${this.packsLoading ? "Loading asset packs…" : "Asset packs are not available."}</div>`;
      return;
    }
    const total = d.reduce((a, p) => a + p.items.length, 0);
    const kinds = new Map<string, number>();
    for (const p of d) for (const it of p.items) kinds.set(it.k, (kinds.get(it.k) ?? 0) + 1);
    const chips: Array<[string, string, number]> = [["all", "All", total], ...d.map((p) => [p.id, p.title.replace(/^(Official |The )/, "").replace(/ (Pack|Build Kit|Building Asset Pack)$/, ""), p.items.length] as [string, string, number]), ...[...kinds].sort((a, b) => b[1] - a[1]).slice(0, 7).map(([k, n]) => ["k:" + k, k, n] as [string, string, number])];
    this.el.libCats.innerHTML = chips.map(([v, l, n]) => `<button class="chip ${v === this.pkSel ? "on" : ""}" data-c="${esc(v)}">${esc(l)}<i>${n}</i></button>`).join("");
    for (const b of Array.from(this.el.libCats.querySelectorAll("button[data-c]"))) (b as HTMLElement).onclick = () => {
      this.pkSel = (b as HTMLElement).dataset.c!;
      this.cmLimit = 60;
      this.renderLibrary();
    };
    const q = (this.el.libQ as HTMLInputElement).value.trim().toLowerCase();
    const words = q.split(/\s+/).filter(Boolean);
    const list: Array<[PackLite, PackItemLite]> = [];
    for (const p of d) {
      if (this.pkSel !== "all" && !this.pkSel.startsWith("k:") && p.id !== this.pkSel) continue;
      for (const it of p.items) {
        if (this.pkSel.startsWith("k:") && it.k !== this.pkSel.slice(2)) continue;
        const hay = `${it.n} ${it.c} ${it.k} ${it.id}`.toLowerCase().replace(/_/g, " ");
        if (words.every((w) => hay.includes(w))) list.push([p, it]);
      }
    }
    const shown = list.slice(0, this.cmLimit);
    this.el.libGrid.innerHTML = shown.length
      ? shown.map(([p, it]) => `<button class="card" data-id="${esc(it.id)}" title="${esc(`${it.n} — ${it.c} (${p.title})`)}"><div class="pv pk">${this.pkThumb(p, it, 64)}</div><div class="nm">${esc(it.n.replace(/_/g, " "))}</div><div class="ds">${esc(`${it.k} · ${it.c}`)}</div></button>`).join("") +
        (list.length > shown.length ? `<button class="ghost more" id="pkMore">Show more (${list.length - shown.length})</button>` : "")
      : `<div class="empty">Nothing found. The agent can also search the packs itself (brickwire_assets).</div>`;
    for (const c of Array.from(this.el.libGrid.querySelectorAll(".card"))) (c as HTMLElement).onclick = () => this.openPackItem((c as HTMLElement).dataset.id!);
    const more = this.root.getElementById("pkMore") as HTMLElement | null;
    if (more) more.onclick = () => {
      this.cmLimit += 60;
      this.renderLibrary();
    };
  }

  openPackItem(id: string) {
    let found: [PackLite, PackItemLite] | null = null;
    for (const p of this.packs ?? []) {
      const it = p.items.find((x) => x.id === id);
      if (it) found = [p, it];
    }
    if (!found) return;
    const [p, it] = found;
    const apply = it.k === "texture" || it.k === "decal";
    const det = this.el.libDet;
    det.innerHTML = `<div class="det"><div class="big pv pk">${this.pkThumb(p, it, 96)}</div><div>
      <h3>${esc(it.n.replace(/_/g, " "))}</h3><div class="kd">${esc(`${it.k} · ${it.c} · ${p.title}`)}</div>
      <div class="hint">${esc(p.description)}</div>
      <div class="opt">${esc(apply ? `BW.asset("${it.id}", {ApplyTo = part})` : `BW.asset("${it.id}", {At={x,y,z}, Facing=0, Scale=1})`)}${it.s?.length === 3 ? `<br>size ${esc(it.s.join(" × "))} studs` : ""}</div>
      <textarea id="libNotes" placeholder="Optional notes: where to put it, how many, scale, which part to apply it to…"></textarea>
      <div class="acts2">
        <button class="pri" id="pkPlace">${apply ? "Apply to my parts" : "Place in my game"}</button>
        <button id="pkUse" title="The agent builds something bigger with this asset">Build something with it</button>
        <button class="ghost" id="pkCopy" title="Copy the id">Copy id</button>
        <button class="ghost" id="libBack">← Back to packs</button>
      </div></div></div>`;
    this.el.libList.classList.add("hidden");
    det.classList.remove("hidden");
    const notes = () => ((this.root.getElementById("libNotes") as HTMLTextAreaElement | null)?.value ?? "");
    const run = (mode: PackMode) => {
      this.h.useResource?.(packTask(it, mode, notes()));
      det.classList.add("hidden");
      this.el.libList.classList.remove("hidden");
      this.showTab("agent");
    };
    (this.root.getElementById("pkPlace") as HTMLElement).onclick = () => run("place");
    (this.root.getElementById("pkUse") as HTMLElement).onclick = () => run("use");
    (this.root.getElementById("pkCopy") as HTMLElement).onclick = () => {
      void navigator.clipboard?.writeText(it.id).then(() => this.notify(`Copied ${it.id}`, "info", 3000), () => undefined);
    };
    (this.root.getElementById("libBack") as HTMLElement).onclick = () => {
      det.classList.add("hidden");
      this.el.libList.classList.remove("hidden");
    };
  }

  private renderLibrary() {
    if (this.libSource === "cm") return this.renderCommunity();
    if (this.libSource === "pk") return this.renderPacks();
    // UI style presets and the showcase demo are not separate builds (they are the style= option of UI kits) — hidden from the list.
    const LIB_KITS = KITS.filter((k) => k.kind !== "style" && k.id !== "ui_showcase");
    if (this.libCat === "style") this.libCat = "all";
    const counts: Record<string, number> = { all: LIB_KITS.length + ICON_IDS.length, icon: ICON_IDS.length };
    for (const k of LIB_KITS) counts[k.kind] = (counts[k.kind] ?? 0) + 1;
    const cats: (KitKind | "icon" | "all")[] = ["all", "build", "furniture", "gameplay", "ui", "vfx", "anim", "icon"];
    this.el.libCats.innerHTML = cats
      .map((c) => `<button class="chip ${c === this.libCat ? "on" : ""}" data-c="${c}">${c === "all" ? "All" : KIND_LABELS[c].en}<i>${counts[c] ?? 0}</i></button>`)
      .join("");
    for (const b of Array.from(this.el.libCats.querySelectorAll("button"))) (b as HTMLElement).onclick = () => {
      this.libCat = (b as HTMLElement).dataset.c as KitKind | "icon" | "all";
      this.renderLibrary();
    };
    const q = (this.el.libQ as HTMLInputElement).value.trim().toLowerCase();
    const match = (s: string) => !q || q.split(/\s+/).every((w) => s.toLowerCase().includes(w));
    type Item = { id: string; name: string; desc: string; icon: boolean };
    const items: Item[] = [];
    if (this.libCat !== "icon") for (const k of LIB_KITS) if ((this.libCat === "all" || k.kind === this.libCat) && match(`${k.id} ${k.name} ${k.nameRu} ${k.desc} ${k.tags}`)) items.push({ id: k.id, name: k.name, desc: k.desc, icon: false });
    if (this.libCat === "all" || this.libCat === "icon") for (const id of ICON_IDS) if (match(`${id} icon ${ICONS[id].tags}`)) items.push({ id, name: id[0].toUpperCase() + id.slice(1), desc: "icon · " + ICONS[id].tags, icon: true });
    this.el.libGrid.innerHTML = items.length
      ? items.map((it) => `<button class="card" data-id="${it.id}" title="${esc(it.desc)}"><div class="pv ${it.icon ? "ico" : ""}">${this.previewOf(it.id)}</div><div class="nm">${esc(it.name)}</div><div class="ds">${esc(it.desc)}</div></button>`).join("")
      : `<div class="empty">Nothing found. Describe it in the chat instead — the agent can build it from scratch.</div>`;
    for (const c of Array.from(this.el.libGrid.querySelectorAll(".card"))) (c as HTMLElement).onclick = () => this.openResource((c as HTMLElement).dataset.id!);
  }

  openResource(id: string) {
    const k: KitInfo | undefined = KITS.find((x) => x.id === id);
    const icon = ICONS[id];
    const name = k?.name ?? id;
    const det = this.el.libDet;
    det.innerHTML = `<div class="det"><div class="big">${this.previewOf(id)}</div><div>
      <h3>${esc(name)}</h3><div class="kd">${esc(k ? `${KIND_LABELS[k.kind].en} · ${k.nameRu}` : "Icon · BW.icon")}</div>
      <div>${esc(k?.desc ?? "Vector icon made of GUI frames — no image upload needed. Tags: " + (icon?.tags ?? ""))}</div>
      <div class="opt">${esc(k ? `BW.kit("${k.id}", {At={x,y,z}, Facing=0${k.opts ? ", " + k.opts.split(" ").filter((o) => /^[a-zA-Z]+$/.test(o)).map((o) => o + "=…").join(", ") : ""}})` : `BW.icon(parent, "${id}", {Size={0,48,0,48}, Color="#hex"})`)}</div>
      <textarea id="libNotes" placeholder="Optional notes: size, colours, where to put it, what to change…"></textarea>
      <div class="acts2">
        <button class="pri" id="libExact" title="Builds this resource as-is (ONE BW.kit call), then verifies it">${k ? "Build this" : "Use this icon"}</button>
        ${k?.kind === "style" ? `<button id="libRestyle" title="Re-skins your existing UI in this style (names and scripts stay)">Restyle my UI</button>` : ""}
        ${k && k.kind !== "style" ? `<button id="libLike" title="The AI designs its own version in the same style">Make something like it</button>
        <button id="libShot" title="Puts a request into the message box — attach your screenshot and send">Like my screenshot…</button>` : ""}
        <button class="ghost" id="libBack">← Back to library</button>
      </div></div></div>`;
    this.el.libList.classList.add("hidden");
    det.classList.remove("hidden");
    const notes = () => ((this.root.getElementById("libNotes") as HTMLTextAreaElement | null)?.value ?? "");
    const run = (mode: ResourceMode) => {
      const text = resourceTask(id, mode, notes());
      this.h.useResource?.(text);
      det.classList.add("hidden");
      this.el.libList.classList.remove("hidden");
      this.showTab("agent");
    };
    (this.root.getElementById("libExact") as HTMLElement).onclick = () => run("exact");
    const restyle = this.root.getElementById("libRestyle") as HTMLElement | null;
    if (restyle) restyle.onclick = () => run("restyle");
    const like = this.root.getElementById("libLike") as HTMLElement | null;
    if (like) like.onclick = () => run("similar");
    const shot = this.root.getElementById("libShot") as HTMLElement | null;
    if (shot) shot.onclick = async () => {
      const ok = await this.h.fillComposer?.(resourceTask(id, "screenshot", notes()));
      this.notify(ok ? "Request is in the message box — attach your screenshot to it, then press Start Agent (or send it if the agent is already running)." : "Message box not found — open a chat first.", ok ? "info" : "error", 20000);
    };
    (this.root.getElementById("libBack") as HTMLElement).onclick = () => {
      det.classList.add("hidden");
      this.el.libList.classList.remove("hidden");
    };
  }

  floating = false;
  private drag: { x: number; y: number; r: number; b: number } | null = null;

  /** Floating window (fixed, draggable by the title bar) or docked above the composer. */
  setFloating(on: boolean) {
    this.floating = on;
    const wrap = this.root.querySelector(".wrap") as HTMLElement;
    wrap.classList.toggle("float", on);
    if (on) {
      this.host.style.cssText = "display:block;position:fixed;right:18px;bottom:18px;width:min(480px,calc(100vw - 36px));z-index:2147483646";
      const bar = this.root.querySelector(".bar") as HTMLElement;
      bar.onpointerdown = (e: PointerEvent) => {
        if ((e.target as HTMLElement).closest("button,select")) return;
        const r = this.host.getBoundingClientRect();
        this.drag = { x: e.clientX, y: e.clientY, r: window.innerWidth - r.right, b: window.innerHeight - r.bottom };
        bar.setPointerCapture(e.pointerId);
      };
      bar.onpointermove = (e: PointerEvent) => {
        if (!this.drag) return;
        const right = Math.max(0, Math.min(window.innerWidth - 120, this.drag.r - (e.clientX - this.drag.x)));
        const bottom = Math.max(0, Math.min(window.innerHeight - 40, this.drag.b - (e.clientY - this.drag.y)));
        this.host.style.right = right + "px";
        this.host.style.bottom = bottom + "px";
      };
      bar.onpointerup = () => (this.drag = null);
      if (this.host.parentElement !== document.body) document.body.appendChild(this.host);
    } else {
      this.host.style.cssText = "display:block;width:100%;position:relative;z-index:5";
      const bar = this.root.querySelector(".bar") as HTMLElement;
      bar.onpointerdown = bar.onpointermove = bar.onpointerup = null;
      if (this.host.parentElement === document.body) this.host.remove(); // content script re-docks it
    }
    this.el.float.title = on ? "Dock above the message box" : "Floating window";
  }

  /** Match the site's theme: light panel on light pages (Notion, Claude light…), dark otherwise. */
  applyTheme() {
    const lum = (() => {
      const probe = [this.host.parentElement, document.body, document.documentElement];
      for (let el = probe.find(Boolean) ?? null; el; el = el.parentElement) {
        const m = getComputedStyle(el).backgroundColor.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?/);
        if (m && (m[4] === undefined || Number(m[4]) > 0.5)) return (0.2126 * Number(m[1]) + 0.7152 * Number(m[2]) + 0.0722 * Number(m[3])) / 255;
      }
      for (const el of [document.body, document.documentElement]) {
        const m = el && getComputedStyle(el).backgroundColor.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?/);
        if (m && (m[4] === undefined || Number(m[4]) > 0.5)) return (0.2126 * Number(m[1]) + 0.7152 * Number(m[2]) + 0.0722 * Number(m[3])) / 255;
      }
      return matchMedia?.("(prefers-color-scheme: light)").matches ? 1 : 0;
    })();
    (this.root.querySelector(".wrap") as HTMLElement).classList.toggle("light", lum > 0.6);
  }

  private styleMode() {
    const m = (this.el.mode as HTMLSelectElement).value as SafetyMode;
    this.el.mode.className = "m-" + m;
    this.el.mode.title = MODE_INFO[m]?.hint ?? "";
  }

  private applyCollapse() {
    this.el.body.classList.toggle("hide", this.collapsed);
    this.el.collapse.textContent = this.collapsed ? "+" : "−";
  }

  setConnection(s: { online: boolean; health?: HealthResponse; error?: string }) {
    const dot = this.el.dot;
    if (!s.online || !s.health) {
      dot.className = "dot";
      this.el.state.textContent = "Bridge offline";
      this.el.studio.textContent = " · run start.bat";
      dot.title = s.error ?? "Bridge offline";
      this.el.project.textContent = "";
      return;
    }
    const h = s.health;
    const ready = h.state === "MCP_READY" || h.state === "SESSION_ACTIVE";
    // GREY = bridge offline · YELLOW = bridge up, Studio/MCP not usable · GREEN = bridge + Studio + MCP verified ready
    dot.className = "dot " + (ready ? "g" : "y");
    dot.title = `${h.reason} (MCP: ${h.mcp.state}, ${h.mcp.toolCount} tools)`;
    this.el.state.textContent = this.active ? (ready ? "Agent Active" : "Agent — Studio unavailable") : ready ? "Studio Ready" : "Bridge connected";
    this.el.studio.textContent = ready ? ` · ${h.mcp.toolCount} tools` : ` · ${h.reason}`;
    this.el.project.textContent = h.studio.selected ? ` · Project: ${h.session?.projectName ?? h.studio.selected.name}` : "";
  }

  setSession(s: { active: boolean; paused: boolean; sessionId: string | null }) {
    this.active = s.active;
    this.el.start.textContent = s.active ? "Stop Agent" : "Start Agent";
    this.el.start.className = s.active ? "no" : "pri";
    this.el.pause.classList.toggle("hidden", !s.active);
    this.el.stop.classList.toggle("hidden", !s.active);
    this.el.pause.textContent = s.paused ? "Resume" : "Pause";
    if (s.active && this.collapsed) {
      this.collapsed = false;
      this.applyCollapse();
    }
    if (s.active) this.el.state.textContent = s.paused ? "Agent Paused" : "Agent Active";
  }

  setStage(stage: AgentStage) {
    this.stage = stage;
    this.renderStages();
  }

  private renderStages() {
    const order: AgentStage[] = ["ANALYZE", "PLAN", "EXECUTE", "TEST", "FIX", "DONE"];
    const idx = order.indexOf(this.stage);
    this.el.stages.innerHTML = order.map((s, i) => `<span class="stg ${i === idx ? "on" : i < idx ? "past" : ""}">${s}</span>`).join("");
  }

  setTask(task: string | null) {
    this.el.task.textContent = task ?? "—";
    this.el.task.title = task ?? "";
  }

  activity(key: string, text: string, state: ActivityState) {
    let row = this.acts.get(key);
    if (!row) {
      row = document.createElement("div");
      this.acts.set(key, row);
      this.el.act.appendChild(row);
      while (this.el.act.children.length > 40) {
        const first = this.el.act.firstElementChild as HTMLElement;
        for (const [k, v] of this.acts) if (v === first) this.acts.delete(k);
        first.remove();
      }
    }
    row.className = "i-" + state;
    row.textContent = `${ICON[state]} ${text}`;
    row.title = text;
    this.el.act.scrollTop = this.el.act.scrollHeight;
  }

  private baseTitle: string | null = null;

  showApproval(env: CallEnvelope | null) {
    this.approvalId = env?.approvalId ?? null;
    // make a pending approval visible even when the user is looking at another part of the page/tab
    if (env && this.baseTitle === null) {
      this.baseTitle = document.title;
      document.title = "⚠ Approve — " + this.baseTitle;
    } else if (!env && this.baseTitle !== null) {
      document.title = this.baseTitle;
      this.baseTitle = null;
    }
    this.el.appr.classList.toggle("hidden", !env);
    this.el.approveTop.classList.toggle("hidden", !env);
    if (env) {
      const a = env.args as Record<string, unknown>;
      const code = typeof a.code === "string" ? a.code : typeof a.source === "string" ? a.source : "";
      const target = String(a.path ?? a.parent ?? a.name ?? "");
      this.el.apTool.textContent = `${env.tool} ${target}`.trim();
      this.el.apWhy.textContent = env.approvalReason ? `— ${env.approvalReason}` : "";
      // the FULL code (scrollable), so you can see exactly what will run
      this.el.apCode.textContent = code || JSON.stringify(a, null, 2);
      this.el.apCode.scrollTop = 0;
      if (this.collapsed) {
        this.collapsed = false;
        this.applyCollapse();
      }
    }
  }

  notify(msg: string, level: "info" | "warn" | "error", ms?: number, pre = false) {
    const n = this.el.note;
    n.className = "note " + level + (pre || msg.includes("\n") ? " pre" : "");
    n.textContent = msg;
    clearTimeout((n as unknown as { _t?: number })._t);
    (n as unknown as { _t?: number })._t = window.setTimeout(() => n.classList.add("hidden"), ms ?? (level === "error" ? 15000 : 8000));
    if (this.collapsed) {
      this.collapsed = false;
      this.applyCollapse();
    }
  }
}
