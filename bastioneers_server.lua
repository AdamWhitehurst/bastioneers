bastioneers = {}

local function create_service (name)
   local path = string.format('services.server.%s.%s_service', name, name)
   local service = require(path)()
   local saved_variables = bastioneers._sv[name]

   if not saved_variables then
      saved_variables = radiant.create_datastore()
      bastioneers._sv[name] = saved_variables
   end

   service.__saved_variables = saved_variables
   service._sv = saved_variables:get_data()
   saved_variables:set_controller(service)
   service:initialize()
   bastioneers[name] = service
end

function bastioneers:_on_init()
   bastioneers._sv = bastioneers.__saved_variables:get_data()
   local old_fnc = stonehearth.game_master.start
   create_service('piety')
	stonehearth.game_master.start = function(self, ...)

	local ret = { old_fnc(self, ...) }
	self:_start_campaign('bastioneers_campaign')
	self:_start_campaign('trader')
   	return unpack(ret)

	end
end

radiant.events.listen(radiant, 'radiant:required_loaded', bastioneers, bastioneers._on_init)
return bastioneers
