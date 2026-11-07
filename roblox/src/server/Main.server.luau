-- Fly Lab prototype: one room, a farm of connectome flies with genes, a brain panel for the
-- watched fly and a genes panel with the stats board.

local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared:WaitForChild("Config"))
local FlyBrain = require(Shared:WaitForChild("FlyBrain"))
local Genetics = require(Shared:WaitForChild("Genetics"))
local Room = require(script.Parent:WaitForChild("Room"))
local Farm = require(script.Parent:WaitForChild("Farm"))
local Events = require(script.Parent:WaitForChild("Events"))
local Lessons = require(script.Parent:WaitForChild("Lessons"))
local Shop = require(script.Parent:WaitForChild("Shop"))

local remotes = Instance.new("Folder")
remotes.Name = "FlyLabRemotes"
local function remote(name)
	local r = Instance.new("RemoteEvent")
	r.Name = name
	r.Parent = remotes
	return r
end
local brainEvent = remote("Brain")
local experimentEvent = remote("Experiment")
local farmEvent = remote("Farm")
remotes.Parent = ReplicatedStorage

FlyBrain.baseline()

local function onSwat(player, pos: Vector3, _look: Vector3)
	for _, f in ipairs(Farm.flies) do
		f:swatted(pos, nil, player)
	end
end

local folder = Room.build(onSwat, Farm.positions)

-- experiments: switch off parts of the watched fly's brain (a shared lab: anyone can toggle)
local EXPERIMENTS = {
	loom = { "in_loom_L", "in_loom_R" }, -- looming detectors LC4 / LPLC2
	escape = { "escape" }, -- giant fibre DNp01
	steer = { "steer_L", "steer_R" }, -- steering DNa02
	groom = { "groom" }, -- grooming DNg12
	target = { "in_target_L", "in_target_R" }, -- small-object detectors LC10a
}
local off = {}
local function applyExperiments(fly, on: boolean)
	if not fly then
		return
	end
	for key in pairs(off) do
		for _, g in ipairs(EXPERIMENTS[key]) do
			fly.brain:silence(g, on)
		end
	end
end
Farm.onWatch = function(old, new)
	applyExperiments(old, false) -- the switches follow the watched fly
	applyExperiments(new, true)
end
experimentEvent.OnServerEvent:Connect(function(player, key, on)
	local groups = EXPERIMENTS[key]
	if type(groups) ~= "table" or type(on) ~= "boolean" then
		return
	end
	off[key] = on or nil
	if on then
		Events.fire("exp_" .. key, player)
	end
	local fly = Farm.watched and Farm.get(Farm.watched)
	if fly then
		for _, g in ipairs(groups) do
			fly.brain:silence(g, on)
		end
	end
end)

Farm.start(folder)
Lessons.start(remotes)
Shop.start(remotes)

-- farm actions from the genes panel; every argument is checked
local lastBreed = 0
farmEvent.OnServerEvent:Connect(function(player, action, a, b)
	if action == "watch" and type(a) == "number" then
		Farm.watch(a)
	elseif action == "breed" and type(a) == "number" and type(b) == "number" then
		if os.clock() - lastBreed > 2 then
			if Farm.breed(Farm.get(a), Farm.get(b)) then
				lastBreed = os.clock()
				Events.fire("bred", player)
			end
		end
	elseif action == "implant" and type(a) == "number" and type(b) == "string" then
		local gene = Genetics.BY_KEY[b]
		if gene and gene.kit and not Shop.owns(player, "GENE_KIT") then
			return -- Gene Kit genes: owners only
		end
		if Farm.implant(Farm.get(a), b) then
			Events.fire("implanted", player)
		end
	elseif action == "effect" and type(a) == "string" and Farm.effects[a] and (b == "none" or b == "helps" or b == "hurts") then
		Farm.effects[a] = b
		Farm.changed = true
		Events.fire("effect", player)
	elseif action == "auto" and type(a) == "boolean" then
		Farm.auto = a
		Farm.changed = true
		if a then
			Events.fire("auto_on", player)
		end
	elseif action == "bird" then
		Farm.bird()
	end
end)

-- new players get the farm right away
Players.PlayerAdded:Connect(function(p)
	task.wait(2)
	farmEvent:FireClient(p, Farm.state())
end)

-- brain clock: 50 steps per second of game time, all flies in lock-step
local acc, brainTime, brainSteps, sendAcc, farmAcc, reportAcc = 0, 0, 0, 0, 0, 0
local STEP = 1 / Config.BRAIN_HZ

RunService.Heartbeat:Connect(function(dt)
	local roots = {}
	for _, p in ipairs(Players:GetPlayers()) do
		local root = p.Character and p.Character:FindFirstChild("HumanoidRootPart")
		if root then
			table.insert(roots, root)
		end
	end

	acc = math.min(acc + dt, STEP * Config.MAX_STEPS_PER_FRAME)
	local t0 = os.clock()
	local flies = table.clone(Farm.flies)
	while acc >= STEP do
		acc -= STEP
		for _, f in ipairs(flies) do
			if not f.dead then
				f:brainStep(roots)
			end
		end
		brainSteps += 1
	end
	brainTime += os.clock() - t0

	for _, f in ipairs(flies) do
		if not f.dead then
			f:update(dt)
		end
	end

	sendAcc += dt
	local f = Farm.watched and Farm.get(Farm.watched)
	if sendAcc >= 0.1 and f then
		sendAcc = 0
		local r = f.r
		local pheno = Genetics.phenotype(f.genome)
		brainEvent:FireAllClients(f.brain:takeRecent(), {
			id = f.id,
			action = f.action,
			escape = r.escape,
			steerL = r.steerL,
			steerR = r.steerR,
			groom = r.groom,
			off = off,
			targetGain = pheno.targetGain,
			loomGain = pheno.loomGain,
		})
	end

	farmAcc += dt
	if farmAcc >= 1 or (Farm.changed and farmAcc >= 0.2) then
		farmAcc = 0
		Farm.changed = false
		farmEvent:FireAllClients(Farm.state())
	end

	reportAcc += dt
	if reportAcc >= 10 then
		print(string.format(
			"[FlyLab] %d flies, %d brain steps in %.1f s: brains used %.1f ms (%.1f%% of the server frame time)",
			#Farm.flies,
			brainSteps,
			reportAcc,
			brainTime * 1000,
			100 * brainTime / reportAcc
		))
		reportAcc, brainTime, brainSteps = 0, 0, 0
	end
end)

print(string.format("[FlyLab] ready: %d flies, %d neurons each", #Farm.flies, FlyBrain.N))
