import test from "node:test";
import assert from "node:assert/strict";
import {
  catalogName,
  catalogKey,
  equipmentCatalogFromSettings,
  equipmentCatalogChoices,
  equipmentCatalogModels,
} from "./equipment-catalog";
test("names trim whitespace and compare case-insensitively", () => {
  assert.equal(catalogName("  Nice   România  "), "Nice România");
  assert.equal(catalogKey(" NICE "), catalogKey("nice"));
  assert.throws(() => catalogName(" "));
  assert.throws(() => catalogName({}));
});
test("manufacturer catalogs respect hidden options, order and scoped duplicates", () => {
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
      manufacturerId: "a",
      parentId: "equipment-models",
      type: "variable",
      name: "M400",
      order: 1,
    },
  ];
  assert.deepEqual(equipmentCatalogFromSettings(rows), {
    manufacturers: [{ id: "a", name: "Nice" }],
    models: [{ id: "model", name: "M400", manufacturerId: "a" }],
  });
  assert.equal(
    equipmentCatalogFromSettings([
      ...rows,
      { id: "equipment-models", hidden: true },
    ]).models.length,
    0,
  );
});
test("global old models are excluded, same model name belongs to different producers", () => {
  const rows = [
    {
      id: "a",
      parentId: "equipment-manufacturers",
      type: "variable",
      name: "Nice",
    },
    {
      id: "b",
      parentId: "equipment-manufacturers",
      type: "variable",
      name: "Came",
    },
    {
      id: "old",
      parentId: "equipment-models",
      type: "variable",
      name: "Legacy",
    },
    {
      id: "ma",
      parentId: "equipment-models",
      type: "variable",
      name: "M1",
      manufacturerId: "a",
    },
    {
      id: "mb",
      parentId: "equipment-models",
      type: "variable",
      name: "M1",
      manufacturerId: "b",
    },
    {
      id: "orphan",
      parentId: "equipment-models",
      type: "variable",
      name: "Orphan",
      manufacturerId: "missing",
    },
  ];
  const catalog = equipmentCatalogFromSettings(rows);
  assert.equal(catalog.models.length, 2);
  assert.deepEqual(
    equipmentCatalogModels(catalog, " NICE ").map((model) => model.id),
    ["ma"],
  );
  assert.deepEqual(
    equipmentCatalogModels(catalog, "Came").map((model) => model.id),
    ["mb"],
  );
  assert.deepEqual(equipmentCatalogModels(catalog, ""), []);
  assert.equal(
    equipmentCatalogFromSettings(
      rows.map((row) => (row.id === "a" ? { ...row, hidden: true } : row)),
    ).models.length,
    1,
  );
  assert.equal(
    equipmentCatalogFromSettings(
      rows.map((row) => (row.id === "a" ? { ...row, hidden: true } : row)),
      { includeHidden: true },
    ).models.length,
    2,
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
