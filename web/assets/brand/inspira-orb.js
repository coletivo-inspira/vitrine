/*
 * Orb +INSPIRA — selo flutuante em liquid glass para sites/subdomínios do Coletivo.
 * Mesma lógica do componente InspiraOrb do portal inspira.dev.br.
 *
 * Uso (qualquer página):
 *   <script
 *     src="https://coletivo-inspira.github.io/brand-book/assets/js/inspira-orb.js"
 *     data-href="https://inspira.dev.br/"
 *     defer
 *   ></script>
 *
 * Atributos opcionais no <script>:
 *   data-href     — destino do clique (default https://inspira.dev.br/)
 *   data-label    — aria-label (default em PT)
 *   data-hide-on  — hostnames CSV onde a orb não monta
 *   data-mount    — seletor CSS de um container (ex.: "#rodape"); a orb entra
 *                   ali, no fluxo da página, em vez de ficar fixa no canto
 *
 * Vitrine (só para apresentação, como no brand-book): qualquer elemento com
 * `data-inspira-orb-showcase` recebe uma orb grande, decorativa e sem link.
 */
(function () {
  "use strict";

  if (window.__inspiraOrbLoaded) return;
  window.__inspiraOrbLoaded = true;

  var DEFAULT_HREF = "https://inspira.dev.br/";
  var DEFAULT_LABEL = "Coletivo Inspira — ir ao site oficial";
  var ROOT_CLASS = "inspira-orb";
  var SHOWCASE_ATTR = "data-inspira-orb-showcase";
  var STYLE_ID = "inspira-orb-styles";
  var REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
  var TAU = Math.PI * 2;
  var CYCLE_MS = 14000;
  /* Tamanho de referência da orb fixa: raio 22px num canvas de 104px. */
  var BASE_RADIUS = 22;
  var RADIUS_RATIO = BASE_RADIUS / 104;
  /* The showcase box has no outer bleed, so the drop fills more of it. */
  var SHOWCASE_RADIUS_RATIO = 0.26;
  /* Distance (px) from the fixed orb edge where it starts leaning toward the cursor. */
  var PROXIMITY_RANGE = 140;
  var FOREST = "19, 56, 36";
  var PLUS_PATH = "M75 19 H121 V75 H177 V121 H121 V177 H75 V121 H19 V75 H75 V19 Z";
  var PALETTE = [
    { r: 186, g: 255, b: 41 },
    { r: 163, g: 229, b: 194 },
    { r: 240, g: 93, b: 35 },
  ];

  var script =
    document.currentScript ||
    (function () {
      var nodes = document.getElementsByTagName("script");
      for (var i = nodes.length - 1; i >= 0; i--) {
        if ((nodes[i].src || "").indexOf("inspira-orb") !== -1) return nodes[i];
      }
      return null;
    })();

  function attr(name) {
    return (script && script.getAttribute(name)) || "";
  }

  var href = attr("data-href") || DEFAULT_HREF;
  var label = attr("data-label") || DEFAULT_LABEL;
  var mountSelector = attr("data-mount");
  var hideOn = attr("data-hide-on")
    .split(",")
    .map(function (host) {
      return host.trim().toLowerCase();
    })
    .filter(Boolean);
  var hiddenHere = hideOn.indexOf((location.hostname || "").toLowerCase()) !== -1;

  var A = "a." + ROOT_CLASS;
  var S = "[" + SHOWCASE_ATTR + "]";
  var P = " .inspira-orb__plus";
  var css = [
    A + "{--orb-size:4rem;--orb-bleed:1.25rem;position:fixed;left:0.9rem;bottom:0.9rem;z-index:70;" +
      "width:var(--orb-size);height:var(--orb-size);display:grid;place-items:center;border-radius:50%;" +
      "text-decoration:none;outline:none;-webkit-tap-highlight-color:transparent;}",
    A + ".inspira-orb--inline{position:relative;left:auto;bottom:auto;z-index:auto;display:inline-grid;" +
      "margin:var(--orb-bleed);}",
    A + ":focus-visible{box-shadow:0 0 0 2px #133824,0 0 0 4px #BAFF29;}",
    A + " canvas{position:absolute;inset:calc(var(--orb-bleed) * -1);width:calc(100% + var(--orb-bleed) * 2);" +
      "height:calc(100% + var(--orb-bleed) * 2);pointer-events:none;}",
    S + "{position:relative;display:grid;place-items:center;width:100%;max-width:26rem;aspect-ratio:1;" +
      "margin-inline:auto;animation:inspira-orb-float 7s ease-in-out infinite;}",
    S + " canvas{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;}",
    A + P + "," + S + P + "{position:relative;z-index:1;pointer-events:none;opacity:0;" +
      "translate:var(--orb-plus-x,0px) var(--orb-plus-y,0px);transform:scale(0.5);" +
      "filter:blur(3px) drop-shadow(0 1px 2px rgba(19,56,36,0));" +
      "transition:opacity 0.45s ease,transform 0.6s cubic-bezier(0.34,1.56,0.64,1),filter 0.45s ease;}",
    A + P + "{width:1.3rem;height:1.3rem;}",
    S + P + "{width:24%;height:24%;}",
    A + P + " svg," + S + P + " svg{display:block;width:100%;height:100%;}",
    A + ":hover" + P + "," + A + ":focus-visible" + P + "," + S + ":hover" + P + "{opacity:1;transform:scale(1);" +
      "filter:blur(0) drop-shadow(0 1px 2px rgba(19,56,36,0.35));}",
    S + ":hover" + P + "{filter:blur(0) drop-shadow(0 4px 8px rgba(19,56,36,0.35));}",
    "@keyframes inspira-orb-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-12px)}}",
    "@media (hover:none){" + A + P + "," + S + P + "{opacity:0.85;transform:scale(0.85);filter:none;}}",
    "@media (prefers-reduced-motion:reduce){" + S + "{animation:none;}" +
      A + P + "," + S + P + "{transition:opacity 0.2s ease;transform:none;filter:none;}" +
      A + ":hover" + P + "," + A + ":focus-visible" + P + "," + S + ":hover" + P + "{transform:none;filter:none;}}",
  ].join("");

  function mixPalette(timeMs) {
    var t = (((timeMs % CYCLE_MS) + CYCLE_MS) % CYCLE_MS) / CYCLE_MS;
    var scaled = t * PALETTE.length;
    var i = Math.floor(scaled) % PALETTE.length;
    var j = (i + 1) % PALETTE.length;
    var f = scaled - Math.floor(scaled);
    var a = PALETTE[i];
    var b = PALETTE[j];
    return { r: a.r + (b.r - a.r) * f, g: a.g + (b.g - a.g) * f, b: a.b + (b.b - a.b) * f };
  }

  function lighten(c, amount) {
    return { r: c.r + (255 - c.r) * amount, g: c.g + (255 - c.g) * amount, b: c.b + (255 - c.b) * amount };
  }

  function darken(c, amount) {
    return { r: c.r * (1 - amount), g: c.g * (1 - amount), b: c.b * (1 - amount) };
  }

  function rgba(c, a) {
    return "rgba(" + Math.round(c.r) + "," + Math.round(c.g) + "," + Math.round(c.b) + "," + a + ")";
  }

  function createLiquidOrb() {
    var blobs = [];
    for (var i = 0; i < 4; i++) {
      blobs.push({
        fx: 0.7 + Math.random() * 0.7,
        fy: 0.7 + Math.random() * 0.7,
        phase: Math.random() * TAU,
        colorOffset: (i / 4) * CYCLE_MS,
        size: 0.7 + Math.random() * 0.25,
      });
    }
    var waves = [
      { k: 2, amp: 1 },
      { k: 3, amp: 0.7 },
      { k: 5, amp: 0.35 },
    ].map(function (w) {
      w.speed = (0.0006 + Math.random() * 0.0005) * (Math.random() > 0.5 ? 1 : -1);
      w.phase = Math.random() * TAU;
      return w;
    });
    return { blobs: blobs, waves: waves, time: Math.random() * CYCLE_MS, hover: 0, near: 0, pointerAngle: -Math.PI / 4 };
  }

  function stepLiquidOrb(orb, dt, hovering, proximity, pointerAngle, reduced) {
    var targetHover = hovering ? 1 : 0;
    if (reduced) {
      orb.hover = targetHover;
      orb.near = 0;
      return;
    }
    dt = Math.min(Math.max(dt, 0), 64);
    var ease = 1 - Math.exp(-dt / 180);
    orb.hover += (targetHover - orb.hover) * ease;
    orb.near += (proximity - orb.near) * ease;
    var delta = Math.atan2(Math.sin(pointerAngle - orb.pointerAngle), Math.cos(pointerAngle - orb.pointerAngle));
    orb.pointerAngle += delta * ease;
    orb.time += dt * (1 + orb.hover * 0.9);
  }

  function liquidRadius(orb, theta, radius) {
    var wave = 0;
    for (var i = 0; i < orb.waves.length; i++) {
      var w = orb.waves[i];
      wave += w.amp * Math.sin(w.k * theta + orb.time * w.speed + w.phase);
    }
    var wobble = 0.022 + orb.hover * 0.018 + orb.near * 0.008;
    var lean = Math.max(0, Math.cos(theta - orb.pointerAngle));
    var bulge = 0.07 * orb.near * (1 - orb.hover * 0.6) * Math.pow(lean, 4);
    return radius * (1 + wobble * wave + bulge);
  }

  function traceOutline(ctx, orb, cx, cy, radius, segments) {
    var points = [];
    var i;
    for (i = 0; i < segments; i++) {
      var theta = (i / segments) * TAU;
      var r = liquidRadius(orb, theta, radius);
      points.push([cx + Math.cos(theta) * r, cy + Math.sin(theta) * r]);
    }
    var first = points[0];
    var last = points[segments - 1];
    ctx.beginPath();
    ctx.moveTo((last[0] + first[0]) / 2, (last[1] + first[1]) / 2);
    for (i = 0; i < segments; i++) {
      var p = points[i];
      var n = points[(i + 1) % segments];
      ctx.quadraticCurveTo(p[0], p[1], (p[0] + n[0]) / 2, (p[1] + n[1]) / 2);
    }
    ctx.closePath();
  }

  function drawLiquidOrb(ctx, orb, size, baseRadius) {
    var scale = baseRadius / BASE_RADIUS;
    /* Strokes grow slower than the drop so a large orb keeps a fine glass rim. */
    var line = Math.sqrt(scale);
    var segments = baseRadius > 40 ? 128 : 72;
    var cx = size / 2;
    var cy = size / 2;
    var R = baseRadius * (1 + orb.hover * 0.14 + 0.025 * Math.sin(orb.time * 0.0011));
    var t = orb.time;
    var tint = mixPalette(t);
    var leanX = Math.cos(orb.pointerAngle) * orb.near;
    var leanY = Math.sin(orb.pointerAngle) * orb.near;
    var g;

    ctx.clearRect(0, 0, size, size);
    ctx.globalAlpha = 0.9 + orb.hover * 0.1;

    var pulse = 0.5 + 0.5 * Math.sin(t * 0.0009);
    var haloR = Math.min(R * 1.9, size / 2);
    g = ctx.createRadialGradient(cx, cy, R * 0.4, cx, cy, haloR);
    g.addColorStop(0, rgba(tint, 0.26 + 0.12 * orb.hover + 0.06 * pulse));
    g.addColorStop(1, rgba(tint, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, haloR, 0, TAU);
    ctx.fill();

    ctx.save();
    ctx.translate(cx, cy + R * 0.98);
    ctx.scale(1, 0.28);
    g = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 0.85);
    g.addColorStop(0, "rgba(" + FOREST + ",0.16)");
    g.addColorStop(1, "rgba(" + FOREST + ",0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.85, 0, TAU);
    ctx.fill();
    ctx.restore();

    ctx.save();
    traceOutline(ctx, orb, cx, cy, R, segments);
    ctx.clip();

    g = ctx.createRadialGradient(cx - R * 0.3, cy - R * 0.35, R * 0.1, cx, cy, R * 1.1);
    g.addColorStop(0, rgba(lighten(tint, 0.6), 0.6));
    g.addColorStop(1, rgba(lighten(tint, 0.2), 0.5));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);

    var blobAlpha = 0.8 + 0.18 * orb.hover;
    for (var i = 0; i < orb.blobs.length; i++) {
      var blob = orb.blobs[i];
      var bx = cx + R * 0.48 * Math.sin(t * 0.00041 * blob.fx + blob.phase) + leanX * R * 0.22;
      var by = cy + R * 0.48 * Math.cos(t * 0.00033 * blob.fy + blob.phase * 1.3) + leanY * R * 0.22;
      var br = R * blob.size * (1 + orb.hover * 0.1);
      var color = mixPalette(t + blob.colorOffset);
      g = ctx.createRadialGradient(bx, by, 0, bx, by, br);
      g.addColorStop(0, rgba(color, blobAlpha));
      g.addColorStop(0.55, rgba(color, blobAlpha * 0.45));
      g.addColorStop(1, rgba(color, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(bx, by, br, 0, TAU);
      ctx.fill();
    }

    g = ctx.createRadialGradient(cx, cy, R * 0.6, cx, cy, R * 1.12);
    g.addColorStop(0, rgba(darken(tint, 0.35), 0));
    g.addColorStop(1, rgba(darken(tint, 0.35), 0.3));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);

    var causticX = cx + R * 0.18 - leanX * R * 0.1;
    var causticY = cy + R * 0.56 - leanY * R * 0.1;
    g = ctx.createRadialGradient(causticX, causticY, 0, causticX, causticY, R * 0.6);
    g.addColorStop(0, "rgba(255,255,255,0.5)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);

    ctx.save();
    ctx.translate(cx - R * 0.3 + leanX * R * 0.06, cy - R * 0.46 + leanY * R * 0.06);
    ctx.rotate(-0.5);
    ctx.scale(1, 0.52);
    g = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 0.55);
    g.addColorStop(0, "rgba(255,255,255,0.95)");
    g.addColorStop(0.5, "rgba(255,255,255,0.35)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.55, 0, TAU);
    ctx.fill();
    ctx.restore();

    ctx.restore();

    traceOutline(ctx, orb, cx, cy, R + 0.4 * line, segments);
    ctx.lineWidth = 0.8 * line;
    ctx.strokeStyle = "rgba(" + FOREST + ",0.18)";
    ctx.stroke();

    traceOutline(ctx, orb, cx, cy, R - 0.6 * line, segments);
    g = ctx.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
    g.addColorStop(0, "rgba(255,255,255,0.95)");
    g.addColorStop(0.5, "rgba(255,255,255,0.2)");
    g.addColorStop(1, "rgba(255,255,255,0.65)");
    ctx.lineWidth = 1.2 * line;
    ctx.strokeStyle = g;
    ctx.stroke();

    ctx.globalAlpha = 1;

    return {
      x: (leanX * 2 + Math.sin(t * 0.0011) * 0.8) * scale,
      y: (leanY * 2 + Math.cos(t * 0.0009) * 0.8) * scale,
    };
  }

  var media = typeof window.matchMedia === "function" ? window.matchMedia(REDUCED_MOTION_QUERY) : null;
  var reduced = !!(media && media.matches);
  var instances = [];
  var plusId = 0;

  function plusMarkup() {
    plusId += 1;
    var fill = "inspira-orb-plus-fill-" + plusId;
    var sheen = "inspira-orb-plus-sheen-" + plusId;
    return (
      '<canvas aria-hidden="true"></canvas>' +
      '<span class="inspira-orb__plus" aria-hidden="true">' +
      '<svg viewBox="0 0 196 196" focusable="false">' +
      "<defs>" +
      '<linearGradient id="' + fill + '" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0" stop-color="#2c6a45"/>' +
      '<stop offset="0.55" stop-color="#133824"/>' +
      '<stop offset="1" stop-color="#0b2416"/>' +
      "</linearGradient>" +
      '<linearGradient id="' + sheen + '" x1="0" y1="0" x2="0.6" y2="0.6">' +
      '<stop offset="0" stop-color="#ffffff" stop-opacity="0.55"/>' +
      '<stop offset="1" stop-color="#ffffff" stop-opacity="0"/>' +
      "</linearGradient>" +
      "</defs>" +
      '<path d="' + PLUS_PATH + '" fill="url(#' + fill + ')" stroke="url(#' + fill + ')" ' +
      'stroke-width="14" stroke-linejoin="round"/>' +
      '<path d="' + PLUS_PATH + '" fill="url(#' + sheen + ')"/>' +
      "</svg>" +
      "</span>"
    );
  }

  /*
   * root: element hovered by the pointer (link or showcase box).
   * radiusFor(size): drop radius for a canvas of `size` CSS px.
   * rangeFor(rect): proximity range in px for the lean toward the cursor.
   */
  function createInstance(root, radiusFor, rangeFor) {
    root.innerHTML = plusMarkup();
    var canvas = root.querySelector("canvas");
    var plus = root.querySelector(".inspira-orb__plus");
    var ctx = canvas.getContext && canvas.getContext("2d", { alpha: true });
    if (!ctx) return null;

    var self = {
      orb: createLiquidOrb(),
      size: 0,
      radius: BASE_RADIUS,
      frame: 0,
      last: 0,
      hovering: false,
      proximity: 0,
      pointerAngle: -Math.PI / 4,
    };

    function resize() {
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      self.size = canvas.clientWidth || 104;
      self.radius = radiusFor(self.size);
      canvas.width = Math.round(self.size * dpr);
      canvas.height = Math.round(self.size * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function render(dt) {
      stepLiquidOrb(self.orb, dt, self.hovering, self.proximity, self.pointerAngle, reduced);
      var offset = drawLiquidOrb(ctx, self.orb, self.size, self.radius);
      plus.style.setProperty("--orb-plus-x", offset.x.toFixed(2) + "px");
      plus.style.setProperty("--orb-plus-y", offset.y.toFixed(2) + "px");
    }

    function tick(now) {
      var dt = self.last ? now - self.last : 16;
      self.last = now;
      render(dt);
      self.frame = reduced ? 0 : requestAnimationFrame(tick);
    }

    self.redraw = function () {
      if (reduced) {
        cancelAnimationFrame(self.frame);
        self.frame = 0;
        render(0);
      } else if (!self.frame) {
        self.last = 0;
        self.frame = requestAnimationFrame(tick);
      }
    };

    self.resize = function () {
      resize();
      if (reduced) render(0);
    };

    self.track = function (x, y) {
      var rect = root.getBoundingClientRect();
      var dx = x - (rect.left + rect.width / 2);
      var dy = y - (rect.top + rect.height / 2);
      var distance = Math.hypot(dx, dy) - rect.width / 2;
      self.proximity = Math.min(1, Math.max(0, 1 - distance / rangeFor(rect)));
      self.pointerAngle = Math.atan2(dy, dx);
    };

    function setHover(value) {
      return function () {
        self.hovering = value;
        self.redraw();
      };
    }

    root.addEventListener("mouseenter", setHover(true));
    root.addEventListener("mouseleave", setHover(false));
    root.addEventListener("focus", setHover(true));
    root.addEventListener("blur", setHover(false));

    resize();
    self.redraw();
    instances.push(self);
    return self;
  }

  function mountLink() {
    if (hiddenHere || document.querySelector(A)) return;
    var link = document.createElement("a");
    link.className = ROOT_CLASS;
    link.href = href;
    link.setAttribute("aria-label", label);
    if (reduced) link.setAttribute("data-reduced-motion", "true");

    var container = mountSelector ? document.querySelector(mountSelector) : null;
    if (container) {
      link.className += " inspira-orb--inline";
      container.appendChild(link);
    } else {
      document.body.appendChild(link);
    }

    createInstance(
      link,
      function (size) {
        return size * RADIUS_RATIO;
      },
      function () {
        return PROXIMITY_RANGE;
      }
    );
  }

  function mountShowcases() {
    var nodes = document.querySelectorAll(S);
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      if (node.getAttribute("data-inspira-orb-mounted")) continue;
      node.setAttribute("data-inspira-orb-mounted", "true");
      if (!node.hasAttribute("role")) node.setAttribute("role", "img");
      if (!node.hasAttribute("aria-label")) node.setAttribute("aria-label", "Prévia da orb +INSPIRA");
      createInstance(
        node,
        function (size) {
          return size * SHOWCASE_RADIUS_RATIO;
        },
        function (rect) {
          return rect.width * 0.6;
        }
      );
    }
  }

  function mount() {
    if (!document.getElementById(STYLE_ID)) {
      var style = document.createElement("style");
      style.id = STYLE_ID;
      style.textContent = css;
      document.head.appendChild(style);
    }

    mountLink();
    mountShowcases();
    if (!instances.length) return;

    var moveEvent = "PointerEvent" in window ? "pointermove" : "mousemove";
    window.addEventListener(
      moveEvent,
      function (event) {
        if (event.pointerType && event.pointerType !== "mouse") return;
        for (var i = 0; i < instances.length; i++) instances[i].track(event.clientX, event.clientY);
      },
      { passive: true }
    );
    window.addEventListener("resize", function () {
      for (var i = 0; i < instances.length; i++) instances[i].resize();
    });
    if (media && media.addEventListener) {
      media.addEventListener("change", function () {
        reduced = media.matches;
        var link = document.querySelector(A);
        if (link) {
          if (reduced) link.setAttribute("data-reduced-motion", "true");
          else link.removeAttribute("data-reduced-motion");
        }
        for (var i = 0; i < instances.length; i++) instances[i].redraw();
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }
})();
