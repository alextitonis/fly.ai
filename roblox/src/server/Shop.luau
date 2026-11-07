-- The shop: Game Passes (kept forever) and Developer Products (used up), all fixed items from
-- ShopItems. Purchases go through Roblox's own buy prompt. Developer Product receipts are
-- recorded so a purchase is never granted twice (Roblox can resend a receipt).

local Players = game:GetService("Players")
local MarketplaceService = game:GetService("MarketplaceService")
local DataStoreService = game:GetService("DataStoreService")
local RunService = game:GetService("RunService")

local Shared = game:GetService("ReplicatedStorage"):WaitForChild("Shared")
local ShopItems = require(Shared:WaitForChild("ShopItems"))
local Farm = require(script.Parent:WaitForChild("Farm"))
local Room = require(script.Parent:WaitForChild("Room"))

local Shop = {}

local ITEMS = {} -- key -> item, with .kind = "pass" | "product"
local BY_PASS, BY_PRODUCT = {}, {}
for _, it in ipairs(ShopItems.passes) do
	it.kind = "pass"
	ITEMS[it.key] = it
	if it.id ~= 0 then
		BY_PASS[it.id] = it
	end
end
for _, it in ipairs(ShopItems.products) do
	it.kind = "product"
	ITEMS[it.key] = it
	if it.id ~= 0 then
		BY_PRODUCT[it.id] = it
	end
end

local owned = {} -- [player] = { [passKey] = true }
local prices = {} -- key -> real price from Roblox, once loaded
local remote
local receipts
do
	local ok, ds = pcall(function()
		return DataStoreService:GetDataStore("FlyLabReceipts_v1")
	end)
	receipts = ok and ds or nil
end

function Shop.owns(player: Player, key: string): boolean
	return owned[player] ~= nil and owned[player][key] == true
end

local function send(player: Player, notice: string?)
	if not remote then
		return
	end
	remote:FireClient(player, {
		owned = owned[player] or {},
		prices = prices,
		studio = RunService:IsStudio(),
		onSale = (function()
			local t = {}
			for key, it in pairs(ITEMS) do
				t[key] = it.id ~= 0
			end
			return t
		end)(),
		notice = notice,
	})
end

-- Lab Pro: the pen is bigger while any owner is in the server
local function refreshPenSpace()
	local any = false
	for _, p in ipairs(Players:GetPlayers()) do
		if Shop.owns(p, "LAB_PRO") then
			any = true
		end
	end
	local bonus = any and ShopItems.PRO_SPACE or 0
	if Farm.bonusSpace ~= bonus then
		Farm.bonusSpace = bonus
		Farm.say(bonus > 0 and string.format("🏆 A Lab Pro is here: the pen holds %d flies", Farm.maxFlies())
			or string.format("The pen holds %d flies", Farm.maxFlies()))
	end
end

local function dressUp(player: Player)
	local char = player.Character
	if not char then
		return
	end
	local head = char:FindFirstChild("Head")
	local torso = char:FindFirstChild("UpperTorso") or char:FindFirstChild("Torso")
	-- name tag: Pro / Scientist
	local old = head and head:FindFirstChild("FlyLabTag")
	if old then
		old:Destroy()
	end
	local tags = {}
	if Shop.owns(player, "LAB_PRO") then
		table.insert(tags, "🏆 Pro")
	end
	if Shop.owns(player, "LAB_COAT") then
		table.insert(tags, "🥼 Scientist")
	end
	if head and #tags > 0 then
		local bb = Instance.new("BillboardGui")
		bb.Name = "FlyLabTag"
		bb.Size = UDim2.fromOffset(160, 26)
		bb.StudsOffset = Vector3.new(0, 2.4, 0)
		bb.Parent = head
		local l = Instance.new("TextLabel")
		l.Size = UDim2.fromScale(1, 1)
		l.BackgroundTransparency = 1
		l.Text = table.concat(tags, "  ")
		l.TextColor3 = Color3.fromRGB(255, 235, 150)
		l.TextStrokeTransparency = 0.3
		l.Font = Enum.Font.GothamBold
		l.TextScaled = true
		l.Parent = bb
	end
	-- lab coat
	if torso and Shop.owns(player, "LAB_COAT") and not char:FindFirstChild("LabCoat") then
		local coat = Instance.new("Part")
		coat.Name = "LabCoat"
		coat.Size = torso.Size + Vector3.new(0.25, 0.9, 0.25)
		coat.Color = Color3.fromRGB(245, 248, 250)
		coat.Material = Enum.Material.Fabric
		coat.CanCollide = false
		coat.Massless = true
		coat.CFrame = torso.CFrame * CFrame.new(0, -0.35, 0)
		local weld = Instance.new("WeldConstraint")
		weld.Part0 = torso
		weld.Part1 = coat
		weld.Parent = coat
		coat.Parent = char
	end
end

local function grantPass(player: Player, it)
	owned[player] = owned[player] or {}
	if owned[player][it.key] then
		return
	end
	owned[player][it.key] = true
	if it.key == "LAB_PRO" then
		refreshPenSpace()
	end
	dressUp(player)
	send(player, string.format("%s %s is yours!", it.icon, it.name))
end

-- what each Developer Product does
local PRODUCT_EFFECTS = {
	HATCH_NOW = function(_player)
		local n = Farm.hatchAll()
		Farm.say(n > 0 and string.format("🐣 Hatch Now! %d egg%s hatched at once", n, n == 1 and "" or "s")
			or "🐣 Hatch Now: there were no eggs, so here's a fresh one!")
		if n == 0 and #Farm.flies >= 2 then
			Farm.breed(Farm.flies[1], Farm.flies[2], "Hatch Now")
			Farm.hatchAll()
		end
	end,
	GOLDEN_FRUIT = function(_player)
		for _ = 1, 3 do
			Room.spawnFruit(Farm.positions(), true)
		end
		Farm.say("🍯 3 golden fruits dropped in! Each counts as 3 for breeding")
	end,
}
Shop._effects = PRODUCT_EFFECTS

-- Roblox calls this for every Developer Product purchase, maybe more than once per purchase
local function processReceipt(receipt)
	local player = Players:GetPlayerByUserId(receipt.PlayerId)
	local it = BY_PRODUCT[receipt.ProductId]
	if not player or not it then
		return Enum.ProductPurchaseDecision.NotProcessedYet
	end
	local effect = PRODUCT_EFFECTS[it.key]
	if not receipts then
		-- no DataStore (e.g. Studio without API access): grant without the duplicate check
		local ok = pcall(effect, player)
		return ok and Enum.ProductPurchaseDecision.PurchaseGranted or Enum.ProductPurchaseDecision.NotProcessedYet
	end
	local granted = false
	local ok = pcall(function()
		receipts:UpdateAsync(receipt.PurchaseId, function(already)
			if already then
				granted = true -- granted before: don't do it again
				return nil
			end
			local done = pcall(effect, player)
			if not done then
				return nil
			end
			granted = true
			return true
		end)
	end)
	if ok and granted then
		send(player, string.format("%s %s!", it.icon, it.name))
		return Enum.ProductPurchaseDecision.PurchaseGranted
	end
	return Enum.ProductPurchaseDecision.NotProcessedYet
end
Shop._processReceipt = processReceipt

local function loadOwned(player: Player)
	owned[player] = owned[player] or {}
	for _, it in ipairs(ShopItems.passes) do
		if it.id ~= 0 then
			local ok, has = pcall(function()
				return MarketplaceService:UserOwnsGamePassAsync(player.UserId, it.id)
			end)
			if ok and has then
				owned[player][it.key] = true
			end
		end
	end
	refreshPenSpace()
	send(player)
	player.CharacterAdded:Connect(function()
		task.wait(1)
		dressUp(player)
	end)
	if player.Character then
		dressUp(player)
	end
end

function Shop.start(remotes: Instance)
	remote = Instance.new("RemoteEvent")
	remote.Name = "Shop"
	remote.Parent = remotes

	MarketplaceService.ProcessReceipt = processReceipt
	MarketplaceService.PromptGamePassPurchaseFinished:Connect(function(player, passId, purchased)
		local it = BY_PASS[passId]
		if purchased and it then
			grantPass(player, it)
		end
	end)

	remote.OnServerEvent:Connect(function(player, action, key)
		local it = type(key) == "string" and ITEMS[key] or nil
		if action ~= "buy" or not it then
			return
		end
		if it.kind == "pass" and Shop.owns(player, key) then
			return
		end
		if it.id ~= 0 then
			if it.kind == "pass" then
				MarketplaceService:PromptGamePassPurchase(player, it.id)
			else
				MarketplaceService:PromptProductPurchase(player, it.id)
			end
		elseif RunService:IsStudio() then
			-- Studio test: no id set up yet, grant it free so it can be tried
			if it.kind == "pass" then
				grantPass(player, it)
			else
				PRODUCT_EFFECTS[it.key](player)
				send(player, string.format("%s %s (Studio test, free)", it.icon, it.name))
			end
		else
			send(player, it.name .. " isn't on sale yet.")
		end
	end)

	-- real prices from Roblox (the shop shows ShopItems prices until these arrive)
	task.spawn(function()
		for key, it in pairs(ITEMS) do
			if it.id ~= 0 then
				local ok, info = pcall(function()
					return MarketplaceService:GetProductInfo(it.id,
						it.kind == "pass" and Enum.InfoType.GamePass or Enum.InfoType.Product)
				end)
				if ok and info and info.PriceInRobux then
					prices[key] = info.PriceInRobux
				end
			end
		end
	end)

	Players.PlayerAdded:Connect(loadOwned)
	for _, p in ipairs(Players:GetPlayers()) do
		task.spawn(loadOwned, p)
	end
	Players.PlayerRemoving:Connect(function(p)
		owned[p] = nil
		refreshPenSpace()
	end)
end

return Shop
