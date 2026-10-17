/**
 * Brickwire Mechanics Library (2.0): real, self-contained gameplay systems.
 * Each mechanic = config schema + install plan (instances with Luau sources). Scripts read their config from
 * attributes on their own container (BW_<id> folder), so `mechanic_configure` changes behaviour without editing code.
 * Every created root gets attribute BrickwireMechanic=<id> so status/remove/test can find it.
 */

export type MechConfigValue = number | string | boolean;
export interface MechNode { className: string; name: string; source?: string; properties?: Record<string, unknown>; attributes?: Record<string, unknown>; children?: MechNode[] }
export interface MechInstall { service: string; node: MechNode }
export interface Mechanic {
  id: string;
  name: string;
  category: "core" | "movement" | "world" | "economy" | "combat" | "flow";
  description: string;
  config: Record<string, { default: MechConfigValue; desc: string }>;
  /** Other mechanics this one needs (installed automatically). */
  needs?: string[];
  /** Instances users place themselves (documented in usage). */
  usage: string;
  install(cfg: Record<string, MechConfigValue>): MechInstall[];
}

const CFG = `local CFG = script.Parent
local function cfg(k, d) local v = CFG:GetAttribute(k) if v == nil then return d end return v end
`;

const folder = (id: string, cfg: Record<string, MechConfigValue>, children: MechNode[]): MechNode => ({
  className: "Folder",
  name: `BW_${id}`,
  attributes: { BrickwireMechanic: id, ...cfg },
  children,
});
const script = (name: string, source: string): MechNode => ({ className: "Script", name, source });
const local = (name: string, source: string): MechNode => ({ className: "LocalScript", name, source });

export const MECHANICS: Mechanic[] = [
  {
    id: "leaderstats",
    name: "Leaderstats + saving",
    category: "core",
    description: "Per-player stats (leaderboard) with DataStore autosave, retries and BindToClose.",
    config: {
      Stats: { default: "Coins,Wins", desc: "Comma-separated stat names" },
      StartValue: { default: 0, desc: "Starting value" },
      Save: { default: true, desc: "Save to DataStore (needs Game Settings → Security → API access in Studio)" },
      StoreName: { default: "BW_Stats_v1", desc: "DataStore name" },
    },
    usage: "Other scripts: player.leaderstats.Coins.Value += 1",
    install: (c) => [{
      service: "ServerScriptService",
      node: folder("leaderstats", c, [script("Leaderstats", `${CFG}local Players = game:GetService("Players")
local DSS = game:GetService("DataStoreService")
local names = string.split(cfg("Stats", "Coins"), ",")
local store = nil
if cfg("Save", true) then
	local ok, s = pcall(function() return DSS:GetDataStore(cfg("StoreName", "BW_Stats_v1")) end)
	if ok then store = s else warn("[BW leaderstats] DataStore unavailable:", s) end
end
local function retry(fn)
	for i = 1, 3 do
		local ok, r = pcall(fn)
		if ok then return true, r end
		task.wait(i)
	end
	return false
end
local loaded = {}
local function load(p)
	local ls = Instance.new("Folder")
	ls.Name = "leaderstats"
	local data = {}
	if store then
		local ok, d = retry(function() return store:GetAsync("p_" .. p.UserId) end)
		if ok and type(d) == "table" then data = d end
		loaded[p] = ok
	end
	for _, n in ipairs(names) do
		n = string.gsub(n, "^%s*(.-)%s*$", "%1")
		local v = Instance.new("IntValue")
		v.Name = n
		v.Value = data[n] or cfg("StartValue", 0)
		v.Parent = ls
	end
	ls.Parent = p
end
local function save(p)
	if not store or not loaded[p] then return end
	local ls = p:FindFirstChild("leaderstats")
	if not ls then return end
	local d = {}
	for _, v in ipairs(ls:GetChildren()) do if v:IsA("ValueBase") then d[v.Name] = v.Value end end
	retry(function() store:SetAsync("p_" .. p.UserId, d) end)
end
Players.PlayerAdded:Connect(load)
for _, p in ipairs(Players:GetPlayers()) do task.spawn(load, p) end
Players.PlayerRemoving:Connect(function(p) save(p) loaded[p] = nil end)
game:BindToClose(function() for _, p in ipairs(Players:GetPlayers()) do save(p) end end)
task.spawn(function() while true do task.wait(120) for _, p in ipairs(Players:GetPlayers()) do save(p) end end end)
`)]),
    }],
  },
  {
    id: "coin_pickup",
    name: "Collectible coins",
    category: "economy",
    needs: ["leaderstats"],
    description: "Any part tagged BW_Coin (or inside Workspace.BW_Coins) spins, is collected on touch, adds to a stat and respawns.",
    config: {
      Stat: { default: "Coins", desc: "leaderstats value to increase" },
      Amount: { default: 1, desc: "Value per coin" },
      Respawn: { default: 10, desc: "Seconds until the coin comes back (0 = never)" },
      SampleCoins: { default: 5, desc: "Create N sample coins in Workspace.BW_Coins (0 = none)" },
    },
    usage: "Tag any part 'BW_Coin' or put it into Workspace.BW_Coins.",
    install: (c) => {
      const n = Math.max(0, Math.min(50, Number(c.SampleCoins ?? 5)));
      const coins: MechNode[] = Array.from({ length: n }, (_, i) => ({
        className: "Part", name: `Coin${i + 1}`,
        properties: { Shape: { $type: "Enum", enum: "PartType", value: "Cylinder" }, Size: [0.4, 2, 2], Anchored: true, CanCollide: false,
          Color: "#ffcc33", Material: { $type: "Enum", enum: "Material", value: "Neon" }, Position: [i * 6 - (n - 1) * 3, 3, -12] },
      }));
      const out: MechInstall[] = [{
        service: "ServerScriptService",
        node: folder("coin_pickup", c, [script("Coins", `${CFG}local CS = game:GetService("CollectionService")
local Players = game:GetService("Players")
local TS = game:GetService("TweenService")
local busy = {}
local function setup(coin)
	if not coin:IsA("BasePart") or busy[coin] ~= nil then return end
	busy[coin] = false
	coin.Anchored = true
	coin.CanCollide = false
	local base = coin.CFrame
	task.spawn(function()
		local a = math.random() * 6
		while coin.Parent do
			a += task.wait() * 2
			if not busy[coin] then coin.CFrame = base * CFrame.new(0, math.sin(a) * 0.4, 0) * CFrame.Angles(0, a, 0) end
		end
	end)
	coin.Touched:Connect(function(hit)
		if busy[coin] then return end
		local p = Players:GetPlayerFromCharacter(hit.Parent)
		if not p then return end
		busy[coin] = true
		local ls = p:FindFirstChild("leaderstats")
		local v = ls and ls:FindFirstChild(cfg("Stat", "Coins"))
		if v then v.Value += cfg("Amount", 1) end
		local t0 = coin.Transparency
		TS:Create(coin, TweenInfo.new(0.2), { Transparency = 1 }):Play()
		local r = cfg("Respawn", 10)
		if r <= 0 then task.delay(0.25, function() coin:Destroy() end) return end
		task.wait(r)
		coin.Transparency = t0
		busy[coin] = false
	end)
end
for _, c in ipairs(CS:GetTagged("BW_Coin")) do setup(c) end
CS:GetInstanceAddedSignal("BW_Coin"):Connect(setup)
local f = workspace:FindFirstChild("BW_Coins")
if f then
	for _, c in ipairs(f:GetDescendants()) do setup(c) end
	f.DescendantAdded:Connect(setup)
end
`)]),
      }];
      if (n) out.push({ service: "Workspace", node: { className: "Folder", name: "BW_Coins", attributes: { BrickwireMechanic: "coin_pickup" }, children: coins } });
      return out;
    },
  },
  {
    id: "checkpoints",
    name: "Checkpoints / stages",
    category: "flow",
    description: "Parts in Workspace.BW_Checkpoints named 1,2,3… become checkpoints; the player respawns at the highest reached. Optional Stage stat.",
    config: { StatName: { default: "Stage", desc: "leaderstats value showing the stage ('' = none)" }, OnlyForward: { default: true, desc: "Ignore lower checkpoints" }, SampleCount: { default: 3, desc: "Sample checkpoint pads to create" } },
    usage: "Name checkpoint parts 1..N inside Workspace.BW_Checkpoints.",
    install: (c) => {
      const n = Math.max(0, Math.min(30, Number(c.SampleCount ?? 3)));
      const pads: MechNode[] = Array.from({ length: n }, (_, i) => ({
        className: "SpawnLocation", name: String(i + 1),
        properties: { Size: [6, 1, 6], Anchored: true, Neutral: true, Enabled: i === 0, Duration: 0, Color: i === 0 ? "#4ade80" : "#60a5fa", Position: [0, 0.5, i * 20 + 10] },
      }));
      const out: MechInstall[] = [{
        service: "ServerScriptService",
        node: folder("checkpoints", c, [script("Checkpoints", `${CFG}local Players = game:GetService("Players")
local folder = workspace:WaitForChild("BW_Checkpoints")
local reached = {}
local function stat(p)
	local n = cfg("StatName", "Stage")
	if n == "" then return nil end
	local ls = p:FindFirstChild("leaderstats")
	if not ls then ls = Instance.new("Folder") ls.Name = "leaderstats" ls.Parent = p end
	local v = ls:FindFirstChild(n)
	if not v then v = Instance.new("IntValue") v.Name = n v.Value = 1 v.Parent = ls end
	return v
end
local function hook(cp)
	if not cp:IsA("BasePart") then return end
	local idx = tonumber(cp.Name)
	if not idx then return end
	cp.Touched:Connect(function(hit)
		local p = Players:GetPlayerFromCharacter(hit.Parent)
		if not p then return end
		local cur = reached[p] or 1
		if cfg("OnlyForward", true) and idx <= cur then return end
		reached[p] = idx
		local v = stat(p)
		if v then v.Value = idx end
	end)
end
for _, cp in ipairs(folder:GetChildren()) do hook(cp) end
folder.ChildAdded:Connect(hook)
Players.PlayerAdded:Connect(function(p)
	reached[p] = 1
	stat(p)
	p.CharacterAdded:Connect(function(ch)
		local cp = folder:FindFirstChild(tostring(reached[p] or 1))
		if cp then
			local hrp = ch:WaitForChild("HumanoidRootPart", 5)
			task.wait()
			if hrp then ch:PivotTo(cp.CFrame + Vector3.new(0, cp.Size.Y / 2 + 3, 0)) end
		end
	end)
end)
Players.PlayerRemoving:Connect(function(p) reached[p] = nil end)
`)]),
      }];
      if (n) out.push({ service: "Workspace", node: { className: "Folder", name: "BW_Checkpoints", attributes: { BrickwireMechanic: "checkpoints" }, children: pads } });
      return out;
    },
  },
  {
    id: "kill_brick",
    name: "Kill / damage bricks",
    category: "combat",
    description: "Parts tagged BW_Kill kill on touch; parts tagged BW_Damage deal Damage per hit with cooldown (attribute Damage on the part overrides).",
    config: { Damage: { default: 20, desc: "Default damage for BW_Damage parts" }, Cooldown: { default: 0.5, desc: "Seconds between hits per player" } },
    usage: "Tag parts BW_Kill or BW_Damage (Tag editor / CollectionService).",
    install: (c) => [{
      service: "ServerScriptService",
      node: folder("kill_brick", c, [script("Hazards", `${CFG}local CS = game:GetService("CollectionService")
local last = {}
local function hook(part, kill)
	if not part:IsA("BasePart") then return end
	part.Touched:Connect(function(hit)
		local hum = hit.Parent and hit.Parent:FindFirstChildOfClass("Humanoid")
		if not hum or hum.Health <= 0 then return end
		if kill then hum.Health = 0 return end
		local key = tostring(hum) .. tostring(part)
		local now = os.clock()
		if last[hum] and now - last[hum] < cfg("Cooldown", 0.5) then return end
		last[hum] = now
		hum:TakeDamage(part:GetAttribute("Damage") or cfg("Damage", 20))
	end)
end
for _, p in ipairs(CS:GetTagged("BW_Kill")) do hook(p, true) end
for _, p in ipairs(CS:GetTagged("BW_Damage")) do hook(p, false) end
CS:GetInstanceAddedSignal("BW_Kill"):Connect(function(p) hook(p, true) end)
CS:GetInstanceAddedSignal("BW_Damage"):Connect(function(p) hook(p, false) end)
`)]),
    }],
  },
  {
    id: "sprint",
    name: "Sprint (Shift / mobile button)",
    category: "movement",
    description: "Hold LeftShift (or the touch button) to sprint, with stamina and FOV kick.",
    config: { WalkSpeed: { default: 16, desc: "Normal speed" }, SprintSpeed: { default: 26, desc: "Sprint speed" }, Stamina: { default: 5, desc: "Seconds of sprint (0 = infinite)" }, FOV: { default: 80, desc: "FOV while sprinting (0 = unchanged)" } },
    usage: "Works automatically for every player.",
    install: (c) => [{
      service: "StarterPlayer.StarterPlayerScripts",
      node: folder("sprint", c, [local("Sprint", `${CFG}local Players = game:GetService("Players")
local UIS = game:GetService("UserInputService")
local CAS = game:GetService("ContextActionService")
local RS = game:GetService("RunService")
local TS = game:GetService("TweenService")
local player = Players.LocalPlayer
local cam = workspace.CurrentCamera
local baseFov = cam.FieldOfView
local want, stamina = false, cfg("Stamina", 5)
local function hum() local ch = player.Character return ch and ch:FindFirstChildOfClass("Humanoid") end
CAS:BindAction("BW_Sprint", function(_, state)
	want = state == Enum.UserInputState.Begin
	return Enum.ContextActionResult.Pass
end, true, Enum.KeyCode.LeftShift, Enum.KeyCode.ButtonL3)
CAS:SetTitle("BW_Sprint", "Run")
local running = false
RS.RenderStepped:Connect(function(dt)
	local h = hum()
	if not h then return end
	local max = cfg("Stamina", 5)
	local moving = h.MoveDirection.Magnitude > 0.1
	local can = want and moving and (max <= 0 or stamina > 0)
	if can and max > 0 then stamina = math.max(0, stamina - dt) elseif not can and max > 0 then stamina = math.min(max, stamina + dt * 0.6) end
	if can ~= running then
		running = can
		h.WalkSpeed = if can then cfg("SprintSpeed", 26) else cfg("WalkSpeed", 16)
		local f = cfg("FOV", 80)
		if f > 0 then TS:Create(cam, TweenInfo.new(0.25), { FieldOfView = if can then f else baseFov }):Play() end
	end
	player:SetAttribute("BW_Stamina", if max > 0 then stamina / max else 1)
end)
`)]),
    }],
  },
  {
    id: "double_jump",
    name: "Double / multi jump",
    category: "movement",
    description: "Extra jumps in the air.",
    config: { ExtraJumps: { default: 1, desc: "Air jumps" }, Power: { default: 1.1, desc: "Jump power multiplier for air jumps" } },
    usage: "Works automatically for every player.",
    install: (c) => [{
      service: "StarterPlayer.StarterCharacterScripts",
      node: folder("double_jump", c, [local("DoubleJump", `local CFG = script.Parent
local function cfg(k, d) local v = CFG:GetAttribute(k) if v == nil then return d end return v end
local UIS = game:GetService("UserInputService")
local char = script.Parent.Parent
local hum = char:WaitForChild("Humanoid")
local hrp = char:WaitForChild("HumanoidRootPart")
local used, armed = 0, false
hum.StateChanged:Connect(function(_, new)
	if new == Enum.HumanoidStateType.Landed or new == Enum.HumanoidStateType.Running then used = 0 armed = false
	elseif new == Enum.HumanoidStateType.Freefall then task.wait(0.15) armed = true end
end)
UIS.JumpRequest:Connect(function()
	if not armed or used >= cfg("ExtraJumps", 1) then return end
	if hum:GetState() ~= Enum.HumanoidStateType.Freefall then return end
	used += 1
	local v = hrp.AssemblyLinearVelocity
	local up = math.sqrt(2 * workspace.Gravity * hum.JumpHeight) * cfg("Power", 1.1)
	hrp.AssemblyLinearVelocity = Vector3.new(v.X, up, v.Z)
	hum:ChangeState(Enum.HumanoidStateType.Jumping)
end)
`)]),
    }],
  },
  {
    id: "day_night",
    name: "Day / night cycle",
    category: "world",
    description: "Smooth Lighting.ClockTime cycle with night ambient; exposes ReplicatedStorage.BW_IsNight (BoolValue).",
    config: { DayMinutes: { default: 10, desc: "Real minutes for a full 24h cycle" }, StartTime: { default: 8, desc: "Start clock time" }, NightAmbient: { default: "#283050", desc: "OutdoorAmbient at night" } },
    usage: "Other scripts can read ReplicatedStorage.BW_IsNight.Value.",
    install: (c) => [{
      service: "ServerScriptService",
      node: folder("day_night", c, [script("DayNight", `${CFG}local L = game:GetService("Lighting")
local RS = game:GetService("ReplicatedStorage")
local isNight = RS:FindFirstChild("BW_IsNight") or Instance.new("BoolValue")
isNight.Name = "BW_IsNight"
isNight.Parent = RS
local dayAmb = L.OutdoorAmbient
local nightAmb = Color3.fromHex(cfg("NightAmbient", "#283050"))
L.ClockTime = cfg("StartTime", 8)
while true do
	local dt = task.wait(0.1)
	local mins = math.max(0.5, cfg("DayMinutes", 10))
	L.ClockTime = (L.ClockTime + dt * 24 / (mins * 60)) % 24
	local t = L.ClockTime
	local night = t < 6 or t > 18.5
	isNight.Value = night
	local k = if night then 1 elseif t < 7 then 1 - (t - 6) elseif t > 17.5 then (t - 17.5) else 0
	L.OutdoorAmbient = dayAmb:Lerp(nightAmb, math.clamp(k, 0, 1))
end
`)]),
    }],
  },
  {
    id: "doors",
    name: "Proximity doors",
    category: "world",
    description: "Parts or models tagged BW_Door get a ProximityPrompt and swing/slide open with a tween; optional auto-close and key (stat requirement).",
    config: { Mode: { default: "swing", desc: "swing | slide" }, AutoClose: { default: 4, desc: "Seconds to auto-close (0 = stays)" }, Time: { default: 0.5, desc: "Tween time" } },
    usage: "Tag a door part (or a model with PrimaryPart) BW_Door. Optional attribute RequireStat='Keys' on the door.",
    install: (c) => [{
      service: "ServerScriptService",
      node: folder("doors", c, [script("Doors", `${CFG}local CS = game:GetService("CollectionService")
local TS = game:GetService("TweenService")
local function hook(door)
	local part = if door:IsA("Model") then door.PrimaryPart else door
	if not part or not part:IsA("BasePart") then warn("[BW doors] needs a BasePart or Model with PrimaryPart:", door:GetFullName()) return end
	part.Anchored = true
	local closed = part.CFrame
	local open = if cfg("Mode", "swing") == "slide" then closed * CFrame.new(part.Size.X, 0, 0)
		else closed * CFrame.new(-part.Size.X / 2, 0, 0) * CFrame.Angles(0, math.rad(90), 0) * CFrame.new(part.Size.X / 2, 0, 0)
	local prompt = Instance.new("ProximityPrompt")
	prompt.ActionText = "Open"
	prompt.ObjectText = door.Name
	prompt.Parent = part
	local isOpen, token = false, 0
	local function set(o)
		isOpen = o
		prompt.ActionText = if o then "Close" else "Open"
		TS:Create(part, TweenInfo.new(cfg("Time", 0.5), Enum.EasingStyle.Quad, Enum.EasingDirection.Out), { CFrame = if o then open else closed }):Play()
	end
	prompt.Triggered:Connect(function(player)
		local need = door:GetAttribute("RequireStat")
		if need and not isOpen then
			local ls = player:FindFirstChild("leaderstats")
			local v = ls and ls:FindFirstChild(need)
			if not v or v.Value <= 0 then prompt.ObjectText = "Needs " .. need return end
		end
		set(not isOpen)
		token += 1
		local my = token
		local ac = cfg("AutoClose", 4)
		if isOpen and ac > 0 then task.delay(ac, function() if token == my and isOpen then set(false) end end) end
	end)
end
for _, d in ipairs(CS:GetTagged("BW_Door")) do hook(d) end
CS:GetInstanceAddedSignal("BW_Door"):Connect(hook)
`)]),
    }],
  },
  {
    id: "round_system",
    name: "Round system",
    category: "flow",
    description: "Intermission → round → results loop. Teleports players to Workspace.BW_Arena spawn parts, awards Wins to survivors. Status in ReplicatedStorage.BW_Status (StringValue).",
    needs: ["leaderstats"],
    config: { Intermission: { default: 15, desc: "Seconds" }, RoundTime: { default: 90, desc: "Seconds" }, MinPlayers: { default: 1, desc: "Players needed" }, WinStat: { default: "Wins", desc: "Stat awarded to survivors" } },
    usage: "Put spawn parts into Workspace.BW_Arena (any BaseParts). Lobby = SpawnLocation. Show BW_Status in UI.",
    install: (c) => [{
      service: "ServerScriptService",
      node: folder("round_system", c, [script("Rounds", `${CFG}local Players = game:GetService("Players")
local RS = game:GetService("ReplicatedStorage")
local status = RS:FindFirstChild("BW_Status") or Instance.new("StringValue")
status.Name = "BW_Status"
status.Parent = RS
local function alive(p)
	local h = p.Character and p.Character:FindFirstChildOfClass("Humanoid")
	return h ~= nil and h.Health > 0
end
while true do
	if #Players:GetPlayers() < cfg("MinPlayers", 1) then
		status.Value = "Waiting for players..."
		task.wait(2)
		continue
	end
	for i = cfg("Intermission", 15), 1, -1 do status.Value = "Intermission: " .. i task.wait(1) end
	local arena = workspace:FindFirstChild("BW_Arena")
	local spawns = {}
	if arena then for _, s in ipairs(arena:GetDescendants()) do if s:IsA("BasePart") then table.insert(spawns, s) end end end
	if #spawns == 0 then status.Value = "No Workspace.BW_Arena spawn parts" warn("[BW rounds] add BaseParts to Workspace.BW_Arena") task.wait(5) continue end
	local inRound = {}
	for i, p in ipairs(Players:GetPlayers()) do
		if alive(p) then
			local s = spawns[(i - 1) % #spawns + 1]
			p.Character:PivotTo(s.CFrame + Vector3.new(0, s.Size.Y / 2 + 3, 0))
			inRound[p] = true
		end
	end
	for i = cfg("RoundTime", 90), 1, -1 do
		local left = 0
		for p in pairs(inRound) do if p.Parent and alive(p) then left += 1 else inRound[p] = nil end end
		status.Value = "Round: " .. i .. "s | alive " .. left
		if left == 0 or (left == 1 and #Players:GetPlayers() > 1 and i < cfg("RoundTime", 90) - 3) then break end
		task.wait(1)
	end
	local winners = {}
	for p in pairs(inRound) do
		if p.Parent and alive(p) then
			table.insert(winners, p.Name)
			local ls = p:FindFirstChild("leaderstats")
			local v = ls and ls:FindFirstChild(cfg("WinStat", "Wins"))
			if v then v.Value += 1 end
			p:LoadCharacter()
		end
	end
	status.Value = if #winners > 0 then "Winners: " .. table.concat(winners, ", ") else "No winners"
	task.wait(4)
end
`)]),
    }],
  },
  {
    id: "shop",
    name: "Shop (server-validated)",
    category: "economy",
    needs: ["leaderstats"],
    description: "RemoteFunction ReplicatedStorage.BW_Shop.Buy(itemId): server checks price/currency, gives a Tool from ServerStorage.BW_ShopItems and remembers ownership for the session.",
    config: { Currency: { default: "Coins", desc: "leaderstats currency" }, Prices: { default: "Sword=50,Speed Coil=120", desc: "item=price list; item names = Tool names in ServerStorage.BW_ShopItems" } },
    usage: "Put Tools into ServerStorage.BW_ShopItems. Client: ReplicatedStorage.BW_Shop.Buy:InvokeServer('Sword') → ok, message. ReplicatedStorage.BW_Shop.List:InvokeServer() → items.",
    install: (c) => [
      { service: "ReplicatedStorage", node: { className: "Folder", name: "BW_Shop", attributes: { BrickwireMechanic: "shop" }, children: [{ className: "RemoteFunction", name: "Buy" }, { className: "RemoteFunction", name: "List" }] } },
      { service: "ServerStorage", node: { className: "Folder", name: "BW_ShopItems", attributes: { BrickwireMechanic: "shop" } } },
      {
        service: "ServerScriptService",
        node: folder("shop", c, [script("Shop", `${CFG}local RS = game:GetService("ReplicatedStorage")
local SS = game:GetService("ServerStorage")
local Players = game:GetService("Players")
local remotes = RS:WaitForChild("BW_Shop")
local items = SS:WaitForChild("BW_ShopItems")
local owned = {}
local function prices()
	local t = {}
	for pair in string.gmatch(cfg("Prices", ""), "[^,]+") do
		local name, price = string.match(pair, "^%s*(.-)%s*=%s*(%d+)%s*$")
		if name then t[name] = tonumber(price) end
	end
	return t
end
local function give(p, name)
	local tool = items:FindFirstChild(name)
	if not tool then return end
	for _, dest in ipairs({ p:FindFirstChild("Backpack"), p:FindFirstChild("StarterGear") }) do
		if dest and not dest:FindFirstChild(name) then tool:Clone().Parent = dest end
	end
end
remotes.List.OnServerInvoke = function(p)
	local out = {}
	for name, price in pairs(prices()) do table.insert(out, { name = name, price = price, owned = owned[p] and owned[p][name] or false, available = items:FindFirstChild(name) ~= nil }) end
	return out
end
remotes.Buy.OnServerInvoke = function(p, name)
	if type(name) ~= "string" then return false, "bad item" end
	local price = prices()[name]
	if not price then return false, "unknown item" end
	if not items:FindFirstChild(name) then return false, "item not configured" end
	owned[p] = owned[p] or {}
	if owned[p][name] then give(p, name) return true, "already owned" end
	local ls = p:FindFirstChild("leaderstats")
	local cur = ls and ls:FindFirstChild(cfg("Currency", "Coins"))
	if not cur or cur.Value < price then return false, "not enough " .. cfg("Currency", "Coins") end
	cur.Value -= price
	owned[p][name] = true
	give(p, name)
	return true, "bought " .. name
end
Players.PlayerRemoving:Connect(function(p) owned[p] = nil end)
`)]),
      },
    ],
  },
];

export function getMechanic(id: string): Mechanic {
  const m = MECHANICS.find((x) => x.id === id);
  if (!m) throw new Error(`unknown mechanic "${id}" — available: ${MECHANICS.map((x) => x.id).join(", ")}`);
  return m;
}

/** Resolve config (defaults + overrides, type-checked) and dependency order. */
export function planMechanicInstall(id: string, overrides: Record<string, MechConfigValue> = {}, withDeps = true) {
  const order: string[] = [];
  const visit = (x: string) => {
    const m = getMechanic(x);
    if (withDeps) for (const d of m.needs ?? []) visit(d);
    if (!order.includes(x)) order.push(x);
  };
  visit(id);
  const main = getMechanic(id);
  for (const k of Object.keys(overrides)) {
    if (!main.config[k]) throw new Error(`mechanic ${id} has no config "${k}" — options: ${Object.keys(main.config).join(", ")}`);
    const want = typeof main.config[k].default;
    if (typeof overrides[k] !== want) throw new Error(`config ${k} must be ${want}`);
  }
  return order.map((mid) => {
    const m = getMechanic(mid);
    const cfg: Record<string, MechConfigValue> = {};
    for (const [k, v] of Object.entries(m.config)) cfg[k] = mid === id && k in overrides ? overrides[k] : v.default;
    return { id: mid, config: cfg, installs: m.install(cfg), isDependency: mid !== id };
  });
}

export function listMechanics() {
  return MECHANICS.map((m) => ({ id: m.id, name: m.name, category: m.category, description: m.description, needs: m.needs ?? [], usage: m.usage,
    config: Object.fromEntries(Object.entries(m.config).map(([k, v]) => [k, { default: v.default, desc: v.desc }])) }));
}
