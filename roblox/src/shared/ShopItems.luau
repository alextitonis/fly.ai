-- Fly Lab shop: fixed, optional Robux items. Rules (PLAN.md section 0): nothing random, the
-- lessons are always free, no crypto. Shared by the server (grants) and the client (shop panel).
--
-- id: the Game Pass / Developer Product id from the Roblox Creator Hub. Leave 0 until it's
-- created; then the item shows "not on sale yet" in a live game. In Studio, an item with id 0
-- can be granted free with the shop's Studio test button, so everything can be tried before
-- anything is set up.
-- price: what the shop shows until the real price loads from Roblox (set the real price on the
-- Creator Hub).

return {
	passes = { -- bought once, kept forever
		{ key = "LAB_PRO", id = 0, price = 199, icon = "🏆", name = "Lab Pro",
			desc = "+4 pen space for everyone in your server while you're here, and a Pro tag." },
		{ key = "GENE_KIT", id = 0, price = 99, icon = "🧪", name = "Gene Kit",
			desc = "Two more made-up genes to implant: Rainbow and Spots." },
		{ key = "LAB_COAT", id = 0, price = 49, icon = "🥼", name = "Lab Coat",
			desc = "A scientist's lab coat for your avatar, and a Scientist tag." },
	},
	products = { -- used up when bought
		{ key = "HATCH_NOW", id = 0, price = 15, icon = "🐣", name = "Hatch Now",
			desc = "Every egg in the pen hatches right away." },
		{ key = "GOLDEN_FRUIT", id = 0, price = 25, icon = "🍯", name = "Golden Fruit",
			desc = "3 golden fruits drop in. A fly that eats one counts it as 3 fruits for breeding." },
	},
	PRO_SPACE = 4,
	GOLDEN_WORTH = 3,
}
