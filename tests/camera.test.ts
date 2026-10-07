import { it } from "node:test";
import assert from "node:assert/strict";
import { cameraErrorMessage, stopCamera } from "../src/lib/camera";

it("explains camera permission, hardware and unsupported failures", () => {
  for (const [name, text] of [["NotAllowedError", "permission"], ["NotFoundError", "No camera"], ["NotReadableError", "busy"]]) {
    const error = new Error(); error.name = name;
    assert.match(cameraErrorMessage(error), new RegExp(text));
  }
  assert.match(cameraErrorMessage(null), /upload/);
});

it("releases every camera track when capture closes", () => {
  let stopped = 0;
  stopCamera({ getTracks: () => [ { stop: () => { stopped++; } }, { stop: () => { stopped++; } } ] });
  assert.equal(stopped, 2);
  stopCamera(null);
});
