-- Fly Lab prototype settings. Set FLIES and MAX_FLIES to 30 to test the server budget.
return {
	FLIES = 6, -- flies at the start
	MAX_FLIES = 8, -- pen size: when a baby hatches into a full pen, the oldest fly leaves

	-- the farm
	HATCH_TIME = 6, -- seconds from egg to fly
	BREED_EVERY = 25, -- auto-farm: seconds between babies
	BIRD_EVERY = { 9, 16 }, -- auto-farm: seconds between bird dives (random in range)
	FRUIT_EVERY = 3, -- auto-farm: seconds between fruit drops
	HISTORY = 60, -- births kept on the stats board
	-- chance each gene copy starts as the variant
	START_VARIANTS = { EYES = 0.25, JUMP = 0.45, COLOR = 0.4, WHITE = 0.35 },
	EFFECT_HELPS = 2.0, -- breeding weight of a fly showing a made-up gene set to "helps"
	EFFECT_HURTS = 0.35, -- ... set to "hurts"
	BRAIN_HZ = 50, -- brain steps per second (20 ms each, as calibrated)
	MAX_STEPS_PER_FRAME = 4,

	ROOM = 80, -- floor is ROOM x ROOM studs, centred on the origin
	WALL = 10,

	-- senses -> brain (what the fly's eyes and body report)
	SIGHT = 45, -- studs: food further than this isn't seen
	FOV = math.rad(115), -- each side of straight ahead
	AHEAD = math.rad(9), -- food this close to dead ahead drives no turn
	LOOM_RANGE = 16, -- studs: something rushing at the fly closer than this looms
	LOOM_SPEED = 7, -- studs/s of approach that counts as looming
	TICKLE_STEPS = 35, -- 0.7 s of touch on the eyes
	SWAT_RANGE = 12,
	SWAT_HIT = 3.8,
	SWAT_DELAY = 0.28, -- seconds between swing and hit: the fly has this long to escape

	-- brain -> body (how strongly each readout moves the fly)
	TURN_GAIN = 1.1, -- rad/s per extra DNa02 spike per half second (left minus right)
	MAX_TURN = 3.5,
	WALK_SPEED = 4,
	BACK_SPEED = 2.5,
	BACK_AT = 2,
	ESCAPE_AT = 4, -- extra DNp01 spikes per half second that launch a take-off
	GROOM_AT = 18, -- extra DNg12 spikes per half second that start grooming
	FLIGHT_TIME = 1.4,
	FLIGHT_SPEED = 13,
	FLIGHT_HEIGHT = 7,
	EAT_DIST = 2.4,
	EAT_TIME = 2.5,
	DIZZY_TIME = 2.2,
	MAX_FOOD = 3,
}
