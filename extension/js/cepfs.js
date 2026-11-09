(function (root) {
  var RR = root.RRTools = root.RRTools || {};

  function cepAvailable() {
    return typeof window !== "undefined" && window.__adobe_cep__ && window.cep && window.cep.fs;
  }

  function statData(path) {
    var result = window.cep.fs.stat(path);
    if (!result || result.err !== 0 || !result.data) return null;
    return result.data;
  }

  function isDirectory(path) {
    var data = statData(path);
    if (!data) return false;
    if (typeof data.isDirectory === "function") return !!data.isDirectory();
    return !!data.isDirectory;
  }

  function createCepFs() {
    return {
      isDirectory: function (path) {
        return !!path && isDirectory(path);
      },
      readDir: function (path) {
        var result = window.cep.fs.readdir(path);
        if (!result || result.err !== 0 || !result.data) {
          throw new Error("cep.fs.readdir error " + (result && result.err));
        }
        return result.data.filter(function (name) {
          return !!name;
        }).map(function (name) {
          var full = RR.util.join(path, name);
          var data = statData(full);
          var directory = false;
          if (data) {
            directory = typeof data.isDirectory === "function" ? !!data.isDirectory() : !!data.isDirectory;
          }
          return { name: name, path: full, isDirectory: directory };
        });
      },
      readText: function (path) {
        var result = window.cep.fs.readFile(path, "utf8");
        if (!result || result.err !== 0) return null;
        return result.data;
      },
      readBase64: function (path) {
        var encoding = window.cep.encoding && window.cep.encoding.Base64 ? window.cep.encoding.Base64 : "Base64";
        var result = window.cep.fs.readFile(path, encoding);
        if (!result || result.err !== 0 || !result.data) return "";
        return String(result.data).replace(/\s+/g, "");
      },
      statSize: function (path) {
        var data = statData(path);
        return data && typeof data.size === "number" ? data.size : 0;
      },
      exists: function (path) {
        return !!statData(path);
      },
      writeText: function (path, text) {
        var result = window.cep.fs.writeFile(path, text, "utf8");
        if (!result || result.err !== 0) {
          throw new Error("cep.fs.writeFile error " + (result && result.err));
        }
      },
      rename: function (fromPath, toPath) {
        var result = window.cep.fs.rename(fromPath, toPath);
        if (!result || result.err !== 0) {
          throw new Error("cep.fs.rename error " + (result && result.err));
        }
      },
      deleteFile: function (path) {
        var result = window.cep.fs.deleteFile(path);
        if (!result || result.err !== 0) {
          throw new Error("cep.fs.deleteFile error " + (result && result.err));
        }
      },
      makeDir: function (path) {
        if (isDirectory(path)) return;
        var result = window.cep.fs.makedir(path);
        if ((!result || result.err !== 0) && !isDirectory(path)) {
          throw new Error("cep.fs.makedir error " + (result && result.err));
        }
      }
    };
  }

  function resolveExtensionPath(fallback) {
    try {
      if (typeof require === "function") {
        return require("fs").realpathSync(fallback);
      }
    } catch (err) {
      return fallback;
    }
    return fallback;
  }

  function chooseDirectory(title, initialPath) {
    if (!cepAvailable() || typeof window.cep.fs.showOpenDialogEx !== "function") {
      return { ok: false, code: "NO_DIALOG", message: "The folder dialog is not available in this host.", path: "" };
    }
    var result = window.cep.fs.showOpenDialogEx(false, true, title, initialPath || "", []);
    if (!result || result.err !== 0) {
      return {
        ok: false,
        code: "DIALOG_FAILED",
        message: "Could not open the folder dialog (cep.fs error " + (result && result.err) + ").",
        path: ""
      };
    }
    if (!result.data || !result.data.length) {
      return { ok: false, code: "CANCELLED", message: "Folder selection was cancelled.", path: "" };
    }
    return { ok: true, code: "CHOSEN", message: "", path: result.data[0] };
  }

  function chooseFiles(title, initialPath, extensions) {
    if (!cepAvailable() || typeof window.cep.fs.showOpenDialogEx !== "function") {
      return { ok: false, code: "NO_DIALOG", message: "The file dialog is not available in this host.", paths: [] };
    }
    var result = window.cep.fs.showOpenDialogEx(true, false, title, initialPath || "", extensions || ["ffx"]);
    if (!result || result.err !== 0) {
      return {
        ok: false,
        code: "DIALOG_FAILED",
        message: "Could not open the file dialog (cep.fs error " + (result && result.err) + ").",
        paths: []
      };
    }
    if (!result.data || !result.data.length) {
      return { ok: false, code: "CANCELLED", message: "File selection was cancelled.", paths: [] };
    }
    return { ok: true, code: "CHOSEN", message: "", paths: result.data };
  }

  RR.cepfs = {
    available: cepAvailable,
    create: createCepFs,
    resolveExtensionPath: resolveExtensionPath,
    chooseDirectory: chooseDirectory,
    chooseFiles: chooseFiles
  };
})(typeof window !== "undefined" ? window : global);
