local game_master_lib = require 'stonehearth.lib.game_master.game_master_lib'
local DialogTreeEncounter = require 'stonehearth.services.server.game_master.controllers.encounters.dialog_tree_encounter'
local log = radiant.log.create_logger('game_master.encounters.random_thought_tree')
local Entity = _radiant.om.Entity
local rng = _radiant.math.get_default_rng()

local RandomThoughtTreeEncounter = class()
radiant.mixin(RandomThoughtTreeEncounter, DialogTreeEncounter)
function RandomThoughtTreeEncounter:initialize()
   self._sv._random_citizen = {}
	DialogTreeEncounter.initialize(self)
end

function RandomThoughtTreeEncounter:start(ctx, info)
   DialogTreeEncounter.start(self)
end

function RandomThoughtTreeEncounter:_get_random_citizen_portrait()
	local player_id = self._sv.ctx._sv.player_id
	local pop = stonehearth.population:get_population(player_id)
	local random_int = rng:get_int(0, pop:get_population_size(player_id))
	local citizens = pop:get_citizens()
	self._sv._random_citizen = citizens[random_int]
end

function RandomThoughtTreeEncounter:_transition_to_node(name)

   local ctx = self._sv.ctx

   local node = self._sv.dialog_tree[name]
   if not node then
      log:error('no dialog tree node named \"%s\"', name)
      ctx.arc:terminate(ctx)
      return
   end

   local bulletin = self._sv.bulletin
   if not bulletin then
      local player_id = ctx.player_id
      bulletin = stonehearth.bulletin_board:post_bulletin(player_id)
                                    :set_ui_view('StonehearthDialogTreeBulletinDialog')
                                    :set_callback_instance(self)
                                    :set_type('quest')
                                    :set_sticky(true)
                                    :set_keep_open(true)
                                    :set_close_on_handle(false)

      if self._sv._i18n_data then
         for i18n_var_name, i18n_var_path in pairs(self._sv._i18n_data) do
            local i18n_var = ctx:get(i18n_var_path) or i18n_var_path
            if i18n_var then
               bulletin:add_i18n_data(i18n_var_name, i18n_var)
            end
         end
      end
   
      self._sv.bulletin = bulletin
   end
   bulletin:set_data(node.bulletin)
end