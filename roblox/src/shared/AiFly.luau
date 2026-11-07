-- The AI trainer's tiny artificial brain: 2 eyes (inputs) -> 2 turn neurons (outputs), joined by
-- 4 connection weights. A turn neuron's activity is the weighted sum of the eyes, never below 0
-- (like a real neuron's firing rate). Turn = left neuron minus right neuron.
-- Pure Luau: used by the trainer panel and by tests.

local AiFly = {}

AiFly.KEYS = { "LL", "LR", "RL", "RR" } -- eye -> turn neuron: LL = left eye -> turn-left neuron
AiFly.MIN, AiFly.MAX, AiFly.STEP = -2, 2, 0.5
AiFly.TRIALS = { -- fruit spots (x, y in 0..1; the fly starts at the bottom middle, facing up)
	{ 0.15, 0.25 },
	{ 0.85, 0.3 },
	{ 0.08, 0.75 },
}
local START = { 0.5, 0.88 }
local SPEED, TURN, DT, TIME, REACH = 0.25, 2.5, 0.02, 8, 0.05

function AiFly.zero()
	return { LL = 0, LR = 0, RL = 0, RR = 0 }
end

-- one trial; returns reached, seconds, closest distance to the fruit, and the path (every 5th point)
function AiFly.run(w, fruit)
	local x, y, h = START[1], START[2], 0 -- h: heading, 0 = up, + = turned left
	local path = {}
	local fx, fy = fruit[1], fruit[2]
	local t = 0
	local closest = math.huge
	for k = 1, math.floor(TIME / DT) do
		local dx, dy = fx - x, fy - y
		local d = math.sqrt(dx * dx + dy * dy)
		closest = math.min(closest, d)
		if d < REACH then
			return true, t, d, path
		end
		-- angle of the fruit from straight ahead (+ = on the left); screen y grows downward
		local rel = math.atan2(-dx, -dy) - h
		rel = (rel + math.pi) % (2 * math.pi) - math.pi
		local L = rel > 0.05 and 1 or 0
		local R = rel < -0.05 and 1 or 0
		local left = math.max(0, w.LL * L + w.RL * R)
		local right = math.max(0, w.LR * L + w.RR * R)
		h += (left - right) * TURN * DT
		x = math.clamp(x - math.sin(h) * SPEED * DT, 0, 1)
		y = math.clamp(y - math.cos(h) * SPEED * DT, 0, 1)
		t += DT
		if k % 5 == 0 then
			table.insert(path, { x, y })
		end
	end
	return false, t, closest, path
end

-- score over all trials: a reached fruit is worth 1 + speed bonus, a missed one 1 - closest distance
function AiFly.score(w)
	local s, reachedAll = 0, true
	for _, fruit in ipairs(AiFly.TRIALS) do
		local ok, t, d = AiFly.run(w, fruit)
		if ok then
			s += 1 + (TIME - t) / TIME
		else
			s += math.max(0, 1 - d)
			reachedAll = false
		end
	end
	return s, reachedAll
end

function AiFly.copy(w)
	return { LL = w.LL, LR = w.LR, RL = w.RL, RR = w.RR }
end

-- random weights that don't already solve the task
function AiFly.scramble(rnd)
	rnd = rnd or math.random
	for _ = 1, 50 do
		local w = {}
		for _, k in ipairs(AiFly.KEYS) do
			w[k] = (math.floor(rnd() * 9) - 4) * AiFly.STEP
		end
		local _, all = AiFly.score(w)
		if not all then
			return w
		end
	end
	return { LL = -1, LR = 1, RL = 1, RR = -1 }
end

-- one learning try (trial and error / hill climbing): nudge one weight; keep it if the score
-- isn't worse. Returns new weights, new best score, whether the change was kept, which weight.
function AiFly.learnStep(w, best, rnd)
	rnd = rnd or math.random
	local k = AiFly.KEYS[math.floor(rnd() * 4) + 1]
	local trial = AiFly.copy(w)
	trial[k] = math.clamp(trial[k] + (rnd() < 0.5 and -1 or 1) * AiFly.STEP, AiFly.MIN, AiFly.MAX)
	local s = AiFly.score(trial)
	if s >= best then
		return trial, s, true, k
	end
	return w, best, false, k
end

return AiFly
