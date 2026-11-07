-- The genes panel: the flies in the pen and their genes, breeding, implanting made-up genes,
-- auto-farm, birds, and the stats board (how common each gene variant is, birth by birth).

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Genetics = require(ReplicatedStorage:WaitForChild("Shared"):WaitForChild("Genetics"))
local farmEvent = ReplicatedStorage:WaitForChild("FlyLabRemotes"):WaitForChild("Farm")

local DIM = Color3.fromRGB(170, 180, 190)
local WHITE = Color3.new(1, 1, 1)
local function rgb(t)
	return Color3.fromRGB(t[1], t[2], t[3])
end

local gui = Instance.new("ScreenGui")
gui.Name = "FlyLabGenes"
gui.ResetOnSpawn = false
gui.Parent = Players.LocalPlayer:WaitForChild("PlayerGui")
local scale = Instance.new("UIScale")
scale.Parent = gui
local function rescale()
	local vp = workspace.CurrentCamera and workspace.CurrentCamera.ViewportSize or Vector2.new(1280, 720)
	scale.Scale = math.clamp(math.min(vp.X / 900, vp.Y / 940), 0.5, 1)
end
rescale()
workspace.CurrentCamera:GetPropertyChangedSignal("ViewportSize"):Connect(rescale)

local function label(parent, text, w, h, x, y, color, bold, size)
	local l = Instance.new("TextLabel")
	l.BackgroundTransparency = 1
	l.Size = UDim2.fromOffset(w, h)
	l.Position = UDim2.fromOffset(x, y)
	l.Text = text
	l.TextColor3 = color or WHITE
	l.Font = bold and Enum.Font.GothamBold or Enum.Font.Gotham
	l.TextSize = size or (bold and 15 or 12)
	l.TextXAlignment = Enum.TextXAlignment.Left
	l.TextWrapped = true
	l.Parent = parent
	return l
end

local function button(parent, text, w, h, x, y, color)
	local b = Instance.new("TextButton")
	b.Size = UDim2.fromOffset(w, h)
	b.Position = UDim2.fromOffset(x, y)
	b.BackgroundColor3 = color or Color3.fromRGB(40, 70, 60)
	b.TextColor3 = WHITE
	b.Font = Enum.Font.GothamBold
	b.TextSize = 12
	b.Text = text
	b.AutoButtonColor = true
	b.Parent = parent
	Instance.new("UICorner").Parent = b
	return b
end

local toggle = Instance.new("TextButton")
toggle.Size = UDim2.fromOffset(110, 40)
toggle.AnchorPoint = Vector2.new(1, 0)
toggle.Position = UDim2.new(1, -134, 0, 16)
toggle.BackgroundColor3 = Color3.fromRGB(25, 30, 38)
toggle.TextColor3 = WHITE
toggle.Font = Enum.Font.GothamBold
toggle.TextSize = 18
toggle.Text = "🧬 Genes"
toggle.Parent = gui
Instance.new("UICorner").Parent = toggle

local W = 440
local panel = Instance.new("Frame")
panel.Size = UDim2.fromOffset(W, 840)
panel.Position = UDim2.fromOffset(16, 64)
panel.BackgroundColor3 = Color3.fromRGB(14, 17, 22)
panel.BackgroundTransparency = 0.08
panel.Visible = false
panel.Name = "Panel"
panel.Parent = gui
Instance.new("UICorner").Parent = panel
toggle.MouseButton1Click:Connect(function()
	panel.Visible = not panel.Visible
end)

label(panel, "🧬 Fly farm", 300, 22, 15, 10, nil, true, 17)
label(panel, "Every fly has 2 copies of each gene: one from mom, one from dad. Babies get one copy from each, picked at random.",
	W - 30, 30, 15, 34, DIM)

-- controls
local autoBtn = button(panel, "Auto-farm: OFF", 130, 28, 15, 70)
local birdBtn = button(panel, "🐦 Send a bird", 120, 28, 152, 70, Color3.fromRGB(70, 60, 90))
local stats = label(panel, "", 150, 28, 280, 70, DIM)
local auto = false
autoBtn.MouseButton1Click:Connect(function()
	farmEvent:FireServer("auto", not auto)
end)
birdBtn.MouseButton1Click:Connect(function()
	farmEvent:FireServer("bird")
end)

-- fly table
local COLS = { "EYES", "JUMP", "COLOR", "WHITE" }
local y0 = 106
label(panel, "fly", 40, 14, 15, y0, DIM, true, 11)
label(panel, "gen", 30, 14, 52, y0, DIM, true, 11)
label(panel, "🍌", 30, 14, 82, y0, DIM, true, 11)
for k, key in ipairs(COLS) do
	label(panel, Genetics.BY_KEY[key].name, 52, 14, 115 + (k - 1) * 50, y0, rgb(Genetics.BY_KEY[key].color), true, 11)
end
label(panel, "made-up", 70, 14, 315, y0, DIM, true, 11)
label(panel, "breed", 40, 14, 392, y0, DIM, true, 11)

local ROWS = 8
local rows = {}
local picked = {}
local state = nil
local render
for r = 1, ROWS do
	local yy = y0 + 16 + (r - 1) * 26
	local row = Instance.new("TextButton")
	row.Size = UDim2.fromOffset(W - 30, 24)
	row.Position = UDim2.fromOffset(15, yy)
	row.BackgroundColor3 = Color3.fromRGB(26, 31, 38)
	row.AutoButtonColor = true
	row.Text = ""
	row.Parent = panel
	Instance.new("UICorner").Parent = row
	local cells = {
		id = label(row, "", 36, 24, 4, 0, WHITE, true),
		gen = label(row, "", 30, 24, 40, 0, DIM),
		eaten = label(row, "", 30, 24, 68, 0, DIM),
		genes = {},
		fake = label(row, "", 76, 24, 300, 0, DIM),
	}
	for k = 1, #COLS do
		cells.genes[k] = label(row, "", 48, 24, 100 + (k - 1) * 50, 0, WHITE, true, 13)
		cells.genes[k].RichText = true
	end
	cells.fake.RichText = true
	local pick = button(row, "", 30, 20, W - 66, 2, Color3.fromRGB(50, 55, 65))
	rows[r] = { row = row, cells = cells, pick = pick, id = nil }
	row.MouseButton1Click:Connect(function()
		if rows[r].id then
			farmEvent:FireServer("watch", rows[r].id)
		end
	end)
	pick.MouseButton1Click:Connect(function()
		local id = rows[r].id
		if not id then
			return
		end
		local k = table.find(picked, id)
		if k then
			table.remove(picked, k)
		else
			table.insert(picked, id)
			if #picked > 2 then
				table.remove(picked, 1)
			end
		end
		if state then
			render(state)
		end
	end)
end

local yb = y0 + 16 + ROWS * 26 + 6
local breedBtn = button(panel, "Pick two flies to breed", W - 30, 30, 15, yb, Color3.fromRGB(150, 90, 40))
breedBtn.MouseButton1Click:Connect(function()
	if #picked == 2 then
		farmEvent:FireServer("breed", picked[1], picked[2])
		picked = {}
	end
end)

-- implant + effects
local yi = yb + 40
local implantTitle = label(panel, "Implant a made-up gene into the watched fly:", W - 30, 16, 15, yi, nil, true, 13)
local FAKE = {}
for _, g in ipairs(Genetics.GENES) do
	if g.kind == "fake" then
		table.insert(FAKE, g)
	end
end
-- Gene Kit genes (shop) are locked until owned; tapping a locked one opens the shop
local hasKit = false
local kitButtons = {}
local function paintKit()
	for _, kb in ipairs(kitButtons) do
		kb[1].Text = (hasKit and "💉 " or "🔒 ") .. kb[2].name
	end
end
for k, g in ipairs(FAKE) do
	local b = button(panel, "💉 " .. g.name, 132, 26, 15 + ((k - 1) % 3) * 138, yi + 20 + math.floor((k - 1) / 3) * 30, Color3.fromRGB(60, 50, 80))
	b.TextColor3 = rgb(g.color)
	if g.kit then
		table.insert(kitButtons, { b, g })
	end
	b.MouseButton1Click:Connect(function()
		if g.kit and not hasKit then
			local shop = Players.LocalPlayer.PlayerGui:FindFirstChild("FlyLabShop")
			local p = shop and shop:FindFirstChild("Panel")
			if p then
				p.Visible = true
			end
			return
		end
		if state and state.watched then
			farmEvent:FireServer("implant", state.watched, g.key)
		end
	end)
end
paintKit()
task.spawn(function()
	local shopRemote = ReplicatedStorage:WaitForChild("FlyLabRemotes"):WaitForChild("Shop", 30)
	if shopRemote then
		shopRemote.OnClientEvent:Connect(function(s)
			hasKit = s.owned and s.owned.GENE_KIT == true
			paintKit()
		end)
	end
end)
local ye = yi + 84
label(panel, "What do the made-up genes do? (you decide)", W - 30, 16, 15, ye, nil, true, 13)
local EFFECT_NEXT = { none = "helps", helps = "hurts", hurts = "none" }
local EFFECT_TEXT = { none = "no effect", helps = "helps breeding", hurts = "hurts breeding" }
local effectBtns = {}
for k, g in ipairs(FAKE) do
	local b = button(panel, "", 202, 24, 15 + ((k - 1) % 2) * 208, ye + 20 + math.floor((k - 1) / 2) * 28, Color3.fromRGB(40, 45, 55))
	b.MouseButton1Click:Connect(function()
		local cur = state and state.effects[g.key] or "none"
		farmEvent:FireServer("effect", g.key, EFFECT_NEXT[cur])
	end)
	effectBtns[g.key] = b
end

-- stats board
local yc = ye + 110
label(panel, "Stats board: how common each gene variant is", W - 30, 16, 15, yc, nil, true, 13)
local chart = Instance.new("Frame")
chart.Size = UDim2.fromOffset(W - 30, 120)
chart.Position = UDim2.fromOffset(15, yc + 20)
chart.BackgroundColor3 = Color3.fromRGB(6, 8, 11)
chart.ClipsDescendants = true
chart.Parent = panel
for _, f in ipairs({ 0.5 }) do
	local line = Instance.new("Frame")
	line.Size = UDim2.new(1, 0, 0, 1)
	line.Position = UDim2.fromScale(0, 1 - f)
	line.BackgroundColor3 = Color3.fromRGB(40, 45, 52)
	line.BorderSizePixel = 0
	line.Parent = chart
end
label(chart, "100%", 40, 12, 3, 2, Color3.fromRGB(90, 100, 110), false, 10)
label(chart, "50%", 40, 12, 3, 52, Color3.fromRGB(90, 100, 110), false, 10)
local plot = Instance.new("Frame")
plot.Size = UDim2.fromScale(1, 1)
plot.BackgroundTransparency = 1
plot.Parent = chart
local legend = {}
for k, g in ipairs(Genetics.GENES) do
	local x = 15 + ((k - 1) % 4) * 104
	local yy = yc + 144 + math.floor((k - 1) / 4) * 16
	local l = label(panel, "■ " .. g.variantName, 104, 14, x, yy, rgb(g.color), false, 11)
	legend[g.key] = l
end

local logLabel = label(panel, "", W - 30, 64, 15, yc + 196, DIM, false, 12)
logLabel.TextYAlignment = Enum.TextYAlignment.Top

local function segment(parent, x1, y1, x2, y2, color)
	local dx, dy = x2 - x1, y2 - y1
	local len = math.sqrt(dx * dx + dy * dy)
	local s = Instance.new("Frame")
	s.AnchorPoint = Vector2.new(0.5, 0.5)
	s.Size = UDim2.fromOffset(len + 1, 2)
	s.Position = UDim2.fromOffset((x1 + x2) / 2, (y1 + y2) / 2)
	s.Rotation = math.deg(math.atan2(dy, dx))
	s.BackgroundColor3 = color
	s.BorderSizePixel = 0
	s.Parent = parent
end

local lastHistory = -1
local function drawChart(history)
	local key = #history > 0 and history[#history].n * 1000 + #history or 0
	if key == lastHistory then
		return
	end
	lastHistory = key
	plot:ClearAllChildren()
	local w, h = W - 30, 120
	local n = #history
	for _, g in ipairs(Genetics.GENES) do
		local color = rgb(g.color)
		local px, py
		for k, snap in ipairs(history) do
			local x = n > 1 and (k - 1) / (n - 1) * (w - 50) + 40 or 40
			local yv = h - 6 - (snap.f[g.key] or 0) * (h - 12)
			if px then
				segment(plot, px, py, x, yv, color)
			end
			px, py = x, yv
		end
		if px then
			local dot = Instance.new("Frame")
			dot.Size = UDim2.fromOffset(5, 5)
			dot.AnchorPoint = Vector2.new(0.5, 0.5)
			dot.Position = UDim2.fromOffset(px, py)
			dot.BackgroundColor3 = color
			dot.BorderSizePixel = 0
			dot.Parent = plot
		end
		local last = history[n] and history[n].f[g.key] or 0
		legend[g.key].Text = string.format("■ %s %d%%", g.variantName, math.floor(last * 100 + 0.5))
	end
end

-- "E+" -> coloured letters; bold when the fly shows the variant
local function geneText(key: string, pair: string): string
	local g = Genetics.BY_KEY[key]
	local hex = rgb(g.color):ToHex()
	local out = ""
	for c in string.gmatch(pair, ".") do
		if c == g.variant then
			out ..= string.format('<font color="#%s">%s</font>', hex, c)
		else
			out ..= string.format('<font color="#8a96a3">%s</font>', c)
		end
	end
	return out
end

function render(s)
	state = s
	auto = s.auto
	autoBtn.Text = auto and "Auto-farm: ON" or "Auto-farm: OFF"
	autoBtn.BackgroundColor3 = auto and Color3.fromRGB(40, 140, 80) or Color3.fromRGB(40, 70, 60)
	stats.Text = string.format("%d flies · %d eggs · %d babies so far", #s.flies, s.eggs, s.births)
	-- drop picks of flies that left
	for k = #picked, 1, -1 do
		local found = false
		for _, f in ipairs(s.flies) do
			if f.id == picked[k] then
				found = true
			end
		end
		if not found then
			table.remove(picked, k)
		end
	end
	for r = 1, ROWS do
		local row, f = rows[r], s.flies[r]
		row.row.Visible = f ~= nil
		row.id = f and f.id
		if f then
			local c = row.cells
			c.id.Text = (f.id == s.watched and "👁" or "") .. "#" .. f.id
			c.gen.Text = tostring(f.gen)
			c.eaten.Text = f.scared and "😨" or tostring(f.eaten)
			for k, key in ipairs(COLS) do
				c.genes[k].Text = geneText(key, f.genes[key])
			end
			local fake = {}
			for _, g in ipairs(FAKE) do
				if f.genes[g.key] ~= g.normal .. g.normal then
					table.insert(fake, geneText(g.key, f.genes[g.key]))
				end
			end
			c.fake.Text = table.concat(fake, " ")
			row.row.BackgroundColor3 = f.id == s.watched and Color3.fromRGB(30, 50, 60) or Color3.fromRGB(26, 31, 38)
			local isPicked = table.find(picked, f.id) ~= nil
			row.pick.Text = isPicked and "♥" or "+"
			row.pick.BackgroundColor3 = isPicked and Color3.fromRGB(200, 70, 110) or Color3.fromRGB(50, 55, 65)
		end
	end
	if #picked == 2 then
		breedBtn.Text = string.format("🥚 Breed #%d × #%d", picked[1], picked[2])
		breedBtn.BackgroundColor3 = Color3.fromRGB(200, 120, 40)
	else
		breedBtn.Text = #picked == 1 and "Pick one more fly (+)" or "Pick two flies to breed (+)"
		breedBtn.BackgroundColor3 = Color3.fromRGB(110, 75, 45)
	end
	implantTitle.Text = string.format("Implant a made-up gene into fly #%s:", tostring(s.watched or "?"))
	for key, b in pairs(effectBtns) do
		local g = Genetics.BY_KEY[key]
		local e = s.effects[key] or "none"
		b.Text = g.name .. ": " .. EFFECT_TEXT[e]
		b.TextColor3 = e == "helps" and Color3.fromRGB(120, 255, 150) or e == "hurts" and Color3.fromRGB(255, 120, 120) or DIM
	end
	drawChart(s.history)
	logLabel.Text = table.concat(s.log, "\n")
end

farmEvent.OnClientEvent:Connect(render)
