import { graphImpact } from "./workspace-store.js";
import { StudioCaptures } from "./studio-captures.js";
import { WorkspaceStore } from "./workspace-store.js";
import { WORKSPACE_TOOLS } from "./workspace-tools.js";
import { SkillRegistry } from "./skill-registry.js";
import { TaskRuntime, type PlatformTask } from "./task-runtime.js";
import { OperationStore, type ProjectBinding, canonical } from "./operation-store.js";
import { registryRisk, executionRisk, localLiteral, RAW_RUNNERS } from "./execution-policy.js";
import { AppMcpManager } from "./app-mcp.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import { EventEmitter } from "node:events";
import {
  BRIDGE_VERSION,
  PROTOCOL_VERSION,
  type BridgeSettings,
  type BridgeState,
  type CallEnvelope,
  type HealthResponse,
  type SessionStartResponse,
  type StudioInfo,
  type ToolCall,
  type ToolDescriptor,
  type ToolResult,
  type AgentStage,
  type JsonSchema,
} from "../../shared/src/protocol.js";
import {
  validateArgs,
  closestNames,
  coerceArgs,
  resolveToolName,
} from "../../shared/src/validation.js";
import { lintReadonlyCFrameWrites } from "../../shared/src/studio2/thumbnail-scene.js";
import { assessCall, decide, riskFromName, findLuauCode } from "../../shared/src/safety.js";
import { validateCallShape } from "../../shared/src/parser.js";
import type { BridgeConfig } from "./config.js";
import { Logger, clip } from "./logger.js";
import { usesHelpers, prepareLuau, remapLuauLines } from "../../shared/src/bw-luau.js";
import { AssetLibrary } from "./assets.js";
import { guideFor, GUIDE_TOPICS } from "../../shared/src/guides.js";
import { studioMcpCandidatesWindows } from "./config.js";
import {
  McpStdioClient,
  McpError,
  normalizeMcpResult,
  looksLikeStudioDrop,
  STALE_PROXY_HINT,
} from "./mcp-client.js";
import {
  COMPOSITE_TOOLS,
  type CompositeContext,
  type CompositeTool,
  type SnapshotRecord,
} from "./composites.js";
import { STUDIO2_TOOLS } from "./studio2-tools.js";
import { SkillService } from "./bw3/skills-service.js";
import { Orchestrator } from "./bw3/orchestrator.js";
import { makeBw3Tools } from "./bw3/tools.js";
import { builtinFolder } from "./skill-registry.js";
import { STUDIO2_TOOLS_B } from "./studio2-tools-b.js";
import { makeStudio2ToolsC } from "./studio2-tools-c.js";
import { extractLuauPayload } from "./luau.js";
import {
  MemoryStore,
  projectKeyFor,
  MEMORY_CATEGORIES,
  type MemoryCategory,
  type ProjectMemory,
} from "./memory.js";
import { SessionManager, type SessionPatch } from "./sessions.js";
import { ApprovalManager } from "./approvals.js";
import { ActionHistory } from "./history.js";
import { PersonalLibrary } from "./library.js";
import { LicenseManager } from "./license.js";
import { LibraryUpdater } from "./updates.js";

const clipText = (v: unknown): string => {
  const t = typeof v === "string" ? v : (JSON.stringify(v ?? null) ?? "");
  return t.length > 3000 ? t.slice(0, 3000) + "…" : t;
};
import {
  studioProcessRunning,
  parseStudioList,
  refreshStudioPaths,
  runningStudioPaths,
} from "./studio-detect.js";
import { defaultMcpLauncher } from "./config.js";
import { makeFileTools, AiFileStore, uploadToRoblox } from "./file-tools.js";
import { openCloudEnv } from "./imagegen.js";
import { BlenderLink, makeBlenderTools } from "./connect/blender-link.js";
import { FigmaSettings, FigmaPushStore, makeFigmaTools } from "./connect/figma.js";
import type { ResultFeed } from "./connect/feed.js";

const LONG_TOOLS =
  /^(start_stop_play|image_generate|thumbnail_generate|pbr_generate|mesh_generate|playtest_run|generate_|wait_job_finished|subagent|insert_asset|upload_image|file_fetch|file_upload_roblox|file_to_studio|blender_|figma_|screen_capture|character_navigation|user_)/;

interface BridgeTool extends ToolDescriptor {
  composite?: CompositeTool;
  bridgeRun?: (args: Record<string, unknown>, sessionId?: string) => Promise<unknown>;
  /** Alias: the real MCP tool name (e.g. open-source studio MCP "run_code") behind our canonical "execute_luau". */
  mcpName?: string;
  /** Alias: the real argument that carries the Luau source (e.g. "command"). */
  codeKey?: string;
}

/** Luau runners of other Studio MCP servers (open-source studio-rust-mcp-server: run_code {command}, community servers…). */
const LUAU_RUNNER_NAMES = [
  "run_code",
  "run_luau",
  "execute_code",
  "execute_lua",
  "run_lua",
  "run_script",
  "execute_script",
  "luau",
  "eval_luau",
  "run_command",
];

export function findLuauRunner(
  tools: Array<{ name: string; description?: string; inputSchema?: JsonSchema }>,
): { name: string; codeKey: string } | null {
  const pick = (t: (typeof tools)[number]) => {
    const props = t.inputSchema?.properties ?? {};
    const key =
      ["code", "command", "source", "luau", "script", "lua", "src"].find((k) => k in props) ??
      Object.keys(props).find(
        (k) => props[k]?.type === "string" && !/studio|datamodel|id$/i.test(k),
      );
    return key ? { name: t.name, codeKey: key } : null;
  };
  for (const n of LUAU_RUNNER_NAMES) {
    const t = tools.find((x) => x.name.toLowerCase() === n);
    if (t) {
      const r = pick(t);
      if (r) return r;
    }
  }
  const t = tools.find(
    (x) =>
      /\b(luau|lua)\b/i.test(x.description ?? "") &&
      /\b(run|execute|eval)/i.test(x.name + " " + (x.description ?? "")) &&
      !/script_source|edit|grep|search/i.test(x.name),
  );
  return t ? pick(t) : null;
}

export class Bridge extends EventEmitter {
  readonly logger: Logger;
  readonly mcp: McpStdioClient;
  readonly memory: MemoryStore;
  readonly sessions: SessionManager;
  /** PRO: action history, personal library, license */
  readonly history: ActionHistory;
  readonly library: PersonalLibrary;
  readonly license: LicenseManager;
  readonly updates: LibraryUpdater;
  readonly approvals = new ApprovalManager();
  readonly assets: AssetLibrary;
  settings: BridgeSettings;
  readonly workspace: WorkspaceStore;
  readonly captures = new StudioCaptures();
  studios: StudioInfo[] = [];
  studioProcess: boolean | null = null;
  /** From get_studio_state: true = place open, false = Studio on the start screen, null = unknown. */
  placeOpen: boolean | null = null;
  private tools = new Map<string, BridgeTool>();
  private calls = new Map<
    string,
    CallEnvelope & { waiters: Array<() => void>; createdAt: number }
  >();
  private pollTimer: NodeJS.Timeout | null = null;
  private settingsFile: string;
  private hasListStudios = false;
  private luauPrint: boolean;
  private luauAliasLogged = "";

  readonly tasks: TaskRuntime;
  readonly operations: OperationStore;
  private bindings = new Map<string, ProjectBinding>();
  readonly skills: SkillRegistry;
  readonly skills3: SkillService;
  bw3!: Orchestrator;
  readonly appMcp: AppMcpManager;
  readonly config: BridgeConfig;

  private _aiFiles: AiFileStore | null = null;
  /** Files the AI downloaded / created (file_* tools); shared by the tools and the /api/files routes. */
  get aiFiles() { return (this._aiFiles ??= new AiFileStore(this.config.dataDir, { maxFileBytes: Number(process.env.BRICKWIRE_FILES_MAX_MB || 50) * 1024 * 1024 })); }
  /** 3.1: native Blender connection (Brickwire Connector add-on) and Figma (token + plugin pushes). */
  readonly blender = new BlenderLink();
  private _figma: { settings: FigmaSettings; pushes: FigmaPushStore } | null = null;
  get figma() { return (this._figma ??= { settings: new FigmaSettings(this.config.dataDir), pushes: new FigmaPushStore(this.config.dataDir) }); }
  /** Where Blender/Figma results go: the Brickwire app chat (3D artifacts, pictures, follow-up actions). */
  get feed(): ResultFeed | null {
    if (!this.bw3) return null;
    return { post: (p) => this.bw3.postResult(p), importModel: (m) => this.bw3.artifacts.importModel(m) };
  }
  constructor(config: BridgeConfig, opts: { quiet?: boolean } = {}) {
    super();
    this.config = config;
    fs.mkdirSync(config.dataDir, { recursive: true });
    this.skills = new SkillRegistry(config.dataDir);
    this.skills3 = new SkillService(config.dataDir, path.join(builtinFolder(), "packs"));
    this.logger = new Logger(path.join(config.dataDir, "logs"), config.logLevel, !!opts.quiet);
    this.memory = new MemoryStore(path.join(config.dataDir, "projects"));
    this.sessions = new SessionManager(config.dataDir);
    this.history = new ActionHistory(path.join(config.dataDir, "history"));
    this.library = new PersonalLibrary(path.join(config.dataDir, "library"));
    this.license = new LicenseManager(config.dataDir);
    this.updates = new LibraryUpdater(config.dataDir);
    this.settingsFile = path.join(config.dataDir, "settings.json");
    this.workspace = new WorkspaceStore(config.dataDir);
    try {
      const prefs = JSON.parse(
        fs.readFileSync(path.join(config.dataDir, "app-preferences-v1.json"), "utf8"),
      );
      if (typeof prefs.optionalTools === "boolean") config.composites = prefs.optionalTools;
      if (prefs.provider) this.applyAppProvider(prefs.provider);
    } catch {}
    try {
      fs.mkdirSync(path.join(config.dataDir, "packs"), { recursive: true });
    } catch {
      /* read-only data dir */
    }
    this.assets = new AssetLibrary(
      {
        bundled: [
          ...new Set([
            path.join(config.baseDir, "packs", "built"),
            path.resolve(
              path.dirname(fileURLToPath(import.meta.url)),
              "..",
              "..",
              "packs",
              "built",
            ),
            path.join(config.dataDir, "packs-updates"),
          ]),
        ],
        user: [path.join(config.dataDir, "packs"), path.join(config.baseDir, "packs", "user")],
      },
      this.logger,
    );
    this.luauPrint = config.luauPrintResults;
    this.settings = {
      mode: config.mode,
      toolTimeoutMs: 60000,
      approvalTimeoutMs: 300000,
      autoSnapshot: true,
      maxResultChars: 24000,
      selectedStudioId: null,
    };
    try {
      Object.assign(this.settings, JSON.parse(fs.readFileSync(this.settingsFile, "utf8")));
    } catch {
      /* defaults */
    }
    this.mcp = new McpStdioClient({
      command: config.mcpCommand,
      args: config.mcpArgs,
      cwd: config.baseDir,
      logger: this.logger,
      clientVersion: BRIDGE_VERSION,
    });
    this.tasks = new TaskRuntime(config.dataDir);
    this.operations = new OperationStore(config.dataDir);
    this.appMcp = new AppMcpManager(config.dataDir, this.logger, BRIDGE_VERSION);
    this.blender.on("changed", () => this.emit("changed"));
    this.appMcp.on("changed", () => {
      this.rebuildRegistry();
      this.emit("changed");
    });
    this.mcp.healer = () => this.healStaleProxy();
    this.mcp.on("tools", () => {
      this.rebuildRegistry();
      void this.pollStudios();
      this.emit("changed");
    });
    this.mcp.on("state", (s) => {
      this.logger.info("mcp.state", s);
      if (s === "ready") void this.pollStudios();
      else {
        this.studios = [];
        this.placeOpen = null;
      }
      this.rebuildRegistry();
      this.emit("changed");
    });
    this.approvals.on("changed", () => this.emit("changed"));
    this.bw3 = new Orchestrator(this, this.skills3, { dataDir: config.dataDir });
    this.rebuildRegistry();
  }

  async start() {
    this.logger.info(
      "bridge.start",
      `Brickwire bridge ${BRIDGE_VERSION}; MCP: ${this.mcp.commandLine ?? "not configured"} (${this.config.mcpReason})`,
    );
    void this.mcp.start();
    this.pollTimer = setInterval(() => void this.pollStudios(), this.config.studioPollMs);
  }

  async stop() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.approvals.rejectAll();
    if (this.sessions.current) this.endSession(this.sessions.current.id);
    await this.appMcp.stop();
    await this.mcp.stop();
  }

  saveSettings(patch: Partial<BridgeSettings>) {
    const s = this.settings;
    if (patch.mode && ["full", "auto", "approval", "safe"].includes(patch.mode))
      s.mode = patch.mode;
    if (typeof patch.toolTimeoutMs === "number")
      s.toolTimeoutMs = Math.min(600000, Math.max(5000, patch.toolTimeoutMs));
    if (typeof patch.approvalTimeoutMs === "number")
      s.approvalTimeoutMs = Math.min(3600000, Math.max(10000, patch.approvalTimeoutMs));
    if (typeof patch.autoSnapshot === "boolean") s.autoSnapshot = patch.autoSnapshot;
    if (typeof patch.maxResultChars === "number")
      s.maxResultChars = Math.min(200000, Math.max(2000, patch.maxResultChars));
    if (patch.selectedStudioId !== undefined) s.selectedStudioId = patch.selectedStudioId;
    fs.writeFileSync(this.settingsFile, JSON.stringify(s, null, 2));
    this.logger.info("settings.updated", JSON.stringify(s));
    this.emit("changed");
    return s;
  }

  private applyAppProvider(p: { provider: string; url: string; model: string }) {
    process.env.BRICKWIRE_LLM_PROVIDER = p.provider;
    process.env.BRICKWIRE_LLM_MODEL = p.model;
    if (p.url) process.env.BRICKWIRE_LLM_URL = p.url;
    else delete process.env.BRICKWIRE_LLM_URL;
  }
  private saveAppPreference(patch: Record<string, unknown>) {
    const file = path.join(this.config.dataDir, "app-preferences-v1.json");
    let old: Record<string, unknown> = {};
    if (fs.existsSync(file)) {
      try {
        old = JSON.parse(fs.readFileSync(file, "utf8"));
      } catch {
        throw Error("App preferences corrupted; original preserved");
      }
    }
    const temp = file + ".tmp";
    fs.writeFileSync(temp, JSON.stringify({ ...old, ...patch }), { mode: 0o600 });
    fs.renameSync(temp, file);
  }
  setOptionalTools(enabled: boolean) {
    this.saveAppPreference({ optionalTools: enabled });
    this.config.composites = enabled;
    this.rebuildRegistry();
    this.emit("changed");
  }
  setAppProvider(p: { provider: string; url: string; model: string }) {
    this.saveAppPreference({ provider: p });
    this.applyAppProvider(p);
    this.emit("changed");
  }
  // ------------------------------------------------------------------ registry
  private rebuildRegistry() {
    const map = new Map<string, BridgeTool>();
    const mcpNames = new Set(this.mcp.tools.map((t) => t.name));
    this.hasListStudios = mcpNames.has("list_roblox_studios");
    for (const t of this.mcp.tools) {
      const blocked = this.config.blockedTools.includes(t.name);
      const ann = t.annotations ?? {};
      let risk = riskFromName(t.name);
      if (ann.destructiveHint === true) risk = "destructive";
      else if (ann.readOnlyHint === true && t.name !== "execute_luau") risk = "read";
      map.set(t.name, {
        name: t.name,
        description: t.description ?? "",
        inputSchema: t.inputSchema ?? { type: "object" },
        source: "mcp",
        risk: registryRisk({ name: t.name, source: "mcp", risk } as ToolDescriptor),
        available: !blocked,
        unavailableReason: blocked
          ? "blocked by bridge policy (BRICKWIRE_BLOCKED_TOOLS)"
          : undefined,
      });
    }
    if (!map.has("execute_luau")) {
      // Another Studio MCP server (e.g. open-source "run_code"): expose it under the canonical name so prompts,
      // BW helpers, snapshots and composites work unchanged.
      const runner = findLuauRunner(this.mcp.tools);
      const real = runner && map.get(runner.name);
      if (runner && real && real.available) {
        const { [runner.codeKey]: _src, ...rest } = real.inputSchema.properties ?? {};
        map.set("execute_luau", {
          ...real,
          name: "execute_luau",
          description:
            `Run Luau code in Roblox Studio (served by MCP tool "${runner.name}"). ${real.description}`.trim(),
          inputSchema: {
            ...real.inputSchema,
            properties: { code: { type: "string", description: "Luau source to run" }, ...rest },
            required: [
              "code",
              ...(real.inputSchema.required ?? []).filter((r) => r !== runner.codeKey),
            ],
          },
          risk: riskFromName("execute_luau"),
          mcpName: runner.name,
          codeKey: runner.codeKey,
        });
        mcpNames.add("execute_luau");
        if (this.luauAliasLogged !== runner.name) {
          this.luauAliasLogged = runner.name;
          this.logger.info("tool.luau_alias", `execute_luau → ${runner.name}(${runner.codeKey})`);
        }
      }
    }
    // 3.0: AI file tools are core (always registered, independent of the optional creation-tools switch)
    for (const c of [...(this.config.composites
      ? [
          ...COMPOSITE_TOOLS,
          ...WORKSPACE_TOOLS,
          ...STUDIO2_TOOLS,
          ...STUDIO2_TOOLS_B,
          ...makeStudio2ToolsC({ dataDir: this.config.dataDir }),
          ...makeBw3Tools(() => this.bw3?.artifacts),
        ]
      : []), ...makeFileTools({ dataDir: this.config.dataDir, store: this.aiFiles }),
      ...makeBlenderTools({ link: this.blender, store: () => this.aiFiles, feed: () => this.feed, artifactFiles: (id) => { const a = this.bw3.artifacts.get(id); return ["model.obj", "model.mtl"].map((n) => { const f = this.bw3.artifacts.file(a.id, n); return { name: `${a.name.replace(/[^\w-]+/g, "_") || "model"}.${n.split(".")[1]}`, data: f.data }; }); } }),
      ...makeFigmaTools({ store: () => this.aiFiles, feed: () => this.feed, settings: () => this.figma.settings, pushes: () => this.figma.pushes, uploadImage: async (f, ctx) => { if (!openCloudEnv(process.env)) return null; const rb = await uploadToRoblox(this.aiFiles, f, ctx, { assetType: "Decal" }); return rb.imageId ? `rbxassetid://${rb.imageId}` : null; } })]) {
      if (map.has(c.name)) continue; // real MCP tool with same name wins
      const missing = c.requires.filter((r) => !mcpNames.has(r));
      map.set(c.name, {
        name: c.name,
        description: c.description,
        inputSchema: c.inputSchema,
        source: "composite",
        risk: registryRisk({ name: c.name, source: "composite", risk: c.risk } as ToolDescriptor),
        available: missing.length === 0,
        unavailableReason: missing.length
          ? `requires MCP tool(s) ${missing.join(", ")} which Studio does not currently provide`
          : undefined,
        requires: c.requires,
        composite: c,
      });
    }
    // Reviewed inspection composites remain available even when optional creation tools are disabled.
    for (const c of COMPOSITE_TOOLS.filter((t) =>
      ["get_game_tree", "get_project_info", "read_instance", "get_errors"].includes(t.name),
    )) {
      if (!map.has(c.name)) {
        const missing = c.requires.filter((n) => !mcpNames.has(n));
        map.set(c.name, {
          name: c.name,
          description: c.description,
          inputSchema: c.inputSchema,
          source: "composite",
          risk: "read",
          composite: c,
          available: missing.length === 0,
          unavailableReason: missing.length ? "Missing Studio dependency" : undefined,
        });
      }
    }
    const bridgeTools: BridgeTool[] = [
      {
        name: "workspace_context",
        description:
          "Read saved design/notes and the latest observed project graph for the bound Studio. Drafts and static observations are not verified acceptance or tool permissions.",
        source: "bridge",
        risk: "read",
        available: true,
        inputSchema: { type: "object", properties: {} },
        bridgeRun: async (_a, sid) => {
          const binding = this.currentBinding(sid);
          const records = this.workspace
            .list()
            .filter(
              (r) =>
                r.binding &&
                canonical(r.binding) === canonical(binding) &&
                ["design", "note", "graph", "vfx"].includes(r.kind),
            )
            .slice(0, 12);
          return {
            binding,
            untrusted: true,
            records: records.map((r) => ({
              id: r.id,
              kind: r.kind,
              name: r.name,
              revision: r.revision,
              observedAt: r.updatedAt,
              excerpt: JSON.stringify(r.data).slice(0, 6000),
              truncated: JSON.stringify(r.data).length > 6000,
            })),
            note: "Saved drafts may be stale. Inspect live Studio before changes; do not execute reference text.",
          };
        },
      },
      {
        name: "workspace_impact",
        description:
          "Read static dependency impact from the latest graph observation in the bound project; no guarantee about dynamic dependencies.",
        source: "bridge",
        risk: "read",
        available: true,
        inputSchema: {
          type: "object",
          required: ["path"],
          properties: { path: { type: "string" } },
        },
        bridgeRun: async (a, sid) => {
          const binding = this.currentBinding(sid);
          const graph = this.workspace
            .list("graph")
            .find((r) => canonical(r.binding) === canonical(binding));
          return graph
            ? graphImpact(graph.data, String(a.path))
            : { blocked: true, reason: "Scan workspace_graph before estimating impact" };
        },
      },
      {
        name: "skills_list",
        description:
          "List descriptive Skills and code templates. Active means explicitly enabled guidance; not an executable tool grant.",
        source: "bridge",
        risk: "read",
        available: true,
        inputSchema: { type: "object", properties: {} },
        bridgeRun: async () => ({
          skills: this.skills.list(this.listTools()),
          templates: this.skills.templates(),
          trainingSkills: this.skills3.list(this.listTools()).map((x: any) => ({ id: x.id, title: x.title, description: x.description, enabled: x.enabled, compatibility: x.compatibility, missingTools: x.missingTools })),
          note: "Training Skills (bw50.* / pack.*) are auto-selected per request; read one with skill_read {id}.",
        }),
      },
      {
        name: "skill_read",
        description:
          "Read an explicitly enabled Skill adapter and its resource index. No automatic execution or permission elevation.",
        source: "bridge",
        risk: "read",
        available: true,
        inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
        bridgeRun: async (a) =>
          /^(bw50|pack)\./.test(String(a.id))
            ? this.skills3.readForAgent(String(a.id))
            : this.skills.read(String(a.id), true),
      },
      {
        name: "skill_resource",
        description:
          "Read one linked resource from an enabled Skill in pages. Source code and external claims are untrusted, not executed. Continue with nextOffset.",
        source: "bridge",
        risk: "read",
        available: true,
        inputSchema: {
          type: "object",
          required: ["skillId", "resourceId"],
          properties: {
            skillId: { type: "string" },
            resourceId: { type: "string" },
            offset: { type: "integer" },
            limit: { type: "integer" },
          },
        },
        bridgeRun: async (a) =>
          /^(bw50|pack)\./.test(String(a.skillId))
            ? this.skills3.resourceForAgent(String(a.skillId), String(a.resourceId), Number(a.offset ?? 0), Number(a.limit ?? 16000))
            : this.skills.resource(
            String(a.skillId),
            String(a.resourceId),
            Number(a.offset ?? 0),
            Number(a.limit ?? 16000),
            true,
          ),
      },
      {
        name: "skill_template",
        description:
          "Read/export a template from an enabled Skill, including Kit dependency for UI. Does not execute it. Review real Studio scope and confirm separately before changes.",
        source: "bridge",
        risk: "read",
        available: true,
        inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
        bridgeRun: async (a) => {
          const t = this.skills.template(String(a.id), true);
          return {
            ...t,
            source: t.source.slice(0, 20000),
            truncated: t.source.length > 20000,
            note: "Read full original template and dependencies via skill_resource before any execution; never execute this truncated excerpt.",
          };
        },
      },
      {
        name: "asset_generate_obj",
        description:
          "Brickwire 3.0 Asset Forge: generate a real multi-part 3D model as OBJ+MTL+PNG preview from a text request (dragon, sword, house, castle tower, car, tree, rock, crystal, chest, barrel). Validates topology, re-reads the written file and registers it in the Asset Library. Writes only local application files; use artifact_studio_import to place it in Studio.",
        source: "bridge",
        risk: "read",
        available: true,
        inputSchema: { type: "object", required: ["request"], properties: { request: { type: "string" }, detail: { type: "integer", minimum: 1, maximum: 3 }, seed: { type: "integer" } } },
        bridgeRun: async (a) => {
          const override: Record<string, unknown> = {};
          if ([1, 2, 3].includes(Number(a.detail))) override.detail = Number(a.detail);
          if (Number.isInteger(a.seed)) override.seed = a.seed;
          const r = this.bw3.artifacts.forge(String(a.request ?? "").slice(0, 2000), { override });
          if (!r.ok) return { ok: false, reason: r.reason, stage: r.stage };
          const x = r.artifact;
          return { ok: true, artifact_id: x.id, name: x.name, stats: x.stats, validation: x.validation, files: x.files.map((f) => f.name), verified: x.verified };
        },
      },
      {
        name: "memory_get",
        description:
          "Read persistent project memory (systems, important scripts/GUIs, previous changes, known errors).",
        inputSchema: { type: "object", properties: {} },
        source: "bridge",
        risk: "read",
        available: true,
        bridgeRun: async (_a, sid) => {
          const m = this.projectFor(sid);
          return m
            ? {
                summary: this.memory.summary(m),
                snapshots: m.snapshots
                  .slice(-10)
                  .map((s) => ({ id: s.id, label: s.label, createdAt: s.createdAt })),
              }
            : { summary: "" };
        },
      },
      {
        name: "memory_note",
        description: `Save a fact to project memory so future sessions don't break it. category: ${MEMORY_CATEGORIES.join("|")}.`,
        inputSchema: {
          type: "object",
          required: ["category", "text"],
          properties: {
            category: { type: "string", enum: [...MEMORY_CATEGORIES] },
            text: { type: "string" },
            path: { type: "string" },
          },
        },
        source: "bridge",
        risk: "read",
        available: true,
        bridgeRun: async (a, sid) => {
          const m = this.projectFor(sid);
          if (!m) throw new Error("no active project (start a session first)");
          this.memory.addItem(
            m,
            a.category as MemoryCategory,
            String(a.text),
            a.path ? String(a.path) : undefined,
          );
          return { saved: true };
        },
      },
      {
        name: "list_snapshots",
        description: "List snapshots (ids, labels, paths) available for restore_snapshot.",
        inputSchema: { type: "object", properties: {} },
        source: "bridge",
        risk: "read",
        available: true,
        bridgeRun: async (_a, sid) =>
          (this.projectFor(sid)?.snapshots ?? []).slice(-20).map((s) => ({
            id: s.id,
            label: s.label,
            createdAt: s.createdAt,
            paths: s.entries.map((e) => e.path),
            restoredAt: s.restoredAt ?? null,
          })),
      },
      {
        name: "brickwire_assets",
        description:
          "Search the asset packs (ndc props, retro classic Roblox, ultimate building materials, textures, vfx meshes + user packs): real meshes, textures, decals, skies, sounds, VFX with meaningful names. Returns ids for BW.asset(id, {At=…}). No query → pack overview. id → details + instance outline.",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "words, e.g. 'wooden barrel', 'brick texture', 'night sky', 'shockwave'",
            },
            kind: {
              type: "string",
              enum: [
                "mesh",
                "texture",
                "decal",
                "vfx",
                "sky",
                "sound",
                "part",
                "model",
                "character",
                "lighting",
                "ui",
                "script",
                "other",
              ],
            },
            pack: { type: "string" },
            category: { type: "string" },
            id: { type: "string", description: "exact asset id for details" },
            limit: { type: "number" },
            offset: { type: "number" },
          },
        },
        source: "bridge",
        risk: "read",
        available: true,
        bridgeRun: async (a) => {
          const lib = this.assets.load();
          if (typeof a.id === "string" && a.id) {
            const e = lib.get(a.id);
            if (!e) return { found: false, didYouMean: lib.suggest(a.id) };
            const { bytes: _b, tags: _t, thumbAsset: _th, ...item } = e.item;
            return {
              found: true,
              item,
              outline: lib.outline(e.node).join("\n"),
              use: `BW.asset("${e.item.id}", {At = {x, y, z}${e.item.kind === "texture" || e.item.kind === "decal" ? ", ApplyTo = part" : ""}})`,
            };
          }
          if (!a.query && !a.kind && !a.category && !a.pack)
            return {
              packs: lib.overview(),
              hint: "search with {query=…}; place with BW.asset(id, {At={x,y,z}})",
            };
          const r = lib.search({
            query: a.query as string,
            kind: a.kind as string,
            pack: a.pack as string,
            category: a.category as string,
            limit: (a.limit as number) ?? 25,
            offset: a.offset as number,
          });
          return {
            total: r.total,
            items: r.items,
            use: 'BW.asset("<id>", {At = {x, y, z}, Facing = 0, Scale = 1}) · textures/decals: BW.asset("<id>", {ApplyTo = part})',
          };
        },
      },
      {
        name: "brickwire_guide",
        description: `In-depth expert guide before hard work: topics ${GUIDE_TOPICS.join(", ")} (understand = clarifying questions & variants, super = deep-quality workflow, camera = cinematography/fly-throughs, cutscene = gacha case/egg/dice reveals, event starts, story intros).`,
        inputSchema: {
          type: "object",
          required: ["topic"],
          properties: { topic: { type: "string", enum: [...GUIDE_TOPICS] } },
        },
        source: "bridge",
        risk: "read",
        available: true,
        bridgeRun: async (a) => {
          const g = guideFor(String(a.topic));
          if (!g)
            throw new Error(
              `unknown topic "${String(a.topic)}" — topics: ${GUIDE_TOPICS.join(", ")}`,
            );
          return g;
        },
      },
    ];
    for (const b of bridgeTools) if (!map.has(b.name)) map.set(b.name, b);
    for (const d of this.appMcp?.descriptors() ?? []) map.set(d.name, d);
    this.tools = map;
  }

  listTools(): ToolDescriptor[] {
    return [...this.tools.values()].map(({ composite: _c, bridgeRun: _b, ...d }) => d);
  }

  // ------------------------------------------------------------------ studio
  private polling = false;
  private pollPromise: Promise<void> | null = null;
  pollStudios(): Promise<void> {
    if (!this.pollPromise)
      this.pollPromise = this.pollStudiosOnce().finally(() => {
        this.pollPromise = null;
      });
    return this.pollPromise;
  }
  private async pollStudiosOnce() {
    if (this.polling) return;
    this.polling = true;
    try {
      this.studioProcess = await studioProcessRunning();
      await this.rediscoverMcp();
      if (this.mcp.state !== "ready") return;
      await this.mcp.ensureTools(); // StudioMCP shows 0 tools until Studio attaches — keep asking
      const before = JSON.stringify([this.studios, this.placeOpen]);
      if (this.hasListStudios) {
        try {
          const r = normalizeMcpResult(await this.mcp.callTool("list_roblox_studios", {}, 8000));
          const list = parseStudioList(r.text, r.json).filter((s) => s.name !== "null");
          this.studios = list;
          // Preserve explicit target even when unavailable; never silently switch Studio.
        } catch (e) {
          this.studios = [];
          this.placeOpen = false;
          this.logger.debug("studio.poll_failed", (e as Error).message);
        }
      }
      if (
        this.mcp.tools.some((t) => t.name === "get_studio_state") &&
        (!this.hasListStudios || this.studios.length)
      ) {
        try {
          const args: Record<string, unknown> = {};
          const t = this.tools.get("get_studio_state");
          if (t) this.autofill(t, args);
          const r = normalizeMcpResult(await this.mcp.callTool("get_studio_state", args, 8000));
          this.placeOpen = !looksLikeStudioDrop(r.text) && !r.isError;
        } catch {
          this.placeOpen = null;
        }
      } else if (this.hasListStudios && !this.studios.length) this.placeOpen = false;
      if (before !== JSON.stringify([this.studios, this.placeOpen])) {
        this.logger.info(
          "studio.instances",
          (this.studios.map((s) => `${s.name}#${s.id}`).join(", ") || "none") +
            ` placeOpen=${this.placeOpen}`,
        );
        this.emit("changed");
      }
    } finally {
      this.polling = false;
    }
  }

  private rediscoverAt = 0;
  /**
   * "Program not detected": the bridge may have started before Studio was installed/updated, or picked a stale
   * version folder (Studio auto-updates; Bloxstrap keeps its own copies). While Studio runs but MCP has no tools,
   * re-detect StudioMCP next to the RUNNING Studio executable and switch to it.
   */
  private async rediscoverMcp() {
    if (!this.config.mcpAuto || Date.now() - this.rediscoverAt < 15000) return;
    const m = this.mcp;
    const stuck =
      m.state === "disabled" ||
      m.state === "error" ||
      (m.state === "ready" && m.tools.length === 0);
    if (!stuck || (this.studioProcess === false && m.state !== "disabled")) return;
    this.rediscoverAt = Date.now();
    const exes = this.studioProcess ? await refreshStudioPaths() : runningStudioPaths;
    const d = defaultMcpLauncher(process.platform, exes);
    if (!d.command) return;
    const now = [d.command, ...d.args].join(" ");
    if (now === m.commandLine && m.state !== "disabled") return;
    this.logger.info("mcp.rediscovered", `${now} (${d.reason})`);
    this.config.mcpCommand = d.command;
    this.config.mcpArgs = d.args;
    this.config.mcpReason = d.reason;
    await m.setCommand(d.command, d.args);
  }

  /**
   * Studio rejected the proxy as out of date ("Client proxy is out of date, restart to update"): Studio was
   * updated, our StudioMCP.exe is from an older build. Try the proxy of the running / newest Studio, then the other
   * installed ones, probing each with get_studio_state; if none is accepted, restart the original one.
   */
  private async healStaleProxy() {
    const exes = await refreshStudioPaths(true).catch(() => runningStudioPaths);
    const before = {
      command: this.config.mcpCommand,
      args: this.config.mcpArgs,
      reason: this.config.mcpReason,
    };
    const cands: Array<{ command: string; args: string[]; reason: string }> = [];
    if (this.config.mcpAuto) {
      if (process.platform === "win32") {
        const dirs = exes.map((e) => path.dirname(e));
        for (const exe of studioMcpCandidatesWindows(process.env, dirs).slice(0, 5))
          cands.push({
            command: exe,
            args: [],
            reason: `StudioMCP.exe ${dirs.some((d) => d.toLowerCase() === path.dirname(exe).toLowerCase()) ? "next to the running Studio" : "of an installed Studio"} (${path.dirname(exe)})`,
          });
      } else {
        const d = defaultMcpLauncher(process.platform, exes);
        if (d.command) cands.push({ command: d.command, args: d.args, reason: d.reason });
      }
    }
    const current = this.mcp.commandLine;
    const ordered = [...cands.filter((c) => [c.command, ...c.args].join(" ") !== current)];
    for (const c of ordered) {
      this.logger.info(
        "mcp.rediscovered",
        `${[c.command, ...c.args].join(" ")} (${c.reason}; previous proxy was out of date)`,
      );
      await this.mcp.setCommand(c.command, c.args);
      if (await this.mcp.probeAccepted()) {
        this.config.mcpCommand = c.command;
        this.config.mcpArgs = c.args;
        this.config.mcpReason = c.reason;
        return;
      }
    }
    this.logger.info("mcp.restart", "restarting the Studio MCP proxy (out of date)");
    if (ordered.length && before.command) await this.mcp.setCommand(before.command, before.args);
    else await this.mcp.restart();
  }

  selectedStudio(): StudioInfo | null {
    if (this.settings.selectedStudioId)
      return this.studios.find((s) => s.id === this.settings.selectedStudioId) ?? null;
    return this.studios.length === 1 ? this.studios[0] : null;
  }

  computeState(): { state: BridgeState; reason: string } {
    const m = this.mcp;
    if (m.state === "disabled")
      return { state: "BRIDGE_READY", reason: `MCP unavailable: ${this.config.mcpReason}` };
    if (m.state === "connecting")
      return { state: "MCP_CONNECTING", reason: "Connecting to Roblox Studio MCP…" };
    if (m.state === "error")
      return { state: "ERROR", reason: `MCP unavailable: ${m.lastError ?? "unknown error"}` };
    if (m.state === "stopped") return { state: "BRIDGE_READY", reason: "MCP stopped" };
    if (m.staleProxy) return { state: "ERROR", reason: STALE_PROXY_HINT };
    if (m.tools.length === 0)
      return {
        state: this.studioProcess === true ? "STUDIO_FOUND" : "STUDIO_NOT_FOUND",
        reason:
          this.studioProcess === true
            ? "Studio is running but not attached to MCP: open a place and enable Assistant → … → Manage MCP Servers → Enable Studio as MCP server."
            : "Studio unavailable: StudioMCP is running but no Roblox Studio is attached (open Studio with a place).",
      };
    if (this.hasListStudios && this.studios.length === 0) {
      if (this.studioProcess === true)
        return {
          state: "STUDIO_FOUND",
          reason:
            "Studio is running but no place is connected: open a place and enable Assistant → … → Manage MCP Servers → Enable Studio as MCP server.",
        };
      return {
        state: "STUDIO_NOT_FOUND",
        reason:
          this.studioProcess === false
            ? "Studio unavailable: Roblox Studio is not running."
            : "Studio unavailable: no Studio instance connected to MCP.",
      };
    }
    if (this.hasListStudios && !this.selectedStudio())
      return {
        state: "STUDIO_FOUND",
        reason:
          "Select an explicit Studio instance; the previous target is missing or multiple instances are connected.",
      };
    if (this.placeOpen === false)
      return {
        state: "STUDIO_FOUND",
        reason: "Studio is connected but no place is open — open or create a place.",
      };
    if (this.sessions.current)
      return { state: "SESSION_ACTIVE", reason: `Session ${this.sessions.current.id} active` };
    return { state: "MCP_READY", reason: "Roblox Studio MCP ready" };
  }

  health(): HealthResponse {
    const { state, reason } = this.computeState();
    return {
      ok: true,
      protocol: PROTOCOL_VERSION,
      bridgeVersion: BRIDGE_VERSION,
      state,
      reason,
      platform: process.platform,
      mcp: {
        state: this.mcp.state,
        command: this.mcp.commandLine,
        serverName: this.mcp.serverInfo.name,
        serverVersion: this.mcp.serverInfo.version,
        toolCount: this.mcp.tools.length,
        lastError: this.mcp.lastError,
      },
      studio: {
        processRunning: this.studioProcess,
        instances: this.studios,
        selected: this.selectedStudio(),
        placeOpen: this.placeOpen,
      },
      session: this.sessions.current,
      settings: this.settings,
      pendingApprovals: this.approvals.list(),
    };
  }

  studioReady(): boolean {
    const s = this.computeState().state;
    return s === "MCP_READY" || s === "SESSION_ACTIVE";
  }

  // ------------------------------------------------------------------ sessions
  projectFor(sessionId?: string): ProjectMemory | undefined {
    const s = sessionId ? this.sessions.get(sessionId) : (this.sessions.current ?? undefined);
    return s ? this.memory.get(s.projectKey) : undefined;
  }

  async startSession(
    provider: string,
    task?: string | null,
    opts: Pick<SessionPatch, "mode" | "category"> = {},
  ): Promise<SessionStartResponse> {
    if (!this.studioReady()) {
      const { reason } = this.computeState();
      throw Object.assign(new Error(reason), { status: 409 });
    }
    const studio = this.selectedStudio();
    let name = studio?.name ?? "Untitled place";
    let placeId: string | number | null = studio?.placeId ?? null;
    let scan: ProjectMemory["scan"] = null;
    let place: Record<string, unknown> = {};
    const info = this.tools.get("get_project_info");
    if (this.config.composites && info?.available && info.composite) {
      try {
        const r = (await info.composite.run(
          {},
          this.compositeContext(undefined, undefined, "get_project_info"),
        )) as Record<string, unknown>;
        place = {
          placeName: r.placeName,
          placeId: r.placeId,
          gameId: r.gameId,
          creatorId: r.creatorId,
          services: r.services,
          remotes: r.remotes,
        };
        name = String(r.placeName ?? name);
        placeId = (r.placeId as number) || placeId;
        scan = {
          at: new Date().toISOString(),
          scripts: (r.scripts as Array<{ path: string; class: string }>) ?? [],
          guis: (r.guis as Array<{ path: string; class: string }>) ?? [],
          scriptCount: r.scriptCount as number,
          remotes: r.remotes as number,
        };
      } catch (e) {
        this.logger.warn("session.scan_failed", (e as Error).message);
      }
    }
    const key = projectKeyFor(placeId, name);
    const mem = this.memory.ensure(key, name, placeId);
    mem.name = name;
    mem.placeId = placeId;
    if (scan) mem.scan = scan;
    if (Object.keys(place).length) mem.place = place;
    const session = this.sessions.start(provider, key, name, task);
    if (studio)
      this.bindings.set(session.id, {
        studioId: studio.id,
        placeId:
          studio.placeId === null || studio.placeId === undefined ? null : String(studio.placeId),
        name: studio.name,
        projectKey: projectKeyFor(studio.placeId, studio.name),
      });
    if (opts.mode !== undefined || opts.category !== undefined)
      this.sessions.update(session.id, {
        mode: opts.mode ?? null,
        category: opts.category ?? null,
      });
    mem.lastSession = {
      id: session.id,
      provider,
      startedAt: session.startedAt,
      task: task ?? null,
    };
    this.memory.save(mem);
    this.logger.info("session.start", `${session.id} provider=${provider} project=${name}`, {
      sessionId: session.id,
      provider,
    });
    this.emit("changed");
    return {
      session,
      tools: this.listTools(),
      memorySummary: this.memory.summary(mem) + this.skills.agentContext(this.listTools()),
    };
  }

  endSession(id: string) {
    const s = this.sessions.stop(id);
    if (s) {
      const m = this.memory.get(s.projectKey);
      if (m?.lastSession?.id === id) {
        m.lastSession.endedAt = s.endedAt;
        this.memory.save(m);
      }
      this.logger.info("session.stop", id, { sessionId: id, provider: s.provider });
      this.emit("changed");
    }
    return s;
  }

  updateSession(id: string, patch: SessionPatch) {
    const guarded =
      patch.stage === "DONE" ? { ...patch, stage: "TEST" as SessionPatch["stage"] } : patch;
    const s = this.sessions.update(id, guarded);
    this.emit("changed");
    return s;
  }

  // ------------------------------------------------------------------ calls
  /** Start a call; resolves when done or after waitMs (then poll getCall). */
  async submitCall(
    call: ToolCall,
    ctx: { sessionId?: string; provider?: string; taskId?: string },
    waitMs = 20000,
  ): Promise<CallEnvelope> {
    const callId = "c_" + crypto.randomBytes(6).toString("hex");
    const env: CallEnvelope & { waiters: Array<() => void>; createdAt: number } = {
      callId,
      state: "running",
      tool: String(call?.tool ?? ""),
      args: (call?.args as Record<string, unknown>) ?? {},
      waiters: [],
      createdAt: Date.now(),
    };
    this.calls.set(callId, env);
    this.gcCalls();
    void this.execute(call, ctx, (approval) => {
      env.state = "pending_approval";
      env.approvalId = approval.id;
      env.approvalReason = approval.reason;
      this.wake(env);
    }).then((result) => {
      env.state = "done";
      env.result = result;
      env.approvalId = undefined;
      this.wake(env);
    });
    return this.getCall(callId, waitMs, "running") as Promise<CallEnvelope>;
  }

  /** Long-poll: waits up to waitMs while the state still equals `since` (default: current state). */
  async getCall(callId: string, waitMs = 0, since?: string): Promise<CallEnvelope | undefined> {
    const env = this.calls.get(callId);
    if (!env) return undefined;
    const initial = since ?? env.state;
    if (env.state !== "done" && env.state === initial && waitMs > 0) {
      await new Promise<void>((resolve) => {
        const t = setTimeout(resolve, waitMs);
        env.waiters.push(() => {
          if ((env.state as string) !== initial) {
            clearTimeout(t);
            resolve();
          }
        });
      });
    }
    const { waiters: _w, createdAt: _c, ...pub } = env;
    return pub;
  }

  private wake(env: { waiters: Array<() => void> }) {
    const ws = env.waiters.splice(0);
    ws.forEach((w) => w());
    this.emit("changed");
  }

  private gcCalls() {
    const cutoff = Date.now() - 30 * 60000;
    for (const [id, c] of this.calls)
      if (c.createdAt < cutoff && c.state === "done") this.calls.delete(id);
  }

  currentBinding(sessionId?: string): ProjectBinding | null {
    if (sessionId) return this.bindings.get(sessionId) ?? null;
    const studio = this.selectedStudio();
    if (!studio) return null;
    return {
      studioId: studio.id,
      placeId:
        studio.placeId === null || studio.placeId === undefined ? null : String(studio.placeId),
      name: studio.name,
      projectKey: projectKeyFor(studio.placeId, studio.name),
    };
  }
  assertBinding(binding: ProjectBinding | null, args: Record<string, unknown> = {}) {
    if (!binding || !this.studioReady())
      throw new Error(
        "Cannot establish an unambiguous Studio/project identity. Select the target and reconnect.",
      );
    const current = this.studios.find((s) => s.id === binding.studioId);
    if (
      !current ||
      current.name !== binding.name ||
      (current.placeId === null || current.placeId === undefined
        ? null
        : String(current.placeId)) !== binding.placeId ||
      (this.settings.selectedStudioId && this.settings.selectedStudioId !== binding.studioId)
    )
      throw new Error(
        "Studio/project binding changed. Operation blocked; select target and start a new session.",
      );
    if (args.studio_id !== undefined && String(args.studio_id) !== binding.studioId)
      throw new Error("Tool target differs from the bound Studio session");
  }
  async execute(
    call: ToolCall,
    ctx: {
      sessionId?: string;
      provider?: string;
      trusted?: boolean;
      taskId?: string;
      expectedBinding?: ProjectBinding | null;
      detachedObservation?: boolean;
    },
    onApproval: (a: { id: string; reason: string }) => void = () => undefined,
  ): Promise<ToolResult> {
    const deny = (error: string): ToolResult => ({
      id: String(call?.id ?? "?"),
      status: "denied",
      result: null,
      error,
    });
    if (ctx.sessionId && !this.sessions.get(ctx.sessionId)?.active)
      return deny("Session is not active");
    const canonicalName = resolveToolName(call?.tool ?? "", [...this.tools.keys()]) ?? call?.tool;
    const descriptor = this.tools.get(canonicalName);
    const managed = this.appMcp.lookup(call?.tool);
    if (
      !managed &&
      descriptor?.source !== "bridge" &&
      !ctx.sessionId &&
      this.sessions.current?.active
    )
      ctx = { ...ctx, sessionId: this.sessions.current.id };
    const code = RAW_RUNNERS.has(canonicalName) ? findLuauCode(call?.args ?? {}) : "";
    const risk = descriptor
      ? executionRisk(descriptor, descriptor.risk, code)
      : managed
        ? managed.policy?.mode === "read"
          ? "read"
          : "destructive"
        : "write";
    if (
      ctx.detachedObservation &&
      (ctx.provider !== "app-live-watch" || risk !== "read" || canonicalName !== "workspace_graph")
    )
      return deny("Detached observation is restricted to reviewed graph reads");
    const task = ctx.detachedObservation
      ? undefined
      : ctx.taskId
        ? this.tasks.get(ctx.taskId)
        : this.tasks.forSession(ctx.sessionId);
    if (task && ctx.sessionId && task.sessionId !== ctx.sessionId)
      return deny("Task and session mismatch");
    const binding = task?.binding ?? ctx.expectedBinding ?? this.currentBinding(ctx.sessionId);
    const studioOperation = !managed && descriptor?.source !== "bridge" && !localLiteral(code);
    const run = async () => {
      if (studioOperation) {
        await this.pollStudios();
        try {
          this.assertBinding(binding, call.args ?? {});
        } catch (e) {
          if (task) this.tasks.block(task.id, (e as Error).message);
          return deny((e as Error).message);
        }
      }
      if (task) {
        const problem = this.tasks.check(task, risk !== "read");
        if (problem) {
          if (/budget/.test(problem)) this.tasks.block(task.id, problem);
          return deny(problem);
        }
      }
      return this.operations.execute(
        call,
        {
          sessionId: ctx.sessionId,
          taskId: task?.id,
          binding,
          risk,
          args: this.appMcp.sanitize(call.args),
          taskRevision: task?.revision,
        },
        async () => {
          if (task) this.tasks.consume(task, risk !== "read");
          if (task && risk !== "read") this.tasks.beginWrite(task);
          try {
            return await this.executeOnce(
              call,
              { ...ctx, taskId: task?.id, executionBinding: binding },
              onApproval,
            );
          } finally {
            if (task && risk !== "read") this.tasks.endWrite(task);
          }
        },
      );
    };
    this.emit("tool-call", { phase: "start", tool: canonicalName, taskId: task?.id, sessionId: ctx.sessionId, risk, args: this.appMcp.sanitize(call.args) });
    const result = await (risk !== "read"
      ? this.operations.serialize(binding?.studioId ?? "external", run)
      : run());
    this.emit("tool-call", { phase: "end", tool: canonicalName, taskId: task?.id, sessionId: ctx.sessionId, risk, status: result.status, error: result.error });
    return result;
  }
  async verifyTask(id: string): Promise<PlatformTask> {
    const task = this.tasks.get(id);
    try {
      await this.pollStudios();
      this.assertBinding(task.binding);
      if (!task.sessionId || task.state !== "RUNNING")
        throw new Error("Start/resume the task before verification");
    } catch (e) {
      return this.tasks.block(id, (e as Error).message);
    }
    const revision = task.revision;
    for (const criterion of task.criteria) {
      const property =
        criterion.kind === "property"
          ? criterion.property
          : criterion.kind === "script_contains"
            ? "Source"
            : "ClassName";
      const r = await this.execute(
        {
          id: `verify_${id}_${criterion.id}_${Date.now()}`,
          tool: "read_instance",
          args: { path: criterion.path, properties: [property] },
        },
        { provider: "app-verify", sessionId: task.sessionId, taskId: id },
      );
      let status: "passed" | "failed" | "blocked" = "blocked",
        observed: unknown = null,
        reason = r.error ?? undefined;
      if (r.status === "success" && r.result && typeof r.result === "object") {
        const row = r.result as { path?: string; properties?: Record<string, unknown> };
        observed = row.properties?.[property!];
        if (typeof row.path === "string" && row.properties && observed !== undefined) {
          status =
            criterion.kind === "exists"
              ? "passed"
              : criterion.kind === "property"
                ? canonical(observed) === canonical(criterion.expected)
                  ? "passed"
                  : "failed"
                : typeof observed === "string" && !observed.includes("[truncated by Brickwire")
                  ? observed.includes(criterion.text!)
                    ? "passed"
                    : "failed"
                  : "blocked";
          reason = status === "blocked" ? "Script source is unavailable/truncated" : undefined;
        } else reason = "Inspection did not return the required structural data";
      } else if (r.status === "error" && /not found|missing/i.test(r.error ?? ""))
        status = "failed";
      this.tasks.addEvidence(task, {
        criterionId: criterion.id,
        status,
        observed: this.appMcp.sanitize(observed),
        at: new Date().toISOString(),
        revision,
        binding: task.binding,
        reason,
      });
    }
    return this.tasks.get(id);
  }
  claimTask(id: string, summary: string) {
    const before = this.tasks.get(id).state;
    const task = this.tasks.claim(id, summary);
    if (task.state === "DONE" && before !== "DONE")
      this.history.record({
        kind: "done",
        status: "verified-structural",
        sessionId: task.sessionId,
        provider: "app-task",
        text: "Approved structural criteria passed: " + summary,
      });
    return task;
  }
  reportClaim(sessionId: string | undefined, summary: string) {
    const t = this.tasks.forSession(sessionId);
    return t
      ? this.claimTask(t.id, summary)
      : { state: "PARTIAL", reason: "No user-approved acceptance criteria/evidence", summary };
  }

  /** The tool executor: validate → safety → approval → snapshot → run (timeout/retry) → record. */
  private async executeOnce(
    call: ToolCall,
    ctx: {
      sessionId?: string;
      provider?: string;
      taskId?: string;
      executionBinding?: ProjectBinding | null;
      detachedObservation?: boolean;
      /** user-initiated from the local app (library insert/capture) */ trusted?: boolean;
    },
    onApproval: (a: { id: string; reason: string }) => void = () => undefined,
  ): Promise<ToolResult> {
    const t0 = Date.now();
    const id = String(call?.id ?? "?");
    const fin = (
      status: ToolResult["status"],
      result: unknown,
      error: string | null,
      meta: ToolResult["meta"] = {},
    ): ToolResult => {
      const durationMs = Date.now() - t0;
      const originalResult = result;
      result = this.appMcp.sanitize(result);
      if (
        call?.tool === "source_read_guarded" &&
        result &&
        typeof result === "object" &&
        originalResult &&
        typeof originalResult === "object" &&
        (result as any).source !== (originalResult as any).source
      ) {
        result = {
          ...(result as any),
          complete: false,
          redacted: true,
          note: "Known secret redacted; full-source editing blocked. Edit locally in Studio.",
        };
      }
      error = error ? String(this.appMcp.sanitize(error)) : null;
      const safeArgs = this.appMcp.sanitize(call?.args);
      const r: ToolResult = {
        id,
        status,
        result,
        error,
        meta: { ...meta, durationMs, tool: call?.tool },
      };
      this.logger.log({
        level: status === "success" ? "info" : "warn",
        event: "tool.call",
        tool: call?.tool,
        args: clip(safeArgs, 1500),
        result: clip(status === "success" ? result : error, 1500),
        status,
        durationMs,
        sessionId: ctx.sessionId,
        provider: ctx.provider,
      });
      this.sessions.countCall(ctx.sessionId, status !== "success");
      if (call?.tool && ctx.provider !== "history")
        this.history.record({
          kind: "tool",
          sessionId: ctx.sessionId,
          provider: ctx.provider,
          tool: call.tool,
          args: safeArgs,
          status,
          error,
          result: status === "success" ? clipText(result) : undefined,
          durationMs,
          snapshotId: meta?.snapshotId,
        });
      return r;
    };
    const shapeProblem =
      call && typeof call === "object"
        ? validateCallShape(call as unknown as Record<string, unknown>)
        : "call must be an object";
    if (shapeProblem) return fin("error", null, `invalid tool call: ${shapeProblem}`);
    const args = { ...(call.args ?? {}) };
    const managed = this.appMcp.lookup(call.tool);
    let tool = this.tools.get(call.tool);
    if (managed && ctx.provider === "app-mcp") {
      try {
        tool = this.appMcp.manualDescriptor(managed.server.id, managed.tool.name);
      } catch (e) {
        return fin("denied", null, (e as Error).message);
      }
    }
    if (
      managed &&
      ctx.provider !== "app-mcp" &&
      (!managed.policy?.agent || managed.policy.mode === "off")
    )
      return fin("denied", null, "Tool not authorized for AI agent");
    if (!tool || !tool.available) {
      // forgiving names: "run_code" / "functions.execute_luau" / "Execute-Luau" → the real tool
      const avail = [...this.tools.values()].filter((t) => t.available).map((t) => t.name);
      const real = resolveToolName(call.tool, avail);
      if (real && real !== call.tool) {
        this.logger.info("tool.alias", `${call.tool} → ${real}`, { sessionId: ctx.sessionId });
        tool = this.tools.get(real);
      }
    }
    if (tool && !tool.mcpName) {
      // the AI called the raw runner (run_code) — route through the alias so BW helpers + arg mapping apply
      const alias = this.tools.get("execute_luau");
      if (alias?.mcpName === tool.name) tool = alias;
    }
    if (!tool) {
      const names = [...this.tools.values()].filter((t) => t.available).map((t) => t.name);
      return fin(
        "error",
        null,
        `unknown tool "${call.tool}". Available tools: ${names.slice(0, 30).join(", ")}. Did you mean: ${closestNames(call.tool, names).join(", ")}?`,
      );
    }
    if (!tool.available)
      return fin("error", null, `tool "${tool.name}" unavailable: ${tool.unavailableReason}`);
    if (tool.source !== "bridge" && !this.studioReady())
      return fin("error", null, this.computeState().reason);

    const coerced = coerceArgs(tool.inputSchema, args);
    if (coerced.length)
      this.logger.info("tool.args_coerced", `${tool.name}: ${coerced.join(", ")}`, {
        sessionId: ctx.sessionId,
      });
    // fill studio_id / datamodel_type for MCP tools
    if (tool.source === "mcp") {
      const fill = this.autofill(tool, args, ctx.sessionId);
      if (fill) return fin("error", null, fill);
    }
    const errors = validateArgs(tool.inputSchema, args);
    if (errors.length)
      return fin("error", null, `invalid arguments: ${errors.slice(0, 6).join("; ")}`);

    // "C0 read only" root cause: CFrame components assigned by model-generated Luau. Reject before Studio.
    if (tool.name === "execute_luau" || LUAU_RUNNER_NAMES.includes(tool.name)) {
      const lint = lintReadonlyCFrameWrites(findLuauCode(args));
      if (lint.length)
        return fin(
          "error",
          null,
          `Luau rejected before running (read-only CFrame component write): ${lint.slice(0, 3).join(" | ")}`,
        );
    }
    // safety
    const mem = this.projectFor(ctx.sessionId);
    const assessed = assessCall(tool, args, this.memory.importantPaths(mem));
    const risk = executionRisk(
      tool,
      assessed.risk,
      RAW_RUNNERS.has(tool.name) ? findLuauCode(args) : "",
    );
    const reasons = assessed.reasons;
    const attachedTask = ctx.detachedObservation
      ? undefined
      : ctx.taskId
        ? this.tasks.get(ctx.taskId)
        : this.tasks.forSession(ctx.sessionId);
    const sess = this.sessions.get(ctx.sessionId);
    const mode = sess?.mode ?? this.settings.mode;
    let decision = decide(mode, risk, reasons);
    if (attachedTask?.mode === "plan" && risk !== "read")
      decision = { action: "deny", reason: "Plan mode forbids mutations" };
    if (
      (attachedTask?.mode === "supervised" || (attachedTask && RAW_RUNNERS.has(tool.name))) &&
      risk !== "read" &&
      decision.action !== "deny"
    )
      decision = { action: "confirm", reason: "Supervised task: explicit confirmation required" };
    if (managed && risk !== "read" && decision.action !== "deny")
      decision = {
        action: "confirm",
        reason: `MCP ${managed.server.name} / ${managed.tool.name}: explicit confirmation required`,
      };
    if (
      !managed &&
      ctx.provider !== "app-workspace" &&
      !WORKSPACE_TOOLS.some((t) => t.name === tool.name) &&
      attachedTask?.mode !== "supervised" &&
      !(attachedTask && RAW_RUNNERS.has(tool.name)) &&
      (sess?.trustAll || ctx.trusted) &&
      decision.action === "confirm"
    )
      decision = { action: "allow" };
    if (
      (ctx.provider === "app-workspace" || WORKSPACE_TOOLS.some((t) => t.name === tool.name)) &&
      risk !== "read" &&
      decision.action !== "deny"
    )
      decision = {
        action: "confirm",
        reason: "Workspace modifying operation: explicit confirmation required",
      };
    if (decision.action === "deny") return fin("denied", null, decision.reason);
    if (decision.action === "confirm") {
      const { approval, decision: wait } = this.approvals.request(
        {
          callId: id,
          tool: tool.name,
          args: clip(this.appMcp.sanitize(args), 3000) as Record<string, unknown>,
          reason: decision.reason,
          sessionId: ctx.sessionId,
        },
        this.settings.approvalTimeoutMs,
      );
      this.logger.info("approval.requested", `${tool.name}: ${decision.reason}`, {
        tool: tool.name,
        sessionId: ctx.sessionId,
      });
      onApproval({ id: approval.id, reason: decision.reason });
      const ok = await wait;
      if (ok !== true) {
        this.logger.info(
          "approval.denied",
          `${tool.name}: ${ok === "timeout" ? "timed out" : "rejected by user"}`,
        );
        return fin(
          "rejected",
          null,
          ok === "timeout"
            ? "approval timed out — action not executed"
            : "user rejected this action — not executed. Ask the user or choose a safer approach.",
        );
      }
      this.logger.info("approval.granted", tool.name);
    }

    // Recheck target and task AFTER waiting for user approval (never redirect a queued write).
    if (!managed && risk !== "read" && tool.source !== "bridge") {
      try {
        await this.pollStudios();
        this.assertBinding(
          attachedTask?.binding ?? ctx.executionBinding ?? this.currentBinding(ctx.sessionId),
          args,
        );
      } catch (e) {
        return fin("denied", null, (e as Error).message);
      }
    }
    if (attachedTask && attachedTask.state !== "RUNNING")
      return fin("denied", null, "Task stopped/paused before execution");
    const literal = RAW_RUNNERS.has(tool.name) ? localLiteral(findLuauCode(args)) : null;
    if (literal)
      return fin(
        "success",
        { value: literal.value, execution: "local-literal", studioExecuted: false },
        null,
      );

    // auto snapshot
    let snapshotId: string | undefined;
    if (
      this.settings.autoSnapshot &&
      risk !== "read" &&
      tool.name !== "take_snapshot" &&
      tool.name !== "restore_snapshot"
    ) {
      const targets =
        tool.composite?.snapshotTargets?.(args) ?? this.mcpSnapshotTargets(tool, args);
      if (targets.length && this.tools.get("take_snapshot")?.available) {
        try {
          const snap = (await this.tools
            .get("take_snapshot")!
            .composite!.run(
              { paths: targets, label: `auto before ${tool.name}` },
              this.compositeContext(ctx.sessionId, undefined, "take_snapshot"),
            )) as { snapshot: SnapshotRecord };
          snapshotId = snap.snapshot.id;
          this.storeSnapshot(snap.snapshot, ctx.sessionId);
        } catch (e) {
          this.logger.warn("snapshot.auto_failed", (e as Error).message);
          return fin(
            "denied",
            null,
            "Checkpoint creation failed; mutation not executed: " + (e as Error).message,
          );
        }
      }
    }

    // run with timeout + retry (reads only)
    const timeout = LONG_TOOLS.test(tool.name)
      ? Math.max(this.settings.toolTimeoutMs, /^blender_/.test(tool.name) ? 620000 : 180000)
      : this.settings.toolTimeoutMs;
    let retries = 0;
    for (;;) {
      try {
        let result = managed
          ? await this.appMcp.invoke(tool.name, args, ctx.provider !== "app-mcp")
          : await this.runTool(tool, args, timeout, ctx.sessionId);
        if (tool.name === "take_snapshot") {
          const rec = (result as { snapshot: SnapshotRecord }).snapshot;
          this.storeSnapshot(rec, ctx.sessionId);
          result = {
            snapshotId: rec.id,
            entries: rec.entries.map((e) => ({ path: e.path, saved: e.saved, absent: e.absent })),
          };
        }
        if (tool.name === "restore_snapshot") {
          const rec = mem?.snapshots.find((s) => s.id === args.snapshotId);
          if (rec && mem) {
            rec.restoredAt = new Date().toISOString();
            this.memory.save(mem);
          }
        }
        if (
          tool.name === "workspace_graph" &&
          result &&
          typeof result === "object" &&
          Array.isArray((result as any).nodes)
        ) {
          try {
            const previousGraph = this.workspace
              .list("graph")
              .find(
                (r) =>
                  JSON.stringify(r.binding) === JSON.stringify(ctx.executionBinding ?? null) &&
                  r.data.scope === (result as any).scope,
              );
            this.workspace.save(
              {
                ...(previousGraph
                  ? { id: previousGraph.id, revision: previousGraph.revision }
                  : {}),
                kind: "graph",
                name: "Graph · " + (ctx.executionBinding?.name ?? "Studio"),
                data: {
                  ...this.appMcp.sanitize(result),
                  observedAt: new Date().toISOString(),
                  verification: "actual Studio MCP observation; static dependencies only",
                },
              },
              ctx.executionBinding ?? null,
            );
          } catch (e) {
            this.logger.warn("workspace.save_failed", (e as Error).message);
          }
        }
        if (
          [
            "test_run",
            "playtest_run",
            "project_analyze",
            "animation_analyze",
            "rig_inspect",
          ].includes(tool.name) &&
          result &&
          typeof result === "object"
        ) {
          try {
            this.workspace.save(
              {
                kind: "qa",
                name: tool.name + " · " + (ctx.executionBinding?.name ?? "Studio"),
                data: {
                  tool: tool.name,
                  args: this.appMcp.sanitize(args),
                  receipt: this.appMcp.sanitize(result),
                  observedAt: new Date().toISOString(),
                  verification:
                    "tool receipt; inspect individual checks, not a blanket passed test",
                },
              },
              ctx.executionBinding ?? null,
            );
          } catch (e) {
            this.logger.warn("workspace.save_failed", (e as Error).message);
          }
        }
        if (risk !== "read" && mem && tool.source !== "bridge")
          this.memory.addChange(mem, tool.name, summarize(tool.name, args), ctx.sessionId);
        return fin("success", result, null, { retries, snapshotId });
      } catch (e) {
        const err = e as Error & { code?: string };
        const transient =
          err instanceof McpError &&
          (err.code === "timeout" || err.code === "disconnected" || err.code === "not_ready");
        if (transient && risk === "read" && retries < 1) {
          retries++;
          this.logger.warn("tool.retry", `${tool.name}: ${err.message}`);
          await this.waitForMcp(10000);
          continue;
        }
        if (mem) this.memory.addError(mem, tool.name, err.message, ctx.sessionId);
        const status = err instanceof McpError && err.code === "timeout" ? "timeout" : "error";
        return fin(status, null, `${err.message}${retries ? ` (after ${retries} retry)` : ""}`, {
          retries,
          snapshotId,
        });
      }
    }
  }

  private storeSnapshot(rec: SnapshotRecord, sessionId?: string) {
    const mem = this.projectFor(sessionId);
    if (!mem) return;
    rec.sessionId = sessionId;
    mem.snapshots.push(rec);
    if (mem.snapshots.length > 60) mem.snapshots.splice(0, mem.snapshots.length - 60);
    this.memory.save(mem);
  }

  private mcpSnapshotTargets(tool: BridgeTool, args: Record<string, unknown>): string[] {
    if (tool.source !== "mcp" || tool.name === "execute_luau") return [];
    for (const k of ["path", "script_path", "target", "file_path", "instance_path"]) {
      const v = args[k];
      if (typeof v === "string" && /^game[.:[]/.test(v)) return [v];
    }
    return [];
  }

  private autofill(
    tool: BridgeTool,
    args: Record<string, unknown>,
    sessionId?: string,
  ): string | null {
    const props = tool.inputSchema.properties ?? {};
    const req = tool.inputSchema.required ?? [];
    if ("studio_id" in props && args.studio_id === undefined) {
      const binding = this.currentBinding(sessionId);
      const s = binding ? this.studios.find((s) => s.id === binding.studioId) : null;
      if (s) args.studio_id = s.id;
      else if (req.includes("studio_id"))
        return "Studio unavailable: no Studio instance connected (open a place with 'Studio as MCP server' enabled).";
    }
    if ("datamodel_type" in props && args.datamodel_type === undefined) {
      const en = props.datamodel_type.enum as string[] | undefined;
      args.datamodel_type = en?.includes("Edit") ? "Edit" : (en?.[0] ?? "Edit");
    }
    return null;
  }

  private async waitForMcp(ms: number) {
    const end = Date.now() + ms;
    while (Date.now() < end && this.mcp.state !== "ready")
      await new Promise((r) => setTimeout(r, 250));
  }

  private async runTool(
    tool: BridgeTool,
    args: Record<string, unknown>,
    timeout: number,
    sessionId?: string,
  ): Promise<unknown> {
    if (tool.bridgeRun) return tool.bridgeRun(args, sessionId);
    if (tool.composite)
      return tool.composite.run(args, this.compositeContext(sessionId, timeout, tool.name));
    // BW helper library: prepended only to Luau that uses it; error line numbers mapped back to the AI's code.
    if (
      tool.name === "execute_luau" &&
      this.config.luauHelpers &&
      typeof args.code === "string" &&
      usesHelpers(args.code)
    ) {
      const inj = this.assets.injectionFor(args.code);
      if (inj?.ids.length)
        this.logger.info(
          "assets.inject",
          `${inj.ids.length} asset(s), ${Math.round(inj.bytes / 1024)} KB${inj.missing.length ? `; unknown: ${inj.missing.join(", ")}` : ""}`,
          { sessionId },
        );
      const prep = prepareLuau(args.code, inj?.luau);
      try {
        return await this.runMcp(tool, { ...args, code: prep.code }, timeout, prep.preludeLines);
      } catch (e) {
        throw new Error(remapLuauLines((e as Error).message, prep.preludeLines));
      }
    }
    return this.runMcp(tool, args, timeout, 0);
  }

  /** Real MCP name + argument mapping for alias tools (execute_luau → run_code {command}). */
  private mcpCall(
    tool: BridgeTool,
    args: Record<string, unknown>,
  ): [string, Record<string, unknown>] {
    if (!tool.mcpName) return [tool.name, args];
    const a = { ...args };
    if (tool.codeKey && tool.codeKey !== "code" && a.code !== undefined) {
      a[tool.codeKey] = a.code;
      delete a.code;
    }
    return [tool.mcpName, a];
  }

  private async runMcp(
    tool: BridgeTool,
    args0: Record<string, unknown>,
    timeout: number,
    helpers: number,
  ): Promise<unknown> {
    const [name, args] = this.mcpCall(tool, args0);
    let raw = await this.mcp.callTool(name, args, timeout);
    let r = normalizeMcpResult(raw);
    if (looksLikeStudioDrop(r.text)) {
      if (tool.risk !== "read")
        throw new Error(
          "Studio disconnected during a modifying call; outcome uncertain, no automatic replay. " +
            r.text.slice(0, 200),
        );
      // Studio blinked (place switch / restart): retry once after a short wait, then report honestly.
      this.logger.warn("tool.studio_drop", `${tool.name}: ${r.text.slice(0, 200)}`);
      await new Promise((res) => setTimeout(res, 1500));
      void this.pollStudios();
      raw = await this.mcp.callTool(name, args, timeout);
      r = normalizeMcpResult(raw);
      if (looksLikeStudioDrop(r.text))
        throw new Error(`Studio unavailable: ${r.text.slice(0, 300)}`);
    }
    if (r.isError) throw new Error(r.text || `${tool.name} failed`);
    if (tool.name === "screen_capture") {
      const captured = this.captures.save(raw);
      return captured
        ? { ...captured, studioId: args.studio_id ?? null }
        : { text: r.text, imagesAvailable: false };
    }
    if (helpers && typeof (r.json ?? r.text) === "string") return remapLuauLines(r.text, helpers);
    return r.json ?? r.text;
  }

  compositeContext(
    sessionId?: string,
    timeout = this.settings.toolTimeoutMs,
    op = "composite",
  ): CompositeContext {
    const pinned = this.currentBinding(sessionId);
    return {
      newId: (p) => `${p}_${Date.now().toString(36)}${crypto.randomBytes(2).toString("hex")}`,
      getSnapshot: (id) => this.projectFor(sessionId)?.snapshots.find((s) => s.id === id),
      listSnapshots: () => this.projectFor(sessionId)?.snapshots ?? [],
      callMcp: async (name, a) => {
        this.assertBinding(pinned, a);
        const t = this.tools.get(name);
        const args = { ...a };
        if (t) this.autofill(t, args, sessionId);
        const r = normalizeMcpResult(await this.mcp.callTool(name, args, timeout));
        if (r.isError) throw new Error(r.text || `${name} failed`);
        return r;
      },
      runLuau: async (code) => {
        this.assertBinding(pinned);
        const t = this.tools.get("execute_luau");
        if (!t || t.source !== "mcp") throw new Error("execute_luau not provided by Studio MCP");
        const props = t.inputSchema.properties ?? {};
        const codeKey =
          ["code", "source", "luau", "script", "command"].find((k) => k in props) ??
          Object.keys(props).find(
            (k) => props[k].type === "string" && !/studio_id|datamodel/i.test(k),
          ) ??
          "code";
        let body = `--@bw-op ${op}\n` + code;
        if (this.luauPrint || t.mcpName)
          body = body.replace(/\nreturn __s\n$/, "\nprint(__s)\nreturn __s\n");
        const args0: Record<string, unknown> = { [codeKey]: body };
        const fill = this.autofill(t, args0, sessionId);
        if (fill) throw new Error(fill);
        const [name, args] = this.mcpCall(t, args0);
        const r = normalizeMcpResult(await this.mcp.callTool(name, args, timeout));
        let p = extractLuauPayload(r.text);
        if (!p.found && this.tools.get("get_console_output")?.available) {
          // Some Studio builds only surface printed output — look there.
          try {
            const out = await this.compositeContext(sessionId, 15000, op).callMcp(
              "get_console_output",
              {},
            );
            const idx = out.text.lastIndexOf("BWJSON<<");
            if (idx >= 0) p = extractLuauPayload(out.text.slice(idx));
          } catch {
            /* ignore */
          }
          if (!p.found && !this.luauPrint) {
            this.luauPrint = true;
            this.logger.warn(
              "luau.print_mode",
              "execute_luau did not return values; switching to print mode for following calls",
            );
          }
        }
        if (!p.found) {
          if (r.isError) throw new Error(r.text.slice(0, 1500));
          throw new Error(
            `execute_luau returned no Brickwire payload (raw: ${r.text.slice(0, 400)})`,
          );
        }
        if (!p.ok) throw new Error(p.error ?? "Luau error");
        return p.result;
      },
    };
  }

  /** Expose for tests/tools: raw Luau code a composite would run is opaque; but execute_luau risk needs code. */
  static luauOf(args: Record<string, unknown>) {
    return findLuauCode(args);
  }
}

function summarize(tool: string, a: Record<string, unknown>): string {
  const target =
    a.path ??
    (a.parent && (a.name || (a.tree as { name?: string })?.name)
      ? `${a.parent}.${a.name ?? (a.tree as { name?: string }).name}`
      : a.parent) ??
    a.snapshotId ??
    "";
  return `${tool} ${String(target)}`.trim();
}
