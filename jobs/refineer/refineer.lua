local CraftingJob = require 'stonehearth.jobs.crafting_job'

local RefineerClass = class()
radiant.mixin(RefineerClass, CraftingJob)

function RefineerClass:increase_backpack_size(args)
   local sc = self._sv._entity:get_component('stonehearth:storage')
   sc:change_max_capacity(args.backpack_size_increase)
end

function RefineerClass:decrease_backpack_size(args)
   local sc = self._sv._entity:get_component('stonehearth:storage')
   sc:change_max_capacity(args.backpack_size_increase * -1)
end

return RefineerClass
