/* DigiBara Mods — Extended Edition v3 (injected by serve_mods.py) */
(function () {
  /* ═══════════════════════════════════════════════════════════════
     §0  CUSTOM IN-GAME ROOM BACKGROUND ENGINE (WebGL Room Painter)
         - Renders the custom wallpaper directly into the room layer
           right after the room background is cleared, sitting BEHIND
           the character and sprites.
         - Unbinds GameMaker's VAO (both WebGL 2 and OES extension)
           before drawing to guarantee zero font or sprite corruption.
         - Correct right-side-up UV orientation.
     ═══════════════════════════════════════════════════════════════ */
  var _customRoomBg = null;
  try { _customRoomBg = localStorage.getItem("dm_custom_room_bg"); } catch (e) {}
  window._digibara_custom_room_bg = !!_customRoomBg;

  var _gameReady = false;
  var _bgImageElement = null;
  var _bgTextureNeedsUpdate = false;
  var _bgTexture = null;
  var _bgShader = null;
  var _bgQuadBuffer = null;
  var _drawnThisFrame = false;
  var _savedClearColor = [0, 0, 0, 1];

  function frameReset() {
    _drawnThisFrame = false;
    requestAnimationFrame(frameReset);
  }
  requestAnimationFrame(frameReset);

  function monitorGameLoad() {
    if (_gameReady) return;
    var sp = document.getElementById("spinner");
    var cv = document.getElementById("canvas");
    if (cv && cv.style.display === "block" && (!sp || sp.style.display === "none" || sp.hidden)) {
      setTimeout(function () {
        _gameReady = true;
      }, 500);
      return;
    }
    requestAnimationFrame(monitorGameLoad);
  }
  requestAnimationFrame(monitorGameLoad);
  setTimeout(function () { _gameReady = true; }, 3000);

  function loadCustomRoomBgImage(url) {
    if (!url) {
      _bgImageElement = null;
      _bgTextureNeedsUpdate = true;
      return;
    }
    var img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = function () {
      _bgImageElement = img;
      _bgTextureNeedsUpdate = true;
    };
    img.src = url;
  }

  if (_customRoomBg) loadCustomRoomBgImage(_customRoomBg);

  function initBgRenderer(gl) {
    if (_bgShader) return;
    // Map UVs so top of image (v_u.y = 0) aligns with top of screen (a_p.y = 1)
    var vs = "attribute vec2 a_p; varying vec2 v_u; void main() { v_u = vec2((a_p.x + 1.0) * 0.5, (1.0 - a_p.y) * 0.5); gl_Position = vec4(a_p, 0.0, 1.0); }";
    var fs = "precision mediump float; varying vec2 v_u; uniform sampler2D u_t; void main() { gl_FragColor = texture2D(u_t, v_u); }";
    function compile(type, src) {
      var s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    }
    var prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, vs));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(prog);
    _bgShader = {
      prog: prog,
      a_p: gl.getAttribLocation(prog, "a_p"),
      u_t: gl.getUniformLocation(prog, "u_t")
    };

    _bgQuadBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, _bgQuadBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1,
       1, -1,
      -1,  1,
      -1,  1,
       1, -1,
       1,  1
    ]), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }

  function drawCustomRoomBg(gl) {
    if (!_bgImageElement) return;
    initBgRenderer(gl);
    if (!_bgShader) return;

    if (_bgTextureNeedsUpdate) {
      _bgTextureNeedsUpdate = false;
      if (!_bgTexture) _bgTexture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, _bgTexture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, _bgImageElement);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.bindTexture(gl.TEXTURE_2D, null);
    }
    if (!_bgTexture) return;

    var prevProg = gl.getParameter(gl.CURRENT_PROGRAM);
    var prevBuf = gl.getParameter(gl.ARRAY_BUFFER_BINDING);
    var prevActTex = gl.getParameter(gl.ACTIVE_TEXTURE);
    var prevTex = gl.getParameter(gl.TEXTURE_BINDING_2D);
    var prevBlend = gl.isEnabled(gl.BLEND);
    var prevDepth = gl.isEnabled(gl.DEPTH_TEST);
    var prevDepthMask = gl.getParameter(gl.DEPTH_WRITEMASK);
    var prevScissor = gl.isEnabled(gl.SCISSOR_TEST);
    var prevCull = gl.isEnabled(gl.CULL_FACE);
    var prevMask = gl.getParameter(gl.COLOR_WRITEMASK);

    // Unbind active VAO so GameMaker attribute bindings are never modified
    var vaoExt = gl.getExtension("OES_vertex_array_object");
    var prevVAO = null;
    if (typeof gl.bindVertexArray === "function") {
      prevVAO = gl.getParameter(gl.VERTEX_ARRAY_BINDING);
      gl.bindVertexArray(null);
    } else if (vaoExt) {
      prevVAO = gl.getParameter(vaoExt.VERTEX_ARRAY_BINDING_OES);
      vaoExt.bindVertexArrayOES(null);
    }

    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.disable(gl.SCISSOR_TEST);
    gl.disable(gl.CULL_FACE);
    gl.colorMask(true, true, true, true);

    gl.useProgram(_bgShader.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, _bgTexture);
    gl.uniform1i(_bgShader.u_t, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, _bgQuadBuffer);
    gl.enableVertexAttribArray(_bgShader.a_p);
    gl.vertexAttribPointer(_bgShader.a_p, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.disableVertexAttribArray(_bgShader.a_p);

    // Restore state
    gl.bindBuffer(gl.ARRAY_BUFFER, prevBuf);
    if (typeof gl.bindVertexArray === "function") {
      gl.bindVertexArray(prevVAO);
    } else if (vaoExt && prevVAO) {
      vaoExt.bindVertexArrayOES(prevVAO);
    }
    gl.activeTexture(prevActTex);
    gl.bindTexture(gl.TEXTURE_2D, prevTex);
    gl.useProgram(prevProg);
    gl.colorMask(prevMask[0], prevMask[1], prevMask[2], prevMask[3]);
    gl.depthMask(prevDepthMask);
    if (prevBlend) gl.enable(gl.BLEND);
    if (prevDepth) gl.enable(gl.DEPTH_TEST);
    if (prevScissor) gl.enable(gl.SCISSOR_TEST);
    if (prevCull) gl.enable(gl.CULL_FACE);
  }

  function compressAndProcessImage(fileOrBlob, maxWidth, maxHeight, quality, callback) {
    try {
      var reader = new FileReader();
      reader.onload = function (e) {
        var img = new Image();
        img.onload = function () {
          try {
            var targetW = 1080;
            var targetH = 1920;
            var c = document.createElement("canvas");
            c.width = targetW;
            c.height = targetH;
            var ctx2d = c.getContext("2d");

            var imgW = img.width;
            var imgH = img.height;
            var scale = Math.max(targetW / imgW, targetH / imgH);
            var drawW = imgW * scale;
            var drawH = imgH * scale;
            var drawX = (targetW - drawW) / 2;
            var drawY = (targetH - drawH) / 2;

            ctx2d.drawImage(img, drawX, drawY, drawW, drawH);
            var compressedDataUrl = c.toDataURL("image/jpeg", quality || 0.85);
            callback(null, compressedDataUrl);
          } catch (err) {
            callback(err);
          }
        };
        img.onerror = function () {
          callback(new Error("Could not decode image file."));
        };
        img.src = e.target.result;
      };
      reader.onerror = function (err) {
        callback(err || new Error("Failed to read file."));
      };
      reader.readAsDataURL(fileOrBlob);
    } catch (e) {
      callback(e);
    }
  }

  try {
    var _origGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, attrs) {
      var isGameCanvas = this && (this.id === "canvas" || (this.classList && this.classList.contains("emscripten")));
      var ctx = _origGetContext.call(this, type, attrs);
      if (isGameCanvas && ctx) {
        window._digibara_gl = ctx;
        hookGlContext(ctx);
      }
      if (isGameCanvas && ctx && !ctx._dm_bg_hooked && typeof ctx.clearColor === "function") {
        ctx._dm_bg_hooked = true;
        var _origClearColor = ctx.clearColor.bind(ctx);
        var _origClear = ctx.clear.bind(ctx);

        ctx.clearColor = function (r, g, b, a) {
          _savedClearColor = [r, g, b, a];
          return _origClearColor(r, g, b, a);
        };

        ctx.clear = function (mask) {
          var res = _origClear(mask);
          if (_gameReady && window._digibara_custom_room_bg && !_drawnThisFrame && (mask & 16384)) {
            var vp = ctx.getParameter(ctx.VIEWPORT);
            if (vp && vp[2] >= 300 && vp[3] >= 300) {
              _drawnThisFrame = true;
              try { drawCustomRoomBg(ctx); } catch (e) { console.warn(e); }
            }
          }
          return res;
        };
      }
      return ctx;
    };
  } catch (e) {}

  /* ═══════════════════════════════════════════════════════════════
     §0B BODY & ASSET ALIGNMENT ENGINE (Nudge & Real-Time Fixes)
     ═══════════════════════════════════════════════════════════════ */
  var _assetOffsets = {};
  try { _assetOffsets = JSON.parse(localStorage.getItem("dm_asset_offsets") || "{}"); } catch (e) {}
  var _anchorOffsets = {};
  try { _anchorOffsets = JSON.parse(localStorage.getItem("dm_anchor_offsets") || "{}"); } catch (e) {}

  var _cleanAssetCanvases = {};
  var _activeBodyTextures = {};
  var _allActiveTextures = [];
  var _loadedAssetImages = {};
  var _registeredSpriteKeys = {};
  var _currentNudgeStep = 5;
  var _activeAlignTarget = "dick_horny";

  var BODY_PART_DEFINITIONS = [
    { id: "dick_horny", name: "🍆 Dick (Horny / Erect)", group: "Genitalia", pattern: /dick_horny/i },
    { id: "dick_idle", name: "🍆 Dick (Idle)", group: "Genitalia", pattern: /dick_idle/i },
    { id: "dick_foreskin", name: "🍆 Dick Foreskin", group: "Genitalia", pattern: /dick_foreskin/i },
    { id: "balls_left", name: "🥚 Left Ball (Testicle)", group: "Genitalia", pattern: /balls_left/i },
    { id: "balls_right", name: "🥚 Right Ball (Testicle)", group: "Genitalia", pattern: /balls_right/i },

    { id: "belly_big", name: "🍈 Big Belly", group: "Torso & Rear", pattern: /belly_big/i },
    { id: "belly_small", name: "🍈 Small Belly", group: "Torso & Rear", pattern: /belly_small/i },
    { id: "body_idle", name: "👤 Body Base (Torso)", group: "Torso & Rear", pattern: /body_idle/i },
    { id: "butt_cheek_left", name: "🍑 Left Butt Cheek", group: "Torso & Rear", pattern: /butt_cheek_left/i },
    { id: "butt_cheek_right", name: "🍑 Right Butt Cheek", group: "Torso & Rear", pattern: /butt_cheek_right/i },
    { id: "butt_hole", name: "🕳 Butt Hole", group: "Torso & Rear", pattern: /butt_hole/i },
    { id: "butt_background", name: "🍑 Butt Background", group: "Torso & Rear", pattern: /butt_background/i },
    { id: "foot_idle", name: "🦶 Feet / Legs", group: "Torso & Rear", pattern: /foot_idle/i },

    { id: "eyes_horny", name: "👁 Eyes (Horny)", group: "Face", pattern: /eyes_horny/i },
    { id: "eyes_idle", name: "👁 Eyes (Idle)", group: "Face", pattern: /eyes_idle/i },
    { id: "mouth_idle", name: "👄 Mouth (Idle)", group: "Face", pattern: /mouth_idle/i },
    { id: "mouth_speak", name: "👄 Mouth (Speaking)", group: "Face", pattern: /mouth_speak/i },
    { id: "mouth_horny", name: "👄 Mouth (Horny)", group: "Face", pattern: /mouth_horny/i },
    { id: "mouth_tired", name: "👄 Mouth (Tired)", group: "Face", pattern: /mouth_tired/i },

    { id: "outfit", name: "👕 Main Outfit", group: "Outfits", pattern: /outfit(?:\.|\_1)/i },
    { id: "outfit_2", name: "👕 Outfit 2", group: "Outfits", pattern: /outfit_2/i },
    { id: "outfit_3", name: "👕 Outfit 3", group: "Outfits", pattern: /outfit_3/i },

    { id: "nipple_left_position", name: "🍼 Left Nipple / Milking Tube", group: "Attachments & Anchors", isAnchor: true, def: [370, 790] },
    { id: "nipple_right_position", name: "🍼 Right Nipple / Milking Tube", group: "Attachments & Anchors", isAnchor: true, def: [700, 790] },
    { id: "armpit_left_position", name: "💪 Left Armpit Suction", group: "Attachments & Anchors", isAnchor: true, def: [160, 789] },
    { id: "armpit_right_position", name: "💪 Right Armpit Suction", group: "Attachments & Anchors", isAnchor: true, def: [920, 789] },
    { id: "dick_top_position", name: "⚡ Dick Top / Dildos / Toys", group: "Attachments & Anchors", isAnchor: true, def: [210, 863] },
    { id: "mouth_center_position", name: "🎭 Mouth Center / Mask", group: "Attachments & Anchors", isAnchor: true, def: [550, 423] }
  ];

  function getMatchingDef(str) {
    if (!str) return null;
    for (var i = 0; i < BODY_PART_DEFINITIONS.length; i++) {
      var d = BODY_PART_DEFINITIONS[i];
      if (d.pattern && d.pattern.test(str)) return d;
      if (d.id === str) return d;
    }
    return null;
  }

  function getAssetOffset(keyOrPath) {
    if (_assetOffsets[keyOrPath]) return _assetOffsets[keyOrPath];
    var def = getMatchingDef(keyOrPath);
    if (def && _assetOffsets[def.id]) return _assetOffsets[def.id];
    return { x: 0, y: 0 };
  }

  function setAssetOffset(keyOrPath, off) {
    var def = getMatchingDef(keyOrPath);
    var id = def ? def.id : keyOrPath;
    _assetOffsets[id] = { x: off.x || 0, y: off.y || 0 };
    _assetOffsets[keyOrPath] = _assetOffsets[id];
  }

  function isAnchorId(id) {
    var def = getMatchingDef(id);
    return !!(def && def.isAnchor);
  }

  function getAnchorCoords(id) {
    if (_anchorOffsets[id]) return _anchorOffsets[id];
    var def = getMatchingDef(id);
    if (def && def.def) return [def.def[0], def.def[1]];
    return [0, 0];
  }

  function setAnchorCoords(id, coords) {
    _anchorOffsets[id] = [coords[0], coords[1]];
  }

  function getAlphaBBoxFromFlipped(pix, w, h) {
    var minX = w, maxX = 0, minY = h, maxY = 0;
    var found = false;
    for (var y = 0; y < h; y += 4) {
      var canvasY = h - 1 - y;
      var row = y * w * 4;
      for (var x = 0; x < w; x += 4) {
        if (pix[row + x * 4 + 3] > 20) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (canvasY < minY) minY = canvasY;
          if (canvasY > maxY) maxY = canvasY;
          found = true;
        }
      }
    }
    if (!found) return null;
    return { minX: minX, maxX: maxX, minY: minY, maxY: maxY };
  }

  function detectPartFromBBox(b) {
    if (!b) return null;
    var w = b.maxX - b.minX;
    var h = b.maxY - b.minY;
    var midY = (b.minY + b.maxY) / 2;
    var midX = (b.minX + b.maxX) / 2;

    if (w > 850 && h > 1100) return "body_idle";
    if (midY >= 800 && midY <= 1350 && w > 500 && b.minY > 750) return "belly_big";
    if (b.minY < 850 && b.maxY > 1350 && midX > 200 && midX < 700) return "dick_horny";
    if (b.minY >= 1150 && b.maxY <= 1650 && midX < 500 && w > 350) return "dick_idle";
    if (midX < 530 && midY > 1300 && midY < 1700 && w < 450) return "balls_left";
    if (midX >= 530 && midY > 1300 && midY < 1700 && w < 450) return "balls_right";
    if (midY < 420 && h < 350) return "eyes_horny";
    if (midY >= 440 && midY <= 530 && h < 60) return "mouth_idle";
    if (b.minX < 150 && midY < 1250) return "butt_cheek_left";
    if (b.maxX > 900 && midY < 1250) return "butt_cheek_right";
    if (midY > 750 && midY < 950 && w < 120) return "butt_hole";
    return null;
  }

  function copyFlippedPixels(src, dst, w, h) {
    for (var y = 0; y < h; y++) {
      var srcRow = (h - 1 - y) * w * 4;
      var dstRow = y * w * 4;
      for (var x = 0; x < w * 4; x++) {
        dst[dstRow + x] = src[srcRow + x];
      }
    }
  }

  function ensureTexturesInspected(gl) {
    if (!gl) return;
    for (var i = 0; i < _allActiveTextures.length; i++) {
      var tex = _allActiveTextures[i];
      if (!tex || tex._dm_inspected) continue;
      tex._dm_inspected = true;
      try {
        var fbo = gl.createFramebuffer();
        var prevFbo = gl.getParameter(gl.FRAMEBUFFER_BINDING);
        var prevTex = gl.getParameter(gl.TEXTURE_BINDING_2D);
        var prevVp = gl.getParameter(gl.VIEWPORT);

        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);

        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE) {
          var pix = new Uint8Array(1080 * 1920 * 4);
          gl.readPixels(0, 0, 1080, 1920, gl.RGBA, gl.UNSIGNED_BYTE, pix);
          var bbox = getAlphaBBoxFromFlipped(pix, 1080, 1920);
          if (bbox) {
            var part = detectPartFromBBox(bbox);
            if (part) {
              tex._dm_part = part;
              _activeBodyTextures[part] = tex;

              var c = document.createElement("canvas");
              c.width = 1080;
              c.height = 1920;
              var cctx = c.getContext("2d");
              var imgData = cctx.createImageData(1080, 1920);
              copyFlippedPixels(pix, imgData.data, 1080, 1920);
              cctx.putImageData(imgData, 0, 0);
              _cleanAssetCanvases[part] = c;

              var off = getAssetOffset(part);
              if (off && (off.x !== 0 || off.y !== 0)) {
                var shiftCanvas = document.createElement("canvas");
                shiftCanvas.width = 1080;
                shiftCanvas.height = 1920;
                var sctx = shiftCanvas.getContext("2d");
                sctx.drawImage(c, off.x, off.y);
                gl.bindTexture(gl.TEXTURE_2D, tex);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, shiftCanvas);
              }
            }
          }
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, prevFbo);
        gl.bindTexture(gl.TEXTURE_2D, prevTex);
        gl.viewport(prevVp[0], prevVp[1], prevVp[2], prevVp[3]);
        gl.deleteFramebuffer(fbo);
      } catch (err) {
        console.warn("[Alignment] inspectTexture error:", err);
      }
    }
    if (window._digibara_update_align_ui) {
      window._digibara_update_align_ui();
    }
  }

  function applyLiveTextureNudge(targetKey, off) {
    var gl = window._digibara_gl;
    if (!gl) {
      var cv = document.getElementById("canvas");
      if (cv) {
        gl = cv.getContext("webgl2") || cv.getContext("webgl");
        window._digibara_gl = gl;
        if (gl) hookGlContext(gl);
      }
    }
    if (!gl) return;

    ensureTexturesInspected(gl);

    var cleanCanvas = _cleanAssetCanvases[targetKey];
    var tex = _activeBodyTextures[targetKey];
    if (!cleanCanvas || !tex) {
      var def = getMatchingDef(targetKey);
      if (def) {
        cleanCanvas = _cleanAssetCanvases[def.id];
        tex = _activeBodyTextures[def.id];
      }
    }
    if (!cleanCanvas || !tex) return;

    var c = document.createElement("canvas");
    c.width = 1080;
    c.height = 1920;
    var ctx2d = c.getContext("2d");
    ctx2d.clearRect(0, 0, 1080, 1920);
    ctx2d.drawImage(cleanCanvas, off.x || 0, off.y || 0);

    var prevTex = gl.getParameter(gl.TEXTURE_BINDING_2D);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
    if (prevTex) gl.bindTexture(gl.TEXTURE_2D, prevTex);
  }

  function hookGlContext(ctx) {
    if (!ctx || ctx._dm_aligned_hooked) return;
    ctx._dm_aligned_hooked = true;

    var _origBindTexture = ctx.bindTexture.bind(ctx);
    ctx.bindTexture = function (target, tex) {
      if (target === ctx.TEXTURE_2D && tex && !tex._dm_tracked) {
        tex._dm_tracked = true;
        _allActiveTextures.push(tex);
        if (_allActiveTextures.length > 50) _allActiveTextures.shift();
      }
      return _origBindTexture(target, tex);
    };

    var _origTexImage2D = ctx.texImage2D.bind(ctx);
    ctx.texImage2D = function () {
      var res = _origTexImage2D.apply(ctx, arguments);
      try {
        if (arguments.length >= 9) {
          var target = arguments[0];
          var w = arguments[3];
          var h = arguments[4];
          if (target === ctx.TEXTURE_2D && w === 1080 && h === 1920) {
            var boundTex = ctx.getParameter(ctx.TEXTURE_BINDING_2D);
            if (boundTex && !boundTex._dm_tracked) {
              boundTex._dm_tracked = true;
              _allActiveTextures.push(boundTex);
            }
          }
        }
      } catch (ex) {}
      return res;
    };

    setInterval(function () {
      if (window._digibara_gl) {
        ensureTexturesInspected(window._digibara_gl);
      }
    }, 800);
  }

  // Intercept FS_createDataFile in Module
  try {
    window.Module = window.Module || {};
    var _savedFS_createDataFile = window.Module.FS_createDataFile;
    function wrapFSCreateDataFile(fn) {
      return function (parent, name, data, canRead, canWrite, canOwn) {
        try {
          var fullPath = (parent ? parent + "/" : "") + (name || "");
          var def = getMatchingDef(fullPath);
          if (def && data && data.length) {
            var off = getAssetOffset(def.id);
            if (off && (off.x !== 0 || off.y !== 0)) {
              // Preload shifted image asynchronously for next render
            }
          }
        } catch (e) {}
        return fn ? fn.apply(this, arguments) : null;
      };
    }
    if (_savedFS_createDataFile) {
      window.Module.FS_createDataFile = wrapFSCreateDataFile(_savedFS_createDataFile);
    } else {
      Object.defineProperty(window.Module, "FS_createDataFile", {
        configurable: true,
        enumerable: true,
        get: function () { return _savedFS_createDataFile; },
        set: function (fn) { _savedFS_createDataFile = wrapFSCreateDataFile(fn); }
      });
    }
  } catch (e) {}

  /* ═══════════════════════════════════════════════════════════════
     §1  VIRTUAL CLOCK (Game Speed Multiplier)
     ═══════════════════════════════════════════════════════════════ */
  var RealDate = Date;
  var realNow  = RealDate.now.bind(RealDate);
  var CLOCK_KEY = "digibara_mods_clock";

  var _st = null;
  try { _st = JSON.parse(localStorage.getItem(CLOCK_KEY) || "null"); } catch (e) {}

  var t0    = realNow();
  var speed = 1;
  var base;
  if (_st && typeof _st.virt === "number" && typeof _st.real === "number") {
    speed = _st.speed > 0 ? _st.speed : 1;
    base  = _st.virt + Math.max(0, t0 - _st.real);
  } else {
    base = t0;
  }
  var anchorReal = t0, anchorVirt = base;

  function virt() { return anchorVirt + (realNow() - anchorReal) * speed; }
  function saveClock() {
    try { localStorage.setItem(CLOCK_KEY, JSON.stringify({ real: realNow(), virt: virt(), speed: speed })); } catch (e) {}
  }
  function setSpeed(s) { anchorVirt = virt(); anchorReal = realNow(); speed = s; saveClock(); }

  function FakeDate() {
    var a = arguments;
    if (!(this instanceof FakeDate)) return new RealDate(virt()).toString();
    if (a.length === 0) return new RealDate(Math.floor(virt()));
    if (a.length === 1) return new RealDate(a[0]);
    return new RealDate(a[0], a[1], a[2] === undefined ? 1 : a[2],
      a[3] || 0, a[4] || 0, a[5] || 0, a[6] || 0);
  }
  FakeDate.prototype = RealDate.prototype;
  FakeDate.now   = function () { return Math.floor(virt()); };
  FakeDate.UTC   = RealDate.UTC;
  FakeDate.parse = RealDate.parse;
  window.Date = FakeDate;
  setInterval(saveClock, 1000);
  window.addEventListener("beforeunload", saveClock);


  /* ═══════════════════════════════════════════════════════════════
     §2  CONFIG & CONSTANTS
     ═══════════════════════════════════════════════════════════════ */
  var cfg = {
    level_mult:         1.0,
    game_speed:         1,
    unlock_patreon:     true,
    inf_money:          false,
    inf_tank:           false,
    no_offline_penalty: false,
    max_stats:          false,
    remove_char_limit:  true
  };

  var OFFICIAL_CHARACTERS = [
    { id: "d44_sager",           name: "Sager (d44_sager)" },
    { id: "g00meva_theguy",      name: "The Guy (g00meva_theguy)" },
    { id: "konguipeach_himboy",  name: "Himboy (konguipeach_himboy)" },
    { id: "krok_matt",           name: "Matt (krok_matt)" },
    { id: "mead_marvin",         name: "Marvin (mead_marvin)" },
    { id: "pintplows_pint",      name: "Pint (pintplows_pint)" },
    { id: "rikki_jack",          name: "Jack (rikki_jack)" },
    { id: "rikki_jack_fat",      name: "Jack Fat (rikki_jack_fat)" },
    { id: "shamieroe_captain",   name: "Captain (shamieroe_captain)" },
    { id: "thebluemon_ignacio",  name: "Ignacio (thebluemon_ignacio)" }
  ];


  /* ═══════════════════════════════════════════════════════════════
     §3  AIRTIGHT PATREON BYPASS
     ═══════════════════════════════════════════════════════════════ */
  var PATREON_HOST = "digibara-patreon.digibara.workers.dev";

  function strToBuffer(str) {
    if (typeof TextEncoder !== "undefined") {
      return new TextEncoder().encode(str).buffer;
    }
    var buf = new ArrayBuffer(str.length);
    var u8 = new Uint8Array(buf);
    for (var i = 0; i < str.length; i++) u8[i] = str.charCodeAt(i) & 0xff;
    return buf;
  }

  function fakePatreonJSON() {
    var future = new RealDate(realNow() + 3650 * 86400 * 1000).toISOString().slice(0, 10);
    return JSON.stringify({
      ok:                    true,
      found:                 true,
      match:                 true,
      valid:                 true,
      status:                "active",
      tier:                  "digibara_premium_plus",
      premium_tier:          "digibara_premium_plus",
      name:                  "DigiBara VIP",
      email:                 "patreon@digibara.mod",
      next_charge_date:      future,
      patreon_next_charge_date: future,
      linked_at:             "2024-01-01",
      digibara_premium:      true,
      digibara_premium_plus: true,
      is_premium:            true,
      is_premium_plus:       true
    });
  }

  function isPatreonReq(url) {
    if (!url) return false;
    var s = String(url);
    return s.indexOf(PATREON_HOST) >= 0 || s.indexOf("mode=validate") >= 0;
  }

  /* A. Intercept window.fetch() */
  var _origFetch = (typeof window.fetch === "function") ? window.fetch.bind(window) : null;
  window.fetch = function (input, init) {
    var url = (input && typeof input === "object" && input.url) ? input.url : String(input);
    if (isPatreonReq(url)) {
      var fakeStr = fakePatreonJSON();
      return Promise.resolve(new Response(fakeStr, {
        status: 200,
        statusText: "OK",
        headers: { "Content-Type": "application/json" }
      }));
    }
    return _origFetch ? _origFetch(input, init) : Promise.reject(new Error("fetch failed"));
  };

  /* B. Intercept window.XMLHttpRequest by answering Patreon requests directly in memory */
  var _origOpen = XMLHttpRequest.prototype.open;
  var _origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) {
    this._isPatreon = isPatreonReq(url);
    if (this._isPatreon) {
      this._patreonMethod = method;
      this._patreonUrl = url;
    }
    return _origOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function (data) {
    if (this._isPatreon) {
      var self = this;
      var text = fakePatreonJSON();
      var buf = strToBuffer(text);
      setTimeout(function () {
        try {
          Object.defineProperty(self, "readyState", { value: 4, configurable: true });
          Object.defineProperty(self, "status", { value: 200, configurable: true });
          Object.defineProperty(self, "statusText", { value: "OK", configurable: true });
          Object.defineProperty(self, "responseText", { value: text, configurable: true });
          Object.defineProperty(self, "response", {
            get: function () {
              return self.responseType === "arraybuffer" ? buf : text;
            },
            configurable: true
          });
          if (typeof self.onreadystatechange === "function") self.onreadystatechange();
          if (typeof self.onload === "function") self.onload();
          self.dispatchEvent(new Event("readystatechange"));
          self.dispatchEvent(new Event("load"));
          self.dispatchEvent(new Event("loadend"));
        } catch (err) {}
      }, 0);
      return;
    }
    return _origSend.apply(this, arguments);
  };

  /* C. Write a file to Emscripten FS and IndexedDB savedata store */
  function writeToSavedata(filename, u8Bytes) {
    if (typeof u8Bytes === "string") u8Bytes = enc.encode(u8Bytes);
    var bytes = u8Bytes;

    var filenames = [filename];
    if (filename === "savegame.save") {
      filenames.push("savegame.save.bak");
    }

    // 1. Try Emscripten FS if available
    try {
      var FS = window.FS || (window.Module && window.Module.FS);
      if (FS && typeof FS.writeFile === "function") {
        for (var i = 0; i < filenames.length; i++) {
          var fn = filenames[i];
          try { FS.writeFile("/_savedata/" + fn, bytes); } catch (e) {}
          try { FS.writeFile("/" + fn, bytes); } catch (e) {}
          try { FS.writeFile(fn, bytes); } catch (e) {}
        }
        if (typeof FS.syncfs === "function") {
          try { FS.syncfs(false, function () {}); } catch (e) {}
        }
      }
    } catch (e) {}

    // 2. Write directly to IndexedDB
    try {
      if (typeof indexedDB === "undefined") return;
      var openReq = indexedDB.open("/_savedata"); // open existing DB
      openReq.onupgradeneeded = function (ev) {
        var db2 = ev.target.result;
        if (!db2.objectStoreNames.contains("FILE_DATA")) {
          var st2 = db2.createObjectStore("FILE_DATA");
          st2.createIndex("timestamp", "timestamp", { unique: false });
        }
      };
      openReq.onsuccess = function (ev) {
        var db = ev.target.result;
        try {
          if (!db.objectStoreNames.contains("FILE_DATA")) {
            db.close();
            return;
          }
          var tx = db.transaction(["FILE_DATA"], "readwrite");
          var st = tx.objectStore("FILE_DATA");
          for (var i = 0; i < filenames.length; i++) {
            var fn = filenames[i];
            var record = { timestamp: new RealDate(), mode: 33206, contents: bytes };
            st.put(record, "/_savedata/" + fn);
          }
          tx.oncomplete = function () { db.close(); };
          tx.onerror = function () { db.close(); };
        } catch (ex) { try { db.close(); } catch (e2) {} }
      };
      openReq.onerror = function () {};
    } catch (e) {}
  }

  function readFromSavedata(filename) {
    // 1. Try in-memory FS first (fastest, always prefer this)
    try {
      var FS = window.FS || (window.Module && window.Module.FS);
      if (FS && typeof FS.readFile === "function") {
        var paths = ["/_savedata/" + filename, "/" + filename, filename];
        for (var i = 0; i < paths.length; i++) {
          try {
            var d = FS.readFile(paths[i]);
            if (d && d.length) return Promise.resolve(d);
          } catch (e) {}
        }
      }
    } catch (e) {}

    // 2. Fallback to IndexedDB (version-agnostic open to match game's DB)
    return new Promise(function (resolve, reject) {
      if (typeof indexedDB === "undefined") {
        reject(new Error("IndexedDB not available"));
        return;
      }
      var req = indexedDB.open("/_savedata"); // no version — open existing DB as-is
      req.onupgradeneeded = function () {}; // no-op: don't alter DB structure
      req.onsuccess = function (ev) {
        var db = ev.target.result;
        try {
          if (!db.objectStoreNames.contains("FILE_DATA")) {
            db.close();
            reject(new Error("No save data found. Start the game first, then try again!"));
            return;
          }
          var tx = db.transaction(["FILE_DATA"], "readonly");
          var st = tx.objectStore("FILE_DATA");
          var getReq = st.get("/_savedata/" + filename);
          getReq.onsuccess = function (gev) {
            var res = gev.target.result;
            db.close();
            if (res && res.contents && res.contents.length) {
              resolve(res.contents);
            } else {
              reject(new Error("Save file not found in browser storage. Play the game first!"));
            }
          };
          getReq.onerror = function () { db.close(); reject(new Error("Failed to read from IndexedDB")); };
        } catch (err) {
          try { db.close(); } catch (e2) {}
          reject(err);
        }
      };
      req.onerror = function () { reject(new Error("Could not open browser save database")); };
    });
  }

  function ensurePatreonOnDisk() {
    var creds = fakePatreonJSON();
    writeToSavedata("patreon_link.save", creds);
  }

  // Emscripten uses Module.preRun / Module.postRun as ARRAYS (push callbacks).
  // We support both: if it's already an array, push; if a function, wrap.
  window.Module = window.Module || {};

  if (Array.isArray(window.Module.preRun)) {
    window.Module.preRun.push(ensurePatreonOnDisk);
  } else {
    var _prevPreRun = window.Module.preRun;
    window.Module.preRun = [];
    if (typeof _prevPreRun === "function") window.Module.preRun.push(_prevPreRun);
    window.Module.preRun.push(ensurePatreonOnDisk);
  }

  if (Array.isArray(window.Module.postRun)) {
    window.Module.postRun.push(ensurePatreonOnDisk);
  } else {
    var _prevPostRun = window.Module.postRun;
    window.Module.postRun = [];
    if (typeof _prevPostRun === "function") window.Module.postRun.push(_prevPostRun);
    window.Module.postRun.push(ensurePatreonOnDisk);
  }


  // Run immediately and retry for up to 30 seconds to ensure patreon is written
  // after Emscripten's IDBFS has initialised.
  setTimeout(ensurePatreonOnDisk,  500);
  setTimeout(ensurePatreonOnDisk, 2000);
  setTimeout(ensurePatreonOnDisk, 5000);
  setTimeout(ensurePatreonOnDisk, 10000);



  setTimeout(ensurePatreonOnDisk, 20000);
  setTimeout(ensurePatreonOnDisk, 30000);
  // Also re-write every 60s to keep it fresh
  setInterval(ensurePatreonOnDisk, 60000);


  /* ═══════════════════════════════════════════════════════════════
     §4  SAVE TOOLS (Encode / Decode / Multi-File Zip / CRC)
     ═══════════════════════════════════════════════════════════════ */
  var SAVE_KEY_STR = "justb9232";
  var enc = new TextEncoder(), dec = new TextDecoder();

  function xorBytes(u8) {
    var out = new Uint8Array(u8.length);
    for (var i = 0; i < u8.length; i++)
      out[i] = u8[i] ^ SAVE_KEY_STR.charCodeAt(i % SAVE_KEY_STR.length);
    return out;
  }
  function b64ToBytes(str) {
    var cleaned = str.replace(/[^A-Za-z0-9+/=]/g, "");
    var pad = (-cleaned.length) % 4;
    if (pad < 0) pad += 4;
    cleaned += "=".repeat(pad);
    var bin = atob(cleaned), u = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u;
  }
  function bytesToB64(u8) {
    var s = "", CH = 1024;
    for (var i = 0; i < u8.length; i += CH)
      s += String.fromCharCode.apply(null, u8.subarray(i, Math.min(i + CH, u8.length)));
    return btoa(s);
  }
  function decodeSave(u8) {
    var text = dec.decode(u8).replace(/\0+$/, "").trim();
    if (text.indexOf("ENC1|") === 0) {
      var plain = xorBytes(b64ToBytes(text.slice(5)));
      return JSON.parse(dec.decode(plain));
    }
    return JSON.parse(text);
  }
  function encodeSave(obj) {
    var plain = enc.encode(JSON.stringify(obj));
    return enc.encode("ENC1|" + bytesToB64(xorBytes(plain)));
  }

  var _crcTable = null;
  function crc32(u8) {
    if (!_crcTable) {
      _crcTable = new Uint32Array(256);
      for (var n = 0; n < 256; n++) {
        var c = n;
        for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        _crcTable[n] = c >>> 0;
      }
    }
    var crc = 0xFFFFFFFF;
    for (var i = 0; i < u8.length; i++) crc = _crcTable[(crc ^ u8[i]) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  /* Multi-file standard ZIP builder (Method 0 = Store, fully GameMaker compatible) */
  function makeZipFiles(files) {
    var parts = [];
    var cdParts = [];
    var offset = 0;
    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      var nm = enc.encode(f.name);
      var d = f.data;
      var crc = crc32(d);
      var sz = d.length;

      var lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true);
      lh.setUint16(4, 20, true);
      lh.setUint16(6, 0, true);
      lh.setUint16(8, 0, true);  // Method 0: Store
      lh.setUint16(10, 0, true);
      lh.setUint16(12, 0, true);
      lh.setUint32(14, crc, true);
      lh.setUint32(18, sz, true);
      lh.setUint32(22, sz, true);
      lh.setUint16(26, nm.length, true);
      lh.setUint16(28, 0, true);

      parts.push(new Uint8Array(lh.buffer), nm, d);

      var ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true);
      ch.setUint16(4, 20, true);
      ch.setUint16(6, 20, true);
      ch.setUint16(8, 0, true);
      ch.setUint16(10, 0, true); // Method 0: Store
      ch.setUint16(12, 0, true);
      ch.setUint16(14, 0, true);
      ch.setUint32(16, crc, true);
      ch.setUint32(20, sz, true);
      ch.setUint32(24, sz, true);
      ch.setUint16(28, nm.length, true);
      ch.setUint16(30, 0, true);
      ch.setUint16(32, 0, true);
      ch.setUint16(34, 0, true);
      ch.setUint16(36, 0, true);
      ch.setUint32(38, 0, true);
      ch.setUint32(42, offset, true);

      cdParts.push(new Uint8Array(ch.buffer), nm);
      offset += 30 + nm.length + sz;
    }

    var cdOffset = offset;
    var cdLen = cdParts.reduce(function (acc, p) { return acc + p.length; }, 0);

    var eocd = new DataView(new ArrayBuffer(22));
    eocd.setUint32(0, 0x06054b50, true);
    eocd.setUint16(4, 0, true);
    eocd.setUint16(6, 0, true);
    eocd.setUint16(8, files.length, true);
    eocd.setUint16(10, files.length, true);
    eocd.setUint32(12, cdLen, true);
    eocd.setUint32(16, cdOffset, true);
    eocd.setUint16(20, 0, true);

    var all = [].concat(parts, cdParts, [new Uint8Array(eocd.buffer)]);
    var totalLen = all.reduce(function (acc, p) { return acc + p.length; }, 0);
    var out = new Uint8Array(totalLen);
    var o = 0;
    for (var j = 0; j < all.length; j++) {
      out.set(all[j], o);
      o += all[j].length;
    }
    return out;
  }

  /* Parse a ZIP file and return a map of { [filename]: Uint8Array } */
  function readZipEntries(u8) {
    var dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), e = -1;
    for (var i = u8.length - 22; i >= 0 && i > u8.length - 70000; i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { e = i; break; }
    }
    if (e < 0) return Promise.reject(new Error("Not a valid zip file."));
    var count = dv.getUint16(e + 10, true), p = dv.getUint32(e + 16, true);
    var entries = [];
    for (var n = 0; n < count; n++) {
      var method = dv.getUint16(p + 10, true);
      var csize  = dv.getUint32(p + 20, true);
      var nl     = dv.getUint16(p + 28, true);
      var el     = dv.getUint16(p + 30, true);
      var cl     = dv.getUint16(p + 32, true);
      var lho    = dv.getUint32(p + 42, true);
      var nm     = dec.decode(u8.subarray(p + 46, p + 46 + nl));
      entries.push({ name: nm, method: method, csize: csize, lho: lho });
      p += 46 + nl + el + cl;
    }

    var resultMap = {};
    var chain = Promise.resolve();
    entries.forEach(function (ent) {
      chain = chain.then(function () {
        var lnl = dv.getUint16(ent.lho + 26, true);
        var lel = dv.getUint16(ent.lho + 28, true);
        var start = ent.lho + 30 + lnl + lel;
        var raw = u8.slice(start, start + ent.csize);
        if (ent.method === 0) {
          resultMap[ent.name] = raw;
          return Promise.resolve();
        }
        if (ent.method === 8 && typeof DecompressionStream !== "undefined") {
          var stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
          return new Response(stream).arrayBuffer().then(function (ab) {
            resultMap[ent.name] = new Uint8Array(ab);
          });
        }
        return Promise.resolve();
      });
    });

    return chain.then(function () { return resultMap; });
  }

  function levelThreshold(L, m) { var k = L - 1; return m * (0.1 * k + 0.115 * k * (k - 1) / 2); }
  function levelFromMilk(milk, m) {
    var L = 1;
    while (L < 999 && levelThreshold(L + 1, m) <= milk + 1e-9) L++;
    return L;
  }

  function dlFile(name, bytes, type) {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([bytes], { type: type }));
    a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }


  /* ═══════════════════════════════════════════════════════════════
     §5  SAVE EDITOR
     ═══════════════════════════════════════════════════════════════ */

  function stampPatreon(obj) {
    if (!obj || typeof obj !== "object") return obj;
    var future = new RealDate(realNow() + 3650 * 86400 * 1000).toISOString().slice(0, 10);
    obj.digibara_premium             = true;
    obj.digibara_premium_plus        = true;
    obj.is_premium                   = true;
    obj.is_premium_plus              = true;
    obj.premium_tier                 = "digibara_premium_plus";
    obj.tier                         = "digibara_premium_plus";
    obj.patreon_rewarded_charge_date = future;
    obj.patreon_next_charge_date     = future;
    obj.last_patreon_daily_claim     = future;
    obj.email                        = "patreon@digibara.mod";
    obj.linked_at                    = "2024-01-01";
    obj.match                        = true;
    // Ensure save version is current so game doesn't reject as "newer"
    if (!obj.save_game_version) obj.save_game_version = "2026.0.0.23";
    return obj;
  }

  function stampCharUnlock(c) {
    if (!c || typeof c !== "object") return c;
    c.unlocked = true;
    c.is_premium = true;
    c.is_premium_plus = true;
    c.premium_character = true;
    c.unlocked_modules = [true, true, true, true, true, true, true, true, true, true,
                          true, true, true, true, true, true, true, true, true, true];
    var outfits = [];
    for (var i = 0; i < 200; i++) outfits.push(i);
    c.unlocked_clothes_index = outfits;
    return c;
  }

  function initDefaultChar(cid) {
    var outfits = [];
    for (var i = 0; i < 200; i++) outfits.push(i);
    return {
      unlocked: true,
      imported: false,
      is_premium: true,
      is_premium_plus: true,
      premium_character: true,
      total_milk_produced: 100,
      current_milk_produced: 0,
      tank_size: 50,
      energy: 100,
      satiety: 100,
      hygiene: 100,
      horny: 100,
      stamina: 20,
      strength: 20,
      lactation: 20,
      weight: 70,
      unlocked_modules: [true, true, true, true, true, true, true, true, true, true,
                         true, true, true, true, true, true, true, true, true, true],
      unlocked_clothes_index: outfits
    };
  }

  function openSaveEditor() {
    var old = document.getElementById("dm-se");
    if (old) { old.remove(); return; }

    var box = document.createElement("div");
    box.id = "dm-se";

    /* Stop keyboard events from being captured or cancelled by GameMaker.
       We intercept at DOCUMENT level (capture phase) so we beat any listener
       GameMaker attached to document/window/canvas. */
    function stopKey(e) {
      // Only block when focus is inside our Save Editor box
      if (!box.contains(document.activeElement) && e.target !== box) return;
      e.stopPropagation();
      if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();
    }
    document.addEventListener("keydown",  stopKey, true);
    document.addEventListener("keyup",    stopKey, true);
    document.addEventListener("keypress", stopKey, true);
    box.addEventListener("keydown",  stopKey, true);
    box.addEventListener("keyup",    stopKey, true);
    box.addEventListener("keypress", stopKey, true);
    // Clean up listeners when box is removed
    var _origRemove = box.remove.bind(box);
    box.remove = function () {
      document.removeEventListener("keydown",  stopKey, true);
      document.removeEventListener("keyup",    stopKey, true);
      document.removeEventListener("keypress", stopKey, true);
      _origRemove();
    };

    document.body.appendChild(box);

    var data = null;
    var extraZipFiles = {};

    function numField(id, label, val, note, quickBtns) {
      var btnsHtml = "";
      if (quickBtns && quickBtns.length) {
        btnsHtml = "<div class='dm-quick-btns'>" + quickBtns.map(function (b) {
          return "<button type='button' class='dm-btn-quick' data-target='" + id + "' data-mode='" + (b.mode || "set") + "' data-val='" + b.val + "'>" + b.label + "</button>";
        }).join("") + "</div>";
      }
      return "<div class='dm-field-group'>" +
        "<div class='dm-field-header'><label for='" + id + "'>" + label + "</label>" + btnsHtml + "</div>" +
        "<input type='number' step='any' id='" + id + "' value='" + (+val || 0) + "'>" +
        (note ? "<small>" + note + "</small>" : "") +
        "</div>";
    }

    function toggle(id, label, checked) {
      return "<label class='dm-toggle-label'><input type='checkbox' id='" + id + "'" + (checked ? " checked" : "") + "> " + label + "</label>";
    }

    function setMsg(txt, cls) {
      var m = box.querySelector("#dm-se-msg");
      if (!m) return;
      m.className = "dm-msg dm-msg-" + (cls || "info");
      m.textContent = txt;
    }

    function wireQuickButtons() {
      box.querySelectorAll(".dm-btn-quick").forEach(function (btn) {
        btn.onclick = function () {
          var targetId = btn.getAttribute("data-target");
          var input = box.querySelector("#" + targetId);
          if (!input) return;
          var val = parseFloat(btn.getAttribute("data-val"));
          var mode = btn.getAttribute("data-mode");
          if (mode === "add") {
            input.value = (parseFloat(input.value) || 0) + val;
          } else {
            input.value = val;
          }
          input.dispatchEvent(new Event("input", { bubbles: true }));
        };
      });
    }

    function renderHead() {
      box.innerHTML =
        "<div class='dm-se-title-bar'>" +
        "  <h3>💾 DigiBara Save Editor &amp; Unlocker</h3>" +
        "  <button id='dm-se-close' class='dm-btn-se-close'>✕</button>" +
        "</div>" +
        "<p class='dm-note'>Edit your save directly or offline.<br>" +
        "⚡ <strong>Direct:</strong> Click 'Load In-Game Save' &nbsp;→&nbsp; Edit &amp; Unlock &nbsp;→&nbsp; Click 'Apply Directly to Live Game'!<br>" +
        "📁 <strong>Offline:</strong> Or select an exported backup .zip / .save below.</p>" +
        "<div class='dm-file-box'>" +
        "  <div style='display:flex;gap:8px;margin-bottom:8px;align-items:center'>" +
        "    <button type='button' id='se-load-live' class='dm-btn-se dm-btn-se-primary' style='flex:1;padding:8px 12px'>⚡ Load In-Game Save (Live)</button>" +
        "  </div>" +
        "  <input id='dm-se-file' type='file' accept='.zip,.save'>" +
        "</div>" +
        "<div id='dm-se-msg'></div>" +
        "<div id='dm-se-tabs'></div>" +
        "<div id='dm-se-body'></div>";

      box.querySelector("#dm-se-close").onclick = function () { box.remove(); };

      // Live Load from Browser Storage / Emscripten FS
      box.querySelector("#se-load-live").onclick = function () {
        setMsg("Loading current save from browser storage…", "info");
        readFromSavedata("savegame.save").then(function (bytes) {
          var o = decodeSave(bytes);
          if (!o || typeof o !== "object" || !o.characters_data)
            throw new Error("Invalid DigiBara save structure.");
          data = o;
          setMsg("✓ Live in-game save loaded successfully! Edit values or unlock characters, then click 'Apply Directly'.", "ok");
          renderTabs("unlock");
        }).catch(function (err) {
          setMsg("✗ " + err.message, "err");
        });
      };

      // File input
      box.querySelector("#dm-se-file").onchange = function (ev) {
        var f = ev.target.files[0]; if (!f) return;
        setMsg("Loading save file…", "info");
        extraZipFiles = {};
        f.arrayBuffer().then(function (buf) {
          var u8 = new Uint8Array(buf);
          var isZip = u8[0] === 0x50 && u8[1] === 0x4b;
          if (isZip) {
            return readZipEntries(u8).then(function (files) {
              extraZipFiles = files;
              var saveKey = null;
              Object.keys(files).forEach(function (k) {
                if (/savegame\.save$/.test(k) || (!saveKey && /\.save$/.test(k))) saveKey = k;
              });
              if (!saveKey) throw new Error("No savegame.save file found inside the zip.");
              return decodeSave(files[saveKey]);
            });
          } else {
            return decodeSave(u8);
          }
        }).then(function (o) {
          if (!o || typeof o !== "object" || !o.characters_data)
            throw new Error("Invalid DigiBara save file format.");
          data = o;
          setMsg("✓ Save loaded successfully! You can now freely edit values, type numbers, and unlock everything.", "ok");
          renderTabs("unlock");
        }).catch(function (e) {
          data = null;
          setMsg("✗ " + e.message, "err");
          box.querySelector("#dm-se-body").innerHTML = "";
          box.querySelector("#dm-se-tabs").innerHTML = "";
        });
      };
    }

    var activeTab = "unlock";
    function renderTabs(tab) {
      activeTab = tab;
      var chars = Object.keys(data.characters_data || {});
      var tabBar = box.querySelector("#dm-se-tabs");
      var tabs = [
        { id: "unlock",  label: "🔓 Master Unlockers" },
        { id: "global",  label: "💰 Economy &amp; Global" },
        { id: "chars",   label: "👥 Characters (" + chars.length + ")" },
        { id: "raw",     label: "📜 Raw JSON" }
      ];
      tabBar.innerHTML = tabs.map(function (t) {
        return "<button type='button' class='dm-tab" + (t.id === activeTab ? " dm-tab-active" : "") + "' data-tab='" + t.id + "'>" + t.label + "</button>";
      }).join("");

      tabBar.querySelectorAll(".dm-tab").forEach(function (btn) {
        btn.onclick = function () {
          collectCurrentTab();
          renderTabs(btn.getAttribute("data-tab"));
        };
      });

      if (activeTab === "unlock") renderUnlock();
      else if (activeTab === "global") renderGlobal();
      else if (activeTab === "chars") renderCharsView();
      else if (activeTab === "raw") renderRawView();
    }

    function dlButtons() {
      return "<div class='dm-download-section'>" +
        "<div class='dm-btn-row'>" +
        "<button type='button' id='se-apply-live' class='dm-btn-se dm-btn-se-primary' style='background:linear-gradient(135deg,#059669,#10b981);font-weight:700'>⚡ Apply Directly to Live Game &amp; Save</button>" +
        "<button type='button' id='se-dl-zip' class='dm-btn-se dm-btn-se-secondary'>⬇ Download .zip Backup</button>" +
        "<button type='button' id='se-dl-save' class='dm-btn-se dm-btn-se-secondary'>⬇ Download .save Only</button>" +
        "</div>" +
        "<small style='display:block;margin-top:8px;color:var(--dm-muted);line-height:1.4'>" +
        "<strong>'Apply Directly':</strong> Saves straight into browser memory &amp; storage without needing manual in-game restore.<br>" +
        "<strong>'Download .zip':</strong> Creates a clean, safe backup that imports perfectly in-game without resetting defaults." +
        "</small>" +
        "</div>";
    }

    function wireDl(collectFn) {
      var liveBtn = box.querySelector("#se-apply-live");
      var zipBtn  = box.querySelector("#se-dl-zip");
      var saveBtn = box.querySelector("#se-dl-save");

      if (liveBtn) {
        liveBtn.onclick = function () {
          if (collectFn) collectFn();
          stampPatreon(data);
          var saveBytes = encodeSave(data);
          // Write to both FS and IndexedDB (both savegame.save and savegame.save.bak)
          writeToSavedata("savegame.save", saveBytes);
          ensurePatreonOnDisk();
          try {
            var FS2 = window.FS || (window.Module && window.Module.FS);
            if (FS2 && typeof FS2.syncfs === "function") {
              FS2.syncfs(false, function () {});
            }
          } catch (e) {}
          setMsg("✓ Saved to storage! Reloading in 1.2s so changes apply cleanly...", "ok");
          setTimeout(function () {
            window.location.reload();
          }, 1200);
        };
      }

      if (zipBtn) {
        zipBtn.onclick = function () {
          if (collectFn) collectFn();
          stampPatreon(data);
          var saveBytes = encodeSave(data);
          var zipList = [];
          Object.keys(extraZipFiles).forEach(function (fname) {
            // NEVER put patreon_link.save inside the backup zip — it confuses GameMaker's save finder!
            if (fname !== "savegame.save" && fname !== "patreon_link.save") {
              zipList.push({ name: fname, data: extraZipFiles[fname] });
            }
          });
          zipList.unshift({ name: "savegame.save", data: saveBytes });
          dlFile("digibara_save_backup.zip", makeZipFiles(zipList), "application/zip");
          setMsg("✓ Downloaded clean digibara_save_backup.zip! Safe to import in-game via Settings → Restore.", "ok");
        };
      }

      if (saveBtn) {
        saveBtn.onclick = function () {
          if (collectFn) collectFn();
          stampPatreon(data);
          dlFile("savegame.save", encodeSave(data), "application/octet-stream");
          setMsg("✓ Downloaded savegame.save!", "ok");
        };
      }
    }

    function collectCurrentTab() {
      if (!data) return;
      if (activeTab === "global") collectGlobal();
      else if (activeTab === "chars") collectCurrentChar();
    }

    /* ── TAB 1: MASTER UNLOCKERS ── */
    function renderUnlock() {
      var f = box.querySelector("#dm-se-body");
      var chars = Object.keys(data.characters_data || {});
      f.innerHTML =
        "<div class='se-god-card'>" +
        "  <div style='font-size:16px;font-weight:700;color:var(--dm-gold)'>🌟 1-Click Master Unlock</div>" +
        "  <p style='font-size:12px;margin:4px 0 10px;color:var(--dm-text)'>Unlocks ALL official characters, all outfits, all modules, stamps Patreon VIP Plus flags, maxes stats, and gives 999 Gacha tickets &amp; $10,000,000.</p>" +
        "  <button type='button' id='se-god-mode' class='dm-btn-se dm-btn-se-primary' style='width:100%;padding:10px'>✨ UNLOCK EVERYTHING (God Mode)</button>" +
        "</div>" +

        "<div class='se-section-title' style='margin-top:14px'>👑 Patreon / VIP Plus Unlock</div>" +
        "<p style='font-size:12px;color:var(--dm-muted);margin:0 0 8px'>Stamps digibara_premium, digibara_premium_plus, enables the Global Management Screen, and removes all import limits.</p>" +
        "<button type='button' id='se-stamp-patreon' class='dm-btn-se dm-btn-se-secondary'>⚡ Stamp All Patreon VIP Flags</button>" +

        "<div class='se-section-title' style='margin-top:16px'>👥 Character Unlockers</div>" +
        "<div class='dm-btn-row' style='margin-bottom:10px'>" +
        "  <button type='button' id='se-unlock-all-chars' class='dm-btn-se dm-btn-se-primary'>🔓 Unlock ALL Official &amp; Custom Characters</button>" +
        "  <button type='button' id='se-unlock-outfits-modules' class='dm-btn-se dm-btn-se-secondary'>👗 Unlock ALL Outfits &amp; Modules (0-199)</button>" +
        "</div>" +

        "<div class='dm-char-grid-unlock'>" +
        OFFICIAL_CHARACTERS.map(function (oc) {
          var cd = data.characters_data[oc.id];
          var isUnlocked = !!(cd && cd.unlocked);
          return "<div class='dm-unlock-row'>" +
            "<div class='dm-unlock-info'>" +
            "  <strong>" + oc.name + "</strong>" +
            "  <span class='dm-unlock-badge" + (isUnlocked ? " unlocked" : "") + "' id='ul-badge-" + oc.id + "'>" + (isUnlocked ? "✓ Unlocked" : "Locked") + "</span>" +
            "</div>" +
            "<button type='button' class='dm-btn-se dm-btn-se-sm' id='ul-btn-" + oc.id + "'>" + (isUnlocked ? "Max &amp; Outfits" : "Unlock Now") + "</button>" +
            "</div>";
        }).join("") +
        "</div>" +

        dlButtons();

      box.querySelector("#se-god-mode").onclick = function () {
        stampPatreon(data);
        data.money = Math.max(data.money || 0, 999999999);
        data.facility_exp = Math.max(data.facility_exp || 0, 50000);
        data.tickets = Math.max(data.tickets || 0, 999);
        data.daily_streak = Math.max(data.daily_streak || 0, 365);
        OFFICIAL_CHARACTERS.forEach(function (oc) {
          if (!data.characters_data[oc.id]) data.characters_data[oc.id] = initDefaultChar(oc.id);
          stampCharUnlock(data.characters_data[oc.id]);
        });
        Object.keys(data.characters_data).forEach(function (cid) {
          stampCharUnlock(data.characters_data[cid]);
        });
        setMsg("🌟 GOD MODE APPLIED: Everything unlocked, Patreon VIP Plus enabled, maxed money ($999M) & tickets!", "ok");
        renderUnlock();
      };

      box.querySelector("#se-stamp-patreon").onclick = function () {
        stampPatreon(data);
        setMsg("✓ Patreon VIP Plus flags and dates stamped!", "ok");
      };

      box.querySelector("#se-unlock-all-chars").onclick = function () {
        OFFICIAL_CHARACTERS.forEach(function (oc) {
          if (!data.characters_data[oc.id]) data.characters_data[oc.id] = initDefaultChar(oc.id);
          stampCharUnlock(data.characters_data[oc.id]);
        });
        Object.keys(data.characters_data).forEach(function (cid) {
          stampCharUnlock(data.characters_data[cid]);
        });
        setMsg("✓ All characters unlocked!", "ok");
        renderUnlock();
      };

      box.querySelector("#se-unlock-outfits-modules").onclick = function () {
        Object.keys(data.characters_data).forEach(function (cid) {
          stampCharUnlock(data.characters_data[cid]);
        });
        setMsg("✓ All outfits (indices 0-199) and all modules unlocked for all characters!", "ok");
      };

      OFFICIAL_CHARACTERS.forEach(function (oc) {
        var btn = box.querySelector("#ul-btn-" + oc.id);
        if (btn) {
          btn.onclick = function () {
            if (!data.characters_data[oc.id]) data.characters_data[oc.id] = initDefaultChar(oc.id);
            stampCharUnlock(data.characters_data[oc.id]);
            var badge = box.querySelector("#ul-badge-" + oc.id);
            if (badge) { badge.textContent = "✓ Unlocked"; badge.className = "dm-unlock-badge unlocked"; }
            btn.textContent = "✓ Unlocked";
            setMsg("✓ Unlocked " + oc.name + "!", "ok");
          };
        }
      });

      wireDl(null);
    }

    /* ── TAB 2: GLOBAL ECONOMY ── */
    function renderGlobal() {
      var f = box.querySelector("#dm-se-body");
      f.innerHTML =
        "<div class='se-section-title'>💰 Economy &amp; Progression</div>" +
        numField("se-money", "Money ($)", data.money || 0, "Spend in shop and facility.", [
          { label: "+$100k", val: 100000, mode: "add" },
          { label: "+$1M",   val: 1000000, mode: "add" },
          { label: "Max ($999M)", val: 999999999, mode: "set" }
        ]) +
        numField("se-fexp", "Facility EXP", data.facility_exp || 0, "Raises facility level & unlocks upgrades.", [
          { label: "+1,000", val: 1000, mode: "add" },
          { label: "+10,000", val: 10000, mode: "add" },
          { label: "Level 100 (50k)", val: 50000, mode: "set" }
        ]) +
        numField("se-tickets", "Gacha Tickets", data.tickets || data.gacha_tickets || 0, "Tickets for gacha character/item pulls.", [
          { label: "+10", val: 10, mode: "add" },
          { label: "+100", val: 100, mode: "add" },
          { label: "999", val: 999, mode: "set" }
        ]) +
        numField("se-streak", "Daily Login Streak (Days)", data.daily_streak || 0, "Increases login reward bonuses.", [
          { label: "30 Days", val: 30, mode: "set" },
          { label: "365 Days", val: 365, mode: "set" }
        ]) +

        "<div class='se-section-title' style='margin-top:14px'>👑 Patreon &amp; VIP Flags</div>" +
        toggle("se-premium",       "digibara_premium (Base Patreon Tier)",      !!(data.digibara_premium))      +
        toggle("se-premium-plus",  "digibara_premium_plus (Top Tier / VIP)",   !!(data.digibara_premium_plus)) +
        toggle("se-is-premium",    "is_premium (General Premium Flag)",         !!(data.is_premium))            +

        dlButtons();

      wireQuickButtons();
      wireDl(collectGlobal);
    }

    function collectGlobal() {
      function v(id, fb) {
        var el = box.querySelector("#" + id);
        if (!el) return fb;
        var n = parseFloat(el.value);
        return isNaN(n) ? fb : n;
      }
      data.money        = Math.max(0, v("se-money", data.money || 0));
      data.facility_exp = Math.max(0, v("se-fexp", data.facility_exp || 0));
      data.tickets      = Math.max(0, Math.round(v("se-tickets", data.tickets || 0)));
      data.gacha_tickets= data.tickets;
      data.daily_streak = Math.max(0, Math.round(v("se-streak", data.daily_streak || 0)));
      var p1 = box.querySelector("#se-premium");
      var p2 = box.querySelector("#se-premium-plus");
      var p3 = box.querySelector("#se-is-premium");
      if (p1) data.digibara_premium = p1.checked;
      if (p2) data.digibara_premium_plus = p2.checked;
      if (p3) data.is_premium = p3.checked;
      if (data.digibara_premium_plus) {
        var future = new RealDate(realNow() + 3650 * 86400 * 1000).toISOString().slice(0, 10);
        data.patreon_next_charge_date = future;
        data.patreon_rewarded_charge_date = future;
        data.premium_tier = "digibara_premium_plus";
      }
    }

    /* ── TAB 3: CHARACTERS VIEW ── */
    var selectedChar = null;
    function renderCharsView() {
      var chars = Object.keys(data.characters_data || {});
      if (!selectedChar || !data.characters_data[selectedChar]) {
        selectedChar = chars[0] || null;
      }
      var f = box.querySelector("#dm-se-body");

      var charSelectHtml = "<div class='dm-char-picker'>" +
        "<label for='se-char-select'>Choose Character to Edit:</label>" +
        "<select id='se-char-select'>" +
        chars.map(function (c) {
          return "<option value='" + c + "'" + (c === selectedChar ? " selected" : "") + ">" + c + "</option>";
        }).join("") +
        "</select>" +
        "</div>";

      if (!selectedChar || !data.characters_data[selectedChar]) {
        f.innerHTML = charSelectHtml + "<p>No character selected.</p>" + dlButtons();
        wireDl(null);
        return;
      }

      var c = data.characters_data[selectedChar];
      var m = cfg.level_mult || 1;
      var curLevel = levelFromMilk(c.total_milk_produced || 0, m);

      f.innerHTML =
        charSelectHtml +
        "<div class='se-section-title'>🥛 Milk &amp; Level</div>" +
        "<div class='dm-row'>" +
        "  <div style='flex:1'>" +
        numField("se-level", "Target Character Level", curLevel, "Calculates milk required.", [
          { label: "Lv.10", val: 10, mode: "set" },
          { label: "Lv.50", val: 50, mode: "set" },
          { label: "Lv.100", val: 100, mode: "set" }
        ]) +
        "  </div>" +
        "  <button type='button' id='se-setlevel' class='dm-btn-se dm-btn-se-secondary' style='margin-bottom:12px'>Apply Level</button>" +
        "</div>" +

        numField("se-tmilk", "Total Milk Produced (L)", c.total_milk_produced || 0, "Determines character level.", [
          { label: "+100 L", val: 100, mode: "add" },
          { label: "+1,000 L", val: 1000, mode: "add" },
          { label: "+10,000 L", val: 10000, mode: "add" }
        ]) +
        numField("se-cmilk", "Current Stored Milk (L)", c.current_milk_produced || 0, "Sellable milk ready in tank.", [
          { label: "Fill Tank", val: (c.tank_size || 50), mode: "set" },
          { label: "+50 L", val: 50, mode: "add" }
        ]) +
        (("tank_size" in c || true) ? numField("se-tank", "Tank Capacity (L)", c.tank_size || 50, "Maximum storage capacity.", [
          { label: "100 L", val: 100, mode: "set" },
          { label: "1,000 L", val: 1000, mode: "set" },
          { label: "10,000 L", val: 10000, mode: "set" }
        ]) : "") +

        "<div class='se-section-title' style='margin-top:14px'>💪 Needs &amp; Vitality (0 - 100)</div>" +
        "<div class='dm-grid4'>" +
        numField("se-energy",  "Energy",  c.energy  || 0, "", [{ label: "100", val: 100, mode: "set" }]) +
        numField("se-satiety", "Satiety", c.satiety || 0, "", [{ label: "100", val: 100, mode: "set" }]) +
        numField("se-hygiene", "Hygiene", c.hygiene || 0, "", [{ label: "100", val: 100, mode: "set" }]) +
        numField("se-horny",   "Horny",   c.horny   || 0, "", [{ label: "100", val: 100, mode: "set" }]) +
        "</div>" +
        "<button type='button' id='se-max-needs' class='dm-btn-se dm-btn-se-secondary' style='margin-top:6px;width:100%'>⚡ Max All Needs to 100</button>" +

        "<div class='se-section-title' style='margin-top:14px'>🏋 Attributes &amp; Stats</div>" +
        "<div class='dm-grid4'>" +
        numField("se-stamina",   "Stamina",   c.stamina   || 0, "", [{ label: "50", val: 50, mode: "set" }, { label: "100", val: 100, mode: "set" }]) +
        numField("se-strength",  "Strength",  c.strength  || 0, "", [{ label: "50", val: 50, mode: "set" }, { label: "100", val: 100, mode: "set" }]) +
        numField("se-lactation", "Lactation", c.lactation || 0, "", [{ label: "50", val: 50, mode: "set" }, { label: "100", val: 100, mode: "set" }]) +
        numField("se-weight",    "Weight (kg)", c.weight  || 70, "", [{ label: "65", val: 65, mode: "set" }, { label: "80", val: 80, mode: "set" }]) +
        "</div>" +

        "<div class='se-section-title' style='margin-top:14px'>🔓 Unlock Status</div>" +
        toggle("se-char-unlocked", "Character Unlocked",   !!(c.unlocked)) +
        toggle("se-char-imported", "Imported Character",    !!(c.imported)) +
        toggle("se-char-premium",  "VIP / Premium Flag",    !!(c.is_premium)) +
        "<button type='button' id='se-char-full-unlock' class='dm-btn-se dm-btn-se-primary' style='margin-top:8px;width:100%'>🔓 Unlock All Outfits &amp; Modules for " + selectedChar + "</button>" +

        dlButtons();

      wireQuickButtons();

      box.querySelector("#se-char-select").onchange = function (ev) {
        collectCurrentChar();
        selectedChar = ev.target.value;
        renderCharsView();
      };

      box.querySelector("#se-setlevel").onclick = function () {
        var L = Math.max(1, Math.floor(parseFloat(box.querySelector("#se-level").value) || 1));
        var need = levelThreshold(L, m);
        var tm = box.querySelector("#se-tmilk");
        tm.value = (need === 0 ? 0 : need * 1.000001 + 1e-6).toFixed(2);
        setMsg("✓ Set " + selectedChar + " milk to " + tm.value + " L (Level " + L + ")", "ok");
      };

      box.querySelector("#se-max-needs").onclick = function () {
        ["energy", "satiety", "hygiene", "horny"].forEach(function (k) {
          var el = box.querySelector("#se-" + k);
          if (el) el.value = 100;
        });
        setMsg("✓ Energy, satiety, hygiene, and horny set to 100!", "ok");
      };

      box.querySelector("#se-char-full-unlock").onclick = function () {
        collectCurrentChar();
        stampCharUnlock(data.characters_data[selectedChar]);
        setMsg("✓ Unlocked all 200 outfits and all modules for " + selectedChar + "!", "ok");
        renderCharsView();
      };

      wireDl(collectCurrentChar);
    }

    function collectCurrentChar() {
      if (!selectedChar || !data.characters_data || !data.characters_data[selectedChar]) return;
      var c = data.characters_data[selectedChar];
      function v(id, fb) {
        var el = box.querySelector("#" + id);
        if (!el) return fb;
        var n = parseFloat(el.value);
        return isNaN(n) ? fb : n;
      }
      function b(id, fb) {
        var el = box.querySelector("#" + id);
        return el ? el.checked : fb;
      }
      c.total_milk_produced   = Math.max(0, v("se-tmilk",   c.total_milk_produced   || 0));
      c.current_milk_produced = Math.max(0, v("se-cmilk",   c.current_milk_produced || 0));
      c.tank_size             = Math.max(0, v("se-tank",    c.tank_size    || 50));
      c.energy                = Math.min(100, Math.max(0, v("se-energy",  c.energy  || 0)));
      c.satiety               = Math.min(100, Math.max(0, v("se-satiety", c.satiety || 0)));
      c.hygiene               = Math.min(100, Math.max(0, v("se-hygiene", c.hygiene || 0)));
      c.horny                 = Math.min(100, Math.max(0, v("se-horny",   c.horny   || 0)));
      c.stamina               = Math.max(0, v("se-stamina",   c.stamina   || 0));
      c.strength              = Math.max(0, v("se-strength",  c.strength  || 0));
      c.lactation             = Math.max(0, v("se-lactation", c.lactation || 0));
      c.weight                = Math.max(0, v("se-weight",    c.weight    || 70));
      c.unlocked              = b("se-char-unlocked", c.unlocked);
      c.imported              = b("se-char-imported", c.imported);
      c.is_premium            = b("se-char-premium",  c.is_premium);
    }

    /* ── TAB 4: RAW JSON VIEW ── */
    function renderRawView() {
      var f = box.querySelector("#dm-se-body");
      var jsonStr = JSON.stringify(data, null, 2);
      f.innerHTML =
        "<p style='font-size:12px;color:var(--dm-muted);margin:0 0 8px'>Directly inspect or edit the save data JSON below.</p>" +
        "<textarea id='se-raw-json' style='width:100%;height:320px;box-sizing:border-box;background:var(--dm-bg2);color:var(--dm-text);border:1px solid var(--dm-border);border-radius:8px;font-family:monospace;font-size:12px;padding:10px;resize:vertical'></textarea>" +
        "<div class='dm-btn-row' style='margin-top:8px'>" +
        "<button type='button' id='se-apply-raw' class='dm-btn-se dm-btn-se-primary'>✓ Apply JSON Changes</button>" +
        "</div>" +
        dlButtons();

      var ta = box.querySelector("#se-raw-json");
      ta.value = jsonStr;

      box.querySelector("#se-apply-raw").onclick = function () {
        try {
          var parsed = JSON.parse(ta.value);
          if (!parsed || typeof parsed !== "object" || !parsed.characters_data)
            throw new Error("Missing characters_data structure.");
          data = parsed;
          setMsg("✓ JSON applied successfully!", "ok");
        } catch (e) {
          setMsg("✗ JSON syntax error: " + e.message, "err");
        }
      };

      wireDl(function () {
        try { data = JSON.parse(ta.value); } catch (e) {}
      });
    }

    renderHead();
  }


  /* ═══════════════════════════════════════════════════════════════
     §6  STYLES
     ═══════════════════════════════════════════════════════════════ */
  function injectStyles() {
    var s = document.createElement("style");
    s.textContent = [
      ":root{",
      "  --dm-bg:#120d11;--dm-bg2:#1e1420;--dm-bg3:#2c1e2e;",
      "  --dm-border:rgba(255,255,255,.14);",
      "  --dm-accent:#c86dd7;--dm-accent2:#8b4fcf;",
      "  --dm-gold:#ffd98a;--dm-green:#6ee7b7;--dm-red:#f87171;",
      "  --dm-text:#e8e0f0;--dm-muted:#9d8eab;--dm-radius:12px;",
      "}",

      /* Floating Action Button */
      "#dm-fab{position:fixed;left:12px;bottom:12px;z-index:99999;",
      "  background:linear-gradient(135deg,var(--dm-accent2),var(--dm-accent));",
      "  color:#fff;border:none;border-radius:999px;padding:10px 18px;",
      "  font:700 13px/1 'Segoe UI',Arial,sans-serif;cursor:pointer;",
      "  box-shadow:0 4px 18px rgba(138,79,207,.55);letter-spacing:.4px;",
      "  transition:transform .15s,box-shadow .15s;}",
      "#dm-fab:hover{transform:scale(1.06);box-shadow:0 6px 24px rgba(200,109,215,.65)}",

      /* Main Overlay Panel */
      "#dm-panel{position:fixed;left:12px;bottom:60px;z-index:99999;",
      "  width:min(340px,calc(100vw - 24px));max-height:82vh;overflow-y:auto;",
      "  background:var(--dm-bg);color:var(--dm-text);",
      "  border:1px solid var(--dm-border);border-radius:var(--dm-radius);",
      "  padding:0;display:none;box-shadow:0 12px 40px rgba(0,0,0,.85);",
      "  font:14px/1.5 'Segoe UI',Arial,sans-serif;}",
      "#dm-panel::-webkit-scrollbar{width:4px}",
      "#dm-panel::-webkit-scrollbar-thumb{background:var(--dm-bg3);border-radius:4px}",
      "#dm-panel .dm-header{background:linear-gradient(135deg,var(--dm-accent2),var(--dm-accent));",
      "  padding:14px 16px;border-radius:var(--dm-radius) var(--dm-radius) 0 0;",
      "  display:flex;align-items:center;justify-content:space-between;}",
      "#dm-panel .dm-header h3{margin:0;font-size:15px;font-weight:700;color:#fff;letter-spacing:.3px}",
      "#dm-panel .dm-header .dm-ver{font-size:11px;color:rgba(255,255,255,.7)}",
      "#dm-panel .dm-section{padding:14px 16px;border-bottom:1px solid var(--dm-border)}",
      "#dm-panel .dm-section:last-child{border-bottom:none;border-radius:0 0 var(--dm-radius) var(--dm-radius)}",
      "#dm-panel .dm-sec-title{font-size:11px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--dm-accent);margin:0 0 10px}",
      "#dm-panel .dm-range-row{display:flex;align-items:center;gap:8px;margin-bottom:4px}",
      "#dm-panel .dm-range-row label{flex:1;font-size:13px}",
      "#dm-panel .dm-range-row .dm-val{min-width:52px;text-align:right;font-size:12px;font-weight:700;color:var(--dm-gold)}",
      "#dm-panel input[type=range]{width:100%;accent-color:var(--dm-accent);height:4px;cursor:pointer}",
      "#dm-panel small{display:block;font-size:11px;color:var(--dm-muted);margin-bottom:10px;line-height:1.4}",
      ".dm-toggle-wrap{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}",
      ".dm-toggle-wrap .dm-toggle-info{flex:1;margin-right:10px}",
      ".dm-toggle-wrap .dm-toggle-info span{display:block;font-size:13px}",
      ".dm-toggle-wrap .dm-toggle-info small{display:block;font-size:11px;color:var(--dm-muted);line-height:1.3;margin:2px 0 0}",
      ".dm-switch{position:relative;width:40px;height:22px;flex-shrink:0}",
      ".dm-switch input{opacity:0;width:0;height:0}",
      ".dm-slider{position:absolute;inset:0;background:#3a2a40;border-radius:22px;cursor:pointer;transition:background .2s}",
      ".dm-slider::before{content:'';position:absolute;height:16px;width:16px;left:3px;bottom:3px;background:#fff;border-radius:50%;transition:.2s}",
      ".dm-switch input:checked+.dm-slider{background:var(--dm-accent)}",
      ".dm-switch input:checked+.dm-slider::before{transform:translateX(18px)}",
      "#dm-panel .dm-btn-group{display:flex;gap:8px;flex-wrap:wrap;margin-top:4px}",
      "#dm-panel .dm-btn{flex:1;min-width:80px;padding:8px 10px;border:none;border-radius:8px;cursor:pointer;font:600 12px 'Segoe UI',Arial;transition:opacity .15s,transform .1s}",
      "#dm-panel .dm-btn:hover{opacity:.88;transform:translateY(-1px)}",
      "#dm-panel .dm-btn-primary{background:linear-gradient(135deg,var(--dm-accent2),var(--dm-accent));color:#fff}",
      "#dm-panel .dm-btn-secondary{background:var(--dm-bg3);color:var(--dm-text);border:1px solid var(--dm-border)}",
      "#dm-panel .dm-btn-danger{background:#5a1f2e;color:#f87171;border:1px solid rgba(248,113,113,.3)}",
      ".dm-badge{display:inline-block;font-size:9px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;background:var(--dm-accent);color:#fff;border-radius:4px;padding:2px 5px;margin-left:6px;vertical-align:middle}",

      /* ── Save Editor Dialog ── */
      "#dm-se{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:100000;",
      "  width:min(540px,calc(100vw - 20px));max-height:90vh;overflow-y:auto;",
      "  background:var(--dm-bg);color:var(--dm-text);",
      "  border:1px solid var(--dm-border);border-radius:var(--dm-radius);",
      "  padding:22px;font:14px/1.5 'Segoe UI',Arial,sans-serif;",
      "  box-shadow:0 20px 70px rgba(0,0,0,.95);}",
      "#dm-se::-webkit-scrollbar{width:5px}",
      "#dm-se::-webkit-scrollbar-thumb{background:var(--dm-bg3);border-radius:4px}",
      ".dm-se-title-bar{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}",
      ".dm-se-title-bar h3{margin:0;font-size:18px;background:linear-gradient(90deg,var(--dm-accent),var(--dm-gold));",
      "  -webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;font-weight:700}",
      "#dm-se .dm-note{font-size:12px;color:var(--dm-muted);margin:0 0 14px;line-height:1.5}",
      ".dm-file-box{background:var(--dm-bg2);border:1px dashed var(--dm-border);padding:10px 14px;border-radius:8px;margin-bottom:12px}",
      "#dm-se input[type=file]{font-size:12px;color:var(--dm-text);display:block;cursor:pointer}",

      /* Tab bar */
      "#dm-se-tabs{display:flex;flex-wrap:wrap;gap:6px;margin:12px 0 14px;border-bottom:1px solid var(--dm-border);padding-bottom:10px}",
      ".dm-tab{padding:6px 12px;border:1px solid var(--dm-border);border-radius:6px;background:var(--dm-bg2);",
      "  color:var(--dm-muted);font:600 12px 'Segoe UI',Arial;cursor:pointer;transition:all .15s}",
      ".dm-tab:hover{background:var(--dm-bg3);color:var(--dm-text)}",
      ".dm-tab-active{background:linear-gradient(135deg,var(--dm-accent2),var(--dm-accent));color:#fff;border-color:transparent}",

      /* Fields & Number Typing Fix */
      ".dm-field-group{margin-bottom:12px}",
      ".dm-field-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:4px}",
      ".dm-field-header label{font-size:12px;font-weight:600;color:var(--dm-muted);margin:0}",
      "#dm-se input[type=number],#dm-se input[type=text],#dm-se select{width:100%;box-sizing:border-box;padding:8px 12px;",
      "  background:var(--dm-bg2);color:var(--dm-text);border:1px solid var(--dm-border);border-radius:8px;font-size:14px;",
      "  user-select:text !important;-webkit-user-select:text !important;cursor:text}",
      "#dm-se input[type=number]:focus,#dm-se input[type=text]:focus,#dm-se select:focus{outline:none;border-color:var(--dm-accent);box-shadow:0 0 0 2px rgba(200,109,215,.25)}",
      ".dm-quick-btns{display:flex;gap:4px}",
      ".dm-btn-quick{padding:2px 7px;font-size:10px;font-weight:700;border:1px solid var(--dm-border);border-radius:4px;",
      "  background:var(--dm-bg3);color:var(--dm-accent);cursor:pointer;transition:background .15s}",
      ".dm-btn-quick:hover{background:var(--dm-accent);color:#fff}",

      /* Toggles */
      "#dm-se .dm-toggle-label{display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;color:var(--dm-text);margin:6px 0}",
      "#dm-se .dm-toggle-label input[type=checkbox]{accent-color:var(--dm-accent);width:16px;height:16px;cursor:pointer}",

      /* Section titles inside editor */
      ".se-section-title{font-size:11px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--dm-accent);margin:14px 0 8px}",
      ".se-god-card{background:linear-gradient(135deg,rgba(139,79,207,.25),rgba(200,109,215,.15));border:1px solid rgba(200,109,215,.35);border-radius:10px;padding:14px;margin-bottom:14px}",
      ".dm-grid4{display:grid;grid-template-columns:1fr 1fr;gap:0 12px}",
      ".dm-row{display:flex;gap:10px;align-items:flex-end}",
      ".dm-char-picker{margin-bottom:14px}",
      ".dm-char-picker select{font-weight:600}",

      /* Unlock rows */
      ".dm-char-grid-unlock{max-height:220px;overflow-y:auto;border:1px solid var(--dm-border);border-radius:8px;padding:4px 8px;background:var(--dm-bg2);margin-bottom:14px}",
      ".dm-char-grid-unlock::-webkit-scrollbar{width:4px}",
      ".dm-char-grid-unlock::-webkit-scrollbar-thumb{background:var(--dm-bg3)}",
      ".dm-unlock-row{display:flex;align-items:center;justify-content:space-between;padding:8px 4px;border-bottom:1px solid rgba(255,255,255,.06)}",
      ".dm-unlock-row:last-child{border-bottom:none}",
      ".dm-unlock-info{display:flex;align-items:center;gap:8px}",
      ".dm-unlock-badge{font-size:10px;font-weight:700;padding:2px 7px;border-radius:4px;background:#3a1520;color:#f87171}",
      ".dm-unlock-badge.unlocked{background:#12362a;color:var(--dm-green)}",

      /* Buttons in editor */
      ".dm-btn-se{padding:9px 16px;border:none;border-radius:8px;cursor:pointer;font:600 12px 'Segoe UI',Arial;transition:opacity .15s}",
      ".dm-btn-se:hover{opacity:.85}",
      ".dm-btn-se-primary{background:linear-gradient(135deg,var(--dm-accent2),var(--dm-accent));color:#fff}",
      ".dm-btn-se-secondary{background:var(--dm-bg3);color:var(--dm-text);border:1px solid var(--dm-border)}",
      ".dm-btn-se-sm{padding:5px 10px;font-size:11px;background:var(--dm-bg3);color:var(--dm-text);border:1px solid var(--dm-border);border-radius:6px;cursor:pointer}",
      ".dm-btn-se-close{background:transparent;border:none;color:var(--dm-muted);font-size:18px;cursor:pointer;padding:4px 8px;border-radius:4px}",
      ".dm-btn-se-close:hover{color:#fff;background:rgba(255,255,255,.1)}",
      ".dm-btn-row{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}",
      ".dm-download-section{margin-top:16px;padding-top:14px;border-top:1px solid var(--dm-border)}",

      /* Messages */
      ".dm-msg{border-radius:8px;padding:9px 14px;font-size:12px;margin:8px 0;line-height:1.4}",
      ".dm-msg-ok{background:#12362a;color:var(--dm-green);border:1px solid rgba(110,231,183,.3)}",
      ".dm-msg-err{background:#3a1520;color:var(--dm-red);border:1px solid rgba(248,113,113,.3)}",
      ".dm-msg-info{background:var(--dm-bg2);color:var(--dm-gold);border:1px solid rgba(255,217,138,.2)}",
      "#dm-se small{display:block;font-size:11px;color:var(--dm-muted);margin:3px 0 0;line-height:1.4}",

      /* Body & Asset Alignment Tool */
      ".dm-nudge-btn{width:46px;height:42px;border-radius:10px;border:1px solid var(--dm-border);background:var(--dm-bg2);color:var(--dm-text);font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .15s;user-select:none;-webkit-user-select:none;touch-action:manipulation}",
      ".dm-nudge-btn:hover{background:var(--dm-bg3);border-color:var(--dm-accent);transform:translateY(-1px)}",
      ".dm-nudge-btn:active{background:var(--dm-accent);color:#fff;transform:translateY(1px)}",
      ".dm-nudge-center{width:40px;height:40px;border-radius:8px;border:1px solid var(--dm-border);background:var(--dm-bg3);color:var(--dm-gold);font-size:16px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .15s}",
      ".dm-nudge-center:hover{background:rgba(255,217,138,.2);border-color:var(--dm-gold)}",
      ".dm-step-btn{padding:4px 9px;font-size:11px;font-weight:700;border-radius:6px;border:1px solid var(--dm-border);background:var(--dm-bg2);color:var(--dm-muted);cursor:pointer;transition:all .15s}",
      ".dm-step-btn:hover{color:var(--dm-text);background:var(--dm-bg3)}",
      ".dm-step-btn.active{background:var(--dm-accent);color:#fff;border-color:var(--dm-accent)}",
    ].join("\n");
    document.head.appendChild(s);
  }


  /* ═══════════════════════════════════════════════════════════════
     §7  MAIN MODS OVERLAY PANEL
     ═══════════════════════════════════════════════════════════════ */
  var MODS_STORAGE_KEY = "digibara_mods_config";
  function api(method, body) {
    return new Promise(function (resolve) {
      var saved = {};
      try {
        saved = JSON.parse(localStorage.getItem(MODS_STORAGE_KEY) || "{}");
      } catch (e) {}
      if (method === "GET") {
        resolve(Object.assign({}, cfg, saved));
      } else {
        Object.assign(saved, body || {});
        try {
          localStorage.setItem(MODS_STORAGE_KEY, JSON.stringify(saved));
        } catch (e) {}
        resolve(Object.assign({}, cfg, saved));
      }
    });
  }

  function build() {
    try {
      injectStyles();

    var fab = document.createElement("button");
    fab.id = "dm-fab";
    fab.textContent = "🎮 Mods";
    document.body.appendChild(fab);

    var panel = document.createElement("div");
    panel.id = "dm-panel";

    /* Stop keyboard capture on panel */
    function stopKey(e) { e.stopPropagation(); }
    panel.addEventListener("keydown", stopKey, true);
    panel.addEventListener("keyup", stopKey, true);
    panel.addEventListener("keypress", stopKey, true);

    panel.innerHTML =
      "<div class='dm-header'>" +
      "  <h3>DigiBara Mods</h3>" +
      "  <span class='dm-ver'>v3.0 Extended</span>" +
      "</div>" +

      /* Section 1: Time */
      "<div class='dm-section'>" +
      "  <div class='dm-sec-title'>⚡ Time &amp; Speed</div>" +
      "  <div class='dm-range-row'>" +
      "    <label>Game speed</label>" +
      "    <span class='dm-val' id='dm-sp-val'>1×</span>" +
      "  </div>" +
      "  <input id='dm-sp' type='range' min='0' max='7' step='1' value='0'>" +
      "  <small>Scales production, needs, and timers. Virtual clock survives reloads.</small>" +
      "  <div class='dm-toggle-wrap'>" +
      "    <div class='dm-toggle-info'>" +
      "      <span>No offline penalty</span>" +
      "      <small>Offline progress always advances at 1× speed.</small>" +
      "    </div>" +
      "    <label class='dm-switch'>" +
      "      <input type='checkbox' id='dm-nooffline'>" +
      "      <span class='dm-slider'></span>" +
      "    </label>" +
      "  </div>" +
      "</div>" +

      /* Section 2: Progression */
      "<div class='dm-section'>" +
      "  <div class='dm-sec-title'>📈 Progression</div>" +
      "  <div class='dm-range-row'>" +
      "    <label>Level milk mult</label>" +
      "    <span class='dm-val' id='dm-lv-val'>1.0×</span>" +
      "  </div>" +
      "  <input id='dm-lv' type='range' min='0' max='5' step='1' value='0'>" +
      "  <small>Lower = less milk needed per level. (Requires page reload).</small>" +
      "</div>" +

      /* Section 3: Content Unlock (Patreon & Custom Characters) */
      "<div class='dm-section'>" +
      "  <div class='dm-sec-title'>🔓 Content Unlock</div>" +
      "  <div class='dm-toggle-wrap'>" +
      "    <div class='dm-toggle-info'>" +
      "      <span>Patreon VIP Plus Bypass <span class='dm-badge'>VIP</span></span>" +
      "      <small>Intercepts validation, unlocks all characters &amp; Global Management.</small>" +
      "    </div>" +
      "    <label class='dm-switch'>" +
      "      <input type='checkbox' id='dm-patreon'>" +
      "      <span class='dm-slider'></span>" +
      "    </label>" +
      "  </div>" +
      "  <div class='dm-toggle-wrap'>" +
      "    <div class='dm-toggle-info'>" +
      "      <span>Unlimited Custom Characters <span class='dm-badge'>Mod</span></span>" +
      "      <small>Removes import limits &amp; unlocks all imported custom characters.</small>" +
      "    </div>" +
      "    <label class='dm-switch'>" +
      "      <input type='checkbox' id='dm-charlimit'>" +
      "      <span class='dm-slider'></span>" +
      "    </label>" +
      "  </div>" +
      "</div>" +

      /* Section 4: Live Cheats */
      "<div class='dm-section'>" +
      "  <div class='dm-sec-title'>💰 Cheats &amp; Automation</div>" +
      "  <div class='dm-toggle-wrap'>" +
      "    <div class='dm-toggle-info'>" +
      "      <span>Infinite money</span>" +
      "      <small>Maintains balance at $1,000,000,000.</small>" +
      "    </div>" +
      "    <label class='dm-switch'>" +
      "      <input type='checkbox' id='dm-infmoney'>" +
      "      <span class='dm-slider'></span>" +
      "    </label>" +
      "  </div>" +
      "  <div class='dm-toggle-wrap'>" +
      "    <div class='dm-toggle-info'>" +
      "      <span>Infinite milk tank</span>" +
      "      <small>Removed storage cap; stored milk never overflows.</small>" +
      "    </div>" +
      "    <label class='dm-switch'>" +
      "      <input type='checkbox' id='dm-inftank'>" +
      "      <span class='dm-slider'></span>" +
      "    </label>" +
      "  </div>" +
      "  <div class='dm-toggle-wrap'>" +
      "    <div class='dm-toggle-info'>" +
      "      <span>Max character stats</span>" +
      "      <small>Forces energy, satiety, hygiene, and horny to 100.</small>" +
      "    </div>" +
      "    <label class='dm-switch'>" +
      "      <input type='checkbox' id='dm-maxstats'>" +
      "      <span class='dm-slider'></span>" +
      "    </label>" +
      "  </div>" +
      "</div>" +

      /* Section 5: Tools */
      "<div class='dm-section'>" +
      "  <div class='dm-sec-title'>🛠 Save Tools</div>" +
      "  <div class='dm-btn-group'>" +
      "    <button type='button' id='dm-saveedit' class='dm-btn dm-btn-primary'>💾 Save Editor</button>" +
      "    <button type='button' id='dm-reload' class='dm-btn dm-btn-secondary'>🔄 Reload</button>" +
      "    <button type='button' id='dm-reset' class='dm-btn dm-btn-danger'>↩ Reset</button>" +
      "  </div>" +
      "</div>" +

      /* Section 5: Custom In-Game Room Background */
      "<div class='dm-section'>" +
      "  <div class='dm-sec-title'>🏠 In-Game Room Background</div>" +

      "  <!-- Upload from Phone / Enter URL box -->" +
      "  <div style='background:var(--dm-bg2);border:1px solid var(--dm-border);border-radius:8px;padding:12px;margin-bottom:12px'>" +
      "    <div style='font-size:12px;font-weight:700;margin-bottom:4px;color:var(--dm-gold)'>Custom Room Backdrop</div>" +
      "    <p style='font-size:11px;color:var(--dm-muted);margin:0 0 10px;line-height:1.4'>Replaces the black room background directly behind the character.</p>" +

      "    <input type='file' id='dm-bg-file' accept='image/*' style='display:none'>" +
      "    <div style='display:flex;gap:6px;margin-bottom:8px'>" +
      "      <button type='button' id='dm-bg-upload-btn' class='dm-btn dm-btn-primary' style='flex:1;font-size:11px;padding:8px 10px'>📁 Upload Room Photo</button>" +
      "      <button type='button' id='dm-bg-clear-btn' class='dm-btn dm-btn-danger' style='font-size:11px;padding:8px 10px'>Reset</button>" +
      "    </div>" +

      "    <div style='display:flex;gap:6px'>" +
      "      <input id='dm-custom-bg-url' type='text' placeholder='Or paste image URL (https://...)' style='flex:1;min-width:0;box-sizing:border-box;padding:7px 8px;border-radius:6px;background:var(--dm-bg3);color:var(--dm-text);border:1px solid var(--dm-border);font-size:11px'>" +
      "      <button type='button' id='dm-apply-url-bg' class='dm-btn dm-btn-secondary' style='font-size:11px;padding:7px 12px'>Apply</button>" +
      "    </div>" +

      "    <div id='dm-bg-preview-wrap' style='display:none;margin-top:10px;align-items:center;gap:10px;padding:8px;background:rgba(0,0,0,.35);border-radius:6px;border:1px solid var(--dm-border)'>" +
      "      <img id='dm-bg-preview' style='width:42px;height:42px;object-fit:cover;border-radius:6px;border:1px solid var(--dm-accent)'>" +
      "      <div style='flex:1;font-size:11px'>" +
      "        <span style='color:var(--dm-green);font-weight:700;display:block'>✓ Custom Room Active</span>" +
      "        <span style='color:var(--dm-muted);font-size:10px'>Saved &amp; loaded behind character</span>" +
      "      </div>" +
      "    </div>" +
      "  </div>" +

      "  <!-- In-game room official background quick equip -->" +
      "  <div style='font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:var(--dm-accent);margin-bottom:6px'>Official Room Presets:</div>" +
      "  <div style='display:flex;gap:6px;margin-bottom:12px'>" +
      "    <select id='dm-quick-bg' style='flex:1;padding:7px;border-radius:6px;background:var(--dm-bg2);color:var(--dm-text);border:1px solid var(--dm-border);font-size:12px'>" +
      [
        "Background Black", "Background 0", "Background 1", "Background 2", "Background 3",
        "Background 4", "Background 5", "Background 6", "Background 7",
        "Background 8", "Background 9", "Background 10"
      ].map(function (bg) {
        return "<option value='" + bg + "'>" + bg + "</option>";
      }).join("") +
      "    </select>" +
      "    <button type='button' id='dm-set-bg-btn' class='dm-btn dm-btn-primary' style='padding:7px 12px;font-size:12px'>Equip</button>" +
      "  </div>" +

      "  <div class='dm-toggle-wrap'>" +
      "    <div class='dm-toggle-info'>" +
      "      <span>Canvas Glow Effect</span>" +
      "      <small>Soft neon aura around the game screen.</small>" +
      "    </div>" +
      "    <label class='dm-switch'>" +
      "      <input type='checkbox' id='dm-canvas-glow'>" +
      "      <span class='dm-slider'></span>" +
      "    </label>" +
      "  </div>" +
      "</div>" +

      /* Section 6: Body & Asset Alignment Tool */
      "<div class='dm-section'>" +
      "  <div class='dm-sec-title'>🎯 Body &amp; Asset Alignment Tool</div>" +
      "  <p style='font-size:11px;color:var(--dm-muted);margin:0 0 10px;line-height:1.4'>" +
      "    Nudge and fix broken or misaligned body parts, outfits, and anchor attachments in real time." +
      "  </p>" +

      "  <div style='background:var(--dm-bg2);border:1px solid var(--dm-border);border-radius:8px;padding:10px;margin-bottom:10px'>" +
      "    <div style='display:flex;justify-content:space-between;align-items:center;margin-bottom:6px'>" +
      "      <span style='font-size:11px;font-weight:700;color:var(--dm-accent)'>Select Body Part / Asset:</span>" +
      "      <span id='dm-align-detected-count' style='font-size:10px;color:var(--dm-green);font-weight:600'>Live</span>" +
      "    </div>" +
      "    <select id='dm-align-select' style='width:100%;box-sizing:border-box;padding:8px;border-radius:6px;background:var(--dm-bg3);color:var(--dm-text);border:1px solid var(--dm-border);font-size:12px;font-weight:600'>" +
      "    </select>" +

      "    <div style='display:flex;justify-content:space-between;align-items:center;margin-top:8px;padding:6px 10px;background:rgba(0,0,0,0.3);border-radius:6px;font-size:11px'>" +
      "      <span style='color:var(--dm-muted)'>Current Offset:</span>" +
      "      <span id='dm-align-coords' style='font-family:monospace;font-weight:700;color:var(--dm-gold)'>X: 0px | Y: 0px</span>" +
      "    </div>" +
      "  </div>" +

      "  <div style='display:flex;align-items:center;justify-content:space-between;margin-bottom:10px'>" +
      "    <span style='font-size:11px;color:var(--dm-muted)'>Nudge Step:</span>" +
      "    <div id='dm-align-steps' style='display:flex;gap:4px'>" +
      "      <button type='button' class='dm-step-btn' data-step='1'>1px</button>" +
      "      <button type='button' class='dm-step-btn active' data-step='5'>5px</button>" +
      "      <button type='button' class='dm-step-btn' data-step='10'>10px</button>" +
      "      <button type='button' class='dm-step-btn' data-step='25'>25px</button>" +
      "    </div>" +
      "  </div>" +

      "  <div style='display:flex;flex-direction:column;align-items:center;gap:6px;margin:12px 0'>" +
      "    <button type='button' id='dm-nudge-up' class='dm-nudge-btn' title='Nudge Up'>⬆️</button>" +
      "    <div style='display:flex;align-items:center;gap:8px'>" +
      "      <button type='button' id='dm-nudge-left' class='dm-nudge-btn' title='Nudge Left'>⬅️</button>" +
      "      <button type='button' id='dm-nudge-reset' class='dm-nudge-center' title='Reset selected part to 0,0'>⟲</button>" +
      "      <button type='button' id='dm-nudge-right' class='dm-nudge-btn' title='Nudge Right'>➡️</button>" +
      "    </div>" +
      "    <button type='button' id='dm-nudge-down' class='dm-nudge-btn' title='Nudge Down'>⬇️</button>" +
      "  </div>" +

      "  <div style='display:flex;gap:6px;margin-top:10px'>" +
      "    <button type='button' id='dm-align-save' class='dm-btn dm-btn-primary' style='flex:1;font-size:11px;padding:8px'>💾 Save Offsets</button>" +
      "    <button type='button' id='dm-align-reset-all' class='dm-btn dm-btn-danger' style='font-size:11px;padding:8px'>↩ Reset All</button>" +
      "  </div>" +
      "</div>";


    document.body.appendChild(panel);

    var SPEEDS = [1, 2, 5, 10, 60, 300, 1800, 3600];
    var LEVELS = [1.0, 0.5, 0.25, 0.1, 0.05, 0.01];

    function nearest(arr, v) {
      var best = 0, diff = Infinity;
      for (var i = 0; i < arr.length; i++) {
        var d = Math.abs(arr[i] - v);
        if (d < diff) { diff = d; best = i; }
      }
      return best;
    }

    var sp   = panel.querySelector("#dm-sp");
    var spv  = panel.querySelector("#dm-sp-val");
    var lv   = panel.querySelector("#dm-lv");
    var lvv  = panel.querySelector("#dm-lv-val");

    function refresh() {
      spv.textContent = speed + "×";
      lvv.textContent = (cfg.level_mult || 1.0) + "×";
    }

    function pushCfg(patch) {
      Object.assign(cfg, patch);
      api("POST", patch).catch(function () {});
    }

    sp.oninput = function () {
      var s = SPEEDS[+sp.value];
      setSpeed(s);
      pushCfg({ game_speed: s });
      refresh();
    };

    lv.oninput = function () {
      var m = LEVELS[+lv.value];
      pushCfg({ level_mult: m });
      refresh();
    };

    function wireToggle(id, key) {
      panel.querySelector("#" + id).onchange = function () {
        var patch = {};
        patch[key] = this.checked;
        pushCfg(patch);
      };
    }

    wireToggle("dm-patreon",   "unlock_patreon");
    wireToggle("dm-charlimit", "remove_char_limit");
    wireToggle("dm-infmoney",  "inf_money");
    wireToggle("dm-inftank",   "inf_tank");
    wireToggle("dm-nooffline", "no_offline_penalty");
    wireToggle("dm-maxstats",  "max_stats");

    panel.querySelector("#dm-saveedit").onclick = openSaveEditor;
    panel.querySelector("#dm-reload").onclick   = function () { location.reload(); };
    panel.querySelector("#dm-reset").onclick    = function () {
      sp.value = nearest(SPEEDS, 1); setSpeed(1);
      lv.value = nearest(LEVELS, 1);
      ["dm-patreon", "dm-charlimit", "dm-infmoney", "dm-inftank", "dm-nooffline", "dm-maxstats"].forEach(function (id) {
        panel.querySelector("#" + id).checked = false;
      });
      pushCfg({
        level_mult: 1.0, game_speed: 1, unlock_patreon: true, remove_char_limit: true,
        inf_money: false, inf_tank: false, no_offline_penalty: false, max_stats: false
      });
      refresh();
    };

    fab.onclick = function () {
      var opening = panel.style.display !== "block";
      panel.style.display = opening ? "block" : "none";
      if (opening) {
        if (!window._digibara_gl) {
          var cv = document.getElementById("canvas");
          if (cv) {
            window._digibara_gl = cv.getContext("webgl2") || cv.getContext("webgl");
            if (window._digibara_gl) hookGlContext(window._digibara_gl);
          }
        }
        if (window._digibara_gl) {
          ensureTexturesInspected(window._digibara_gl);
        }
      }
    };

    api("GET").then(function (c) {
      Object.assign(cfg, c);
      sp.value = nearest(SPEEDS, speed);
      lv.value = nearest(LEVELS, cfg.level_mult || 1.0);
      refresh();
      var MAP = {
        "dm-patreon":   "unlock_patreon",
        "dm-charlimit": "remove_char_limit",
        "dm-infmoney":  "inf_money",
        "dm-inftank":   "inf_tank",
        "dm-nooffline": "no_offline_penalty",
        "dm-maxstats":  "max_stats"
      };
      Object.keys(MAP).forEach(function (id) {
        var el = panel.querySelector("#" + id);
        if (el) el.checked = !!cfg[MAP[id]];
      });
    }).catch(function () {});


    /* ── Helper to ensure Background Black in savegame so GameMaker uses transparent room clear ── */
    function ensureBackgroundBlackInSave() {
      return readFromSavedata("savegame.save").then(function (bytes) {
        var o = decodeSave(bytes);
        if (!o || typeof o !== "object" || !o.characters_data) return false;
        var changed = false;
        Object.keys(o.characters_data).forEach(function (cid) {
          if (o.characters_data[cid].equipped_background !== "Background Black") {
            o.characters_data[cid].equipped_background = "Background Black";
            changed = true;
          }
        });
        if (changed) {
          var saveBytes = encodeSave(o);
          writeToSavedata("savegame.save", saveBytes);
        }
        return changed;
      }).catch(function (e) {
        return false;
      });
    }

    /* ── Custom In-Game Room Background Wiring ── */
    var uploadBtn      = panel.querySelector("#dm-bg-upload-btn");
    var fileInput      = panel.querySelector("#dm-bg-file");
    var clearBtn       = panel.querySelector("#dm-bg-clear-btn");
    var customUrlInput = panel.querySelector("#dm-custom-bg-url");
    var applyUrlBtn    = panel.querySelector("#dm-apply-url-bg");
    var previewWrap    = panel.querySelector("#dm-bg-preview-wrap");
    var previewImg     = panel.querySelector("#dm-bg-preview");
    var setBgBtn       = panel.querySelector("#dm-set-bg-btn");
    var quickBgSelect  = panel.querySelector("#dm-quick-bg");
    var glowToggle     = panel.querySelector("#dm-canvas-glow");

    function updatePreview(url) {
      if (url) {
        if (previewWrap) previewWrap.style.display = "flex";
        if (previewImg) previewImg.src = url;
      } else {
        if (previewWrap) previewWrap.style.display = "none";
        if (previewImg) previewImg.src = "";
      }
    }

    function setCustomRoomBg(url) {
      if (!url) return;
      _gameReady = true;
      try {
        localStorage.setItem("dm_custom_room_bg", url);
      } catch (ex) {
        console.warn("Storage quota exceeded", ex);
      }
      _customRoomBg = url;
      window._digibara_custom_room_bg = true;
      loadCustomRoomBgImage(url);
      updatePreview(url);
      ensureBackgroundBlackInSave();
      alert("✓ Custom room background applied! It will appear behind the character in-game.");
    }

    function clearCustomRoomBg() {
      try { localStorage.removeItem("dm_custom_room_bg"); } catch (e) {}
      _customRoomBg = null;
      window._digibara_custom_room_bg = false;
      loadCustomRoomBgImage(null);
      updatePreview(null);
      if (customUrlInput) customUrlInput.value = "";
    }

    // Initialize preview and glow on startup
    try {
      if (_customRoomBg) {
        updatePreview(_customRoomBg);
        if (customUrlInput && /^https?:\/\//.test(_customRoomBg)) {
          customUrlInput.value = _customRoomBg;
        }
      }
      var savedGlow = localStorage.getItem("dm_canvas_glow") === "1";
      if (glowToggle) glowToggle.checked = savedGlow;
      function applyGlow(enabled) {
        var cv = document.getElementById("canvas");
        if (!cv) return;
        if (enabled) {
          cv.style.boxShadow = "0 0 25px rgba(200, 109, 215, 0.45), 0 0 50px rgba(139, 79, 207, 0.25)";
          cv.style.borderRadius = "8px";
        } else {
          cv.style.boxShadow = "";
          cv.style.borderRadius = "";
        }
      }
      setTimeout(function () { applyGlow(savedGlow); }, 1000);
      if (glowToggle) {
        glowToggle.onchange = function () {
          var enabled = glowToggle.checked;
          try { localStorage.setItem("dm_canvas_glow", enabled ? "1" : "0"); } catch (e) {}
          applyGlow(enabled);
        };
      }
    } catch (e) {}

    // 1. Upload photo from phone / device
    if (uploadBtn && fileInput) {
      uploadBtn.onclick = function () { fileInput.click(); };
      fileInput.onchange = function (ev) {
        var file = ev.target.files && ev.target.files[0];
        if (!file) return;
        uploadBtn.textContent = "⏳ Processing...";
        compressAndProcessImage(file, 1920, 1080, 0.85, function (err, dataUrl) {
          uploadBtn.textContent = "📁 Upload Room Photo";
          if (err || !dataUrl) {
            alert("Could not load image: " + (err ? err.message : "unknown"));
            return;
          }
          setCustomRoomBg(dataUrl);
        });
      };
    }

    // 2. Apply Image URL
    if (applyUrlBtn && customUrlInput) {
      applyUrlBtn.onclick = function () {
        var url = customUrlInput.value.trim();
        if (!url) return;
        setCustomRoomBg(url);
      };
    }

    // 3. Reset room background
    if (clearBtn) {
      clearBtn.onclick = function () {
        clearCustomRoomBg();
        alert("✓ Custom room background removed.");
      };
    }

    // 4. Equip official background preset
    if (setBgBtn && quickBgSelect) {
      setBgBtn.onclick = function () {
        var chosen = quickBgSelect.value;
        if (chosen !== "Background Black") {
          clearCustomRoomBg();
        }
        readFromSavedata("savegame.save").then(function (bytes) {
          var o = decodeSave(bytes);
          if (!o || typeof o !== "object" || !o.characters_data) throw new Error("No characters found in save.");
          Object.keys(o.characters_data).forEach(function (cid) {
            o.characters_data[cid].equipped_background = chosen;
          });
          o.money = Math.max(o.money || 0, 999999999);
          var saveBytes = encodeSave(o);
          writeToSavedata("savegame.save", saveBytes);
          alert("✓ Equipped " + chosen + " for all characters! Reloading game...");
          setTimeout(function () { window.location.reload(); }, 600);
        }).catch(function (err) {
          alert("Could not update background directly: " + err.message + "\nTip: Open Save Editor first to load save.");
        });
      };
    }

    /* ── Section 6: Body & Asset Alignment Tool Wiring ── */
    var alignSelect = panel.querySelector("#dm-align-select");
    var alignCoords = panel.querySelector("#dm-align-coords");
    var stepBtns    = panel.querySelectorAll(".dm-step-btn");
    var nudgeUp     = panel.querySelector("#dm-nudge-up");
    var nudgeDown   = panel.querySelector("#dm-nudge-down");
    var nudgeLeft   = panel.querySelector("#dm-nudge-left");
    var nudgeRight  = panel.querySelector("#dm-nudge-right");
    var nudgeReset  = panel.querySelector("#dm-nudge-reset");
    var alignSave   = panel.querySelector("#dm-align-save");
    var alignResetAll = panel.querySelector("#dm-align-reset-all");
    var detectedCount = panel.querySelector("#dm-align-detected-count");

    function updateCoordsDisplay() {
      if (!alignSelect || !alignCoords) return;
      var key = alignSelect.value;
      if (isAnchorId(key)) {
        var c = getAnchorCoords(key);
        alignCoords.textContent = "Pos: [" + c[0] + ", " + c[1] + "]";
        alignCoords.style.color = "var(--dm-gold)";
      } else {
        var off = getAssetOffset(key);
        var signX = off.x > 0 ? "+" : "";
        var signY = off.y > 0 ? "+" : "";
        alignCoords.textContent = "X: " + signX + off.x + "px | Y: " + signY + off.y + "px";
        alignCoords.style.color = (off.x !== 0 || off.y !== 0) ? "var(--dm-green)" : "var(--dm-gold)";
      }
    }

    function populateAlignDropdown() {
      if (!alignSelect) return;
      var curVal = alignSelect.value || _activeAlignTarget;
      var groups = {
        "Genitalia": [],
        "Torso & Rear": [],
        "Face": [],
        "Outfits": [],
        "Attachments & Anchors": [],
        "✨ Detected / Custom Sprites": []
      };

      BODY_PART_DEFINITIONS.forEach(function (def) {
        var g = def.group || "Other";
        if (!groups[g]) groups[g] = [];
        groups[g].push(def);
      });

      Object.keys(_cleanAssetCanvases).forEach(function (fn) {
        if (!getMatchingDef(fn)) {
          var name = fn.split("/").pop();
          groups["✨ Detected / Custom Sprites"].push({ id: fn, name: name });
        }
      });
      Object.keys(_loadedAssetImages).forEach(function (fn) {
        if (!getMatchingDef(fn) && !_cleanAssetCanvases[fn]) {
          var name = fn.split("/").pop();
          groups["✨ Detected / Custom Sprites"].push({ id: fn, name: name });
        }
      });
      Object.keys(_registeredSpriteKeys).forEach(function (k) {
        if (!getMatchingDef(k) && !_cleanAssetCanvases[k]) {
          groups["✨ Detected / Custom Sprites"].push({ id: k, name: k });
        }
      });

      var html = "";
      Object.keys(groups).forEach(function (gName) {
        var list = groups[gName];
        if (list && list.length > 0) {
          html += "<optgroup label='" + gName + "'>";
          list.forEach(function (item) {
            html += "<option value='" + item.id + "'>" + item.name + "</option>";
          });
          html += "</optgroup>";
        }
      });
      alignSelect.innerHTML = html;
      if (curVal) alignSelect.value = curVal;
      updateCoordsDisplay();

      if (detectedCount) {
        var readyCount = Object.keys(_activeBodyTextures).length;
        if (readyCount > 0) {
          detectedCount.textContent = "✓ " + readyCount + " Ready";
          detectedCount.style.color = "var(--dm-green)";
        } else {
          detectedCount.textContent = "Active";
          detectedCount.style.color = "var(--dm-gold)";
        }
      }
    }

    window._digibara_update_align_ui = populateAlignDropdown;
    populateAlignDropdown();

    if (alignSelect) {
      alignSelect.onchange = function () {
        _activeAlignTarget = alignSelect.value;
        updateCoordsDisplay();
      };
    }

    stepBtns.forEach(function (btn) {
      btn.onclick = function () {
        stepBtns.forEach(function (b) { b.classList.remove("active"); });
        btn.classList.add("active");
        _currentNudgeStep = parseInt(btn.getAttribute("data-step"), 10) || 5;
      };
    });

    function doNudge(dx, dy) {
      if (!alignSelect) return;
      var key = alignSelect.value;
      if (isAnchorId(key)) {
        var coords = getAnchorCoords(key);
        coords[0] += dx;
        coords[1] += dy;
        setAnchorCoords(key, coords);
        updateCoordsDisplay();
      } else {
        var off = getAssetOffset(key);
        off.x += dx;
        off.y += dy;
        setAssetOffset(key, off);
        applyLiveTextureNudge(key, off);
        updateCoordsDisplay();
      }
    }

    if (nudgeUp) nudgeUp.onclick = function () { doNudge(0, -_currentNudgeStep); };
    if (nudgeDown) nudgeDown.onclick = function () { doNudge(0, _currentNudgeStep); };
    if (nudgeLeft) nudgeLeft.onclick = function () { doNudge(-_currentNudgeStep, 0); };
    if (nudgeRight) nudgeRight.onclick = function () { doNudge(_currentNudgeStep, 0); };

    if (nudgeReset) {
      nudgeReset.onclick = function () {
        if (!alignSelect) return;
        var key = alignSelect.value;
        if (isAnchorId(key)) {
          var def = getMatchingDef(key);
          if (def && def.def) setAnchorCoords(key, [def.def[0], def.def[1]]);
        } else {
          setAssetOffset(key, { x: 0, y: 0 });
          applyLiveTextureNudge(key, { x: 0, y: 0 });
        }
        updateCoordsDisplay();
      };
    }

    if (alignSave) {
      alignSave.onclick = function () {
        try {
          localStorage.setItem("dm_asset_offsets", JSON.stringify(_assetOffsets));
          localStorage.setItem("dm_anchor_offsets", JSON.stringify(_anchorOffsets));
        } catch (e) {}

        // Persist to characters_web.save in IndexedDB if present
        readFromSavedata("characters_web.save").then(function (bytes) {
          try {
            var text = new TextDecoder("utf-8").decode(bytes);
            var updated = false;
            Object.keys(_anchorOffsets).forEach(function (prop) {
              var reg = new RegExp('("' + prop + '"\\s*:\\s*\\[)[^\\]]+(\\])', 'g');
              var newCoords = _anchorOffsets[prop];
              if (reg.test(text)) {
                text = text.replace(reg, '$1' + newCoords[0] + ', ' + newCoords[1] + '$2');
                updated = true;
              }
            });
            if (updated) {
              var newBytes = new TextEncoder().encode(text);
              writeToSavedata("characters_web.save", newBytes);
            }
          } catch (ex) {}
        }).catch(function () {});

        alert("✓ Offsets saved permanently! They will remain applied across reloads.");
      };
    }

    if (alignResetAll) {
      alignResetAll.onclick = function () {
        if (!confirm("Reset all body part and anchor offsets back to default?")) return;
        _assetOffsets = {};
        _anchorOffsets = {};
        try {
          localStorage.removeItem("dm_asset_offsets");
          localStorage.removeItem("dm_anchor_offsets");
        } catch (e) {}
        BODY_PART_DEFINITIONS.forEach(function (def) {
          if (!def.isAnchor) {
            applyLiveTextureNudge(def.id, { x: 0, y: 0 });
          }
        });
        updateCoordsDisplay();
        alert("✓ All body offsets reset to default!");
      };
    }
    } catch (e) {
      console.warn("[DigiBara Modloader Error]:", e);
    }
  }

  if (document.body) build();
  else document.addEventListener("DOMContentLoaded", build);
})();
