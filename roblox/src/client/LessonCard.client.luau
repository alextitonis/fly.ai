-- The lesson card (bottom of the screen): what to do now, quiz buttons, "did you know?" facts,
-- badges, and a list to pick a lesson.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local LessonData = require(ReplicatedStorage:WaitForChild("Shared"):WaitForChild("LessonData"))
local remotes = ReplicatedStorage:WaitForChild("FlyLabRemotes")
local remote = remotes:WaitForChild("Lessons")
local playerGui = Players.LocalPlayer:WaitForChild("PlayerGui")

local WHITE = Color3.new(1, 1, 1)
local DIM = Color3.fromRGB(175, 185, 195)
local GREEN = Color3.fromRGB(110, 230, 150)

local gui = Instance.new("ScreenGui")
gui.Name = "FlyLabLessons"
gui.ResetOnSpawn = false
gui.DisplayOrder = 5
gui.Parent = playerGui
local scale = Instance.new("UIScale")
scale.Parent = gui
local function rescale()
	local vp = workspace.CurrentCamera and workspace.CurrentCamera.ViewportSize or Vector2.new(1280, 720)
	scale.Scale = math.clamp(math.min(vp.X / 700, vp.Y / 720), 0.55, 1)
end
rescale()
workspace.CurrentCamera:GetPropertyChangedSignal("ViewportSize"):Connect(rescale)

local function label(parent, text, size, pos, color, bold, textSize)
	local l = Instance.new("TextLabel")
	l.BackgroundTransparency = 1
	l.Size = size
	l.Position = pos
	l.Text = text
	l.TextColor3 = color or WHITE
	l.Font = bold and Enum.Font.GothamBold or Enum.Font.Gotham
	l.TextSize = textSize or 14
	l.TextXAlignment = Enum.TextXAlignment.Left
	l.TextYAlignment = Enum.TextYAlignment.Top
	l.TextWrapped = true
	l.Parent = parent
	return l
end
local function button(parent, text, size, pos, color)
	local b = Instance.new("TextButton")
	b.Size = size
	b.Position = pos
	b.BackgroundColor3 = color or Color3.fromRGB(45, 80, 70)
	b.TextColor3 = WHITE
	b.Font = Enum.Font.GothamBold
	b.TextSize = 14
	b.TextWrapped = true
	b.Text = text
	b.Parent = parent
	Instance.new("UICorner").Parent = b
	return b
end

local W = 470
local card = Instance.new("Frame")
card.Size = UDim2.fromOffset(W, 0)
card.AnchorPoint = Vector2.new(0.5, 1)
card.Position = UDim2.new(0.5, 0, 1, -16)
card.BackgroundColor3 = Color3.fromRGB(16, 20, 26)
card.BackgroundTransparency = 0.05
card.AutomaticSize = Enum.AutomaticSize.Y
card.Parent = gui
Instance.new("UICorner").Parent = card
local stroke = Instance.new("UIStroke")
stroke.Color = Color3.fromRGB(110, 230, 150)
stroke.Transparency = 0.6
stroke.Parent = card

local list = Instance.new("UIListLayout")
list.Padding = UDim.new(0, 6)
list.SortOrder = Enum.SortOrder.LayoutOrder
list.Parent = card
local pad = Instance.new("UIPadding")
pad.PaddingTop = UDim.new(0, 12)
pad.PaddingBottom = UDim.new(0, 12)
pad.PaddingLeft = UDim.new(0, 14)
pad.PaddingRight = UDim.new(0, 14)
pad.Parent = card

local function row(order, height)
	local f = Instance.new("Frame")
	f.BackgroundTransparency = 1
	f.Size = UDim2.new(1, 0, 0, height)
	f.LayoutOrder = order
	f.AutomaticSize = Enum.AutomaticSize.Y
	f.Parent = card
	return f
end

local top = row(1, 22)
local header = label(top, "", UDim2.new(1, -150, 0, 20), UDim2.fromOffset(0, 0), GREEN, true, 13)
local listBtn = button(top, "📚 Lessons", UDim2.fromOffset(96, 22), UDim2.new(1, -140, 0, -2), Color3.fromRGB(40, 50, 65))
listBtn.TextSize = 12
local hideBtn = button(top, "–", UDim2.fromOffset(34, 22), UDim2.new(1, -36, 0, -2), Color3.fromRGB(40, 50, 65))

local body = row(2, 0)
local bodyList = Instance.new("UIListLayout")
bodyList.Padding = UDim.new(0, 6)
bodyList.SortOrder = Enum.SortOrder.LayoutOrder
bodyList.Parent = body

local function autoLabel(parent, order, color, bold, size)
	local l = label(parent, "", UDim2.new(1, 0, 0, 0), UDim2.new(), color, bold, size)
	l.AutomaticSize = Enum.AutomaticSize.Y
	l.LayoutOrder = order
	return l
end
local title = autoLabel(body, 1, WHITE, true, 19)
local intro = autoLabel(body, 2, DIM, false, 13)
local task_ = autoLabel(body, 3, WHITE, true, 15)
local dots = autoLabel(body, 4, DIM, false, 13)

local quiz = Instance.new("Frame")
quiz.BackgroundTransparency = 1
quiz.Size = UDim2.new(1, 0, 0, 0)
quiz.AutomaticSize = Enum.AutomaticSize.Y
quiz.LayoutOrder = 5
quiz.Parent = body
local quizList = Instance.new("UIListLayout")
quizList.Padding = UDim.new(0, 5)
quizList.Parent = quiz

local factBox = Instance.new("Frame")
factBox.BackgroundColor3 = Color3.fromRGB(30, 55, 45)
factBox.Size = UDim2.new(1, 0, 0, 0)
factBox.AutomaticSize = Enum.AutomaticSize.Y
factBox.LayoutOrder = 6
factBox.Visible = false
factBox.Parent = body
Instance.new("UICorner").Parent = factBox
local fpad = Instance.new("UIPadding")
fpad.PaddingTop, fpad.PaddingBottom = UDim.new(0, 8), UDim.new(0, 8)
fpad.PaddingLeft, fpad.PaddingRight = UDim.new(0, 10), UDim.new(0, 10)
fpad.Parent = factBox
local fact = label(factBox, "", UDim2.new(1, 0, 0, 0), UDim2.new(), Color3.fromRGB(220, 255, 230), false, 13)
fact.AutomaticSize = Enum.AutomaticSize.Y

-- the lesson list (badges, locks)
local picker = Instance.new("Frame")
picker.Size = UDim2.fromOffset(W, 0)
picker.AutomaticSize = Enum.AutomaticSize.Y
picker.AnchorPoint = Vector2.new(0.5, 1)
picker.Position = UDim2.new(0.5, 0, 1, -16)
picker.BackgroundColor3 = Color3.fromRGB(16, 20, 26)
picker.Visible = false
picker.ZIndex = 5
picker.Parent = gui
Instance.new("UICorner").Parent = picker
local ppad = pad:Clone()
ppad.Parent = picker
local plist = Instance.new("UIListLayout")
plist.Padding = UDim.new(0, 6)
plist.SortOrder = Enum.SortOrder.LayoutOrder
plist.Parent = picker

local state = nil
local hidden = false
local factToken = 0

local function showFact(text: string, badge: string?)
	factToken += 1
	local my = factToken
	fact.Text = (badge and ("🏅 New badge: " .. badge .. "!\n") or "") .. "💡 Did you know? " .. text
	factBox.BackgroundColor3 = badge and Color3.fromRGB(70, 55, 20) or Color3.fromRGB(30, 55, 45)
	factBox.Visible = true
	task.delay(badge and 14 or 10, function()
		if factToken == my then
			factBox.Visible = false
		end
	end)
end

local function panelVisible(guiName: string): boolean
	local g = playerGui:FindFirstChild(guiName)
	local p = g and g:FindFirstChild("Panel")
	return p ~= nil and p.Visible
end

local PANELS = { panel_brain = "FlyLabBrain", panel_genes = "FlyLabGenes", panel_ai = "FlyLabAI" }
local function currentStep()
	if not state then
		return nil
	end
	local lesson = LessonData[state.lesson]
	return lesson and lesson.steps[state.step], lesson
end
local function checkPanels()
	local step = currentStep()
	if step and PANELS[step.goal] and panelVisible(PANELS[step.goal]) then
		remote:FireServer("event", step.goal)
	end
end

local function render()
	if not state then
		return
	end
	local step, lesson = currentStep()
	body.Visible = not hidden
	hideBtn.Text = hidden and "+" or "–"
	header.Text = string.format("📘 LESSON %d OF %d · %s", state.lesson, #LessonData, string.upper(lesson.topic))
	title.Text = lesson.title
	intro.Text = lesson.intro
	intro.Visible = state.step == 1
	for _, c in ipairs(quiz:GetChildren()) do
		if c:IsA("TextButton") then
			c:Destroy()
		end
	end
	if not step then
		task_.Text = state.lesson >= #LessonData and "🎉 You finished every lesson! Keep experimenting with your farm."
			or "✅ Lesson done! Pick the next one from 📚 Lessons."
		dots.Text = ""
		return
	end
	local n = #lesson.steps
	local d = {}
	for i = 1, n do
		table.insert(d, i < state.step and "●" or i == state.step and "◉" or "○")
	end
	local extra = step.goal == "births" and string.format("  (%d of %d babies)", state.count or 0, step.n or 1) or ""
	dots.Text = string.format("Step %d of %d   %s%s", state.step, n, table.concat(d, " "), extra)
	task_.Text = "👉 " .. step.text
	if step.goal == "quiz" then
		for i, choice in ipairs(step.choices) do
			local b = button(quiz, choice, UDim2.new(1, 0, 0, 30), UDim2.new(), Color3.fromRGB(45, 60, 90))
			b.LayoutOrder = i
			b.MouseButton1Click:Connect(function()
				remote:FireServer("quiz", i)
			end)
		end
	end
	checkPanels()
end

local function renderPicker()
	for _, c in ipairs(picker:GetChildren()) do
		if c:IsA("TextButton") or c:IsA("TextLabel") then
			c:Destroy()
		end
	end
	local t = label(picker, "📚 Lessons (all free)", UDim2.new(1, 0, 0, 22), UDim2.new(), GREEN, true, 15)
	t.LayoutOrder = 0
	for i, lesson in ipairs(LessonData) do
		local done = state and state.done[lesson.id]
		local open = i == 1 or (state and state.done[LessonData[i - 1].id])
		local text = string.format("%s %d. %s · %s%s", done and "✅" or open and "▶️" or "🔒", i, lesson.title, lesson.topic,
			done and ("   " .. lesson.badge) or "")
		local b = button(picker, text, UDim2.new(1, 0, 0, 34), UDim2.new(), open and Color3.fromRGB(40, 70, 60) or Color3.fromRGB(40, 40, 46))
		b.TextXAlignment = Enum.TextXAlignment.Left
		b.LayoutOrder = i
		b.AutoButtonColor = open == true
		b.MouseButton1Click:Connect(function()
			if open then
				remote:FireServer("go", i)
				picker.Visible = false
				card.Visible = true
			end
		end)
	end
	local close = button(picker, "Close", UDim2.new(1, 0, 0, 30), UDim2.new(), Color3.fromRGB(60, 60, 70))
	close.LayoutOrder = 99
	close.MouseButton1Click:Connect(function()
		picker.Visible = false
		card.Visible = true
	end)
end

listBtn.MouseButton1Click:Connect(function()
	renderPicker()
	picker.Visible = true
	card.Visible = false
end)
hideBtn.MouseButton1Click:Connect(function()
	hidden = not hidden
	render()
end)

remote.OnClientEvent:Connect(function(kind, s)
	if kind ~= "state" then
		return
	end
	state = s
	if s.fact then
		showFact(s.fact, s.badge)
	end
	if s.wrong then
		showFact("Not quite. Have another look and try again!")
	end
	render()
end)

-- panels opened by the player count for "open the panel" steps
local function watchPanel(guiName: string)
	task.spawn(function()
		local g = playerGui:WaitForChild(guiName, 30)
		local p = g and g:WaitForChild("Panel", 30)
		if p then
			p:GetPropertyChangedSignal("Visible"):Connect(checkPanels)
		end
	end)
end
for _, name in pairs(PANELS) do
	watchPanel(name)
end
