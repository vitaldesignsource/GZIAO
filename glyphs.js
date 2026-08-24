/* GZ IAO — astrological glyph library.
   Hand-drawn SVG stroke paths on a 24×24 grid, replacing Unicode characters
   (which render as emoji on Apple platforms). Everything inherits
   currentColor, so glyphs theme and tint like text. */
(function () {
  const P = {
    /* ---- planets ---- */
    Sun: '<circle cx="12" cy="12" r="6.4"/><circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none"/>',
    Moon: '<path d="M15.6 3.9a8.8 8.8 0 1 0 0 16.2a9.1 9.1 0 0 1 0-16.2Z"/>',
    Mercury:
      '<circle cx="12" cy="12.6" r="4.4"/><path d="M12 17v5M9.4 20h5.2M7.7 4.2a4.4 4.4 0 0 0 8.6 0"/>',
    Venus: '<circle cx="12" cy="9" r="5.2"/><path d="M12 14.2v7M8.8 18h6.4"/>',
    Mars: '<circle cx="10" cy="14" r="5.4"/><path d="M13.9 10.1L20 4m0 0h-5.4M20 4v5.4"/>',
    Jupiter:
      '<path d="M5 6.2c.6-2.4 4.6-3.4 6.2-1 1.4 2.2-.4 4.6-5.4 10.3h13M15.2 10.8v10.4"/>',
    Saturn:
      '<path d="M8.2 3.6v13M5.4 6.8h5.6M8.2 11.3c1.6-1.9 5.7-2 6.9.7 1.1 2.5-.8 4.9-2.4 6.8-.9 1.1-.6 2.4.6 2.9"/>',
    Uranus:
      '<circle cx="12" cy="17.2" r="3.2"/><circle cx="12" cy="17.2" r=".9" fill="currentColor" stroke="none"/><path d="M12 14V7M7.6 3.4v7.2M16.4 3.4v7.2M7.6 7h8.8"/>',
    Neptune:
      '<path d="M12 4.6V21M9 18.4h6M6.4 5v4.2a5.6 5.6 0 0 0 11.2 0V5M4.8 6.8L6.4 5l1.6 1.8M16 6.8L17.6 5l1.6 1.8M10.4 6.4L12 4.6l1.6 1.8"/>',
    Pluto:
      '<circle cx="12" cy="7" r="2.7"/><path d="M6.3 6.4a5.8 5.8 0 0 0 11.4 0M12 12.8v8M9.2 18h5.6"/>',

    /* ---- zodiac ---- */
    Aries:
      '<path d="M12 20.2V9.6C12 5.8 9.8 3.9 7.6 4.4 5.5 4.9 4.8 7.4 5.8 9.2M12 9.6C12 5.8 14.2 3.9 16.4 4.4c2.1.5 2.8 3 1.8 4.8"/>',
    Taurus:
      '<circle cx="12" cy="14.4" r="5.8"/><path d="M5 4a7.1 7.1 0 0 0 14 0"/>',
    Gemini:
      '<path d="M8.6 6.2v11.6M15.4 6.2v11.6M4.6 4.2c4.7 2.1 10.1 2.1 14.8 0M4.6 19.8c4.7-2.1 10.1-2.1 14.8 0"/>',
    Cancer:
      '<circle cx="8" cy="8.6" r="2.9"/><circle cx="16" cy="15.4" r="2.9"/><path d="M10.9 8.4c3-.4 6.4.1 8.9 2.1M13.1 15.6c-3 .4-6.4-.1-8.9-2.1"/>',
    Leo: '<circle cx="7.8" cy="15.8" r="3"/><path d="M8.6 12.9c-.6-4.6 1.8-8.3 4.8-8.5 2.8-.2 4.3 2.3 3.4 5.2-.8 2.7-2.4 4.8-2.4 7 0 1.7 1.2 2.6 2.8 2.2"/>',
    Virgo:
      '<path d="M4.4 18.6V8.8c0-2.6 3.2-2.6 3.2 0v9.8M7.6 8.8c0-2.6 3.4-2.6 3.4 0v9.8M11 8.8c0-2.6 3.5-2.6 3.5 0v6.4c0 3.4 2.2 4.6 4.5 3.6M14.5 15.2c2.4.7 3.4 3.2 2 6.2"/>',
    Libra:
      '<path d="M4.6 19.6h14.8M4.6 15.4h4.2a5.4 5.4 0 1 1 6.4 0h4.2"/>',
    Scorpio:
      '<path d="M4.4 18.6V8.8c0-2.6 3.2-2.6 3.2 0v9.8M7.6 8.8c0-2.6 3.4-2.6 3.4 0v9.8M11 8.8c0-2.6 3.5-2.6 3.5 0v6.6c0 2.4 1.3 3.4 3.2 3.4h2.6M20.3 18.8l-2.2-2.2M20.3 18.8l-2.2 2.2"/>',
    Sagittarius:
      '<path d="M5 19.4L18.8 5.6m0 0h-5.6M18.8 5.6v5.6M8 10.2l5.8 5.8"/>',
    Capricorn:
      '<path d="M4.4 5.6l3.6 9.2 3.6-9.2c1 3 1.9 6.6 1.9 9.6 0 3.6 4.6 4.4 4.6.7 0-2.8-3.2-2.6-4.2-.4"/>',
    Aquarius:
      '<path d="M4.4 9.8l3.6-3.2 3.7 3.2 3.6-3.2 3.7 3.2M4.4 17l3.6-3.2 3.7 3.2 3.6-3.2 3.7 3.2"/>',
    Pisces:
      '<path d="M7.6 4.4a10.6 10.6 0 0 1 0 15.2M16.4 4.4a10.6 10.6 0 0 0 0 15.2M5.8 12h12.4"/>',

    /* ---- elements (the alchemical triangles) ---- */
    Fire: '<path d="M12 3.6L21 19.4H3Z"/>',
    Water: '<path d="M12 20.4L3 4.6h18Z"/>',
    Air: '<path d="M12 3.6L21 19.4H3Z"/><path d="M6.4 14.8h11.2"/>',
    Earth: '<path d="M12 20.4L3 4.6h18Z"/><path d="M6.4 9.2h11.2"/>',
    Spirit: '<circle cx="12" cy="12" r="8.2"/><path d="M12 3.8v16.4M3.8 12h16.4"/>',

    /* ---- aspects ---- */
    Conjunction: '<circle cx="9.4" cy="14.6" r="4.6"/><path d="M12.7 11.3L19 5"/>',
    Sextile:
      '<path d="M12 4.6v14.8M5.6 8.3l12.8 7.4M5.6 15.7l12.8-7.4"/>',
    Square: '<rect x="6" y="6" width="12" height="12"/>',
    Trine: '<path d="M12 5L19 18.6H5Z"/>',
    Opposition:
      '<circle cx="7.2" cy="16.8" r="3.4"/><circle cx="16.8" cy="7.2" r="3.4"/><path d="M9.6 14.4l4.8-4.8"/>',

    /* ---- states ---- */
    Retrograde:
      '<path d="M7.4 20V4.6h5a3.9 3.9 0 0 1 0 7.8h-5M10.8 12.4L15.6 20M11.4 17.4l6-3.6"/>',
  };

  function svg(name, options) {
    const opts = options || {};
    const body = P[name];
    if (!body) return "";
    const size = opts.size || 16;
    return (
      '<svg class="glyph' + (opts.cls ? " " + opts.cls : "") + '" viewBox="0 0 24 24" ' +
      'width="' + size + '" height="' + size + '" fill="none" stroke="currentColor" ' +
      'stroke-width="' + (opts.weight || 1.7) + '" stroke-linecap="round" stroke-linejoin="round" ' +
      'aria-hidden="true"' + (opts.style ? ' style="' + opts.style + '"' : "") + ">" +
      body + "</svg>"
    );
  }

  /* raw inner markup for embedding inside an existing <svg>, wrapped in a
     positioned/scaled group */
  function group(name, x, y, size, color, weight) {
    const body = P[name];
    if (!body) return "";
    const s = (size || 14) / 24;
    return (
      '<g transform="translate(' + (x - (size || 14) / 2) + ',' + (y - (size || 14) / 2) + ') scale(' + s + ')" ' +
      'fill="none" stroke="' + (color || "currentColor") + '" style="color:' + (color || "inherit") + '" ' +
      'stroke-width="' + ((weight || 1.6) / s).toFixed(2) + '" ' +
      'stroke-linecap="round" stroke-linejoin="round">' + body + "</g>"
    );
  }

  window.GZ_GLYPHS = { paths: P, svg, group };
})();
