/* GZ IAO — the Tree of Life as an instrument rather than a picture.
   All ten sephiroth, the veil of Daath, and every one of the twenty-two
   paths with its Hebrew letter, Tarot key and astrological attribution
   (Golden Dawn order, Tzaddi to The Star). Hover or tap any path or
   sephirah to read it; the badge row switches what each path wears.
   No libraries. */
(function () {
  const SEPHIROTH = [
    { key: "Kether", n: 1, hebrew: "כתר", title: "Crown", attr: "Rashith ha-Gilgalim · the first swirlings", grade: "10°=1▫ Ipsissimus", pillar: "middle", x: 230, y: 62 },
    { key: "Chokmah", n: 2, hebrew: "חכמה", title: "Wisdom", attr: "The Zodiac · the sphere of the fixed stars", grade: "9°=2▫ Magus", pillar: "right", x: 350, y: 142 },
    { key: "Binah", n: 3, hebrew: "בינה", title: "Understanding", attr: "Saturn", grade: "8°=3▫ Magister Templi", pillar: "left", x: 110, y: 142 },
    { key: "Chesed", n: 4, hebrew: "חסד", title: "Mercy", attr: "Jupiter", grade: "7°=4▫ Adeptus Exemptus", pillar: "right", x: 350, y: 292 },
    { key: "Geburah", n: 5, hebrew: "גבורה", title: "Severity", attr: "Mars", grade: "6°=5▫ Adeptus Major", pillar: "left", x: 110, y: 292 },
    { key: "Tiphareth", n: 6, hebrew: "תפארת", title: "Beauty", attr: "Sun", grade: "5°=6▫ Adeptus Minor", pillar: "middle", x: 230, y: 367 },
    { key: "Netzach", n: 7, hebrew: "נצח", title: "Victory", attr: "Venus", grade: "4°=7▫ Philosophus", pillar: "right", x: 350, y: 472 },
    { key: "Hod", n: 8, hebrew: "הוד", title: "Splendour", attr: "Mercury", grade: "3°=8▫ Practicus", pillar: "left", x: 110, y: 472 },
    { key: "Yesod", n: 9, hebrew: "יסוד", title: "Foundation", attr: "Moon", grade: "2°=9▫ Theoricus", pillar: "middle", x: 230, y: 547 },
    { key: "Malkuth", n: 10, hebrew: "מלכות", title: "Kingdom", attr: "The four elements · Earth", grade: "1°=10▫ Zelator", pillar: "middle", x: 230, y: 627 },
  ];
  const BY_KEY = {};
  for (const s of SEPHIROTH) BY_KEY[s.key] = s;

  const DAATH = { hebrew: "דעת", title: "Knowledge", x: 230, y: 217 };

  /* n · Hebrew letter · Tarot key · trump · attribution · endpoints.
     `t` shifts a badge off a crossing when the midpoint is occupied. */
  const PATHS = [
    { n: 11, letter: "א", name: "Aleph", sense: "ox", key: 0, trump: "The Fool", attr: "Air", glyph: "Air", from: "Kether", to: "Chokmah" },
    { n: 12, letter: "ב", name: "Beth", sense: "house", key: 1, trump: "The Magician", attr: "Mercury", glyph: "Mercury", from: "Kether", to: "Binah" },
    { n: 13, letter: "ג", name: "Gimel", sense: "camel", key: 2, trump: "The High Priestess", attr: "Moon", glyph: "Moon", from: "Kether", to: "Tiphareth", t: 0.62 },
    { n: 14, letter: "ד", name: "Daleth", sense: "door", key: 3, trump: "The Empress", attr: "Venus", glyph: "Venus", from: "Chokmah", to: "Binah", t: 0.3 },
    { n: 15, letter: "ה", name: "Heh", sense: "window", key: 4, trump: "The Emperor", attr: "Aries", glyph: "Aries", from: "Chokmah", to: "Tiphareth" },
    { n: 16, letter: "ו", name: "Vav", sense: "nail", key: 5, trump: "The Hierophant", attr: "Taurus", glyph: "Taurus", from: "Chokmah", to: "Chesed" },
    { n: 17, letter: "ז", name: "Zayin", sense: "sword", key: 6, trump: "The Lovers", attr: "Gemini", glyph: "Gemini", from: "Binah", to: "Tiphareth" },
    { n: 18, letter: "ח", name: "Cheth", sense: "fence", key: 7, trump: "The Chariot", attr: "Cancer", glyph: "Cancer", from: "Binah", to: "Geburah" },
    { n: 19, letter: "ט", name: "Teth", sense: "serpent", key: 8, trump: "Strength", attr: "Leo", glyph: "Leo", from: "Chesed", to: "Geburah", t: 0.32 },
    { n: 20, letter: "י", name: "Yod", sense: "hand", key: 9, trump: "The Hermit", attr: "Virgo", glyph: "Virgo", from: "Chesed", to: "Tiphareth" },
    { n: 21, letter: "כ", name: "Kaph", sense: "palm", key: 10, trump: "The Wheel of Fortune", attr: "Jupiter", glyph: "Jupiter", from: "Chesed", to: "Netzach" },
    { n: 22, letter: "ל", name: "Lamed", sense: "ox-goad", key: 11, trump: "Justice", attr: "Libra", glyph: "Libra", from: "Geburah", to: "Tiphareth" },
    { n: 23, letter: "מ", name: "Mem", sense: "water", key: 12, trump: "The Hanged Man", attr: "Water", glyph: "Water", from: "Geburah", to: "Hod" },
    { n: 24, letter: "נ", name: "Nun", sense: "fish", key: 13, trump: "Death", attr: "Scorpio", glyph: "Scorpio", from: "Tiphareth", to: "Netzach" },
    { n: 25, letter: "ס", name: "Samekh", sense: "prop", key: 14, trump: "Temperance", attr: "Sagittarius", glyph: "Sagittarius", from: "Tiphareth", to: "Yesod" },
    { n: 26, letter: "ע", name: "Ayin", sense: "eye", key: 15, trump: "The Devil", attr: "Capricorn", glyph: "Capricorn", from: "Tiphareth", to: "Hod" },
    { n: 27, letter: "פ", name: "Peh", sense: "mouth", key: 16, trump: "The Tower", attr: "Mars", glyph: "Mars", from: "Netzach", to: "Hod", t: 0.3 },
    { n: 28, letter: "צ", name: "Tzaddi", sense: "fish-hook", key: 17, trump: "The Star", attr: "Aquarius", glyph: "Aquarius", from: "Netzach", to: "Yesod" },
    { n: 29, letter: "ק", name: "Qoph", sense: "back of head", key: 18, trump: "The Moon", attr: "Pisces", glyph: "Pisces", from: "Netzach", to: "Malkuth" },
    { n: 30, letter: "ר", name: "Resh", sense: "head", key: 19, trump: "The Sun", attr: "Sun", glyph: "Sun", from: "Hod", to: "Yesod" },
    { n: 31, letter: "ש", name: "Shin", sense: "tooth", key: 20, trump: "Judgement", attr: "Fire", glyph: "Fire", from: "Hod", to: "Malkuth" },
    { n: 32, letter: "ת", name: "Tav", sense: "cross", key: 21, trump: "The Universe", attr: "Saturn", glyph: "Saturn", from: "Yesod", to: "Malkuth" },
  ];

  const ROMAN = ["0", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X",
    "XI", "XII", "XIII", "XIV", "XV", "XVI", "XVII", "XVIII", "XIX", "XX", "XXI"];

  const MODES = [
    { id: "number", label: "Path no." },
    { id: "letter", label: "Hebrew" },
    { id: "key", label: "Tarot key" },
    { id: "attr", label: "Attribution" },
  ];

  function esc(text) {
    return String(text).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  }

  function mount(container, options) {
    const opts = options || {};
    const lit = opts.lit || [];          // paths already crossed — drawn in their own colour
    const veiled = opts.veiled || [];    // paths waiting above — drawn dashed
    const focus = opts.focus || null;    // the sephirah of the current grade
    const litColors = opts.litColors || {};

    let mode = "number";
    let pinned = null;   // {type:'path'|'seph', id}
    let hovered = null;

    container.innerHTML =
      '<div class="tree-wrap">' +
      '<div class="tree-stage"></div>' +
      '<div class="tree-side">' +
      '<div class="tree-modes"><span class="tree-modes-label">Each path wears</span>' +
      MODES.map((m) => '<button type="button" data-mode="' + m.id + '"' +
        (m.id === "number" ? ' class="is-on"' : "") + ">" + m.label + "</button>").join("") +
      "</div>" +
      '<div class="tree-readout"></div>' +
      '<div class="tree-legend"></div>' +
      "</div></div>";

    const stage = container.querySelector(".tree-stage");
    const readout = container.querySelector(".tree-readout");
    const legend = container.querySelector(".tree-legend");

    legend.innerHTML =
      (lit.length ? '<span><i class="lg-lit"></i>crossed at this grade</span>' : "") +
      (veiled.length ? '<span><i class="lg-veil"></i>waits above</span>' : "") +
      (focus ? '<span><i class="lg-focus"></i>' + esc(focus) + " — where you stand</span>" : "") +
      '<span><i class="lg-daath"></i>Daath, the unnumbered</span>';

    function pathColor(p) {
      if (litColors[p.n]) return litColors[p.n];
      if (lit.indexOf(p.n) >= 0) return "var(--amber)";
      if (veiled.indexOf(p.n) >= 0) return "var(--violet)";
      return "var(--tree-line)";
    }

    function badgeMarkup(p, cx, cy, active) {
      const color = active ? "var(--tree-hot)" : pathColor(p);
      const r = mode === "attr" ? 11 : 10;
      let inner = "";
      if (mode === "attr" && window.GZ_GLYPHS) {
        inner = window.GZ_GLYPHS.group(p.glyph, cx, cy, 13, color, 1.5);
      } else {
        const text = mode === "letter" ? p.letter : mode === "key" ? ROMAN[p.key] : String(p.n);
        const size = mode === "letter" ? 11 : mode === "key" ? 7.6 : 8.4;
        inner = '<text x="' + cx + '" y="' + (cy + (mode === "letter" ? 4 : 3)) + '" text-anchor="middle" ' +
          'fill="' + color + '" font-size="' + size + '" font-family="Georgia,serif" letter-spacing="0.4">' +
          text + "</text>";
      }
      return '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="var(--tree-badge)" ' +
        'stroke="' + color + '" stroke-width="' + (active ? 1.5 : 0.9) + '" stroke-opacity="' +
        (active ? 1 : 0.75) + '"/>' + inner;
    }

    function render() {
      const activePath = (hovered && hovered.type === "path" ? hovered.id : null) ||
        (pinned && pinned.type === "path" ? pinned.id : null);
      const activeSeph = (hovered && hovered.type === "seph" ? hovered.id : null) ||
        (pinned && pinned.type === "seph" ? pinned.id : null);
      const activeP = PATHS.find((p) => p.n === activePath) || null;
      const touching = activeSeph
        ? PATHS.filter((p) => p.from === activeSeph || p.to === activeSeph).map((p) => p.n)
        : [];

      let svg = '<svg viewBox="0 0 460 700" xmlns="http://www.w3.org/2000/svg" ' +
        'style="width:100%;height:auto;display:block" aria-label="Interactive Tree of Life">';

      /* the three pillars, as ground rather than ornament */
      svg += '<g class="tree-pillars">';
      [[110, "SEVERITY"], [230, "MILDNESS"], [350, "MERCY"]].forEach(([x, label]) => {
        svg += '<line x1="' + x + '" y1="34" x2="' + x + '" y2="664" stroke="var(--tree-pillar)" stroke-width="26" stroke-linecap="round"/>';
        svg += '<text x="' + x + '" y="24" text-anchor="middle" fill="var(--faint)" font-size="6.6" ' +
          'letter-spacing="2.2" font-family="Georgia,serif">' + label + "</text>";
      });
      svg += "</g>";

      /* paths — a visible stroke plus a fat invisible one to catch the pointer */
      let badges = "";
      for (const p of PATHS) {
        const a = BY_KEY[p.from];
        const b = BY_KEY[p.to];
        const active = p.n === activePath;
        const adjacent = touching.indexOf(p.n) >= 0;
        const color = active || adjacent ? "var(--tree-hot)" : pathColor(p);
        const special = lit.indexOf(p.n) >= 0 || veiled.indexOf(p.n) >= 0 || litColors[p.n];
        const width = active ? 3.2 : adjacent ? 2.4 : special ? 2 : 1.4;
        svg += '<line x1="' + a.x + '" y1="' + a.y + '" x2="' + b.x + '" y2="' + b.y + '" ' +
          'stroke="' + color + '" stroke-width="' + width + '" stroke-linecap="round"' +
          (veiled.indexOf(p.n) >= 0 && !active ? ' stroke-dasharray="6 5"' : "") +
          (active ? ' filter="url(#tree-glow)"' : "") + "/>";
        svg += '<line class="tree-hit" data-path="' + p.n + '" x1="' + a.x + '" y1="' + a.y +
          '" x2="' + b.x + '" y2="' + b.y + '" stroke="transparent" stroke-width="17"/>';
        const t = p.t || 0.5;
        badges += '<g class="tree-hit" data-path="' + p.n + '">' +
          badgeMarkup(p, a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, active || adjacent) + "</g>";
      }

      /* Daath — drawn as a veil, never as a sphere */
      svg += '<circle cx="' + DAATH.x + '" cy="' + DAATH.y + '" r="19" fill="none" ' +
        'stroke="var(--tree-line)" stroke-width="1" stroke-dasharray="3 4" opacity="0.75"/>' +
        '<text x="' + DAATH.x + '" y="' + (DAATH.y + 3) + '" text-anchor="middle" fill="var(--faint)" ' +
        'font-size="7" letter-spacing="1.1" font-family="Georgia,serif">DAATH</text>';

      svg += badges;

      /* sephiroth */
      for (const s of SEPHIROTH) {
        const isFocus = s.key === focus;
        const active = s.key === activeSeph || (activeP && (activeP.from === s.key || activeP.to === s.key));
        const stroke = active ? "var(--tree-hot)" : isFocus ? "var(--amber)" : "var(--tree-line)";
        const r = isFocus ? 30 : 27;
        svg += '<g class="tree-hit" data-seph="' + s.key + '">';
        svg += '<circle cx="' + s.x + '" cy="' + s.y + '" r="' + r + '" fill="var(--tree-node)" ' +
          'stroke="' + stroke + '" stroke-width="' + (isFocus || active ? 1.9 : 1.1) + '"' +
          (isFocus ? ' filter="url(#tree-focus)"' : "") + "/>";
        svg += '<text x="' + s.x + '" y="' + (s.y - 1) + '" text-anchor="middle" fill="' +
          (active || isFocus ? "var(--gold)" : "var(--muted)") + '" font-size="' +
          (s.key.length > 8 ? 7 : 7.8) + '" letter-spacing="0.6" font-family="Georgia,serif">' +
          s.key.toUpperCase() + "</text>";
        svg += '<text x="' + s.x + '" y="' + (s.y + 11) + '" text-anchor="middle" fill="var(--faint)" ' +
          'font-size="9">' + s.hebrew + "</text>";
        svg += '<circle cx="' + (s.x - r * 0.72) + '" cy="' + (s.y - r * 0.72) + '" r="7.5" ' +
          'fill="var(--tree-badge)" stroke="' + stroke + '" stroke-width="0.8"/>';
        svg += '<text x="' + (s.x - r * 0.72) + '" y="' + (s.y - r * 0.72 + 2.6) + '" text-anchor="middle" ' +
          'fill="' + (active || isFocus ? "var(--gold)" : "var(--faint)") + '" font-size="7" ' +
          'font-family="Georgia,serif">' + s.n + "</text>";
        svg += "</g>";
      }

      svg += '<defs><filter id="tree-glow" x="-40%" y="-40%" width="180%" height="180%">' +
        '<feGaussianBlur stdDeviation="2.4" result="b"/><feMerge><feMergeNode in="b"/>' +
        '<feMergeNode in="SourceGraphic"/></feMerge></filter>' +
        '<filter id="tree-focus" x="-60%" y="-60%" width="220%" height="220%">' +
        '<feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/>' +
        '<feMergeNode in="SourceGraphic"/></feMerge></filter></defs>';
      svg += "</svg>";
      stage.innerHTML = svg;

      renderReadout(activeP, activeSeph);
    }

    function renderReadout(p, sephKey) {
      if (p) {
        const a = BY_KEY[p.from];
        const b = BY_KEY[p.to];
        const glyph = window.GZ_GLYPHS ? window.GZ_GLYPHS.svg(p.glyph, { size: 13, cls: "glyph-cell" }) : "";
        /* the horizontals are reciprocal paths — nobody ascends them */
        const run = a.y === b.y
          ? esc(a.key) + " &harr; " + esc(b.key) + ", reciprocal"
          : esc(b.key) + " &rarr; " + esc(a.key) + " ascending";
        readout.innerHTML =
          "<strong>The " + p.n + ordinal(p.n) + " Path · " + p.letter + " " + esc(p.name) +
          ' <em>(' + esc(p.sense) + ")</em></strong>" +
          "<span>Key " + ROMAN[p.key] + ", " + esc(p.trump) + " &nbsp;·&nbsp; " + glyph +
          '<span class="tree-attr">' + esc(p.attr) + "</span> &nbsp;·&nbsp; " + run + "</span>" +
          '<span class="tree-sub">' + letterClass(p) + "</span>";
        return;
      }
      if (sephKey) {
        const s = BY_KEY[sephKey];
        const on = PATHS.filter((q) => q.from === sephKey || q.to === sephKey)
          .map((q) => q.n).sort((x, y) => x - y);
        const pillar = s.pillar === "middle" ? "Pillar of Mildness"
          : s.pillar === "left" ? "Pillar of Severity" : "Pillar of Mercy";
        readout.innerHTML =
          "<strong>" + s.n + ". " + esc(s.key) + " · " + s.hebrew + " <em>" + esc(s.title) + "</em></strong>" +
          "<span>" + esc(s.attr) + " &nbsp;·&nbsp; " + esc(s.grade) + "</span>" +
          '<span class="tree-sub">' + pillar + " &nbsp;·&nbsp; " + on.length +
          " paths meet here — " + on.join(", ") + "</span>";
        return;
      }
      readout.innerHTML =
        "<strong>The Tree, whole.</strong><span>Hover or tap any path or sephirah to read what it carries. " +
        "The badge on each path changes with the row above.</span>";
    }

    /* three mothers, seven doubles, twelve simples — the Sepher Yetzirah division */
    const MOTHERS = [11, 23, 31];
    const DOUBLES = [12, 13, 14, 21, 27, 30, 32];

    function letterClass(p) {
      if (MOTHERS.indexOf(p.n) >= 0) {
        return "A mother letter — Aleph air, Mem water, Shin fire: the three elements " +
          "from which the rest proceed.";
      }
      if (DOUBLES.indexOf(p.n) >= 0) {
        return "A double letter — one of the seven planets, " + esc(p.attr) +
          ". Each double carries a thing and its opposite.";
      }
      return "A simple letter — one of the twelve signs, " + esc(p.attr) +
        ", and one of the twelve months and senses.";
    }

    function ordinal(n) {
      if (n % 10 === 1 && n % 100 !== 11) return "st";
      if (n % 10 === 2 && n % 100 !== 12) return "nd";
      if (n % 10 === 3 && n % 100 !== 13) return "rd";
      return "th";
    }

    function targetOf(event) {
      const hit = event.target.closest(".tree-hit");
      if (!hit) return null;
      if (hit.dataset.path) return { type: "path", id: Number(hit.dataset.path) };
      if (hit.dataset.seph) return { type: "seph", id: hit.dataset.seph };
      return null;
    }

    stage.addEventListener("pointermove", (event) => {
      const found = targetOf(event);
      const same = (a, b) => (!a && !b) || (a && b && a.type === b.type && a.id === b.id);
      if (same(found, hovered)) return;
      hovered = found;
      render();
    });
    stage.addEventListener("pointerleave", () => {
      if (!hovered) return;
      hovered = null;
      render();
    });
    stage.addEventListener("click", (event) => {
      const found = targetOf(event);
      pinned = found && pinned && pinned.type === found.type && pinned.id === found.id ? null : found;
      hovered = found;
      render();
    });

    container.querySelector(".tree-modes").addEventListener("click", (event) => {
      const button = event.target.closest("button[data-mode]");
      if (!button) return;
      mode = button.dataset.mode;
      container.querySelectorAll(".tree-modes button").forEach((b) => b.classList.remove("is-on"));
      button.classList.add("is-on");
      render();
    });

    render();
  }

  window.GZ_TREE = { mount, paths: PATHS, sephiroth: SEPHIROTH };
})();
