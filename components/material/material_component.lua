--[[
   Todo, document this thing
]]
local SvTable = require 'radiant.lib.sv_table'
local Material = require 'components.material.material'

local MaterialComponent = class()

function MaterialComponent:initialize()
   self._sv.tags = {}
   self._sv.tags_string = ''
   self._sv.tags_modified = false
end

function MaterialComponent:create()
   self:_read_tags_from_json()
end

function MaterialComponent:restore()
   if self._sv.tags_modified then
      self:set_tag_string(self._sv.tags_string)
   else
      self:_read_tags_from_json()
   end
end

function MaterialComponent:_read_tags_from_json()
   local json = radiant.entities.get_json(self)
   local tags = json and json.tags or ''
   self:set_tag_string(tags)
   if json and json.tags_modified and json.tags_modified == true then
      self._sv.tags_modified = true
   end
end

function MaterialComponent:activate()
   -- self._sv.tags is accessed a LOT, so cache it off.
   self._tags = self._sv.tags
   SvTable.lock_field(self._sv, 'tags')
end

function MaterialComponent:is(tags_string)
   -- if self._tags hasn't been cached (e.g. someone is calling us from their activate, use the slow one)
   local tags = self._tags or self._sv.tags

   for tag in tags_string:gmatch("([^ ]*)") do
      -- gmatch will return either 1 tag or the empty string.
      -- make sure we skip over the empty strings!
      if tag ~= '' and not tags[tag] then
         return false
      end
   end
   return true
end

function MaterialComponent:contains_all_parts(other)
   return self._material:contains_all_parts(other)
end

function MaterialComponent:get_tags()
   return self._tags
end

-- generally, you should not be using "get_string".  if you want
-- to see if this material matches some pattern, use `:is()` to check
-- each tag individually.
function MaterialComponent:get_string()
   return self._sv.tags_string
end

function MaterialComponent:_build_string_from_tags()
   self._sv.tags_string = nil

   for s, _ in pairs(self._tags) do
      if self._sv.tags_string then
         self._sv.tags_string = self._sv.tags_string .. ' ' .. s
      else
         self._sv.tags_string = s .. ''
      end
   end
end

function MaterialComponent:_rebuild_material_from_tags()
   self:_build_string_from_tags()
   self._material = Material(self._sv.tags_string)
end

function MaterialComponent:set_tag_string(tag_string, set_as_modified)
   radiant.clear_table(self._sv.tags)
   assert(radiant.empty(self._sv.tags))

   self._sv.tags_string = tag_string
   self._material = Material(tag_string)
   if tag_string then
      for _, tag in ipairs(radiant.util.split_string(tag_string)) do
         self._sv.tags[tag] = true
      end
   end
   if set_as_modified then
      self._sv.tags_modified = true
   end
   self.__saved_variables:mark_changed()
end

return MaterialComponent
