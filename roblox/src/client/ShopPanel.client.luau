-- The shop panel: fixed Robux items with their prices. Buying opens Roblox's own buy prompt
-- (sent from the server). In Studio, items not set up yet can be tried free.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local ShopItems = require(ReplicatedStorage:WaitForChild("Shared"):WaitForChild("ShopItems"))
local remote = ReplicatedStorage:WaitForChild("FlyLabRemotes"):WaitForChild("Shop")

local WHITE = Color3.new(1, 1, 1)
local DIM = Color3.fromRGB(175, 185, 195)

local gui = Instance.new("ScreenGui")
gui.Name = "FlyLabShop"
gui.ResetOnSpawn = false
gui.DisplayOrder = 6
gui.Parent = Players.LocalPlayer:WaitForChild("PlayerGui")
local scale = Instance.new("UIScale")
scale.Parent = gui
local function rescale()
	local vp = workspace.CurrentCamera and workspace.CurrentCamera.ViewportSize or Vector2.new(1280, 720)
	scale.Scale = math.clamp(math.min(vp.X / 700, vp.Y / 700), 0.5, 1)
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
	l.TextSize = size or 13
	l.TextXAlignment = Enum.TextXAlignment.Left
	l.TextYAlignment = Enum.TextYAlignment.Top
	l.TextWrapped = true
	l.Parent = parent
	return l
end

local toggle = Instance.new("TextButton")
toggle.Size = UDim2.fromOffset(100, 40)
toggle.AnchorPoint = Vector2.new(1, 0)
toggle.Position = UDim2.new(1, -362, 0, 16)
toggle.BackgroundColor3 = Color3.fromRGB(25, 30, 38)
toggle.TextColor3 = WHITE
toggle.Font = Enum.Font.GothamBold
toggle.TextSize = 18
toggle.Text = "🛒 Shop"
toggle.Parent = gui
Instance.new("UICorner").Parent = toggle

local W = 440
local rowsN = #ShopItems.passes + #ShopItems.products
local H = 110 + rowsN * 66 + 2 * 26 + 50
local panel = Instance.new("Frame")
panel.Name = "Panel"
panel.Size = UDim2.fromOffset(W, H)
panel.AnchorPoint = Vector2.new(0.5, 0)
panel.Position = UDim2.new(0.5, 0, 0, 64)
panel.BackgroundColor3 = Color3.fromRGB(14, 17, 22)
panel.Visible = false
panel.Parent = gui
Instance.new("UICorner").Parent = panel
toggle.MouseButton1Click:Connect(function()
	panel.Visible = not panel.Visible
end)

label(panel, "🛒 Lab shop", 300, 24, 15, 12, nil, true, 18)
local close = Instance.new("TextButton")
close.Size = UDim2.fromOffset(30, 26)
close.Position = UDim2.new(1, -42, 0, 10)
close.BackgroundColor3 = Color3.fromRGB(50, 55, 65)
close.TextColor3 = WHITE
close.Text = "✕"
close.Font = Enum.Font.GothamBold
close.TextSize = 14
close.Parent = panel
Instance.new("UICorner").Parent = close
close.MouseButton1Click:Connect(function()
	panel.Visible = false
end)
label(panel, "Everything here is optional, and all lessons stay free. Nothing is random: you always know exactly what you get.",
	W - 30, 34, 15, 42, Color3.fromRGB(150, 230, 180), false, 12)

local cards = {}
local y = 86
local function section(text)
	label(panel, text, W - 30, 18, 15, y, DIM, true, 12)
	y += 24
end
local function card(it, kind)
	local f = Instance.new("Frame")
	f.Size = UDim2.fromOffset(W - 30, 60)
	f.Position = UDim2.fromOffset(15, y)
	f.BackgroundColor3 = Color3.fromRGB(26, 31, 38)
	f.Parent = panel
	Instance.new("UICorner").Parent = f
	label(f, it.icon, 40, 40, 10, 10, nil, true, 28)
	label(f, it.name, 220, 18, 54, 8, nil, true, 15)
	label(f, it.desc, 250, 32, 54, 26, DIM, false, 11)
	local b = Instance.new("TextButton")
	b.Size = UDim2.fromOffset(96, 34)
	b.Position = UDim2.new(1, -106, 0, 13)
	b.TextColor3 = WHITE
	b.Font = Enum.Font.GothamBold
	b.TextSize = 13
	b.TextWrapped = true
	b.Parent = f
	Instance.new("UICorner").Parent = b
	b.MouseButton1Click:Connect(function()
		remote:FireServer("buy", it.key)
	end)
	cards[it.key] = { button = b, item = it, kind = kind }
	y += 66
end
section("KEEP FOREVER")
for _, it in ipairs(ShopItems.passes) do
	card(it, "pass")
end
y += 2
section("USE ONCE")
for _, it in ipairs(ShopItems.products) do
	card(it, "product")
end
local notice = label(panel, "", W - 30, 20, 15, y + 4, Color3.fromRGB(255, 230, 140), true, 13)

local function render(s)
	for key, c in pairs(cards) do
		local price = (s.prices and s.prices[key]) or c.item.price
		local owned = c.kind == "pass" and s.owned and s.owned[key] == true
		local onSale = s.onSale and s.onSale[key]
		local b = c.button
		b.AutoButtonColor = not owned
		if owned then
			b.Text = "✓ Owned"
			b.BackgroundColor3 = Color3.fromRGB(40, 90, 60)
		elseif onSale then
			b.Text = "R$ " .. tostring(price)
			b.BackgroundColor3 = Color3.fromRGB(30, 120, 200)
		elseif s.studio then
			b.Text = "Try free\n(Studio)"
			b.BackgroundColor3 = Color3.fromRGB(110, 80, 150)
		else
			b.Text = "Soon"
			b.BackgroundColor3 = Color3.fromRGB(60, 60, 68)
		end
	end
	if s.notice then
		notice.Text = s.notice
		task.delay(6, function()
			if notice.Text == s.notice then
				notice.Text = ""
			end
		end)
	end
end

render({ owned = {}, prices = {}, onSale = {}, studio = false })
remote.OnClientEvent:Connect(render)
