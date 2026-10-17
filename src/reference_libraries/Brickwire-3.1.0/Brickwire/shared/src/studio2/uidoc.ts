/**
 * Brickwire UI Builder document model (2.0).
 *
 * A compact JSON design document (elements, reusable components with variants, interactive states,
 * appear animations, layout modifiers) that compiles to a REAL Roblox instance tree
 * (ScreenGui + GuiObjects + UICorner/UIStroke/UIGradient/UIListLayout/...) consumed by the
 * existing `bw_create_tree` Luau helper. States/animations are wired by a generated LocalScript.
 * `UI_IMPORT_LUAU` serialises an existing ScreenGui back into this document format (round trip).
 */

export type UDim2T = [number, number, number, number];
export type ColorT = string | [number, number, number];

export interface UIStateProps {
  bg?: ColorT; bgTransparency?: number; textColor?: ColorT; imageColor?: ColorT;
  size?: UDim2T; position?: UDim2T; rotation?: number; textTransparency?: number; imageTransparency?: number;
  /** raw already-encoded Roblox props ({c:[r,g,b]} | {u:[...]} | number) — produced by import */
  [robloxProp: string]: unknown;
}

export interface UIElement {
  type?: string; // Frame | Text | Button | Image | ImageButton | Input | Scroll | Viewport | Canvas | Group | <Roblox class>
  component?: string;
  variant?: string;
  name?: string;
  position?: UDim2T; size?: UDim2T; anchor?: [number, number]; rotation?: number;
  bg?: ColorT; bgTransparency?: number; zIndex?: number; layoutOrder?: number; visible?: boolean; clip?: boolean;
  text?: string; textColor?: ColorT; textSize?: number; font?: string; textScaled?: boolean; textWrapped?: boolean;
  textXAlign?: "Left" | "Center" | "Right"; textYAlign?: "Top" | "Center" | "Bottom"; placeholder?: string;
  image?: string; imageColor?: ColorT; imageTransparency?: number; scaleType?: string;
  canvasSize?: UDim2T; scrollBarThickness?: number;
  corner?: number | [number, number];
  stroke?: { color?: ColorT; thickness?: number; transparency?: number; border?: boolean };
  gradient?: { colors: Array<ColorT | [number, ColorT]>; rotation?: number; transparency?: Array<[number, number]> };
  padding?: number | [number, number, number, number];
  list?: { direction?: "Vertical" | "Horizontal"; padding?: number; align?: "Left" | "Center" | "Right"; valign?: "Top" | "Center" | "Bottom"; wraps?: boolean };
  grid?: { cell: UDim2T; padding?: UDim2T; align?: "Left" | "Center" | "Right" };
  aspect?: number; scale?: number; maxTextSize?: number;
  states?: { hover?: UIStateProps; pressed?: UIStateProps; disabled?: UIStateProps; selected?: UIStateProps };
  appear?: "fade" | "pop" | "slide";
  attributes?: Record<string, string | number | boolean>;
  /** raw Roblox properties (typed values allowed, same format as create_ui) */
  props?: Record<string, unknown>;
  children?: UIElement[];
}

export interface UIComponentDef extends UIElement {
  variants?: Record<string, Partial<UIElement>>;
  description?: string;
}

export interface UIDoc {
  name: string;
  ignoreGuiInset?: boolean;
  resetOnSpawn?: boolean;
  displayOrder?: number;
  /** Automatic quality fixes (default true): text-size limits for TextScaled, hover/press feedback for plain buttons. */
  autoFix?: boolean;
  components?: Record<string, UIComponentDef>;
  children: UIElement[];
}

export interface TreeNode {
  className: string;
  name?: string;
  properties?: Record<string, unknown>;
  attributes?: Record<string, unknown>;
  source?: string;
  children?: TreeNode[];
}

const TYPE_MAP: Record<string, string> = {
  Frame: "Frame", Group: "Frame", Text: "TextLabel", Label: "TextLabel", Button: "TextButton", Image: "ImageLabel",
  ImageButton: "ImageButton", Input: "TextBox", Scroll: "ScrollingFrame", Viewport: "ViewportFrame", Canvas: "CanvasGroup",
};
const ROBLOX_GUI = new Set(["Frame", "TextLabel", "TextButton", "TextBox", "ImageLabel", "ImageButton", "ScrollingFrame", "ViewportFrame", "CanvasGroup", "VideoFrame"]);
const TEXT = new Set(["TextLabel", "TextButton", "TextBox"]);
const IMAGE = new Set(["ImageLabel", "ImageButton"]);
const KNOWN_KEYS = new Set([
  "type", "component", "variant", "name", "position", "size", "anchor", "rotation", "bg", "bgTransparency", "zIndex", "layoutOrder",
  "visible", "clip", "text", "textColor", "textSize", "font", "textScaled", "textWrapped", "textXAlign", "textYAlign", "placeholder",
  "image", "imageColor", "imageTransparency", "scaleType", "canvasSize", "scrollBarThickness", "corner", "stroke", "gradient", "padding",
  "list", "grid", "aspect", "scale", "maxTextSize", "states", "appear", "attributes", "props", "children", "variants", "description",
]);

// ---------------------------------------------------------------- value helpers

export function rgb(c: ColorT): [number, number, number] {
  if (Array.isArray(c)) return c.map((v) => Math.max(0, Math.min(255, Math.round(v)))) as [number, number, number];
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c.trim());
  if (!m) throw new Error(`invalid color "${c}" (use #rrggbb or [r,g,b])`);
  const h = m[1].length === 3 ? m[1].split("").map((x) => x + x).join("") : m[1];
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}
const C3 = (c: ColorT) => ({ $type: "Color3", value: rgb(c) });
const U2 = (u: UDim2T) => {
  if (!Array.isArray(u) || u.length !== 4 || !u.every(Number.isFinite)) throw new Error(`invalid UDim2 ${JSON.stringify(u)} (use [xScale,xOffset,yScale,yOffset])`);
  return { $type: "UDim2", value: u };
};
const UD = (s: number, o: number) => ({ $type: "UDim", value: [s, o] });
const EN = (e: string, v: string) => ({ $type: "Enum", enum: e, value: v });
const V2 = (v: [number, number]) => ({ $type: "Vector2", value: v });
const safeName = (n: string) => n.replace(/[^\w \-]/g, "_").slice(0, 80) || "Element";

// ---------------------------------------------------------------- built-in components

export const BUILTIN_COMPONENTS: Record<string, UIComponentDef> = {
  Panel: { description: "dark rounded container", type: "Frame", size: [0, 320, 0, 220], bg: "#16181d", corner: 12, stroke: { color: "#2a2e37", thickness: 1 }, padding: 12 },
  Card: { description: "content card with vertical list", type: "Frame", size: [1, 0, 0, 96], bg: "#1e2128", corner: 10, padding: 10, list: { direction: "Vertical", padding: 6 } },
  Title: { description: "heading text", type: "Text", size: [1, 0, 0, 32], bgTransparency: 1, text: "Title", textColor: "#ffffff", textSize: 24, font: "GothamBold", textXAlign: "Left" },
  Label: { description: "body text", type: "Text", size: [1, 0, 0, 22], bgTransparency: 1, text: "Label", textColor: "#b9bec9", textSize: 16, font: "Gotham", textXAlign: "Left", textWrapped: true },
  Button: {
    description: "button with hover/press states; variants primary|secondary|danger|ghost",
    type: "Button", size: [0, 160, 0, 44], bg: "#3b82f6", corner: 8, text: "Button", textColor: "#ffffff", textSize: 18, font: "GothamBold",
    states: { hover: { bg: "#5b9bff" }, pressed: { bg: "#2563eb", size: [0, 154, 0, 42] }, disabled: { bg: "#3a3f4b", textColor: "#8a909c" } },
    variants: {
      primary: {},
      secondary: { bg: "#2a2e37", states: { hover: { bg: "#353a45" }, pressed: { bg: "#20232a" } } },
      danger: { bg: "#ef4444", states: { hover: { bg: "#f87171" }, pressed: { bg: "#dc2626" } } },
      ghost: { bgTransparency: 1, stroke: { color: "#3b82f6", thickness: 2, border: true }, textColor: "#3b82f6", states: { hover: { bgTransparency: 0.85 } } },
    },
  },
  IconButton: { description: "square image button", type: "ImageButton", size: [0, 44, 0, 44], bg: "#2a2e37", corner: 8, image: "", states: { hover: { bg: "#353a45" }, pressed: { bg: "#20232a" } } },
  ProgressBar: {
    description: "bar with a Fill child (set Fill size X scale 0..1)",
    type: "Frame", size: [0, 240, 0, 14], bg: "#2a2e37", corner: 7, clip: true,
    children: [{ name: "Fill", type: "Frame", size: [0.6, 0, 1, 0], bg: "#22c55e", corner: 7 }],
  },
  HealthBar: {
    description: "health bar with label", type: "Frame", size: [0, 260, 0, 26], bg: "#2a1416", corner: 6, clip: true,
    children: [
      { name: "Fill", type: "Frame", size: [1, 0, 1, 0], bg: "#ef4444", corner: 6, gradient: { colors: ["#ff6b6b", "#c81e1e"], rotation: 90 } },
      { name: "Value", type: "Text", size: [1, 0, 1, 0], bgTransparency: 1, text: "100 / 100", textColor: "#ffffff", textSize: 14, font: "GothamBold", zIndex: 2 },
    ],
  },
  InventorySlot: {
    description: "inventory slot with icon + count", type: "ImageButton", size: [0, 72, 0, 72], bg: "#1e2128", corner: 8, stroke: { color: "#2f3440", thickness: 1 }, aspect: 1,
    states: { hover: { bg: "#272b33" }, selected: { bg: "#1d3557" } },
    children: [{ name: "Count", type: "Text", size: [1, -6, 0, 18], position: [0, 0, 1, -20], bgTransparency: 1, text: "", textColor: "#ffffff", textSize: 14, font: "GothamBold", textXAlign: "Right" }],
  },
  Grid: { description: "grid container", type: "Scroll", size: [1, 0, 1, 0], bgTransparency: 1, scrollBarThickness: 4, canvasSize: [0, 0, 0, 0], grid: { cell: [0, 72, 0, 72], padding: [0, 8, 0, 8] } },
  TopBar: { description: "horizontal top bar", type: "Frame", size: [1, 0, 0, 56], bg: "#111317", padding: [8, 16, 8, 16], list: { direction: "Horizontal", padding: 12, valign: "Center" } },
  Modal: {
    description: "centered modal with title & close", type: "Frame", anchor: [0.5, 0.5], position: [0.5, 0, 0.5, 0], size: [0, 420, 0, 300], bg: "#16181d", corner: 14, stroke: { color: "#2a2e37", thickness: 1 }, appear: "pop",
    children: [
      { name: "Title", component: "Title", position: [0, 20, 0, 16], size: [1, -80, 0, 32] },
      { name: "Close", component: "Button", variant: "secondary", text: "✕", anchor: [1, 0], position: [1, -12, 0, 12], size: [0, 36, 0, 36] },
    ],
  },
};

// ---------------------------------------------------------------- compile

function mergeEl(base: Partial<UIElement>, over: Partial<UIElement>): UIElement {
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(over)) {
    if (v === undefined) continue;
    const b = out[k];
    if ((k === "states" || k === "props" || k === "attributes" || k === "stroke" || k === "list") && b && typeof b === "object" && typeof v === "object" && !Array.isArray(v)) {
      out[k] = k === "states"
        ? Object.fromEntries([...new Set([...Object.keys(b), ...Object.keys(v as object)])].map((s) => [s, { ...((b as Record<string, object>)[s] ?? {}), ...((v as Record<string, object>)[s] ?? {}) }]))
        : { ...(b as object), ...(v as object) };
    } else out[k] = v;
  }
  return out as UIElement;
}

function encodeState(s: UIStateProps, cls: string): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(s)) {
    if (v === undefined) continue;
    switch (k) {
      case "bg": o.BackgroundColor3 = { c: rgb(v as ColorT) }; break;
      case "textColor": if (TEXT.has(cls)) o.TextColor3 = { c: rgb(v as ColorT) }; break;
      case "imageColor": if (IMAGE.has(cls)) o.ImageColor3 = { c: rgb(v as ColorT) }; break;
      case "bgTransparency": o.BackgroundTransparency = Number(v); break;
      case "textTransparency": o.TextTransparency = Number(v); break;
      case "imageTransparency": o.ImageTransparency = Number(v); break;
      case "rotation": o.Rotation = Number(v); break;
      case "size": U2(v as UDim2T); o.Size = { u: v }; break;
      case "position": U2(v as UDim2T); o.Position = { u: v }; break;
      default:
        if (/^[A-Z]/.test(k)) o[k] = v; // already-encoded Roblox prop (round trip from import)
        else throw new Error(`unsupported state property "${k}" (bg, bgTransparency, textColor, imageColor, size, position, rotation, textTransparency, imageTransparency)`);
    }
  }
  return o;
}

export interface CompileResult {
  tree: TreeNode;
  stats: { elements: number; instances: number; components: string[]; interactive: number };
  warnings: string[];
}

export function compileUIDoc(doc: UIDoc): CompileResult {
  if (!doc || typeof doc !== "object" || typeof doc.name !== "string" || !doc.name.trim()) throw new Error("doc.name is required");
  if (!Array.isArray(doc.children)) throw new Error("doc.children must be an array of elements");
  const components: Record<string, UIComponentDef> = { ...BUILTIN_COMPONENTS, ...(doc.components ?? {}) };
  const warnings: string[] = [];
  const fixes: string[] = [];
  const autoFix = doc.autoFix !== false;
  const used = new Set<string>();
  let elements = 0, instances = 1, interactive = 0;

  const expand = (el: UIElement, depth: number): UIElement => {
    if (!el.component) return el;
    if (depth > 8) throw new Error(`component nesting too deep at ${el.component}`);
    const def = components[el.component];
    if (!def) throw new Error(`unknown component "${el.component}" — available: ${Object.keys(components).join(", ")}`);
    used.add(el.component);
    const { variants, description: _d, ...base } = def;
    let merged = expand(base as UIElement, depth + 1);
    if (el.variant) {
      const v = variants?.[el.variant];
      if (!v) throw new Error(`component ${el.component} has no variant "${el.variant}" (${Object.keys(variants ?? {}).join(", ") || "none"})`);
      merged = mergeEl(merged, v);
    }
    const { component: _c, variant: _v, ...rest } = el;
    const out = mergeEl(merged, rest);
    out.name = el.name ?? el.component;
    return out;
  };

  const build = (raw: UIElement, depth: number, path: string): TreeNode => {
    if (depth > 20) throw new Error("UI tree too deep (max 20)");
    if (++elements > 400) throw new Error("UI too large (max 400 elements per build)");
    const el = expand(raw, 0);
    for (const k of Object.keys(raw)) if (!KNOWN_KEYS.has(k)) warnings.push(`${path}: unknown key "${k}" ignored`);
    const type = el.type ?? "Frame";
    const cls = TYPE_MAP[type] ?? type;
    if (!ROBLOX_GUI.has(cls)) throw new Error(`${path}: unsupported element type "${type}" (${Object.keys(TYPE_MAP).join(", ")})`);
    const p: Record<string, unknown> = { BorderSizePixel: 0 };
    if (el.position) p.Position = U2(el.position);
    if (el.size) p.Size = U2(el.size);
    if (el.anchor) p.AnchorPoint = V2(el.anchor);
    if (el.rotation !== undefined) p.Rotation = el.rotation;
    if (el.bg !== undefined) p.BackgroundColor3 = C3(el.bg);
    if (type === "Group" && el.bgTransparency === undefined) p.BackgroundTransparency = 1;
    if (el.bgTransparency !== undefined) p.BackgroundTransparency = el.bgTransparency;
    if (el.zIndex !== undefined) p.ZIndex = el.zIndex;
    if (el.layoutOrder !== undefined) p.LayoutOrder = el.layoutOrder;
    if (el.visible !== undefined) p.Visible = el.visible;
    if (el.clip !== undefined) p.ClipsDescendants = el.clip;
    if (TEXT.has(cls)) {
      p.Text = el.text ?? "";
      if (el.textColor !== undefined) p.TextColor3 = C3(el.textColor);
      if (el.textSize !== undefined) p.TextSize = el.textSize;
      if (el.font) p.Font = EN("Font", el.font);
      if (el.textScaled !== undefined) p.TextScaled = el.textScaled;
      if (el.textWrapped !== undefined) p.TextWrapped = el.textWrapped;
      if (el.textXAlign) p.TextXAlignment = EN("TextXAlignment", el.textXAlign);
      if (el.textYAlign) p.TextYAlignment = EN("TextYAlignment", el.textYAlign);
      if (el.placeholder !== undefined && cls === "TextBox") p.PlaceholderText = el.placeholder;
    } else if (el.text !== undefined) warnings.push(`${path}: text ignored on ${cls}`);
    if (IMAGE.has(cls)) {
      if (el.image !== undefined) p.Image = el.image;
      if (el.imageColor !== undefined) p.ImageColor3 = C3(el.imageColor);
      if (el.imageTransparency !== undefined) p.ImageTransparency = el.imageTransparency;
      if (el.scaleType) p.ScaleType = EN("ScaleType", el.scaleType);
    }
    if (cls === "ScrollingFrame") {
      if (el.canvasSize) p.CanvasSize = U2(el.canvasSize);
      p.AutomaticCanvasSize = EN("AutomaticSize", "Y");
      if (el.scrollBarThickness !== undefined) p.ScrollBarThickness = el.scrollBarThickness;
    }
    if (el.props) Object.assign(p, el.props);

    const kids: TreeNode[] = [];
    const mod = (className: string, properties: Record<string, unknown>) => {
      kids.push({ className, properties });
      instances++;
    };
    if (el.corner !== undefined) mod("UICorner", { CornerRadius: Array.isArray(el.corner) ? UD(el.corner[0], el.corner[1]) : UD(0, el.corner) });
    if (el.stroke) mod("UIStroke", { Color: C3(el.stroke.color ?? "#000000"), Thickness: el.stroke.thickness ?? 1, Transparency: el.stroke.transparency ?? 0, ...(el.stroke.border || TEXT.has(cls) ? { ApplyStrokeMode: EN("ApplyStrokeMode", "Border") } : {}) });
    if (el.gradient) {
      const cs = el.gradient.colors;
      if (!Array.isArray(cs) || cs.length < 2) throw new Error(`${path}: gradient needs at least 2 colors`);
      const kps = cs.map((c, i) => {
        const [t, col] = Array.isArray(c) && c.length === 2 && typeof c[0] === "number" && typeof c[1] !== "number" ? (c as [number, ColorT]) : [i / (cs.length - 1), c as ColorT];
        return [t, ...rgb(col)];
      });
      const g: Record<string, unknown> = { Color: { $type: "ColorSequence", value: kps }, Rotation: el.gradient.rotation ?? 0 };
      if (el.gradient.transparency) g.Transparency = { $type: "NumberSequence", value: el.gradient.transparency };
      mod("UIGradient", g);
    }
    if (el.padding !== undefined) {
      const [t, r, b, l] = typeof el.padding === "number" ? [el.padding, el.padding, el.padding, el.padding] : el.padding;
      mod("UIPadding", { PaddingTop: UD(0, t), PaddingRight: UD(0, r), PaddingBottom: UD(0, b), PaddingLeft: UD(0, l) });
    }
    if (el.list && el.grid) throw new Error(`${path}: use either list or grid, not both`);
    if (el.list) mod("UIListLayout", {
      FillDirection: EN("FillDirection", el.list.direction ?? "Vertical"), Padding: UD(0, el.list.padding ?? 0), SortOrder: EN("SortOrder", "LayoutOrder"),
      ...(el.list.align ? { HorizontalAlignment: EN("HorizontalAlignment", el.list.align) } : {}),
      ...(el.list.valign ? { VerticalAlignment: EN("VerticalAlignment", el.list.valign) } : {}),
      ...(el.list.wraps ? { Wraps: true } : {}),
    });
    if (el.grid) mod("UIGridLayout", { CellSize: U2(el.grid.cell), CellPadding: U2(el.grid.padding ?? [0, 4, 0, 4]), SortOrder: EN("SortOrder", "LayoutOrder"), ...(el.grid.align ? { HorizontalAlignment: EN("HorizontalAlignment", el.grid.align) } : {}) });
    if (el.aspect !== undefined) mod("UIAspectRatioConstraint", { AspectRatio: el.aspect });
    if (el.scale !== undefined) mod("UIScale", { Scale: el.scale });
    if (el.maxTextSize !== undefined && TEXT.has(cls)) mod("UITextSizeConstraint", { MaxTextSize: el.maxTextSize });
    else if (autoFix && TEXT.has(cls) && el.textScaled) {
      // TextScaled without a limit gives giant text on big screens and unreadable text on phones
      mod("UITextSizeConstraint", { MaxTextSize: 48, MinTextSize: 9 });
      fixes.push(`${path}: TextScaled limited to 9..48 px`);
    }
    // phone / layout lint
    const sz = el.size;
    if (sz && (cls === "TextButton" || cls === "ImageButton") && sz[0] === 0 && sz[2] === 0 && (sz[1] < 44 || sz[3] < 44) && !el.grid)
      warnings.push(`${path}: button ${sz[1]}x${sz[3]} px is smaller than a 44 px touch target (phones)`);
    if (sz && depth === 1 && sz[0] === 0 && sz[2] === 0 && (sz[1] > 640 || sz[3] > 360) && el.aspect === undefined)
      warnings.push(`${path}: fixed ${sz[1]}x${sz[3]} px will not fit a phone screen — use scale size or aspect`);
    const pos = el.position;
    if (pos && depth === 1 && (pos[0] < -0.01 || pos[0] > 1.01 || pos[2] < -0.01 || pos[2] > 1.01))
      warnings.push(`${path}: position is outside the screen (scale ${pos[0]}, ${pos[2]})`);

    const attrs: Record<string, unknown> = { ...(el.attributes ?? {}) };
    if (el.states && Object.keys(el.states).length) {
      const enc: Record<string, unknown> = {};
      for (const [s, v] of Object.entries(el.states)) {
        if (!["hover", "pressed", "disabled", "selected"].includes(s)) throw new Error(`${path}: unknown state "${s}"`);
        if (v) enc[s] = encodeState(v, cls);
      }
      attrs.BW_States = JSON.stringify(enc);
      if (cls === "TextButton" || cls === "ImageButton") p.AutoButtonColor = false;
      interactive++;
    } else if (autoFix && (cls === "TextButton" || cls === "ImageButton") && el.props?.AutoButtonColor === undefined) {
      // plain buttons get a soft hover / press response instead of Roblox's grey flash
      const bt = typeof p.BackgroundTransparency === "number" ? (p.BackgroundTransparency as number) : 0;
      attrs.BW_States = JSON.stringify({ hover: encodeState({ bgTransparency: Math.min(1, bt + 0.12) }, cls), pressed: encodeState({ bgTransparency: Math.min(1, bt + 0.28) }, cls) });
      p.AutoButtonColor = false;
      interactive++;
      fixes.push(`${path}: hover/press feedback added`);
    }
    if (el.appear) {
      if (!["fade", "pop", "slide"].includes(el.appear)) throw new Error(`${path}: appear must be fade|pop|slide`);
      attrs.BW_Appear = el.appear;
      interactive++;
    }
    const name = safeName(el.name ?? type);
    for (const c of el.children ?? []) {
      kids.push(build(c, depth + 1, `${path}/${c.name ?? c.component ?? c.type ?? "Frame"}`));
    }
    const names = (el.children ?? []).map((c) => c.name ?? c.component ?? c.type ?? "Frame");
    const dup = names.filter((n, i) => names.indexOf(n) !== i);
    if (dup.length) warnings.push(`${path}: duplicate child names ${[...new Set(dup)].join(", ")} (scripts using FindFirstChild will be ambiguous)`);
    instances++;
    return { className: cls, name, properties: p, attributes: Object.keys(attrs).length ? attrs : undefined, children: kids.length ? kids : undefined };
  };

  const children = doc.children.map((c, i) => build(c, 1, `${doc.name}/${c.name ?? c.component ?? c.type ?? i}`));
  if (interactive) {
    children.push({ className: "LocalScript", name: "BrickwireUIStates", source: UI_STATES_SCRIPT });
    instances++;
  }
  const tree: TreeNode = {
    className: "ScreenGui",
    name: safeName(doc.name),
    properties: {
      ResetOnSpawn: doc.resetOnSpawn ?? false,
      IgnoreGuiInset: doc.ignoreGuiInset ?? false,
      ZIndexBehavior: EN("ZIndexBehavior", "Sibling"),
      ...(doc.displayOrder !== undefined ? { DisplayOrder: doc.displayOrder } : {}),
    },
    attributes: { BW_UIDoc: "2" },
    children,
  };
  if (fixes.length) warnings.push(`auto-fixed ${fixes.length}: ${fixes.slice(0, 6).join("; ")}${fixes.length > 6 ? "…" : ""} (autoFix:false to disable)`);
  return { tree, stats: { elements, instances, components: [...used], interactive }, warnings };
}

/** Runtime for states + appear animations (generated into every interactive ScreenGui). */
export const UI_STATES_SCRIPT = String.raw`-- Brickwire UI states runtime (generated by ui_build). Drives BW_States / BW_Appear attributes.
local TweenService = game:GetService("TweenService")
local HttpService = game:GetService("HttpService")
local gui = script.Parent
local INFO = TweenInfo.new(0.12, Enum.EasingStyle.Quad, Enum.EasingDirection.Out)

local function dec(v)
	if type(v) == "table" then
		if v.c then return Color3.fromRGB(v.c[1], v.c[2], v.c[3]) end
		if v.u then return UDim2.new(v.u[1], v.u[2], v.u[3], v.u[4]) end
	end
	return v
end

local function wire(obj)
	local raw = obj:GetAttribute("BW_States")
	if type(raw) ~= "string" then return end
	local ok, st = pcall(function() return HttpService:JSONDecode(raw) end)
	if not ok or type(st) ~= "table" then return end
	local base = {}
	for _, s in pairs(st) do
		for k in pairs(s) do
			local okp, cur = pcall(function() return obj[k] end)
			if okp then base[k] = cur end
		end
	end
	local hovering, pressed = false, false
	local function layer(goal, s)
		if s then for k, v in pairs(s) do if base[k] ~= nil then goal[k] = dec(v) end end end
	end
	local function refresh()
		local goal = table.clone(base)
		if obj:GetAttribute("BW_Selected") then layer(goal, st.selected) end
		if hovering then layer(goal, st.hover) end
		if pressed then layer(goal, st.pressed) end
		if obj:GetAttribute("BW_Disabled") then layer(goal, st.disabled) end
		TweenService:Create(obj, INFO, goal):Play()
	end
	obj.MouseEnter:Connect(function() hovering = true refresh() end)
	obj.MouseLeave:Connect(function() hovering = false pressed = false refresh() end)
	if obj:IsA("GuiButton") then
		obj.MouseButton1Down:Connect(function() if not obj:GetAttribute("BW_Disabled") then pressed = true refresh() end end)
		obj.MouseButton1Up:Connect(function() pressed = false refresh() end)
	end
	obj:GetAttributeChangedSignal("BW_Disabled"):Connect(refresh)
	obj:GetAttributeChangedSignal("BW_Selected"):Connect(refresh)
	refresh()
end

local function appear(obj)
	local kind = obj:GetAttribute("BW_Appear")
	if kind == "fade" then
		local t = obj.BackgroundTransparency
		obj.BackgroundTransparency = 1
		TweenService:Create(obj, TweenInfo.new(0.25), { BackgroundTransparency = t }):Play()
	elseif kind == "pop" then
		local sc = obj:FindFirstChildOfClass("UIScale") or Instance.new("UIScale")
		local target = sc.Parent and sc.Scale or 1
		sc.Scale = target * 0.85
		sc.Parent = obj
		TweenService:Create(sc, TweenInfo.new(0.25, Enum.EasingStyle.Back, Enum.EasingDirection.Out), { Scale = target }):Play()
	elseif kind == "slide" then
		local p = obj.Position
		obj.Position = p + UDim2.fromOffset(0, 40)
		TweenService:Create(obj, TweenInfo.new(0.3, Enum.EasingStyle.Quint, Enum.EasingDirection.Out), { Position = p }):Play()
	end
end

for _, d in ipairs(gui:GetDescendants()) do
	if d:IsA("GuiObject") then
		wire(d)
		appear(d)
	end
end
`;

/** Luau body (for wrapLuau with ARGS.segs) that serialises a ScreenGui back into a UIDoc. */
export const UI_IMPORT_LUAU = String.raw`	local gui = bw_must(ARGS.segs)
	if not (gui:IsA("LayerCollector") or gui:IsA("GuiObject")) then
		error("not a GUI: " .. gui.ClassName, 0)
	end
	local MAP = { Frame = "Frame", TextLabel = "Text", TextButton = "Button", ImageLabel = "Image", ImageButton = "ImageButton", TextBox = "Input", ScrollingFrame = "Scroll", ViewportFrame = "Viewport", CanvasGroup = "Canvas" }
	local lost = {}
	local count = 0
	local function c3(c) return "#" .. c:ToHex() end
	local function u2(u) return { u.X.Scale, u.X.Offset, u.Y.Scale, u.Y.Offset } end
	local function ser(g, depth)
		count += 1
		if count > 2000 or depth > 30 then error("GUI too large to import (max 2000 objects)", 0) end
		local e = { type = MAP[g.ClassName] or g.ClassName, name = g.Name, position = u2(g.Position), size = u2(g.Size) }
		if g.AnchorPoint ~= Vector2.zero then e.anchor = { g.AnchorPoint.X, g.AnchorPoint.Y } end
		if g.Rotation ~= 0 then e.rotation = g.Rotation end
		e.bg = c3(g.BackgroundColor3)
		if g.BackgroundTransparency ~= 0 then e.bgTransparency = g.BackgroundTransparency end
		if g.ZIndex ~= 1 then e.zIndex = g.ZIndex end
		if g.LayoutOrder ~= 0 then e.layoutOrder = g.LayoutOrder end
		if not g.Visible then e.visible = false end
		if g.ClipsDescendants then e.clip = true end
		if g:IsA("TextLabel") or g:IsA("TextButton") or g:IsA("TextBox") then
			e.text = g.Text
			e.textColor = c3(g.TextColor3)
			e.textSize = g.TextSize
			pcall(function() e.font = g.Font.Name end)
			if g.TextScaled then e.textScaled = true end
			if g.TextWrapped then e.textWrapped = true end
			if g.TextXAlignment ~= Enum.TextXAlignment.Center then e.textXAlign = g.TextXAlignment.Name end
			if g.TextYAlignment ~= Enum.TextYAlignment.Center then e.textYAlign = g.TextYAlignment.Name end
			if g:IsA("TextBox") and g.PlaceholderText ~= "" then e.placeholder = g.PlaceholderText end
		end
		if g:IsA("ImageLabel") or g:IsA("ImageButton") then
			e.image = g.Image
			if g.ImageColor3 ~= Color3.new(1, 1, 1) then e.imageColor = c3(g.ImageColor3) end
			if g.ImageTransparency ~= 0 then e.imageTransparency = g.ImageTransparency end
			if g.ScaleType ~= Enum.ScaleType.Stretch then e.scaleType = g.ScaleType.Name end
		end
		if g:IsA("ScrollingFrame") then
			e.canvasSize = u2(g.CanvasSize)
			e.scrollBarThickness = g.ScrollBarThickness
		end
		local st = g:GetAttribute("BW_States")
		if type(st) == "string" then
			local ok, d = pcall(function() return HttpService:JSONDecode(st) end)
			if ok then e.states = d end
		end
		local ap = g:GetAttribute("BW_Appear")
		if type(ap) == "string" then e.appear = ap end
		local kids = {}
		for _, c in ipairs(g:GetChildren()) do
			if c:IsA("UICorner") then
				e.corner = if c.CornerRadius.Scale == 0 then c.CornerRadius.Offset else { c.CornerRadius.Scale, c.CornerRadius.Offset }
			elseif c:IsA("UIStroke") then
				e.stroke = { color = c3(c.Color), thickness = c.Thickness, transparency = c.Transparency, border = c.ApplyStrokeMode == Enum.ApplyStrokeMode.Border }
			elseif c:IsA("UIGradient") then
				local cols = {}
				for _, kp in ipairs(c.Color.Keypoints) do table.insert(cols, { kp.Time, c3(kp.Value) }) end
				e.gradient = { colors = cols, rotation = c.Rotation }
			elseif c:IsA("UIPadding") then
				e.padding = { c.PaddingTop.Offset, c.PaddingRight.Offset, c.PaddingBottom.Offset, c.PaddingLeft.Offset }
			elseif c:IsA("UIListLayout") then
				e.list = { direction = c.FillDirection.Name, padding = c.Padding.Offset, align = c.HorizontalAlignment.Name, valign = c.VerticalAlignment.Name }
			elseif c:IsA("UIGridLayout") then
				e.grid = { cell = u2(c.CellSize), padding = u2(c.CellPadding) }
			elseif c:IsA("UIAspectRatioConstraint") then
				e.aspect = c.AspectRatio
			elseif c:IsA("UIScale") then
				e.scale = c.Scale
			elseif c:IsA("UITextSizeConstraint") then
				e.maxTextSize = c.MaxTextSize
			elseif c:IsA("GuiObject") then
				table.insert(kids, ser(c, depth + 1))
			elseif not (c:IsA("LocalScript") and c.Name == "BrickwireUIStates") then
				table.insert(lost, bw_path(c) .. " (" .. c.ClassName .. ")")
			end
		end
		if #kids > 0 then e.children = kids end
		return e
	end
	local doc
	if gui:IsA("LayerCollector") then
		local kids = {}
		for _, c in ipairs(gui:GetChildren()) do
			if c:IsA("GuiObject") then
				table.insert(kids, ser(c, 1))
			elseif not (c:IsA("LocalScript") and c.Name == "BrickwireUIStates") then
				table.insert(lost, bw_path(c) .. " (" .. c.ClassName .. ")")
			end
		end
		doc = { name = gui.Name, children = kids }
		if gui:IsA("ScreenGui") then
			doc.ignoreGuiInset = gui.IgnoreGuiInset
			doc.resetOnSpawn = gui.ResetOnSpawn
			doc.displayOrder = gui.DisplayOrder
		end
	else
		doc = { name = gui.Name, children = { ser(gui, 1) } }
	end
	return { doc = doc, objects = count, notImported = lost }`;
