$(document).ready(function(){
   App.stonehearth.showTeamWorkshopView = null;

   //Show the team workshop from the workshops, and from the crafter
   $(top).on("radiant_show_workshop", function (_, e) {
      App.stonehearthClient.openCrafterMenu(e.event_data.crafter_type, true); // True for close if view already open.
   });

   $(top).on("radiant_show_workshop_from_crafter", function (_, e) {
      App.stonehearthClient.openCrafterMenu(e.event_data.crafter_type, true);  // True for close if view already open.
   });

});

App.StonehearthTeamCrafterView = App.View.extend({
   templateName : 'stonehearthTeamCrafter', 
   uriProperty: 'model',
   closeOnEsc: true,
   components: {
      "order_list" : {
         "orders" : {
            "recipe" : {}
         }
      },
      "recipe_list" : {
         "*": {
            "recipes": {
               "*": {
                  "recipe": {
                     "product_uri": {},
                     "ingredients": [
                     ]
                  }
               }
            }
         }
      }
   },
   job_uri: null,

   initialized: false, 
   currentRecipe: null, 
   isPaused: false, 
   queueAnywayStatus: false,
   maxActiveOrders: 30,
   craft_button_text: 'stonehearth:ui.game.show_workshop.craft',

   //Get the skin class for this workshop
   //alias because the colon messes up bindAttr
   skinClass: function() {
      this.set('context.skinClass', this.get('model.skin_class'));
   }.observes('model.skin_class'),

   _playOpenSound: function() {
      var sound = this.get('model.open_sound');
      if (sound) {
         radiant.call('radiant:play_sound', {'track' : sound} );   
      }
   }.observes('model.open_sound'),

   _jobUriChanged: function() {
      var newUri = this.get('uri');
      if (newUri != this.job_uri) {
         this.job_uri = newUri;
         this.set('currentRecipe', null);
      }
   }.observes('uri'),

   getCurrentRecipe: function() {
      return this.currentRecipe;
   },

   makeSortable: function(element, args) {
      if (element) {
         if (args == 'destroy' && !element.is('.ui-sortable')) {
            return;
         }
         return element.sortable(args);
      }
   },

   didInsertElement: function() {
      var self = this
      this._super();

      if (!this.initialized) {
         this.initialized = true;
         $('#searchInput').attr('placeholder', i18n.t('stonehearth:ui.game.show_workshop.placeholder'));
         this.$('#recipeTab').show();
      }

      radiant.call('radiant:get_config', 'mods.stonehearth.max_crafter_orders')
         .done(function(response) {
            var maxCrafterOrders = response['mods.stonehearth.max_crafter_orders'];
            if (maxCrafterOrders) {
               self.set('maxActiveOrders', maxCrafterOrders);
            }
         })


      //init the inventory and usable object trackers
      radiant.call_obj('stonehearth.inventory', 'get_item_tracker_command', 'stonehearth:basic_inventory_tracker')
         .done(function(response) {
            var itemTraces = {
               "tracking_data" : {}
               };
            self._playerInventoryTrace = new StonehearthDataTrace(response.tracker, itemTraces)
               .progress(function(response) {
                  self.basicInventoryTracker = response.tracking_data;
                  self._updateDetailedOrderList();
               });
         })
         .fail(function(response) {
            console.error(response);
         });

      //init the inventory and usable object trackers
      radiant.call_obj('stonehearth.inventory', 'get_item_tracker_command', 'stonehearth:usable_item_tracker')
         .done(function(response) {
            var itemTraces = {
               "tracking_data" : {},
               }
            self._playerUsableInventoryTrace = new StonehearthDataTrace(response.tracker, itemTraces)
               .progress(function(response) {
                  self.usableInventoryTracker = response.tracking_data;
                  self._setPreviewStyling();
                  self._updateDetailedOrderList();
               });
         })
         .fail(function(response) {
            console.error(response);
         });

      self.$().on( 'click', '.craftNumericButton', function() {
         var button = $(this);
         var inputControl = button.parent().find('input');
         var oldValue = parseInt(inputControl.val());

         if (inputControl.prop('disabled')) {
            return;
         }

         if (button.text() == "-") {
            //trying to make as many as possible
            var inputMin = parseInt(inputControl.attr('min'));
            if (oldValue <= inputMin) {

               var allIngredients = self.$('.detailsView #ingredients .ingredient .requirementsMet');
               if (allIngredients && allIngredients.length > 0) {
                  var ingredientCount = allIngredients.length;
                  var maxOrdersMakeable = parseInt(inputControl.attr('max'));
                  for (var i=0; i < ingredientCount; ++i) {
                     var currentIngredient = $(allIngredients[i]);
                     var have = parseInt(currentIngredient.find('.numHave').html());
                     var required = parseInt(currentIngredient.find('.numNeeded').html());
                     var maxProduceable = Math.floor(have/required);
                     if (maxProduceable < maxOrdersMakeable) {
                        maxOrdersMakeable = maxProduceable;
                     }
                  }
               }
               if (maxOrdersMakeable > 0) {
                  // Note we plus 1 here because clicking on the - button will also subtract one from the number
                  // That listener is in input.js and we are basically trying to compete with it.
                  inputControl.val(maxOrdersMakeable + 1).change();
               }
            }
         }
      });
   },


   destroy: function() {
      if (this._playerInventoryTrace) {
         this._playerInventoryTrace.destroy();
         this._playerInventoryTrace = null;
      }
      if (this._playerUsableInventoryTrace) {
         this._playerUsableInventoryTrace.destroy();
         this._playerUsableInventoryTrace = null;
      }

      radiant.keyboard.setFocus(null);
      App.stonehearth.showTeamWorkshopView = null;
      this._super();
   },

   willDestroyElement: function() {
      this.$().find('.tooltipstered').tooltipster('destroy');
      this.$('#craftButton').off('mouseenter mouseleave');
      this.$('#searchInput').off('keyup');
      this.$('#orders').off('overflowchanged');
      this.makeSortable(this.$('#orders, #garbageList'), 'destroy');
      this.makeSortable(this.$('#orderListContainer table'), 'destroy');
      this.$('#orders, #garbageList').enableSelection();
      this.$('#orderListContainer table').enableSelection();
      this._super();
   },

   getOrderList: function(){
      return this.get('model.order_list').__self;
   },

   _buildRecipeArray: function() {
      var self = this;
      var recipes = this.get('model.recipe_list');
      var recipe_categories = [];
      self.allRecipes = {};

      radiant.each(recipes, function(_, category) {
         var recipe_array = [];
         radiant.each(category.recipes, function(recipe_key, recipe_info) {
            var recipe = recipe_info.recipe
            var formatted_recipe = radiant.shallow_copy(recipe);

            //Add ingredient images to the recipes
            formatted_recipe.ingredients = []
            radiant.each(recipe.ingredients, function(i, ingredient) {
               var formatted_ingredient = radiant.shallow_copy(ingredient);
               if (formatted_ingredient.material) {
                  formatted_ingredient.identifier = formatted_ingredient.material.split(' ').sort().join(' ');
                  formatted_ingredient.kind = 'material';
                  var formatting = App.resourceConstants.resources[ingredient.material];
                  if (formatting) { 
                     if (App.population.getKingdom() == 'bastioneers:kingdoms:bastioneers' && formatting.b_name && formatting.b_icon) {
                        formatted_ingredient.name = i18n.t(formatting.b_name);
                        formatted_ingredient.icon = formatting.b_icon;
                     }
                     else {
                        formatted_ingredient.name = i18n.t(formatting.name);
                        formatted_ingredient.icon = formatting.icon;
                     }                  
                  } else {
                     // XXX, roll back to some generic icon
                     formatted_ingredient.name = i18n.t(ingredient.material);
                  }
               } else {
                  formatted_ingredient.identifier = formatted_ingredient.uri;
                  formatted_ingredient.kind = 'uri';

                  if (ingredient.uri) {
                     var catalog = App.catalog.getCatalogData(ingredient.uri);
                     if (catalog) {
                        formatted_ingredient.icon = catalog.icon;
                        formatted_ingredient.name = i18n.t(catalog.display_name);
                        formatted_ingredient.uri = ingredient.uri;
                     }
                  } else {
                     console.log ("no ingredient uri " + recipe_key);
                  }
               }
               formatted_recipe.ingredients.push(formatted_ingredient);

               //Add the workbench to the formatted recipe
               formatted_recipe.hasWorkshop = recipe.workshop != null;
               var formatted_workshop = {}
               formatted_workshop.uri = recipe.workshop;
               if (formatted_recipe.hasWorkshop) {
                  var workshopCatalog = App.catalog.getCatalogData(recipe.workshop);
                  if (workshopCatalog) {
                     formatted_workshop.icon = workshopCatalog.icon;
                     formatted_workshop.name = i18n.t(workshopCatalog.display_name);
                  }
                  formatted_recipe.workshop = formatted_workshop;
               }
            });
            formatted_recipe.display_name = i18n.t(formatted_recipe.recipe_name);
            formatted_recipe.is_locked = false;
            formatted_recipe.is_hidden = false;
            recipe_array.push(formatted_recipe);
            self.allRecipes[formatted_recipe.recipe_key] = formatted_recipe;
         });

         //For each of the recipes inside each category, sort them by their level_requirement
         recipe_array.sort(self._compareByLevelAndAlphabetical);

         if (recipe_array.length > 0) {
            var ui_category = {
               category: category.name,
               ordinal:  category.ordinal,
               recipes:  recipe_array,
            };
            recipe_categories.push(ui_category)
         }
      });

      //Sort the recipe categories by ordinal
      recipe_categories.sort(this._compareByOrdinal);

      //The current recipe may have been oblivated by the change in recipes. If so, set it to null.
      //If not, set it back to its (potentially new) self
      if (this.currentRecipe && this.allRecipes[this.currentRecipe.recipe_key]) {
         this.set('currentRecipe', this.allRecipes[this.currentRecipe.recipe_key]);
      } else {
         self.set('currentRecipe', null);
      }

      self.set('recipes', recipe_categories);

   }.observes('model.recipe_list'),

   //Something with an ordinal of 1 should have precedence
   _compareByOrdinal: function(a, b) {
      return (a.ordinal - b.ordinal);
   },

   //Sort the recipies first by their level requirement, then by their user visible name
   _compareByLevelAndAlphabetical: function(a, b) {
      if (a.level_requirement < b.level_requirement) {
         return -1;
      }
      if (a.level_requirement > b.level_requirement) {
         return 1;
      }
      if (a.display_name < b.display_name) {
         return -1;
      }
      if (a.display_name > b.display_name) {
         return 1;
      }
      return 0;
   },

   //Updates the recipe display (note: now that this is just a variable, do we need a separate observer?)
   _updateRecipeLocking: function() {
      Ember.run.scheduleOnce('afterRender', this, '_updateRecipesNow');
   }.observes('model.highest_level', 'model.manually_unlocked'),

   _isRecipeHidden: function(recipe) {
      if (recipe.manual_unlock && !this.get('model.manually_unlocked')[recipe.recipe_key]) {
         return true;
      }

      return false;
   },

   // This doesn't check for is_hidden conditions, but if a recipe is hidden it should be locked as well
   _isRecipeLocked: function(recipe) {
      var curr_level = this.get('model.highest_level');
      if (recipe.level_requirement > curr_level) {
         return true;
      }

      return false;
   },

   _onCurrentRecipeChanged: function() {
      Ember.run.scheduleOnce('afterRender', this, '_setPreviewStyling');
   }.observes('currentRecipe'),

   // Update is_locked and is_hidden
   _updateRecipesNow: function() {
      for (var recipeName in this.allRecipes) {
         var recipe = this.allRecipes[recipeName];
         var is_hidden = this._isRecipeHidden(recipe);
         var is_locked = this._isRecipeLocked(recipe);
         Ember.set(recipe, 'is_hidden', is_hidden);
         Ember.set(recipe, 'is_locked', is_locked || is_hidden);
      }

      this._setPreviewStyling();
   },

   actions: {
      hide: function() {
         var sound = this.get('model.close_sound');
         if (sound) {
            radiant.call('radiant:play_sound', {'track' : sound} );   
         }
         this.destroy();
      },

      select: function(object, remaining, maintainNumber) {
         if (object) {
            this.set('currentRecipe', this.allRecipes[object.recipe_key]);
            this.queueAnywayStatus = false;
            if (this.currentRecipe) {
               //You'd think that when the object updated, the variable would update, but noooooo
               this.set('model.current', this.currentRecipe);
               this._setRadioButtons(remaining, maintainNumber);
               //TODO: make the selected item visually distinct
               this.preview();
            }
         }
      },

      //Call this function when the user is ready to submit an order
      craft: function() {
         if (this.$('#craftButtonLabel').hasClass('disabled')) {
            // TODO: play a error sound here?
            return;
         }
         radiant.call('radiant:play_sound', {'track' : 'stonehearth:sounds:ui:carpenter_menu:confirm'} );
         var recipe = this.getCurrentRecipe();

         var condition;
         var type = $('input[name=conditionGroup]:checked').val();
         if (type == "make") {
            condition = {
               type: "make",
               amount: this.$('#makeNumSelector').val(),
            }
         } else if (type == "maintain") {
            condition = {
               type: "maintain",
               at_least: this.$('#maintainNumSelector').val(),
            }
         }
         radiant.call_obj(this.getOrderList(), 'add_order_command', recipe, condition)
      },

      //delete the current order
      delete: function(orderId) {
         var orderList = this.getOrderList();
         radiant.call_obj(orderList, 'delete_order_command', orderId)
            .done(function(returnData){
               radiant.call('radiant:play_sound', {'track' : 'stonehearth:sounds:ui:carpenter_menu:trash'} );
            });
      },

      queueAnyway: function() {
         this._showCraftUI(true);
         this.queueAnywayStatus = true;
      },

      //Does anyone use this functionality?
      togglePause: function(){
         var orderList = this.getOrderList()

         if (this.get('model.order_list.is_paused')) {
            radiant.call('radiant:play_sound', {'track' : 'stonehearth:sounds:ui:carpenter_menu:open'} );
         } else {
            radiant.call('radiant:play_sound', {'track' : 'stonehearth:sounds:ui:carpenter_menu:closed'} );
         }
         radiant.call_obj(orderList, 'toggle_pause');
      },

      scrollOrderListUp: function() {
         this._scrollOrderList(-75)
      },

      scrollOrderListDown: function() {
         this._scrollOrderList(75)
      }
   },


   // Fires whenever the workshop changes, but the first update is all we really
   // care about. Recipes is saved on the context and updated when the recipe list first comes in
   // TODO: can't that fn just call _build_workshop_ui?
   _contentChanged: function() {
      Ember.run.scheduleOnce('afterRender', this, '_build_workshop_ui');
    }.observes('recipes'),

   //Called once when the model is loaded
   _build_workshop_ui: function() {
      var self = this;

      //TODO: some other check?
      //if (this.get('model.stonehearth:workshop') == undefined) {
      //   return;
      //}

      self._buildOrderList();

      self.$("#craftWindow")
         .animate({ top: 0 }, {duration: 500, easing: 'easeOutBounce'});

      self.$("#craftButton").hover(function() {
            $(this).find('#craftButtonLabel').fadeIn();
         }, function () {
            $(this).find('#craftButtonLabel').fadeOut();
         });

      self.$('#searchInput').keyup(function (e) {
         var search = $(this).val();

         if (!search || search == '') {
            self.$('.item').show();
            self.$('.category').show();
         } else {
            // hide items that don't match the search
            self.$('.item').each(function(i, item) {
               var el = $(item);
               var itemName = el.attr('title').toLowerCase();

               if(itemName.indexOf(search) > -1) {
                  el.show();
               } else {
                  el.hide();
               }
            })

            self.$('.category').each(function(i, category) {
               var el = $(category)

               if (el.find('.item:visible').length > 0) {
                  el.show();
               } else {
                  el.hide();
               }
            })
         }

      });

      self.$('[title]').tooltipster();
      // Select the first recipe if currentRecipe isn't set.
      // Current recipe can be set by autotest before we reach this point.
      if (!this.currentRecipe) {
         this._selectFirstValidRecipe();
      }
   },

   _selectFirstValidRecipe: function() {
      for (var i = 0; i < this.recipes.length; i++) {
         var recipes = this.recipes[i].recipes;
         for (var j = 0; j < recipes.length; j++) {
            if (!recipes[j].is_locked) {
               this.set('currentRecipe', this.allRecipes[recipes[j].recipe_key]);
               this.preview();
               return;
            }
         }
      }

   },

   _setRadioButtons: function(remaining, maintainNumber) {
      //Set the radio buttons correctly
      if (remaining) {
         this.$("#makeNumSelector").val(remaining);
         this.$("#make").prop("checked", "checked");
      } else {
         this.$("#makeNumSelector").val("1");
         this.$("#make").prop("checked", false);
      }
      if (maintainNumber) {
         this.$("#maintainNumSelector").val(maintainNumber);
         this.$("#maintain").prop("checked", "checked");
      } else {
         this.$("#maintainNumSelector").val("1");
         this.$("#maintain").prop("checked", false);
      }
      if (!remaining && !maintainNumber) {
         this.$("#make").prop("checked", "checked");
      }
   },

   //When the order list updates, or when the inventory tracker updates, re-evaluate the requirements
   //on the details page
   _updateDetailedOrderList: function() {
      var self = this;
      var orders = this.get('model.order_list.orders');
      if (!orders || !this.$('.orderListItem') || this.$('.orderListItem').length == 0 ) {
         return;
      }
      for (var i=0; i<orders.length; i++) {
         var order = orders[i];
         var recipe = self.allRecipes[order.recipe.recipe_key];
         if (!recipe) {
            //can happen if the recipe is being destroyed as the update happens
            return;
         }
         //var recipe = order.recipe;
         var orderListRow = this.$('.orderListRow[data ="' + orders[i].id + '"]');
         var $issueIcon = this.$('.orderListItem[data-orderid = "' + order.id + '"]').find('.issueIcon')

         var failedRequirements = "";
         // Only calculate failed requirements if this recipe isn't currently being processed (stonehearth.constants.crafting_status.CRAFTING = 3)
         if (order.order_progress != 3) {
            failedRequirements = self._calculate_failed_requirements(recipe);
         }
         var currentText = $(orderListRow).find('.orderListRowCraftingStatus').text();
         if (failedRequirements != "") {
            if (failedRequirements != currentText) {
               $(orderListRow).find('.orderListRowCraftingStatus').html(failedRequirements);
            }
            //display a badge on the RHS order list also
            $issueIcon.show();
         } else {
            //remove any badge on the RHS order list
            $issueIcon.hide();
         }

         //if we have a curr crafter, show their portrait
         var $workerPortrait = $(orderListRow).find('.workerPortrait');
         if (order.curr_crafter_id) {
            $workerPortrait.attr('src', '/r/get_portrait/?type=headshot&animation=idle_breathe.json&entity=object://game/' + order.curr_crafter_id);
            $workerPortrait.css('visible', true);
            $workerPortrait.css('opacity', 1);
         } else {
            $workerPortrait.css('visible', false);
            $workerPortrait.css('opacity', 0);
         }
      }
   },

   //returns a string of unmet requirements
   _calculate_failed_requirements: function(localRecipe) {
      var self = this;
      var requirementsString = "";
      var recipe = self.allRecipes[localRecipe.recipe_key]
      if (!recipe) {
         recipe = localRecipe;
      }

      //If there is no placed workshop, note this, in red
      if (self.basicInventoryTracker && recipe.hasWorkshop) {
         var workshopData = self.basicInventoryTracker[recipe.workshop.uri]
         if (!workshopData || workshopData.count < 1) {
            requirementsString = i18n.t('stonehearth:ui.game.show_workshop.workshop_required') + recipe.workshop.name + '<br>'
         }
      }

      //If there is no crafter of appropriate level, mention it
      var curr_level = this.get('model.highest_level')
      if (recipe.level_requirement > curr_level) {
         requirementsString = requirementsString + 
                              i18n.t('stonehearth:ui.game.show_workshop.level_requirement_needed') + 
                              i18n.t(self.get('model.class_name')) +
                              i18n.t('stonehearth:ui.game.show_workshop.level_requirement_level') +
                              recipe.level_requirement + '<br>';   
      }

      //if they have missing ingredients, list those here
      var ingredientString = "";
      if (self.usableInventoryTracker) {
         for (i=0; i<recipe.ingredients.length; i++) {
            var ingredientData = recipe.ingredients[i];
            var numNeeded = ingredientData.count;
            var numHave =  radiant.findUsableCount(ingredientData, self.usableInventoryTracker);
            if (numHave < numNeeded) {
               ingredientString = ingredientString + numHave + '/' + numNeeded + " " + i18n.t(ingredientData.name) + " ";
            }
         }
      }
      if (ingredientString != "") {
         ingredientString = i18n.t('stonehearth:ui.game.show_workshop.missing_ingredients') + ingredientString;
         requirementsString = requirementsString + ingredientString;
      }

      return requirementsString
   },

   _setPreviewStyling: function() {
      var self = this;
      if (self.$('[title]')) {
         self.$('[title]').tooltipster();
      }

      var recipe = this.getCurrentRecipe();
      if (recipe) {
         //Change styling that depends on the inventory trackers
         var requirementsMet = true;

         //Change the styling for the workshop requirement
         var $workshopRequirement = self.$('#requirementSection #workbench .requirementText')

         //By default, be green
         $workshopRequirement.removeClass('requirementsUnmet');
         $workshopRequirement.addClass('requirementsMet');

         //If there is no placed workshop, be red
         if (self.basicInventoryTracker && recipe.hasWorkshop) {
            var workshop_data = self.basicInventoryTracker[recipe.workshop.uri]
            if (!workshop_data || workshop_data.count < 1) {
               $workshopRequirement.removeClass('requirementsMet');
               $workshopRequirement.addClass('requirementsUnmet');
               requirementsMet = false;
            }
         }

         //Update the ingredients
         if (self.usableInventoryTracker) {
            $('.ingredient').each(function(index, ingredientDiv) {
               var ingredientData = {};
               ingredientData.kind = $(ingredientDiv).attr('data-kind');
               ingredientData.identifier = $(ingredientDiv).attr('data-identifier');

               var numHave = radiant.findUsableCount(ingredientData, self.usableInventoryTracker);

               var numRequired = parseInt($(ingredientDiv).find('.numNeeded').text());
               var $count = $(ingredientDiv).find('.count');
               if (numHave >= numRequired) {
                  $count.removeClass('requirementsUnmet');
                  $count.addClass('requirementsMet');
               } else {
                  $count.removeClass('requirementsMet');
                  $count.addClass('requirementsUnmet');
                  requirementsMet = false;
               }
               if (numHave > 999) {
                  numHave = i18n.t('stonehearth:ui.game.show_workshop.too_many_symbol');
               }
               $(ingredientDiv).find('.numHave').text(numHave);
            });
         }

         //Handle level requirements styling
         var $requirementText = self.$('#requirementSection #crafterLevel .requirementText')
         var curr_level = this.get('model.highest_level')
         if (recipe.level_requirement <= curr_level) {
            $requirementText.removeClass('requirementsUnmet');
            $requirementText.addClass('requirementsMet');
         } else {
            $requirementText.removeClass('requirementsMet');
            $requirementText.addClass('requirementsUnmet');
            requirementsMet = false;
         }

         self._showCraftUI(requirementsMet);
      }
   },

   _showCraftUI: function (shouldShow) {
      if (shouldShow || this.queueAnywayStatus) {
         self.$('#craftWindow #orderOptionsLocked').hide();
         self.$("#craftWindow #orderOptions").show();
      } else {
         self.$("#craftWindow #orderOptions").hide();
         self.$('#craftWindow #orderOptionsLocked').show();
      }
   },

   preview: function() {
      var self = this;
      var recipe = this.getCurrentRecipe();

      if (recipe) {
         //stats
         var recipeEntityData = recipe.product_uri.entity_data;
         var statHtml = '';
         var statClass = '';

         if (recipeEntityData && recipeEntityData['stonehearth:combat:weapon_data']) {
            var damage = recipeEntityData['stonehearth:combat:weapon_data']['base_damage']
            if (damage) {
               statClass = 'damage';
               statHtml = '<div>' + damage + '<br><span class=name>ATK</span></div>';
            }
         } else if (recipeEntityData && recipeEntityData['stonehearth:combat:armor_data']) {
            var armor = recipeEntityData['stonehearth:combat:armor_data']['base_damage_reduction']
            if (armor) {
               statClass = 'armor';
               statHtml = '<div>' + armor + '<br><span class=name>DEF</span></div>';
            }
         }

         //Add info about equippable
         self._calculateEquipmentData(recipe);

         self.$("#stats")
            .removeClass()
            .addClass(statClass)
            .html(statHtml);

         //Handle workshop requirement indicator
         var $workshopRequirement = self.$('#requirementSection #workbench .requirementText')
         if (recipe.hasWorkshop) {
            $workshopRequirement.text(i18n.t('stonehearth:ui.game.show_workshop.workshop_required') + recipe.workshop.name)
         } else {
            $workshopRequirement.text(i18n.t('stonehearth:ui.game.show_workshop.workshop_none_required'))
         }

         //level requirement indicator text
         var $requirementText = self.$('#requirementSection #crafterLevel .requirementText')
         if (recipe.level_requirement) {
            $requirementText.text(
               i18n.t('stonehearth:ui.game.show_workshop.level_requirement_needed') +
               i18n.t(self.get('model.class_name')) +
               i18n.t('stonehearth:ui.game.show_workshop.level_requirement_level') +
               recipe.level_requirement)            
         } else {
            $requirementText.text(i18n.t('stonehearth:ui.game.show_workshop.level_requirement_none'))            
         }
      }
   },

   _calculateEquipmentData: function(recipe) {
      var equipmentPiece = recipe.product_uri.components['stonehearth:equipment_piece'];
      if(equipmentPiece && (equipmentPiece.required_job_level || equipmentPiece.roles)) {
         var tooltipString = i18n.t('stonehearth:ui.game.unit_frame.no_requirements');
         if (equipmentPiece.roles) {
            var classArray = radiant.findRelevantClassesArray(equipmentPiece.roles);
            this.set('allowedClasses', classArray);
            tooltipString = i18n.t(
               'stonehearth:ui.game.unit_frame.equipment_description', 
               {class_list: radiant.getClassString(classArray)});
         }
         if (equipmentPiece.required_job_level) {
            this.$('#levelRequirement').text( i18n.t('stonehearth:ui.game.unit_frame.level')  + equipmentPiece.required_job_level);
            tooltipString += i18n.t(
               'stonehearth:ui.game.unit_frame.level_description', 
               {level_req: equipmentPiece.required_job_level});
         } else {
            this.$('#levelRequirement').text('');
         }

         //Make tooltips
         //Setup tooltips for the combat commands
         var requirementsTooltip = App.tooltipHelper.createTooltip(
             i18n.t('stonehearth:ui.game.unit_frame.class_lv_title'),
            tooltipString); 

         this.$('.detailsView').find('.tooltipstered').tooltipster('destroy');

         this.$('#recipeEquipmentPane').tooltipster({
            content: $(requirementsTooltip)
         });

         this.$('#recipeEquipmentPane').show();
         } else {
            this.$('#recipeEquipmentPane').hide();
         }  
   },

   _workshopPausedChange: function() {
      var isPaused = !!(this.get('model.order_list.is_paused'));

      // We need to check this because if/when the root object changes, all children are 
      // marked as changed--even if the values don't differ.
      if (isPaused == this.isPaused) {
         return;
      }
      this.isPaused = isPaused;

      this.set('model.workshopIsPaused', isPaused)

      var r = isPaused ? 4 : -4;

      // flip the sign
      var sign = this.$("#statusSign");

      if (sign) {
         sign.animate({
            rot: r,
            },
            {
               duration: 200,
               step: function(now,fx) {
                  var percentDone;
                  var end = fx.end; 
                  var start = fx.start;

                  if (end > start) {
                     console.log('end > start');
                     percentDone = (now - start) / (end - start);
                  } else {
                     percentDone = -1 * (now - start) / (start - end);
                  }

                  var scaleX = percentDone < .5 ? 1 - (percentDone * 2) : (percentDone * 2) - 1;
                  $(this).css('-webkit-transform', 'rotate(' + now + 'deg) scale(' + scaleX +', 1)');
               }
         });
      }

   }.observes('model.order_list.is_paused'),

   //Attach sortable/draggable functionality to the order
   //list. Hook order list onto garbage can. Set up scroll
   //buttons.
   _buildOrderList: function(){
      var self = this;

      var sortableGarbage = this.makeSortable(this.$( "#orders, #garbageList" ), {
         axis: "y",
         connectWith: "#garbageList",
         beforeStop: function (event, ui) {
            //Called right after an object is dropped
            if(ui.item[0].parentNode && ui.item[0].parentNode.id == "garbageList") {
               ui.item.addClass("hiddenOrder");
               var orderList = self.getOrderList();
               var id = parseInt(ui.item.attr("data-orderid"))
               radiant.call_obj(orderList, 'delete_order_command', id)
                  .done(function(return_data){
                     ui.item.remove();
                     radiant.call('radiant:play_sound', {'track' : 'stonehearth:sounds:ui:carpenter_menu:trash'} );
                  });
             }
         },
         over: function (event, ui) {
            //Called whenever we hover over a new target
            if (event.target.id == "garbageList") {
               ui.item.find(".deleteLabel").addClass("showDelete");
               radiant.call('radiant:play_sound', {'track' : 'stonehearth:sounds:ui:carpenter_menu:highlight'} );
            } else {
               ui.item.find(".deleteLabel").removeClass("showDelete");
            }
         },
         start: function(event, ui) {
            // on drag start, creates a temporary attribute on the element with the old index
            $(this).attr('data-previndex', ui.item.index(".orderListItem")+1);
            self.is_sorting = ui.item[0];
         },
         stop: function(event, ui) {
            //if we're not sorting anymore, don't do anything
            if (self.is_sorting == null) {
               return;
            } 
            //Don't update objects inside the garbage list
            if(ui.item[0].parentNode && ui.item[0].parentNode.id == "garbageList") {
               return;
            }

            //If we're still sorting, then update the order list
            var orderList = self.getOrderList();
            var newPos = ui.item.index(".orderListItem") + 1;            
            var id =  parseInt(ui.item.attr("data-orderid"));

            //Check if we're replacing?
            if ($(this).attr('data-previndex') == newPos) {
               return;
            }

            radiant.call_obj(orderList, 'change_order_position_command', newPos, id);               

            //Let people know we're no longer sorting
            self.is_sorting = null;
         }
      });

      if (sortableGarbage) {
         sortableGarbage.disableSelection();
      }

      //build the order list on the order tab
      var sortableOrders = this.makeSortable(this.$('#orderListContainer table'), {
         axis: "y",
         start: function(event, ui) {
            // on drag start, creates a temporary attribute on the element with the old index
            $(this).attr('data-previndex', ui.item.index()+1);
            self.is_sorting = ui.item[0];
         },
         stop: function(event, ui) {
             //if we're not sorting anymore, don't do anything
            if (self.is_sorting == null) {
               return;
            } 
            //If we're still sorting, then update the order list
            var orderList = self.getOrderList();
            var newPos = ui.item.index() + 1;     
            //aha, all is explained. Wrong variable name ::sigh::       
            var id =  parseInt(ui.item.attr("data"));

            //Check if we're replacing?
            if ($(this).attr('data-previndex') == newPos) {
               return;
            }

            radiant.call_obj(orderList, 'change_order_position_command', newPos, id);    

            //Let people know we're no longer sorting
            self.is_sorting = null;
         }


      })

      if (sortableOrders) {
         sortableOrders.disableSelection();
      }

      this._initButtonStates();
      this._enableDisableTrash();
   },

   //Initialize button states to visible/not based on contents of
   //list. Register an event to toggle them when they
   //are no longer needed. TODO: animation!
   _initButtonStates: function() {
      var currentOrdersList = $('#orders');
      //Set the default state of the buttons
      var self = this;
      if (currentOrdersList[0].scrollHeight > currentOrdersList.height()) {
         self.$('#orderListUpBtn').show();
         self.$('#orderListDownBtn').show();
      } else {
         self.$('#orderListUpBtn').hide();
         self.$('#orderListDownBtn').hide();
      }

      //Register an event to toggle the buttons when the scroll state changes
      currentOrdersList.on("overflowchanged", function(event){
         console.log("overflowchanged!");
         self.$('#orderListUpBtn').toggle();
         self.$('#orderListDownBtn').toggle();
      });
   },

   _scrollOrderList: function(amount) {
      var orderList = this.$('#orders'),
      localScrollTop = orderList.scrollTop() + amount;
      orderList.animate({scrollTop: localScrollTop}, 100);
   },

  _orderListObserver: function() {
      //If we're sorting as an order completes, cancel the sorting
      //or when the order list updates, the sortable element complains
      if (this.is_sorting != null) {
         var orderID = this.is_sorting.getAttribute("data-orderID");
         var sortedOrder = this.is_sorting;

         this.is_sorting = null;
         this.$( "#orders, #garbageList" ).sortable("cancel");
         this.$('#orderListContainer table').sortable("cancel");

         //If we were sorting the very thing that got deleted in this update, we
         //need to remove it from the order list because the cancel will have re-added it. 
         //Note: this makes me feel  dirty. I mean, why doesn't ember/handlebars
         //wipe the re-added thing when the UI updates? These 2 frameworks DO play together
         //they just feel like they're having an ideological argument IN OUR CODE.
         var found = false;
         var orders = this.get('model.order_list.orders');
         for (i = 0; i < orders.length; i++) {
            if (orders[0].id == orderID) {
               found = true;
               break;
            }
         }
         if (!found || $(this.is_sorting).hasClass('inProgressOrder') ) {
            //The thing we're sorting is no longer here or a new copy has been made; Remove it.
            $(sortedOrder).remove();
         }
      }

      this._enableDisableTrash();
      Ember.run.scheduleOnce('afterRender', this, '_updateDetailedOrderList');
   }.observes('model.order_list.orders'),

   _enableDisableTrash: function() {
      var list = this.get('model.order_list.orders');

      if (this.$('#garbageButton')) {
         if (list && list.length > 0) {
            this.$('#garbageButton').css('opacity', '1');
         } else {
            this.$('#garbageButton').css('opacity', '0.3');
         }
      }
   },

   _onOrderCountUpdated: function() {
      var orderCount = this.get('model.order_list.orders.length');
      if (orderCount) {
         var craftButton = this.$('#craftButtonLabel');
         var craftButtonImage = this.$('#craftButtonImage');
         if (orderCount >= this.maxActiveOrders) {
            craftButtonImage.css('-webkit-filter', 'grayscale(100%)');
            craftButton.addClass('disabled');
            this.set('craft_button_text', 'stonehearth:ui.game.show_workshop.craft_queue_full');
         } else {
            craftButtonImage.css('-webkit-filter', 'grayscale(0%)');
            craftButton.removeClass('disabled');
            this.set('craft_button_text', 'stonehearth:ui.game.show_workshop.craft');
         }
      }
   }.observes('model.order_list.orders.length')

});