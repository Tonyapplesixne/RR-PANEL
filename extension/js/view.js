(function (root) {
  var RR = root.RRTools = root.RRTools || {};
  var NS = "http://www.w3.org/2000/svg";
  var NAV = [
    ["home", "Home", "home"],
    ["presets", "Presets", "grid"],
    ["favorites", "Favorites", "star"],
    ["recent", "Recent", "clock"],
    ["categories", "Categories", "layers"],
    ["sep"],
    ["tools", "Tools", "wrench"],
    ["settings", "Settings", "gear"]
  ];
  var TITLES = {
    home: "Home",
    presets: "Presets",
    favorites: "Favorites",
    recent: "Recent",
    categories: "Categories",
    tools: "Tools",
    settings: "Settings",
    my: "Library"
  };
  var COMMANDS = [
    ["nav:home", "Home", "Open the dashboard"],
    ["nav:presets", "Browse presets", "Open the library"],
    ["nav:favorites", "Favorites", "Starred presets on this computer"],
    ["nav:recent", "Recent", "Presets applied from this panel"],
    ["nav:categories", "Categories", "Browse by category"],
    ["nav:tools", "Tools", "Layers and library actions"],
    ["nav:settings", "Settings", "Paths and preferences"],
    ["rescan", "Rescan library", "Read the presets folders again"],
    ["add-files", "Add .ffx files", "Import individual preset files"],
    ["choose-my", "Add folder", "Watch a folder of presets"]
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

  function icon(name) {
    var paths = {
      home: '<path d="M4.5 11.2 12 4.8l7.5 6.4"/><path d="M7 10.6V19h10v-8.4"/>',
      grid: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.6"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.6"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.6"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.6"/>',
      star: '<path d="m12 3.6 2.15 4.55 5.05.62-3.75 3.45 1 4.9L12 14.8 7.55 17.12l1-4.9L4.8 8.77l5.05-.62z"/>',
      clock: '<circle cx="12" cy="12" r="7.5"/><path d="M12 8.2V12l2.8 1.8"/>',
      layers: '<path d="m12 4.2 7.6 3.6L12 11.4 4.4 7.8z"/><path d="m4.6 12 7.4 3.5L19.4 12"/><path d="m4.6 15.8 7.4 3.5 7.4-3.5"/>',
      wrench: '<path d="M14.6 6.4a3.4 3.4 0 0 0-4.7 4.6L4.2 16.7 7.3 19.8l5.7-5.7a3.4 3.4 0 0 0 4.6-4.7L15.2 12 12 8.8z"/>',
      gear: '<circle cx="12" cy="12" r="2.7"/><path d="M12 3.6v2M12 18.4v2M3.6 12h2M18.4 12h2M5.9 5.9l1.4 1.4M16.7 16.7l1.4 1.4M18.1 5.9 16.7 7.3M7.3 16.7 5.9 18.1"/>',
      folder: '<path d="M3.6 7.4h5.6l1.8 1.8h9.4V19H3.6z"/>',
      refresh: '<path d="M19 12a7 7 0 1 1-2.05-4.95"/><path d="M19 4.6V8h-3.4"/>',
      type: '<path d="M5 6.2h14M12 6.2V18M8.2 18h7.6"/>',
      spark: '<path d="M12 3.2 13.5 8.4 18.8 10 13.5 11.6 12 16.8 10.5 11.6 5.2 10l5.3-1.6z"/>',
      swatch: '<circle cx="12" cy="12" r="6.2"/><path d="M12 5.8v2.2M12 16v2.2M5.8 12H8M16 12h2.2"/>',
      wave: '<path d="M3 14.2c2.1-3.6 3.8-3.6 5.8 0s3.7 3.6 5.8 0 3.7-3.6 5.8 0"/>'
    };
    var svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.innerHTML = paths[name] || "";
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

  function mtimeOf(filePath) {
    if (!filePath) return 0;
    if (mtimeCache[filePath] != null) return mtimeCache[filePath];
    var value = 0;
    try {
      if (typeof require === "function") {
        var stat = require("fs").statSync(filePath);
        value = stat.mtimeMs || (stat.mtime ? stat.mtime.getTime() : 0);
      } else if (window.cep && window.cep.fs && window.cep.fs.stat) {
        var result = window.cep.fs.stat(filePath);
        var info = result && result.err === 0 ? result.data : null;
        if (info && typeof info.mtime === "number") value = info.mtime;
        else if (info && info.mtime && info.mtime.getTime) value = info.mtime.getTime();
      }
    } catch (err) { value = 0; }
    mtimeCache[filePath] = value;
    return value;
  }

  function ago(at) {
    if (!at) return "";
    var delta = Date.now() - at;
    if (delta < 45000) return "Just now";
    if (delta < 3600000) return Math.max(1, Math.round(delta / 60000)) + "m ago";
    if (delta < 86400000) return Math.max(1, Math.round(delta / 3600000)) + "h ago";
    if (delta < 172800000) return "Yesterday";
    return Math.round(delta / 86400000) + "d ago";
  }

  function formatWhen(ms) {
    if (!ms) return "";
    try { return new Date(ms).toLocaleString(); } catch (err) { return ""; }
  }

  function pagePresets(state) {
    var presets = state.catalog.presets || [];
    if (state.section === "favorites") {
      var favs = knownMap(presets);
      return (state.prefs.favorites || []).map(function (id) { return favs[id]; }).filter(Boolean);
    }
    if (state.section === "recent") {
      var known = knownMap(presets);
      return (state.prefs.recent || []).map(function (item) {
        var preset = known[item.id];
        if (!preset) return null;
        return Object.assign({}, preset, { usedAt: item.at });
      }).filter(Boolean);
    }
    if (state.section === "my") {
      return presets.filter(function (preset) { return preset.source === "my" || preset.source === "myfile"; });
    }
    return presets.slice();
  }

  function matchesQuery(preset, query) {
    if (!query) return true;
    var tags = (preset.tags || []).join(" ");
    var hay = (preset.name + " " + preset.category + " " + (preset.description || "") + " " + tags).toLowerCase();
    return hay.indexOf(query) !== -1;
  }

  function filteredPresets(state, presets) {
    var query = String(state.query || "").trim().toLowerCase();
    var list = presets.filter(function (preset) {
      if (state.categoryFilter && preset.category !== state.categoryFilter) return false;
      return matchesQuery(preset, query);
    });
    if (state.section === "recent") return list;
    list.sort(function (a, b) {
      if (state.sort === "date") return mtimeOf(b.filePath) - mtimeOf(a.filePath) || a.name.localeCompare(b.name);
      return a.name.localeCompare(b.name);
    });
    return list;
  }

  function categoriesOf(presets) {
    var names = [];
    presets.forEach(function (preset) {
      if (names.indexOf(preset.category) === -1) names.push(preset.category);
    });
    names.sort(function (a, b) { return a.localeCompare(b); });
    return names;
  }

  function button(action, label, extra) {
    var attrs = { type: "button", "data-action": action, text: label };
    if (extra) Object.keys(extra).forEach(function (key) { attrs[key] = extra[key]; });
    return el("button", attrs);
  }

  function labeledButton(action, label, extra, glyph) {
    var attrs = { type: "button", "data-action": action };
    if (extra) Object.keys(extra).forEach(function (key) { attrs[key] = extra[key]; });
    return el("button", attrs, [
      glyph ? icon(glyph) : null,
      el("span", { text: label })
    ]);
  }

  function emptyState(glyph, title, copy, path, action) {
    return el("section", { class: "empty" }, [
      el("div", { class: "empty-mark", "aria-hidden": "true", text: glyph || "✦" }),
      el("h2", { text: title }),
      el("p", { text: copy }),
      path ? el("code", { text: path }) : null,
      action ? button(action.action, action.label, { class: "primary", "data-section": action.section || null }) : null
    ]);
  }

  function skeletonGrid() {
    var cards = [];
    for (var i = 0; i < 6; i++) cards.push(el("div", { class: "skeleton", "aria-hidden": "true" }));
    return el("div", { class: "preset-grid", "aria-busy": "true", "aria-label": "Loading presets" }, cards);
  }

  function toneOf(category) {
    var key = String(category || "").toLowerCase();
    if (key.indexOf("text") !== -1 || key.indexOf("type") !== -1) return "text";
    if (key.indexOf("trans") !== -1) return "transition";
    if (key.indexOf("color") !== -1 || key.indexOf("grade") !== -1) return "color";
    if (key.indexOf("util") !== -1 || key.indexOf("tool") !== -1) return "utility";
    if (key.indexOf("motion") !== -1 || key.indexOf("anim") !== -1) return "motion";
    return "effect";
  }

  function toneIcon(tone) {
    if (tone === "text") return "type";
    if (tone === "color") return "swatch";
    if (tone === "utility") return "wrench";
    if (tone === "motion" || tone === "transition") return "wave";
    return "spark";
  }

  function fallbackPlate(preset) {
    var tone = toneOf(preset.category);
    var plate = el("div", {
      class: "fallback tone-" + tone,
      title: "Generated artwork. This file has no preview image."
    });
    plate.appendChild(el("span", { class: "fx", "aria-hidden": "true" }));
    plate.appendChild(icon(toneIcon(tone)));
    plate.appendChild(el("strong", { text: preset.name }));
    plate.appendChild(el("em", { text: "Artwork" }));
    return plate;
  }

  function starButton(preset, state) {
    var favorite = RR.preferences.contains(state.prefs.favorites, preset.id);
    var star = button("toggle-favorite", "", {
      class: "star" + (state.popId === preset.id ? " pop" : ""),
      "data-id": preset.id,
      "aria-pressed": favorite ? "true" : "false",
      "aria-label": favorite ? "Remove favorite" : "Add favorite",
      title: favorite ? "Remove favorite" : "Add favorite"
    });
    star.appendChild(icon("star"));
    return star;
  }

  function presetCard(preset, state, index) {
    var active = state.detailId === preset.id;
    var highlighted = state.query && index === state.resultIndex;
    var url = previewUrl(preset);
    var preview = el("div", { class: url ? "preview real" : "preview" });
    if (url) preview.appendChild(el("img", { src: url, alt: "" }));
    else preview.appendChild(fallbackPlate(preset));
    preview.appendChild(starButton(preset, state));
    var apply = button("apply-one", "Apply", {
      class: "apply",
      "data-id": preset.id,
      disabled: state.busy ? "disabled" : null
    });
    preview.appendChild(apply);
    var meta = preset.category + (preset.usedAt ? " · " + ago(preset.usedAt) : "");
    var tags = (preset.tags || []).slice(0, 3).map(function (tag) {
      return el("span", { text: tag });
    });
    return el("article", {
      class: "preset-card" + (active ? " active" : "") + (highlighted ? " highlighted" : ""),
      "data-action": "inspect",
      "data-id": preset.id,
      "data-index": String(index)
    }, [
      preview,
      el("div", { class: "card-body" }, [
        el("h2", { text: preset.name }),
        el("p", { text: meta }),
        tags.length ? el("div", { class: "tags" }, tags) : null
      ])
    ]);
  }

  function presetGrid(state, presets, empty) {
    if (state.scanning) return skeletonGrid();
    if (!presets.length) return empty;
    var list = state.prefs.viewMode === "list";
    return el("div", { class: list ? "preset-list" : "preset-grid" }, presets.map(function (preset, index) {
      return list ? listRow(preset, state, index) : presetCard(preset, state, index);
    }));
  }

  function listRow(preset, state, index) {
    var url = previewUrl(preset);
    var thumb = el("div", { class: "list-thumb" });
    if (url) thumb.appendChild(el("img", { src: url, alt: "" }));
    else thumb.appendChild(fallbackPlate(preset));
    var active = state.detailId === preset.id;
    return el("article", {
      class: "list-row" + (active ? " active" : "") + (state.query && index === state.resultIndex ? " highlighted" : ""),
      "data-action": "inspect",
      "data-id": preset.id,
      "data-index": String(index)
    }, [
      thumb,
      el("div", { class: "list-copy" }, [
        el("h2", { text: preset.name }),
        preset.description ? el("p", { text: preset.description }) : null
      ]),
      el("span", { class: "list-cat", text: preset.category }),
      preset.usedAt ? el("span", { class: "list-when", text: ago(preset.usedAt) }) : null,
      starButton(preset, state),
      button("apply-one", "Apply", { class: "apply", "data-id": preset.id, disabled: state.busy ? "disabled" : null })
    ]);
  }

  function libraryBar(state, presets) {
    var select = el("select", { id: "category-filter", "aria-label": "Category" }, [
      el("option", { value: "", text: "All categories" })
    ]);
    categoriesOf(pagePresets(state)).forEach(function (category) {
      var option = el("option", { value: category, text: category });
      if (category === state.categoryFilter) option.selected = true;
      select.appendChild(option);
    });
    var sort = el("select", { id: "sort-mode", "aria-label": "Sort" }, [
      el("option", { value: "name", text: "Name" }),
      el("option", { value: "date", text: "Updated" })
    ]);
    if (state.sort === "date") sort.value = "date";
    return el("div", { class: "library-bar" }, [
      select,
      sort,
      button("set-view", "", { class: "icon-btn" + (state.prefs.viewMode !== "list" ? " on" : ""), "data-mode": "grid", "aria-label": "Grid", title: "Grid", "aria-pressed": state.prefs.viewMode !== "list" ? "true" : "false" }),
      button("set-view", "", { class: "icon-btn" + (state.prefs.viewMode === "list" ? " on" : ""), "data-mode": "list", "aria-label": "List", title: "List", "aria-pressed": state.prefs.viewMode === "list" ? "true" : "false" })
    ]);
  }

  function noResults(state) {
    return emptyState("✦", "No presets found", "Try another search or browse categories.", "", { action: "clear-search", label: "Clear search" });
  }

  function libraryEmpty(state) {
    var path = state.paths.presets || "";
    if (state.section === "favorites") {
      return emptyState("☆", "No favorites yet", "Star a preset and it stays on this computer.", "", null);
    }
    if (state.section === "recent") {
      return emptyState("◷", "Nothing used yet", "Presets you apply from RR TOOLS show up here.", "", { action: "nav", section: "presets", label: "Browse presets" });
    }
    if (state.section === "my") {
      return emptyState("✦", "No added presets", "Add .ffx files or choose a folder. Nothing is invented in their place.", state.paths.my || "", { action: "add-files", label: "Add .ffx files" });
    }
    return emptyState("✦", "Your library is empty", "Add .ffx presets to your presets folder and rescan the library.", path, { action: "rescan", label: "Rescan library" });
  }

  function recentPresets(state, limit) {
    var known = knownMap(state.catalog.presets || []);
    var list = [];
    (state.prefs.recent || []).forEach(function (item) {
      if (!known[item.id] || list.length >= limit) return;
      list.push(Object.assign({}, known[item.id], { usedAt: item.at }));
    });
    return list;
  }

  function renderHome(state) {
    var presets = state.catalog.presets || [];
    var known = knownMap(presets);
    var featured = [];
    (state.prefs.favorites || []).forEach(function (id) {
      if (known[id] && featured.length < 4) featured.push(known[id]);
    });
    presets.forEach(function (preset) {
      if (featured.length >= 4) return;
      if (!featured.some(function (item) { return item.id === preset.id; })) featured.push(preset);
    });
    var featuredBody = state.scanning
      ? skeletonGrid()
      : featured.length
        ? el("div", { class: "feature-list" }, featured.map(function (preset, index) { return featuredCard(preset, state, index); }))
        : emptyState("✦", "Your library is empty", "Add .ffx presets to your presets folder and rescan the library.", state.paths.presets || "", { action: "rescan", label: "Rescan library" });
    var nodes = [
      el("section", { class: "hero" }, [
        el("div", { class: "hero-sky", "aria-hidden": "true" }),
        el("div", { class: "hero-copy" }, [
          el("p", { class: "eyebrow", text: "RR TOOLS" }),
          el("h2", {}, [
            "Motion Library",
            el("em", { text: "for After Effects" })
          ]),
          el("p", { class: "hero-line", text: "Create. Animate. Repeat." }),
          el("div", { class: "hero-actions" }, [
            labeledButton("nav", "Browse presets", { class: "primary", "data-section": "presets" }, "grid"),
            labeledButton("nav", "Explore tools", { "data-section": "tools" }, "wrench")
          ])
        ]),
        heroArt(),
        el("div", { class: "hero-links" }, [
          actionCard("nav", "presets", "grid", "Browse presets", "Open the library"),
          actionCard("nav", "favorites", "star", "Favorites", "Starred presets on this computer"),
          actionCard("nav", "recent", "clock", "Recent", "Presets applied from this panel"),
          actionCard("rescan", "", "refresh", "Rescan library", "Read the presets folders again")
        ])
      ]),
      el("section", { class: "block" }, [
        el("div", { class: "block-head" }, [
          el("h2", { text: "Featured" }),
          presets.length ? button("nav", "See all →", { class: "text-btn", "data-section": "presets" }) : null
        ]),
        featuredBody
      ])
    ];
    var recent = recentPresets(state, 3);
    if (recent.length) {
      nodes.push(el("section", { class: "block" }, [
        el("div", { class: "block-head" }, [
          el("h2", { text: "Recently used" }),
          button("nav", "See all →", { class: "text-btn", "data-section": "recent" })
        ]),
        el("div", { class: "recent-strip" }, recent.map(function (preset, index) {
          return recentRow(preset, state, index);
        }))
      ]));
    }
    var groups = RR.catalog.groupByCategory(presets);
    if (groups.length) {
      nodes.push(el("section", { class: "block" }, [
        el("div", { class: "block-head" }, [
          el("h2", { text: "Explore by category" }),
          button("nav", "See all →", { class: "text-btn", "data-section": "categories" })
        ]),
        el("div", { class: "cat-grid" }, groups.map(function (group) {
          return categoryTile(group);
        }))
      ]));
    }
    return nodes;
  }

  function heroArt() {
    var view = el("div", { class: "comp-view" });
    var svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 168 78");
    svg.setAttribute("aria-hidden", "true");
    svg.innerHTML = '<path d="M8 54c16-26 30-26 42-6s20 22 36 2 24-24 38-6 16 16 36 2" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><path d="M8 64h152" stroke="currentColor" stroke-opacity=".35"/><path d="M48 40.5 52.2 44.8 48 49.2 43.8 44.8z" fill="currentColor"/><path d="M88 46.5 92.2 50.8 88 55.2 83.8 50.8z" fill="currentColor"/><path d="M122 32.5 126.2 36.8 122 41.2 117.8 36.8z" fill="currentColor"/>';
    view.appendChild(svg);
    return el("div", { class: "hero-art", "aria-hidden": "true" }, [
      el("span", { class: "hero-glow" }),
      el("div", { class: "comp-frame" }, [
        el("div", { class: "comp-bar" }, [
          el("img", { src: "assets/branding/icons/ae-badge.png", alt: "" }),
          el("span", { text: "After Effects" })
        ]),
        view,
        el("div", { class: "comp-time" }, [
          el("i"),
          el("i"),
          el("i"),
          el("i")
        ])
      ])
    ]);
  }

  function featuredCard(preset, state, index) {
    var url = previewUrl(preset);
    var preview = el("div", { class: url ? "feature-preview real" : "feature-preview" });
    if (url) preview.appendChild(el("img", { src: url, alt: "" }));
    else preview.appendChild(fallbackPlate(preset));
    var highlighted = state.query && index === state.resultIndex;
    return el("article", {
      class: "feature-card" + (state.detailId === preset.id ? " active" : "") + (highlighted ? " highlighted" : ""),
      "data-action": "inspect",
      "data-id": preset.id,
      "data-index": String(index)
    }, [
      preview,
      el("div", { class: "feature-copy" }, [
        el("span", { class: "feature-cat", text: preset.category }),
        el("h3", { text: preset.name }),
        preset.description ? el("p", { text: preset.description }) : null
      ]),
      el("div", { class: "feature-actions" }, [
        starButton(preset, state),
        button("inspect", "Open", {
          class: "open-btn",
          "data-id": preset.id,
          "aria-label": "Open " + preset.name
        })
      ])
    ]);
  }

  function actionCard(action, section, glyph, title, copy) {
    return el("button", {
      type: "button",
      class: "action-card",
      "data-action": action,
      "data-section": section || null
    }, [
      icon(glyph),
      el("strong", { text: title }),
      el("span", { text: copy })
    ]);
  }

  function categoryCopy(group) {
    var notes = [];
    group.presets.forEach(function (preset) {
      if (preset.description && notes.indexOf(preset.description) === -1) notes.push(preset.description);
    });
    if (notes.length) return notes.slice(0, 2).join(" · ");
    return group.presets.map(function (preset) { return preset.name; }).slice(0, 3).join(" · ");
  }

  function recentRow(preset, state, index) {
    var url = previewUrl(preset);
    var thumb = el("div", { class: "list-thumb" });
    if (url) thumb.appendChild(el("img", { src: url, alt: "" }));
    else thumb.appendChild(fallbackPlate(preset));
    return el("article", {
      class: "recent-row" + (state.detailId === preset.id ? " active" : ""),
      "data-action": "inspect",
      "data-id": preset.id,
      "data-index": String(index)
    }, [
      thumb,
      el("div", { class: "list-copy" }, [
        el("h2", { text: preset.name }),
        el("p", { text: ago(preset.usedAt) })
      ]),
      starButton(preset, state),
      button("apply-one", "Apply", { class: "apply", "data-id": preset.id, disabled: state.busy ? "disabled" : null })
    ]);
  }

  function categoryTile(group) {
    var tone = toneOf(group.category);
    var swatch = el("span", { class: "cat-swatch", "aria-hidden": "true" });
    swatch.appendChild(icon(toneIcon(tone)));
    var count = group.presets.length;
    return el("button", {
      type: "button",
      class: "cat-tile tone-" + tone,
      "data-action": "open-category",
      "data-category": group.category,
      title: group.category
    }, [
      swatch,
      el("strong", { text: group.category }),
      el("span", { class: "cat-blurb", text: categoryCopy(group) }),
      el("span", { class: "cat-count", text: count + (count === 1 ? " preset" : " presets") })
    ]);
  }

  function renderLibrary(state) {
    var base = pagePresets(state);
    var presets = filteredPresets(state, base);
    var query = String(state.query || "").trim();
    var head = el("div", { class: "block-head" }, [
      el("p", { text: presets.length + (presets.length === 1 ? " preset" : " presets") })
    ]);
    if (!base.length) return [head, libraryBar(state, base), libraryEmpty(state)];
    if (!presets.length) return [head, libraryBar(state, base), noResults(state)];
    return [head, libraryBar(state, base), presetGrid(state, presets, null)];
  }

  function renderCategories(state) {
    var groups = RR.catalog.groupByCategory(filteredPresets(state, state.catalog.presets || []));
    if (state.scanning) return [skeletonGrid()];
    if (!groups.length) {
      return [String(state.query || "").trim() ? noResults(state) : libraryEmpty(state)];
    }
    return [el("div", { class: "cat-grid" }, groups.map(function (group) {
      return categoryTile(group);
    }))];
  }

  function renderTools(state) {
    var host = state.host || { status: "pending" };
    var comp = host.payload && host.payload.composition;
    var selected = host.payload && host.payload.selectedLayers && host.payload.selectedLayers[0];
    return [
      el("section", { class: "panel-card" }, [
        el("h2", { text: "Composition" }),
        el("p", { text: comp ? comp.name : host.status === "error" ? (host.error || "After Effects did not answer.") : "Waiting for the active composition." }),
        comp ? el("p", { class: "muted", text: comp.width + " × " + comp.height + " · " + comp.frameRate + " fps · " + comp.numLayers + " layers" }) : null,
        el("p", { class: "muted", text: selected ? "Selected: " + selected.name : "No layer selected." })
      ]),
      el("section", { class: "block" }, [
        el("div", { class: "block-head" }, [el("h2", { text: "Layer tools" })]),
        el("div", { class: "tool-row" }, [
          button("add-layer", "Adjustment layer", { "data-kind": "adjustment", disabled: state.busy ? "disabled" : null }),
          button("add-layer", "White solid", { "data-kind": "solid", disabled: state.busy ? "disabled" : null })
        ]),
        el("p", { class: "muted", text: "New layers match the selected layer’s size and timing." })
      ]),
      el("section", { class: "block" }, [
        el("div", { class: "block-head" }, [el("h2", { text: "Library" })]),
        el("div", { class: "tool-row" }, [
          button("add-files", "Add .ffx files", { class: "primary" }),
          button("choose-my", "Add folder"),
          button("rescan", "Rescan")
        ])
      ]),
      el("section", { class: "block" }, [
        el("div", { class: "block-head" }, [el("h2", { text: "Not available yet" })]),
        el("div", { class: "tool-row" }, [
          el("button", { type: "button", disabled: "disabled", title: "Not available" }, [el("span", { text: "Bind preset" }), el("small", { text: "Not available" })]),
          el("button", { type: "button", disabled: "disabled", title: "Not available" }, [el("span", { text: "Quick trim" }), el("small", { text: "Not available" })]),
          el("button", { type: "button", disabled: "disabled", title: "Not available" }, [el("span", { text: "Beat marker" }), el("small", { text: "Not available" })])
        ])
      ])
    ];
  }

  function pathRow(label, value, actions) {
    return el("div", { class: "path-row" }, [
      el("div", {}, [
        el("span", { text: label }),
        el("code", { text: value || "Not set" })
      ]),
      el("div", { class: "tool-row" }, actions)
    ]);
  }

  function renderSettings(state) {
    var version = state.host && state.host.payload && state.host.payload.version;
    return [
      el("section", { class: "block" }, [
        el("div", { class: "block-head" }, [el("h2", { text: "Library" })]),
        pathRow("Presets location", state.paths.presets, [
          button("choose-bundle", "Change"),
          state.prefs.bundlePresetsPath ? button("clear-bundle", "Use default") : null,
          button("reveal-presets", "Show"),
          button("rescan", "Rescan", { class: "primary" })
        ]),
        pathRow("Added folder", state.paths.my, [
          button("choose-my", state.paths.my ? "Change folder" : "Add folder"),
          state.paths.my ? button("clear-my", "Clear") : null
        ]),
        pathRow("Added files", (state.prefs.myPresetFiles || []).length + " files", [
          button("add-files", "Add .ffx files"),
          button("nav", "Review", { "data-section": "my" }),
          (state.prefs.myPresetFiles || []).length ? button("clear-files", "Clear") : null
        ])
      ]),
      el("section", { class: "block" }, [
        el("div", { class: "block-head" }, [el("h2", { text: "General" })]),
        el("label", { class: "switch-row" }, [
          el("span", {}, [
            el("strong", { text: "Animations" }),
            el("small", { text: "Hover and focus motion inside the panel." })
          ]),
          el("input", { type: "checkbox", id: "motion-toggle", checked: state.prefs.motion === false ? null : "checked" })
        ])
      ]),
      el("section", { class: "block" }, [
        el("div", { class: "block-head" }, [el("h2", { text: "About" })]),
        el("div", { class: "about" }, [
          el("strong", { text: "RR TOOLS" }),
          el("span", { text: "Motion toolkit for After Effects" }),
          el("span", { text: "Version 1.0.0" }),
          el("span", { text: "After Effects 2025 · CEP 12" }),
          el("span", { id: "ae-version", text: version ? "Connected host " + version : "Host version appears when After Effects answers." }),
          el("p", { class: "muted", text: "Update checks are not connected." })
        ])
      ])
    ];
  }

  function renderBody(state) {
    if (state.outsideHost && state.section === "home") {
      return [emptyState("✦", "Open this panel in After Effects", "Host detection and .ffx apply run inside After Effects 2025. The layout you see here is the same panel.", "", null)];
    }
    if (state.section === "home") return renderHome(state);
    if (state.section === "categories") return renderCategories(state);
    if (state.section === "tools") return renderTools(state);
    if (state.section === "settings") return renderSettings(state);
    return renderLibrary(state);
  }

  function renderDetail(state) {
    var detail = document.getElementById("detail");
    if (!detail) return;
    clear(detail);
    var preset = null;
    (state.catalog.presets || []).forEach(function (item) {
      if (item.id === state.detailId) preset = item;
    });
    if (!preset) {
      detail.className = "";
      return;
    }
    detail.className = "open";
    var favorite = RR.preferences.contains(state.prefs.favorites, preset.id);
    var url = previewUrl(preset);
    var preview = el("div", { class: "preview detail-preview" });
    if (url) preview.appendChild(el("img", { src: url, alt: "" }));
    else preview.appendChild(fallbackPlate(preset));
    var updated = formatWhen(mtimeOf(preset.filePath));
    var tags = (preset.tags || []).map(function (tag) { return el("span", { text: tag }); });
    detail.appendChild(el("section", { class: "detail-card" }, [
      el("div", { class: "detail-head" }, [
        el("span", { class: "eyebrow", text: "Preset" }),
        button("close-detail", "×", { class: "icon-btn", "aria-label": "Close", title: "Close" })
      ]),
      preview,
      el("h2", { text: preset.name }),
      el("p", { class: "muted", text: preset.category }),
      preset.description ? el("p", { text: preset.description }) : el("p", { class: "muted", text: "No description in the sidecar." }),
      tags.length ? el("div", { class: "tags" }, tags) : null,
      preset.version ? el("p", { class: "muted", text: "Version " + preset.version }) : null,
      updated ? el("p", { class: "muted", text: "Updated " + updated }) : null,
      el("code", { text: preset.filePath }),
      el("div", { class: "tool-row" }, [
        button("apply-one", "Apply preset", { class: "primary", "data-id": preset.id, disabled: state.busy ? "disabled" : null }),
        button("toggle-favorite", favorite ? "Remove favorite" : "Add to favorites", { "data-id": preset.id, "aria-pressed": favorite ? "true" : "false" })
      ]),
      el("div", { class: "tool-row" }, [
        button("reveal-preset", "Open folder", { "data-id": preset.id }),
        button("rename-preset", "Rename", { "data-id": preset.id }),
        button("delete-preset", "Remove", { class: "danger", "data-id": preset.id })
      ])
    ]));
  }

  function renderNotice(state) {
    var notice = document.getElementById("notice");
    var bell = document.getElementById("notice-bell");
    if (!notice) return;
    var banner = state.notice;
    if (state.prefsError && (!banner || banner.kind !== "error")) {
      banner = { kind: "error", code: "BAD_PREFS", message: state.prefsError, detail: "" };
    }
    if (bell) {
      bell.classList.toggle("has-note", !!banner);
      bell.title = banner ? "Show the latest message" : "No notifications";
    }
    if (!banner) {
      notice.hidden = true;
      clear(notice);
      return;
    }
    notice.hidden = false;
    notice.className = "notice " + (banner.kind || "");
    clear(notice);
    if (banner.code) notice.appendChild(el("div", { class: "code", text: banner.code }));
    notice.appendChild(el("p", { text: banner.message || "" }));
    if (banner.detail) notice.appendChild(el("p", { class: "detail", text: banner.detail }));
  }

  function renderHost(state) {
    var pill = document.getElementById("host-pill");
    if (!pill) return;
    clear(pill);
    pill.className = "pill";
    var dot = el("i", { class: "dot", "aria-hidden": "true" });
    if (state.outsideHost) {
      pill.appendChild(dot);
      pill.appendChild(el("span", { text: "Browser" }));
      return;
    }
    if (!state.host || state.host.status === "pending") {
      pill.appendChild(dot);
      pill.appendChild(el("span", { text: "Checking" }));
      return;
    }
    var ae = document.getElementById("ae-version");
    if (state.host.status === "error") {
      pill.className = "pill error";
      pill.appendChild(dot);
      pill.appendChild(el("span", { text: "Disconnected" }));
      if (ae && !ae.textContent) ae.textContent = "After Effects did not answer.";
    } else {
      var version = (state.host.payload && state.host.payload.version) || "";
      pill.className = "pill ready";
      pill.appendChild(el("img", { class: "ae-badge", src: "assets/branding/icons/ae-badge.png", alt: "After Effects" }));
      pill.appendChild(dot);
      pill.appendChild(el("span", { text: "Connected" }));
      if (version) pill.appendChild(el("span", { class: "host-version", text: version }));
      if (ae) ae.textContent = version ? "Connected host " + version : "Connected.";
    }
  }

  function renderPalette(state) {
    var palette = document.getElementById("palette");
    var list = document.getElementById("palette-list");
    if (!palette || !list) return;
    palette.hidden = !state.paletteOpen;
    var query = String(state.paletteQuery || "").trim().toLowerCase();
    var hits = [];
    if (query) {
      (state.catalog.presets || []).forEach(function (preset) {
        if (hits.length >= 6 || !matchesQuery(preset, query)) return;
        hits.push(["inspect:" + preset.id, preset.name, preset.category]);
      });
    }
    var commands = hits.concat(COMMANDS.filter(function (command) {
      return !query || (command[1] + " " + command[2]).toLowerCase().indexOf(query) !== -1;
    }));
    if (state.paletteIndex >= commands.length) state.paletteIndex = 0;
    clear(list);
    if (!commands.length) {
      list.appendChild(el("p", { class: "muted", text: "No commands match." }));
      return;
    }
    commands.forEach(function (command, index) {
      var item = button("palette-run", "", {
        class: index === state.paletteIndex ? "command on" : "command",
        "data-command": command[0],
        role: "option",
        "aria-selected": index === state.paletteIndex ? "true" : "false"
      });
      item.appendChild(el("strong", { text: command[1] }));
      item.appendChild(el("span", { text: command[2] }));
      list.appendChild(item);
    });
    var input = document.getElementById("palette-search");
    if (input && document.activeElement !== input && input.value !== (state.paletteQuery || "")) input.value = state.paletteQuery || "";
  }

  function render(state) {
    document.documentElement.classList.toggle("no-motion", state.prefs && state.prefs.motion === false);
    var title = document.getElementById("page-title");
    if (title) title.textContent = TITLES[state.section] || "RR TOOLS";
    var search = document.getElementById("preset-search");
    if (search && document.activeElement !== search && search.value !== (state.query || "")) search.value = state.query || "";
    var nav = document.getElementById("nav");
    Array.prototype.forEach.call(nav.querySelectorAll("button"), function (button) {
      if (button.getAttribute("data-section") === state.section) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
    var view = document.getElementById("view");
    clear(view);
    renderBody(state).forEach(function (node) { if (node) view.appendChild(node); });
    var gridButtons = view.querySelectorAll("[data-mode]");
    Array.prototype.forEach.call(gridButtons, function (node) {
      if (!node.querySelector("svg")) node.appendChild(icon(node.getAttribute("data-mode") === "list" ? "layers" : "grid"));
    });
    renderDetail(state);
    renderNotice(state);
    renderPalette(state);
    document.body.classList.toggle("is-busy", !!state.busy);
    renderHost(state);
  }

  function mount(state) {
    var nav = document.getElementById("nav");
    clear(nav);
    NAV.forEach(function (item) {
      if (item[0] === "sep") {
        nav.appendChild(el("div", { class: "nav-sep" }));
        return;
      }
      var button = el("button", { type: "button", "data-action": "nav", "data-section": item[0], title: item[1], "aria-label": item[1] });
      button.appendChild(icon(item[2]));
      button.appendChild(el("span", { text: item[1] }));
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
