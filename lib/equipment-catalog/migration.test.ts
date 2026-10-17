import test from "node:test";
import assert from "node:assert/strict";
import { inventoryManufacturers } from "./migration";
test("manufacturer-only inventory is normalized, repeatable and preserves old equipment/models", () => {
  const settings = [
    {
      id: "nice",
      parentId: "equipment-manufacturers",
      type: "variable",
      name: "Nice",
      hidden: true,
    },
    {
      id: "legacy",
      parentId: "equipment-models",
      type: "variable",
      name: "Old model",
    },
  ];
  const clients = [
    {
      echipamente: [
        { producator: " NICE ", model: "Old model" },
        { producator: " Came " },
        { producator: {} },
      ],
      locatii: [
        {
          echipamente: [
            { producator: "CAME" },
            { producator: "Somfy", model: "Don't migrate" },
            { producator: "" },
          ],
        },
      ],
    },
  ];
  const before = JSON.stringify({ settings, clients });
  const report = inventoryManufacturers(settings, clients);
  assert.equal(report.stats.equipment, 6);
  assert.equal(report.stats.invalidManufacturers, 1);
  assert.equal(report.toCreate.length, 2);
  assert(report.toCreate.some((name) => name.toLowerCase() === "came"));
  assert(report.toCreate.includes("Somfy"));
  assert.equal(JSON.stringify({ settings, clients }), before);
  assert.deepEqual(
    inventoryManufacturers(
      [
        ...settings,
        ...report.toCreate.map((name, index) => ({
          id: String(index),
          name,
          type: "variable",
          parentId: "equipment-manufacturers",
        })),
      ],
      clients,
    ).toCreate,
    [],
  );
});
