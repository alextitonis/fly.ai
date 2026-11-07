-- One fly: senses -> FlyBrain -> body.
-- The brain decides: turning toward fruit (LC10a -> DNa02), escaping a looming hand or swatter
-- (LC4/LPLC2 -> DNp01), grooming when its eyes are touched (BM_InOm -> DNg12), backing up (MDN).
-- Body rules (not the brain): it walks at a steady pace, turns back at walls, eats fruit it
-- reaches, and how a take-off flight or being swatted looks.

local Shared = game:GetService("ReplicatedStorage"):WaitForChild("Shared")
local FlyBrain = require(Shared:WaitForChild("FlyBrain"))
local Config = require(Shared:WaitForChild("Config"))
local FlyBody = require(script.Parent:WaitForChild("FlyBody"))
local Room = require(script.Parent:WaitForChild("Room"))
local Genetics = require(Shared:WaitForChild("Genetics"))
local ShopItems = require(Shared:WaitForChild("ShopItems"))
local Events = require(script.Parent:WaitForChild("Events"))

local Fly = {}
Fly.__index = Fly

local DT = FlyBrain.DT
local STIM = FlyBrain.STIM
local GROUND = 0.95

local LABELS = {
	walk = "",
	turnL = "↰ turning left",
	turnR = "↱ turning right",
	eat = "🍌 eating",
	groom = "🧼 grooming",
	flight = "💨 escape!",
	dizzy = "😵 swatted",
	back = "⏪ backing up",
}

local function flat(v: Vector3): Vector3
	return Vector3.new(v.X, 0, v.Z)
end

-- genome: from Genetics (nil = all normal); gen: generation number
function Fly.new(id: number, pos: Vector3, parent: Instance, genome, gen: number?)
	local self = setmetatable({}, Fly)
	self.id = id
	self.genome = genome or Genetics.random()
	self.pheno = Genetics.phenotype(self.genome)
	self.gen = gen or 0
	self.eaten = 0 -- fruit eaten lately (decays at each birth in the farm)
	self.caught = 0
	self.watched = false
	self.brain = FlyBrain.new()
	self.body = FlyBody.new("Fly" .. id, self.pheno)
	self.body.model.Parent = parent
	self.cf = CFrame.new(pos.X, GROUND, pos.Z) * CFrame.Angles(0, math.random() * math.pi * 2, 0)
	self.state = "walk"
	self.stateT = 0
	self.t = 0
	self.pulses = {} -- { group, amount, stepsLeft }
	self.prevDist = setmetatable({}, { __mode = "k" })
	self.threat = nil -- last place something loomed from
	self.target = nil
	self.action = "walk"
	self.r = self.brain:readout()

	local label = Instance.new("BillboardGui")
	label.Size = UDim2.fromOffset(180, 36)
	label.StudsOffset = Vector3.new(0, 2.6, 0)
	label.AlwaysOnTop = true
	label.Parent = self.body.thorax
	local text = Instance.new("TextLabel")
	text.Size = UDim2.fromScale(1, 1)
	text.BackgroundTransparency = 1
	text.TextColor3 = Color3.new(1, 1, 1)
	text.TextStrokeTransparency = 0.3
	text.Font = Enum.Font.GothamBold
	text.TextScaled = true
	text.Text = ""
	text.Parent = label
	self.label = text

	local prompt = Instance.new("ProximityPrompt")
	prompt.ActionText = "Tickle its eyes"
	prompt.ObjectText = "Fly"
	prompt.HoldDuration = 0
	prompt.MaxActivationDistance = 9
	prompt.RequiresLineOfSight = false
	prompt.Parent = self.body.thorax
	prompt.Triggered:Connect(function(player)
		self:pulse("in_touch", STIM, Config.TICKLE_STEPS)
		Events.fire("tickle", player, self)
	end)
	self.body:pose(self.cf, self.state, 0)
	return self
end

function Fly:position(): Vector3
	return self.cf.Position
end

-- hold a stimulus on a sense group for some brain steps
function Fly:pulse(group: string, amount: number, steps: number)
	table.insert(self.pulses, { group, amount, steps })
end

-- where something is, seen from the fly: distance on the floor, and angle (+ = to its left)
function Fly:relative(p: Vector3): (number, number)
	local rel = self.cf:PointToObjectSpace(p)
	return Vector2.new(rel.X, rel.Z).Magnitude, math.atan2(-rel.X, -rel.Z)
end

-- something looming from point p: the eye on that side sees it
function Fly:loomFrom(p: Vector3, steps: number)
	local _, a = self:relative(p)
	self:pulse(a >= 0 and "in_loom_L" or "in_loom_R", STIM * self.pheno.loomGain, steps)
	self.threat = p
end

-- one 20 ms brain step: senses in, network update
function Fly:brainStep(roots: { BasePart })
	local brain = self.brain
	for k = #self.pulses, 1, -1 do
		local p = self.pulses[k]
		brain:stimulate(p[1], p[2])
		p[3] -= 1
		if p[3] <= 0 then
			table.remove(self.pulses, k)
		end
	end

	-- vision: the nearest fruit in view excites the small-object detectors (LC10a) on its side
	self.target = nil
	if self.state == "walk" then
		local best, bestD, bestA = nil, Config.SIGHT, 0
		for _, fruit in ipairs(Room.foods) do
			local d, a = self:relative(fruit.Position)
			if d < bestD and math.abs(a) < Config.FOV then
				best, bestD, bestA = fruit, d, a
			end
		end
		self.target = best
		if best and math.abs(bestA) > Config.AHEAD then
			-- closer fruit looks bigger: stronger drive
			local amount = STIM * math.clamp(1.25 - bestD / Config.SIGHT, 0.45, 1) * self.pheno.targetGain
			brain:stimulate(bestA > 0 and "in_target_L" or "in_target_R", amount)
		end
	end

	-- looming: a player rushing at the fly
	for _, root in ipairs(roots) do
		local d = (flat(root.Position) - flat(self.cf.Position)).Magnitude
		local prev = self.prevDist[root]
		self.prevDist[root] = d
		if prev and d < Config.LOOM_RANGE and (prev - d) / DT > Config.LOOM_SPEED then
			self:loomFrom(root.Position, 1)
		end
	end

	brain:step()
end

function Fly:setState(s: string)
	self.state = s
	self.stateT = 0
end

-- a swatter swing (or a diving bird) at position p; the hit lands SWAT_DELAY later unless the
-- fly has escaped. onHit(fly) is called if it lands.
function Fly:swatted(p: Vector3, onHit: ((any) -> ())?, player: Player?)
	local d = (flat(p) - flat(self.cf.Position)).Magnitude
	if d > Config.SWAT_RANGE or self.dead then
		return
	end
	self:loomFrom(p, 12)
	task.delay(Config.SWAT_DELAY, function()
		if self.dead then
			return
		end
		if self.state ~= "flight" and (flat(p) - flat(self.cf.Position)).Magnitude < Config.SWAT_HIT then
			self:setState("dizzy")
			self.pulses = {}
			self.caught += 1
			if player then
				Events.fire("swat_hit", player, self)
			end
			if onHit then
				onHit(self)
			end
		end
	end)
end

function Fly:destroy()
	self.dead = true
	self.body:destroy()
end

-- every frame: read the brain, move the body
function Fly:update(dt: number)
	self.t += dt
	self.stateT += dt
	local r = self.brain:readout()
	self.r = r
	local cf = self.cf
	local s = self.state
	local action = s

	if s == "dizzy" then
		cf = cf * CFrame.Angles(0, dt * 5, 0)
		if self.stateT > Config.DIZZY_TIME then
			self:setState("walk")
		end
	elseif s == "flight" then
		local T = Config.FLIGHT_TIME
		local u = math.min(self.stateT / T, 1)
		local pos = cf.Position + self.fleeDir * Config.FLIGHT_SPEED * dt
		if not Room.inside(pos, 2.5) then
			pos = Vector3.new(
				math.clamp(pos.X, -Config.ROOM / 2 + 2.5, Config.ROOM / 2 - 2.5),
				pos.Y,
				math.clamp(pos.Z, -Config.ROOM / 2 + 2.5, Config.ROOM / 2 - 2.5)
			)
		end
		local y = GROUND + Config.FLIGHT_HEIGHT * math.sin(math.pi * u)
		cf = CFrame.lookAt(Vector3.new(pos.X, y, pos.Z), Vector3.new(pos.X, y, pos.Z) + self.fleeDir)
		if u >= 1 then
			self:setState("walk")
		end
	elseif r.escape > Config.ESCAPE_AT then
		-- the giant fibre fired: jump away from the threat
		local away = self.threat and flat(cf.Position - self.threat) or flat(-cf.LookVector)
		if away.Magnitude < 0.1 then
			away = flat(-cf.LookVector)
		end
		self.fleeDir = away.Unit
		self:setState("flight")
		action = "flight"
		Events.fire("escaped", nil, self)
	elseif s == "groom" then
		if self.stateT > 1.2 and r.groom < Config.GROOM_AT * 0.5 then
			self:setState("walk")
		end
	elseif r.groom > Config.GROOM_AT then
		self:setState("groom")
		action = "groom"
		Events.fire("groomed", nil, self)
	elseif s == "eat" then
		local fruit = self.eating
		if fruit and fruit.Parent then
			local k = 1 - self.stateT / Config.EAT_TIME
			fruit.Size = Vector3.one * math.max(1.4 * k, 0.2)
		end
		if self.stateT > Config.EAT_TIME then
			if fruit and fruit.Parent then
				self.eaten += fruit:GetAttribute("Golden") and ShopItems.GOLDEN_WORTH or 1
				Room.removeFruit(fruit)
				Events.fire("ate", nil, self)
			end
			self.eating = nil
			self:setState("walk")
		end
	else
		-- walking: the brain steers
		local turn = math.clamp(Config.TURN_GAIN * (r.steerL - r.steerR), -Config.MAX_TURN, Config.MAX_TURN)
		local speed = Config.WALK_SPEED
		if r.back > Config.BACK_AT then
			speed = -Config.BACK_SPEED
			action = "back"
		elseif turn > 0.6 then
			action = "turnL"
		elseif turn < -0.6 then
			action = "turnR"
		else
			action = "walk"
		end
		-- body rule: at a wall, turn back toward the middle
		if not Room.inside(cf.Position + cf.LookVector * 3, 2) then
			local _, a = self:relative(Vector3.zero)
			turn = a > 0 and 2.5 or -2.5
		end
		cf = cf * CFrame.Angles(0, turn * dt, 0)
		cf = cf + flat(cf.LookVector).Unit * speed * dt
		cf = CFrame.new(cf.Position.X, GROUND, cf.Position.Z) * (cf - cf.Position)
		-- reached fruit: eat
		local fruit = self.target
		if fruit and fruit.Parent and (flat(fruit.Position) - flat(cf.Position)).Magnitude < Config.EAT_DIST then
			self.eating = fruit
			self:setState("eat")
			action = "eat"
		end
	end

	if self.state ~= "flight" and cf.Position.Y ~= GROUND then
		local look = flat(cf.LookVector)
		look = look.Magnitude > 0.01 and look.Unit or Vector3.new(0, 0, -1)
		cf = CFrame.lookAt(Vector3.new(cf.Position.X, GROUND, cf.Position.Z), Vector3.new(cf.Position.X, GROUND, cf.Position.Z) + look)
	end
	self.cf = cf
	if self.watched and (action == "turnL" or action == "turnR") and self.action ~= action then
		Events.fire("turned", nil, self)
	end
	self.action = action
	local tag = (self.watched and "👁 " or "") .. "#" .. self.id
	local doing = LABELS[action] or ""
	self.label.Text = doing ~= "" and (tag .. "  " .. doing) or tag
	self.body:pose(cf, self.state, self.t)
end

return Fly
