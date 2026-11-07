-- Lesson progress per player: which lesson and step they're on, finished lessons (badges),
-- goal checks from game events, quiz answers, and saving between visits (DataStore; quietly
-- skipped when it isn't available, e.g. Studio without API access).

local Players = game:GetService("Players")
local DataStoreService = game:GetService("DataStoreService")

local Shared = game:GetService("ReplicatedStorage"):WaitForChild("Shared")
local LessonData = require(Shared:WaitForChild("LessonData"))
local Events = require(script.Parent:WaitForChild("Events"))

local Lessons = {}

-- events the client may report itself (panels opened, AI trainer results)
local CLIENT_EVENTS = { panel_brain = true, panel_genes = true, panel_ai = true, ai_manual = true, ai_learned = true }

local progress = {} -- [player] = { lesson, step, done = { [id] = true }, count }
local store
do
	local ok, ds = pcall(function()
		return DataStoreService:GetDataStore("FlyLabLessons_v1")
	end)
	store = ok and ds or nil
end

local remote

local function key(player: Player)
	return "u" .. player.UserId
end

local function stateFor(p)
	return { lesson = p.lesson, step = p.step, done = p.done, count = p.count }
end

local function send(player: Player, extra)
	local p = progress[player]
	if not p or not remote then
		return
	end
	local s = stateFor(p)
	if extra then
		for k, v in pairs(extra) do
			s[k] = v
		end
	end
	remote:FireClient(player, "state", s)
end

local function save(player: Player)
	local p = progress[player]
	if not p or not store or not p.dirty then
		return
	end
	p.dirty = false
	local data = { lesson = p.lesson, step = p.step, done = p.done }
	pcall(function()
		store:SetAsync(key(player), data)
	end)
end

local function stepOf(p)
	local lesson = LessonData[p.lesson]
	return lesson and lesson.steps[p.step], lesson
end

-- move a player one step on; at the end of a lesson, give the badge and open the next one
local function advance(player: Player)
	local p = progress[player]
	local step, lesson = stepOf(p)
	if not step then
		return
	end
	local extra = { fact = step.fact }
	p.step += 1
	p.count = 0
	if p.step > #lesson.steps then
		p.done[lesson.id] = true
		extra.badge = lesson.badge
		extra.finished = lesson.title
		if p.lesson < #LessonData then
			p.lesson += 1
		end
		p.step = 1
		-- a finished final lesson stays on its last screen
		if LessonData[p.lesson] and p.done[LessonData[p.lesson].id] then
			p.step = #LessonData[p.lesson].steps + 1
		end
	end
	p.dirty = true
	send(player, extra)
	task.delay(5, save, player)
end

local function onEvent(name: string, player: Player?)
	local targets = player and { player } or Players:GetPlayers()
	for _, pl in ipairs(targets) do
		local p = progress[pl]
		if p then
			local step = stepOf(p)
			if step then
				if step.goal == name then
					advance(pl)
				elseif step.goal == "births" and name == "hatched" then
					p.count += 1
					if p.count >= (step.n or 1) then
						advance(pl)
					else
						send(pl)
					end
				end
			end
		end
	end
end

local function load(player: Player)
	local p = { lesson = 1, step = 1, done = {}, count = 0, dirty = false }
	if store then
		local ok, data = pcall(function()
			return store:GetAsync(key(player))
		end)
		if ok and type(data) == "table" then
			if type(data.done) == "table" then
				for _, lesson in ipairs(LessonData) do
					if data.done[lesson.id] == true then
						p.done[lesson.id] = true
					end
				end
			end
			if type(data.lesson) == "number" and LessonData[data.lesson] then
				p.lesson = data.lesson
				local n = #LessonData[p.lesson].steps
				p.step = type(data.step) == "number" and math.clamp(math.floor(data.step), 1, n + 1) or 1
			end
		end
	end
	progress[player] = p
	send(player)
end

-- may this player open lesson i? (lesson 1 always; then each after the one before is done)
local function unlocked(p, i: number): boolean
	return i == 1 or (LessonData[i - 1] ~= nil and p.done[LessonData[i - 1].id] == true)
end

function Lessons.start(remotes: Instance)
	remote = Instance.new("RemoteEvent")
	remote.Name = "Lessons"
	remote.Parent = remotes

	remote.OnServerEvent:Connect(function(player, action, a)
		local p = progress[player]
		if not p then
			return
		end
		if action == "event" and type(a) == "string" and CLIENT_EVENTS[a] then
			onEvent(a, player)
		elseif action == "quiz" and type(a) == "number" then
			local step = stepOf(p)
			if step and step.goal == "quiz" then
				if a == step.answer then
					advance(player)
				else
					send(player, { wrong = true })
				end
			end
		elseif action == "go" and type(a) == "number" and LessonData[a] and unlocked(p, a) then
			p.lesson = a
			p.step = 1
			p.count = 0
			p.dirty = true
			send(player)
		end
	end)

	Events.connect(function(name, player)
		onEvent(name, player)
	end)

	Players.PlayerAdded:Connect(load)
	for _, pl in ipairs(Players:GetPlayers()) do
		task.spawn(load, pl)
	end
	Players.PlayerRemoving:Connect(function(player)
		save(player)
		progress[player] = nil
	end)
	game:BindToClose(function()
		for _, pl in ipairs(Players:GetPlayers()) do
			save(pl)
		end
	end)
end

-- for tests: drive the logic without Roblox networking
Lessons._progress = progress
Lessons._onEvent = onEvent
Lessons._advance = advance

return Lessons
