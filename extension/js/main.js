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
    outsideHost: false
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
    scan();
    RR.view.render(state);
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
      savePrefs(false);
      RR.view.render(state);
    },
    "toggle-select": function (button) {
      var id = button.getAttribute("data-id");
      mutatePrefs(function () { state.prefs.selected = RR.preferences.toggleId(state.prefs.selected, id); });
    },
    "toggle-favorite": function (button) {
      var id = button.getAttribute("data-id");
      mutatePrefs(function () { state.prefs.favorites = RR.preferences.toggleId(state.prefs.favorites, id); });
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
      });
    },
    "reveal-extension": function () { reveal(state.paths.extension); },
    "reveal-presets": function () { reveal(state.paths.presets); },
    "reveal-my": function () { reveal(state.paths.my); },
    "reveal-prefs": function () { reveal(RR.util.parent(state.prefsPath)); }
  };

  document.body.addEventListener("click", function (event) {
    var button = event.target.closest("[data-action]");
    if (!button || button.disabled) return;
    var action = actions[button.getAttribute("data-action")];
    if (action) action(button);
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
