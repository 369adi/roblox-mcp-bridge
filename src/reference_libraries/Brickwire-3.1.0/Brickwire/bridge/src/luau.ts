/** Luau code generation helpers. All user/AI data is embedded as Luau literals — never spliced as code. */

export function toLuau(v: unknown, depth = 0): string {
  if (depth > 40) throw new Error("value nested too deeply");
  if (v === null || v === undefined) return "nil";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") {
    if (!Number.isFinite(v)) throw new Error("non-finite number");
    return String(v);
  }
  if (typeof v === "string") return luauString(v);
  if (Array.isArray(v)) return "{" + v.map((x) => toLuau(x, depth + 1)).join(", ") + "}";
  if (typeof v === "object") {
    const parts = Object.entries(v as Record<string, unknown>)
      .filter(([, x]) => x !== undefined)
      .map(([k, x]) => `[${luauString(k)}] = ${toLuau(x, depth + 1)}`);
    return "{" + parts.join(", ") + "}";
  }
  throw new Error(`unsupported value type ${typeof v}`);
}

export function luauString(s: string): string {
  let out = '"';
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (ch === "\\") out += "\\\\";
    else if (ch === '"') out += '\\"';
    else if (ch === "\n") out += "\\n";
    else if (ch === "\r") out += "\\r";
    else if (ch === "\t") out += "\\t";
    else if (c < 0x20 || c === 0x7f) out += "\\" + String(c).padStart(3, "0");
    else out += ch; // UTF-8 passes through
  }
  return out + '"';
}

/**
 * Parse an instance path into segments, always starting with "game".
 * Accepts: game.Workspace.Part, Workspace.Part, game.Workspace["My.Part"], game:GetService("Workspace").Part
 */
export function pathSegments(path: string): string[] {
  if (typeof path !== "string" || !path.trim()) throw new Error("path must be a non-empty string");
  let p = path.trim().replace(/^game\s*:\s*GetService\s*\(\s*["']([^"']+)["']\s*\)/, "game.$1");
  const segs: string[] = [];
  let i = 0;
  let cur = "";
  const flush = () => {
    if (cur.length) segs.push(cur);
    cur = "";
  };
  while (i < p.length) {
    const c = p[i];
    if (c === ".") {
      flush();
      i++;
    } else if (c === "[") {
      flush();
      const q = p[i + 1];
      if (q !== '"' && q !== "'") throw new Error(`bad path near "${p.slice(i, i + 10)}"`);
      const close = p.indexOf(q + "]", i + 2);
      if (close < 0) throw new Error("unterminated [\"...\"] in path");
      segs.push(p.slice(i + 2, close));
      i = close + 2;
    } else {
      cur += c;
      i++;
    }
  }
  flush();
  if (segs[0] !== "game") segs.unshift("game");
  if (segs.some((s) => !s.length)) throw new Error("empty path segment");
  return segs;
}

export function joinPath(segs: string[]): string {
  return segs
    .map((s, i) => (i === 0 ? s : /^[A-Za-z_][A-Za-z0-9_]*$/.test(s) ? "." + s : `[${JSON.stringify(s)}]`))
    .join("");
}

export const RESULT_OPEN = "BWJSON<<";
export const RESULT_CLOSE = ">>BWJSON";

/** Shared Luau helpers. Valid Luau (uses compound assignment and typeof). */
export const LUAU_PRELUDE = String.raw`
local HttpService = game:GetService("HttpService")
local ChangeHistoryService = game:GetService("ChangeHistoryService")

local function bw_resolve(segs)
	local cur = game
	for i = 2, #segs do
		local s = segs[i]
		local nxt = cur:FindFirstChild(s)
		if nxt == nil and cur == game then
			local ok, svc = pcall(function()
				return game:GetService(s)
			end)
			if ok then
				nxt = svc
			end
		end
		if nxt == nil then
			return nil, "not found: '" .. s .. "' in " .. cur:GetFullName()
		end
		cur = nxt
	end
	return cur, nil
end

local function bw_must(segs)
	local inst, err = bw_resolve(segs)
	if inst == nil then
		error(err, 0)
	end
	return inst
end

local function bw_path(inst)
	local parts = {}
	local cur = inst
	while cur ~= nil and cur ~= game do
		local n = cur.Name
		if string.match(n, "^[%a_][%w_]*$") then
			table.insert(parts, 1, "." .. n)
		else
			local esc = string.gsub(string.gsub(n, "\\", "\\\\"), '"', '\\"')
			table.insert(parts, 1, '["' .. esc .. '"]')
		end
		cur = cur.Parent
	end
	return "game" .. table.concat(parts)
end

local function bw_decode(v)
	if type(v) ~= "table" then
		return v
	end
	local t = v["$type"]
	if t == nil then
		return v
	end
	local a = v["value"]
	if t == "Vector3" then
		return Vector3.new(a[1], a[2], a[3])
	elseif t == "Vector2" then
		return Vector2.new(a[1], a[2])
	elseif t == "Color3" then
		if type(a) == "string" then
			return Color3.fromHex(a)
		end
		return Color3.fromRGB(a[1], a[2], a[3])
	elseif t == "UDim2" then
		return UDim2.new(a[1], a[2], a[3], a[4])
	elseif t == "UDim" then
		return UDim.new(a[1], a[2])
	elseif t == "CFrame" then
		return CFrame.new(table.unpack(a))
	elseif t == "Enum" then
		return Enum[v["enum"]][a]
	elseif t == "BrickColor" then
		return BrickColor.new(a)
	elseif t == "NumberRange" then
		return NumberRange.new(a[1], a[2] or a[1])
	elseif t == "NumberSequence" then
		if type(a) == "number" then
			return NumberSequence.new(a)
		end
		local kps = {}
		for _, kp in ipairs(a) do
			table.insert(kps, NumberSequenceKeypoint.new(kp[1], kp[2], kp[3] or 0))
		end
		return NumberSequence.new(kps)
	elseif t == "ColorSequence" then
		local kps = {}
		for _, kp in ipairs(a) do
			table.insert(kps, ColorSequenceKeypoint.new(kp[1], Color3.fromRGB(kp[2], kp[3], kp[4])))
		end
		return ColorSequence.new(kps)
	elseif t == "Ref" then
		return bw_must(v["segs"])
	end
	error("unsupported $type " .. tostring(t), 0)
end

local function bw_coerce(inst, prop, raw)
	local v = bw_decode(raw)
	local okc, cur = pcall(function()
		return inst[prop]
	end)
	local k = if okc then typeof(cur) else nil
	if type(v) == "table" and typeof(v) == "table" then
		if k == "Vector3" then
			return Vector3.new(v[1], v[2], v[3])
		elseif k == "Vector2" then
			return Vector2.new(v[1], v[2])
		elseif k == "Color3" then
			return Color3.fromRGB(v[1], v[2], v[3])
		elseif k == "UDim2" then
			return UDim2.new(v[1], v[2], v[3], v[4])
		elseif k == "UDim" then
			return UDim.new(v[1], v[2])
		elseif k == "CFrame" then
			return CFrame.new(table.unpack(v))
		elseif k == "NumberRange" then
			return NumberRange.new(v[1], v[2] or v[1])
		end
	elseif type(v) == "string" then
		if k == "Color3" and string.sub(v, 1, 1) == "#" then
			return Color3.fromHex(v)
		elseif k == "BrickColor" then
			return BrickColor.new(v)
		end
	end
	return v
end

local function bw_apply(inst, props)
	local errs = {}
	if props == nil then
		return errs
	end
	for prop, raw in pairs(props) do
		if prop ~= "Parent" and prop ~= "ClassName" then
			local ok, err = pcall(function()
				inst[prop] = bw_coerce(inst, prop, raw)
			end)
			if not ok then
				table.insert(errs, { property = prop, error = tostring(err) })
			end
		end
	end
	return errs
end

local function bw_enc(v)
	local t = typeof(v)
	if t == "number" then
		if v ~= v or v == math.huge or v == -math.huge then
			return tostring(v)
		end
		return v
	elseif t == "string" or t == "boolean" or t == "nil" then
		return v
	elseif t == "Vector3" then
		return { ["$type"] = "Vector3", value = { v.X, v.Y, v.Z } }
	elseif t == "Vector2" then
		return { ["$type"] = "Vector2", value = { v.X, v.Y } }
	elseif t == "Color3" then
		return { ["$type"] = "Color3", value = { math.floor(v.R * 255 + 0.5), math.floor(v.G * 255 + 0.5), math.floor(v.B * 255 + 0.5) } }
	elseif t == "UDim2" then
		return { ["$type"] = "UDim2", value = { v.X.Scale, v.X.Offset, v.Y.Scale, v.Y.Offset } }
	elseif t == "EnumItem" then
		return { ["$type"] = "Enum", enum = tostring(v.EnumType), value = v.Name }
	elseif t == "Instance" then
		return { ["$type"] = "Ref", path = bw_path(v) }
	elseif t == "BrickColor" then
		return { ["$type"] = "BrickColor", value = v.Name }
	end
	return tostring(v)
end

local function bw_waypoint(name)
	pcall(function()
		ChangeHistoryService:SetWaypoint(name)
	end)
end

local function bw_create_tree(node, parent, created, errs)
	local inst = Instance.new(node.className)
	if node.name ~= nil then
		inst.Name = node.name
	end
	for _, e in ipairs(bw_apply(inst, node.properties)) do
		e.path = (node.name or node.className)
		table.insert(errs, e)
	end
	if node.attributes ~= nil then
		for k, a in pairs(node.attributes) do
			pcall(function()
				inst:SetAttribute(k, bw_decode(a))
			end)
		end
	end
	if node.source ~= nil and inst:IsA("LuaSourceContainer") then
		inst.Source = node.source
	end
	if node.children ~= nil then
		for _, child in ipairs(node.children) do
			bw_create_tree(child, inst, created, errs)
		end
	end
	inst.Parent = parent
	table.insert(created, bw_path(inst))
	return inst
end
`;

/** Wrap a composite body so it always returns exactly one machine-readable JSON payload. */
export function wrapLuau(args: unknown, body: string, opts: { print?: boolean } = {}): string {
  return `-- Brickwire composite tool (generated)
local ARGS = ${toLuau(args)}
${LUAU_PRELUDE}
local __ok, __res = pcall(function()
${body}
end)
local __out
if __ok then
	__out = { ok = true, result = __res }
else
	__out = { ok = false, error = tostring(__res) }
end
local __encOk, __json = pcall(function()
	return HttpService:JSONEncode(__out)
end)
if not __encOk then
	__json = HttpService:JSONEncode({ ok = false, error = "result encoding failed: " .. tostring(__json) })
end
local __s = "${RESULT_OPEN}" .. __json .. "${RESULT_CLOSE}"
${opts.print ? "print(__s)" : ""}
return __s
`;
}

/** Extract the payload produced by wrapLuau from whatever text execute_luau returns. */
export function extractLuauPayload(text: string): { found: boolean; ok?: boolean; result?: unknown; error?: string } {
  const a = text.indexOf(RESULT_OPEN);
  if (a < 0) return { found: false };
  const b = text.indexOf(RESULT_CLOSE, a);
  if (b < 0) return { found: false };
  let json = text.slice(a + RESULT_OPEN.length, b);
  try {
    const v = JSON.parse(json);
    return { found: true, ok: !!v.ok, result: v.result, error: v.error };
  } catch {
    // Some transports escape the string once more (e.g. returned value rendered as a quoted string).
    try {
      json = JSON.parse('"' + json + '"');
      const v = JSON.parse(json);
      return { found: true, ok: !!v.ok, result: v.result, error: v.error };
    } catch (e) {
      return { found: true, ok: false, error: "could not decode Luau payload: " + (e as Error).message };
    }
  }
}
