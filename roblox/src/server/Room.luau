-- The one-room lab: floor, walls, a sign, a fruit basket kids click for fruit, and a swatter tool.

local Players = game:GetService("Players")
local Lighting = game:GetService("Lighting")
local StarterPack = game:GetService("StarterPack")
local Config = require(game:GetService("ReplicatedStorage"):WaitForChild("Shared"):WaitForChild("Config"))
local Events = require(script.Parent:WaitForChild("Events"))

local Room = {}
Room.foods = {} -- fruit parts currently on the floor

local HALF = Config.ROOM / 2

local function part(props)
	local p = Instance.new("Part")
	p.Anchored = true
	p.TopSurface = Enum.SurfaceType.Smooth
	p.BottomSurface = Enum.SurfaceType.Smooth
	for k, v in pairs(props) do
		p[k] = v
	end
	return p
end

local function sign(parent, face, lines)
	local gui = Instance.new("SurfaceGui")
	gui.Face = face
	gui.SizingMode = Enum.SurfaceGuiSizingMode.PixelsPerStud
	gui.PixelsPerStud = 40
	gui.Parent = parent
	local label = Instance.new("TextLabel")
	label.Size = UDim2.fromScale(1, 1)
	label.BackgroundColor3 = Color3.fromRGB(20, 24, 30)
	label.TextColor3 = Color3.fromRGB(235, 245, 240)
	label.Font = Enum.Font.GothamBold
	label.TextScaled = true
	label.TextWrapped = true
	label.Text = lines
	label.Parent = gui
	local pad = Instance.new("UIPadding")
	pad.PaddingLeft = UDim.new(0.05, 0)
	pad.PaddingRight = UDim.new(0.05, 0)
	pad.PaddingTop = UDim.new(0.08, 0)
	pad.PaddingBottom = UDim.new(0.08, 0)
	pad.Parent = label
end

function Room.inside(pos: Vector3, margin: number): boolean
	return math.abs(pos.X) < HALF - margin and math.abs(pos.Z) < HALF - margin
end

-- golden fruit (shop) ignores the fruit limit and counts extra when eaten
function Room.spawnFruit(avoid: { Vector3 }?, golden: boolean?)
	if #Room.foods >= Config.MAX_FOOD and not golden then
		return
	end
	local pos
	for _ = 1, 20 do
		pos = Vector3.new(math.random(-HALF + 6, HALF - 6), 0.7, math.random(-HALF + 6, HALF - 12))
		local ok = true
		for _, a in ipairs(avoid or {}) do
			if (Vector3.new(a.X, 0.7, a.Z) - pos).Magnitude < 12 then
				ok = false
			end
		end
		if ok then
			break
		end
	end
	local colors = { Color3.fromRGB(255, 205, 40), Color3.fromRGB(255, 120, 40), Color3.fromRGB(220, 40, 60) }
	local fruit = part({
		Name = "Fruit",
		Shape = Enum.PartType.Ball,
		Size = Vector3.new(1.4, 1.4, 1.4),
		Color = colors[math.random(#colors)],
		Material = Enum.Material.SmoothPlastic,
		CanCollide = false,
		Position = pos,
		Parent = workspace.FlyLab,
	})
	if golden then
		fruit.Color = Color3.fromRGB(255, 200, 30)
		fruit.Material = Enum.Material.Neon
		fruit:SetAttribute("Golden", true)
	end
	table.insert(Room.foods, fruit)
	return fruit
end

function Room.removeFruit(fruit)
	local k = table.find(Room.foods, fruit)
	if k then
		table.remove(Room.foods, k)
	end
	fruit:Destroy()
end

-- swing callback: onSwat(player, swatterPosition, lookVector)
function Room.build(onSwat, flyPositions)
	local folder = Instance.new("Folder")
	folder.Name = "FlyLab"
	folder.Parent = workspace

	Lighting.ClockTime = 14
	Lighting.Brightness = 2.5
	Lighting.OutdoorAmbient = Color3.fromRGB(150, 155, 165)

	part({
		Name = "Floor",
		Size = Vector3.new(Config.ROOM, 1, Config.ROOM),
		Position = Vector3.new(0, -0.5, 0),
		Color = Color3.fromRGB(232, 236, 228),
		Material = Enum.Material.SmoothPlastic,
		Parent = folder,
	})
	local wallColor = Color3.fromRGB(200, 225, 214)
	for _, w in ipairs({
		{ Vector3.new(Config.ROOM, Config.WALL, 1), Vector3.new(0, Config.WALL / 2, -HALF) },
		{ Vector3.new(Config.ROOM, Config.WALL, 1), Vector3.new(0, Config.WALL / 2, HALF) },
		{ Vector3.new(1, Config.WALL, Config.ROOM), Vector3.new(-HALF, Config.WALL / 2, 0) },
		{ Vector3.new(1, Config.WALL, Config.ROOM), Vector3.new(HALF, Config.WALL / 2, 0) },
	}) do
		part({ Name = "Wall", Size = w[1], Position = w[2], Color = wallColor, Parent = folder })
	end

	local spawn = Instance.new("SpawnLocation")
	spawn.Anchored = true
	spawn.Size = Vector3.new(6, 1, 6)
	spawn.Position = Vector3.new(0, 0.01, HALF - 6)
	spawn.Transparency = 1
	spawn.CanCollide = false
	spawn.Neutral = true
	spawn.Parent = folder

	local board = part({
		Name = "Sign",
		Size = Vector3.new(26, 7, 0.4),
		Position = Vector3.new(0, 5.5, -HALF + 0.8),
		Color = Color3.fromRGB(20, 24, 30),
		Parent = folder,
	})
	sign(
		board,
		Enum.NormalId.Back,
		"FLY LAB\nThis fly runs on 879 real neurons from a fruit fly's brain.\n"
			.. "Give it fruit • chase it • swat it • tickle it\nOpen 🧠 to watch its brain"
	)

	-- fruit basket: click for fruit
	local table_ = part({
		Name = "FruitTable",
		Size = Vector3.new(6, 3, 4),
		Position = Vector3.new(HALF - 6, 1.5, HALF - 8),
		Color = Color3.fromRGB(160, 110, 70),
		Material = Enum.Material.Wood,
		Parent = folder,
	})
	local basket = part({
		Name = "Basket",
		Size = Vector3.new(3, 1.2, 2.4),
		Position = table_.Position + Vector3.new(0, 2.1, 0),
		Color = Color3.fromRGB(255, 190, 60),
		Parent = folder,
	})
	local click = Instance.new("ClickDetector")
	click.MaxActivationDistance = 30
	click.Parent = basket
	click.MouseClick:Connect(function(player)
		Room.spawnFruit(flyPositions())
		Events.fire("fruit", player)
	end)
	local tag = Instance.new("BillboardGui")
	tag.Size = UDim2.fromOffset(160, 40)
	tag.StudsOffset = Vector3.new(0, 2.2, 0)
	tag.AlwaysOnTop = true
	tag.Parent = basket
	local tl = Instance.new("TextLabel")
	tl.Size = UDim2.fromScale(1, 1)
	tl.BackgroundTransparency = 1
	tl.Text = "🍌 Click for fruit"
	tl.TextColor3 = Color3.new(1, 1, 1)
	tl.TextStrokeTransparency = 0.3
	tl.Font = Enum.Font.GothamBold
	tl.TextScaled = true
	tl.Parent = tag

	-- swatter tool for every player
	local tool = Instance.new("Tool")
	tool.Name = "Swatter"
	tool.CanBeDropped = false
	tool.ToolTip = "Swing it near the fly"
	local handle = part({
		Name = "Handle",
		Anchored = false,
		CanCollide = false,
		Size = Vector3.new(0.25, 0.25, 4),
		Color = Color3.fromRGB(90, 160, 255),
		Parent = tool,
	})
	local head = part({
		Name = "Paddle",
		Anchored = false,
		CanCollide = false,
		Size = Vector3.new(1.8, 0.15, 1.8),
		Color = Color3.fromRGB(60, 120, 230),
		Transparency = 0.15,
		CFrame = handle.CFrame * CFrame.new(0, 0, -2.6),
		Parent = tool,
	})
	local weld = Instance.new("WeldConstraint")
	weld.Part0 = handle
	weld.Part1 = head
	weld.Parent = handle
	tool.Grip = CFrame.new(0, 0, 1.2)
	tool.Parent = StarterPack

	local function hook(t)
		if t:IsA("Tool") and t.Name == "Swatter" and not t:GetAttribute("Hooked") then
			t:SetAttribute("Hooked", true)
			local busy = false
			t.Activated:Connect(function()
				if busy then
					return
				end
				busy = true
				local player = Players:GetPlayerFromCharacter(t.Parent)
				local base = t.Grip
				t.Grip = base * CFrame.Angles(math.rad(70), 0, 0)
				local paddle = t:FindFirstChild("Paddle")
				if player and paddle then
					onSwat(player, paddle.Position, (paddle.Position - t.Handle.Position).Unit)
				end
				task.delay(0.25, function()
					t.Grip = base
					busy = false
				end)
			end)
		end
	end
	local function watch(player)
		player.CharacterAdded:Connect(function(char)
			char.ChildAdded:Connect(hook)
		end)
		if player.Character then
			player.Character.ChildAdded:Connect(hook)
		end
	end
	Players.PlayerAdded:Connect(watch)
	for _, p in ipairs(Players:GetPlayers()) do
		watch(p)
	end

	Room.spawnFruit(flyPositions())
	return folder
end

return Room
