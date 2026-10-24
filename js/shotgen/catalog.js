// What can be placed in the Shot Generator: Wonder Unit's essential objects and figures (MIT, vendor/models).

const OBJ = "vendor/models/objects/essential";
const CHAR = "vendor/models/characters/essential";

const o = (group, id, label) => ({ kind: "object", group, id, label, path: `${OBJ}/${id.split("-")[0]}/${id}/${id}.glb` });

export const OBJECTS = [
  o("Tables", "table-sit-rectangle", "Dining table, rectangular"),
  o("Tables", "table-sit-square", "Dining table, square"),
  o("Tables", "table-sit-circle", "Dining table, round"),
  o("Tables", "table-counter", "Kitchen counter"),
  o("Tables", "table-coffee", "Coffee table"),
  o("Tables", "table-nightstand", "Nightstand"),
  o("Tables", "table-bar", "Bar table"),
  o("Tables", "table-bar-rectangle", "Bar table, rectangular"),
  o("Tables", "table-bar-circle", "Bar table, round"),
  o("Chairs", "chair-modern", "Chair"),
  o("Chairs", "chair-box", "Box chair"),
  o("Chairs", "chair-office", "Office chair"),
  o("Chairs", "chair-bar", "Bar chair"),
  o("Chairs", "chair-stool", "Stool"),
  o("Chairs", "chair-stool-mini", "Low stool"),
  o("Chairs", "chair-sofa", "Armchair"),
  o("Chairs", "chair-sofa-wide", "Sofa"),
  o("Cabinets", "cabinet-bookshelf", "Bookshelf"),
  o("Cabinets", "cabinet-dresser-3", "Dresser, low"),
  o("Cabinets", "cabinet-dresser-5", "Dresser, tall"),
  o("Beds", "bed-twin", "Single bed"),
  o("Beds", "bed-full", "Double bed"),
  o("Beds", "bed-king", "King bed"),
  o("Doors", "door-single", "Door"),
  o("Doors", "door-single-frame", "Door frame"),
  o("Doors", "door-double", "Double door"),
  o("Doors", "door-double-frame", "Double door frame"),
  o("Stairs", "stairs-single-6", "Stairs"),
  o("Outdoors", "tree-bushy", "Tree"),
  o("Outdoors", "tree-no-leaves", "Bare tree"),
  o("Outdoors", "vehicle-car", "Car"),
  o("Outdoors", "vehicle-bicycle-bmx", "Bicycle"),
  o("Shapes", "primitive-cylinder", "Cylinder"),
  o("Shapes", "primitive-cylinder-hollow", "Tube"),
  o("Shapes", "primitive-sphere", "Sphere"),
  o("Shapes", "primitive-pyramid", "Pyramid"),
  o("Shapes", "primitive-wedge", "Wedge"),
];

const c = (id, label, height) => ({ kind: "figure", id, label, height, path: `${CHAR}/${id}/${id}-lod.glb` });

// height: the model's own height in cm (library README), the starting point before scaling to the actor.
export const FIGURES = [
  c("adult-male", "Adult male", 180),
  c("adult-female", "Adult female", 162.5),
  c("teen-male", "Teen male", 160),
  c("teen-female", "Teen female", 160),
  c("child", "Child", 111),
  c("baby", "Baby", 46),
];

export const byId = (id) => OBJECTS.find((x) => x.id === id) || FIGURES.find((x) => x.id === id);

// Colour tags for figures, in the order they're added.
export const FIGURE_COLOURS = ["#6f8fb8", "#c08a6a", "#7fa17a", "#a07ab0", "#b8a35a", "#6aa8a8"];
