"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const hostPath = path.join(__dirname, "..", "extension", "jsx", "host.jsx");
const bridgePath = path.join(__dirname, "..", "extension", "js", "bridge.js");
const viewPath = path.join(__dirname, "..", "extension", "js", "view.js");
const cssPath = path.join(__dirname, "..", "extension", "css", "panel.css");
const host = fs.readFileSync(hostPath, "utf8");
const bridge = fs.readFileSync(bridgePath, "utf8");
const view = fs.readFileSync(viewPath, "utf8");
const css = fs.readFileSync(cssPath, "utf8");

assert.ok(host.indexOf("ADBE Linear Color Key2") !== -1);
assert.ok(host.indexOf("ADBE Matte Choker") !== -1);
assert.ok(host.indexOf("ADBE Remove Color Matting") !== -1);
assert.ok(host.indexOf("ADBE Checkerboard") !== -1);
assert.ok(host.indexOf("ADBE Slider Control") !== -1);
assert.ok(host.indexOf("ADBE Effect Parade") !== -1);
assert.ok(host.indexOf("guideLayer") !== -1);
assert.ok(host.indexOf("hasAlpha") !== -1);
assert.ok(host.indexOf("alphaMode") !== -1);
assert.ok(host.indexOf("sampleImage(") !== -1);
assert.ok(host.indexOf(".sampleImage(") === -1);
assert.ok(host.indexOf("typeof comp.saveFrameToPng") !== -1);
assert.ok(host.indexOf("Key Color") !== -1);
assert.ok(host.indexOf("Matching Tolerance") !== -1);
assert.ok(host.indexOf("Matching Softness") !== -1);
assert.ok(host.indexOf("Background Color") !== -1);
assert.ok(host.indexOf("Gray Level Softness") !== -1 || host.indexOf("gray level softness") !== -1);

const code = host.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
["Keylight", "ADBE Shift Channels", "ADBE Color Key", "ADBE Simple Choker", "ADBE Spill2"].forEach(function (name) {
  assert.strictEqual(code.indexOf(name), -1, name);
});

assert.ok(bridge.indexOf("removeBackground") !== -1);
assert.ok(bridge.indexOf("inspectKey") !== -1);
assert.ok(bridge.indexOf("checkerboard") !== -1);
assert.ok(view.indexOf("Remove solid background") !== -1);
assert.ok(view.indexOf("Halo cleanup") !== -1);
assert.strictEqual(css.indexOf("@container"), -1);
assert.strictEqual(css.indexOf(":has("), -1);
assert.strictEqual(css.indexOf("color-mix("), -1);
assert.ok(view.indexOf("repeating-linear-gradient") === -1);

require(path.join(__dirname, "..", "extension", "js", "bridge.js"));
require(path.join(__dirname, "..", "extension", "js", "view.js"));
