-- The fly farm: a pen of flies with genes, eggs, breeding (by kids or automatic), birds that
-- dive at flies, and the gene history for the stats board.
--
-- Selection in auto-farm comes from what the flies do: parents are picked in proportion to
-- fruit eaten lately (brain-driven: blurry eyes find fruit later), a bird that catches a fly
-- makes it drop its food and hide for 2 births (brain-driven: slow jumpers fail to escape). Made-up genes have no
-- effect unless a kid gives them one ("helps" / "hurts" breeding chances).

local Shared = game:GetService("ReplicatedStorage"):WaitForChild("Shared")
local Config = require(Shared:WaitForChild("Config"))
local Genetics = require(Shared:WaitForChild("Genetics"))
local Fly = require(script.Parent:WaitForChild("Fly"))
local Room = require(script.Parent:WaitForChild("Room"))
local Events = require(script.Parent:WaitForChild("Events"))

local Farm = {}
Farm.flies = {}
Farm.eggs = {}
Farm.watched = nil -- id of the fly on the brain panel
Farm.auto = false
Farm.effects = {} -- made-up gene key -> "none" | "helps" | "hurts"
Farm.history = {}
Farm.log = {}
Farm.births = 0
Farm.changed = true
Farm.onWatch = nil -- callback(oldFly, newFly) when the watched fly changes
Farm.bonusSpace = 0 -- extra pen space (Lab Pro in the server)

function Farm.maxFlies(): number
	return Config.MAX_FLIES + Farm.bonusSpace
end

for _, g in ipairs(Genetics.GENES) do
	if g.kind == "fake" then
		Farm.effects[g.key] = "none"
	end
end

local nextId = 1
local folder

local function say(text: string)
	table.insert(Farm.log, 1, text)
	while #Farm.log > 6 do
		table.remove(Farm.log)
	end
	Farm.changed = true
end

local function snapshot()
	local genomes = {}
	for _, f in ipairs(Farm.flies) do
		table.insert(genomes, f.genome)
	end
	table.insert(Farm.history, { n = Farm.births, f = Genetics.frequencies(genomes) })
	while #Farm.history > Config.HISTORY do
		table.remove(Farm.history, 1)
	end
	Farm.changed = true
end

function Farm.get(id: number)
	for _, f in ipairs(Farm.flies) do
		if f.id == id then
			return f
		end
	end
	return nil
end

function Farm.positions(): { Vector3 }
	local out = {}
	for _, f in ipairs(Farm.flies) do
		table.insert(out, f:position())
	end
	return out
end

function Farm.watch(id: number)
	local new = Farm.get(id)
	if not new then
		return
	end
	local old = Farm.watched and Farm.get(Farm.watched)
	if old == new then
		return
	end
	if old then
		old.watched = false
		old.brain.record = false
	end
	new.watched = true
	new.brain.record = true
	Farm.watched = id
	if Farm.onWatch then
		Farm.onWatch(old, new)
	end
	Farm.changed = true
end

local function addFly(pos: Vector3, genome, gen: number)
	local f = Fly.new(nextId, pos, folder, genome, gen)
	f.born = os.clock()
	nextId += 1
	table.insert(Farm.flies, f)
	return f
end

local function retire(f)
	local k = table.find(Farm.flies, f)
	if k then
		table.remove(Farm.flies, k)
	end
	f:destroy()
	if Farm.watched == f.id then
		Farm.watched = nil
		if Farm.flies[1] then
			Farm.watch(Farm.flies[1].id)
		end
	end
	Farm.changed = true
end

-- the life cycle before hatching: egg -> larva (wiggles) -> pupa, a third of HATCH_TIME each
local STAGES = {
	{ name = "egg", size = Vector3.new(0.9, 0.9, 0.9), color = Color3.fromRGB(250, 250, 240) },
	{ name = "larva", size = Vector3.new(0.6, 0.6, 1.6), color = Color3.fromRGB(245, 240, 215) },
	{ name = "pupa", size = Vector3.new(0.75, 0.7, 1.5), color = Color3.fromRGB(150, 95, 45) },
}
local function growUp(egg: BasePart, pos: Vector3)
	local t0 = os.clock()
	local T = Config.HATCH_TIME
	while egg.Parent do
		local t = os.clock() - t0
		local stage = STAGES[math.clamp(math.floor(t / T * 3) + 1, 1, 3)]
		if egg.Name ~= stage.name then
			egg.Name = stage.name
			egg.Size = stage.size
			egg.Color = stage.color
		end
		local wiggle = stage.name == "larva" and math.sin(t * 9) * 0.35 or 0
		egg.CFrame = CFrame.new(pos.X, stage.size.Y / 2, pos.Z) * CFrame.Angles(0, wiggle, 0)
		task.wait(0.05)
	end
end

-- lay an egg from two parents; it hatches HATCH_TIME later
function Farm.breed(mom, dad, why: string?)
	if not mom or not dad or mom == dad or #Farm.eggs >= 3 then
		return false
	end
	local child, mutated = Genetics.cross(mom.genome, dad.genome)
	local gen = math.max(mom.gen, dad.gen) + 1
	local mid = (mom:position() + dad:position()) / 2
	local pos = Vector3.new(mid.X, 0.45, mid.Z)
	local egg = Instance.new("Part")
	egg.Name = "egg"
	egg.Size = Vector3.new(0.9, 0.9, 0.9)
	egg.Color = Color3.fromRGB(250, 250, 240)
	egg.Material = Enum.Material.SmoothPlastic
	egg.Anchored = true
	egg.CanCollide = false
	egg.Position = pos
	local mesh = Instance.new("SpecialMesh")
	mesh.MeshType = Enum.MeshType.Sphere
	mesh.Parent = egg
	egg.Parent = folder
	task.spawn(growUp, egg, pos)
	local record = { part = egg, genome = child, gen = gen }
	table.insert(Farm.eggs, record)
	say(string.format("🥚 #%d × #%d laid an egg%s", mom.id, dad.id, why and (" (" .. why .. ")") or ""))
	record.hatch = function()
		local k = table.find(Farm.eggs, record)
		if not k then
			return -- already hatched
		end
		table.remove(Farm.eggs, k)
		egg:Destroy()
		local baby = addFly(pos, child, gen)
		Farm.births += 1
		Events.fire("hatched", nil, baby)
		local names = {}
		for _, key in ipairs(mutated) do
			table.insert(names, Genetics.BY_KEY[key].name)
		end
		say(string.format("🐣 #%d hatched (generation %d)%s", baby.id, gen,
			#names > 0 and ("  ✨ mutation in " .. table.concat(names, ", ") .. "!") or ""))
		-- a full pen: the oldest fly flies out the window
		while #Farm.flies > Farm.maxFlies() do
			local oldest = Farm.flies[1]
			say(string.format("👋 #%d flew out the window (the pen is full)", oldest.id))
			retire(oldest)
		end
		for _, f in ipairs(Farm.flies) do
			f.eaten *= 0.6 -- breeding chances follow recent success
			if (f.scared or 0) > 0 then
				f.scared -= 1
			end
		end
		snapshot()
	end
	task.delay(Config.HATCH_TIME, record.hatch)
	return true
end

-- hatch every egg now (shop: Hatch Now)
function Farm.hatchAll(): number
	local eggs = table.clone(Farm.eggs)
	for _, record in ipairs(eggs) do
		record.hatch()
	end
	return #eggs
end

function Farm.say(text: string)
	say(text)
end

-- how likely a fly is to be picked as a parent in auto-farm
function Farm.weight(f): number
	local w = (1 + f.eaten) * ((f.scared or 0) > 0 and 0.2 or 1)
	for key, effect in pairs(Farm.effects) do
		if effect ~= "none" and Genetics.shows(f.genome, key) then
			w *= effect == "helps" and Config.EFFECT_HELPS or Config.EFFECT_HURTS
		end
	end
	return w
end

local function pickParent(except)
	local total = 0
	for _, f in ipairs(Farm.flies) do
		if f ~= except then
			total += Farm.weight(f)
		end
	end
	local x = math.random() * total
	for _, f in ipairs(Farm.flies) do
		if f ~= except then
			x -= Farm.weight(f)
			if x <= 0 then
				return f
			end
		end
	end
	return nil
end

function Farm.autoBreed()
	if #Farm.flies < 2 then
		return
	end
	local mom = pickParent(nil)
	local dad = pickParent(mom)
	Farm.breed(mom, dad, "auto-farm")
end

function Farm.implant(f, key: string)
	if f and Genetics.implant(f.genome, key) then
		-- the new gene shows on its body: rebuild the fly in place
		local pos, watched = f:position(), f.watched
		local k = table.find(Farm.flies, f)
		f:destroy()
		local g = Fly.new(f.id, pos, folder, f.genome, f.gen)
		g.born, g.eaten, g.caught, g.scared = f.born, f.eaten, f.caught, f.scared
		g.cf = f.cf
		Farm.flies[k] = g
		if watched then
			Farm.watched = nil
			Farm.watch(g.id)
		end
		say(string.format("💉 implanted %s into #%d", Genetics.BY_KEY[key].name, f.id))
		snapshot()
		return true
	end
	return false
end

-- a bird's shadow dives at one fly; escaping is up to its brain
function Farm.bird()
	local targets = {}
	for _, f in ipairs(Farm.flies) do
		if f.state == "walk" or f.state == "eat" then
			table.insert(targets, f)
		end
	end
	if #targets == 0 then
		return
	end
	local f = targets[math.random(#targets)]
	local at = f:position()
	local from = at + Vector3.new(math.random(-6, 6), 0, math.random(-6, 6))
	local shadow = Instance.new("Part")
	shadow.Name = "BirdShadow"
	shadow.Shape = Enum.PartType.Cylinder
	shadow.Size = Vector3.new(0.1, 4, 4)
	shadow.Color = Color3.new(0, 0, 0)
	shadow.Transparency = 0.45
	shadow.Anchored = true
	shadow.CanCollide = false
	shadow.CFrame = CFrame.new(from.X, 0.06, from.Z) * CFrame.Angles(0, 0, math.rad(90))
	shadow.Parent = folder
	local id = f.id
	local hit = false
	f:swatted(at, function()
		hit = true
		f.eaten = 0
		f.scared = 2 -- too scared to breed for the next 2 births
		say(string.format("🐦 a bird dove at #%d: caught! It dropped its food and hides", id))
	end)
	task.delay(Config.SWAT_DELAY + 0.05, function()
		if not hit and not f.dead then
			say(string.format("🐦 a bird dove at #%d: it escaped!", id))
		end
	end)
	-- the shadow sweeps over the spot, then leaves
	task.spawn(function()
		local t0 = os.clock()
		while os.clock() - t0 < 0.9 do
			local u = (os.clock() - t0) / 0.9
			local p = from:Lerp(at + (at - from), u)
			shadow.CFrame = CFrame.new(p.X, 0.06, p.Z) * CFrame.Angles(0, 0, math.rad(90))
			task.wait()
		end
		shadow:Destroy()
	end)
end

function Farm.state()
	local flies = {}
	for _, f in ipairs(Farm.flies) do
		local genes = {}
		for _, g in ipairs(Genetics.GENES) do
			genes[g.key] = f.genome[g.key][1] .. f.genome[g.key][2]
		end
		table.insert(flies, {
			id = f.id,
			gen = f.gen,
			eaten = math.floor(f.eaten * 10 + 0.5) / 10,
			caught = f.caught,
			scared = (f.scared or 0) > 0,
			genes = genes,
			weight = math.floor(Farm.weight(f) * 10 + 0.5) / 10,
		})
	end
	return {
		watched = Farm.watched,
		auto = Farm.auto,
		effects = Farm.effects,
		flies = flies,
		eggs = #Farm.eggs,
		history = Farm.history,
		log = Farm.log,
		births = Farm.births,
	}
end

function Farm.start(parent: Instance)
	folder = parent
	for k = 1, Config.FLIES do
		local a = (k - 1) / Config.FLIES * math.pi * 2
		local pos = Config.FLIES == 1 and Vector3.new(0, 0, -4) or Vector3.new(math.cos(a) * 16, 0, math.sin(a) * 16 - 4)
		addFly(pos, Genetics.random(Config.START_VARIANTS), 0)
	end
	Farm.watch(Farm.flies[1].id)
	snapshot()
	say("Welcome to the fly farm! Each fly has two copies of every gene.")

	-- auto-farm clock
	task.spawn(function()
		local nextBreed, nextBird, nextFruit = Config.BREED_EVERY, Config.BIRD_EVERY[1], 0
		local t = 0
		while true do
			local dt = task.wait(0.25)
			if Farm.auto then
				t += dt
				if t >= nextFruit then
					Room.spawnFruit(Farm.positions())
					nextFruit = t + Config.FRUIT_EVERY
				end
				if t >= nextBird then
					Farm.bird()
					nextBird = t + Config.BIRD_EVERY[1] + math.random() * (Config.BIRD_EVERY[2] - Config.BIRD_EVERY[1])
				end
				if t >= nextBreed then
					Farm.autoBreed()
					nextBreed = t + Config.BREED_EVERY
				end
			end
		end
	end)
end

return Farm
