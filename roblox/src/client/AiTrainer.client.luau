-- The AI trainer (lesson 6): a tiny artificial brain (2 eyes -> 2 turn neurons, 4 connections).
-- Kids wire it by hand and test it, or scramble it and watch it learn by trial and error.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local AiFly = require(ReplicatedStorage:WaitForChild("Shared"):WaitForChild("AiFly"))
local lessons = ReplicatedStorage:WaitForChild("FlyLabRemotes"):WaitForChild("Lessons")

local WHITE = Color3.new(1, 1, 1)
local DIM = Color3.fromRGB(175, 185, 195)

local gui = Instance.new("ScreenGui")
gui.Name = "FlyLabAI"
gui.ResetOnSpawn = false
gui.Parent = Players.LocalPlayer:WaitForChild("PlayerGui")
local scale = Instance.new("UIScale")
scale.Parent = gui
local function rescale()
	local vp = workspace.CurrentCamera and workspace.CurrentCamera.ViewportSize or Vector2.new(1280, 720)
	scale.Scale = math.clamp(math.min(vp.X / 900, vp.Y / 760), 0.5, 1)
end
rescale()
workspace.CurrentCamera:GetPropertyChangedSignal("ViewportSize"):Connect(rescale)

local function label(parent, text, w, h, x, y, color, bold, size, align)
	local l = Instance.new("TextLabel")
	l.BackgroundTransparency = 1
	l.Size = UDim2.fromOffset(w, h)
	l.Position = UDim2.fromOffset(x, y)
	l.Text = text
	l.TextColor3 = color or WHITE
	l.Font = bold and Enum.Font.GothamBold or Enum.Font.Gotham
	l.TextSize = size or 13
	l.TextXAlignment = align or Enum.TextXAlignment.Left
	l.TextWrapped = true
	l.Parent = parent
	return l
end
local function button(parent, text, w, h, x, y, color)
	local b = Instance.new("TextButton")
	b.Size = UDim2.fromOffset(w, h)
	b.Position = UDim2.fromOffset(x, y)
	b.BackgroundColor3 = color or Color3.fromRGB(45, 80, 70)
	b.TextColor3 = WHITE
	b.Font = Enum.Font.GothamBold
	b.TextSize = 14
	b.Text = text
	b.Parent = parent
	Instance.new("UICorner").Parent = b
	return b
end
local function frame(parent, w, h, x, y, color)
	local f = Instance.new("Frame")
	f.Size = UDim2.fromOffset(w, h)
	f.Position = UDim2.fromOffset(x, y)
	f.BackgroundColor3 = color
	f.BorderSizePixel = 0
	f.Parent = parent
	return f
end
local function segment(parent, x1, y1, x2, y2, color, thick)
	local dx, dy = x2 - x1, y2 - y1
	local s = Instance.new("Frame")
	s.AnchorPoint = Vector2.new(0.5, 0.5)
	s.Size = UDim2.fromOffset(math.sqrt(dx * dx + dy * dy) + 1, thick)
	s.Position = UDim2.fromOffset((x1 + x2) / 2, (y1 + y2) / 2)
	s.Rotation = math.deg(math.atan2(dy, dx))
	s.BackgroundColor3 = color
	s.BorderSizePixel = 0
	s.Parent = parent
	return s
end

local toggle = Instance.new("TextButton")
toggle.Size = UDim2.fromOffset(100, 40)
toggle.AnchorPoint = Vector2.new(1, 0)
toggle.Position = UDim2.new(1, -252, 0, 16)
toggle.BackgroundColor3 = Color3.fromRGB(25, 30, 38)
toggle.TextColor3 = WHITE
toggle.Font = Enum.Font.GothamBold
toggle.TextSize = 18
toggle.Text = "🤖 AI"
toggle.Parent = gui
Instance.new("UICorner").Parent = toggle

local W = 420
local panel = frame(gui, W, 600, 0, 0, Color3.fromRGB(14, 17, 22))
panel.Name = "Panel"
panel.AnchorPoint = Vector2.new(0.5, 0)
panel.Position = UDim2.new(0.5, 0, 0, 64)
panel.Visible = false
Instance.new("UICorner").Parent = panel
toggle.MouseButton1Click:Connect(function()
	panel.Visible = not panel.Visible
end)

label(panel, "🤖 AI trainer", 300, 22, 15, 10, nil, true, 17)
label(panel, "An AI brain made of 2 eye neurons and 2 turn neurons. The 4 lines are connections: green pushes a neuron, red holds it back.",
	W - 30, 32, 15, 34, DIM, false, 12)

-- network diagram
local net = frame(panel, W - 30, 170, 15, 72, Color3.fromRGB(8, 10, 14))
local NODES = { L = { 80, 30 }, R = { 310, 30 }, TL = { 80, 140 }, TR = { 310, 140 } }
local lines = frame(net, W - 30, 170, 0, 0, Color3.new())
lines.BackgroundTransparency = 1
for name, p in pairs(NODES) do
	local n = frame(net, 64, 30, p[1] - 32, p[2] - 15, name:sub(1, 1) == "T" and Color3.fromRGB(110, 255, 170) or Color3.fromRGB(90, 200, 255))
	n.ZIndex = 3
	Instance.new("UICorner").Parent = n
	local text = ({ L = "Left eye", R = "Right eye", TL = "Turn left", TR = "Turn right" })[name]
	local l = label(n, text, 64, 30, 0, 0, Color3.fromRGB(10, 15, 20), true, 11, Enum.TextXAlignment.Center)
	l.ZIndex = 4
end

local w = AiFly.zero()
local busy = false
local drawNet
local WIRES = { -- weight key, from node, to node, where its controls sit
	{ "LL", "L", "TL", 18, 72 },
	{ "RR", "R", "TR", 300, 72 },
	{ "LR", "L", "TR", 112, 98 },
	{ "RL", "R", "TL", 206, 98 },
}
local valueLabels = {}
for _, wire in ipairs(WIRES) do
	local key, x, y = wire[1], wire[4], wire[5]
	local minus = button(net, "−", 22, 22, x, y, Color3.fromRGB(110, 50, 50))
	local value = label(net, "0", 36, 22, x + 24, y, WHITE, true, 13, Enum.TextXAlignment.Center)
	local plus = button(net, "+", 22, 22, x + 62, y, Color3.fromRGB(45, 110, 70))
	for _, b in ipairs({ minus, plus, value }) do
		b.ZIndex = 5
	end
	valueLabels[key] = value
	minus.MouseButton1Click:Connect(function()
		if not busy then
			w[key] = math.clamp(w[key] - AiFly.STEP, AiFly.MIN, AiFly.MAX)
			drawNet()
		end
	end)
	plus.MouseButton1Click:Connect(function()
		if not busy then
			w[key] = math.clamp(w[key] + AiFly.STEP, AiFly.MIN, AiFly.MAX)
			drawNet()
		end
	end)
end

drawNet = function()
	lines:ClearAllChildren()
	for _, wire in ipairs(WIRES) do
		local v = w[wire[1]]
		local a, b = NODES[wire[2]], NODES[wire[3]]
		local color = v > 0 and Color3.fromRGB(80, 230, 120) or v < 0 and Color3.fromRGB(240, 80, 80) or Color3.fromRGB(60, 65, 75)
		segment(lines, a[1], a[2] + 15, b[1], b[2] - 15, color, 1 + math.abs(v) * 2.5)
		valueLabels[wire[1]].Text = (v > 0 and "+" or "") .. tostring(v)
	end
end
drawNet()

-- arena
local AW, AH = W - 30, 210
local arena = frame(panel, AW, AH, 15, 250, Color3.fromRGB(20, 26, 22))
arena.ClipsDescendants = true
local trail = frame(arena, AW, AH, 0, 0, Color3.new())
trail.BackgroundTransparency = 1
local fruit = frame(arena, 14, 14, 0, 0, Color3.fromRGB(255, 200, 40))
fruit.AnchorPoint = Vector2.new(0.5, 0.5)
local fc = Instance.new("UICorner")
fc.CornerRadius = UDim.new(1, 0)
fc.Parent = fruit
local fly = frame(arena, 12, 12, 0, 0, Color3.fromRGB(230, 230, 230))
fly.AnchorPoint = Vector2.new(0.5, 0.5)
local flyc = Instance.new("UICorner")
flyc.CornerRadius = UDim.new(1, 0)
flyc.Parent = fly

local status = label(panel, "Set the connections, then press Test.", W - 30, 34, 15, 466, WHITE, true, 13)
local testBtn = button(panel, "▶ Test", 120, 34, 15, 506)
local scrambleBtn = button(panel, "🎲 Scramble", 130, 34, 145, 506, Color3.fromRGB(70, 60, 90))
local learnBtn = button(panel, "🧠 Learn", 125, 34, 285, 506, Color3.fromRGB(40, 90, 140))
label(panel, "The real fly does the same with real neurons: left eye cells excite the left steering neuron. Evolution set its wiring; AI gets its wiring from training.",
	W - 30, 44, 15, 548, DIM, false, 11)

local function place(obj, p)
	obj.Position = UDim2.fromOffset(p[1] * AW, p[2] * AH)
end

-- play one trial on the arena
local function playTrial(spot)
	trail:ClearAllChildren()
	place(fruit, spot)
	local ok, t, d, path = AiFly.run(w, spot)
	if ok then
		table.insert(path, spot)
	end
	local prev = { 0.5, 0.88 }
	place(fly, prev)
	for k, p in ipairs(path) do
		segment(trail, prev[1] * AW, prev[2] * AH, p[1] * AW, p[2] * AH, Color3.fromRGB(120, 140, 130), 2)
		place(fly, p)
		prev = p
		if k % 2 == 0 then
			task.wait()
		end
	end
	return ok, t, d
end

testBtn.MouseButton1Click:Connect(function()
	if busy then
		return
	end
	busy = true
	local reached = 0
	for i, spot in ipairs(AiFly.TRIALS) do
		status.Text = string.format("Test %d of %d…", i, #AiFly.TRIALS)
		if playTrial(spot) then
			reached += 1
		end
		task.wait(0.3)
	end
	if reached == #AiFly.TRIALS then
		status.Text = "🎉 It reached all 3 fruits! You wired a working brain."
		lessons:FireServer("event", "ai_manual")
	else
		status.Text = string.format("It reached %d of 3. Change the connections and test again.", reached)
	end
	busy = false
end)

scrambleBtn.MouseButton1Click:Connect(function()
	if busy then
		return
	end
	w = AiFly.scramble()
	drawNet()
	trail:ClearAllChildren()
	status.Text = "Scrambled! Now press Learn and watch it fix itself."
end)

learnBtn.MouseButton1Click:Connect(function()
	if busy then
		return
	end
	busy = true
	local best, all = AiFly.score(w)
	local tries = 0
	while not all and tries < 300 do
		tries += 1
		local kept, key
		w, best, kept, key = AiFly.learnStep(w, best)
		all = select(2, AiFly.score(w))
		drawNet()
		status.Text = string.format("Try %d: nudged %s… %s  (score %.1f)", tries, key, kept and "✔ kept it" or "✘ undid it", best)
		task.wait(0.06)
	end
	if all then
		status.Text = string.format("🎉 Learned it in %d tries! Watch the test.", tries)
		task.wait(0.6)
		for _, spot in ipairs(AiFly.TRIALS) do
			playTrial(spot)
			task.wait(0.2)
		end
		status.Text = string.format("🎉 Learned in %d tries, by trial and error.", tries)
		lessons:FireServer("event", "ai_learned")
	else
		status.Text = "Still learning… press Learn again to keep going."
	end
	busy = false
end)

place(fruit, AiFly.TRIALS[1])
place(fly, { 0.5, 0.88 })
