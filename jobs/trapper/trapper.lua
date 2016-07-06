local TrapperClass = class() 
local CombatJob = require 'stonehearth.jobs.combat_job'
local constants = require 'stonehearth.constants'
local rng = _radiant.math.get_default_rng()
radiant.mixin(TrapperClass, CombatJob)
function TrapperClass:initialize()
   self._sv._tame_beast_percent_chance = 0
   self._sv.last_gained_lv = 0
   CombatJob.initialize(self)
end

--Private functions

function TrapperClass:_create_listeners()
   self._clear_trap_listener = radiant.events.listen(self._sv._entity, 'stonehearth:clear_trap', self, self._on_clear_trap)
   self._befriend_pet_listener = radiant.events.listen(self._sv._entity, 'stonehearth:befriend_pet', self, self._on_pet_befriended)

   --Move into another function that is activated by a test
   --self._set_trap_listener = radiant.events.listen(self._sv._entity, 'stonehearth:set_trap', self, self._on_set_trap)
end

function TrapperClass:_remove_listeners()
   if self._clear_trap_listener then
      self._clear_trap_listener:destroy()
      self._clear_trap_listener = nil
   end

   if self._befriend_pet_listener then
      self._befriend_pet_listener:destroy()
      self._befriend_pet_listener = nil
   end

   if self._set_trap_listener then
      self._set_trap_listener:destroy()
      self._set_trap_listener = nil
   end
end

-- Called if the trapper is harvesting a trap for food. 
-- @param args - the trapped_entity_id field inside args is nil if there is no critter, and true if there is a critter 
function TrapperClass:_on_clear_trap(args)
   if args.trapped_entity_id then
      self._job_component:add_exp(self._xp_rewards['successful_trap'])
   else
      self._job_component:add_exp(self._xp_rewards['unsuccessful_trap'])
   end
end

-- Called when the trapper is befriending a pet
-- @param args - the pet_id field inside args is nil if there is no critter, and the ID if there is a critter 
function TrapperClass:_on_pet_befriended(args)
   if args.pet_id then
      self._job_component:add_exp(self._xp_rewards['befriend_pet'])
   end
end

-- We actually want the XP to be gained on harvesting; this is mostly for testing purposes.
function TrapperClass:_on_set_trap(args)
   --Comment in for testing, or write activation fn for autotests
   --self._job_component:add_exp(90)
end


-- Functions for level up
--Increase the size of the backpack
function TrapperClass:increase_backpack_size(args)
   local sc = self._sv._entity:get_component('stonehearth:storage')
   sc:change_max_capacity(args.backpack_size_increase)
end

function TrapperClass:set_tame_beast_percentage(args)
   self._sv._tame_beast_percent_chance = args.tame_beast_percentage
end

-- Functions for demote
--Make the backpack size smaller
function TrapperClass:decrease_backpack_size(args)
   local sc = self._sv._entity:get_component('stonehearth:storage')
   sc:change_max_capacity(args.backpack_size_increase * -1)
end

function TrapperClass:should_tame(target)
   if not self:has_perk('trapper_natural_empathy_1') then
      -- If no charm pet perk, then remove
      return false
   end

   local trapper = self._sv._entity
   local num_pets = trapper:add_component('stonehearth:pet_owner'):num_pets()
   local max_num_pets = 1
   local attributes = trapper:get_component('stonehearth:attributes')
   if attributes then
      local compassion = attributes:get_attribute('compassion')
      if compassion >= stonehearth.constants.attribute_effects.COMPASSION_TRAPPER_TWO_PETS_THRESHOLD then
         max_num_pets = 2
      end
   end

   if num_pets >= max_num_pets then
      return false
   end

   -- percentage chance to tame the pet.
   local percent = rng:get_int(1, 100)
   if percent > self._sv._tame_beast_percent_chance then
      return false
   end
   
   return true
end

return TrapperClass
