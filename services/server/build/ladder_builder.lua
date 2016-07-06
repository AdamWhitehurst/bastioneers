local priorities = require('constants').priorities.simple_labor

local Point2 = _radiant.csg.Point2
local Point3 = _radiant.csg.Point3

local LadderBuilder = class()

function LadderBuilder:initialize()
   self._sv.id = nil
   self._sv.ladder_handles = {}   
   self._sv.manager = nil
   self._sv.ladder = nil
   self._sv.base = nil
   self._sv._build_mode = nil
   self._sv.user_extension_handle = nil
   self._sv.user_requested_removal = false
   self._sv.ladder_dst_proxy_region = nil
   self._sv.ladder_dst_proxy = nil
   self._sv.category = 'building'

   self._log = radiant.log.create_logger('build.ladder')
end


function LadderBuilder:create(manager, id, owner, base, normal, options)
   self._sv.id = id
   self._log:set_prefix('lbid:' .. tostring(self._sv.id))

   local ladder = radiant.entities.create_entity('stonehearth:build:prototypes:ladder', { owner = owner })
   ladder:set_debug_text('builder id:' .. tostring(id))
   self._sv.manager = manager
   self._sv.ladder = ladder
   self._sv.base = base
   if options.category then
      self._sv.category = options.category
   end

   -- The destination region at the top and/or bottom of the ladder that we can use to 
   -- build or teardown the ladder.
   self._sv.ladder_dst_proxy_region = _radiant.sim.alloc_region3()
   self._sv.ladder_dst_proxy = radiant.entities.create_entity('stonehearth:build:prototypes:ladder_dst_proxy', { owner = owner })
   self._sv.ladder_dst_proxy:add_component('destination')
                                       :set_region(self._sv.ladder_dst_proxy_region)
   self._sv.ladder_dst_proxy:add_component('stonehearth:ladder_dst_proxy')
                                       :set_ladder_builder(self)

   self.__saved_variables:mark_changed()

   radiant.terrain.place_entity_at_exact_location(ladder, base)
   radiant.terrain.place_entity_at_exact_location(self._sv.ladder_dst_proxy, base)

   ladder:add_component('stonehearth:ladder')
            :set_normal(normal)

   ladder:add_component('vertical_pathing_region')
            :set_region(_radiant.sim.alloc_region3())
end

function LadderBuilder:restore()
   if not self._sv.ladder_dst_proxy then
      -- TODO(yshan) Remove after alpha 12. Fix up older ladder builders.
      self._sv.ladder_dst_proxy_region = _radiant.sim.alloc_region3()
      local player_id = radiant.entities.get_player_id(self._sv.ladder)
      self._sv.ladder_dst_proxy = radiant.entities.create_entity('stonehearth:build:prototypes:ladder_dst_proxy', { owner = player_id })
      self._sv.ladder_dst_proxy:add_component('destination')
                                          :set_region(self._sv.ladder_dst_proxy_region)
      self._sv.ladder_dst_proxy:add_component('stonehearth:ladder_dst_proxy')
                                          :set_ladder_builder(self)
   end

   self:_update_teardown_effect()
end

function LadderBuilder:activate()
   -- Don't call methods on other datastores in here or in restore since they
   -- might not have been restored yet.
   self._log:set_prefix('lbid:' .. tostring(self._sv.id))
end

-- We can finally make calls to other datastores here.
function LadderBuilder:post_activate()
   if not self._sv.ladder or not self._sv.ladder:is_valid() then
      -- Ladder was probably destroyed on load, so destroy the builder (us) too.
      self._sv.manager:_destroy_builder(self._sv.base, self)
      return
   end
   self:_install_traces()
   self:_update_task()
end

function LadderBuilder:get_id()
   return self._sv.id
end

function LadderBuilder:get_category()
   return self._sv.category
end

function LadderBuilder:_install_traces()
   local vpr_component = self._sv.ladder:get_component('vertical_pathing_region')
   self._vpr_trace = vpr_component:trace_region('ladder builder')
                                    :on_changed(function()
                                          self:_update_build_mode()
                                       end)

   self._ladder_dtor_trace = self._sv.ladder:trace('ladder builder')
                                    :on_destroyed(function()
                                          self._sv.manager:_destroy_builder(self._sv.base, self)
                                       end)
end

function LadderBuilder:destroy()   
   self._sv._build_mode = nil

   if self._sv.ladder_dst_proxy then
      radiant.entities.destroy_entity(self._sv.ladder_dst_proxy)
      self._sv.ladder_dst_proxy = nil
      self._sv.ladder_dst_proxy_region = nil
   end

   if self._vpr_trace then
      self._vpr_trace:destroy()
      self._vpr_trace = nil
   end   
   if self._ladder_dtor_trace then
      self._ladder_dtor_trace:destroy()
      self._ladder_dtor_trace = nil
   end
   if self._sv.ladder then
      radiant.entities.destroy_entity(self._sv.ladder)
      self._sv.ladder = nil
      self.__saved_variables:mark_changed()
   end
   if self._teardown_effect then
      self._teardown_effect:stop()
      self._teardown_effect = nil
   end
end

function LadderBuilder:add_point(to, options)
   assert(self._sv.ladder:is_valid())

   self._log:spam('adding point %s to ladder', to)

   local ladder_handle = radiant.create_controller('stonehearth:build:ladder_builder:destructor', self, to)
   table.insert(self._sv.ladder_handles, ladder_handle)

   if options.user_removable then
      if not self._sv.user_extension_handle then
         self._sv.ladder:add_component('stonehearth:commands')
                          :add_command('stonehearth:commands:remove_ladder')
      else
         assert(to.y >= self._sv.user_extension_handle:get_climb_to().y)
         self:release_handle(self._sv.user_extension_handle)
      end
      self._sv.user_extension_handle = ladder_handle
   end
   
   self.__saved_variables:mark_changed()   
   self:_update_build_mode()

   return ladder_handle
end

function LadderBuilder:release_handle(ladder_handle)
   -- It's possible for a LadderBuilderDestructor to hang around after the actual ladder
   -- is gone, so check to make sure we're even valid.
   if not self._sv.ladder or not self._sv.ladder:is_valid() then
      return
   end

   self._log:spam('releasing point %s from ladder', ladder_handle:get_climb_to())

   local ladder_handles = self._sv.ladder_handles
   local c = #ladder_handles

   for i = 1, c do
      if ladder_handles[i] == ladder_handle then
         local last_handle = table.remove(ladder_handles, c)
         if i < c then
            ladder_handles[i] = last_handle
            assert(#ladder_handles == c - 1)
         end
         break
      end
   end
   self.__saved_variables:mark_changed()   
   self:_update_build_mode()
end

function LadderBuilder:has_point()
   return next(self._sv.ladder_handles) ~= nil
end

function LadderBuilder:remove_user_extension()
   if not self._sv.user_extension_handle then
      return
   end

   -- set this before calling destroy on the handle, since that will update the build mode
   self._sv.user_requested_removal = true
   
   self._sv.user_extension_handle:destroy()
   self._sv.user_extension_handle = nil
   self.__saved_variables:mark_changed()

   -- removing any point may end up destroying the ladder builder.
   -- if that happens, just bail right away
   if not self._sv.ladder then
      return
   end
   
   local commands_component = self._sv.ladder:get_component('stonehearth:commands')
   if commands_component then
      commands_component:remove_command('stonehearth:commands:remove_ladder')
   end
   
   self:_update_build_mode()
   -- force update the teardown effect because if build mode is already teardown
   -- which it will be when the ladder is finished, then mode == mode and build mode won't update
   self:_update_teardown_effect()
end

function LadderBuilder:get_ladder()
   return self._sv.ladder
end

function LadderBuilder:get_material()
   return 'wood resource'
end

function LadderBuilder:vpr_is_empty()
   local vpr_component = self._sv.ladder:get_component('vertical_pathing_region')
   return vpr_component:get_region():get():empty()
end

function LadderBuilder:get_vpr_top()
   local vpr_component = self._sv.ladder:get_component('vertical_pathing_region')
   local bounds = vpr_component:get_region():get():get_bounds()
   local top = bounds.max - Point3.one
   return top
end

-- returns the top requested ladder point in local coordinates
function LadderBuilder:_get_climb_to()
   local origin = radiant.entities.get_world_grid_location(self._sv.ladder)
   local top
   for _, ladder_handle in pairs(self._sv.ladder_handles) do
      local pt = ladder_handle:get_climb_to()
      if not top or pt.y > top.y then
         top = pt
      end
   end

   if top then
      assert(top.x == origin.x and top.z == origin.z)
   end

   return top and top - origin
end

function LadderBuilder:_get_actual_ladder_height()
   if not self._sv.ladder then
      return 0
   end
   local bounds = self._sv.ladder:get_component('vertical_pathing_region'):get_region()
                           :get():get_bounds()
   return bounds.max.y - bounds.min.y
end

function LadderBuilder:_update_build_mode()
   local climb_to = self:_get_climb_to()
   local desired_height = climb_to and climb_to.y + 1 or 0

   local ladder_component = self._sv.ladder:get_component('stonehearth:ladder')
   ladder_component:set_desired_height(desired_height)

   local actual_height = self:_get_actual_ladder_height()

   self._log:spam('desired height of ladder is now %d (actual:%d)', desired_height, actual_height)
   if desired_height > actual_height then
      -- build ladder
      self:_update_ladder_dst_proxy_region(desired_height, true)
      self:set_build_mode('build')
   else
      if not self:vpr_is_empty() then
         -- teardown ladder
         -- only user requested ladders can be removed from the top
         local allow_top_destination = self._sv.user_requested_removal
         local top = self:get_vpr_top() + Point3.unit_y
         self:_update_ladder_dst_proxy_region(top.y, allow_top_destination)
         self:set_build_mode('teardown')
      else
         -- destroy ladder
         self:set_build_mode(nil)
         self:_check_if_valid()
      end
   end
end

function LadderBuilder:is_ladder_finished(mode)
   assert(type(mode) == 'string', 'is_ladder_finished called with neither "build" nor "teardown"')
   if not self._sv.ladder or not self._sv.ladder:is_valid() then
      return true
   end

   if mode ~= 'internal' and mode ~= self._sv._build_mode then
      -- if they asked for a different mode than the one we're in, return true.
      -- for example, if we're in "build" mode, we're obviously done tearing it
      -- down.
      return true
   end

   local vpr_component = self._sv.ladder:get_component('vertical_pathing_region')
   local ladder_component = self._sv.ladder:get_component('stonehearth:ladder')

   -- ladders are 1x1, so we're done if the area equals the desired height
   local size = vpr_component:get_region()
                                 :get()
                                    :get_area()

   self._log:spam(' is_ladder_finished: size:%d  full:%d  current:mode:%s  asking_mode:%s',
                  size, ladder_component:get_desired_height(), self._sv._build_mode, tostring(mode))
   return size == ladder_component:get_desired_height()
end

function LadderBuilder:insta_build()
   local ladder_component = self._sv.ladder:get_component('stonehearth:ladder')
   local completed_height = self:_get_completed_height()
   local top = ladder_component:get_desired_height()

   while completed_height ~= top do
      self:grow_ladder('up')
      completed_height = self:_get_completed_height()
   end
   self:_update_build_mode()
end

function LadderBuilder:grow_ladder(direction)
   if self:is_ladder_finished('build') then
      self._log:spam('ladder is already finished in grow_ladder')
      return
   end

   local ladder_component = self._sv.ladder:get_component('stonehearth:ladder')
   local vpr_component = self._sv.ladder:get_component('vertical_pathing_region')

   vpr_component:get_region():modify(function(r)
         local rung
         local top = ladder_component:get_desired_height()

         -- don't use bounds logic like in shrink_ladder in case we grew ladder from
         -- both directions and the tasks were interrupted
         if direction == 'up' then            
            rung = Point3(0, 0, 0)
            while rung.y < top and r:contains(rung) do
               rung.y = rung.y + 1
            end
         else
            rung = Point3(0, top - 1, 0)
            while rung.y > 0 and r:contains(rung) do
               rung.y = rung.y - 1
            end
         end
         self._log:spam('adding point %d to ladder while growing %s', rung.y, direction)

         r:add_point(rung)

         self._log:spam('ladder bounds are now %s', r:get_bounds())
      end)
end

function LadderBuilder:shrink_ladder(direction)
   if self:is_ladder_finished('teardown') then
      self._log:spam('ladder is already finished in grow_ladder')
      return
   end

   local vpr_component = self._sv.ladder:get_component('vertical_pathing_region')
   if vpr_component:get_region():get():empty() then
      self._log:debug('vpr is empty in shrink_ladder.  returning')
      return
   end

   vpr_component:get_region():modify(function(r)
         local bounds = r:get_bounds()
         local y

         if direction == 'up' then
            y = bounds.min.y
         else
            y = bounds.max.y - 1
         end
         self._log:debug('shrinking ladder in the %s direction by removing y %d', direction, y)

         r:subtract_point(Point3(bounds.min.x, y, bounds.min.z))
         self._log:debug('region bounds are now %s', r:get_bounds())
      end)
end

function LadderBuilder:_update_ladder_dst_proxy_region(ladder_height, allow_top_destination)
   self._sv.ladder_dst_proxy_region:modify(function(cursor)
         cursor:clear()
         if not self:is_ladder_finished('internal') then
            cursor:add_point(Point3.zero)
            if allow_top_destination then
               cursor:add_point(Point3(0, ladder_height, 0))
            end
         end
      end)
end

function LadderBuilder:_check_if_valid()
   -- if no one wants the ladder around anymore, destroy it
   if not self:has_point() and self:vpr_is_empty() then
      self._sv.manager:_destroy_builder(self._sv.base, self)
   end
end

function LadderBuilder:_update_task()
   local mode = self._sv._build_mode
   local ladder_id = self._sv.ladder:get_id()
   local player_id = radiant.entities.get_player_id(self._sv.ladder)

   local task = mode and mode .. '_ladder' or ''
   self._log:detail('setting requested task to "%s"', task)
   
   stonehearth.town:get_town(player_id)
                     :set_requested_task(ladder_id, task)
end

function LadderBuilder:set_build_mode(mode)
   if mode ~= self._sv._build_mode then
      self._log:spam('changing build mode from %s to %s', tostring(self._sv._build_mode), tostring(mode))
      self._sv._build_mode = mode
      stonehearth.ai:reconsider_entity(self._sv.ladder_dst_proxy, 'ladder build mode changed')

      self:_update_task()
      self:_update_teardown_effect()
   end
end

function LadderBuilder:_update_teardown_effect()
   -- see if we need the teardown effect
   local show_teardown_effect = (self._sv._build_mode == 'teardown') and self._sv.user_requested_removal
   if show_teardown_effect then
      if not self._teardown_effect then
         self._teardown_effect = radiant.effects.run_effect(self._sv.ladder,
                                                            'stonehearth:effects:undeploy_overlay_effect')
      end
   else
      if self._teardown_effect then
         self._teardown_effect:stop()
         self._teardown_effect = nil
      end
   end
end

function LadderBuilder:get_build_mode()
   return self._sv._build_mode
end

return LadderBuilder
