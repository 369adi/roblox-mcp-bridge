import { DEFAULT_BRIDGE_PORT } from "../../../shared/src/protocol.js";
import { PROVIDERS } from "../../../shared/src/providers.js";
import type { AgentCategory, SafetyMode } from "../../../shared/src/protocol.js";

/** Settings kept separately for every AI site. */
export interface ProviderPrefs {
  category: AgentCategory;
  mode: SafetyMode;
  /** Notion mode: keep a "Roblox Dev Log" page updated with Notion AI's native tools. */
  notionLog?: boolean;
  /** 1.8 SUPER mode: the AI thinks long, writes a design doc, builds in phases and self-critiques. */
  superMode?: boolean;
}

/** A chat site the user added in Options (generic adapter + marker reader). */
export interface CustomSite {
  host: string;
  name?: string;
  composer?: string;
  send?: string;
  stop?: string;
}
export const DEFAULT_PROVIDER_PREFS: ProviderPrefs = { category: "general", mode: "auto" };

export interface ExtensionSettings {
  bridgePort: number;
  providers: Record<string, boolean>;
  maxAutoTurns: number;
  reminderLimit: number;
  maxCallsPerMessage: number;
  settleMs: number;
  /** M1: quiet time after the provider's Stop button disappeared before the reply counts as finished. */
  fastEndMs: number;
  /** M1: read-only calls of one turn run in parallel up to this limit; writes stay sequential. */
  readParallel: number;
  /** M1: run closed tool blocks while the reply is still streaming. */
  streamExec: boolean;
  panelCollapsed: boolean;
  perProvider: Record<string, ProviderPrefs>;
  customSites: CustomSite[];
  /** Panel as a floating window instead of docked above the composer. */
  panelFloating: boolean;
}

export const DEFAULT_SETTINGS: ExtensionSettings = {
  bridgePort: DEFAULT_BRIDGE_PORT,
  providers: Object.fromEntries(PROVIDERS.map((p) => [p.id, p.enabledByDefault])),
  maxAutoTurns: 40,
  reminderLimit: 2,
  maxCallsPerMessage: 5,
  settleMs: 1500,
  fastEndMs: 250,
  readParallel: 4,
  streamExec: true,
  panelCollapsed: false,
  perProvider: {},
  customSites: [],
  panelFloating: false,
};

export function prefsFor(s: ExtensionSettings, provider: string): ProviderPrefs {
  return { ...DEFAULT_PROVIDER_PREFS, ...(s.perProvider?.[provider] ?? {}) };
}

export async function saveProviderPrefs(provider: string, patch: Partial<ProviderPrefs>): Promise<ExtensionSettings> {
  const cur = await loadSettings();
  const perProvider = { ...cur.perProvider, [provider]: { ...prefsFor(cur, provider), ...patch } };
  await chrome.storage.local.set({ settings: { ...cur, perProvider } });
  return { ...cur, perProvider };
}

export async function loadSettings(): Promise<ExtensionSettings> {
  try {
    const r = await chrome.storage.local.get("settings");
    const s = r?.settings ?? {};
    return { ...DEFAULT_SETTINGS, ...s, providers: { ...DEFAULT_SETTINGS.providers, ...(s.providers ?? {}) }, perProvider: { ...(s.perProvider ?? {}) } };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(patch: Partial<ExtensionSettings>): Promise<ExtensionSettings> {
  const cur = await loadSettings();
  const next = { ...cur, ...patch, providers: { ...cur.providers, ...(patch.providers ?? {}) }, perProvider: { ...cur.perProvider, ...(patch.perProvider ?? {}) } };
  await chrome.storage.local.set({ settings: next });
  return next;
}
