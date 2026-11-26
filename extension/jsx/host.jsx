/*
    RR TOOLS host bridge for After Effects 2025.
    ExtendScript is ES3. Do not use let, const, arrows, or trailing commas.
    Loaded by CSXS ScriptPath and again from the panel via $.evalFile.

    Verify inside After Effects (this file cannot prove a layer apply without AE):
    1. Open a composition and select one or more layers.
    2. From the panel, apply a real .ffx. The layers should gain that preset at the current time.
    3. Deselect every layer and apply again. The panel must show code NO_LAYER and must not report success.
    4. With no composition active, the probe returns code NO_COMP.
    5. Tools > Remove solid background. With no layer selected, nothing is keyed.
    6. On footage with a straight or premultiplied alpha that sampleImage shows as transparent, the key is refused.
    7. On white graphics over solid black with no usable alpha, Remove background adds Linear Color Key only on that layer.
*/

if (typeof JSON !== "object" || typeof JSON.stringify !== "function" || typeof JSON.parse !== "function") {
    var json2File = new File(new File($.fileName).parent.fsName + "/json2.jsx");
    if (!json2File.exists) {
        throw new Error("Missing " + json2File.fsName);
    }
    $.evalFile(json2File);
}

if (typeof RRTools === "undefined") {
    RRTools = {};
}

RRTools.stringify = function (obj) {
    try {
        return JSON.stringify(obj);
    } catch (err) {
        return '{"ok":false,"code":"STRINGIFY","message":"Could not encode the After Effects response."}';
    }
};

RRTools.parseArgs = function (raw) {
    if (raw === undefined || raw === null || raw === "") {
        return {};
    }
    if (typeof raw === "object") {
        return raw;
    }
    try {
        return JSON.parse(String(raw));
    } catch (err) {
        return { __parseError: String(err) };
    }
};

RRTools.activeComp = function () {
    if (!app.project) {
        return {
            comp: null,
            error: { code: "NO_PROJECT", message: "No project is open." }
        };
    }
    if (!(app.project.activeItem instanceof CompItem)) {
        return {
            comp: null,
            error: {
                code: "NO_COMP",
                message: "No active composition. Open a composition, then select one or more layers."
            }
        };
    }
    return { comp: app.project.activeItem, error: null };
};

RRTools.layerKind = function (layer) {
    try {
        if (layer.nullLayer) return "Null";
        if (layer instanceof CameraLayer) return "Camera";
        if (layer instanceof LightLayer) return "Light";
        if (layer instanceof TextLayer) return "Text";
        if (layer instanceof ShapeLayer) return "Shape";
        if (layer.adjustmentLayer) return "Adjustment";
        if (layer.source && layer.source.mainSource instanceof SolidSource) return "Solid";
    } catch (err) {
        return "Layer";
    }
    return "Layer";
};

RRTools.layerRecord = function (layer) {
    var matchName = "";
    try {
        matchName = String(layer.matchName);
    } catch (err) {
        matchName = "";
    }
    return {
        index: layer.index,
        name: layer.name,
        matchName: matchName,
        kind: RRTools.layerKind(layer)
    };
};

RRTools.ping = function () {
    var build = "";
    try {
        build = String(app.buildName);
    } catch (err) {
        build = "";
    }
    return RRTools.stringify({
        ok: true,
        code: "PING",
        app: "AEFT",
        version: String(app.version),
        build: build
    });
};

RRTools.probe = function () {
    var found = RRTools.activeComp();
    var comp = found.comp;
    var layers = [];
    var projectName = "";
    var projectPath = "";

    if (app.project && app.project.file) {
        projectName = String(app.project.file.name);
        projectPath = String(app.project.file.fsName);
    }

    if (comp) {
        var selected = comp.selectedLayers;
        var i;
        for (i = 0; i < selected.length; i++) {
            layers.push(RRTools.layerRecord(selected[i]));
        }
    }

    var selectionError = null;
    if (comp && layers.length === 0) {
        selectionError = {
            code: "NO_LAYER",
            message: "No layer is selected in \"" + comp.name + "\"."
        };
    }

    return RRTools.stringify({
        ok: true,
        code: "PROBE",
        app: "AEFT",
        version: String(app.version),
        projectName: projectName,
        projectPath: projectPath,
        composition: comp ? {
            id: comp.id,
            name: comp.name,
            width: comp.width,
            height: comp.height,
            frameRate: comp.frameRate,
            numLayers: comp.numLayers,
            time: comp.time
        } : null,
        selectedLayers: layers,
        contextError: found.error,
        selectionError: selectionError
    });
};

RRTools.applyOne = function (file, layers, applied, failed) {
    var i;
    for (i = 0; i < layers.length; i++) {
        var layer = layers[i];
        try {
            layer.applyPreset(file);
            applied.push({ layer: layer.name, index: layer.index });
        } catch (err) {
            failed.push({
                layer: layer.name,
                index: layer.index,
                path: file.fsName,
                message: String(err)
            });
        }
    }
};

RRTools.applyPresets = function (raw) {
    var args = RRTools.parseArgs(raw);
    if (args.__parseError) {
        return RRTools.stringify({
            ok: false,
            code: "BAD_ARGS",
            message: "Could not read the apply request."
        });
    }

    var paths = args.paths;
    if (!paths || !paths.length) {
        return RRTools.stringify({
            ok: false,
            code: "BAD_ARGS",
            message: "No preset file was provided."
        });
    }

    var found = RRTools.activeComp();
    if (!found.comp) {
        return RRTools.stringify({
            ok: false,
            code: found.error.code,
            message: found.error.message,
            applied: [],
            failed: []
        });
    }

    var comp = found.comp;
    var selected = comp.selectedLayers;
    if (!selected || selected.length === 0) {
        return RRTools.stringify({
            ok: false,
            code: "NO_LAYER",
            message: "Select at least one layer before applying a preset.",
            composition: comp.name,
            applied: [],
            failed: []
        });
    }

    var applied = [];
    var failed = [];
    var missing = [];
    var label = paths.length === 1 ? "RR TOOLS Apply Preset" : "RR TOOLS Apply Presets";

    app.beginUndoGroup(label);
    try {
        var p;
        for (p = 0; p < paths.length; p++) {
            var file = new File(String(paths[p]));
            if (!file.exists) {
                missing.push(String(paths[p]));
                failed.push({
                    layer: "",
                    index: 0,
                    path: String(paths[p]),
                    message: "Preset file was not found."
                });
                continue;
            }
            RRTools.applyOne(file, selected, applied, failed);
        }
    } finally {
        app.endUndoGroup();
    }

    var ok = failed.length === 0 && applied.length > 0;
    var message;
    if (ok) {
        message = "Applied " + (paths.length === 1 ? "preset" : String(paths.length) + " presets") + " to " + selected.length + " layer" + (selected.length === 1 ? "" : "s") + ".";
    } else if (selected.length === 0) {
        message = "Select at least one layer before applying a preset.";
    } else if (missing.length && applied.length === 0) {
        message = "Preset file was not found.";
    } else {
        message = "After Effects did not apply the preset to every selected layer.";
    }

    return RRTools.stringify({
        ok: ok,
        code: ok ? "APPLIED" : (missing.length && applied.length === 0 ? "MISSING_FILE" : "APPLY_FAILED"),
        message: message,
        composition: comp.name,
        time: comp.time,
        applied: applied,
        failed: failed,
        missing: missing
    });
};

RRTools.revealFolder = function (raw) {
    var args = RRTools.parseArgs(raw);
    if (args.__parseError || !args.path) {
        return RRTools.stringify({
            ok: false,
            code: "BAD_ARGS",
            message: "No folder path was provided."
        });
    }

    var folder = new Folder(String(args.path));
    if (!folder.exists) {
        return RRTools.stringify({
            ok: false,
            code: "MISSING_FOLDER",
            message: "Folder does not exist: " + folder.fsName
        });
    }

    var opened = false;
    try {
        opened = folder.execute();
    } catch (err) {
        return RRTools.stringify({
            ok: false,
            code: "OPEN_FAILED",
            message: "After Effects could not open that folder. " + String(err)
        });
    }

    if (!opened) {
        return RRTools.stringify({
            ok: false,
            code: "OPEN_FAILED",
            message: "After Effects could not open " + folder.fsName + "."
        });
    }

    return RRTools.stringify({
        ok: true,
        code: "OPENED",
        message: "Opened " + folder.fsName + ".",
        path: folder.fsName
    });
};

RRTools.addLayer = function (raw) {
    var args = RRTools.parseArgs(raw);
    if (args.__parseError) {
        return RRTools.stringify({
            ok: false,
            code: "BAD_ARGS",
            message: "Could not read the layer request."
        });
    }
    var kind = args.kind === "adjustment" ? "adjustment" : (args.kind === "solid" ? "solid" : "");
    if (!kind) {
        return RRTools.stringify({
            ok: false,
            code: "BAD_ARGS",
            message: "Choose a solid or an adjustment layer."
        });
    }
    var found = RRTools.activeComp();
    if (!found.comp) {
        return RRTools.stringify({
            ok: false,
            code: found.error.code,
            message: found.error.message
        });
    }
    var comp = found.comp;
    var selected = comp.selectedLayers;
    if (!selected || selected.length === 0) {
        return RRTools.stringify({
            ok: false,
            code: "NO_LAYER",
            message: "Select a layer. The new layer copies that layer's size and its in and out points."
        });
    }
    var source = selected[0];
    var box = RRTools.layerBox(source, comp);
    var name = kind === "adjustment" ? "Adjustment Layer" : "Solid";
    var layer = null;
    app.beginUndoGroup(kind === "adjustment" ? "RR TOOLS Adjustment Layer" : "RR TOOLS Solid");
    try {
        layer = comp.layers.addSolid([1, 1, 1], name, box.width, box.height, box.pixelAspect, comp.duration);
        if (kind === "adjustment") {
            layer.adjustmentLayer = true;
        }
        layer.startTime = source.startTime;
        layer.inPoint = source.inPoint;
        layer.outPoint = source.outPoint;
        try {
            layer.moveBefore(source);
        } catch (moveErr) {}
        var i;
        for (i = 1; i <= comp.numLayers; i++) {
            comp.layer(i).selected = false;
        }
        layer.selected = true;
    } catch (err) {
        return RRTools.stringify({
            ok: false,
            code: "LAYER_FAILED",
            message: "After Effects could not create the layer. " + String(err)
        });
    } finally {
        app.endUndoGroup();
    }
    return RRTools.stringify({
        ok: true,
        code: "LAYER_CREATED",
        kind: kind,
        message: "Created a white " + name + " at " + box.width + "×" + box.height + ", matching \"" + source.name + "\".",
        name: String(layer.name),
        index: layer.index,
        width: box.width,
        height: box.height
    });
};

RRTools.layerBox = function (layer, comp) {
    var width = 0;
    var height = 0;
    var pixelAspect = comp.pixelAspect;
    try {
        if (layer.width > 0) width = layer.width;
        if (layer.height > 0) height = layer.height;
    } catch (err) {}
    if (!(width > 0) || !(height > 0)) {
        try {
            var rect = layer.sourceRectAtTime(comp.time, false);
            width = Math.max(1, Math.round(rect.width));
            height = Math.max(1, Math.round(rect.height));
        } catch (err2) {
            width = comp.width;
            height = comp.height;
        }
    }
    try {
        if (layer.source && layer.source.pixelAspect > 0) pixelAspect = layer.source.pixelAspect;
    } catch (err3) {}
    return { width: width, height: height, pixelAspect: pixelAspect };
};

/*
    Solid-background key.
    Effect match names confirmed in the After Effects scripting guide
    (First-Party Effect Match Names):
      ADBE Linear Color Key2   Linear Color Key
      ADBE Matte Choker        Matte Choker
      ADBE Remove Color Matting
      ADBE Checkerboard
      ADBE Slider Control
      ADBE Effect Parade       Effects group
    Parameter match names for Linear Color Key, Matte Choker, and Remove Color
    Matting are not in that guide. Those controls are bound by the English
    display names in the current After Effects effect help, after the effect
    is added. A control that is not found is not set.
    Remove Color Matting is never the key. It is only the later un-premultiply
    (Background Color = the key color) when Halo cleanup is on.
    Not used: Keylight, ADBE Color Key, ADBE Shift Channels, ADBE Simple Choker,
    ADBE Spill2. AVLayer.sampleImage is not in the scripting guide; pixel reads
    go through the expression sampleImage on a temporary Slider Control.
*/

RRTools.KEY_MATCH = "ADBE Linear Color Key2";
RRTools.FEATHER_MATCH = "ADBE Matte Choker";
RRTools.HALO_MATCH = "ADBE Remove Color Matting";
RRTools.BOARD_MATCH = "ADBE Checkerboard";
RRTools.SLIDER_MATCH = "ADBE Slider Control";
RRTools.KEY_NAME = "RR TOOLS Linear Color Key";
RRTools.FEATHER_NAME = "RR TOOLS Matte Feather";
RRTools.HALO_NAME = "RR TOOLS Halo Cleanup";
RRTools.GUIDE_NAME = "RR TOOLS Checkerboard";
RRTools.PROBE_NAME = "RR TOOLS Alpha Probe";

RRTools.nameStarts = function (name, prefix) {
    var text = String(name).toLowerCase();
    var head = String(prefix).toLowerCase();
    if (text === head) return true;
    if (text.length <= head.length) return false;
    if (text.substring(0, head.length) !== head) return false;
    var next = text.charAt(head.length);
    return next === " " || next === "-" || (next >= "0" && next <= "9");
};

RRTools.jsNum = function (value) {
    var number = Number(value);
    if (isNaN(number)) number = 0;
    var sign = number < 0 ? "-" : "";
    var absolute = Math.abs(number);
    var whole = Math.floor(absolute);
    var frac = Math.floor((absolute - whole) * 1000 + 0.5);
    if (frac >= 1000) {
        whole += 1;
        frac = 0;
    }
    var digits = String(frac);
    while (digits.length < 3) digits = "0" + digits;
    return sign + String(whole) + "." + digits;
};

RRTools.clampUnit = function (value, fallback) {
    var number = Number(value);
    if (isNaN(number)) number = fallback;
    if (number < 0) number = 0;
    if (number > 100) number = 100;
    return number;
};

RRTools.colorArg = function (value) {
    if (!value || value.length < 3) return null;
    var channels = [];
    var i;
    for (i = 0; i < 3; i++) {
        var channel = Number(value[i]);
        if (isNaN(channel)) return null;
        if (channel < 0) channel = 0;
        if (channel > 1) channel = 1;
        channels.push(channel);
    }
    return channels;
};

RRTools.effectParade = function (layer) {
    try {
        return layer.property("ADBE Effect Parade");
    } catch (err) {
        return null;
    }
};

RRTools.namedChildren = function (group) {
    var rows = [];
    if (!group) return rows;
    var count = 0;
    try { count = group.numProperties; } catch (err) { count = 0; }
    var i;
    for (i = 1; i <= count; i++) {
        var prop = null;
        try { prop = group.property(i); } catch (err2) { prop = null; }
        if (!prop) continue;
        var name = "";
        var matchName = "";
        try { name = String(prop.name); } catch (err3) {}
        try { matchName = String(prop.matchName); } catch (err4) {}
        rows.push({ index: i, name: name, matchName: matchName, prop: prop });
    }
    return rows;
};

RRTools.describeProps = function (rows) {
    var parts = [];
    var i;
    for (i = 0; i < rows.length; i++) {
        parts.push(rows[i].name + " [" + rows[i].matchName + "]");
    }
    return parts.join(", ");
};

RRTools.childByName = function (group, label) {
    var want = String(label).toLowerCase();
    var rows = RRTools.namedChildren(group);
    var i;
    for (i = 0; i < rows.length; i++) {
        if (rows[i].name.toLowerCase() === want) return rows[i];
    }
    return null;
};

RRTools.findEffectByName = function (layer, name) {
    var parade = RRTools.effectParade(layer);
    if (!parade) return null;
    var count = 0;
    try { count = parade.numProperties; } catch (err) { count = 0; }
    var i;
    for (i = 1; i <= count; i++) {
        var effect = parade.property(i);
        try {
            if (String(effect.name) === name) return effect;
        } catch (err2) {}
    }
    return null;
};

RRTools.addNamedEffect = function (layer, matchName, name) {
    var existing = RRTools.findEffectByName(layer, name);
    if (existing) {
        var existingMatch = "";
        try { existingMatch = String(existing.matchName); } catch (err) {}
        if (existingMatch && existingMatch !== matchName) {
            return { effect: null, created: false, error: "\"" + name + "\" is not " + matchName + "." };
        }
        return { effect: existing, created: false, matchName: existingMatch || matchName, index: existing.propertyIndex };
    }
    var parade = RRTools.effectParade(layer);
    if (!parade) return { effect: null, created: false, error: "This layer has no Effects group." };
    var allowed = true;
    try {
        allowed = parade.canAddProperty(matchName) ? true : false;
    } catch (err2) {
        allowed = true;
    }
    if (!allowed) {
        return { effect: null, created: false, error: matchName + " cannot be added to this layer." };
    }
    var created;
    try {
        created = parade.addProperty(matchName);
    } catch (err3) {
        return { effect: null, created: false, error: "After Effects did not add " + matchName + ". " + String(err3) };
    }
    var index = created.propertyIndex;
    var effect = RRTools.effectParade(layer).property(index);
    try { effect.name = name; } catch (err4) {}
    effect = RRTools.effectParade(layer).property(index);
    var actual = "";
    try { actual = String(effect.matchName); } catch (err5) {}
    if (actual && actual !== matchName) {
        try { effect.remove(); } catch (err6) {}
        return { effect: null, created: false, error: "After Effects added " + actual + " instead of " + matchName + "." };
    }
    return { effect: effect, created: true, matchName: actual || matchName, index: index };
};

RRTools.removeAt = function (layer, index, matchName) {
    if (!index) return;
    var parade = RRTools.effectParade(layer);
    if (!parade) return;
    try {
        var effect = parade.property(index);
        if (!matchName || String(effect.matchName) === matchName) effect.remove();
    } catch (err) {}
};

RRTools.removeEffectByName = function (layer, name) {
    var guard = 0;
    while (guard < 8) {
        var effect = RRTools.findEffectByName(layer, name);
        if (!effect) return;
        try {
            effect.remove();
        } catch (err) {
            return;
        }
        guard++;
    }
};

RRTools.writeValue = function (prop, value, time) {
    var next = value;
    var isArray = value && typeof value.length === "number" && typeof value !== "string";
    if (!isArray) {
        try {
            if (prop.hasMin && next < prop.minValue) next = prop.minValue;
            if (prop.hasMax && next > prop.maxValue) next = prop.maxValue;
        } catch (err) {}
    }
    if (prop.numKeys > 0) prop.setValueAtTime(time, next);
    else prop.setValue(next);
    return next;
};

RRTools.writePercent = function (prop, percent, time) {
    var min = 0;
    var max = 100;
    try { if (prop.hasMin) min = prop.minValue; } catch (err) {}
    try { if (prop.hasMax) max = prop.maxValue; } catch (err2) {}
    var span = percent / 100;
    if (span < 0) span = 0;
    if (span > 1) span = 1;
    return RRTools.writeValue(prop, min + (max - min) * span, time);
};

RRTools.writeColor = function (prop, rgb, time) {
    var next = [rgb[0], rgb[1], rgb[2]];
    var current = null;
    try { current = prop.value; } catch (err) {}
    if (current && current.length >= 4) next = [rgb[0], rgb[1], rgb[2], current[3]];
    return RRTools.writeValue(prop, next, time);
};

RRTools.rememberProp = function (bound, effectMatch, prop) {
    var name = "";
    var matchName = "";
    try { name = String(prop.name); } catch (err) {}
    try { matchName = String(prop.matchName); } catch (err2) {}
    bound.push({ effect: effectMatch, property: name, matchName: matchName });
};

RRTools.footageAlpha = function (layer) {
    var info = { hasAlpha: null, mode: "", premul: null };
    var source = null;
    try {
        if (layer.source && layer.source.mainSource) source = layer.source.mainSource;
    } catch (err) {}
    if (!source) return info;
    try {
        if (typeof source.hasAlpha !== "undefined") info.hasAlpha = source.hasAlpha ? true : false;
    } catch (err2) {}
    try {
        var mode = source.alphaMode;
        if (mode === AlphaMode.IGNORE) info.mode = "IGNORE";
        else if (mode === AlphaMode.STRAIGHT) info.mode = "STRAIGHT";
        else if (mode === AlphaMode.PREMULTIPLIED) info.mode = "PREMULTIPLIED";
    } catch (err3) {}
    try {
        if (info.mode === "PREMULTIPLIED" && source.premulColor && source.premulColor.length >= 3) {
            info.premul = [source.premulColor[0], source.premulColor[1], source.premulColor[2]];
        }
    } catch (err4) {}
    return info;
};

RRTools.layerFrame = function (layer, time) {
    var width = 0;
    var height = 0;
    var left = 0;
    var top = 0;
    try {
        if (layer.width > 1) width = layer.width;
        if (layer.height > 1) height = layer.height;
    } catch (err) {}
    if (!(width > 1) || !(height > 1)) {
        try {
            var rect = layer.sourceRectAtTime(time, false);
            left = rect.left;
            top = rect.top;
            width = rect.width;
            height = rect.height;
        } catch (err2) {}
    }
    return { left: left, top: top, width: width, height: height };
};

RRTools.samplePoints = function (frame) {
    var x0 = frame.left + 0.5;
    var y0 = frame.top + 0.5;
    var x1 = frame.left + Math.max(0.5, frame.width - 1.5);
    var y1 = frame.top + Math.max(0.5, frame.height - 1.5);
    var xm = frame.left + (frame.width / 2);
    var ym = frame.top + (frame.height / 2);
    return [
        { x: x0, y: y0, corner: true },
        { x: x1, y: y0, corner: true },
        { x: x0, y: y1, corner: true },
        { x: x1, y: y1, corner: true },
        { x: xm, y: y0, corner: false },
        { x: x1, y: ym, corner: false },
        { x: xm, y: y1, corner: false },
        { x: x0, y: ym, corner: false }
    ];
};

RRTools.unpackSample = function (packed) {
    var number = Math.round(Number(packed));
    if (isNaN(number) || number < 0) return null;
    var alpha = Math.floor(number / 1000000000);
    var blue = Math.floor((number % 1000000000) / 1000000);
    var green = Math.floor((number % 1000000) / 1000);
    var red = number % 1000;
    if (red > 255 || green > 255 || blue > 255 || alpha > 255) return null;
    return { r: red, g: green, b: blue, a: alpha };
};

RRTools.sampleExpression = function (x, y) {
    var point = "[" + RRTools.jsNum(x) + ", " + RRTools.jsNum(y) + "]";
    return "var s = sampleImage(" + point + ", [0.5, 0.5], false, time); var r = s[0]; var g = s[1]; var b = s[2]; var a = s[3]; if (r < 0) r = 0; if (r > 1) r = 1; if (g < 0) g = 0; if (g > 1) g = 1; if (b < 0) b = 0; if (b > 1) b = 1; if (a < 0) a = 0; if (a > 1) a = 1; Math.round(r * 255) + Math.round(g * 255) * 1000 + Math.round(b * 255) * 1000000 + Math.round(a * 255) * 1000000000";
};

RRTools.sliderProp = function (effect) {
    var prop = null;
    try { prop = effect.property("ADBE Slider Control-0001"); } catch (err) { prop = null; }
    try {
        if (prop && prop.propertyValueType !== PropertyValueType.OneD) prop = null;
    } catch (errType) { prop = null; }
    if (prop) return prop;
    var rows = RRTools.namedChildren(effect);
    var i;
    for (i = 0; i < rows.length; i++) {
        try {
            if (rows[i].prop.propertyValueType === PropertyValueType.OneD) return rows[i].prop;
        } catch (err2) {}
    }
    return null;
};

RRTools.sampleLayer = function (layer, time) {
    var frame = RRTools.layerFrame(layer, time);
    if (!(frame.width > 1) || !(frame.height > 1)) {
        return { ok: false, message: "The layer has no pixel bounds to sample.", samples: [] };
    }
    var parade = RRTools.effectParade(layer);
    if (!parade) return { ok: false, message: "This layer has no Effects group to sample from.", samples: [] };
    var added = null;
    var samples = [];
    var suppressed = false;
    try {
        try {
            app.beginSuppressDialogs();
            suppressed = true;
        } catch (err) {}
        var allowed = true;
        try { allowed = parade.canAddProperty(RRTools.SLIDER_MATCH) ? true : false; } catch (err2) { allowed = true; }
        if (!allowed) return { ok: false, message: "A Slider Control could not be added to sample the layer.", samples: [] };
        added = parade.addProperty(RRTools.SLIDER_MATCH);
        var index = added.propertyIndex;
        var effect = RRTools.effectParade(layer).property(index);
        try { effect.name = RRTools.PROBE_NAME; } catch (err3) {}
        effect = RRTools.effectParade(layer).property(index);
        var slider = RRTools.sliderProp(effect);
        if (!slider) return { ok: false, message: "The Slider Control had no numeric property to read.", samples: [] };
        var points = RRTools.samplePoints(frame);
        var i;
        for (i = 0; i < points.length; i++) {
            var point = points[i];
            var packed = null;
            var pointFailed = false;
            var errorText = "";
            try {
                slider.expression = RRTools.sampleExpression(point.x, point.y);
                packed = slider.valueAtTime(time, false);
            } catch (err4) {
                pointFailed = true;
            }
            try { errorText = String(slider.expressionError || ""); } catch (err5) { errorText = ""; }
            var decoded = (pointFailed || errorText) ? null : RRTools.unpackSample(packed);
            if (!decoded) samples.push({ ok: false, corner: point.corner, r: 0, g: 0, b: 0, a: 0 });
            else samples.push({ ok: true, corner: point.corner, r: decoded.r, g: decoded.g, b: decoded.b, a: decoded.a });
        }
        return { ok: true, message: "", samples: samples };
    } catch (err6) {
        return { ok: false, message: "Could not sample the layer. " + String(err6), samples: samples };
    } finally {
        if (added) {
            try { added.remove(); } catch (err7) {}
        }
        try { RRTools.removeEffectByName(layer, RRTools.PROBE_NAME); } catch (err8) {}
        if (suppressed) {
            try { app.endSuppressDialogs(false); } catch (err9) {}
        }
    }
};

RRTools.alphaDecision = function (info, sampleResult) {
    var samples = sampleResult && sampleResult.samples ? sampleResult.samples : [];
    var sawTransparent = false;
    var corners = 0;
    var blackCorners = 0;
    var failed = sampleResult && sampleResult.ok === false;
    var i;
    for (i = 0; i < samples.length; i++) {
        var sample = samples[i];
        if (!sample.ok) {
            failed = true;
            continue;
        }
        if (sample.a < 250) sawTransparent = true;
        if (sample.corner) {
            corners++;
            if (sample.r <= 8 && sample.g <= 8 && sample.b <= 8 && sample.a >= 250) blackCorners++;
        }
    }
    var usable = false;
    var reason = "";
    if (sawTransparent) {
        usable = true;
        reason = "sampled";
    } else if (failed && info.hasAlpha === true && (info.mode === "STRAIGHT" || info.mode === "PREMULTIPLIED")) {
        usable = true;
        reason = "unsampled-alpha";
    }
    return {
        usable: usable,
        reason: reason,
        black: corners === 4 && blackCorners === 4 && !sawTransparent,
        failed: failed,
        corners: corners
    };
};

RRTools.publicSamples = function (samples) {
    var rows = [];
    var i;
    var source = samples || [];
    for (i = 0; i < source.length; i++) {
        rows.push({
            corner: source[i].corner ? true : false,
            ok: source[i].ok ? true : false,
            r: source[i].r,
            g: source[i].g,
            b: source[i].b,
            a: source[i].a
        });
    }
    return rows;
};

RRTools.rgbText = function (sample) {
    if (!sample || !sample.ok) return "unreadable";
    return "rgb(" + sample.r + ", " + sample.g + ", " + sample.b + ") alpha " + sample.a;
};

RRTools.keyTarget = function (comp) {
    var selected = comp.selectedLayers;
    if (!selected || selected.length === 0) {
        return {
            layer: null,
            extra: false,
            error: { code: "NO_LAYER", message: "Select a layer. Nothing was changed." }
        };
    }
    var layer = selected[0];
    try {
        if (layer.nullLayer) {
            return { layer: null, extra: false, error: { code: "UNSUPPORTED", message: "The selected layer is a null. Select the footage layer." } };
        }
    } catch (err) {}
    try {
        if (layer instanceof CameraLayer || layer instanceof LightLayer) {
            return { layer: null, extra: false, error: { code: "UNSUPPORTED", message: "Select a footage layer. Cameras and lights have no pixels to key." } };
        }
    } catch (err2) {}
    try {
        if (layer.adjustmentLayer) {
            return { layer: null, extra: false, error: { code: "UNSUPPORTED", message: "Select the footage layer. The adjustment layer was left unchanged." } };
        }
    } catch (err3) {}
    return { layer: layer, extra: selected.length > 1, error: null };
};

RRTools.inspectLayer = function (layer, time) {
    var info = RRTools.footageAlpha(layer);
    var sampled = RRTools.sampleLayer(layer, time);
    var decision = RRTools.alphaDecision(info, sampled);
    return { info: info, sampled: sampled, decision: decision };
};

RRTools.inspectMessage = function (layer, report) {
    var info = report.info;
    var decision = report.decision;
    var samples = report.sampled.samples || [];
    var first = null;
    var i;
    for (i = 0; i < samples.length; i++) {
        if (samples[i].corner) { first = samples[i]; break; }
    }
    var alphaText = "No footage alpha channel was found.";
    if (info.hasAlpha === true) {
        alphaText = "Footage alpha is present (" + (info.mode || "unreadable") + ").";
    } else if (info.hasAlpha === false) {
        alphaText = "The footage reports no alpha channel.";
    }
    if (decision.usable) {
        return alphaText + " Transparency is already in the layer, so it will not be keyed. Top-left " + RRTools.rgbText(first) + ".";
    }
    if (decision.black) {
        return alphaText + " The corners are solid black. The key color is set to black.";
    }
    if (report.sampled.ok === false) {
        return alphaText + " " + (report.sampled.message || "The layer could not be sampled.");
    }
    return alphaText + " The corners are not solid black. Top-left " + RRTools.rgbText(first) + ". Pick the background color, then remove it.";
};

RRTools.inspectKey = function () {
    var found = RRTools.activeComp();
    if (!found.comp) {
        return RRTools.stringify({ ok: false, code: found.error.code, message: found.error.message });
    }
    var target = RRTools.keyTarget(found.comp);
    if (!target.layer) {
        return RRTools.stringify({ ok: false, code: target.error.code, message: target.error.message });
    }
    var report = null;
    app.beginUndoGroup("RR TOOLS Check Background");
    try {
        report = RRTools.inspectLayer(target.layer, found.comp.time);
    } catch (err) {
        return RRTools.stringify({
            ok: false,
            code: "SAMPLE_FAILED",
            message: "Could not read the selected layer. " + String(err)
        });
    } finally {
        try { app.endUndoGroup(); } catch (err2) {}
    }
    var guides = RRTools.guideIndexes(found.comp);
    return RRTools.stringify({
        ok: true,
        code: "INSPECTED",
        message: RRTools.inspectMessage(target.layer, report),
        layer: String(target.layer.name),
        extra: target.extra ? true : false,
        hasAlpha: report.info.hasAlpha,
        alphaMode: report.info.mode,
        usableAlpha: report.decision.usable ? true : false,
        black: report.decision.black ? true : false,
        suggested: report.decision.black ? [0, 0, 0] : null,
        samples: RRTools.publicSamples(report.sampled.samples),
        checkerboard: guides.length > 0
    });
};

RRTools.removeLayersByName = function (comp, name) {
    var indexes = [];
    var i;
    for (i = 1; i <= comp.numLayers; i++) {
        try {
            if (String(comp.layer(i).name) === name) indexes.push(i);
        } catch (err) {}
    }
    for (i = indexes.length - 1; i >= 0; i--) {
        try { comp.layer(indexes[i]).remove(); } catch (err2) {}
    }
};

RRTools.guideIndexes = function (comp) {
    var indexes = [];
    var i;
    for (i = 1; i <= comp.numLayers; i++) {
        var layer = comp.layer(i);
        var name = "";
        var guide = false;
        try { name = String(layer.name); } catch (err) {}
        try { guide = layer.guideLayer ? true : false; } catch (err2) {}
        if (name === RRTools.GUIDE_NAME && guide) indexes.push(i);
    }
    return indexes;
};

RRTools.configureKey = function (effect, rgb, tolerance, softness, time, bound) {
    var color = RRTools.childByName(effect, "Key Color");
    var toleranceProp = RRTools.childByName(effect, "Matching Tolerance");
    var softnessProp = RRTools.childByName(effect, "Matching Softness");
    if (!color || !toleranceProp || !softnessProp) {
        return { ok: false, saw: RRTools.describeProps(RRTools.namedChildren(effect)) };
    }
    try {
        if (color.prop.propertyValueType !== PropertyValueType.COLOR) {
            return { ok: false, saw: RRTools.describeProps(RRTools.namedChildren(effect)) };
        }
    } catch (err) {}
    RRTools.writeColor(color.prop, rgb, time);
    RRTools.writePercent(toleranceProp.prop, tolerance, time);
    RRTools.writePercent(softnessProp.prop, softness, time);
    RRTools.rememberProp(bound, RRTools.KEY_MATCH, color.prop);
    RRTools.rememberProp(bound, RRTools.KEY_MATCH, toleranceProp.prop);
    RRTools.rememberProp(bound, RRTools.KEY_MATCH, softnessProp.prop);
    return { ok: true, saw: "" };
};

RRTools.configureFeather = function (effect, percent, time, bound) {
    var rows = RRTools.namedChildren(effect);
    var geo = [];
    var choke = [];
    var gray = [];
    var iterations = null;
    var i;
    for (i = 0; i < rows.length; i++) {
        var name = rows[i].name.toLowerCase();
        if (RRTools.nameStarts(name, "geometric softness")) geo.push(rows[i]);
        else if (RRTools.nameStarts(name, "choke") && name.indexOf("matte") === -1) choke.push(rows[i]);
        else if (RRTools.nameStarts(name, "gray level softness")) gray.push(rows[i]);
        else if (name === "iterations") iterations = rows[i];
    }
    if (!geo.length || !choke.length || !gray.length) {
        return { ok: false, saw: RRTools.describeProps(rows) };
    }
    RRTools.writePercent(geo[0].prop, percent, time);
    RRTools.writeValue(choke[0].prop, 0, time);
    RRTools.writePercent(gray[0].prop, percent, time);
    if (geo.length > 1) RRTools.writePercent(geo[1].prop, 0, time);
    if (choke.length > 1) RRTools.writeValue(choke[1].prop, 0, time);
    if (gray.length > 1) RRTools.writePercent(gray[1].prop, 0, time);
    if (iterations) RRTools.writeValue(iterations.prop, 1, time);
    RRTools.rememberProp(bound, RRTools.FEATHER_MATCH, geo[0].prop);
    RRTools.rememberProp(bound, RRTools.FEATHER_MATCH, choke[0].prop);
    RRTools.rememberProp(bound, RRTools.FEATHER_MATCH, gray[0].prop);
    return { ok: true, saw: "" };
};

RRTools.configureHalo = function (effect, rgb, time, bound) {
    var background = RRTools.childByName(effect, "Background Color");
    if (!background) return { ok: false, saw: RRTools.describeProps(RRTools.namedChildren(effect)) };
    try {
        if (background.prop.propertyValueType !== PropertyValueType.COLOR) {
            return { ok: false, saw: RRTools.describeProps(RRTools.namedChildren(effect)) };
        }
    } catch (err) {}
    RRTools.writeColor(background.prop, rgb, time);
    RRTools.rememberProp(bound, RRTools.HALO_MATCH, background.prop);
    return { ok: true, saw: "" };
};

RRTools.capturePreview = function (comp, layer) {
    if (typeof comp.saveFrameToPng !== "function") {
        return { path: "", stamp: 0, note: "This After Effects build did not expose saveFrameToPng, so the panel has no rendered frame." };
    }
    var disabled = [];
    var solid = null;
    var file = null;
    try {
        file = new File(Folder.temp.fsName + "/rr-tools-key-preview.png");
        if (file.exists) file.remove();
    } catch (err) {
        return { path: "", stamp: 0, note: "Could not prepare a preview file. " + String(err) };
    }
    try {
        var indexes = RRTools.guideIndexes(comp);
        var i;
        for (i = 0; i < indexes.length; i++) {
            var guide = comp.layer(indexes[i]);
            var wasEnabled = true;
            try { wasEnabled = guide.enabled ? true : false; } catch (err2) { wasEnabled = true; }
            if (wasEnabled) {
                try { guide.enabled = false; } catch (err3) {}
                disabled.push(guide);
            }
        }
        solid = comp.layers.addSolid([1, 1, 1], "RR TOOLS Preview Matte", comp.width, comp.height, comp.pixelAspect, comp.duration);
        var parade = RRTools.effectParade(solid);
        parade.addProperty(RRTools.BOARD_MATCH);
        try { solid.moveAfter(layer); } catch (err4) { try { solid.moveToEnd(); } catch (err5) {} }
        comp.saveFrameToPng(comp.time, file);
    } catch (err6) {
        return { path: "", stamp: 0, note: "The frame was not saved. " + String(err6) };
    } finally {
        if (solid) {
            try { solid.remove(); } catch (err7) {}
        }
        RRTools.removeLayersByName(comp, "RR TOOLS Preview Matte");
        var h;
        for (h = 0; h < disabled.length; h++) {
            try { disabled[h].enabled = true; } catch (err8) {}
        }
    }
    if (!file || !file.exists) {
        return { path: "", stamp: 0, note: "After Effects did not write the preview frame." };
    }
    var stamp = 0;
    try { stamp = file.modified.getTime(); } catch (err9) { stamp = 0; }
    return { path: file.fsName, stamp: stamp, note: "" };
};

RRTools.removeBackground = function (raw) {
    var args = RRTools.parseArgs(raw);
    if (args.__parseError) {
        return RRTools.stringify({ ok: false, code: "BAD_ARGS", message: "Could not read the key request." });
    }
    var rgb = RRTools.colorArg(args.color);
    if (!rgb) {
        return RRTools.stringify({ ok: false, code: "BAD_ARGS", message: "Pick a key color first." });
    }
    var tolerance = RRTools.clampUnit(args.tolerance, 10);
    var softness = RRTools.clampUnit(args.softness, 8);
    var feather = RRTools.clampUnit(args.feather, 0);
    var halo = args.halo ? true : false;
    var found = RRTools.activeComp();
    if (!found.comp) {
        return RRTools.stringify({ ok: false, code: found.error.code, message: found.error.message });
    }
    var target = RRTools.keyTarget(found.comp);
    if (!target.layer) {
        return RRTools.stringify({ ok: false, code: target.error.code, message: target.error.message });
    }
    var comp = found.comp;
    var layer = target.layer;
    var bound = [];
    var skipped = [];
    var preview = { path: "", stamp: 0, note: "" };
    app.beginUndoGroup("RR TOOLS Remove Background");
    try {
        var report = RRTools.inspectLayer(layer, comp.time);
        if (report.decision.usable) {
            var kept = RRTools.inspectMessage(layer, report);
            return RRTools.stringify({
                ok: true,
                code: "HAS_ALPHA",
                message: kept + " No key was added.",
                layer: String(layer.name),
                hasAlpha: report.info.hasAlpha,
                alphaMode: report.info.mode,
                usableAlpha: true,
                black: false,
                bound: [],
                skipped: [],
                preview: "",
                previewStamp: 0,
                previewNote: "",
                checkerboard: RRTools.guideIndexes(comp).length > 0
            });
        }
        if (!report.sampled.ok || report.decision.failed) {
            return RRTools.stringify({
                ok: false,
                code: "SAMPLE_FAILED",
                message: (report.sampled.message || "Could not read the layer pixels.") + " The key was not applied."
            });
        }
        var keyAdded = RRTools.addNamedEffect(layer, RRTools.KEY_MATCH, RRTools.KEY_NAME);
        if (!keyAdded.effect) {
            return RRTools.stringify({
                ok: false,
                code: "KEY_MISSING",
                message: keyAdded.error || "Linear Color Key is not available."
            });
        }
        var keyed = RRTools.configureKey(keyAdded.effect, rgb, tolerance, softness, comp.time, bound);
        if (!keyed.ok) {
            if (keyAdded.created) {
                RRTools.removeAt(layer, keyAdded.index, RRTools.KEY_MATCH);
                try { RRTools.removeEffectByName(layer, RRTools.KEY_NAME); } catch (removeErr) {}
            }
            return RRTools.stringify({
                ok: false,
                code: "UNBOUND",
                message: "Linear Color Key did not expose Key Color, Matching Tolerance, and Matching Softness. Nothing was left on the layer.",
                detail: keyed.saw
            });
        }
        if (feather > 0) {
            var featherAdded = RRTools.addNamedEffect(layer, RRTools.FEATHER_MATCH, RRTools.FEATHER_NAME);
            if (!featherAdded.effect) {
                skipped.push("Feather (" + RRTools.FEATHER_MATCH + "): " + (featherAdded.error || "unavailable"));
            } else {
                var feathered = RRTools.configureFeather(featherAdded.effect, feather, comp.time, bound);
                if (!feathered.ok) {
                    if (featherAdded.created) {
                        RRTools.removeAt(layer, featherAdded.index, RRTools.FEATHER_MATCH);
                        try { RRTools.removeEffectByName(layer, RRTools.FEATHER_NAME); } catch (removeErr2) {}
                    }
                    skipped.push("Feather properties were not the documented Matte Choker names. " + feathered.saw);
                }
            }
        } else {
            RRTools.removeEffectByName(layer, RRTools.FEATHER_NAME);
        }
        if (halo) {
            var haloAdded = RRTools.addNamedEffect(layer, RRTools.HALO_MATCH, RRTools.HALO_NAME);
            if (!haloAdded.effect) {
                skipped.push("Halo cleanup (" + RRTools.HALO_MATCH + "): " + (haloAdded.error || "unavailable"));
            } else {
                var haloed = RRTools.configureHalo(haloAdded.effect, rgb, comp.time, bound);
                if (!haloed.ok) {
                    if (haloAdded.created) {
                        RRTools.removeAt(layer, haloAdded.index, RRTools.HALO_MATCH);
                        try { RRTools.removeEffectByName(layer, RRTools.HALO_NAME); } catch (removeErr3) {}
                    }
                    skipped.push("Remove Color Matting had no Background Color property. " + haloed.saw);
                }
            }
        } else {
            RRTools.removeEffectByName(layer, RRTools.HALO_NAME);
        }
        preview = RRTools.capturePreview(comp, layer);
    } catch (err4) {
        return RRTools.stringify({
            ok: false,
            code: "KEY_FAILED",
            message: "The background was not removed. " + String(err4)
        });
    } finally {
        try { app.endUndoGroup(); } catch (err5) {}
    }
    var only = target.extra ? " Only \"" + layer.name + "\" was changed." : "";
    var skipText = skipped.length ? " " + skipped.join(" ") : "";
    return RRTools.stringify({
        ok: true,
        code: "KEYED",
        message: "Keyed the background on \"" + layer.name + "\" with Linear Color Key." + only + skipText,
        layer: String(layer.name),
        bound: bound,
        skipped: skipped,
        preview: preview.path,
        previewStamp: preview.stamp,
        previewNote: preview.note,
        checkerboard: RRTools.guideIndexes(comp).length > 0
    });
};

RRTools.checkerboard = function (raw) {
    var args = RRTools.parseArgs(raw);
    if (args.__parseError) {
        return RRTools.stringify({ ok: false, code: "BAD_ARGS", message: "Could not read the checkerboard request." });
    }
    var found = RRTools.activeComp();
    if (!found.comp) {
        return RRTools.stringify({ ok: false, code: found.error.code, message: found.error.message });
    }
    var comp = found.comp;
    var enable = args.enabled ? true : false;
    app.beginUndoGroup("RR TOOLS Checkerboard");
    try {
        if (!enable) {
            var indexes = RRTools.guideIndexes(comp);
            var removed = 0;
            var i;
            for (i = indexes.length - 1; i >= 0; i--) {
                try {
                    comp.layer(indexes[i]).remove();
                    removed++;
                } catch (err) {}
            }
            return RRTools.stringify({
                ok: true,
                code: "CHECKER_OFF",
                message: removed ? "Removed the checkerboard guide layer." : "No checkerboard guide layer was in the composition.",
                checkerboard: false
            });
        }
        if (RRTools.guideIndexes(comp).length > 0) {
            return RRTools.stringify({
                ok: true,
                code: "CHECKER_ON",
                message: "The checkerboard guide layer is already in the composition.",
                checkerboard: true
            });
        }
        var solid = comp.layers.addSolid([1, 1, 1], RRTools.GUIDE_NAME, comp.width, comp.height, comp.pixelAspect, comp.duration);
        var ready = false;
        try {
            try { solid.guideLayer = true; } catch (err2) {}
            try { solid.comment = "RR TOOLS checkerboard guide. Visible in this composition and not rendered."; } catch (err3) {}
            var parade = RRTools.effectParade(solid);
            if (!parade) {
                try { solid.remove(); } catch (err4) {}
                return RRTools.stringify({ ok: false, code: "CHECKER_FAILED", message: "The guide layer had no Effects group." });
            }
            var allowed = true;
            try { allowed = parade.canAddProperty(RRTools.BOARD_MATCH) ? true : false; } catch (err5) { allowed = true; }
            if (!allowed) {
                try { solid.remove(); } catch (err6) {}
                return RRTools.stringify({ ok: false, code: "CHECKER_FAILED", message: "Checkerboard could not be added, so no guide layer was left in the composition." });
            }
            parade.addProperty(RRTools.BOARD_MATCH);
            var selected = comp.selectedLayers;
            if (selected && selected.length > 0) {
                try { solid.moveAfter(selected[0]); } catch (err9) { try { solid.moveToEnd(); } catch (err10) {} }
            } else {
                try { solid.moveToEnd(); } catch (err11) {}
            }
            try { solid.guideLayer = true; } catch (err12) {}
            var isGuide = false;
            try { isGuide = solid.guideLayer ? true : false; } catch (err13) { isGuide = false; }
            if (!isGuide) {
                try { solid.remove(); } catch (err14) {}
                return RRTools.stringify({
                    ok: false,
                    code: "CHECKER_FAILED",
                    message: "The layer could not be marked as a guide, so it was removed."
                });
            }
            ready = true;
        } catch (err15) {
            if (!ready && solid) {
                try { solid.remove(); } catch (err16) {}
            }
            return RRTools.stringify({ ok: false, code: "CHECKER_FAILED", message: "The checkerboard guide was not created. " + String(err15) });
        }
    } catch (err17) {
        return RRTools.stringify({ ok: false, code: "CHECKER_FAILED", message: "The checkerboard guide was not created. " + String(err17) });
    } finally {
        try { app.endUndoGroup(); } catch (endErr) {}
    }
    return RRTools.stringify({
        ok: true,
        code: "CHECKER_ON",
        message: "Added a checkerboard guide layer. It is visible in this composition and is not rendered.",
        checkerboard: true
    });
};
