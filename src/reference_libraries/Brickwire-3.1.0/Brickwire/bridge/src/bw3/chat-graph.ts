/* Brickwire 3.0 — per-chat Development Tree graph.
   Built only from this conversation's real runs/artifacts; "next moves" are rule-based suggestions
   (clearly marked), never executed until the user clicks Add. */
import type { RunRecord } from "./run-store.js";
import type { ArtifactRecord } from "./artifact-store.js";

export type GKind = "chat" | "model" | "code" | "answer" | "studio" | "blocked" | "suggestion";
export interface GNode {
  id: string; kind: GKind; title: string; subtitle?: string; status: string; done: boolean; parent: string | null;
  icon: string; ref?: { runId?: string; artifactId?: string; messageId?: string };
  action?: { type: "send" | "studio" | "variant" | "blender"; prompt?: string; artifactId?: string }; best?: boolean; link?: string;
}
export interface ChatGraph { conversationId: string; title: string; nodes: GNode[]; edges: Array<{ from: string; to: string; style: "chain" | "context" | "suggest" | "link" }>; generatedAt: string; suggestionsAreRuleBased: true }

const ICON: Record<string, string> = { dragon: "🐉", sword: "🗡️", castle_tower: "🏰", house: "🏠", car: "🚗", tree: "🌲", rock: "🪨", crystal: "💎", chest: "🧰", barrel: "🛢️" };
const NEXT: Record<string, Array<[string, string, string]>> = {
  dragon: [["Логово дракона", "Сгенерируй каменную башню замка для логова дракона", "🏰"], ["Сокровища", "Сгенерируй сундук с сокровищами", "🧰"], ["Кристаллы", "Сгенерируй кристаллы для пещеры дракона", "💎"]],
  sword: [["Сундук для оружия", "Сгенерируй деревянный сундук для оружия", "🧰"], ["Длинный меч", "Сгенерируй рыцарский длинный меч", "🗡️"]],
  castle_tower: [["Дом у стены", "Сгенерируй средневековый дом", "🏠"], ["Охрана башни", "Сгенерируй японского дракона, охраняющего башню", "🐉"], ["Бочки припасов", "Сгенерируй бочку", "🛢️"]],
  house: [["Деревья вокруг", "Сгенерируй сосну", "🌲"], ["Двор", "Сгенерируй бочку для двора", "🛢️"], ["Башня", "Сгенерируй башню замка", "🏰"]],
  car: [["Грузовик", "Сгенерируй грузовик", "🚗"], ["Окружение", "Сгенерируй дерево", "🌲"]],
  tree: [["Камни", "Сгенерируй камень", "🪨"], ["Лиственное дерево", "Сгенерируй лиственное дерево", "🌳"], ["Домик", "Сгенерируй дом", "🏠"]],
  rock: [["Кристаллы", "Сгенерируй кристалл", "💎"], ["Деревья", "Сгенерируй сосну", "🌲"]],
  crystal: [["Пещерные камни", "Сгенерируй камень", "🪨"], ["Сундук", "Сгенерируй сундук с сокровищами", "🧰"]],
  chest: [["Бочки", "Сгенерируй бочку", "🛢️"], ["Меч внутри", "Сгенерируй катану", "🗡️"]],
  barrel: [["Ящик", "Сгенерируй деревянный ящик", "🧰"], ["Склад", "Сгенерируй дом-склад", "🏠"]],
};
const CODE_NEXT: Array<[string, string, string]> = [["Проверка ошибок", "Найди и исправь ошибки в скриптах этого проекта", "🐞"], ["Тест сценария", "Составь план тестирования этой механики", "✅"], ["UI для механики", "Сделай UI для этой механики", "🖼️"]];
const short = (s: string, n = 34) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

export function chatGraph(conv: { id: string; title: string; messages: Array<{ id: string; runId?: string; role: string }> }, runs: RunRecord[], artifacts: ArtifactRecord[]): ChatGraph {
  const nodes: GNode[] = [], edges: ChatGraph["edges"] = [];
  const root: GNode = { id: "root", kind: "chat", title: conv.title, status: "info", done: false, parent: null, icon: "💬" };
  nodes.push(root);
  const ordered = [...runs].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const artById = new Map(artifacts.map((a) => [a.id, a]));
  const runNodeOf = new Map<string, string>(), artNodeOf = new Map<string, string>();
  for (const r of ordered) {
    const art = r.artifacts.map((id) => artById.get(id)).filter(Boolean)[0] as ArtifactRecord | undefined;
    const done = r.state === "done" || r.state === "partial";
    const kind: GKind = art ? "model" : r.path === "none" || r.state === "blocked" ? "blocked" : r.path === "studio-agent" ? "code" : "answer";
    let parent = "root";
    if (r.fromRun && runNodeOf.has(r.fromRun)) parent = runNodeOf.get(r.fromRun)!;
    if (r.retryOf && runNodeOf.has(r.retryOf)) parent = runNodeOf.get(r.retryOf)!;
    if (art?.parentId && artNodeOf.has(art.parentId)) parent = artNodeOf.get(art.parentId)!;
    const id = "run:" + r.id;
    nodes.push({ id, kind, title: short(art ? art.name.replace(/_/g, " ") : r.goal), subtitle: art ? `${art.stats.triangles} треуг. · ${art.verified ? "проверено" : "не проверено"}` : r.state, status: r.state, done, parent,
      icon: art ? ICON[art.spec.recipe] ?? "📦" : kind === "blocked" ? "⛔" : kind === "code" ? "🧩" : "💡", ref: { runId: r.id, artifactId: art?.id, messageId: conv.messages.find((m) => m.runId === r.id && m.role === "assistant")?.id } });
    edges.push({ from: parent, to: id, style: parent === "root" ? "context" : "chain" });
    runNodeOf.set(r.id, id); if (art) artNodeOf.set(art.id, id);
    for (const s of art?.studio ?? []) {
      const sid = `studio:${art!.id}:${s.importedAt}`;
      nodes.push({ id: sid, kind: "studio", title: "В Roblox Studio", subtitle: s.path ?? "EditableMesh", status: "done", done: true, parent: id, icon: "🧱", ref: { artifactId: art!.id } });
      edges.push({ from: id, to: sid, style: "chain" });
    }
  }
  // Suggestions hang off the most recent successful result only (keeps the canvas readable).
  const last = [...nodes].reverse().find((n) => n.done && (n.kind === "model" || n.kind === "answer" || n.kind === "code"));
  const sugg: GNode[] = [];
  const add = (title: string, icon: string, action: GNode["action"]) => sugg.push({ id: `sug:${last?.id ?? "root"}:${sugg.length}`, kind: "suggestion", title, icon, status: "planned", done: false, parent: last?.id ?? "root", action });
  if (last?.kind === "model") {
    const art = artById.get(last.ref!.artifactId!)!;
    if (!art.verified) add("Проверка модели", "🔍", { type: "variant", artifactId: art.id });
    if (!art.studio?.length) add("Импорт в Studio", "🧱", { type: "studio", artifactId: art.id });
    for (const [t, p, i] of NEXT[art.spec.recipe] ?? []) add(t, i, { type: "send", prompt: p });
    add("Другой вариант", "🎲", { type: "variant", artifactId: art.id });
  } else if (last) for (const [t, p, i] of CODE_NEXT) add(t, i, { type: "send", prompt: p });
  else for (const [t, p, i] of [["Японский дракон", "Сгенерируй японского дракона в OBJ", "🐉"], ["Башня замка", "Средневековая башня замка 3D", "🏰"], ["Obby", "Obby с чекпоинтами", "🏁"]] as Array<[string, string, string]>) add(t, i, { type: "send", prompt: p });
  sugg.slice(0, 4).forEach((s, i) => { s.best = i === 0; nodes.push(s); edges.push({ from: s.parent!, to: s.id, style: "suggest" }); });
  return { conversationId: conv.id, title: conv.title, nodes, edges, generatedAt: new Date().toISOString(), suggestionsAreRuleBased: true };
}
