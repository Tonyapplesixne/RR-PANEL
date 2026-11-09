(function (root) {
  var RR = root.RRTools = root.RRTools || {};
  var METHODS = {
    ping: "ping",
    probe: "probe",
    applyPresets: "applyPresets",
    revealFolder: "revealFolder"
  };

  function createBridge(csInterface) {
    function evalRaw(script) {
      return new Promise(function (resolve) {
        if (!csInterface) {
          resolve({
            ok: false,
            code: "NO_HOST",
            message: "CSInterface is not available. Open RR TOOLS from Window > Extensions inside After Effects 2025."
          });
          return;
        }
        var evalError = typeof EvalScript_ErrMessage === "undefined" ? "EvalScript error." : EvalScript_ErrMessage;
        csInterface.evalScript(script, function (raw) {
          if (raw === undefined || raw === null || raw === "" || raw === evalError || raw === "EvalScript error.") {
            resolve({
              ok: false,
              code: "HOST_EVAL",
              message: "After Effects did not return a result. " + String(raw || "empty response")
            });
            return;
          }
          try {
            resolve(JSON.parse(raw));
          } catch (err) {
            resolve({
              ok: false,
              code: "BAD_HOST_JSON",
              message: "Could not parse the After Effects response: " + String(raw).slice(0, 500)
            });
          }
        });
      });
    }

    function call(method, payload) {
      var name = METHODS[method];
      if (!name) {
        return Promise.resolve({ ok: false, code: "BAD_METHOD", message: "Unknown host call." });
      }
      var encoded = encodeURIComponent(JSON.stringify(payload || {}));
      var script = name === "ping" && !payload
        ? "RRTools.ping()"
        : "RRTools." + name + "(decodeURIComponent(\"" + encoded + "\"))";
      return evalRaw(script);
    }

    return {
      evalRaw: evalRaw,
      call: call,
      loadHost: function (jsxPath) {
        return new Promise(function (resolve) {
          if (!csInterface) {
            resolve({
              ok: false,
              code: "NO_HOST",
              message: "CSInterface is not available. Open RR TOOLS from Window > Extensions inside After Effects 2025."
            });
            return;
          }
          csInterface.evalScript("$.evalFile(" + JSON.stringify(jsxPath) + ")", function (raw) {
            var evalError = typeof EvalScript_ErrMessage === "undefined" ? "EvalScript error." : EvalScript_ErrMessage;
            if (raw === evalError || raw === "EvalScript error.") {
              resolve({
                ok: false,
                code: "HOST_EVAL",
                message: "After Effects could not load jsx/host.jsx. " + String(raw)
              });
              return;
            }
            resolve({ ok: true, code: "LOADED", message: "Host script loaded.", detail: raw == null ? "" : String(raw) });
          });
        });
      },
      ping: function () { return call("ping"); },
      probe: function () { return call("probe"); },
      applyPresets: function (paths) { return call("applyPresets", { paths: paths }); },
      revealFolder: function (path) { return call("revealFolder", { path: path }); }
    };
  }

  RR.bridge = { create: createBridge };
})(typeof window !== "undefined" ? window : global);
