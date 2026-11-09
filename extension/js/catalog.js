(function (root) {
  var RR = root.RRTools = root.RRTools || {};
  var util = RR.util;
  var IMAGE_EXT = { png: true, jpg: true, jpeg: true, webp: true };
  var MAX_DEPTH = 8;

  function isHidden(name) {
    return !name || name.charAt(0) === "." || name.charAt(0) === "~";
  }

  function readSidecar(fsApi, jsonPath, warnings, presetPath) {
    var text;
    try {
      text = fsApi.readText(jsonPath);
    } catch (err) {
      warnings.push("Could not read " + jsonPath + ": " + err.message);
      return {};
    }
    if (text == null) return {};
    try {
      var parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("sidecar must be a JSON object");
      }
      return {
        name: typeof parsed.name === "string" ? parsed.name.trim() : "",
        description: typeof parsed.description === "string" ? parsed.description.trim() : "",
        category: typeof parsed.category === "string" ? parsed.category.trim() : ""
      };
    } catch (err) {
      warnings.push("Ignored invalid sidecar for " + presetPath + ": " + err.message);
      return {};
    }
  }

  function findPreview(filesByStem, stem) {
    var names = filesByStem[stem] || [];
    for (var i = 0; i < names.length; i++) {
      if (IMAGE_EXT[util.extensionOf(names[i])]) return names[i];
    }
    return "";
  }

  function walk(fsApi, rootPath, source, depth, relativeDir, presets, warnings, seen) {
    if (depth > MAX_DEPTH) {
      warnings.push("Stopped scanning deeper than " + MAX_DEPTH + " levels in " + rootPath);
      return;
    }
    var entries;
    try {
      entries = fsApi.readDir(rootPath);
    } catch (err) {
      warnings.push("Could not read " + rootPath + ": " + (err && err.message ? err.message : String(err)));
      return;
    }
    entries.sort(function (a, b) {
      return a.name.localeCompare(b.name);
    });

    var filesByStem = {};
    entries.forEach(function (entry) {
      if (entry.isDirectory || isHidden(entry.name)) return;
      var stem = entry.name.replace(/\.[^.]+$/, "").toLowerCase();
      filesByStem[stem] = filesByStem[stem] || [];
      filesByStem[stem].push(entry.name);
    });

    entries.forEach(function (entry) {
      if (isHidden(entry.name)) return;
      if (entry.isDirectory) {
        var nextRel = relativeDir ? relativeDir + "/" + entry.name : entry.name;
        walk(fsApi, entry.path, source, depth + 1, nextRel, presets, warnings, seen);
        return;
      }
      if (util.extensionOf(entry.name) !== "ffx") return;
      var relativePath = relativeDir ? relativeDir + "/" + entry.name : entry.name;
      var id = source + ":" + relativePath;
      if (seen[id]) {
        warnings.push("Duplicate preset id " + id);
        return;
      }
      seen[id] = true;
      var stem = entry.name.replace(/\.ffx$/i, "");
      var sidecarName = "";
      (filesByStem[stem.toLowerCase()] || []).some(function (name) {
        if (util.extensionOf(name) === "json") {
          sidecarName = name;
          return true;
        }
        return false;
      });
      var meta = sidecarName ? readSidecar(fsApi, util.join(rootPath, sidecarName), warnings, entry.path) : {};
      var previewName = findPreview(filesByStem, stem.toLowerCase());
      var category = meta.category || relativeDir || "General";
      presets.push({
        id: id,
        name: meta.name || util.prettyName(entry.name),
        category: category,
        description: meta.description || "",
        filePath: entry.path,
        relativePath: relativePath,
        previewPath: previewName ? util.join(rootPath, previewName) : "",
        source: source
      });
    });
  }

  function scanRoot(fsApi, rootPath, source) {
    var presets = [];
    var warnings = [];
    if (!rootPath) {
      return { presets: presets, warnings: warnings, root: "" };
    }
    if (!fsApi.isDirectory(rootPath)) {
      warnings.push("Presets folder does not exist: " + rootPath);
      return { presets: presets, warnings: warnings, root: rootPath };
    }
    walk(fsApi, rootPath, source, 0, "", presets, warnings, {});
    presets.sort(function (a, b) {
      var category = a.category.localeCompare(b.category);
      if (category) return category;
      return a.name.localeCompare(b.name);
    });
    return { presets: presets, warnings: warnings, root: rootPath };
  }

  function discoverBundleRoot(extensionPath, overridePath, fsApi) {
    if (overridePath) {
      return {
        path: overridePath,
        reason: fsApi.isDirectory(overridePath) ? "settings" : "missing"
      };
    }
    var sibling = util.join(util.parent(extensionPath), "presets");
    if (fsApi.isDirectory(sibling)) return { path: sibling, reason: "sibling" };
    var inside = util.join(extensionPath, "presets");
    if (fsApi.isDirectory(inside)) return { path: inside, reason: "inside-extension" };
    return { path: sibling, reason: "missing" };
  }

  function mergeScans(bundleScan, myScan) {
    var warnings = bundleScan.warnings.concat(myScan.warnings);
    var presets = bundleScan.presets.slice();
    if (bundleScan.root && myScan.root && util.samePath(bundleScan.root, myScan.root)) {
      warnings.push("My Presets folder matches the library folder, so those files are listed once.");
    } else {
      presets = presets.concat(myScan.presets);
    }
    return {
      presets: presets,
      warnings: warnings,
      bundleRoot: bundleScan.root,
      myRoot: myScan.root
    };
  }

  function groupByCategory(presets) {
    var groups = {};
    var order = [];
    presets.forEach(function (preset) {
      if (!groups[preset.category]) {
        groups[preset.category] = [];
        order.push(preset.category);
      }
      groups[preset.category].push(preset);
    });
    order.sort(function (a, b) { return a.localeCompare(b); });
    return order.map(function (category) {
      return { category: category, presets: groups[category] };
    });
  }

  RR.catalog = {
    scanRoot: scanRoot,
    discoverBundleRoot: discoverBundleRoot,
    mergeScans: mergeScans,
    groupByCategory: groupByCategory
  };
})(typeof window !== "undefined" ? window : global);
