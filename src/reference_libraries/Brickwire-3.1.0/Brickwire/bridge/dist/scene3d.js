/* Real native WebGL geometry; no Studio rendering claims and no external dependency. */
(() => {
  function mount(canvas, mesh) {
    canvas._dispose?.();
    const gl = canvas.getContext("webgl", { antialias: true, preserveDrawingBuffer: true });
    if (!gl) throw Error("WebGL недоступен; экспорт остаётся доступным.");
    const program = gl.createProgram(),
      shaders = [];
    for (const [type, src] of [
      [
        gl.VERTEX_SHADER,
        `attribute vec3 p; attribute vec3 n; uniform float yaw,pitch,zoom,aspect; varying vec3 normal; void main(){mat3 ry=mat3(cos(yaw),0.,-sin(yaw),0.,1.,0.,sin(yaw),0.,cos(yaw));mat3 rx=mat3(1.,0.,0.,0.,cos(pitch),sin(pitch),0.,-sin(pitch),cos(pitch));vec3 v=rx*ry*p*zoom;normal=rx*ry*n;float z=3.8-v.z;gl_Position=vec4(v.x*2.1/aspect,v.y*2.1,z*1.01-.202,z);}`,
      ],
      [
        gl.FRAGMENT_SHADER,
        `precision mediump float; varying vec3 normal; uniform vec3 color; uniform float lit; void main(){float l=.42+.58*max(0.,dot(normalize(normal),normalize(vec3(-.5,.8,1.))));gl_FragColor=vec4(color*mix(1.,l,lit),1.);}`,
      ],
    ]) {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(s));
      gl.attachShader(program, s);
      shaders.push(s);
    }
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw Error("Viewport shader failed");
    gl.useProgram(program);
    gl.enable(gl.DEPTH_TEST);
    const vb = gl.createBuffer(),
      nb = gl.createBuffer();
    let triangles = [],
      normals = [],
      edges = [],
      grid = [],
      yaw = 0.6,
      pitch = 0.22,
      zoom = 1,
      drag,
      mode = "solid",
      disposed = false;
    const cross = (a, b) => [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0],
    ];
    function update(m) {
      triangles = [];
      normals = [];
      edges = [];
      const min = [0, 1, 2].map((i) => Math.min(...m.positions.map((p) => p[i]))),
        max = [0, 1, 2].map((i) => Math.max(...m.positions.map((p) => p[i]))),
        center = min.map((v, i) => (v + max[i]) / 2),
        size = Math.max(...max.map((v, i) => v - min[i]), 0.1);
      const p = m.positions.map((v) => v.map((x, i) => ((x - center[i]) * 2.4) / size));
      for (const t of m.triangles) {
        const a = p[t[0]],
          b = p[t[1]],
          c = p[t[2]],
          n = cross(
            b.map((v, i) => v - a[i]),
            c.map((v, i) => v - a[i]),
          );
        for (const v of [a, b, c]) {
          triangles.push(...v);
          normals.push(...n);
        }
        for (const [i, j] of [
          [0, 1],
          [1, 2],
          [2, 0],
        ])
          edges.push(...p[t[i]], ...p[t[j]]);
      }
      grid = [];
      const y = ((min[1] - center[1]) * 2.4) / size - 0.08;
      for (let i = -10; i <= 10; i++) {
        const z = i * 0.3;
        grid.push(-3, y, z, 3, y, z, z, y, -3, z, y, 3);
      }
      draw();
    }
    function render(data, ns, color, lit, primitive) {
      gl.bindBuffer(gl.ARRAY_BUFFER, vb);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.DYNAMIC_DRAW);
      const p = gl.getAttribLocation(program, "p");
      gl.enableVertexAttribArray(p);
      gl.vertexAttribPointer(p, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, nb);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(ns || data.map(() => 1)), gl.DYNAMIC_DRAW);
      const n = gl.getAttribLocation(program, "n");
      gl.enableVertexAttribArray(n);
      gl.vertexAttribPointer(n, 3, gl.FLOAT, false, 0, 0);
      gl.uniform3fv(gl.getUniformLocation(program, "color"), color);
      gl.uniform1f(gl.getUniformLocation(program, "lit"), lit);
      gl.drawArrays(primitive, 0, data.length / 3);
    }
    function draw() {
      if (disposed || !canvas.clientWidth) return;
      gl.useProgram(program);
      canvas.width = Math.max(1, Math.round(canvas.clientWidth * Math.min(devicePixelRatio, 2)));
      canvas.height = Math.max(1, Math.round(canvas.clientHeight * Math.min(devicePixelRatio, 2)));
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0.037, 0.051, 0.07, 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      for (const [k, v] of Object.entries({
        yaw,
        pitch,
        zoom,
        aspect: canvas.width / canvas.height,
      }))
        gl.uniform1f(gl.getUniformLocation(program, k), v);
      render(grid, null, [0.1, 0.16, 0.22], 0, gl.LINES);
      if (mode !== "wire") {
        gl.enable(gl.POLYGON_OFFSET_FILL);
        gl.polygonOffset(1, 1);
        render(triangles, normals, [0.28, 0.65, 0.82], 1, gl.TRIANGLES);
        gl.disable(gl.POLYGON_OFFSET_FILL);
      }
      if (mode !== "solid") render(edges, null, [0.47, 0.85, 1], 0, gl.LINES);
    }
    canvas.onpointerdown = (ev) => {
      drag = [ev.clientX, ev.clientY];
      canvas.setPointerCapture(ev.pointerId);
    };
    canvas.onpointermove = (ev) => {
      if (!drag) return;
      yaw += (ev.clientX - drag[0]) * 0.008;
      pitch = Math.max(-1.4, Math.min(1.4, pitch + (ev.clientY - drag[1]) * 0.008));
      drag = [ev.clientX, ev.clientY];
      draw();
    };
    canvas.onpointerup = canvas.onpointercancel = () => (drag = null);
    canvas.onwheel = (ev) => {
      ev.preventDefault();
      zoom = Math.min(2.5, Math.max(0.3, zoom * (ev.deltaY > 0 ? 0.9 : 1.1)));
      draw();
    };
    canvas.onkeydown = (ev) => {
      if (!["+", "-", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home"].includes(ev.key))
        return;
      ev.preventDefault();
      if (ev.key === "Home") {
        yaw = 0.6;
        pitch = 0.22;
        zoom = 1;
      } else if (ev.key === "+") zoom = Math.min(2.5, zoom * 1.1);
      else if (ev.key === "-") zoom = Math.max(0.3, zoom * 0.9);
      else if (ev.key === "ArrowLeft") yaw -= 0.1;
      else if (ev.key === "ArrowRight") yaw += 0.1;
      else pitch += ev.key === "ArrowUp" ? 0.1 : -0.1;
      draw();
    };
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    canvas._dispose = () => {
      disposed = true;
      observer.disconnect();
      gl.deleteBuffer(vb);
      gl.deleteBuffer(nb);
      shaders.forEach((s) => gl.deleteShader(s));
      gl.deleteProgram(program);
    };
    update(mesh);
    return {
      update,
      mode(v) {
        mode = v;
        draw();
      },
      reset() {
        yaw = 0.6;
        pitch = 0.22;
        zoom = 1;
        draw();
      },
      dispose: canvas._dispose,
    };
  }
  window.Brickwire3D = { mount };
})();
