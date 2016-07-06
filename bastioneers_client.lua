bastioneers = {
   constants = require 'constants'
}
local player_service_trace = nil

local function check_override_ui(players, player_id)
   -- Load ui mod
   if not player_id then
      player_id = 'player_1'
   end
   local client_player = players[player_id]
   if client_player then
      if client_player.kingdom == "bastioneers:kingdoms:bastioneers" then
         -- hot load bastioneers-only gameplay elements mod
         _radiant.res.load_mod("bastioneers")
         _radiant.res.load_mod("bastioneers_playing")
      end
   end
end

local function trace_player_service()
   _radiant.call('stonehearth:get_service', 'player')
      :done(function(r)
         local player_service = r.result
         check_override_ui(player_service:get_data().players)
         player_service_trace = player_service:trace('bastioneers change')
               :on_changed(function(o)
                     check_override_ui(player_service:get_data().players)
                  end)
         end)
end

radiant.events.listen(bastioneers, 'radiant:init', function()
      trace_player_service()
   end)

return bastioneers
