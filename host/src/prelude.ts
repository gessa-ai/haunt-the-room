// JavaScript evaluated inside every QuickJS context before the game module. Its completion value is the
// runner object { install, run, views } the host keeps handles to. Every intrinsic the runner relies on is
// captured here, before game code runs, so a module that overwrites JSON, Math or Object cannot break it.
//
// Wire format (strings only, so one crossing per call):
//   install(mod, arm)                  -> meta JSON | "!" + error JSON
//   run(fn, argsJson, rng, now, max)   -> rng + "\n" + state JSON | "!" + error JSON      (fn = init | reduce)
//   views(stateJson, idsJson, rng, now) -> {"views":{id:view},"failed":{id:error}}
// error JSON = { name, message, stack } (raw QuickJS stack; the host keeps only the game.js frames).
export const PRELUDE = String.raw`(function () {
  "use strict";
  var g = globalThis;
  var parse = JSON.parse, stringify = JSON.stringify, getProto = Object.getPrototypeOf, isArray = Array.isArray;
  var keys = Object.keys, imul = Math.imul, OP = Object.prototype, AP = Array.prototype, Err = Error;
  var noop = function () {};
  g.console = { log: noop, info: noop, warn: noop, error: noop, debug: noop, trace: noop };

  function forbid(what, use) { return function () { throw new Err(what + " is forbidden on the server: use " + use); }; }
  Math.random = forbid("Math.random", "ctx.random()");
  var RealDate = Date;
  var FakeDate = function Date() { throw new Err("Date is forbidden on the server: use ctx.now"); };
  FakeDate.now = forbid("Date.now", "ctx.now");
  FakeDate.parse = RealDate.parse; FakeDate.UTC = RealDate.UTC; FakeDate.prototype = RealDate.prototype;
  RealDate.now = FakeDate.now;
  Object.defineProperty(RealDate.prototype, "constructor", { value: FakeDate });
  g.Date = FakeDate;

  // mulberry32, identical to research/gamegen/harness.mjs so host runs and playtests agree.
  var rng = 0;
  function random() {
    rng = (rng + 0x6d2b79f5) >>> 0;
    var t = rng;
    t = imul(t ^ (t >>> 15), t | 1);
    t ^= t + imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  function invalid(message) { var e = new Err(message); e.name = "ConjureInvalid"; return e; }

  var BAD = {};
  function replacer(k, x) {
    switch (typeof x) {
      case "string": case "boolean": return x;
      case "number": if (x !== x || x === Infinity || x === -Infinity) throw BAD; return x;
      case "object":
        if (x === null) return x;
        var p = getProto(x);
        if (p !== OP && p !== AP && p !== null) throw BAD;
        return x;
      case "undefined": if (isArray(this)) throw BAD; return x;
      default: throw BAD;
    }
  }
  // Slow path, only on failure: the precise path of the first non-JSON value.
  function problem(v, path, seen) {
    if (v === null) return null;
    var t = typeof v;
    if (t === "string" || t === "boolean") return null;
    if (t === "number") return v === v && v !== Infinity && v !== -Infinity ? null : path + " is " + v;
    if (t === "undefined") return path + " is undefined";
    if (t !== "object") return path + " is a " + t;
    if (seen.indexOf(v) >= 0) return path + " is a cycle";
    seen.push(v);
    var r = null, i;
    if (isArray(v)) {
      for (i = 0; i < v.length && !r; i++) r = problem(v[i], path + "[" + i + "]", seen);
    } else {
      var p = getProto(v);
      if (p !== OP && p !== null) { var c = v.constructor; return path + " is a " + (c && c.name ? c.name : "non-plain object"); }
      var ks = keys(v);
      for (i = 0; i < ks.length && !r; i++) if (v[ks[i]] !== undefined) r = problem(v[ks[i]], path + "." + ks[i], seen);
    }
    seen.pop();
    return r;
  }
  function toJson(v, what) {
    if (v === undefined) throw invalid(what + " is undefined (missing return?)");
    var s;
    try { s = stringify(v, replacer); }
    catch (e) {
      var p = problem(v, "$", []);
      if (p) throw invalid(what + " is not plain JSON: " + p);
      throw e;
    }
    return s;
  }

  function describe(e) {
    var name = "Error", message = "", stack = "";
    try {
      if (e !== null && typeof e === "object") {
        name = String(e.name || "Error");
        message = String(e.message);
        stack = String(e.stack || "").slice(0, 1000);
      } else { name = "Throw"; message = String(e); }
    } catch (_) { message = "unprintable exception"; }
    return { name: name, message: message, stack: stack };
  }
  function fail(e) { return "!" + stringify(describe(e)); }

  var M = null, arm = null;
  return {
    install: function (mod, armFn) {
      try {
        if (mod === null || typeof mod !== "object") throw invalid("module did not evaluate to an exports object");
        var missing = [];
        if (typeof mod.init !== "function") missing.push("init");
        if (typeof mod.reduce !== "function") missing.push("reduce");
        if (typeof mod.view !== "function") missing.push("view");
        if (missing.length) throw invalid("missing export function " + missing.join(", "));
        if (mod.meta === null || typeof mod.meta !== "object") throw invalid("missing export meta");
        M = mod; arm = armFn;
        return toJson(mod.meta, "meta");
      } catch (e) { return fail(e); }
    },
    run: function (fn, argsJson, seed, now, maxBytes) {
      try {
        rng = seed;
        var args = parse(argsJson);
        var ctx = { now: now, random: random };
        var out = fn === "init" ? M.init(args.players, ctx) : M.reduce(args.state, args.action, ctx);
        if (out === null || typeof out !== "object") {
          throw invalid(fn + " returned " + (out === null ? "null" : typeof out) + " instead of the state object");
        }
        var s = toJson(out, fn + " state");
        if (s.length > maxBytes) throw invalid(fn + " state is " + s.length + " bytes (limit " + maxBytes + ")");
        return rng + "\n" + s;
      } catch (e) { return fail(e); }
    },
    views: function (stateJson, idsJson, seed, now) {
      var ids = parse(idsJson), ok = [], bad = [];
      for (var i = 0; i < ids.length; i++) {
        arm();
        var id = ids[i];
        try {
          rng = seed;
          ok.push(stringify(id) + ":" + toJson(M.view(parse(stateJson), id, { now: now, random: random }), "view"));
        } catch (e) { bad.push(stringify(id) + ":" + stringify(describe(e))); }
      }
      return '{"views":{' + ok.join(",") + '},"failed":{' + bad.join(",") + "}}";
    }
  };
})()`
