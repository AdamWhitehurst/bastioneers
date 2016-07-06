 local Durability = class()

-- Called when the component is first created
function Durability:initialize()
	self._sv._total_durability = nil
	self._sv._current_durability = nil
	self._sv._bulletin = nil
	if not self._sv.initialized then 
		local json = radiant.entities.get_json(self)
		if json then
		    self._sv._total_durability = json.total_durability
		    self._sv._current_durability = json.total_durability
		    self._sv.initialized = true
		    self.__saved_variables:mark_changed()
		end
	end
	self._sv._owner = nil
end

function Durability:activate()
	self:_listen_new_owner()
	self._owner_change_listener = radiant.events.listen(self._entity, 'stonehearth:equipment_piece:equip_changed', self, self._on_owner_changed)
end
-- Called on equip or unequip
function Durability:_on_owner_changed(e)
	self._sv._owner = self:get_owner()
	if self._sv._owner then
		self:_listen_new_owner()
	else
		if self._battery_listener then
			self._battery_listener:destroy()
			self._battery_listener = nil
		end
	end
end
-- Called when the item has a new owner
function Durability:_listen_new_owner()
	if self._sv._owner then
		if self._battery_listener then
			self._battery_listener:destroy()
		end
		if self:get_item_type() == 'armor' then
	    	self._battery_listener = radiant.events.listen(self._sv._owner, 'stonehearth:combat:battery', self, self._on_battery)
    	else
    		self._battery_listener = radiant.events.listen(self._sv._owner, 'stonehearth:combat:assault', self, self._on_battery)
    	end
	end
end
-- Called upon taking damage for armor, or upon dealing damage for weapons
function Durability:_on_battery(e)
    self:reduce_current_durability(e.damage)
end

function Durability:_notify_player_of_break()
	local name = self:_get_user_visible_name()
  	local player_id = radiant.entities.get_player_id(self._sv._owner)
  	local owner_name = radiant.entities.get_custom_name(self._sv._owner)
  	self._sv._bulletin = stonehearth.bulletin_board:post_bulletin(player_id)
    	:set_type('alert')
    	:set_data({
      title = 'bastioneers:ui.game.bulletin.durability.break_message',
    })
    :add_i18n_data('name', owner_name)
    :add_i18n_data('item', name)
    radiant.events.trigger_async(bastioneers.piety,'bastioneers:durability:break')
    self.__saved_variables:mark_changed()
    self:_destroy_item()
end

function Durability:_get_user_visible_name()
   local item_data = radiant.resources.load_json(self._entity:get_uri())
   if item_data.components.unit_info then
      return item_data.components.unit_info.display_name
   elseif item_data.components['stonehearth:iconic_form'] then
      local full_sized_data =  radiant.resources.load_json(item_data.components['stonehearth:iconic_form'].full_sized_entity)
      return full_sized_data.components.unit_info.display_name
   end
end

function Durability:get_current_durability ()
   return self._sv._current_durability
end

function Durability:increase_current_durability (amount)
	if amount and self._sv.current_durability then
   		self._sv._current_durability = self._sv._current_durability + amount
   		self.__saved_variables:mark_changed()
	end
end

function Durability:reduce_current_durability (amount)
	if self._sv._current_durability then
		if amount then
	   		self._sv._current_durability = self._sv._current_durability - amount
	   		self.__saved_variables:mark_changed()
	   	end
	   	if self._sv._current_durability <= 0 then
	   		bastioneers.piety:add_piety(3)
	   		self:_notify_player_of_break()
	   	end
   	end
end

function Durability:reset_current_durability ()
   self._sv._current_durability = self._sv._total_durability
   self.__saved_variables:mark_changed()
end

function Durability:_destroy_item()
	self:_destroy()
	self:_unequip_broken_item()
	self.__saved_variables:mark_changed()
end

function Durability:_unequip_broken_item()
	local old_item_type = self:get_item_type()
	local job_component = self:get_owner():get_component('stonehearth:job')
	local equipment_piece = self._entity:get_component('stonehearth:equipment_piece')
	local equipment_slot = equipment_piece:get_slot()
    local replacement_item
	if job_component then
		local job_json = job_component:get_job_info():get_description_json()
		if job_json then
			for _, items in pairs(job_json.equipment) do
				local item_json = radiant.resources.load_json(items)
                if item_json.components['stonehearth:equipment_piece'].slot == equipment_slot then
					replacement_item = items
				end
	      	end
		end
	end
	if replacement_item then
	    radiant.entities.equip_item(self:get_owner(), replacement_item)
	end
		equipment_piece:unequip()
	radiant.entities.destroy_entity (self._entity)
end

function Durability:_destroy()
	if self._owner_change_listener then
		self._owner_change_listener:destroy()
		self._owner_change_listener = nil
	end
	if self._battery_listener then
		self._battery_listener:destroy()
		self._battery_listener = nil
	end
end

function Durability:get_owner()
	local equipment_piece_component = self._entity:get_component('stonehearth:equipment_piece')
	if equipment_piece_component then
		return equipment_piece_component:get_owner()
	end
end

function Durability:get_item_type()
	local item_data = radiant.entities.get_component_data(self._entity, 'item')
	if item_data and item_data.category then
		return item_data.category
 	end
end
return Durability