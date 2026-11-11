(function () {
  var RR = window.RRTools;
  var state = {
    section: "home",
    prefs: RR.preferences.defaults(),
    prefsError: "",
    prefsPath: "",
    catalog: { presets: [], warnings: [] },
    paths: { extension: "", presets: "", presetsReason: "", my: "", userData: "", jsx: "" },
    host: { status: "pending", payload: null, error: "" },
    notice: null,
    busy: false,
    outsideHost: false,
    query: "",
    categoryFilter: "",
    sort: "name",
    favoritesOnly: false,
    detailId: "",
    paletteOpen: false,
    paletteQuery: "",
    paletteIndex: 0,
    resultIndex: 0,
    popId: "",
    scanning: false
  };
  var cs = null;
  var bridge = null;
  var fsApi = null;
  var probing = false;

  function findPreset(id) {
    for (var i = 0; i < state.catalog.presets.length; i++) {
      if (state.catalog.presets[i].id === id) return state.catalog.presets[i];
    }
    return null;
  }

  function presetsInCategory(category) {
    return state.catalog.presets.filter(function (preset) { return preset.category === category; });
  }

  function notify(kind, code, message, detail) {
    state.notice = { kind: kind, code: code || "", message: message || "", detail: detail || "" };
    RR.view.render(state);
  }

  function failureDetail(result) {
    if (!result || !result.failed || !result.failed.length) return "";
    return result.failed.slice(0, 3).map(function (item) {
      return (item.layer || item.path || "preset") + ": " + item.message;
    }).join(" ");
  }

  function savePrefs(force) {
    if (state.outsideHost) return false;
    if (state.prefsError && !force) {
      notify("error", "BAD_PREFS", "Preferences were not written because the existing file could not be parsed. Reset preferences to replace it.");
      return false;
    }
    try {
      state.prefs.section = state.section;
      fsApi.makeDir(RR.util.parent(state.prefsPath));
      fsApi.writeText(state.prefsPath, RR.preferences.serialize(state.prefs));
      state.prefsError = "";
      return true;
    } catch (err) {
      notify("error", "PREFS_WRITE", "Could not save preferences at " + state.prefsPath + ". " + err.message);
      return false;
    }
  }

  function loadPrefs() {
    if (!fsApi.exists(state.prefsPath)) {
      state.prefs = RR.preferences.defaults();
      state.section = "home";
      return;
    }
    try {
      state.prefs = RR.preferences.normalize(JSON.parse(fsApi.readText(state.prefsPath)));
      state.section = state.prefs.section;
      state.prefsError = "";
    } catch (err) {
      state.prefs = RR.preferences.defaults();
      state.section = "home";
      state.prefsError = "Could not read preferences at " + state.prefsPath + ". " + err.message + " The file was left unchanged.";
    }
  }

  function scan() {
    var discovered = RR.catalog.discoverBundleRoot(state.paths.extension, state.prefs.bundlePresetsPath, fsApi);
    state.paths.presets = discovered.path;
    state.paths.presetsReason = discovered.reason;
    var bundle = RR.catalog.scanRoot(fsApi, discovered.path, "bundle");
    state.paths.my = state.prefs.myPresetsPath || "";
    var mine = state.paths.my ? RR.catalog.scanRoot(fsApi, state.paths.my, "my") : { presets: [], warnings: [], root: "" };
    var added = RR.catalog.scanFileList(fsApi, state.prefs.myPresetFiles, "myfile");
    state.catalog = RR.catalog.mergeScans(bundle, mine, added);
    RR.view.clearPreviewCache();
  }

  function refresh() {
    state.scanning = true;
    RR.view.render(state);
    setTimeout(function () {
      scan();
      state.scanning = false;
      RR.view.render(state);
    }, 16);
  }

  function rememberRecent(presets) {
    var now = Date.now();
    var ids = {};
    presets.forEach(function (preset) { ids[preset.id] = true; });
    var rest = (state.prefs.recent || []).filter(function (item) { return !ids[item.id]; });
    state.prefs.recent = presets.map(function (preset) {
      return { id: preset.id, at: now };
    }).concat(rest).slice(0, 20);
  }

  function probe() {
    if (!bridge || state.busy || probing) return;
    probing = true;
    bridge.probe().then(function (result) {
      probing = false;
      if (!result.ok) state.host = { status: "error", payload: null, error: result.message || "Probe failed." };
      else state.host = { status: "ready", payload: result, error: "" };
      RR.view.renderHost(state);
    });
  }

  function applyPresets(presets) {
    if (state.busy) return;
    if (!presets.length) {
      notify("error", "NO_SELECTION", "Select a preset first.");
      return;
    }
    state.busy = true;
    RR.view.render(state);
    bridge.applyPresets(presets.map(function (preset) { return preset.filePath; })).then(function (result) {
      state.busy = false;
      var message = result.message || "After Effects did not return an apply result.";
      if (result.ok && typeof result.time === "number") message += " Current time: " + result.time.toFixed(2) + "s.";
      if (result.ok) {
        rememberRecent(presets);
        savePrefs(false);
      }
      notify(result.ok ? "ok" : "error", result.code || "APPLY_FAILED", message, failureDetail(result));
      probe();
    });
  }

  function mutatePrefs(change, force) {
    change();
    if (savePrefs(!!force)) RR.view.render(state);
  }

  function chooseFolder(title, current) {
    var choice = RR.cepfs.chooseDirectory(title, current || "");
    if (!choice.ok) {
      if (choice.code !== "CANCELLED") notify("error", choice.code, choice.message);
      return "";
    }
    return choice.path;
  }

  function addPresetFiles() {
    var start = state.prefs.myPresetsPath || "";
    var choice = RR.cepfs.chooseFiles("Add .ffx presets", start, ["ffx"]);
    if (!choice.ok) {
      if (choice.code !== "CANCELLED") notify("error", choice.code, choice.message);
      return;
    }
    mutatePrefs(function () {
      choice.paths.forEach(function (filePath) {
        if (RR.util.extensionOf(filePath) !== "ffx") return;
        var already = state.prefs.myPresetFiles.some(function (item) {
          return RR.util.samePath(item, filePath);
        });
        if (!already) state.prefs.myPresetFiles.push(filePath);
      });
    });
    refresh();
  }

  function siblingExtras(filePath) {
    var directory = RR.util.parent(filePath);
    var stem = RR.util.basename(filePath).replace(/\.ffx$/i, "").toLowerCase();
    var entries;
    try {
      entries = fsApi.readDir(directory);
    } catch (err) {
      return [];
    }
    return entries.filter(function (entry) {
      if (entry.isDirectory) return false;
      var ext = RR.util.extensionOf(entry.name);
      if (ext !== "json" && ext !== "png" && ext !== "jpg" && ext !== "jpeg" && ext !== "webp") return false;
      return entry.name.replace(/\.[^.]+$/, "").toLowerCase() === stem;
    });
  }

  function renamePreset(preset) {
    var current = RR.util.basename(preset.filePath).replace(/\.ffx$/i, "");
    var next = window.prompt("Rename the .ffx file", current);
    if (next == null) return;
    next = String(next).trim();
    if (!next || /[\\/:*?"<>|]/.test(next)) {
      notify("error", "BAD_NAME", "Use a file name without slashes or other reserved characters.");
      return;
    }
    if (!/\.ffx$/i.test(next)) next += ".ffx";
    var target = RR.util.join(RR.util.parent(preset.filePath), next);
    if (RR.util.samePath(target, preset.filePath)) return;
    if (fsApi.exists(target)) {
      notify("error", "EXISTS", "A file with that name is already in the folder.");
      return;
    }
    var extras = siblingExtras(preset.filePath);
    var stem = next.replace(/\.ffx$/i, "");
    try {
      fsApi.rename(preset.filePath, target);
    } catch (err) {
      notify("error", "RENAME_FAILED", "Could not rename the preset. " + err.message);
      return;
    }
    extras.forEach(function (entry) {
      var renamed = RR.util.join(RR.util.parent(preset.filePath), stem + "." + RR.util.extensionOf(entry.name));
      if (RR.util.samePath(renamed, entry.path) || fsApi.exists(renamed)) return;
      try { fsApi.rename(entry.path, renamed); } catch (err) { /* the preset file already moved */ }
    });
    state.prefs.myPresetFiles = state.prefs.myPresetFiles.map(function (item) {
      return RR.util.samePath(item, preset.filePath) ? target : item;
    });
    scan();
    var match = null;
    state.catalog.presets.forEach(function (item) {
      if (RR.util.samePath(item.filePath, target)) match = item;
    });
    if (match) {
      state.prefs.favorites = RR.preferences.replaceId(state.prefs.favorites, preset.id, match.id);
      state.prefs.selected = RR.preferences.replaceId(state.prefs.selected, preset.id, match.id);
      state.prefs.recent = (state.prefs.recent || []).map(function (item) {
        return item.id === preset.id ? { id: match.id, at: item.at } : item;
      });
      state.detailId = match.id;
    }
    if (savePrefs(false)) {
      state.notice = { kind: "ok", code: "RENAMED", message: "Renamed the preset file to " + next + ".", detail: "" };
      RR.view.render(state);
    }
  }

  function deletePreset(preset) {
    if (!window.confirm("Delete " + preset.name + " from disk? This removes the .ffx file.")) return;
    try {
      fsApi.deleteFile(preset.filePath);
      siblingExtras(preset.filePath).forEach(function (entry) {
        try { fsApi.deleteFile(entry.path); } catch (err) { /* sidecar cleanup is best effort */ }
      });
    } catch (err) {
      notify("error", "DELETE_FAILED", "Could not delete the preset. " + err.message);
      return;
    }
    state.prefs.myPresetFiles = state.prefs.myPresetFiles.filter(function (item) {
      return !RR.util.samePath(item, preset.filePath);
    });
    state.prefs.favorites = state.prefs.favorites.filter(function (id) { return id !== preset.id; });
    state.prefs.selected = state.prefs.selected.filter(function (id) { return id !== preset.id; });
    state.prefs.recent = (state.prefs.recent || []).filter(function (item) { return item.id !== preset.id; });
    if (state.detailId === preset.id) state.detailId = "";
    if (savePrefs(false)) {
      state.notice = { kind: "ok", code: "DELETED", message: "Deleted " + preset.name + ".", detail: "" };
      refresh();
    }
  }

  function reveal(path) {
    if (!path) {
      notify("error", "MISSING_FOLDER", "That folder is not set.");
      return;
    }
    bridge.revealFolder(path).then(function (result) {
      notify(result.ok ? "ok" : "error", result.code, result.message);
    });
  }

  var actions = {
    nav: function (button) {
      state.section = button.getAttribute("data-section");
      state.query = "";
      state.categoryFilter = "";
      state.favoritesOnly = false;
      state.resultIndex = 0;
      state.paletteOpen = false;
      savePrefs(false);
      RR.view.render(state);
    },
    "open-category": function (button) {
      state.section = "presets";
      state.categoryFilter = button.getAttribute("data-category") || "";
      state.query = "";
      state.resultIndex = 0;
      RR.view.render(state);
    },
    "clear-search": function () {
      state.query = "";
      state.resultIndex = 0;
      RR.view.render(state);
    },
    "show-notice": function () {
      var notice = document.getElementById("notice");
      if (notice && !notice.hidden) notice.scrollIntoView({ block: "nearest" });
    },
    "close-palette": function () {
      state.paletteOpen = false;
      RR.view.render(state);
    },
    "palette-run": function (button) {
      var command = button.getAttribute("data-command") || "";
      state.paletteOpen = false;
      state.paletteQuery = "";
      if (command.indexOf("inspect:") === 0) {
        state.detailId = command.slice(8);
        state.section = "presets";
        state.paletteOpen = false;
        RR.view.render(state);
        return;
      }
      if (command.indexOf("nav:") === 0) {
        state.section = command.slice(4);
        state.query = "";
        state.categoryFilter = "";
        savePrefs(false);
        RR.view.render(state);
        return;
      }
      var action = actions[command];
      if (action) action(button);
    },
    inspect: function (button) {
      var id = button.getAttribute("data-id");
      state.detailId = state.detailId === id ? "" : id;
      RR.view.render(state);
    },
    "close-detail": function () {
      state.detailId = "";
      RR.view.render(state);
    },
    "set-view": function (button) {
      var mode = button.getAttribute("data-mode") === "list" ? "list" : "grid";
      mutatePrefs(function () { state.prefs.viewMode = mode; });
    },
    "toggle-fav-filter": function () {
      state.favoritesOnly = !state.favoritesOnly;
      RR.view.render(state);
    },
    "rename-preset": function (button) {
      var preset = findPreset(button.getAttribute("data-id"));
      if (preset) renamePreset(preset);
    },
    "delete-preset": function (button) {
      var preset = findPreset(button.getAttribute("data-id"));
      if (preset) deletePreset(preset);
    },
    "reveal-preset": function (button) {
      var preset = findPreset(button.getAttribute("data-id"));
      if (preset) reveal(RR.util.parent(preset.filePath));
    },
    "add-layer": function (button) {
      if (state.busy || !bridge) return;
      var kind = button.getAttribute("data-kind") === "solid" ? "solid" : "adjustment";
      state.busy = true;
      RR.view.render(state);
      bridge.addLayer(kind).then(function (result) {
        state.busy = false;
        notify(result.ok ? "ok" : "error", result.code || "LAYER_FAILED", result.message || "After Effects did not create the layer.");
        probe();
      });
    },
    "toggle-select": function (button) {
      var id = button.getAttribute("data-id");
      mutatePrefs(function () { state.prefs.selected = RR.preferences.toggleId(state.prefs.selected, id); });
    },
    "toggle-favorite": function (button) {
      var id = button.getAttribute("data-id");
      state.popId = id;
      mutatePrefs(function () { state.prefs.favorites = RR.preferences.toggleId(state.prefs.favorites, id); });
      setTimeout(function () {
        if (state.popId !== id) return;
        state.popId = "";
        RR.view.render(state);
      }, 200);
    },
    "select-category": function (button) {
      var category = button.getAttribute("data-category");
      var ids = presetsInCategory(category).map(function (preset) { return preset.id; });
      var all = ids.every(function (id) { return RR.preferences.contains(state.prefs.selected, id); });
      mutatePrefs(function () {
        if (all) state.prefs.selected = state.prefs.selected.filter(function (id) { return ids.indexOf(id) === -1; });
        else ids.forEach(function (id) {
          if (!RR.preferences.contains(state.prefs.selected, id)) state.prefs.selected.push(id);
        });
      });
    },
    "apply-one": function (button) {
      var preset = findPreset(button.getAttribute("data-id"));
      applyPresets(preset ? [preset] : []);
    },
    "apply-selected": function () {
      applyPresets(state.prefs.selected.map(findPreset).filter(Boolean));
    },
    "apply-category": function (button) {
      applyPresets(presetsInCategory(button.getAttribute("data-category")));
    },
    rescan: refresh,
    "choose-my": function () {
      var path = chooseFolder("Choose My Presets folder", state.prefs.myPresetsPath);
      if (!path) return;
      mutatePrefs(function () { state.prefs.myPresetsPath = path; });
      refresh();
    },
    "clear-my": function () {
      mutatePrefs(function () { state.prefs.myPresetsPath = ""; });
      refresh();
    },
    "add-files": addPresetFiles,
    "clear-files": function () {
      mutatePrefs(function () { state.prefs.myPresetFiles = []; });
      refresh();
    },
    "remove-file": function (button) {
      var preset = findPreset(button.getAttribute("data-id"));
      if (!preset) return;
      mutatePrefs(function () {
        state.prefs.myPresetFiles = state.prefs.myPresetFiles.filter(function (item) {
          return !RR.util.samePath(item, preset.filePath);
        });
      });
      refresh();
    },
    "choose-bundle": function () {
      var path = chooseFolder("Choose presets folder", state.prefs.bundlePresetsPath || state.paths.presets);
      if (!path) return;
      mutatePrefs(function () { state.prefs.bundlePresetsPath = path; });
      refresh();
    },
    "clear-bundle": function () {
      mutatePrefs(function () { state.prefs.bundlePresetsPath = ""; });
      refresh();
    },
    "reset-prefs": function () {
      state.prefs = RR.preferences.defaults();
      state.section = "home";
      if (savePrefs(true)) {
        state.notice = { kind: "ok", code: "PREFS_RESET", message: "Preferences were replaced with an empty file at " + state.prefsPath + ".", detail: "" };
        refresh();
      }
    },
    "remove-missing": function () {
      var known = state.catalog.presets.map(function (preset) { return preset.id; });
      mutatePrefs(function () {
        state.prefs.favorites = state.prefs.favorites.filter(function (id) { return known.indexOf(id) !== -1; });
        state.prefs.selected = state.prefs.selected.filter(function (id) { return known.indexOf(id) !== -1; });
        state.prefs.recent = (state.prefs.recent || []).filter(function (item) { return known.indexOf(item.id) !== -1; });
      });
    },
    "toggle-sidebar": function () {
      var app = document.getElementById("app");
      var button = document.getElementById("sidebar-toggle");
      app.classList.toggle("wide");
      if (button) button.setAttribute("aria-label", app.classList.contains("wide") ? "Collapse sidebar" : "Expand sidebar");
    },
    "reveal-extension": function () { reveal(state.paths.extension); },
    "reveal-presets": function () { reveal(state.paths.presets); },
    "reveal-my": function () { reveal(state.paths.my); },
    "reveal-prefs": function () { reveal(RR.util.parent(state.prefsPath)); }
  };

  document.body.addEventListener("input", function (event) {
    if (event.target.id === "palette-search") {
      state.paletteQuery = event.target.value;
      state.paletteIndex = 0;
      RR.view.render(state);
      return;
    }
    if (event.target.id !== "preset-search") return;
    state.query = event.target.value;
    state.resultIndex = 0;
    if (state.query && (state.section === "home" || state.section === "tools" || state.section === "settings")) {
      state.section = "presets";
    }
    RR.view.render(state);
  });

  document.body.addEventListener("change", function (event) {
    if (event.target.id === "motion-toggle") {
      state.prefs.motion = !!event.target.checked;
      if (savePrefs(false)) RR.view.render(state);
      return;
    }
    if (event.target.id === "category-filter") state.categoryFilter = event.target.value;
    else if (event.target.id === "sort-mode") state.sort = event.target.value === "date" ? "date" : "name";
    else return;
    state.resultIndex = 0;
    RR.view.render(state);
  });

  document.body.addEventListener("click", function (event) {
    if (event.target.id === "palette") {
      state.paletteOpen = false;
      RR.view.render(state);
      return;
    }
    var button = event.target.closest("[data-action]");
    if (!button || button.disabled) return;
    if (button.getAttribute("data-action") === "inspect") {
      var nested = event.target.closest("button, summary, a, input, select");
      if (nested && nested !== button) return;
    }
    var action = actions[button.getAttribute("data-action")];
    if (action) action(button);
  });

  function typingTarget(event) {
    var tag = event.target && event.target.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
  }

  document.addEventListener("keydown", function (event) {
    var mod = event.ctrlKey || event.metaKey;
    if (mod && event.key.toLowerCase() === "k") {
      event.preventDefault();
      state.paletteOpen = !state.paletteOpen;
      state.paletteQuery = "";
      state.paletteIndex = 0;
      RR.view.render(state);
      if (state.paletteOpen) {
        var paletteInput = document.getElementById("palette-search");
        if (paletteInput) paletteInput.focus();
      }
      return;
    }
    if (state.paletteOpen) {
      var commands = document.querySelectorAll("#palette-list .command");
      if (event.key === "Escape") {
        state.paletteOpen = false;
        RR.view.render(state);
      } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        var step = event.key === "ArrowDown" ? 1 : -1;
        var count = commands.length || 1;
        state.paletteIndex = (state.paletteIndex + step + count) % count;
        RR.view.render(state);
        var again = document.getElementById("palette-search");
        if (again) again.focus();
      } else if (event.key === "Enter") {
        event.preventDefault();
        var selected = document.querySelector("#palette-list .command.on");
        if (selected) selected.click();
      }
      return;
    }
    if (event.key === "Escape") {
      if (state.detailId && !typingTarget(event)) {
        state.detailId = "";
        RR.view.render(state);
      } else if (state.query && event.target && event.target.id === "preset-search") {
        state.query = "";
        state.resultIndex = 0;
        RR.view.render(state);
      }
      return;
    }
    if (!event.target || event.target.id !== "preset-search") return;
    var cards = document.querySelectorAll("#view .preset-card, #view .list-row, #view .recent-row, #view .feature-row");
    if (!cards.length) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      var delta = event.key === "ArrowDown" ? 1 : -1;
      state.resultIndex = Math.max(0, Math.min(cards.length - 1, state.resultIndex + delta));
      RR.view.render(state);
      var search = document.getElementById("preset-search");
      if (search) {
        search.focus();
        var end = search.value.length;
        search.setSelectionRange(end, end);
      }
    } else if (event.key === "Enter") {
      event.preventDefault();
      var card = cards[state.resultIndex] || cards[0];
      if (!card) return;
      state.detailId = card.getAttribute("data-id");
      RR.view.render(state);
    }
  });

  function boot() {
    if (!window.__adobe_cep__) {
      state.outsideHost = true;
      state.host = { status: "error", payload: null, error: "Not running inside After Effects." };
      RR.view.mount(state);
      return;
    }
    cs = new CSInterface();
    bridge = RR.bridge.create(cs);
    fsApi = RR.cepfs.create();
    var extensionPath = RR.cepfs.resolveExtensionPath(cs.getSystemPath(SystemPath.EXTENSION));
    var userData = cs.getSystemPath(SystemPath.USER_DATA);
    state.paths.extension = extensionPath;
    state.paths.userData = userData;
    state.paths.jsx = RR.util.join(extensionPath, "jsx/host.jsx");
    state.prefsPath = RR.util.join(RR.util.join(userData, "RRTools"), "preferences.json");
    loadPrefs();
    scan();
    RR.view.mount(state);
    bridge.loadHost(state.paths.jsx).then(function (loaded) {
      if (!loaded.ok) {
        state.host = { status: "error", payload: null, error: loaded.message };
        RR.view.render(state);
        return;
      }
      return bridge.ping().then(function (ping) {
        if (!ping.ok) {
          state.host = { status: "error", payload: null, error: ping.message };
          RR.view.render(state);
          return;
        }
        probe();
      });
    });
    setInterval(probe, 2000);
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) probe();
    });
  }

  boot();
})();
