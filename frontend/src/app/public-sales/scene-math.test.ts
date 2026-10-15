import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { OrthographicCamera, Vector3 } from "three";
import type { Geography } from "./explorer-data";
import { countryBounds, featureBounds, fitScene, isSceneClick } from "./scene-math";

const geo: Geography = JSON.parse(readFileSync(new URL("../../../public/maps/vietnam-34.geojson", import.meta.url), "utf8").replace(/^\uFEFF/, ""));

test("all 34 selected mainland bounds fit the unoccluded desktop and mobile viewport with Z-up", () => {
  assert.equal(geo.features.length, 34);
  for (const [width, height, insets] of [
    [1440, 834, { top: 120, bottom: 125, left: 354, right: 354 }],
    [390, 738, { top: 115, bottom: 405, left: 16, right: 16 }],
  ] as const) {
    for (const feature of geo.features) {
      const bounds = featureBounds(feature), fit = fitScene(bounds, width, height, insets);
      const camera = new OrthographicCamera(-width / 2, width / 2, height / 2, -height / 2, .1, 150);
      camera.up.set(0, 0, 1); camera.position.set(fit.targetX, fit.targetY - 24, 32);
      camera.lookAt(fit.targetX, fit.targetY, 0); camera.zoom = fit.zoom; camera.updateProjectionMatrix(); camera.updateMatrixWorld();
      for (const x of [bounds.minX, bounds.maxX]) for (const y of [bounds.minY, bounds.maxY]) {
        const screen = new Vector3(x, y, .5).project(camera);
        const px = (screen.x + 1) * width / 2, py = (1 - screen.y) * height / 2;
        assert.ok(px >= fit.safe.left && px <= fit.safe.right && py >= fit.safe.top && py <= fit.safe.bottom, `${feature.properties.name} at ${width}px is obscured`);
      }
      const north = new Vector3(0, 1, 0).project(camera), south = new Vector3(0, 0, 0).project(camera);
      assert.ok(north.y > south.y, "North remains toward screen top");
    }
  }
});
test("remote islands are retained in full extent without shrinking mainland province focus", () => {
  const danang = geo.features.find(f => f.properties.code === "48")!;
  assert.ok(featureBounds(danang, true).maxX > featureBounds(danang).maxX + 1);
  assert.ok(countryBounds(geo, true).maxX > countryBounds(geo, false).maxX);
});
test("drag threshold rejects a large gesture even after pointer returns to its starting point", () => {
  assert.equal(isSceneClick(2, false), true);
  assert.equal(isSceneClick(20, false), false);
  assert.equal(isSceneClick(0, true), false);
});
