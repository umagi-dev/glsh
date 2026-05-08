/*!
 * glsh.js v1.5.3
 * WebGL shader effects library
 * MIT License
 */

(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
  typeof define === 'function' && define.amd ? define(factory) :
  (global = typeof globalThis !== 'undefined' ? globalThis : global || self, global.glsh = factory());
})(this, function () {
  'use strict';

  const VERSION = '1.5.3';

  function createCanvas(target) {
    let canvas, existingCanvas = false;
    if (typeof target === 'string') {
      const el = document.querySelector(target);
      if (el && el.tagName === 'CANVAS') { canvas = el; existingCanvas = true; }
      else if (el) {
        canvas = document.createElement('canvas');
        canvas.width = el.offsetWidth || el.naturalWidth || 512;
        canvas.height = el.offsetHeight || el.naturalHeight || 512;
        el.parentNode.insertBefore(canvas, el.nextSibling);
      }
    } else if (target instanceof HTMLCanvasElement) {
      canvas = target; existingCanvas = true;
    } else {
      canvas = document.createElement('canvas');
      canvas.width = 512; canvas.height = 512;
    }
    return { canvas, existingCanvas };
  }

  function initGL(canvas) {
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl) throw new Error('glsh.js: WebGL not supported');
    return gl;
  }

  function compileShader(gl, src, type) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const err = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error('glsh.js shader compile error: ' + err);
    }
    return shader;
  }

  function createProgram(gl, vertSrc, fragSrc) {
    const vert = compileShader(gl, vertSrc, gl.VERTEX_SHADER);
    const frag = compileShader(gl, fragSrc, gl.FRAGMENT_SHADER);
    const program = gl.createProgram();
    gl.attachShader(program, vert);
    gl.attachShader(program, frag);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error('glsh.js program link error: ' + gl.getProgramInfoLog(program));
    }
    gl.deleteShader(vert);
    gl.deleteShader(frag);
    return program;
  }

  const BASE_VERT = `
    attribute vec2 a_position;
    attribute vec2 a_texCoord;
    varying vec2 v_texCoord;
    void main() {
      gl_Position = vec4(a_position, 0.0, 1.0);
      v_texCoord = a_texCoord;
    }
  `;

  function setupQuad(gl, program) {
    const positions = new Float32Array([-1,-1, 1,-1, -1,1, 1,1]);
    const texCoords = new Float32Array([0,0, 1,0, 0,1, 1,1]);
    const posLoc = gl.getAttribLocation(program, 'a_position');
    const texLoc = gl.getAttribLocation(program, 'a_texCoord');
    const posBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
    const texBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, texBuf);
    gl.bufferData(gl.ARRAY_BUFFER, texCoords, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(texLoc);
    gl.vertexAttribPointer(texLoc, 2, gl.FLOAT, false, 0, 0);
  }

  function createTexture(gl, source) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    return tex;
  }

  function renderLoop(gl, program, texture, uniforms, draw, animate) {
    gl.useProgram(program);
    setupQuad(gl, program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    const uTex = gl.getUniformLocation(program, 'u_texture');
    if (uTex !== null) gl.uniform1i(uTex, 0);

    let animId = null;
    function frame(t) {
      const uTime = gl.getUniformLocation(program, 'u_time');
      if (uTime !== null) gl.uniform1f(uTime, t * 0.001);
      if (uniforms) uniforms(gl, program, t);
      gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      if (animate) animId = requestAnimationFrame(frame);
    }
    animId = requestAnimationFrame(frame);
    return { stop: () => { if (animId) cancelAnimationFrame(animId); } };
  }

  // ─── EFFECTS SHADERS ────────────────────────────────────────────────────────

  const SHADERS = {

    hue: (angle) => `
      precision mediump float;
      uniform sampler2D u_texture;
      uniform float u_time;
      varying vec2 v_texCoord;
      vec3 hueShift(vec3 col, float angle) {
        float s = sin(angle), c = cos(angle);
        vec3 k = vec3(0.57735);
        return col * c + cross(k, col) * s + k * dot(k, col) * (1.0 - c);
      }
      void main() {
        vec4 col = texture2D(u_texture, v_texCoord);
        float a = ${angle !== undefined ? angle.toFixed(4) : '0.0'} + u_time;
        col.rgb = hueShift(col.rgb, a);
        gl_FragColor = col;
      }
    `,

    saturation: (amount) => `
      precision mediump float;
      uniform sampler2D u_texture;
      varying vec2 v_texCoord;
      void main() {
        vec4 col = texture2D(u_texture, v_texCoord);
        float lum = dot(col.rgb, vec3(0.2126, 0.7152, 0.0722));
        gl_FragColor = vec4(mix(vec3(lum), col.rgb, ${(amount !== undefined ? amount : 1.5).toFixed(4)}), col.a);
      }
    `,

    rgbSplit: (amount) => `
      precision mediump float;
      uniform sampler2D u_texture;
      uniform float u_time;
      varying vec2 v_texCoord;
      void main() {
        float amt = ${(amount !== undefined ? amount : 0.01).toFixed(6)};
        float r = texture2D(u_texture, v_texCoord + vec2(amt, 0.0)).r;
        float g = texture2D(u_texture, v_texCoord).g;
        float b = texture2D(u_texture, v_texCoord - vec2(amt, 0.0)).b;
        float a = texture2D(u_texture, v_texCoord).a;
        gl_FragColor = vec4(r, g, b, a);
      }
    `,

    glitch: (intensity) => `
      precision mediump float;
      uniform sampler2D u_texture;
      uniform float u_time;
      varying vec2 v_texCoord;
      float rand(vec2 co) { return fract(sin(dot(co, vec2(12.9898,78.233))) * 43758.5453); }
      void main() {
        float inten = ${(intensity !== undefined ? intensity : 0.05).toFixed(6)};
        vec2 uv = v_texCoord;
        float t = floor(u_time * 10.0);
        float r = rand(vec2(t, uv.y));
        if (r < inten) {
          uv.x += (rand(vec2(t, uv.y + 0.1)) - 0.5) * 0.2;
        }
        float rs = rand(vec2(t * 2.0, floor(uv.y * 20.0)));
        float rg = texture2D(u_texture, uv + vec2(rs * inten, 0.0)).r;
        float gg = texture2D(u_texture, uv).g;
        float bg = texture2D(u_texture, uv - vec2(rs * inten, 0.0)).b;
        gl_FragColor = vec4(rg, gg, bg, 1.0);
      }
    `,

    bloom: (threshold, intensity) => `
      precision mediump float;
      uniform sampler2D u_texture;
      varying vec2 v_texCoord;
      void main() {
        float thresh = ${(threshold !== undefined ? threshold : 0.7).toFixed(4)};
        float inten = ${(intensity !== undefined ? intensity : 1.5).toFixed(4)};
        vec4 col = texture2D(u_texture, v_texCoord);
        vec2 res = vec2(1.0 / 512.0);
        vec4 blur = vec4(0.0);
        for (int x = -3; x <= 3; x++) {
          for (int y = -3; y <= 3; y++) {
            blur += texture2D(u_texture, v_texCoord + vec2(float(x), float(y)) * res);
          }
        }
        blur /= 49.0;
        float lum = dot(blur.rgb, vec3(0.2126, 0.7152, 0.0722));
        vec4 glow = blur * max(0.0, lum - thresh) * inten;
        gl_FragColor = col + glow;
      }
    `,

    GaussBlur: (radius) => `
      precision mediump float;
      uniform sampler2D u_texture;
      varying vec2 v_texCoord;
      void main() {
        float r = ${(radius !== undefined ? radius : 2.0).toFixed(4)};
        vec2 res = vec2(1.0 / 512.0) * r;
        vec4 col = vec4(0.0);
        float w = 0.0;
        for (int x = -4; x <= 4; x++) {
          for (int y = -4; y <= 4; y++) {
            float gx = float(x), gy = float(y);
            float wt = exp(-(gx*gx + gy*gy) / (2.0 * 4.0));
            col += texture2D(u_texture, v_texCoord + vec2(gx, gy) * res) * wt;
            w += wt;
          }
        }
        gl_FragColor = col / w;
      }
    `,

    wave: (amplitude, frequency) => `
      precision mediump float;
      uniform sampler2D u_texture;
      uniform float u_time;
      varying vec2 v_texCoord;
      void main() {
        float amp = ${(amplitude !== undefined ? amplitude : 0.03).toFixed(6)};
        float freq = ${(frequency !== undefined ? frequency : 10.0).toFixed(4)};
        vec2 uv = v_texCoord;
        uv.x += sin(uv.y * freq + u_time * 2.0) * amp;
        uv.y += sin(uv.x * freq + u_time * 2.0) * amp;
        gl_FragColor = texture2D(u_texture, uv);
      }
    `,

    rippleDistort: (strength, speed) => `
      precision mediump float;
      uniform sampler2D u_texture;
      uniform float u_time;
      varying vec2 v_texCoord;
      void main() {
        float str = ${(strength !== undefined ? strength : 0.05).toFixed(6)};
        float spd = ${(speed !== undefined ? speed : 3.0).toFixed(4)};
        vec2 uv = v_texCoord - 0.5;
        float dist = length(uv);
        float angle = atan(uv.y, uv.x);
        float ripple = sin(dist * 20.0 - u_time * spd) * str;
        vec2 displaced = 0.5 + (dist + ripple) * vec2(cos(angle), sin(angle));
        gl_FragColor = texture2D(u_texture, displaced);
      }
    `,

    rippleTransition: (progress, center) => `
      precision mediump float;
      uniform sampler2D u_texture;
      uniform sampler2D u_texture2;
      uniform float u_time;
      uniform float u_progress;
      varying vec2 v_texCoord;
      void main() {
        vec2 uv = v_texCoord;
        vec2 center = vec2(0.5, 0.5);
        float dist = length(uv - center);
        float wave = sin(dist * 30.0 - u_time * 5.0) * 0.03;
        float prog = clamp(u_progress + wave, 0.0, 1.0);
        vec4 a = texture2D(u_texture, uv);
        vec4 b = texture2D(u_texture2, uv);
        gl_FragColor = mix(a, b, prog);
      }
    `,

    cubeTransition: (progress) => `
      precision mediump float;
      uniform sampler2D u_texture;
      uniform sampler2D u_texture2;
      uniform float u_progress;
      varying vec2 v_texCoord;
      void main() {
        float p = u_progress;
        vec2 uv = v_texCoord;
        vec4 col;
        if (p < 0.5) {
          float t = p * 2.0;
          vec2 nuv = vec2(uv.x / (1.0 - t * 0.5), uv.y);
          if (nuv.x <= 1.0) col = texture2D(u_texture, nuv) * (1.0 - t * 0.3);
          else col = texture2D(u_texture2, uv);
        } else {
          float t = (p - 0.5) * 2.0;
          vec2 nuv = vec2(uv.x / (1.0 - (1.0 - t) * 0.5), uv.y);
          if (uv.x >= t * 0.5 && nuv.x <= 1.0) col = texture2D(u_texture2, nuv) * (0.7 + t * 0.3);
          else col = texture2D(u_texture, uv);
        }
        gl_FragColor = col;
      }
    `,

    halftone: (dotSize) => `
      precision mediump float;
      uniform sampler2D u_texture;
      varying vec2 v_texCoord;
      void main() {
        float size = ${(dotSize !== undefined ? dotSize : 6.0).toFixed(4)};
        vec2 uv = v_texCoord;
        vec2 cell = floor(uv * size) / size;
        vec2 center = cell + 0.5 / size;
        vec4 col = texture2D(u_texture, center);
        float lum = dot(col.rgb, vec3(0.299, 0.587, 0.114));
        float dist = length(uv - center) * size;
        float r = sqrt(lum) * 0.6;
        gl_FragColor = dist < r ? col : vec4(0.0, 0.0, 0.0, 1.0);
      }
    `,

    rainbow: (speed) => `
      precision mediump float;
      uniform sampler2D u_texture;
      uniform float u_time;
      varying vec2 v_texCoord;
      vec3 hue2rgb(float h) {
        h = fract(h) * 6.0;
        return clamp(vec3(abs(h-3.0)-1.0, 2.0-abs(h-2.0), 2.0-abs(h-4.0)), 0.0, 1.0);
      }
      void main() {
        vec4 col = texture2D(u_texture, v_texCoord);
        float lum = dot(col.rgb, vec3(0.2126, 0.7152, 0.0722));
        float spd = ${(speed !== undefined ? speed : 0.5).toFixed(4)};
        vec3 rainbow = hue2rgb(v_texCoord.x + v_texCoord.y * 0.5 + u_time * spd);
        gl_FragColor = vec4(mix(col.rgb, rainbow, 0.5 * lum), col.a);
      }
    `,

    kaleidoScope: (segments) => `
      precision mediump float;
      uniform sampler2D u_texture;
      uniform float u_time;
      varying vec2 v_texCoord;
      void main() {
        float segs = ${(segments !== undefined ? segments : 8.0).toFixed(4)};
        vec2 uv = v_texCoord - 0.5;
        float r = length(uv);
        float a = atan(uv.y, uv.x);
        float slice = 3.14159265 * 2.0 / segs;
        a = mod(a + u_time * 0.2, slice);
        if (a > slice * 0.5) a = slice - a;
        vec2 nuv = vec2(cos(a), sin(a)) * r + 0.5;
        gl_FragColor = texture2D(u_texture, nuv);
      }
    `,

    swirl: (angle, radius) => `
      precision mediump float;
      uniform sampler2D u_texture;
      uniform float u_time;
      varying vec2 v_texCoord;
      void main() {
        float ang = ${(angle !== undefined ? angle : 3.0).toFixed(4)};
        float rad = ${(radius !== undefined ? radius : 0.5).toFixed(4)};
        vec2 uv = v_texCoord - 0.5;
        float dist = length(uv);
        float t = 1.0 - dist / rad;
        t = clamp(t, 0.0, 1.0);
        float twist = ang * t * t + u_time * 0.5;
        float s = sin(twist), c = cos(twist);
        vec2 ruv = vec2(uv.x * c - uv.y * s, uv.x * s + uv.y * c);
        gl_FragColor = texture2D(u_texture, ruv + 0.5);
      }
    `,

    shear: (amountX, amountY) => `
      precision mediump float;
      uniform sampler2D u_texture;
      uniform float u_time;
      varying vec2 v_texCoord;
      void main() {
        float sx = ${(amountX !== undefined ? amountX : 0.2).toFixed(4)};
        float sy = ${(amountY !== undefined ? amountY : 0.0).toFixed(4)};
        vec2 uv = v_texCoord;
        uv.x += uv.y * sx * sin(u_time);
        uv.y += uv.x * sy * cos(u_time);
        if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
          gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
        } else {
          gl_FragColor = texture2D(u_texture, uv);
        }
      }
    `,

    duotone: (colorA, colorB) => {
      const ca = colorA || [0.1, 0.0, 0.5];
      const cb = colorB || [1.0, 0.8, 0.0];
      return `
        precision mediump float;
        uniform sampler2D u_texture;
        varying vec2 v_texCoord;
        void main() {
          vec4 col = texture2D(u_texture, v_texCoord);
          float lum = dot(col.rgb, vec3(0.2126, 0.7152, 0.0722));
          vec3 dark = vec3(${ca[0].toFixed(4)}, ${ca[1].toFixed(4)}, ${ca[2].toFixed(4)});
          vec3 light = vec3(${cb[0].toFixed(4)}, ${cb[1].toFixed(4)}, ${cb[2].toFixed(4)});
          gl_FragColor = vec4(mix(dark, light, lum), col.a);
        }
      `;
    },

    tritone: (shadow, mid, highlight) => {
      const s = shadow || [0.0, 0.0, 0.2];
      const m = mid || [0.5, 0.0, 0.5];
      const h = highlight || [1.0, 0.9, 0.5];
      return `
        precision mediump float;
        uniform sampler2D u_texture;
        varying vec2 v_texCoord;
        void main() {
          vec4 col = texture2D(u_texture, v_texCoord);
          float lum = dot(col.rgb, vec3(0.2126, 0.7152, 0.0722));
          vec3 s = vec3(${s[0].toFixed(4)}, ${s[1].toFixed(4)}, ${s[2].toFixed(4)});
          vec3 m = vec3(${m[0].toFixed(4)}, ${m[1].toFixed(4)}, ${m[2].toFixed(4)});
          vec3 h = vec3(${h[0].toFixed(4)}, ${h[1].toFixed(4)}, ${h[2].toFixed(4)});
          vec3 out_col;
          if (lum < 0.5) out_col = mix(s, m, lum * 2.0);
          else out_col = mix(m, h, (lum - 0.5) * 2.0);
          gl_FragColor = vec4(out_col, col.a);
        }
      `;
    },

  };

  // ─── PUBLIC API ──────────────────────────────────────────────────────────────

  function glsl(target, fragSrc, options) {
    options = options || {};
    const { canvas } = createCanvas(target);
    const gl = initGL(canvas);
    const program = createProgram(gl, BASE_VERT, fragSrc);
    const w = options.width || canvas.width || 512;
    const h = options.height || canvas.height || 512;
    canvas.width = w; canvas.height = h;

    let texture = null;
    if (options.texture) {
      texture = createTexture(gl, options.texture);
    } else {
      texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0,0,0,255]));
    }

    gl.useProgram(program);
    setupQuad(gl, program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    const uTex = gl.getUniformLocation(program, 'u_texture');
    if (uTex !== null) gl.uniform1i(uTex, 0);

    let animId = null;
    const uniforms = options.uniforms || {};

    function frame(t) {
      gl.useProgram(program);
      const uTime = gl.getUniformLocation(program, 'u_time');
      if (uTime !== null) gl.uniform1f(uTime, t * 0.001);
      const uRes = gl.getUniformLocation(program, 'u_resolution');
      if (uRes !== null) gl.uniform2f(uRes, w, h);
      for (const [key, val] of Object.entries(uniforms)) {
        const loc = gl.getUniformLocation(program, key);
        if (loc === null) continue;
        if (typeof val === 'number') gl.uniform1f(loc, val);
        else if (Array.isArray(val) && val.length === 2) gl.uniform2f(loc, val[0], val[1]);
        else if (Array.isArray(val) && val.length === 3) gl.uniform3f(loc, val[0], val[1], val[2]);
        else if (Array.isArray(val) && val.length === 4) gl.uniform4f(loc, val[0], val[1], val[2], val[3]);
      }
      gl.viewport(0, 0, w, h);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      animId = requestAnimationFrame(frame);
    }
    animId = requestAnimationFrame(frame);

    return {
      canvas,
      gl,
      program,
      stop() { if (animId) cancelAnimationFrame(animId); },
      setUniform(name, value) { uniforms[name] = value; },
      destroy() {
        if (animId) cancelAnimationFrame(animId);
        gl.deleteProgram(program);
        if (texture) gl.deleteTexture(texture);
      }
    };
  }

  function effects(target, effectName, options) {
    options = options || {};
    const { canvas } = createCanvas(target);
    canvas.width = options.width || canvas.width || 512;
    canvas.height = options.height || canvas.height || 512;
    const gl = initGL(canvas);

    let fragSrc;
    switch (effectName) {
      case 'hue':          fragSrc = SHADERS.hue(options.angle); break;
      case 'saturation':   fragSrc = SHADERS.saturation(options.amount); break;
      case 'rgbSplit':     fragSrc = SHADERS.rgbSplit(options.amount); break;
      case 'glitch':       fragSrc = SHADERS.glitch(options.intensity); break;
      case 'bloom':        fragSrc = SHADERS.bloom(options.threshold, options.intensity); break;
      case 'GaussBlur':    fragSrc = SHADERS.GaussBlur(options.radius); break;
      case 'wave':         fragSrc = SHADERS.wave(options.amplitude, options.frequency); break;
      case 'rippleDistort':fragSrc = SHADERS.rippleDistort(options.strength, options.speed); break;
      case 'rippleTransition': fragSrc = SHADERS.rippleTransition(options.progress); break;
      case 'cubeTransition':   fragSrc = SHADERS.cubeTransition(options.progress); break;
      case 'halftone':     fragSrc = SHADERS.halftone(options.dotSize); break;
      case 'rainbow':      fragSrc = SHADERS.rainbow(options.speed); break;
      case 'kaleidoScope': fragSrc = SHADERS.kaleidoScope(options.segments); break;
      case 'swirl':        fragSrc = SHADERS.swirl(options.angle, options.radius); break;
      case 'shear':        fragSrc = SHADERS.shear(options.amountX, options.amountY); break;
      case 'duotone':      fragSrc = SHADERS.duotone(options.colorA, options.colorB); break;
      case 'tritone':      fragSrc = SHADERS.tritone(options.shadow, options.mid, options.highlight); break;
      case 'customShader': fragSrc = options.shader || `precision mediump float; uniform sampler2D u_texture; varying vec2 v_texCoord; void main() { gl_FragColor = texture2D(u_texture, v_texCoord); }`; break;
      default: throw new Error('glsh.js: Unknown effect "' + effectName + '"');
    }

    const program = createProgram(gl, BASE_VERT, fragSrc);
    gl.useProgram(program);
    setupQuad(gl, program);

    let texture = null;
    if (options.texture) {
      texture = createTexture(gl, options.texture);
    } else {
      texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([100,100,200,255]));
    }

    let texture2 = null;
    if (options.texture2) {
      gl.activeTexture(gl.TEXTURE1);
      texture2 = createTexture(gl, options.texture2);
      const uTex2 = gl.getUniformLocation(program, 'u_texture2');
      if (uTex2 !== null) gl.uniform1i(uTex2, 1);
    }

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    const uTex = gl.getUniformLocation(program, 'u_texture');
    if (uTex !== null) gl.uniform1i(uTex, 0);

    let animId = null;
    let progress = options.progress || 0;

    function frame(t) {
      gl.useProgram(program);
      const uTime = gl.getUniformLocation(program, 'u_time');
      if (uTime !== null) gl.uniform1f(uTime, t * 0.001);
      const uRes = gl.getUniformLocation(program, 'u_resolution');
      if (uRes !== null) gl.uniform2f(uRes, canvas.width, canvas.height);
      const uProg = gl.getUniformLocation(program, 'u_progress');
      if (uProg !== null) gl.uniform1f(uProg, progress);

      if (options.texture && options.texture.tagName === 'VIDEO') {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, options.texture);
      }

      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      animId = requestAnimationFrame(frame);
    }
    animId = requestAnimationFrame(frame);

    return {
      canvas,
      gl,
      program,
      stop() { if (animId) cancelAnimationFrame(animId); },
      setProgress(p) { progress = p; },
      updateTexture(src) {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
      },
      destroy() {
        if (animId) cancelAnimationFrame(animId);
        gl.deleteProgram(program);
        if (texture) gl.deleteTexture(texture);
        if (texture2) gl.deleteTexture(texture2);
      }
    };
  }

  function imgsrc(src, callback) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = function () { callback(null, img); };
    img.onerror = function () { callback(new Error('glsh.js: Failed to load image: ' + src)); };
    img.src = src;
    return img;
  }

  function videosrc(src, options, callback) {
    if (typeof options === 'function') { callback = options; options = {}; }
    options = options || {};
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.loop = options.loop !== undefined ? options.loop : true;
    video.muted = options.muted !== undefined ? options.muted : true;
    video.autoplay = options.autoplay !== undefined ? options.autoplay : true;
    video.playsInline = true;
    video.oncanplay = function () { callback(null, video); };
    video.onerror = function () { callback(new Error('glsh.js: Failed to load video: ' + src)); };
    video.src = src;
    video.load();
    if (options.autoplay) video.play().catch(() => {});
    return video;
  }

  return {
    VERSION,
    glsl,
    effects,
    imgsrc,
    videosrc,
    _shaders: SHADERS
  };
});
