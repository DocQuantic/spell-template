class SpellTemplate {
    static ID = 'spell-template';

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

/**
 * A helper class for building MeasuredTemplates for spells and abilities (adapted from dnd5e)
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
    let templateShape = CONFIG.SFRPG.spellAreaShapes[target.shape].toLowerCase();
    if ( !templateShape ) return null;

    // Workaround for french translation
    switch ( templateShape ) {
      case "cône":
        templateShape = "cone";
        break;
      case "cylindre":
        templateShape = "cylinder";
        break;
      case "sphère":
        templateShape = "sphere";
        break;
      case "ligne":
        templateShape = "line";
        break;
      case "forme":
        templateShape = "shapable";
        break;
      case "autre":
        templateShape = "other";
        break;
      default:
        break;
    }

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
        templateData.angle = 90;
        break;
      case "cylinder":
        templateData.t = CONST.MEASURED_TEMPLATE_TYPES['CIRCLE'];
        break;
      case "sphere":
        templateData.t = CONST.MEASURED_TEMPLATE_TYPES['CIRCLE'];
        break;
      case "line":
        templateData.t = 'ray';
        templateData.width = target.width ?? canvas.dimensions.distance;
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

actorID = null;
hasArea = false;
itemID = null;

Hooks.on('renderChatMessage', (ChatMessage, html) => {
  const message = html.find(`[class="sfrpg chat-card item-card"]`)
  let itemID = message["0"].dataset.itemId;
  let actorID = message["0"].dataset.actorId;

  if ( itemID != null ){
    // find the element which has our logged in user's id
    const buttons = html.find(`[class="card-buttons"]`);

    usedItem = game.actors.get(actorID).items.get(itemID);
    target = getProperty(usedItem.data, "data.area") || {};
  
    if ( target.shape != ""){
      // insert a button at the end of this element
      buttons.append(
        `<button type='button' class='spell-template-icon-button flex0'>
          Place Template
        </button>`
      );
    
      // register an event listener for this button
      html.on('click', '.spell-template-icon-button', (event) => {
        const template = AbilityTemplate.fromItem(usedItem);
        template.drawPreview();
      });
    itemID = null;
    }
  }
});