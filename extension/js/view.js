(function (root) {
  var RR = root.RRTools = root.RRTools || {};
  var NS = "http://www.w3.org/2000/svg";
  var NAV = [
    ["home", "Home", "M2.5 7.2 8 2.8l5.5 4.4V13.5H10V9.5H6v4H2.5Z"],
    ["presets", "Presets", "M3 3.5h10v2.2H3Zm0 3.4h10v2.2H3Zm0 3.4h10V13.5H3Z"],
    ["categories", "Categories", "M2.5 2.5h4.2v4.2H2.5Zm6.8 0H13.5v4.2H9.3ZM2.5 9.3h4.2V13.5H2.5Zm6.8 0H13.5V13.5H9.3Z"],
    ["favorites", "Favorites", "M8 2.2 9.6 5.7l3.8.4-2.8 2.6.8 3.8L8 10.7 4.6 12.5l.8-3.8L2.6 6.1l3.8-.4Z"],
    ["my", "My Presets", "M2.2 4.2h4l1.2 1.3H13.8V12.8H2.2Z"],
    ["settings", "Settings", "M3 4.5h10M3 8h10M3 11.5h10M6 3.2v2.6M10 6.7v2.6M7.5 10.2v2.6"]
  ];
  var previewCache = {};

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

  function presetCard(preset, state) {
    var selected = RR.preferences.contains(state.prefs.selected, preset.id);
    var favorite = RR.preferences.contains(state.prefs.favorites, preset.id);
    var thumb = el("div", { class: "thumb" });
    var url = previewUrl(preset);
    if (url) thumb.style.backgroundImage = "url(\"" + url.replace(/"/g, "") + "\")";
    var body = el("div", {}, [
      el("header", {}, [
        el("h2", { text: preset.name }),
        el("button", {
          class: "star",
          type: "button",
          "data-action": "toggle-favorite",
          "data-id": preset.id,
          "aria-pressed": favorite ? "true" : "false",
          "aria-label": favorite ? "Remove favorite" : "Add favorite",
          text: favorite ? "★" : "☆"
        })
      ]),
      el("div", { class: "faint", text: preset.category + (preset.source === "my" ? " · My Presets" : preset.source === "myfile" ? " · Added file" : "") }),
      preset.description ? el("p", { class: "desc", text: preset.description }) : null,
      el("div", { class: "file", text: preset.relativePath }),
      el("div", { class: "actions" }, [
        el("button", {
          type: "button",
          "data-action": "toggle-select",
          "data-id": preset.id,
          "aria-pressed": selected ? "true" : "false",
          disabled: state.busy ? "disabled" : null,
          text: selected ? "Selected" : "Select"
        }),
        el("button", {
          type: "button",
          "data-action": "apply-one",
          "data-id": preset.id,
          disabled: state.busy ? "disabled" : null,
          text: "Apply"
        }),
        preset.source === "myfile" ? el("button", {
          type: "button",
          "data-action": "remove-file",
          "data-id": preset.id,
          text: "Remove"
        }) : null
      ])
    ]);
    return el("article", { class: "card" + (selected ? " selected" : "") }, [thumb, body]);
  }

  function emptyState(title, copy) {
    return el("section", { class: "empty" }, [
      el("h2", { text: title }),
      el("p", { text: copy })
    ]);
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
    var children = [el("h2", { text: "Composition" })];
    if (payload.contextError) {
      children.push(el("p", { text: payload.contextError.message }));
      children.push(el("div", { class: "code faint", text: payload.contextError.code }));
    } else if (payload.composition) {
      var comp = payload.composition;
      children.push(el("p", { text: comp.name }));
      children.push(el("p", { class: "muted", text: comp.width + "×" + comp.height + " · " + comp.frameRate + " fps · " + comp.numLayers + " layers · " + Number(comp.time).toFixed(2) + "s" }));
      if (payload.projectName) children.push(el("p", { class: "faint", text: payload.projectName }));
    }
    if (payload.selectionError) {
      children.push(el("p", { class: "warn", text: payload.selectionError.message }));
    } else if (payload.selectedLayers && payload.selectedLayers.length) {
      var list = el("ul", { class: "layers" });
      payload.selectedLayers.forEach(function (layer) {
        list.appendChild(el("li", {}, [
          el("span", { text: layer.name }),
          el("span", { class: "faint", text: "#" + layer.index })
        ]));
      });
      children.push(list);
    }
    return el("section", { class: "host-card", id: "host-card" }, children);
  }

  function renderHome(state) {
    var presets = state.catalog.presets;
    var known = knownMap(presets);
    var favoriteCount = state.prefs.favorites.filter(function (id) { return !!known[id]; }).length;
    var selectedCount = state.prefs.selected.filter(function (id) { return !!known[id]; }).length;
    var categories = {};
    presets.forEach(function (preset) { categories[preset.category] = true; });
    var nodes = [
      hostCard(state),
      el("div", { class: "stats" }, [
        stat(presets.length, "Presets"),
        stat(Object.keys(categories).length, "Categories"),
        stat(favoriteCount, "Favorites"),
        stat(selectedCount, "Selected")
      ])
    ];
    if (state.catalog.warnings.length) {
      nodes.push(el("section", { class: "empty" }, state.catalog.warnings.map(function (warning) {
        return el("p", { class: "warn", text: warning });
      })));
    }
    nodes.push(el("div", { class: "row-actions" }, [
      el("button", { type: "button", "data-action": "apply-selected", disabled: state.busy ? "disabled" : null, text: "Apply selected" }),
      el("button", { type: "button", "data-action": "rescan", text: "Rescan" })
    ]));
    if (!presets.length) {
      nodes.push(emptyState("No presets yet", "The catalog is empty because presets/ has no .ffx files. Add real After Effects animation presets and rescan. RR TOOLS does not ship sample presets."));
    }
    return nodes;
  }

  function stat(value, label) {
    return el("div", { class: "stat" }, [el("b", { text: String(value) }), el("span", { text: label })]);
  }

  function renderPresetList(state, source, emptyTitle, emptyCopy) {
    var presets = state.catalog.presets.filter(function (preset) {
      if (source === "my") return preset.source === "my" || preset.source === "myfile";
      return preset.source === source;
    });
    var nodes = [listHead(state, source === "my" ? "My Presets" : "Presets", presets.length)];
    if (source === "my") {
      var added = state.prefs.myPresetFiles && state.prefs.myPresetFiles.length;
      nodes.push(el("div", { class: "row-actions" }, [
        el("button", { type: "button", "data-action": "add-files", text: "Add .ffx files" }),
        el("button", { type: "button", "data-action": "choose-my", text: state.paths.my ? "Change folder" : "Choose folder" }),
        state.paths.my ? el("button", { type: "button", "data-action": "clear-my", text: "Clear folder" }) : null,
        added ? el("button", { type: "button", "data-action": "clear-files", text: "Clear added files" }) : null
      ]));
    }
    if (!presets.length) nodes.push(emptyState(emptyTitle, emptyCopy));
    presets.forEach(function (preset) { nodes.push(presetCard(preset, state)); });
    return nodes;
  }

  function listHead(state, title, count) {
    return el("div", { class: "section-head" }, [
      el("h1", { text: title }),
      el("span", { class: "meta", text: String(count) }),
      el("button", { type: "button", "data-action": "rescan", text: "Rescan" })
    ]);
  }

  function renderCategories(state) {
    var groups = RR.catalog.groupByCategory(state.catalog.presets);
    var nodes = [el("div", { class: "section-head" }, [el("h1", { text: "Categories" }), el("span", { class: "meta", text: String(groups.length) })])];
    if (!groups.length) {
      nodes.push(emptyState("No categories", "Categories appear when .ffx files are found. A file in a subfolder uses that folder name. Files at the root of the presets folder use General."));
      return nodes;
    }
    groups.forEach(function (group) {
      var ids = group.presets.map(function (preset) { return preset.id; });
      var allSelected = ids.every(function (id) { return RR.preferences.contains(state.prefs.selected, id); });
      nodes.push(el("section", { class: "empty" }, [
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

  function renderFavorites(state) {
    var known = knownMap(state.catalog.presets);
    var presets = state.prefs.favorites.map(function (id) { return known[id]; }).filter(Boolean);
    var nodes = [el("div", { class: "section-head" }, [el("h1", { text: "Favorites" }), el("span", { class: "meta", text: String(presets.length) })])];
    if (!presets.length) nodes.push(emptyState("No favorites", "Star a preset to keep it here. Favorites are stored in the per-user preferences file on this computer."));
    presets.forEach(function (preset) { nodes.push(presetCard(preset, state)); });
    return nodes;
  }

  function pathRow(label, value, action, actionLabel) {
    return el("section", { class: "path-row" }, [
      el("span", { class: "faint", text: label }),
      el("code", { text: value || "Not set" }),
      action ? el("div", { class: "actions" }, [el("button", { type: "button", "data-action": action, text: actionLabel })]) : null
    ]);
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
      el("div", { class: "section-head" }, [el("h1", { text: "Settings" })]),
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
    nodes.push(el("p", { class: "faint", text: "Apply calls After Effects through ExtendScript. A successful apply is reported only when the host returns APPLIED. This panel cannot verify that result outside After Effects." }));
    return nodes;
  }

  function renderBody(state) {
    if (state.outsideHost) {
      return [emptyState("Open this panel in After Effects", "RR TOOLS is an After Effects 2025 CEP panel. Host detection and .ffx apply are not simulated in a browser. Install the extension, enable PlayerDebugMode for CSXS.12, and open Window > Extensions > RR TOOLS.")];
    }
    if (state.section === "presets") {
      return renderPresetList(state, "bundle", "No library presets", "No .ffx files were found in " + (state.paths.presets || "the presets folder") + ". Add real presets and rescan.");
    }
    if (state.section === "my") {
      var added = state.prefs.myPresetFiles && state.prefs.myPresetFiles.length;
      var copy = added
        ? "None of the added .ffx files could be read."
        : state.paths.my
          ? "No .ffx files were found in " + state.paths.my + ". You can also add individual .ffx files."
          : "Add one or more .ffx files, or choose a folder of presets. A single preset file does not have to live in a chosen folder.";
      return renderPresetList(state, "my", "No personal presets", copy);
    }
    if (state.section === "categories") return renderCategories(state);
    if (state.section === "favorites") return renderFavorites(state);
    if (state.section === "settings") return renderSettings(state);
    return renderHome(state);
  }

  function renderNotice(state) {
    var notice = document.getElementById("notice");
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
    pill.className = "pill";
    if (state.outsideHost) {
      pill.textContent = "Browser";
      return;
    }
    if (!state.host || state.host.status === "pending") {
      pill.textContent = "Checking";
      return;
    }
    if (state.host.status === "error") {
      pill.className = "pill error";
      pill.textContent = "No host";
    } else {
      pill.className = "pill ready";
      pill.textContent = "AE " + ((state.host.payload && state.host.payload.version) || "");
    }
    var current = document.getElementById("host-card");
    if (!current || state.section !== "home") return;
    current.replaceWith(hostCard(state));
  }

  function render(state) {
    var nav = document.getElementById("nav");
    Array.prototype.forEach.call(nav.querySelectorAll("button"), function (button) {
      if (button.getAttribute("data-section") === state.section) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
    var view = document.getElementById("view");
    clear(view);
    renderBody(state).forEach(function (node) { if (node) view.appendChild(node); });
    renderNotice(state);
    renderHost(state);
  }

  function mount(state) {
    var nav = document.getElementById("nav");
    clear(nav);
    NAV.forEach(function (item) {
      var button = el("button", { type: "button", "data-action": "nav", "data-section": item[0] });
      button.appendChild(icon(item[2]));
      button.appendChild(document.createTextNode(item[1]));
      nav.appendChild(button);
    });
    render(state);
  }

  RR.view = {
    mount: mount,
    render: render,
    renderHost: renderHost,
    clearPreviewCache: function () { previewCache = {}; }
  };
})(typeof window !== "undefined" ? window : global);
