-- The fly's body: anchored parts placed every frame from one CFrame (front = -Z, up = +Y).
-- Parts only; no meshes or uploaded assets needed for the prototype.

local FlyBody = {}
FlyBody.__index = FlyBody

local BODY = Color3.fromRGB(58, 52, 46)
local EYE = Color3.fromRGB(200, 30, 30)
local WING = Color3.fromRGB(215, 235, 255)

local function blob(model, name, size, color, sphere)
	local p = Instance.new("Part")
	p.Name = name
	p.Size = size
	p.Color = color
	p.Anchored = true
	p.CanCollide = false
	p.CastShadow = true
	p.TopSurface = Enum.SurfaceType.Smooth
	p.BottomSurface = Enum.SurfaceType.Smooth
	if sphere then
		local m = Instance.new("SpecialMesh")
		m.MeshType = Enum.MeshType.Sphere
		m.Parent = p
	end
	p.Parent = model
	return p
end

local GOLD = Color3.fromRGB(214, 160, 50)
local WHITE_EYE = Color3.fromRGB(245, 245, 240)
local STRIPE = Color3.fromRGB(255, 110, 200)

-- look: the phenotype from Genetics.phenotype (gold, whiteEyes, glow, stripes, sparkle); optional
function FlyBody.new(name: string, look)
	look = look or {}
	local self = setmetatable({}, FlyBody)
	local model = Instance.new("Model")
	model.Name = name
	self.model = model
	self.parts = {}
	self.cframes = {}
	local body = look.gold and GOLD or BODY
	local eye = look.whiteEyes and WHITE_EYE or EYE

	local thorax = blob(model, "Thorax", Vector3.new(1.3, 1.1, 1.5), body, true)
	model.PrimaryPart = thorax
	self.thorax = thorax
	local abdomen = blob(model, "Abdomen", Vector3.new(1.15, 0.95, 1.9), body, true)
	-- fixed parts: { part, offset }
	self.fixed = {
		{ thorax, CFrame.new(0, 0, 0) },
		{ abdomen, CFrame.new(0, -0.05, 1.45) },
		{ blob(model, "Head", Vector3.new(1.0, 0.85, 0.75), body, true), CFrame.new(0, 0.1, -1.05) },
		{ blob(model, "EyeL", Vector3.new(0.5, 0.6, 0.5), eye, true), CFrame.new(-0.42, 0.2, -1.15) },
		{ blob(model, "EyeR", Vector3.new(0.5, 0.6, 0.5), eye, true), CFrame.new(0.42, 0.2, -1.15) },
	}
	if look.stripes then
		for _, z in ipairs({ 1.15, 1.75 }) do
			local ring = blob(model, "Stripe", Vector3.new(1.18, 0.9, 0.22), STRIPE, true)
			table.insert(self.fixed, { ring, CFrame.new(0, -0.03, z) })
		end
	end
	if look.rainbow then
		self.fixed[1][1].Color = Color3.fromRGB(240, 70, 70) -- thorax
		abdomen.Color = Color3.fromRGB(70, 120, 240)
		self.fixed[3][1].Color = Color3.fromRGB(250, 210, 60) -- head
	end
	if look.spots then
		for _, o in ipairs({ { -0.3, 0.38, 1.1 }, { 0.32, 0.36, 1.5 }, { -0.1, 0.4, 1.9 }, { 0.2, 0.42, 0.95 } }) do
			local dot = blob(model, "Spot", Vector3.new(0.26, 0.12, 0.26), Color3.fromRGB(20, 20, 24), true)
			table.insert(self.fixed, { dot, CFrame.new(o[1], o[2], o[3]) })
		end
	end
	if look.glow then
		abdomen.Material = Enum.Material.Neon
		abdomen.Color = Color3.fromRGB(120, 255, 140)
		local light = Instance.new("PointLight")
		light.Color = Color3.fromRGB(120, 255, 140)
		light.Range = 10
		light.Brightness = 2
		light.Parent = abdomen
	end
	if look.sparkle then
		local sp = Instance.new("Sparkles")
		sp.SparkleColor = Color3.fromRGB(190, 150, 255)
		sp.Parent = thorax
	end
	-- wings hinge at the thorax top
	self.wings = {}
	for _, side in ipairs({ -1, 1 }) do
		local w = blob(model, side < 0 and "WingL" or "WingR", Vector3.new(0.9, 0.05, 2.2), WING, false)
		w.Transparency = 0.45
		w.Material = Enum.Material.Glass
		table.insert(self.wings, { w, side })
	end
	-- six legs: front, middle, hind on each side
	self.legs = {}
	for _, side in ipairs({ -1, 1 }) do
		for k, z in ipairs({ -0.45, 0.05, 0.55 }) do
			local l = blob(model, "Leg", Vector3.new(1.25, 0.11, 0.11), BODY, false)
			table.insert(self.legs, { l, side, z, k })
		end
	end
	return self
end

-- state: "walk" | "eat" | "groom" | "flight" | "dizzy"; t: seconds since start (for animation)
function FlyBody:pose(cf: CFrame, state: string, t: number)
	local parts, cfs = self.parts, self.cframes
	table.clear(parts)
	table.clear(cfs)
	for _, f in ipairs(self.fixed) do
		parts[#parts + 1] = f[1]
		cfs[#cfs + 1] = cf * f[2]
	end
	local flap = state == "flight" and math.sin(t * 55) * 0.9 or 0
	for _, w in ipairs(self.wings) do
		local side = w[2]
		local spread = state == "flight" and 0.35 or 0.12
		parts[#parts + 1] = w[1]
		cfs[#cfs + 1] = cf
			* CFrame.new(side * 0.25, 0.55, 0.15)
			* CFrame.Angles(0, -side * spread, side * flap)
			* CFrame.new(side * 0.35, 0, 0.95)
	end
	for _, l in ipairs(self.legs) do
		local part, side, z, k = l[1], l[2], l[3], l[4]
		local yaw, droop = side * (k - 2) * -0.45, 0.55
		if state == "walk" then
			yaw += math.sin(t * 11 + k * 2.1 + (side > 0 and math.pi or 0)) * 0.3
		elseif state == "groom" and k == 1 then
			yaw, droop = side * 1.1 + math.sin(t * 14) * 0.35, -0.15 -- front legs up, rubbing
		elseif state == "flight" then
			droop = 1.0
		elseif state == "dizzy" then
			yaw += math.sin(t * 6 + k) * 0.5
		end
		parts[#parts + 1] = part
		cfs[#cfs + 1] = cf
			* CFrame.new(side * 0.4, -0.3, z)
			* CFrame.Angles(0, yaw, -side * droop)
			* CFrame.new(side * 0.6, 0, 0)
	end
	workspace:BulkMoveTo(parts, cfs, Enum.BulkMoveMode.FireCFrameChanged)
end

function FlyBody:destroy()
	self.model:Destroy()
end

return FlyBody
