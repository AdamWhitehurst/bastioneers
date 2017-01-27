App.StonehearthBuildingCostView = App.View.extend({
   templateName: 'buildingCost',
   i18nNamespace: 'stonehearth',
   
   didInsertElement: function() {
      var self = this;

      //init usable object tracker
      radiant.call_obj('stonehearth.inventory', 'get_item_tracker_command', 'stonehearth:usable_item_tracker')
         .done(function(response) {
            self.tracker = response.tracker;
         });
   },

   becameVisible: function() {
      this._installTrace();
   },

   becameHidden: function() {
      this._destroyTrace();
   },

   _installTrace: function() {
      var self = this;
      if (self._playerUsableInventoryTrace) {
         return;
      }
      var itemTraces = {
         "tracking_data" : {},
         }
      self._playerUsableInventoryTrace = new StonehearthDataTrace(self.tracker, itemTraces)
         .progress(function(response) {
            self.usableInventoryTracker = response.tracking_data;
            self._updateAvailable();
         });
   },

   _destroyTrace: function() {
      if (this._playerUsableInventoryTrace) {
         this._playerUsableInventoryTrace.destroy();
         this._playerUsableInventoryTrace = null;
      }
   },

   //Right now this is never called, b/c the building editor is created and never destroyed.
   //If this ever changes, double make sure this works right!
   destroy: function() {
      this._destroyTrace();
      this._super();
   },
   

   _transformCost: function() {
      var self = this;
      var costArr = [];

      var cost = self.get('cost')

      self._addResourcesToCost(costArr, cost.resources)
      
      if (cost.items) {
         //count the items
         var items = 0;
         radiant.each(cost.items, function(uri, item){
            items++
         });
         if (items > 0) {
            //If there are items associated with this build...
            self._addItemsToCost(costArr, cost.items);
            self.set('building_cost', costArr);
         } else {
            //if there are no items associated with the build, push the cost now
            self.set('building_cost', costArr);
         }
      }
   }.observes('cost'),

   _addResourcesToCost: function(arr, map) {
      var self = this;
      if (map) {
         radiant.each(map, function(material, count) {
            var formatting = App.resourceConstants.resources[material];
            if (formatting) {
               var entityCount = Math.ceil(count / formatting.stacks);

               var ingredientData = {};
               ingredientData.kind = 'material';
               ingredientData.identifier = material;

               var availableCount = radiant.findUsableCount(ingredientData, self.usableInventoryTracker);

               if (App.population.getKingdom() == 'bastioneers:kingdoms:bastioneers' && formatting.b_name && formatting.b_icon) {
                  arr.push({
                     name: formatting.b_name,
                     icon: formatting.b_icon,
                     count: entityCount,
                     material: material, 
                     available: availableCount,
                     requirementsMet: (availableCount >= entityCount),
                  });
               }
               else {
                  arr.push({
                     name: formatting.name,
                     icon: formatting.icon,
                     count: entityCount,
                     material: material, 
                     available: availableCount,
                     requirementsMet: (availableCount >= entityCount),
                  });
               }
            }
         });
      }
   },

   _addItemsToCost: function(arr, map) {
      var self = this;
      if (map) {
         radiant.each(map, function(uri, data) {
            var count = 0;
            if (typeof data === 'number') {
               count = data;
            } else {
               count = data.count;
            }
            var catalogData = App.catalog.getCatalogData(uri);
            if (catalogData && catalogData.iconic_uri) {
               var emberIconicKey = catalogData.iconic_uri.replace(/\./g, "&#46;");

               var ingredientData = {};
               ingredientData.kind = 'uri';
               ingredientData.identifier = emberIconicKey;
               var availableCount = radiant.findUsableCount(ingredientData, self.usableInventoryTracker);

               if (App.population.getKingdom() == 'bastioneers:kingdoms:bastioneers' && catalogData.b_name && catalogData.b_icon) {
                  arr.push({
                     name: catalogData.b_name,
                     icon: catalogData.b_icon,
                     count: count,
                     uri: uri,
                     iconic_uri: emberIconicKey,
                     available: availableCount,
                     requirementsMet: (availableCount >= count),
                  });
               }
               else {
                  arr.push({
                     name: catalogData.display_name,
                     icon: catalogData.icon,
                     count: count,
                     uri: uri,
                     iconic_uri: emberIconicKey,
                     available: availableCount,
                     requirementsMet: (availableCount >= count),
                  });
               }
            }
         });
      }
   },   

   //Recreate the array to update it
   _updateAvailable: function() {
      var self = this;
      var buildingMaterials = self.get('building_cost');
      var arr = [];

      if (buildingMaterials && self.usableInventoryTracker) {
         for (var i = 0; i < buildingMaterials.length; i++) { 
            var buildingMaterial = buildingMaterials[i];
            if (buildingMaterial) {
               var clonedObj = {
                  name: buildingMaterial.name, 
                  icon: buildingMaterial.icon, 
                  count: buildingMaterial.count
               }
               var ingredientData = {};
               var numHave = 0;
               if (buildingMaterial.uri) {
                  ingredientData.kind = 'uri';
                  ingredientData.identifier = buildingMaterial.iconic_uri;
                  clonedObj.uri = buildingMaterial.uri;
                  clonedObj.iconic_uri = buildingMaterial.iconic_uri;
                  numHave = radiant.findUsableCount(ingredientData, self.usableInventoryTracker);

               } else if (buildingMaterial.material) {
                  ingredientData.kind = 'material';
                  ingredientData.identifier = buildingMaterial.material;
                  clonedObj.material = buildingMaterial.material;
                  numHave = radiant.findUsableCount(ingredientData, self.usableInventoryTracker);
               }
               
               clonedObj.available = numHave;
               clonedObj.requirementsMet = (numHave >= clonedObj.count);
               arr.push(clonedObj);
            }
         }
      }
      self.set('building_cost', arr);
   },
   
});
