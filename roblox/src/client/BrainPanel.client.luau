-- The brain panel: fly 1's 879 neurons at their real positions (front view), lighting up as they
-- fire; what the fly is doing; and switches to turn parts of its brain off.

local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Circuit = require(ReplicatedStorage:WaitForChild("Shared"):WaitForChild("Circuit"))
local remotes = ReplicatedStorage:WaitForChild("FlyLabRemotes")
local brainEvent = remotes:WaitForChild("Brain")
local experimentEvent = remotes:WaitForChild("Experiment")

local N = Circuit.n
local GRAY = Color3.fromRGB(150, 160, 170)
-- group -> colour and the kid-facing name
local KINDS = {
	{ { "in_loom_L", "in_loom_R" }, Color3.fromRGB(255, 160, 60), "Looming eyes (LC4, LPLC2)" },
	{ { "in_target_L", "in_target_R" }, Color3.fromRGB(90, 200, 255), "Small-object eyes (LC10a)" },
	{ { "in_touch" }, Color3.fromRGB(255, 230, 90), "Eye bristles (touch)" },
	{ { "escape" }, Color3.fromRGB(255, 70, 70), "Giant fibre: ESCAPE (DNp01)" },
	{ { "steer_L", "steer_R" }, Color3.fromRGB(110, 255, 170), "Steering (DNa02)" },
	{ { "groom" }, Color3.fromRGB(200, 140, 255), "Grooming (DNg12)" },
	{ { "walk", "back" }, Color3.fromRGB(255, 255, 255), "Walk / back up" },
}
local color = table.create(N, GRAY)
local big = table.create(N, false)
for _, kind in ipairs(KINDS) do
	for _, g in ipairs(kind[1]) do
		for _, i in ipairs(Circuit.groups[g]) do
			color[i + 1] = kind[2]
			big[i + 1] = not string.find(g, "^in_")
		end
	end
end

local gui = Instance.new("ScreenGui")
gui.Name = "FlyLabBrain"
gui.ResetOnSpawn = false
gui.IgnoreGuiInset = false
gui.Parent = Players.LocalPlayer:WaitForChild("PlayerGui")

local scale = Instance.new("UIScale")
scale.Parent = gui
local function rescale()
	local vp = workspace.CurrentCamera and workspace.CurrentCamera.ViewportSize or Vector2.new(1280, 720)
	scale.Scale = math.clamp(math.min(vp.X / 900, vp.Y / 720), 0.55, 1)
end
rescale()
workspace.CurrentCamera:GetPropertyChangedSignal("ViewportSize"):Connect(rescale)

local function label(parent, text, size, pos, color3, bold)
	local l = Instance.new("TextLabel")
	l.BackgroundTransparency = 1
	l.Size = size
	l.Position = pos
	l.Text = text
	l.TextColor3 = color3 or Color3.new(1, 1, 1)
	l.Font = bold and Enum.Font.GothamBold or Enum.Font.Gotham
	l.TextSize = bold and 16 or 13
	l.TextXAlignment = Enum.TextXAlignment.Left
	l.TextWrapped = true
	l.Parent = parent
	return l
end

local toggle = Instance.new("TextButton")
toggle.Size = UDim2.fromOffset(110, 40)
toggle.AnchorPoint = Vector2.new(1, 0)
toggle.Position = UDim2.new(1, -16, 0, 16)
toggle.BackgroundColor3 = Color3.fromRGB(25, 30, 38)
toggle.TextColor3 = Color3.new(1, 1, 1)
toggle.Font = Enum.Font.GothamBold
toggle.TextSize = 18
toggle.Text = "🧠 Brain"
toggle.Parent = gui
Instance.new("UICorner").Parent = toggle

local panel = Instance.new("Frame")
panel.Size = UDim2.fromOffset(380, 645)
panel.AnchorPoint = Vector2.new(1, 0)
panel.Position = UDim2.new(1, -16, 0, 64)
panel.BackgroundColor3 = Color3.fromRGB(14, 17, 22)
panel.BackgroundTransparency = 0.08
panel.Visible = false
panel.Name = "Panel"
panel.Parent = gui
Instance.new("UICorner").Parent = panel
toggle.MouseButton1Click:Connect(function()
	panel.Visible = not panel.Visible
end)

local title = label(panel, "Your fly's brain", UDim2.fromOffset(350, 22), UDim2.fromOffset(15, 10), nil, true)
label(
	panel,
	"879 real neurons from a fruit fly, at their real places (seen from the front). They light up when they fire.",
	UDim2.fromOffset(350, 34),
	UDim2.fromOffset(15, 32),
	Color3.fromRGB(180, 190, 200)
)

-- the neuron map
local map = Instance.new("Frame")
map.Size = UDim2.fromOffset(350, 210)
map.Position = UDim2.fromOffset(15, 72)
map.BackgroundColor3 = Color3.fromRGB(6, 8, 11)
map.ClipsDescendants = true
map.Parent = panel
label(map, "LEFT", UDim2.fromOffset(40, 14), UDim2.fromOffset(6, 4), Color3.fromRGB(110, 120, 130))
local rl = label(map, "RIGHT", UDim2.fromOffset(44, 14), UDim2.new(1, -46, 0, 4), Color3.fromRGB(110, 120, 130))
rl.TextXAlignment = Enum.TextXAlignment.Right

local dots = table.create(N)
local level = table.create(N, 0)
for i = 1, N do
	local p = Circuit.pos[i]
	local d = Instance.new("Frame")
	local s = big[i] and 7 or 4
	d.Size = UDim2.fromOffset(s, s)
	d.AnchorPoint = Vector2.new(0.5, 0.5)
	d.Position = UDim2.new(0.04 + 0.92 * p[1], 0, 0.06 + 0.8 * p[2], 0)
	d.BorderSizePixel = 0
	d.BackgroundColor3 = color[i]
	d.BackgroundTransparency = 0.82
	d.ZIndex = big[i] and 3 or 2
	if big[i] then
		Instance.new("UICorner").Parent = d
	end
	d.Parent = map
	dots[i] = d
end

-- legend
local y = 290
for _, kind in ipairs(KINDS) do
	local sw = Instance.new("Frame")
	sw.Size = UDim2.fromOffset(10, 10)
	sw.Position = UDim2.fromOffset(15, y + 3)
	sw.BackgroundColor3 = kind[2]
	sw.BorderSizePixel = 0
	sw.Parent = panel
	label(panel, kind[3], UDim2.fromOffset(330, 16), UDim2.fromOffset(32, y), Color3.fromRGB(210, 215, 220))
	y += 17
end

local geneNote = label(panel, "", UDim2.fromOffset(350, 16), UDim2.fromOffset(15, y + 2), Color3.fromRGB(150, 220, 255))
y += 18
-- what it's doing + activity bars
local doing = label(panel, "Walking", UDim2.fromOffset(350, 20), UDim2.fromOffset(15, y + 6), nil, true)
y += 30
local BARS = {
	{ "escape", "Escape", Color3.fromRGB(255, 70, 70), 25 },
	{ "steerL", "Turn left", Color3.fromRGB(110, 255, 170), 5 },
	{ "steerR", "Turn right", Color3.fromRGB(110, 255, 170), 5 },
	{ "groom", "Groom", Color3.fromRGB(200, 140, 255), 80 },
}
local bars = {}
for _, b in ipairs(BARS) do
	label(panel, b[2], UDim2.fromOffset(80, 16), UDim2.fromOffset(15, y), Color3.fromRGB(200, 205, 210))
	local back = Instance.new("Frame")
	back.Size = UDim2.fromOffset(250, 10)
	back.Position = UDim2.fromOffset(100, y + 3)
	back.BackgroundColor3 = Color3.fromRGB(35, 40, 48)
	back.BorderSizePixel = 0
	back.Parent = panel
	local fill = Instance.new("Frame")
	fill.Size = UDim2.fromScale(0, 1)
	fill.BackgroundColor3 = b[3]
	fill.BorderSizePixel = 0
	fill.Parent = back
	bars[b[1]] = { fill, b[4] }
	y += 18
end

-- experiments
y += 8
label(panel, "Experiments: switch a part off", UDim2.fromOffset(350, 18), UDim2.fromOffset(15, y), nil, true)
y += 22
local SWITCHES = {
	{ "loom", "Looming eyes" },
	{ "escape", "Giant fibre" },
	{ "target", "Object eyes" },
	{ "steer", "Steering" },
	{ "groom", "Grooming" },
}
local buttons = {}
for k, sw in ipairs(SWITCHES) do
	local b = Instance.new("TextButton")
	local col, row = (k - 1) % 3, math.floor((k - 1) / 3)
	b.Size = UDim2.fromOffset(112, 30)
	b.Position = UDim2.fromOffset(15 + col * 118, y + row * 36)
	b.Font = Enum.Font.GothamBold
	b.TextSize = 13
	b.TextColor3 = Color3.new(1, 1, 1)
	b.Parent = panel
	Instance.new("UICorner").Parent = b
	local state = false
	local function paint()
		b.Text = (state and "OFF: " or "") .. sw[2]
		b.BackgroundColor3 = state and Color3.fromRGB(150, 40, 40) or Color3.fromRGB(40, 70, 60)
	end
	paint()
	b.MouseButton1Click:Connect(function()
		experimentEvent:FireServer(sw[1], not state)
	end)
	buttons[sw[1]] = function(on)
		state = on
		paint()
	end
end

local ACTIONS = {
	walk = "Walking",
	turnL = "Turning left: steering neurons on the left fire",
	turnR = "Turning right: steering neurons on the right fire",
	eat = "Eating fruit",
	groom = "Grooming: cleaning its eyes",
	flight = "ESCAPE! The giant fibre fired",
	dizzy = "Swatted! It didn't escape in time",
	back = "Backing up",
}

brainEvent.OnClientEvent:Connect(function(fired, info)
	for _, i in ipairs(fired) do
		level[i] = 1
	end
	doing.Text = ACTIONS[info.action] or info.action
	title.Text = string.format("Brain of fly #%d", info.id or 0)
	geneNote.Text = string.format("Its genes: object eyes x%.1f, looming eyes x%.2f", info.targetGain or 1, info.loomGain or 1)
	for key, bar in pairs(bars) do
		local v = math.clamp((info[key] or 0) / bar[2], 0, 1)
		bar[1].Size = UDim2.fromScale(v, 1)
	end
	for key, set in pairs(buttons) do
		set(info.off and info.off[key] == true)
	end
end)

RunService.RenderStepped:Connect(function(dt)
	if not panel.Visible then
		return
	end
	local fade = math.exp(-dt * 5)
	for i = 1, N do
		local l = level[i]
		if l > 0.01 then
			l *= fade
			level[i] = l
			dots[i].BackgroundTransparency = 0.82 - 0.82 * l
		elseif l > 0 then
			level[i] = 0
			dots[i].BackgroundTransparency = 0.82
		end
	end
end)
