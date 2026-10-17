/**
 * Provider capability registry — single source of truth for hosts and support
 * status (used by the manifest generator, adapters, docs and dashboard).
 */

export type ProviderStatus = "beta" | "experimental" | "unavailable";

export interface ProviderInfo {
  id: string;
  name: string;
  hosts: string[];
  url: string;
  status: ProviderStatus;
  enabledByDefault: boolean;
  /** Max characters per injected message (results get truncated to fit). */
  maxMessageChars: number;
  notes: string;
  /** Delivery watchdog: re-send a message that is not visible in the chat after this long (default 7 s). Slow sites need more. */
  redeliverAfterMs?: number;
  /** Mount the panel floating (outside the site's React tree) unless the user docked it. */
  preferFloatingPanel?: boolean;
  /** Auto-press "Continue generating" when a reply is cut off (default true). */
  autoContinue?: boolean;
}

export const PROVIDERS: ProviderInfo[] = [
  {
    id: "chatgpt",
    name: "ChatGPT",
    hosts: ["chatgpt.com", "chat.openai.com"],
    url: "https://chatgpt.com/",
    status: "experimental",
    enabledByDefault: true,
    maxMessageChars: 30000,
    notes: "Generic adapter, not verified against the live site yet — use DeepSeek first. ProseMirror composer (#prompt-textarea); messages carry data-message-author-role.",
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    hosts: ["chat.deepseek.com"],
    url: "https://chat.deepseek.com/",
    status: "beta",
    enabledByDefault: true,
    maxMessageChars: 60000,
    notes: "Primary provider. Dedicated adapter: textarea composer, shared Send/Stop button handled, DeepThink reasoning excluded. Verified against a realistic replica; needs confirmation on the live site.",
  },
  {
    id: "claude",
    name: "Claude",
    hosts: ["claude.ai"],
    url: "https://claude.ai/new",
    status: "experimental",
    enabledByDefault: true,
    maxMessageChars: 40000,
    notes: "Generic adapter, not verified against the live site yet — use DeepSeek first. ProseMirror composer; streaming flag data-is-streaming. Tool calls inside Artifacts are not read — they must be in chat text.",
  },
  {
    id: "gemini",
    name: "Gemini",
    hosts: ["gemini.google.com"],
    url: "https://gemini.google.com/app",
    status: "experimental",
    enabledByDefault: true,
    maxMessageChars: 30000,
    notes: "Generic adapter, not verified against the live site yet — use DeepSeek first. Quill composer inside <rich-textarea>. Gemini can drift away from tool use in long sessions; reminders handle it.",
  },
  {
    id: "qwen",
    name: "Qwen",
    hosts: ["chat.qwen.ai"],
    url: "https://chat.qwen.ai/",
    status: "experimental",
    enabledByDefault: true,
    maxMessageChars: 30000,
    notes: "Generic adapter, not verified against the live site yet — use DeepSeek first. Textarea composer (#chat-input).",
  },
  {
    id: "kimi",
    name: "Kimi",
    hosts: ["www.kimi.com", "kimi.com", "www.kimi.ai", "kimi.ai"],
    url: "https://www.kimi.ai/",
    status: "experimental",
    enabledByDefault: true,
    maxMessageChars: 30000,
    notes: "Generic adapter, not verified against the live site yet — use DeepSeek first. Contenteditable composer. Kimi may prefer its native tools; reminders push it back to RBX_TOOL_CALL.",
  },
  {
    id: "glm",
    name: "GLM (Z.ai)",
    hosts: ["chat.z.ai"],
    url: "https://chat.z.ai/",
    status: "experimental",
    enabledByDefault: true,
    maxMessageChars: 30000,
    notes: "Generic adapter, not verified against the live site yet — use DeepSeek first. Open-WebUI style textarea (#chat-input).",
  },
  {
    id: "arena",
    name: "Arena",
    hosts: ["lmarena.ai", "arena.ai", "www.arena.ai"],
    url: "https://lmarena.ai/",
    status: "experimental",
    enabledByDefault: true,
    maxMessageChars: 20000,
    notes: "Generic adapter, not verified against the live site yet — use DeepSeek first. Only Direct (single-model) chat. Battle / side-by-side layouts are detected and Start is blocked.",
  },
  {
    id: "notion",
    name: "Notion AI",
    hosts: ["www.notion.so", "notion.so", "app.notion.com"],
    url: "https://www.notion.so/chat",
    status: "beta",
    enabledByDefault: true,
    // 40 000 was never verified on the live site; long messages also get collapsed in Notion's chat
    maxMessageChars: 18000,
    // Notion AI often works silently for 10–60 s (search, page edits, Dev Log) — re-sending after 7 s doubled messages
    redeliverAfterMs: 25000,
    // inserting the panel into Notion's React tree made it re-render the composer (draft lost)
    preferFloatingPanel: true,
    // "Continue" buttons in Notion belong to onboarding / upgrade dialogs, not to a cut-off reply
    autoContinue: false,
    notes:
      "First-class provider with a dedicated adapter: finds the AI chat box and never the page editor, reads replies via delivery markers (Notion's DOM has no stable hooks), Notion mode in the prompt (specs from pages, optional Dev Log page). Verified against a replica; selectors may need tuning on the live site — use Site check in the panel.",
  },
  {
    id: "grok",
    name: "Grok",
    hosts: ["grok.com"],
    url: "https://grok.com/",
    status: "experimental",
    enabledByDefault: true,
    maxMessageChars: 30000,
    notes: "Generic adapter + marker reader. Not verified on the live site.",
  },
  {
    id: "mistral",
    name: "Mistral Le Chat",
    hosts: ["chat.mistral.ai"],
    url: "https://chat.mistral.ai/chat",
    status: "experimental",
    enabledByDefault: true,
    maxMessageChars: 30000,
    notes: "Generic adapter + marker reader. Not verified on the live site.",
  },
  {
    id: "perplexity",
    name: "Perplexity",
    hosts: ["www.perplexity.ai", "perplexity.ai"],
    url: "https://www.perplexity.ai/",
    status: "experimental",
    enabledByDefault: true,
    maxMessageChars: 20000,
    notes: "Generic adapter + marker reader. Perplexity prefers web search answers; reminders push it back to tool calls. Not verified on the live site.",
  },
  {
    id: "copilot",
    name: "Microsoft Copilot",
    hosts: ["copilot.microsoft.com"],
    url: "https://copilot.microsoft.com/",
    status: "experimental",
    enabledByDefault: true,
    maxMessageChars: 10000,
    notes: "Generic adapter + marker reader. Short input limit. Not verified on the live site.",
  },
  {
    id: "poe",
    name: "Poe",
    hosts: ["poe.com"],
    url: "https://poe.com/",
    status: "experimental",
    enabledByDefault: true,
    maxMessageChars: 30000,
    notes: "Generic adapter + marker reader. Not verified on the live site.",
  },
];

export function providerForHost(host: string): ProviderInfo | undefined {
  const h = host.toLowerCase();
  return PROVIDERS.find((p) => p.hosts.some((ph) => h === ph || h.endsWith("." + ph)));
}
