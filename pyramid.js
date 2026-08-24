/* GZ IAO — the Pyramid of Flame as an interactive solid.
   A regular tetrahedron rendered by real 3D projection into SVG: drag to
   turn it, release to let it drift, and watch the hidden fourth face —
   ASCH, the latent fire — pass in and out of view. No libraries. */
(function () {
  const VERTS = [
    [1, 1, 1],
    [1, -1, -1],
    [-1, 1, -1],
    [-1, -1, 1],
  ].map((v) => v.map((n) => n / Math.sqrt(3))); // unit-ish tetrahedron

  /* the lecture's own words for the four triangles: three visible fires and
     the concealed base, which is yet the synthesis of the rest */
  const FACES = [
    { idx: [0, 2, 1], name: "SOLAR", sub: "LIFE-GIVING FIRE", color: "#d0ad6d" },
    { idx: [0, 1, 3], name: "VOLCANIC", sub: "TERRESTRIAL FIRE", color: "#c98a5e" },
    { idx: [0, 3, 2], name: "ASTRAL", sub: "VITAL LIGHT", color: "#63dfca" },
    { idx: [1, 2, 3], name: "LATENT", sub: "HEAT · THE SYNTHESIS", color: "#a78bfa" },
  ];

  function mount(container) {
    const size = 300;
    container.innerHTML =
      '<svg viewBox="0 0 300 300" style="width:100%;height:auto;display:block;cursor:grab;touch-action:none" aria-label="Interactive pyramid of flame">' +
      '<g class="pyr-faces"></g><g class="pyr-labels"></g></svg>' +
      '<div class="pyr-state" style="text-align:center;color:var(--faint);font-size:9px;letter-spacing:.18em;margin-top:8px"></div>';
    const svg = container.querySelector("svg");
    const facesLayer = svg.querySelector(".pyr-faces");
    const labelsLayer = svg.querySelector(".pyr-labels");
    const stateLine = container.querySelector(".pyr-state");

    let rotX = -0.42;
    let rotY = 0.72;
    let velX = 0;
    let velY = 0.0035;
    let dragging = false;
    let lastPointer = null;
    let running = true;

    function rotate(v, ax, ay) {
      // rotate around X then Y
      const [x, y, z] = v;
      const cy1 = Math.cos(ax), sy1 = Math.sin(ax);
      const y1 = y * cy1 - z * sy1;
      const z1 = y * sy1 + z * cy1;
      const cy2 = Math.cos(ay), sy2 = Math.sin(ay);
      const x2 = x * cy2 + z1 * sy2;
      const z2 = -x * sy2 + z1 * cy2;
      return [x2, y1, z2];
    }

    function project(v) {
      const persp = 3.4;
      const scale = 96;
      const f = persp / (persp - v[2]);
      return [150 + v[0] * scale * f, 150 + v[1] * scale * f, v[2]];
    }

    function render() {
      const world = VERTS.map((v) => rotate(v, rotX, rotY));
      const projected = world.map(project);

      const drawn = FACES.map((face) => {
        const [a, b, c] = face.idx.map((i) => world[i]);
        // face normal via cross product (b-a)×(c-a)
        const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
        const w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
        const n = [
          u[1] * w[2] - u[2] * w[1],
          u[2] * w[0] - u[0] * w[2],
          u[0] * w[1] - u[1] * w[0],
        ];
        const len = Math.hypot(n[0], n[1], n[2]) || 1;
        const facing = n[2] / len; // toward viewer when positive
        const depth = (a[2] + b[2] + c[2]) / 3;
        const pts = face.idx.map((i) => projected[i]);
        const cx = (pts[0][0] + pts[1][0] + pts[2][0]) / 3;
        const cy = (pts[0][1] + pts[1][1] + pts[2][1]) / 3;
        return { face, pts, facing, depth, cx, cy };
      }).sort((p, q) => p.depth - q.depth);

      let facesHtml = "";
      let labelsHtml = "";
      let aschVisible = false;
      for (const d of drawn) {
        const front = d.facing > 0;
        const light = Math.max(0.12, d.facing);
        const isAsch = d.face.name === "LATENT";
        if (isAsch && front) aschVisible = true;
        const fillOpacity = front ? 0.14 + light * 0.3 : 0.05;
        const strokeOpacity = front ? 0.95 : 0.28;
        facesHtml +=
          '<polygon points="' + d.pts.map((p) => p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ") + '" ' +
          'fill="' + d.face.color + '" fill-opacity="' + fillOpacity.toFixed(3) + '" ' +
          'stroke="' + d.face.color + '" stroke-opacity="' + strokeOpacity + '" stroke-width="1.3" stroke-linejoin="round"' +
          (isAsch && front ? ' filter="drop-shadow(0 0 9px #a78bfa88)"' : "") + "/>";
        if (front && d.facing > 0.25) {
          labelsHtml +=
            '<text x="' + d.cx + '" y="' + (d.cy - 2) + '" text-anchor="middle" fill="' + d.face.color + '" ' +
            'font-family="Georgia,serif" font-size="14" opacity="' + Math.min(1, light + 0.25) + '">' + d.face.name + "</text>" +
            '<text x="' + d.cx + '" y="' + (d.cy + 11) + '" text-anchor="middle" fill="' + d.face.color + '" ' +
            'font-size="6.4" letter-spacing="1.4" opacity="' + Math.min(0.85, light) + '">' + d.face.sub + "</text>";
        }
      }
      facesLayer.innerHTML = facesHtml;
      labelsLayer.innerHTML = labelsHtml;
      stateLine.textContent = aschVisible
        ? "THE BASAL TRIANGLE TURNED TOWARD YOU — LATENT HEAT REVEALED"
        : "DRAG TO TURN · THE FOURTH FACE STAYS HIDDEN UNTIL SOUGHT";
    }

    function tick() {
      if (!running) return;
      if (!dragging) {
        rotX += velX;
        rotY += velY;
        velX *= 0.96;
        velY = velY * 0.96 + 0.0035 * 0.04; // ease back to a slow drift
      }
      render();
      requestAnimationFrame(tick);
    }

    svg.addEventListener("pointerdown", (event) => {
      dragging = true;
      lastPointer = [event.clientX, event.clientY];
      svg.style.cursor = "grabbing";
      svg.setPointerCapture(event.pointerId);
    });
    svg.addEventListener("pointermove", (event) => {
      if (!dragging) return;
      const dx = event.clientX - lastPointer[0];
      const dy = event.clientY - lastPointer[1];
      lastPointer = [event.clientX, event.clientY];
      rotY += dx * 0.012;
      rotX -= dy * 0.012;
      velY = dx * 0.0024;
      velX = -dy * 0.0024;
      render();
    });
    const release = () => {
      dragging = false;
      svg.style.cursor = "grab";
    };
    svg.addEventListener("pointerup", release);
    svg.addEventListener("pointercancel", release);

    /* stop animating when the element leaves the DOM */
    const watchdog = setInterval(() => {
      if (!document.body.contains(svg)) {
        running = false;
        clearInterval(watchdog);
      }
    }, 3000);

    render();
    requestAnimationFrame(tick);
  }

  window.GZ_PYRAMID = { mount };
})();
