"use strict";
(() => {
  // extension/src/keepawake.ts
  (() => {
    const root = document.documentElement;
    const optIn = /(^|\.)notion\.(so|com)$/i.test(location.hostname);
    const stored = () => {
      try {
        return localStorage.getItem("bw-awake");
      } catch {
        return null;
      }
    };
    const on = () => {
      const attr = root.getAttribute("data-bw-awake");
      if (optIn) return stored() === "on" && attr !== "off";
      return attr !== "off";
    };
    const D = Document.prototype;
    const desc = (n) => Object.getOwnPropertyDescriptor(Document.prototype, n);
    const vis = desc("visibilityState");
    const hid = desc("hidden");
    const realHidden = () => {
      try {
        return !!hid?.get?.call(document);
      } catch {
        return false;
      }
    };
    const define = (name, awake, real) => {
      try {
        Object.defineProperty(Document.prototype, name, {
          configurable: true,
          get() {
            return on() ? awake : real?.get?.call(this);
          }
        });
      } catch {
      }
    };
    define("visibilityState", "visible", vis);
    define("hidden", false, hid);
    define("webkitVisibilityState", "visible", desc("webkitVisibilityState") ?? vis);
    define("webkitHidden", false, desc("webkitHidden") ?? hid);
    try {
      const hasFocus = Document.prototype.hasFocus;
      D.hasFocus = function() {
        return on() ? true : hasFocus.call(this);
      };
    } catch {
    }
    const block = (e) => {
      if (on()) e.stopImmediatePropagation();
    };
    for (const t of ["visibilitychange", "webkitvisibilitychange", "freeze"]) {
      window.addEventListener(t, block, true);
      document.addEventListener(t, block, true);
    }
    window.addEventListener("blur", (e) => {
      if (on() && e.target === window) e.stopImmediatePropagation();
    }, true);
    const raf = window.requestAnimationFrame.bind(window);
    const caf = window.cancelAnimationFrame.bind(window);
    const timerIds = /* @__PURE__ */ new Set();
    window.requestAnimationFrame = (cb) => {
      if (!(on() && realHidden())) return raf(cb);
      const id = setTimeout(() => {
        timerIds.delete(id);
        cb(performance.now());
      }, 16);
      timerIds.add(id);
      return id;
    };
    window.cancelAnimationFrame = (id) => {
      if (timerIds.delete(id)) clearTimeout(id);
      else caf(id);
    };
    root.setAttribute("data-bw-awake-installed", "1");
  })();
})();
