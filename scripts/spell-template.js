class SpellTemplate {
    static ID = 'spell-template';
    
    static TEMPLATES = {
      TODOLIST: `modules/${this.ID}/templates/spell-template.hbs`
    }

    static log(force, ...args) {  
        const shouldLog = force || game.modules.get('_dev-mode')?.api?.getPackageDebugValue(this.ID);
    
        if (shouldLog) {
          console.log(this.ID, '|', ...args);
        }

        Hooks.once('devModeReady', ({ registerPackageDebugFlag }) => {
            registerPackageDebugFlag(ToDoList.ID);
          });
      }
}

spellAreaShapes = {
  "": "",
  "cone": "SFRPG.SpellAreaShapesCone",
  "cylinder": "SFRPG.SpellAreaShapesCylinder",
  "line": "SFRPG.SpellAreaShapesLine",
  "sphere": "SFRPG.SpellAreaShapesSphere",
  "shapable": "SFRPG.SpellAreaShapesShapable",
  "other": "SFRPG.SpellAreaShapesOther"
};

/**
 * A helper class for building MeasuredTemplates for 5e spells and abilities
 * @extends {MeasuredTemplate}
 */
class AbilityTemplate extends MeasuredTemplate {

  /**
   * A factory method to create an AbilityTemplate instance using provided data from an Item5e instance
   * @param {Item5e} item               The Item object for which to construct the template
   * @returns {AbilityTemplate|null}     The template object, or null if the item does not produce a template
   */
  static fromItem(item) {
    const target = getProperty(item.data, "data.area") || {};
    SpellTemplate.log(true, CONST.MEASURED_TEMPLATE_TYPES);
    const templateShape = CONFIG.SFRPG.spellAreaShapes[target.shape].toLowerCase();
    SpellTemplate.log(true, templateShape);
    if ( !templateShape ) return null;
    if ( templateShape == "shapable" ) return null;
    if ( templateShape == "other" ) return null;

    // Prepare template data
    const templateData = {
      t: templateShape,
      user: game.user.id,
      distance: target.value,
      direction: 0,
      x: 0,
      y: 0,
      fillColor: game.user.color
    };

    // Additional type-specific data
    switch ( templateShape ) {
      case "cone":
        templateData.angle = CONFIG.MeasuredTemplate.defaults.angle;
        break;
      case "cylinder":
        templateData.t = CONST.MEASURED_TEMPLATE_TYPES['CIRCLE'];
        break;
      case "rect": // 5e rectangular AoEs are always cubes
        templateData.distance = Math.hypot(target.value, target.value);
        templateData.width = target.value;
        templateData.direction = 45;
        break;
      case "line": // 5e rays are most commonly 1 square (5 ft) in width
        templateData.t = 'ray';
        templateData.width = target.width ?? canvas.dimensions.distance;
        SpellTemplate.log(true, "This is a line");
        break;
      default:
        break;
    }

    // Return the template constructed from the item data
    const cls = CONFIG.MeasuredTemplate.documentClass;
    const template = new cls(templateData, {parent: canvas.scene});
    const object = new this(template);
    object.item = item;
    object.actorSheet = item.actor?.sheet || null;
    return object;
  }

  /* -------------------------------------------- */

  /**
   * Creates a preview of the spell template
   */
  drawPreview() {
    const initialLayer = canvas.activeLayer;

    // Draw the template and switch to the template layer
    this.draw();
    this.layer.activate();
    this.layer.preview.addChild(this);

    // Hide the sheet that originated the preview
    this.actorSheet?.minimize();

    // Activate interactivity
    this.activatePreviewListeners(initialLayer);
  }

  /* -------------------------------------------- */

  /**
   * Activate listeners for the template preview
   * @param {CanvasLayer} initialLayer  The initially active CanvasLayer to re-activate after the workflow is complete
   */
  activatePreviewListeners(initialLayer) {
    const handlers = {};
    let moveTime = 0;

    // Update placement (mouse-move)
    handlers.mm = event => {
      event.stopPropagation();
      let now = Date.now(); // Apply a 20ms throttle
      if ( now - moveTime <= 20 ) return;
      const center = event.data.getLocalPosition(this.layer);
      const snapped = canvas.grid.getSnappedPosition(center.x, center.y, 2);
      if ( game.release.generation < 10 ) this.data.update({x: snapped.x, y: snapped.y});
      else this.document.updateSource({x: snapped.x, y: snapped.y});
      this.refresh();
      moveTime = now;
    };

    // Cancel the workflow (right-click)
    handlers.rc = event => {
      this.layer._onDragLeftCancel(event);
      canvas.stage.off("mousemove", handlers.mm);
      canvas.stage.off("mousedown", handlers.lc);
      canvas.app.view.oncontextmenu = null;
      canvas.app.view.onwheel = null;
      initialLayer.activate();
      this.actorSheet?.maximize();
    };

    // Confirm the workflow (left-click)
    handlers.lc = event => {
      handlers.rc(event);
      const destination = canvas.grid.getSnappedPosition(this.data.x, this.data.y, 2);
      if ( game.release.generation < 10 ) this.data.update(destination);
      else this.document.updateSource(destination);
      canvas.scene.createEmbeddedDocuments("MeasuredTemplate", [this.data.toObject()]);
    };

    // Rotate the template by 3 degree increments (mouse-wheel)
    handlers.mw = event => {
      if ( event.ctrlKey ) event.preventDefault(); // Avoid zooming the browser window
      event.stopPropagation();
      let delta = canvas.grid.type > CONST.GRID_TYPES.SQUARE ? 30 : 15;
      let snap = event.shiftKey ? delta : 5;
      const update = {direction: this.data.direction + (snap * Math.sign(event.deltaY))};
      if ( game.release.generation < 10 ) this.data.update(update);
      else this.document.updateSource(update);
      this.refresh();
    };

    // Activate listeners
    canvas.stage.on("mousemove", handlers.mm);
    canvas.stage.on("mousedown", handlers.lc);
    canvas.app.view.oncontextmenu = handlers.rc;
    canvas.app.view.onwheel = handlers.mw;
  }
}

itemID = null;
actorID = null;

Hooks.on('renderChatMessage', (ChatMessage, html) => {

    // find the element which has our logged in user's id
    const loggedInUserListItem = html.find(`[class="card-buttons"]`)
  
    // insert a button at the end of this element
    loggedInUserListItem.append(
      `<button type='button' class='spell-template-icon-button flex0'>
        Place Template
      </button>`
    );
  
    // register an event listener for this button
    html.on('click', '.spell-template-icon-button', (event) => {
      usedItem = game.actors.get(actorID).items.get(itemID);
      SpellTemplate.log(true, usedItem);
      const template = AbilityTemplate.fromItem(usedItem);
      template.drawPreview();
    });
  });

Hooks.on('renderSpellCastDialog', (SpellCastDialog, html) => {
  this.itemID = SpellCastDialog.item.data._id;
});

Hooks.on('renderActorSheetSFRPG', (ActorSheetSFRPGCharacter) => {
  this.actorID = ActorSheetSFRPGCharacter.actor.data._id;
  SpellTemplate.log(true, this.actorID);
});