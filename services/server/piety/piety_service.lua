local Entity = _radiant.om.Entity
local Point3 = _radiant.csg.Point3

local PietyService = class()

function PietyService:initialize()
	self._sv = self.__saved_variables:get_data()
	if not self._sv.initialized then
	    self._sv._piety_points = 10
	    self._sv._bulletin = {}
		self._sv.initialized = true
		self.__saved_variables:mark_changed()
	end
	self._sv.piety_decay = stonehearth.calendar:set_persistent_interval("Piety Decay", "3h" , 
		function ()
			self:add_piety(1) 
		end, "3h"
	)
end

function PietyService:_on_game_loaded()
	self.ui_listener = radiant.events.listen(radiant, 'stonehearth:ui_mode_changed', self, self:_set_gridlines())
end

function PietyService:get_piety_amount()
	return self._sv._piety_points
end

function PietyService:add_piety(amount)
	self._sv._piety_points = self._sv._piety_points + amount
	self.__saved_variables:mark_changed()
	radiant.events.trigger_async(self, "bastioneers:piety_increased")
end

function PietyService:subtract_piety(amount)
	self._sv._piety_points = self._sv._piety_points - amount
	self.__saved_variables:mark_changed()
	radiant.events.trigger_async(self, "bastioneers:piety_decreased")
end

function PietyService:buff_command(session, response, entity, buff_uri)
    local caller = radiant.entities.get_player_id (entity)
	local population = stonehearth.population:get_population(caller)
    for _, citizen in population:get_citizens():each() do
		radiant.entities.add_buff(citizen, buff_uri)
	end
end

function PietyService:_notify_player(alert)
  	self._sv._bulletin = stonehearth.bulletin_board:post_bulletin('player_1')
    	:set_data({
      -- title = 'bastioneers:ui.game.bulletin.piety.alert_message',
      title = alert
    })
end

return PietyService