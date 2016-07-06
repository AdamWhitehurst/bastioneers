local CraftingJob = require 'stonehearth.jobs.crafting_job'

local RefineerClass = class()
radiant.mixin(RefineerClass, CraftingJob)

return RefineerClass
