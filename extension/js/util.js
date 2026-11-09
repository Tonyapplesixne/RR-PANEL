(function (root) {
  var RR = root.RRTools = root.RRTools || {};

  function toPosix(value) {
    return String(value || "").replace(/\\/g, "/");
  }

  function separator(value) {
    var text = String(value || "");
    return text.lastIndexOf("\\") > text.lastIndexOf("/") ? "\\" : "/";
  }

  function join(base, leaf) {
    var left = String(base || "");
    var right = String(leaf || "").replace(/^[\\/]+/, "");
    if (!left) return right;
    if (/[\\/]$/.test(left)) return left + right;
    return left + separator(left) + right;
  }

  function parent(value) {
    var text = String(value || "").replace(/[\\/]+$/, "");
    var index = Math.max(text.lastIndexOf("/"), text.lastIndexOf("\\"));
    if (index < 0) return text;
    if (index === 2 && /^[A-Za-z]:/.test(text)) return text.slice(0, 3);
    if (index === 0) return text.slice(0, 1);
    return text.slice(0, index);
  }

  function foldsCase(value) {
    return /\\/.test(String(value)) || /^[A-Za-z]:/.test(toPosix(value));
  }

  function samePath(a, b) {
    var left = toPosix(a).replace(/\/+$/, "");
    var right = toPosix(b).replace(/\/+$/, "");
    if (foldsCase(String(a) + String(b))) {
      return left.toLowerCase() === right.toLowerCase();
    }
    return left === right;
  }

  function relativePosix(rootPath, fullPath) {
    var base = toPosix(rootPath).replace(/\/+$/, "");
    var full = toPosix(fullPath);
    var prefix = base + "/";
    if (full.indexOf(prefix) === 0) return full.slice(prefix.length);
    if (full.toLowerCase().indexOf(prefix.toLowerCase()) === 0) return full.slice(prefix.length);
    return full;
  }

  function fileUrl(filePath) {
    var posix = toPosix(filePath);
    var encoded = encodeURI(posix).replace(/#/g, "%23");
    if (/^[A-Za-z]:\//.test(posix)) return "file:///" + encoded;
    if (posix.charAt(0) !== "/") posix = "/" + posix;
    return "file://" + encoded;
  }

  function extensionOf(filePath) {
    var base = toPosix(filePath).split("/").pop();
    var dot = base.lastIndexOf(".");
    return dot <= 0 ? "" : base.slice(dot + 1).toLowerCase();
  }

  function basename(filePath) {
    var base = toPosix(filePath).split("/").pop();
    return base || "";
  }

  function prettyName(fileName) {
    var stem = String(fileName || "").replace(/\.ffx$/i, "");
    stem = stem.replace(/[_]+/g, " ").replace(/\s+/g, " ").trim();
    return stem || "Untitled preset";
  }

  function directoryName(relativePath) {
    var posix = toPosix(relativePath);
    var index = posix.lastIndexOf("/");
    if (index <= 0) return "";
    return posix.slice(0, index);
  }

  RR.util = {
    toPosix: toPosix,
    join: join,
    parent: parent,
    samePath: samePath,
    relativePosix: relativePosix,
    fileUrl: fileUrl,
    extensionOf: extensionOf,
    basename: basename,
    prettyName: prettyName,
    directoryName: directoryName
  };
})(typeof window !== "undefined" ? window : global);
