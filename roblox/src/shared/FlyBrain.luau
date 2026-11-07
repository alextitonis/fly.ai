--!native
-- FlyBrain: the Fly Lab circuit, 879 real neurons cut from the MaleCNS fruit-fly connectome
-- (roblox/tools/export_circuit.py), run as a leaky integrate-and-fire network with the same
-- equations as flybrain/brain.py:
--     v <- decay*v + gain*(input from synapses) + tonic + bias + noise + stimulus
--     v >= 1  ->  spike, v = 0
-- "bias" is the measured average drive the rest of the brain gives each kept neuron at rest.
-- One step = 20 ms of fly time (Circuit.dt). Run 50 steps per second.

local C = require(script.Parent:WaitForChild("Circuit"))

local N: number = C.n
local DECAY: number, GAIN: number, TONIC: number = C.decay, C.gain, C.tonic
local NOISE_P: number, NOISE_AMP: number = C.noise_p, C.noise_amp

-- JSON arrays arrive 1-based but hold 0-based offsets / neuron indices: shift once.
local START = table.create(N + 1, 0)
for i = 1, N + 1 do
	START[i] = C.start[i] + 1
end
local POST = table.create(#C.post, 0)
for k, p in ipairs(C.post) do
	POST[k] = p + 1
end
local W = C.w
local BIAS = C.bias

local GROUPS: { [string]: { number } } = {}
for name, list in pairs(C.groups) do
	local t = table.create(#list, 0)
	for k, i in ipairs(list) do
		t[k] = i + 1
	end
	GROUPS[name] = t
end

-- what the game reads: escape (DNp01), steer (DNa02 L/R), walk (DNg100), back up (MDN), groom (DNg12)
local OUTPUTS = { "escape", "steer_L", "steer_R", "walk", "back", "groom" }
local NOUT = #OUTPUTS
local OUT_OF = table.create(N, 0) -- output index of each neuron, 0 = not an output
for gi, name in ipairs(OUTPUTS) do
	for _, i in ipairs(GROUPS[name]) do
		OUT_OF[i] = gi
	end
end

local WINDOW = 25 -- readout averages over ~25 steps (0.5 s)
local KEEP = 1 - 1 / WINDOW
local RECENT_CAP = 600

local Brain = {}
Brain.__index = Brain
Brain.N = N
Brain.GROUPS = GROUPS
Brain.OUTPUTS = OUTPUTS
Brain.DT = C.dt
Brain.STIM = C.stim -- the stimulus strength used to match the full brain (0.8)

function Brain.new()
	local self = setmetatable({}, Brain)
	self.v = table.create(N, 0)
	self.cur = table.create(N, 0)
	self.input = table.create(N, 0)
	self.silent = table.create(N, false)
	self.fired = table.create(N, 0)
	self.nfired = 0
	self.count = table.create(NOUT, 0)
	self.rate = table.create(NOUT, 0) -- smoothed spikes per window, per output
	self.record = false -- keep fired neurons for the brain panel
	self.recent = {}
	self.steps = 0
	return self
end

-- add voltage to every neuron of a group for the next step (call every step to hold a stimulus)
function Brain:stimulate(group: string, amount: number)
	local input = self.input
	for _, i in ipairs(GROUPS[group]) do
		input[i] += amount
	end
end

-- switch a group off (an experiment): its neurons can't fire
function Brain:silence(group: string, on: boolean)
	local silent = self.silent
	for _, i in ipairs(GROUPS[group]) do
		silent[i] = on
	end
end

function Brain:step()
	local v, cur, input, silent, fired = self.v, self.cur, self.input, self.silent, self.fired
	for i = 1, N do
		cur[i] = 0
	end
	for f = 1, self.nfired do
		local j = fired[f]
		for s = START[j], START[j + 1] - 1 do
			local p = POST[s]
			cur[p] += W[s]
		end
	end

	local count = self.count
	for g = 1, NOUT do
		count[g] = 0
	end
	local record, recent = self.record, self.recent
	local rnd = math.random
	local nf = 0
	for i = 1, N do
		local x = v[i] * DECAY + GAIN * cur[i] + TONIC + BIAS[i] + input[i]
		input[i] = 0
		if rnd() < NOISE_P then
			x += NOISE_AMP
		end
		if silent[i] then
			x = 0
		elseif x >= 1 then
			nf += 1
			fired[nf] = i
			x = 0
			local g = OUT_OF[i]
			if g > 0 then
				count[g] += 1
			end
			if record and #recent < RECENT_CAP then
				recent[#recent + 1] = i
			end
		end
		v[i] = x
	end
	self.nfired = nf

	local rate = self.rate
	for g = 1, NOUT do
		rate[g] = rate[g] * KEEP + count[g]
	end
	self.steps += 1
end

-- the circuit's own resting output, measured once by running a quiet brain
local BASE: { number }? = nil
local function baseline(): { number }
	if BASE then
		return BASE
	end
	local b = Brain.new()
	local sum = table.create(NOUT, 0)
	local WARM, MEASURE = 60, 500
	for s = 1, WARM + MEASURE do
		b:step()
		if s > WARM then
			for g = 1, NOUT do
				sum[g] += b.rate[g]
			end
		end
	end
	for g = 1, NOUT do
		sum[g] /= MEASURE
	end
	BASE = sum
	return sum
end
Brain.baseline = baseline

-- extra spikes per half second over rest, per output: what the fly "wants" to do right now
function Brain:readout()
	local base = baseline()
	local r = self.rate
	return {
		escape = r[1] - base[1],
		steerL = r[2] - base[2],
		steerR = r[3] - base[3],
		walk = r[4] - base[4],
		back = r[5] - base[5],
		groom = r[6] - base[6],
	}
end

-- neurons that fired since the last call (1-based), for the brain panel
function Brain:takeRecent(): { number }
	local out = self.recent
	self.recent = {}
	return out
end

-- server budget check, e.g. from the Studio command bar:
--   require(game.ReplicatedStorage.Shared.FlyBrain).bench(30, 250)
function Brain.bench(flies: number, steps: number)
	local brains = {}
	for k = 1, flies do
		brains[k] = Brain.new()
	end
	local t0 = os.clock()
	for _ = 1, steps do
		for k = 1, flies do
			local b = brains[k]
			if k % 3 == 0 then
				b:stimulate("in_touch", 0.8) -- some flies busy, like in a real farm
			end
			b:step()
		end
	end
	local secs = os.clock() - t0
	local gameSecs = steps * C.dt
	local msg = string.format(
		"[FlyBrain] %d flies x %d steps: %.1f ms total, %.2f ms per fly-second, %.1f%% of one core at 50 Hz",
		flies,
		steps,
		secs * 1000,
		secs * 1000 / (flies * gameSecs),
		100 * secs / gameSecs
	)
	print(msg)
	return msg
end

return Brain
