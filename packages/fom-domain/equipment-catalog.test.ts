import test from "node:test";
import assert from "node:assert/strict";
import {
  catalogName,
  catalogKey,
  equipmentCatalogFromSettings,
  equipmentCatalogChoices,
} from "./equipment-catalog";
test("names trim whitespace and compare case-insensitively", () => {
  assert.equal(catalogName("  Nice   România  "), "Nice România");
  assert.equal(catalogKey(" NICE "), catalogKey("nice"));
  assert.throws(() => catalogName(" "));
  assert.throws(() => catalogName({}));
});
test("independent catalogs respect hidden options, order and duplicates", () => {
  const rows = [
    {
      id: "a",
      parentId: "equipment-manufacturers",
      type: "variable",
      name: "Nice",
      order: 2,
    },
    {
      id: "b",
      parentId: "equipment-manufacturers",
      type: "variable",
      name: "NICE",
      order: 3,
    },
    {
      id: "hidden",
      parentId: "equipment-manufacturers",
      type: "variable",
      name: "Hidden",
      hidden: true,
    },
    {
      id: "model",
      parentId: "equipment-models",
      type: "variable",
      name: "M400",
      order: 1,
    },
  ];
  assert.deepEqual(equipmentCatalogFromSettings(rows), {
    manufacturers: [{ id: "a", name: "Nice" }],
    models: [{ id: "model", name: "M400" }],
  });
  assert.equal(
    equipmentCatalogFromSettings([
      ...rows,
      { id: "equipment-models", hidden: true },
    ]).models.length,
    0,
  );
});
test("legacy and hidden current values remain selectable, optional values can be cleared", () => {
  assert.deepEqual(equipmentCatalogChoices([], "Old model"), [
    { value: "", label: "Nespecificat" },
    { value: "Old model", label: "Old model (valoare curentă)" },
  ]);
  assert.equal(
    equipmentCatalogChoices([{ id: "x", name: "Nice" }], "Nice").length,
    2,
  );
});
