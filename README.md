# RR TOOLS

Adobe After Effects 2025 CEP panel for applying real `.ffx` animation presets to the layers selected in the active composition.

Phase 1 is the panel only. `installer/` is an empty placeholder. There is no sample preset catalog: `presets/` stays empty until you add your own `.ffx` files.

## Layout

```
extension/CSXS/manifest.xml    CEP 12 manifest, After Effects 25.0 and newer
extension/index.html           panel UI
extension/css/                 dark panel styles
extension/js/CSInterface.js    Adobe CSInterface 12.0.0
extension/js/                  catalog, preferences, host bridge, UI
extension/jsx/host.jsx         ExtendScript: probe, applyPreset, reveal folder
extension/jsx/json2.jsx        Public-domain JSON for ExtendScript, which has none
extension/assets/              panel icons
presets/                       library of real .ffx files (none are shipped)
data/catalog.json              empty shipped catalog
data/preferences.example.json  shape of the per-user preferences file
installer/                     unused
```

A preset id is `bundle:` or `my:` plus the path relative to that folder. Optional sidecar `Name.json` next to `Name.ffx` may set `name`, `description`, and `category`. An image with the same stem (`.png`, `.jpg`, `.jpeg`, `.webp`) is the preview. Files directly in the presets root use the category `General`. A subfolder name is the category unless the sidecar overrides it.

## Install the unsigned panel in After Effects 2025

After Effects 2025 uses CEP 12. Unsigned extensions load only when PlayerDebugMode is on for CSXS.12. Quit After Effects before changing it.

### Windows

```bat
reg add HKCU\Software\Adobe\CSXS.12 /v PlayerDebugMode /t REG_SZ /d 1 /f
mkdir "%APPDATA%\Adobe\CEP\extensions"
mklink /J "%APPDATA%\Adobe\CEP\extensions\com.tonyapplesixne.rrtools" "C:\full\path\to\rr-tools\extension"
```

Use a junction or symlink to `extension`, not a copy of that folder by itself. The panel resolves the real extension path and reads `presets/` next to it. If you copy the extension somewhere else, set the presets folder from Settings.

Adobe documents PlayerDebugMode as a string. If the value already exists as a DWORD, set that DWORD to `1`.

### macOS

```bash
defaults write com.adobe.CSXS.12 PlayerDebugMode 1
mkdir -p "$HOME/Library/Application Support/Adobe/CEP/extensions"
ln -s /full/path/to/rr-tools/extension "$HOME/Library/Application Support/Adobe/CEP/extensions/com.tonyapplesixne.rrtools"
```

If the default does not stick, run `killall cfprefsd` and write it again. Then quit and relaunch After Effects.

### Open the panel

1. Relaunch After Effects 2025.
2. Open **Window > Extensions > RR TOOLS**. Some 25.x builds label that menu **Window > Extensions (Legacy)**.
3. Settings should show the resolved extension path and the sibling `presets/` path. The host pill should change from `Checking` to `AE` plus the version string returned by After Effects (`app.version`). A browser opened on `index.html` stays on the outside-host message and does not invent a composition.

Remote debug, while the panel is open: [http://localhost:8860](http://localhost:8860) (`extension/.debug`).

## What to verify in After Effects

These host calls are implemented in `extension/jsx/host.jsx`. They are not stubbed in the UI. This repository cannot launch After Effects, so the apply path has to be confirmed in the app.

1. With the shipped repo, Presets shows an empty state. Home counts stay at zero. No preset names are invented.
2. Copy a real `.ffx` into `presets/Motion/Your Preset.ffx` (or any folder). Press **Rescan**. The card uses the file name, folder category, and path. Remove the file, rescan, and the card disappears.
3. Open a composition and select one or more layers. Within about two seconds, Home lists those layer names and the composition name from the host probe.
4. Press **Apply** on the preset. After Effects should show one undo step, **RR TOOLS Apply Preset**, and the preset should land on the selected layers at the current time. The panel reports success only when ExtendScript returns `APPLIED`.
5. Deselect every layer and press **Apply** again. The banner must show code `NO_LAYER` and must not claim success. Close the composition viewer so nothing is active and Home should show `NO_COMP`.
6. Star a preset, quit After Effects, and reopen the panel. The favorite should still be on. Preferences are written to `<SystemPath.USER_DATA>/RRTools/preferences.json`. On Windows that user-data path is usually `%APPDATA%`. On macOS it is usually `~/Library/Application Support`. The Settings page prints the exact file.
7. **Select category** selects every preset in that category. **Apply category** and **Apply selected** call the same host function with those `.ffx` paths, in one undo group named **RR TOOLS Apply Presets**. An invalid preset file returns `APPLY_FAILED` or `MISSING_FILE` with the ExtendScript message.

My Presets scans a second folder chosen in the panel, and it also lists individual `.ffx` files added with **Add .ffx files**. A single preset file does not have to be inside the chosen folder. Both stay empty until you add a folder or a file.

## Preferences

`data/preferences.example.json` is the file shape. The live file is per computer user, not committed:

```json
{
  "version": 1,
  "favorites": [],
  "selected": [],
  "myPresetsPath": "",
  "myPresetFiles": [],
  "bundlePresetsPath": "",
  "section": "home"
}
```

`bundlePresetsPath` overrides the discovered `presets/` folder. If `preferences.json` is not valid JSON, the panel shows the parse error and does not overwrite the file until you press **Reset preferences**.

## Local test without After Effects

`node test/catalog.test.js` checks folder scanning, sidecar parsing, empty catalogs, and preference normalization. It creates temporary files outside the repo and deletes them. It does not prove `layer.applyPreset`.

## Manifest

- Host: `AEFT` version `[25.0,99.9]`
- Required runtime: CSXS `12.0`
- Extension id: `com.tonyapplesixne.rrtools.panel`
- Node and mixed context are enabled so a symlink to `extension/` resolves back to this repo’s `presets/` folder. No npm packages are required.
