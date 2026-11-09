(function (root) {
  var RR = root.RRTools = root.RRTools || {};
  var NS = "http://www.w3.org/2000/svg";
  var NAV = [
    ["home", "Home", "M2.5 7.2 8 2.8l5.5 4.4V13.5H10V9.5H6v4H2.5Z"],
    ["presets", "Presets", "M3 3.5h10v2.2H3Zm0 3.4h10v2.2H3Zm0 3.4h10V13.5H3Z"],
    ["categories", "Categories", "M2.5 2.5h4.2v4.2H2.5Zm6.8 0H13.5v4.2H9.3ZM2.5 9.3h4.2V13.5H2.5Zm6.8 0H13.5V13.5H9.3Z"],
    ["favorites", "Favorites", "M8 2.2 9.6 5.7l3.8.4-2.8 2.6.8 3.8L8 10.7 4.6 12.5l.8-3.8L2.6 6.1l3.8-.4Z"],
    ["my", "My Presets", "M2.2 4.2h4l1.2 1.3H13.8V12.8H2.2Z"],
    ["tools", "Tools", "M2.5 8h11M8 2.5v11M4 4l8 8M12 4l-8 8"],
    ["settings", "Settings", "M3 4.5h10M3 8h10M3 11.5h10M6 3.2v2.6M10 6.7v2.6M7.5 10.2v2.6"]
  ];
  var previewCache = {};
  var mtimeCache = {};

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (key) {
      var value = attrs[key];
      if (value == null || value === false) return;
      if (key === "class") node.className = value;
      else if (key === "text") node.textContent = value;
      else node.setAttribute(key, String(value));
    });
    (children || []).forEach(function (child) {
      if (child == null) return;
      node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
    });
    return node;
  }

  function icon(path) {
    var svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 16 16");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.4");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("aria-hidden", "true");
    var shape = document.createElementNS(NS, "path");
    shape.setAttribute("d", path);
    svg.appendChild(shape);
    return svg;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function knownMap(presets) {
    var map = {};
    presets.forEach(function (preset) { map[preset.id] = preset; });
    return map;
  }

  function previewUrl(preset) {
    if (!preset.previewPath) return "";
    if (previewCache[preset.previewPath] != null) return previewCache[preset.previewPath];
    previewCache[preset.previewPath] = "";
    if (!RR.cepfs || !RR.cepfs.available || !RR.cepfs.available()) return "";
    var fsApi = RR.cepfs.create();
    var size = fsApi.statSize(preset.previewPath);
    if (size > 2000000) return "";
    var encoded = fsApi.readBase64(preset.previewPath);
    if (!encoded) return "";
    var ext = RR.util.extensionOf(preset.previewPath);
    var mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "webp" ? "image/webp" : "image/png";
    previewCache[preset.previewPath] = "data:" + mime + ";base64," + encoded;
    return previewCache[preset.previewPath];
  }

  function monogram(name) {
    var parts = String(name || "").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "FX";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
  }

  function hue(text) {
    var n = 0;
    var i;
    for (i = 0; i < text.length; i++) n = (n + text.charCodeAt(i) * (i + 1)) % 36;
    return 258 + n;
  }

  function formatSize(bytes) {
    if (!bytes) return "0 B";
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / 1048576).toFixed(1) + " MB";
  }

  function sourceLabel(preset) {
    if (preset.source === "my") return "Folder";
    if (preset.source === "myfile") return "Added file";
    return "Library";
  }

  function layerCount(state) {
    var payload = state.host && state.host.payload;
    if (!payload || !payload.selectedLayers) return 0;
    return payload.selectedLayers.length;
  }

  function pagePresets(state) {
    if (state.section === "presets") {
      return state.catalog.presets.filter(function (preset) { return preset.source === "bundle"; });
    }
    if (state.section === "my") {
      return state.catalog.presets.filter(function (preset) {
        return preset.source === "my" || preset.source === "myfile";
      });
    }
    if (state.section === "favorites") {
      var known = knownMap(state.catalog.presets);
      return state.prefs.favorites.map(function (id) { return known[id]; }).filter(Boolean);
    }
    return state.catalog.presets.slice();
  }

  function filteredPresets(state, presets) {
    var query = String(state.query || "").trim().toLowerCase();
    var list = presets.filter(function (preset) {
      if (state.favoritesOnly && !RR.preferences.contains(state.prefs.favorites, preset.id)) return false;
      if (state.categoryFilter && preset.category !== state.categoryFilter) return false;
      if (!query) return true;
      var hay = (preset.name + " " + preset.category + " " + preset.filePath).toLowerCase();
      return hay.indexOf(query) !== -1;
    });
    list.sort(function (a, b) {
      if (state.sort === "date") return mtimeOf(b.filePath) - mtimeOf(a.filePath) || a.name.localeCompare(b.name);
      return a.name.localeCompare(b.name);
    });
    return list;
  }

  function mtimeOf(filePath) {
    if (mtimeCache[filePath] != null) return mtimeCache[filePath];
    var value = 0;
    try {
      if (typeof require === "function") {
        var stat = require("fs").statSync(filePath);
        value = stat.mtimeMs || (stat.mtime ? stat.mtime.getTime() : 0);
      }
    } catch (err) {
      value = 0;
    }
    mtimeCache[filePath] = value;
    return value;
  }

  function stat(value, label) {
    return el("div", { class: "stat" }, [el("b", { text: String(value) }), el("span", { text: label })]);
  }

  function emptyState(title, copy, action) {
    return el("section", { class: "empty" }, [
      el("div", { class: "empty-mark", "aria-hidden": "true" }),
      el("h2", { text: title }),
      el("p", { text: copy }),
      action ? el("button", { class: "primary", type: "button", "data-action": action.action, text: action.label }) : null
    ]);
  }

  function presetCard(preset, state) {
    var favorite = RR.preferences.contains(state.prefs.favorites, preset.id);
    var active = state.detailId === preset.id;
    var thumb = el("div", { class: "thumb", text: monogram(preset.name) });
    var url = previewUrl(preset);
    if (url) {
      thumb.style.backgroundImage = "url(\"" + url.replace(/"/g, "") + "\")";
      thumb.textContent = "";
    } else {
      var tone = hue(preset.category || preset.name);
      thumb.style.background = "linear-gradient(160deg, hsl(" + tone + ", 70%, 62%), hsl(" + ((tone + 24) % 360) + ", 55%, 28%))";
    }
    var copy = el("div", { class: "card-copy" }, [
      el("h2", { text: preset.name }),
      el("div", { class: "card-meta", text: sourceLabel(preset) + " · " + preset.category })
    ]);
    var apply = el("button", {
      type: "button",
      "data-action": "apply-one",
      "data-id": preset.id,
      disabled: state.busy ? "disabled" : null,
      text: "Apply"
    });
    var star = el("button", {
      class: "star",
      type: "button",
      "data-action": "toggle-favorite",
      "data-id": preset.id,
      "aria-pressed": favorite ? "true" : "false",
      "aria-label": favorite ? "Remove favorite" : "Add favorite",
      text: favorite ? "★" : "☆"
    });
    var menu = el("details", { class: "more", "data-action": "menu" }, [
      el("summary", { "aria-label": "Preset options", text: "···" }),
      el("div", { class: "menu" }, [
        el("button", { type: "button", "data-action": "reveal-preset", "data-id": preset.id, text: "Open folder" }),
        el("button", { type: "button", "data-action": "rename-preset", "data-id": preset.id, text: "Rename" }),
        el("button", { type: "button", class: "danger", "data-action": "delete-preset", "data-id": preset.id, text: "Remove" })
      ])
    ]);
    return el("article", {
      class: "preset-card" + (active ? " active" : ""),
      "data-action": "inspect",
      "data-id": preset.id
    }, [thumb, copy, el("div", { class: "card-actions" }, [star, apply, menu])]);
  }

  function toolbar(state, presets) {
    var categories = [];
    presets.forEach(function (preset) {
      if (categories.indexOf(preset.category) === -1) categories.push(preset.category);
    });
    categories.sort(function (a, b) { return a.localeCompare(b); });
    var select = el("select", { id: "category-filter", "aria-label": "Category" }, [
      el("option", { value: "", text: "All categories" })
    ]);
    categories.forEach(function (category) {
      var option = el("option", { value: category, text: category });
      if (category === state.categoryFilter) option.selected = true;
      select.appendChild(option);
    });
    var search = el("input", {
      id: "preset-search",
      class: "search",
      type: "search",
      placeholder: "Search presets",
      value: state.query || ""
    });
    var nodes = [
      search,
      select,
      el("button", {
        type: "button",
        "data-action": "toggle-fav-filter",
        "aria-pressed": state.favoritesOnly ? "true" : "false",
        text: "Favorites"
      }),
      el("select", { id: "sort-mode", "aria-label": "Sort" }, [
        el("option", { value: "name", text: "Name", selected: state.sort !== "date" ? "selected" : null }),
        el("option", { value: "date", text: "Date", selected: state.sort === "date" ? "selected" : null })
      ]),
      el("button", {
        type: "button",
        "data-action": "set-view",
        "data-mode": "grid",
        "aria-pressed": state.prefs.viewMode === "list" ? "false" : "true",
        text: "Grid"
      }),
      el("button", {
        type: "button",
        "data-action": "set-view",
        "data-mode": "list",
        "aria-pressed": state.prefs.viewMode === "list" ? "true" : "false",
        text: "List"
      })
    ];
    return el("div", { class: "toolbar" }, nodes);
  }

  function presetBrowser(state, title, subtitle, presets, emptyTitle, emptyCopy, extra, emptyAction) {
    var shown = filteredPresets(state, presets);
    var categories = {};
    presets.forEach(function (preset) { categories[preset.category] = true; });
    var favoriteCount = presets.filter(function (preset) {
      return RR.preferences.contains(state.prefs.favorites, preset.id);
    }).length;
    var nodes = [
      el("div", { class: "page-head" }, [el("h1", { text: title }), el("p", { text: subtitle })]),
      el("div", { class: "stats" }, [
        stat(presets.length, "Presets"),
        stat(favoriteCount, "Favorites"),
        stat(Object.keys(categories).length, "Categories"),
        stat(layerCount(state), "Selected layers")
      ]),
      extra || null,
      toolbar(state, presets)
    ];
    if (!shown.length) nodes.push(emptyState(emptyTitle, emptyCopy, emptyAction));
    else {
      var grid = el("div", { class: state.prefs.viewMode === "list" ? "preset-list" : "preset-grid" });
      shown.forEach(function (preset) { grid.appendChild(presetCard(preset, state)); });
      nodes.push(grid);
    }
    return nodes;
  }

  function hostCard(state) {
    var host = state.host || { status: "pending" };
    if (host.status === "pending") {
      return el("section", { class: "host-card", id: "host-card" }, [
        el("h2", { text: "Composition" }),
        el("p", { class: "muted", text: "Checking After Effects for the active composition and selected layers." })
      ]);
    }
    if (host.status === "error") {
      return el("section", { class: "host-card", id: "host-card" }, [
        el("h2", { text: "Composition" }),
        el("p", { class: "warn", text: host.error || "After Effects did not answer." })
      ]);
    }
    var payload = host.payload || {};
    var compBody = [el("div", { class: "kicker", text: "Composition" })];
    if (payload.contextError) {
      compBody.push(el("p", { class: "warn", text: payload.contextError.message }));
      compBody.push(el("div", { class: "code faint", text: payload.contextError.code }));
    } else if (payload.composition) {
      var comp = payload.composition;
      compBody.push(el("strong", { text: comp.name }));
      compBody.push(el("div", { class: "comp-meta" }, [
        el("span", { text: comp.width + " × " + comp.height }),
        el("span", { text: comp.frameRate + " fps" }),
        el("span", { text: comp.numLayers + " layers" }),
        el("span", { text: Number(comp.time).toFixed(2) + "s" })
      ]));
      if (payload.projectName) compBody.push(el("div", { class: "faint", text: payload.projectName }));
    }
    var layerBody = [el("div", { class: "kicker", text: "Selected layer" })];
    if (payload.selectionError) {
      layerBody.push(el("p", { class: "warn", text: payload.selectionError.message }));
    } else if (payload.selectedLayers && payload.selectedLayers.length) {
      var first = payload.selectedLayers[0];
      layerBody.push(el("strong", { text: first.name }));
      layerBody.push(el("div", { class: "comp-meta" }, [
        el("span", { text: first.kind || "Layer" }),
        el("span", { text: "Layer #" + first.index }),
        el("span", { text: payload.selectedLayers.length + " selected" })
      ]));
    } else {
      layerBody.push(el("p", { class: "muted", text: "No layer selected." }));
    }
    layerBody.push(el("div", { class: "actions" }, [
      el("button", { type: "button", "data-action": "add-layer", "data-kind": "adjustment", disabled: state.busy ? "disabled" : null, text: "Adjustment layer" }),
      el("button", { type: "button", "data-action": "add-layer", "data-kind": "solid", disabled: state.busy ? "disabled" : null, text: "Solid" })
    ]));
    return el("div", { class: "host-split", id: "host-card" }, [
      el("section", { class: "host-card" }, [
        el("img", { class: "card-logo", src: "assets/logos/rr-mark.png", alt: "" }),
        el("div", { class: "comp-copy" }, compBody)
      ]),
      el("section", { class: "host-card" }, [
        el("img", { class: "card-logo", src: "assets/logos/rr-mark.png", alt: "" }),
        el("div", { class: "comp-copy" }, layerBody)
      ])
    ]);
  }

  function welcomeBanner() {
    return el("section", { class: "banner" }, [
      el("img", { class: "banner-logo", src: "assets/logos/rr-mark.png", alt: "" }),
      el("div", { class: "banner-copy" }, [
        el("div", { class: "kicker", text: "Welcome to" }),
        el("h1", { text: "RR TOOLS" }),
        el("p", { text: "Your creative workspace." }),
        el("p", { class: "faint", text: "Edit faster. Create more." })
      ]),
      el("div", { class: "quick" }, [
        el("div", { class: "kicker", text: "Quick Access" }),
        el("button", { type: "button", "data-action": "nav", "data-section": "presets", text: "Open Presets" }),
        el("button", { type: "button", "data-action": "nav", "data-section": "tools", text: "Quick Tools" }),
        el("button", { type: "button", "data-action": "toggle-sidebar", text: "Collapse sidebar" }),
        el("button", { type: "button", "data-action": "nav", "data-section": "settings", text: "Settings" })
      ])
    ]);
  }

  function renderHome(state) {
    var nodes = [welcomeBanner(), hostCard(state)];
    if (state.catalog.warnings.length) {
      nodes.push(el("section", { class: "empty" }, state.catalog.warnings.map(function (warning) {
        return el("p", { class: "warn", text: warning });
      })));
    }
    nodes.push(el("div", { class: "row-actions" }, [
      el("button", { class: "primary", type: "button", "data-action": "apply-selected", disabled: state.busy ? "disabled" : null, text: "Apply selected" }),
      el("button", { class: "ghost", type: "button", "data-action": "rescan", text: "Rescan" })
    ]));
    return nodes.concat(presetBrowser(
      state,
      "Home",
      "Presets found on this computer.",
      state.catalog.presets,
      "No presets yet",
      "Import your .ffx files to get started.",
      null,
      { action: "add-files", label: "Add .ffx files" }
    ).slice(1));
  }

  function myActions(state) {
    var added = state.prefs.myPresetFiles && state.prefs.myPresetFiles.length;
    return el("div", { class: "row-actions" }, [
      el("button", { type: "button", "data-action": "add-files", text: "Add .ffx files" }),
      el("button", { type: "button", "data-action": "choose-my", text: state.paths.my ? "Change folder" : "Add folder" }),
      el("button", { type: "button", "data-action": "rescan", text: "Rescan" }),
      state.paths.my ? el("button", { type: "button", "data-action": "clear-my", text: "Clear folder" }) : null,
      added ? el("button", { type: "button", "data-action": "clear-files", text: "Clear added files" }) : null
    ]);
  }

  function renderCategories(state) {
    var groups = RR.catalog.groupByCategory(state.catalog.presets);
    var nodes = [el("div", { class: "page-head" }, [
      el("h1", { text: "Categories" }),
      el("p", { text: groups.length + " categories from the scanned .ffx files." })
    ])];
    if (!groups.length) {
      nodes.push(emptyState("No categories", "Categories appear when .ffx files are found. A file in a subfolder uses that folder name. Files at the root use General."));
      return nodes;
    }
    groups.forEach(function (group) {
      var ids = group.presets.map(function (preset) { return preset.id; });
      var allSelected = ids.every(function (id) { return RR.preferences.contains(state.prefs.selected, id); });
      nodes.push(el("section", { class: "group-card" }, [
        el("h2", { text: group.category }),
        el("p", { class: "muted", text: group.presets.length + " preset" + (group.presets.length === 1 ? "" : "s") }),
        el("div", { class: "actions" }, [
          el("button", {
            type: "button",
            "data-action": "select-category",
            "data-category": group.category,
            "aria-pressed": allSelected ? "true" : "false",
            text: allSelected ? "Clear category" : "Select category"
          }),
          el("button", {
            type: "button",
            "data-action": "apply-category",
            "data-category": group.category,
            disabled: state.busy ? "disabled" : null,
            text: "Apply category"
          })
        ])
      ]));
    });
    return nodes;
  }

  function pathRow(label, value, action, actionLabel) {
    return el("section", { class: "path-row" }, [
      el("span", { class: "faint", text: label }),
      el("code", { text: value || "Not set" }),
      action ? el("div", { class: "actions" }, [el("button", { type: "button", "data-action": action, text: actionLabel })]) : null
    ]);
  }

  function renderTools(state) {
    var version = state.host && state.host.payload ? state.host.payload.version : "";
    return [
      el("div", { class: "page-head" }, [
        el("h1", { text: "Tools" }),
        el("p", { text: "Actions that talk to After Effects or to the files this panel already uses." })
      ]),
      hostCard(state),
      el("div", { class: "row-actions" }, [
        el("button", { type: "button", "data-action": "rescan", text: "Rescan" }),
        el("button", { type: "button", "data-action": "reveal-extension", text: "Reveal extension" }),
        el("button", { type: "button", "data-action": "reveal-presets", text: "Reveal presets" }),
        el("button", { type: "button", "data-action": "reveal-my", text: "Reveal My Presets" }),
        el("button", { type: "button", "data-action": "reveal-prefs", text: "Reveal preferences" }),
        el("button", { type: "button", "data-action": "reset-prefs", text: "Reset preferences" })
      ]),
      el("p", { class: "faint", text: version ? "Host version " + version + "." : "Host version appears after After Effects answers." })
    ];
  }

  function renderSettings(state) {
    var known = Object.keys(knownMap(state.catalog.presets));
    var missing = RR.preferences.missingIds(state.prefs.favorites.concat(state.prefs.selected), known);
    var reason = {
      sibling: "Resolved next to the extension, via the real extension path.",
      "inside-extension": "Resolved inside the extension folder.",
      settings: "Using the folder chosen in Settings.",
      missing: "The folder was not found. The catalog stays empty until it exists."
    }[state.paths.presetsReason] || "";
    var nodes = [
      el("div", { class: "page-head" }, [el("h1", { text: "Settings" }), el("p", { text: "Folders and the preferences file for this Windows user." })]),
      pathRow("Extension", state.paths.extension, "reveal-extension", "Reveal"),
      pathRow("Presets", state.paths.presets, "reveal-presets", "Reveal"),
      el("p", { class: "muted", text: reason }),
      pathRow("My Presets", state.paths.my, "reveal-my", "Reveal"),
      pathRow("Preferences", state.prefsPath, "reveal-prefs", "Reveal"),
      pathRow("Host script", state.paths.jsx),
      el("div", { class: "row-actions" }, [
        el("button", { type: "button", "data-action": "choose-bundle", text: "Choose presets folder" }),
        el("button", { type: "button", "data-action": "clear-bundle", text: "Use default presets folder" }),
        el("button", { type: "button", "data-action": "add-files", text: "Add .ffx files" }),
        el("button", { type: "button", "data-action": "clear-files", text: "Clear added files" }),
        el("button", { type: "button", "data-action": "choose-my", text: "Choose My Presets folder" }),
        el("button", { type: "button", "data-action": "clear-my", text: "Clear My Presets folder" }),
        el("button", { type: "button", "data-action": "rescan", text: "Rescan" }),
        el("button", { type: "button", "data-action": "reset-prefs", text: "Reset preferences" })
      ])
    ];
    if (missing.length) {
      nodes.push(el("section", { class: "empty" }, [
        el("h2", { text: "Missing preset ids" }),
        el("p", { text: missing.join(", ") }),
        el("button", { type: "button", "data-action": "remove-missing", text: "Remove missing ids" })
      ]));
    }
    nodes.push(el("p", { class: "faint", text: "Apply calls After Effects through ExtendScript. A successful apply is reported only when the host returns APPLIED." }));
    return nodes;
  }

  function renderBody(state) {
    if (state.outsideHost) {
      return [emptyState("Open this panel in After Effects", "RR TOOLS is an After Effects 2025 CEP panel. Host detection and .ffx apply are not simulated in a browser. Install the extension, enable PlayerDebugMode for CSXS.12, and open Window > Extensions > RR TOOLS.")];
    }
    if (state.section === "presets") {
      return presetBrowser(state, "Presets", "Library presets from the presets folder.", pagePresets(state), "No library presets", "No .ffx files were found in " + (state.paths.presets || "the presets folder") + ". Add real presets and rescan.");
    }
    if (state.section === "my") {
      var added = state.prefs.myPresetFiles && state.prefs.myPresetFiles.length;
      var copy = added
        ? "None of the added .ffx files could be read."
        : state.paths.my
          ? "No .ffx files were found in " + state.paths.my + ". You can also add individual .ffx files."
          : "Add one or more .ffx files, or choose a folder of presets.";
      var page = presetBrowser(state, "My Presets", "Your .ffx files. Apply uses the layers selected in After Effects.", pagePresets(state), "No personal presets", copy, myActions(state));
      return page;
    }
    if (state.section === "categories") return renderCategories(state);
    if (state.section === "favorites") {
      return presetBrowser(state, "Favorites", "Starred presets stored in preferences on this computer.", pagePresets(state), "No favorites", "Star a preset to keep it here.");
    }
    if (state.section === "tools") return renderTools(state);
    if (state.section === "settings") return renderSettings(state);
    return renderHome(state);
  }

  function renderDetail(state) {
    var detail = document.getElementById("detail");
    if (!detail) return;
    clear(detail);
    var preset = null;
    state.catalog.presets.forEach(function (item) {
      if (item.id === state.detailId) preset = item;
    });
    var librarySection = state.section === "home" || state.section === "presets" || state.section === "my" || state.section === "favorites";
    if (!librarySection || !preset) {
      detail.className = "";
      return;
    }
    detail.className = "open";
    var size = "";
    if (RR.cepfs && RR.cepfs.available && RR.cepfs.available()) size = formatSize(RR.cepfs.create().statSize(preset.filePath));
    var favorite = RR.preferences.contains(state.prefs.favorites, preset.id);
    detail.appendChild(el("section", { class: "detail-card" }, [
      el("div", { class: "faint", text: "FFX" }),
      el("h2", { text: preset.name }),
      preset.description ? el("p", { text: preset.description }) : null,
      el("p", { class: "muted", text: "Category" }),
      el("p", { text: preset.category }),
      el("p", { class: "muted", text: "Source" }),
      el("p", { text: sourceLabel(preset) }),
      size ? el("p", { class: "muted", text: "Size" }) : null,
      size ? el("p", { text: size }) : null,
      el("p", { class: "muted", text: "Path" }),
      el("code", { text: preset.filePath }),
      el("div", { class: "actions" }, [
        el("button", {
          type: "button",
          "data-action": "apply-one",
          "data-id": preset.id,
          disabled: state.busy ? "disabled" : null,
          text: "Apply to selection"
        }),
        el("button", {
          type: "button",
          "data-action": "toggle-favorite",
          "data-id": preset.id,
          "aria-pressed": favorite ? "true" : "false",
          text: favorite ? "Unstar" : "Star"
        }),
        el("button", { type: "button", "data-action": "reveal-preset", "data-id": preset.id, text: "Open folder" }),
        el("button", { type: "button", "data-action": "rename-preset", "data-id": preset.id, text: "Rename" }),
        el("button", { type: "button", class: "danger", "data-action": "delete-preset", "data-id": preset.id, text: "Remove" })
      ])
    ]));
  }

  function renderNotice(state) {
    var notice = document.getElementById("notice");
    if (!notice) return;
    var banner = state.notice;
    if (state.prefsError && (!banner || banner.kind !== "error")) {
      banner = { kind: "error", code: "BAD_PREFS", message: state.prefsError, detail: "" };
    }
    if (!banner) {
      notice.hidden = true;
      clear(notice);
      return;
    }
    notice.hidden = false;
    notice.className = "notice " + (banner.kind || "");
    clear(notice);
    notice.appendChild(el("div", { class: "code", text: banner.code || "" }));
    notice.appendChild(el("p", { text: banner.message || "" }));
    if (banner.detail) notice.appendChild(el("p", { class: "detail", text: banner.detail }));
  }

  function renderHost(state) {
    var pill = document.getElementById("host-pill");
    if (!pill) return;
    clear(pill);
    pill.className = "pill";
    if (state.outsideHost) {
      pill.textContent = "Browser";
      return;
    }
    if (!state.host || state.host.status === "pending") {
      pill.textContent = "Checking";
      return;
    }
    var sideVersion = document.getElementById("side-version");
    if (state.host.status === "error") {
      pill.className = "pill error";
      pill.appendChild(el("span", { class: "ae", text: "Ae" }));
      pill.appendChild(el("span", { text: "Disconnected" }));
      if (sideVersion) sideVersion.textContent = "Disconnected";
    } else {
      var version = (state.host.payload && state.host.payload.version) || "";
      pill.className = "pill ready";
      pill.appendChild(el("span", { class: "ae", text: "Ae" }));
      pill.appendChild(el("span", { text: "After Effects" }));
      pill.appendChild(el("span", { class: "faint", text: version ? "v" + version : "" }));
      pill.appendChild(el("span", { class: "conn", text: "Connected" }));
      if (sideVersion) sideVersion.textContent = version || "Connected";
    }
    var current = document.getElementById("host-card");
    if (!current || (state.section !== "home" && state.section !== "tools")) return;
    current.replaceWith(hostCard(state));
  }

  function render(state) {
    var search = document.getElementById("preset-search");
    var caret = search && document.activeElement === search ? search.selectionStart : null;
    var nav = document.getElementById("nav");
    Array.prototype.forEach.call(nav.querySelectorAll("button"), function (button) {
      if (button.getAttribute("data-section") === state.section) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
    var mine = state.catalog.presets.filter(function (preset) {
      return preset.source === "my" || preset.source === "myfile";
    }).length;
    var count = nav.querySelector("[data-section='my'] .count");
    if (count) count.textContent = String(mine);
    var view = document.getElementById("view");
    clear(view);
    renderBody(state).forEach(function (node) { if (node) view.appendChild(node); });
    renderDetail(state);
    renderNotice(state);
    document.body.classList.toggle("is-busy", !!state.busy);
    renderHost(state);
    if (caret != null) {
      var next = document.getElementById("preset-search");
      if (next) {
        next.focus();
        next.setSelectionRange(caret, caret);
      }
    }
  }

  function mount(state) {
    var nav = document.getElementById("nav");
    clear(nav);
    NAV.forEach(function (item) {
      var button = el("button", { type: "button", "data-action": "nav", "data-section": item[0] });
      button.appendChild(icon(item[2]));
      button.appendChild(el("span", { text: item[1] }));
      if (item[0] === "my") button.appendChild(el("span", { class: "count", text: "0" }));
      nav.appendChild(button);
    });
    render(state);
  }

  RR.view = {
    mount: mount,
    render: render,
    renderHost: renderHost,
    clearPreviewCache: function () { previewCache = {}; mtimeCache = {}; }
  };
})(typeof window !== "undefined" ? window : global);
