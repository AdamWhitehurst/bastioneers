--[[
   Observes the HP of the entity and shows popup toasts based on their current HP
]]

local KillAtZeroHealthObserver = class()

function KillAtZeroHealthObserver:initialize()
   self._sv.entity = nil
end

--Called once on creation
function KillAtZeroHealthObserver:create(entity)
   self._sv.entity = entity
end

function KillAtZeroHealthObserver:restore(entity)
   -- Need to add this on restore in case we're an older save that doesn't have this
   self._sv.entity:add_component('stonehearth:expendable_resources')
end

--Always called. If restore, called after restore.
function KillAtZeroHealthObserver:activate()
   self._entity = self._sv.entity
   self._listener = radiant.events.listen(self._entity, 'stonehearth:expendable_resource_changed:health', self, self._on_health_changed)
end

function KillAtZeroHealthObserver:destroy()
   if self._listener then
      self._listener:destroy()
      self._listener = nil
   end
end

function KillAtZeroHealthObserver:_on_health_changed(e)
   local health = radiant.entities.get_health(self._entity)
   if health <= 0 then
      self._listener:destroy()
      self._listener = nil
      radiant.entities.kill_entity(self._entity)
   end
end

return KillAtZeroHealthObserver
