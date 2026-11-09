/*
    RR TOOLS host bridge for After Effects 2025.
    ExtendScript is ES3. Do not use let, const, arrows, or trailing commas.
    Loaded by CSXS ScriptPath and again from the panel via $.evalFile.

    Verify inside After Effects (this file cannot prove a layer apply without AE):
    1. Open a composition and select one or more layers.
    2. From the panel, apply a real .ffx. The layers should gain that preset at the current time.
    3. Deselect every layer and apply again. The panel must show code NO_LAYER and must not report success.
    4. With no composition active, the probe returns code NO_COMP.
*/

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
        matchName: matchName
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
