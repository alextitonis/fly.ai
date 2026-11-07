-- Game events for lessons: Events.fire(name, player?, fly?). player = who did it (nil = it
-- happened in the shared room, so it counts for everyone).
local Events = {}
local listeners = {}

function Events.connect(fn)
	table.insert(listeners, fn)
end

function Events.fire(name: string, player: Player?, fly: any?)
	for _, fn in ipairs(listeners) do
		task.spawn(fn, name, player, fly)
	end
end

return Events
