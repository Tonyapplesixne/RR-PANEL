(function (root) {
  var RR = root.RRTools = root.RRTools || {};
  var SECTIONS = ["home", "presets", "categories", "favorites", "my", "tools", "settings"];

  function uniqueStrings(value) {
    var list = [];
    var seen = {};
    if (!value || typeof value.length !== "number") return list;
    for (var i = 0; i < value.length; i++) {
      if (typeof value[i] !== "string" || !value[i] || seen[value[i]]) continue;
      seen[value[i]] = true;
      list.push(value[i]);
    }
    return list;
  }

  function defaults() {
    return {
      version: 1,
      favorites: [],
      selected: [],
      myPresetsPath: "",
      myPresetFiles: [],
      bundlePresetsPath: "",
      viewMode: "grid",
      section: "home"
    };
  }

  function normalize(raw) {
    var data = raw && typeof raw === "object" ? raw : {};
    var section = typeof data.section === "string" ? data.section : "home";
    if (SECTIONS.indexOf(section) === -1) section = "home";
    return {
      version: 1,
      favorites: uniqueStrings(data.favorites),
      selected: uniqueStrings(data.selected),
      myPresetsPath: typeof data.myPresetsPath === "string" ? data.myPresetsPath : "",
      myPresetFiles: uniqueStrings(data.myPresetFiles),
      bundlePresetsPath: typeof data.bundlePresetsPath === "string" ? data.bundlePresetsPath : "",
      viewMode: data.viewMode === "list" ? "list" : "grid",
      section: section
    };
  }

  function serialize(prefs) {
    return JSON.stringify(normalize(prefs), null, 2) + "\n";
  }

  function toggleId(list, id) {
    var next = uniqueStrings(list);
    var index = next.indexOf(id);
    if (index === -1) next.push(id);
    else next.splice(index, 1);
    return next;
  }

  function contains(list, id) {
    return uniqueStrings(list).indexOf(id) !== -1;
  }

  function replaceId(list, fromId, toId) {
    if (!fromId || !toId || fromId === toId) return uniqueStrings(list);
    return uniqueStrings(list).map(function (id) { return id === fromId ? toId : id; });
  }

  function missingIds(list, knownIds) {
    var known = {};
    knownIds.forEach(function (id) { known[id] = true; });
    return uniqueStrings(list).filter(function (id) { return !known[id]; });
  }

  RR.preferences = {
    SECTIONS: SECTIONS,
    defaults: defaults,
    normalize: normalize,
    serialize: serialize,
    toggleId: toggleId,
    replaceId: replaceId,
    contains: contains,
    missingIds: missingIds
  };
})(typeof window !== "undefined" ? window : global);
