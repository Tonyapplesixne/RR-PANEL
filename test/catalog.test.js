"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.join(__dirname, "..", "extension", "js");
global.window = undefined;
require(path.join(root, "util.js"));
require(path.join(root, "preferences.js"));
require(path.join(root, "catalog.js"));

const RR = global.RRTools;
const util = RR.util;
const preferences = RR.preferences;
const catalog = RR.catalog;

function nodeFs() {
  return {
    isDirectory: function (target) {
      try { return fs.statSync(target).isDirectory(); } catch (err) { return false; }
    },
    exists: function (target) {
      try { fs.statSync(target); return true; } catch (err) { return false; }
    },
    readDir: function (target) {
      return fs.readdirSync(target).map(function (name) {
        const full = path.join(target, name);
        return { name: name, path: full, isDirectory: fs.statSync(full).isDirectory() };
      });
    },
    readText: function (target) {
      return fs.readFileSync(target, "utf8");
    }
  };
}

function write(file, contents) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents);
}

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "rr-tools-"));
try {
  const empty = path.join(temp, "empty");
  fs.mkdirSync(empty);
  const emptyScan = catalog.scanRoot(nodeFs(), empty, "bundle");
  assert.deepStrictEqual(emptyScan.presets, []);
  assert.deepStrictEqual(emptyScan.warnings, []);

  const missing = catalog.scanRoot(nodeFs(), path.join(temp, "nope"), "bundle");
  assert.strictEqual(missing.presets.length, 0);
  assert.ok(missing.warnings[0].indexOf("does not exist") !== -1);

  const library = path.join(temp, "presets");
  write(path.join(library, "Motion", "Camera Shake.ffx"), "not-a-real-preset");
  write(path.join(library, "Motion", "Camera Shake.json"), JSON.stringify({
    name: "Camera Shake",
    description: "Position wiggle",
    category: "Motion"
  }));
  write(path.join(library, "Motion", "Camera Shake.png"), "png");
  write(path.join(library, "Broken.ffx"), "not-a-real-preset");
  write(path.join(library, "Broken.json"), "{");
  write(path.join(library, ".hidden.ffx"), "skip");

  const scan = catalog.scanRoot(nodeFs(), library, "bundle");
  assert.strictEqual(scan.presets.length, 2);
  const shake = scan.presets.find(function (preset) { return preset.relativePath === "Motion/Camera Shake.ffx"; });
  assert.ok(shake);
  assert.strictEqual(shake.id, "bundle:Motion/Camera Shake.ffx");
  assert.strictEqual(shake.name, "Camera Shake");
  assert.strictEqual(shake.category, "Motion");
  assert.strictEqual(shake.description, "Position wiggle");
  assert.ok(shake.previewPath.endsWith("Camera Shake.png"));
  assert.strictEqual(shake.filePath.endsWith("Camera Shake.ffx"), true);
  const broken = scan.presets.find(function (preset) { return preset.name === "Broken"; });
  assert.strictEqual(broken.category, "General");
  assert.ok(scan.warnings.some(function (warning) { return warning.indexOf("Broken") !== -1; }));
  assert.ok(!scan.presets.some(function (preset) { return preset.relativePath.indexOf("hidden") !== -1; }));

  const discovered = catalog.discoverBundleRoot(path.join(temp, "extension"), "", nodeFs());
  assert.strictEqual(discovered.reason, "sibling");
  assert.strictEqual(discovered.path, library);

  const prefs = preferences.normalize({
    favorites: ["bundle:Motion/Camera Shake.ffx", "bundle:Motion/Camera Shake.ffx", 4],
    selected: ["missing"],
    section: "nope",
    myPresetsPath: library,
    myPresetFiles: [path.join(temp, "loose", "snow blue text glow.ffx"), path.join(temp, "loose", "snow blue text glow.ffx")]
  });
  assert.deepStrictEqual(prefs.favorites, ["bundle:Motion/Camera Shake.ffx"]);
  assert.strictEqual(prefs.section, "home");
  assert.strictEqual(prefs.viewMode, "grid");
  assert.strictEqual(preferences.normalize({ section: "tools", viewMode: "list" }).section, "tools");
  assert.deepStrictEqual(preferences.replaceId(["myfile:C:/old.ffx"], "myfile:C:/old.ffx", "myfile:C:/new.ffx"), ["myfile:C:/new.ffx"]);
  assert.strictEqual(prefs.myPresetFiles.length, 1);
  const roundTrip = preferences.normalize(JSON.parse(preferences.serialize(prefs)));
  assert.deepStrictEqual(roundTrip.favorites, prefs.favorites);
  assert.deepStrictEqual(roundTrip.myPresetFiles, prefs.myPresetFiles);

  const looseDir = path.join(temp, "loose");
  const looseFile = path.join(looseDir, "snow blue text glow.ffx");
  write(looseFile, "not-a-real-preset");
  write(path.join(looseDir, "snow blue text glow.json"), JSON.stringify({
    name: "Snow Blue Text Glow",
    description: "Blue glow",
    category: "Text"
  }));
  write(path.join(looseDir, "snow blue text glow.png"), "png");
  const loose = catalog.scanFileList(nodeFs(), [looseFile, path.join(temp, "missing.ffx"), looseFile], "myfile");
  assert.strictEqual(loose.presets.length, 1);
  assert.strictEqual(loose.presets[0].name, "Snow Blue Text Glow");
  assert.strictEqual(loose.presets[0].category, "Text");
  assert.strictEqual(loose.presets[0].source, "myfile");
  assert.ok(loose.presets[0].previewPath.endsWith("snow blue text glow.png"));
  assert.ok(loose.warnings.some(function (warning) { return warning.indexOf("missing.ffx") !== -1; }));
  const merged = catalog.mergeScans(scan, { presets: [], warnings: [], root: "" }, loose);
  assert.strictEqual(merged.presets.length, 3);
  const duplicateFile = catalog.mergeScans(scan, { presets: [], warnings: [], root: "" }, catalog.scanFileList(nodeFs(), [shake.filePath], "myfile"));
  assert.strictEqual(duplicateFile.presets.length, scan.presets.length);
  assert.deepStrictEqual(preferences.missingIds(prefs.selected, scan.presets.map(function (preset) { return preset.id; })), ["missing"]);
  assert.deepStrictEqual(preferences.toggleId(prefs.favorites, shake.id), []);

  assert.strictEqual(util.prettyName("soft_light-pass.ffx"), "soft light-pass");
  assert.strictEqual(util.parent("C:\\repo\\extension"), "C:\\repo");
  assert.strictEqual(util.samePath("/tmp/presets/", "/tmp/presets"), true);

  console.log("catalog tests passed");
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
