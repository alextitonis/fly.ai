-- Fly Lab genetics: every fly has two copies (alleles) of every gene, one from each parent.
-- Pure Luau (no Roblox APIs), so it runs on server, client and in tests.
--
-- Brain genes change how strongly a sense drives the real circuit; what that does to the fly
-- (escaping or not, finding fruit faster) is the brain's answer, not a rule here.
--   EYES  "b" blurry eyes:  small-object eyes (LC10a) input x (1 - 0.35 per b); the circuit
--         then steers less toward fruit (measured: 16 s / 20 s / 27 s to reach fruit for 0/1/2 b)
--   JUMP  "j" slow jumper:  looming eyes (LC4/LPLC2) input x (1 - 0.38 per j)
--         one j still escapes (the circuit fires the giant fibre down to ~0.4x); jj doesn't
-- Body genes (looks only):
--   COLOR "g" gold body (recessive: needs two)    WHITE "w" white eyes (recessive, a real fly gene)
-- Made-up genes kids implant (dominant: one copy shows):
--   GLOW, STRIPES, SPARKLE, GENEX (Gene X does nothing you can see); Gene Kit: RAINBOW, SPOTS

local Genetics = {}

Genetics.MUTATION = 0.015 -- chance per gene per baby that one copy flips

Genetics.GENES = {
	{ key = "EYES", name = "Eyes", kind = "brain", normal = "+", variant = "b", variantName = "blurry eyes", mode = "additive", color = { 90, 200, 255 } },
	{ key = "JUMP", name = "Jump", kind = "brain", normal = "+", variant = "j", variantName = "slow jumper", mode = "additive", color = { 255, 160, 60 } },
	{ key = "COLOR", name = "Body", kind = "body", normal = "D", variant = "g", variantName = "gold body", mode = "recessive", color = { 255, 210, 80 } },
	{ key = "WHITE", name = "Eye colour", kind = "body", normal = "R", variant = "w", variantName = "white eyes", mode = "recessive", color = { 235, 235, 235 } },
	{ key = "GLOW", name = "Glow", kind = "fake", normal = "-", variant = "G", variantName = "glows", mode = "dominant", color = { 120, 255, 140 } },
	{ key = "STRIPES", name = "Stripes", kind = "fake", normal = "-", variant = "S", variantName = "stripes", mode = "dominant", color = { 255, 110, 200 } },
	{ key = "SPARKLE", name = "Sparkle", kind = "fake", normal = "-", variant = "K", variantName = "sparkles", mode = "dominant", color = { 190, 150, 255 } },
	{ key = "GENEX", name = "Gene X", kind = "fake", normal = "-", variant = "X", variantName = "Gene X", mode = "dominant", color = { 200, 200, 200 } },
	-- Gene Kit (shop pass): more made-up genes; anyone's flies can carry and pass them on,
	-- only Gene Kit owners can implant them
	{ key = "RAINBOW", name = "Rainbow", kind = "fake", kit = true, normal = "-", variant = "Y", variantName = "rainbow", mode = "dominant", color = { 255, 150, 90 } },
	{ key = "SPOTS", name = "Spots", kind = "fake", kit = true, normal = "-", variant = "P", variantName = "spots", mode = "dominant", color = { 140, 220, 220 } },
}
Genetics.BY_KEY = {}
for _, g in ipairs(Genetics.GENES) do
	Genetics.BY_KEY[g.key] = g
end

export type Genome = { [string]: { string } }

-- a fresh genome; p = { [key] = chance each copy is the variant }
function Genetics.random(p: { [string]: number }?, rnd: (() -> number)?): Genome
	rnd = rnd or math.random
	local genome = {}
	for _, g in ipairs(Genetics.GENES) do
		local chance = p and p[g.key] or 0
		genome[g.key] = {
			rnd() < chance and g.variant or g.normal,
			rnd() < chance and g.variant or g.normal,
		}
	end
	return genome
end

function Genetics.copy(genome: Genome): Genome
	local out = {}
	for k, pair in pairs(genome) do
		out[k] = { pair[1], pair[2] }
	end
	return out
end

-- Mendel: one random copy from each parent; rare mutations. Returns the child and mutated gene keys.
function Genetics.cross(mom: Genome, dad: Genome, rnd: (() -> number)?): (Genome, { string })
	rnd = rnd or math.random
	local child, mutated = {}, {}
	for _, g in ipairs(Genetics.GENES) do
		local a = mom[g.key][rnd() < 0.5 and 1 or 2]
		local b = dad[g.key][rnd() < 0.5 and 1 or 2]
		if rnd() < Genetics.MUTATION then
			if rnd() < 0.5 then
				a = a == g.variant and g.normal or g.variant
			else
				b = b == g.variant and g.normal or g.variant
			end
			table.insert(mutated, g.key)
		end
		child[g.key] = { a, b }
	end
	return child, mutated
end

-- how many copies of the variant a fly has (0, 1 or 2)
function Genetics.count(genome: Genome, key: string): number
	local g = Genetics.BY_KEY[key]
	local pair = genome[key]
	return (pair[1] == g.variant and 1 or 0) + (pair[2] == g.variant and 1 or 0)
end

-- does the fly show the variant?
function Genetics.shows(genome: Genome, key: string): boolean
	local g = Genetics.BY_KEY[key]
	local n = Genetics.count(genome, key)
	if g.mode == "recessive" then
		return n == 2
	end
	return n >= 1
end

-- implant one copy of a made-up gene
function Genetics.implant(genome: Genome, key: string): boolean
	local g = Genetics.BY_KEY[key]
	if not g or g.kind ~= "fake" then
		return false
	end
	genome[key][1] = g.variant
	return true
end

-- what the genes do to the fly
function Genetics.phenotype(genome: Genome)
	return {
		targetGain = 1 - 0.35 * Genetics.count(genome, "EYES"),
		loomGain = 1 - 0.38 * Genetics.count(genome, "JUMP"),
		gold = Genetics.shows(genome, "COLOR"),
		whiteEyes = Genetics.shows(genome, "WHITE"),
		glow = Genetics.shows(genome, "GLOW"),
		stripes = Genetics.shows(genome, "STRIPES"),
		sparkle = Genetics.shows(genome, "SPARKLE"),
		geneX = Genetics.shows(genome, "GENEX"),
		rainbow = Genetics.shows(genome, "RAINBOW"),
		spots = Genetics.shows(genome, "SPOTS"),
	}
end

-- share of variant copies in a population, per gene (0..1)
function Genetics.frequencies(genomes: { Genome }): { [string]: number }
	local out = {}
	for _, g in ipairs(Genetics.GENES) do
		local n = 0
		for _, genome in ipairs(genomes) do
			n += Genetics.count(genome, g.key)
		end
		out[g.key] = #genomes > 0 and n / (2 * #genomes) or 0
	end
	return out
end

return Genetics
