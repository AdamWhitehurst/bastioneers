local NatalGrowthComponent = class()
-- Handles the growth bastioneer natal stones and eventual hatching into a new bastioneer
function NatalGrowthComponent:initialize()
	self._sv = self.__saved_variables:get_data()
	if not self._sv.initialized == true then 
		self._sv._natal_growth_timer = nil
		self._sv._duration = nil
		self._sv._player_id = nil
		self._sv.initialized = true
	end
end

function NatalGrowthComponent:activate()
	-- Grab the growth data from the JSON file
	local json = radiant.entities.get_json(self)
	self._sv._duration = json.duration
	-- Wait for the natal stone to be placed in the world
	self._added_to_world_trace = radiant.events.listen_once(self._entity, 'stonehearth:on_added_to_world', function()
		self:_start()
		self._added_to_world_trace = nil
	end)
end

function NatalGrowthComponent:_start()
	self._sv._player_id = radiant.entities.get_player_id(self._entity)
	if not self._sv._natal_growth_timer then
		self:_start_growth_timer(self._sv._duration)
	else
		if self._sv._natal_growth_timer then
			self._sv._natal_stone_growth_timer:bind(function()
					self:hatch()
				end)
		end
	end
	self.__saved_variables:mark_changed()
end

function NatalGrowthComponent:_start_growth_timer(duration)
	self:_end_growth_timer()

	self._sv._natal_growth_timer = stonehearth.calendar:set_persistent_timer("natal stone hatch", duration, 
		function ()
			self:hatch()
		end
	)
	self.__saved_variables:mark_changed()
end

function NatalGrowthComponent:hatch()
	local location = radiant.entities.get_world_location(self._entity)
	self:_place_citizen(location)
	self:_destroy_self()
end

function NatalGrowthComponent:_place_citizen(location)
   local citizen = self:_create_citizen()
   radiant.terrain.place_entity(citizen, location)

   local town = stonehearth.town:get_town(self._sv._player_id)
   --Give the entity the task to run to the banner
   self._approach_task = citizen:get_component('stonehearth:ai')
                           :get_task_group('stonehearth:unit_control')
                                 :create_task('stonehearth:goto_town_center', {town = town})
                                 :set_priority(stonehearth.constants.priorities.unit_control.DEFAULT)
                                 :once()
                                 :start()

   self:_greet_citizen(citizen)
end

function NatalGrowthComponent:_create_citizen()
   local pop = stonehearth.population:get_population(self._sv._player_id)
   local citizen = pop:create_new_citizen()

   citizen:add_component('stonehearth:job')
   			-- Possibility: Make "baby" job?
			:promote_to('stonehearth:jobs:worker')
   return citizen
end

function NatalGrowthComponent:_greet_citizen(citizen)
   --Send a bulletin with to inform player someone has joined their town
   local title = 'bastioneers:data.bastioneers_population.greet_title'
   local pop = stonehearth.population:get_population(self._sv._player_id)
   pop:show_notification_for_citizen(citizen, title)
end

function NatalGrowthComponent:_end_growth_timer()
	if self._sv._natal_growth_timer then
		self._sv._natal_growth_timer:destroy()
		self._sv._natal_growth_timer = nil
	end
	self.__saved_variables:mark_changed()
end

function NatalGrowthComponent:destroy()
   if self._added_to_world_trace then
      self._added_to_world_trace:destroy()
      self._added_to_world_trace = nil
   end
   self:_end_growth_timer()
end

function NatalGrowthComponent:_destroy_self()
	-- End timers and world traces
	self:destroy()
	-- Destroy the natal stone, it has hatched.
	radiant.entities.destroy_entity(self._entity)
end

return NatalGrowthComponent