/* GZ IAO — deterministic chart calculation.
   Wraps the vendored astronomy-engine (MIT, arcsecond-grade) and derives the
   astrological layers from its raw output. Everything here is calculated;
   nothing is interpreted. Requires vendor/astronomy.browser.min.js loaded
   first (exposes the global `Astronomy`). */
(function () {
  const A = window.Astronomy;
  if (!A) return;

  const SIGNS = [
    "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
    "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces",
  ];
  const SIGN_GLYPHS = ["♈", "♉", "♊", "♋", "♌", "♍", "♎", "♏", "♐", "♑", "♒", "♓"];
  const NAKSHATRAS = [
    "Ashwini", "Bharani", "Krittika", "Rohini", "Mrigashira", "Ardra",
    "Punarvasu", "Pushya", "Ashlesha", "Magha", "Purva Phalguni", "Uttara Phalguni",
    "Hasta", "Chitra", "Swati", "Vishakha", "Anuradha", "Jyeshtha",
    "Mula", "Purva Ashadha", "Uttara Ashadha", "Shravana", "Dhanishta", "Shatabhisha",
    "Purva Bhadrapada", "Uttara Bhadrapada", "Revati",
  ];
  const BODIES = [
    { key: "Sun", glyph: "☉" },
    { key: "Moon", glyph: "☽" },
    { key: "Mercury", glyph: "☿" },
    { key: "Venus", glyph: "♀" },
    { key: "Mars", glyph: "♂" },
    { key: "Jupiter", glyph: "♃" },
    { key: "Saturn", glyph: "♄" },
    { key: "Uranus", glyph: "♅" },
    { key: "Neptune", glyph: "♆" },
    { key: "Pluto", glyph: "♇" },
  ];
  const ASPECTS = [
    { name: "Conjunction", angle: 0, glyph: "☌" },
    { name: "Sextile", angle: 60, glyph: "⚹" },
    { name: "Square", angle: 90, glyph: "□" },
    { name: "Trine", angle: 120, glyph: "△" },
    { name: "Opposition", angle: 180, glyph: "☍" },
  ];

  const norm = (deg) => ((deg % 360) + 360) % 360;

  /* signed shortest separation a→b in degrees, range (-180, 180] */
  function separation(a, b) {
    let d = norm(b) - norm(a);
    if (d > 180) d -= 360;
    if (d <= -180) d += 360;
    return d;
  }

  /* Minutes are truncated, not rounded, so a label can never carry across a
     degree or sign boundary (29°59.97′ displays as 29°59′, matching the
     convention of most chart software). */
  function splitSign(lon) {
    const L = norm(lon);
    const sign = Math.floor(L / 30);
    const deg = L - sign * 30;
    const d = Math.floor(deg);
    const m = Math.floor((deg - d) * 60);
    return {
      sign: SIGNS[sign],
      glyph: SIGN_GLYPHS[sign],
      deg,
      label: d + "°" + String(m).padStart(2, "0") + "′ " + SIGNS[sign],
    };
  }

  function splitNakshatra(siderealLon) {
    const L = norm(siderealLon);
    const span = 360 / 27; // 13°20′
    const index = Math.floor(L / span);
    const within = L - index * span;
    const pada = Math.floor(within / (span / 4)) + 1;
    return { name: NAKSHATRAS[index], pada };
  }

  /* Lahiri (Chitrapaksha) ayanamsha, linear approximation around J2000:
     23°51′11″ at 2000-01-01, advancing with general precession ~50.29″/yr.
     Accurate to roughly ±1′ within about a century of J2000. */
  function lahiriAyanamsha(time) {
    const years = (time.tt - 0) / 365.25; // astronomy-engine time origin is J2000
    return 23.8531 + (50.2888 / 3600) * years;
  }

  /* geocentric apparent ecliptic-of-date longitude */
  function bodyLongitude(key, time) {
    if (key === "Sun") return A.SunPosition(time).elon;
    if (key === "Moon") return A.EclipticGeoMoon(time).lon;
    const vec = A.GeoVector(A.Body[key], time, true);
    const rot = A.Rotation_EQJ_ECT(time);
    return norm(A.SphereFromVector(A.RotateVector(rot, vec)).lon);
  }

  /* Ascendant + Midheaven from geographic coordinates.
     RAMC = local apparent sidereal time in degrees. */
  function anglesFor(time, latDeg, lonDeg) {
    const gastHours = A.SiderealTime(time); // Greenwich apparent sidereal time
    const ramc = norm(gastHours * 15 + lonDeg);
    const eps = A.e_tilt(time).tobl * (Math.PI / 180);
    const ramcR = ramc * (Math.PI / 180);
    const phi = latDeg * (Math.PI / 180);

    // Midheaven: ecliptic longitude whose right ascension equals RAMC
    let mc = Math.atan2(Math.sin(ramcR), Math.cos(ramcR) * Math.cos(eps)) * (180 / Math.PI);
    mc = norm(mc);

    // Ascendant (standard formula; atan2 keeps the quadrant correct at
    // ordinary latitudes)
    let asc = norm(
      Math.atan2(
        Math.cos(ramcR),
        -(Math.sin(ramcR) * Math.cos(eps) + Math.tan(phi) * Math.sin(eps))
      ) * (180 / Math.PI)
    );

    /* Above the polar circles the formula's branch can select the setting
       (western) intersection of ecliptic and horizon instead of the rising
       one. Standard practice (as in Swiss Ephemeris): the Ascendant must lie
       in the eastern half — i.e. 0° < (Asc − MC) mod 360 < 180°. If not,
       flip 180° to the true rising point. */
    const eastSep = norm(asc - mc);
    if (eastSep === 0 || eastSep >= 180) asc = norm(asc + 180);

    return { asc, mc, ramc };
  }

  function computeChart(dateUtc, options) {
    const opts = options || {};
    const time = A.MakeTime(dateUtc);
    const ayanamsha = lahiriAyanamsha(time);
    /* instantaneous motion via a centered ±30-minute difference, so the
       retrograde flag is correct even within hours of a station */
    const before = time.AddDays(-1 / 48);
    const after = time.AddDays(1 / 48);

    const placements = BODIES.map((body) => {
      const lon = norm(bodyLongitude(body.key, time));
      const speed =
        separation(bodyLongitude(body.key, before), bodyLongitude(body.key, after)) * 24;
      const sidereal = norm(lon - ayanamsha);
      return {
        body: body.key,
        glyph: body.glyph,
        lon,
        speed,
        retrograde: speed < 0,
        tropical: splitSign(lon),
        siderealLon: sidereal,
        sidereal: splitSign(sidereal),
        nakshatra: splitNakshatra(sidereal),
      };
    });

    /* aspects between distinct bodies; wider orb when a luminary is involved */
    const aspects = [];
    for (let i = 0; i < placements.length; i++) {
      for (let j = i + 1; j < placements.length; j++) {
        const sep = Math.abs(separation(placements[i].lon, placements[j].lon));
        for (const aspect of ASPECTS) {
          const luminary = i < 2 || j < 2; // Sun or Moon
          const orb = luminary ? 8 : 6;
          const off = Math.abs(sep - aspect.angle);
          if (off <= orb) {
            aspects.push({
              a: placements[i].body,
              aGlyph: placements[i].glyph,
              b: placements[j].body,
              bGlyph: placements[j].glyph,
              type: aspect.name,
              typeGlyph: aspect.glyph,
              orb: off,
            });
            break;
          }
        }
      }
    }
    aspects.sort((x, y) => x.orb - y.orb);

    const phaseAngle = norm(A.MoonPhase(time)); // 0=new, 180=full
    const chart = {
      utc: dateUtc.toISOString(),
      ayanamsha,
      placements,
      aspects,
      moonPhaseAngle: phaseAngle,
      timeUnknown: Boolean(opts.timeUnknown),
    };

    /* the Ascendant is geometrically undefined at the poles themselves */
    const latValid = Number.isFinite(opts.lat) && Math.abs(opts.lat) <= 89.5;
    if (latValid && Number.isFinite(opts.lon) && !opts.timeUnknown) {
      const angles = anglesFor(time, opts.lat, opts.lon);
      chart.angles = {
        asc: angles.asc,
        ascSplit: splitSign(angles.asc),
        ascSidereal: splitSign(norm(angles.asc - ayanamsha)),
        mc: angles.mc,
        mcSplit: splitSign(angles.mc),
        mcSidereal: splitSign(norm(angles.mc - ayanamsha)),
        lat: opts.lat,
        lonGeo: opts.lon,
      };
    }
    return chart;
  }

  /* ------------------------------------------------------------------ */
  /* Synastry: every inter-aspect between two computed charts.           */
  /* Both sets of positions are fixed, so there is no applying or        */
  /* separating — only the orb, which is reported exactly.               */
  /* ------------------------------------------------------------------ */

  const ELEMENTS = ["Fire", "Earth", "Air", "Water"];
  const MODALITIES = ["Cardinal", "Fixed", "Mutable"];

  function chartPoints(chart, includeAngles) {
    const points = chart.placements.map((p) => ({
      key: p.body, glyph: p.glyph, lon: p.lon, kind: "body",
    }));
    if (includeAngles !== false && chart.angles) {
      points.push({ key: "Ascendant", glyph: "Asc", lon: chart.angles.asc, kind: "angle" });
      points.push({ key: "Midheaven", glyph: "MC", lon: chart.angles.mc, kind: "angle" });
    }
    return points;
  }

  function elementBalance(chart) {
    const elements = [0, 0, 0, 0];
    const modalities = [0, 0, 0];
    for (const p of chart.placements) {
      const signIndex = SIGNS.indexOf(p.tropical.sign);
      elements[signIndex % 4] += 1;
      modalities[signIndex % 3] += 1;
    }
    return {
      elements: ELEMENTS.map((name, i) => ({ name, count: elements[i] })),
      modalities: MODALITIES.map((name, i) => ({ name, count: modalities[i] })),
    };
  }

  function computeSynastry(chartA, chartB) {
    const pointsA = chartPoints(chartA);
    const pointsB = chartPoints(chartB);
    const aspects = [];
    for (const a of pointsA) {
      for (const b of pointsB) {
        const sep = Math.abs(separation(a.lon, b.lon));
        for (const aspect of ASPECTS) {
          const luminary = a.key === "Sun" || a.key === "Moon" || b.key === "Sun" || b.key === "Moon";
          const orb = a.kind === "angle" || b.kind === "angle" ? 5 : luminary ? 8 : 6;
          const off = Math.abs(sep - aspect.angle);
          if (off <= orb) {
            aspects.push({
              a: a.key, aGlyph: a.glyph, b: b.key, bGlyph: b.glyph,
              type: aspect.name, typeGlyph: aspect.glyph, angle: aspect.angle, orb: off,
            });
            break;
          }
        }
      }
    }
    aspects.sort((x, y) => x.orb - y.orb);
    const tally = { Conjunction: 0, Sextile: 0, Square: 0, Trine: 0, Opposition: 0 };
    for (const hit of aspects) tally[hit.type] += 1;
    /* pairs aspected in both directions between the same two bodies
       (e.g. her Moon–his Sun and her Sun–his Moon) — the classic
       "double whammy", reported as a count, not a verdict */
    const mutual = [];
    for (const hit of aspects) {
      if (hit.a === hit.b) continue;
      const twin = aspects.find((other) => other.a === hit.b && other.b === hit.a);
      if (twin && !mutual.some((m) => (m[0] === hit.b && m[1] === hit.a))) {
        mutual.push([hit.a, hit.b]);
      }
    }
    return {
      aspects,
      tally,
      mutualPairs: mutual,
      balanceA: elementBalance(chartA),
      balanceB: elementBalance(chartB),
    };
  }

  /* ------------------------------------------------------------------ */
  /* Transits: the exact moments when a moving body reaches an aspect    */
  /* to a fixed natal point, found by root-finding on the continuous     */
  /* relative longitude — every pass of a retrograde loop is reported.   */
  /* ------------------------------------------------------------------ */

  /* per-body sample step in days — small enough that a body cannot move
     anywhere near 180° between samples, so no crossing can be skipped */
  const TRANSIT_STEP = {
    Sun: 1, Moon: 0.2, Mercury: 0.5, Venus: 0.5, Mars: 1,
    Jupiter: 2, Saturn: 2, Uranus: 3, Neptune: 3, Pluto: 3,
  };

  function computeTransits(natalChart, startUtc, days, options) {
    const opts = options || {};
    const includeMoon = opts.includeMoon !== undefined ? opts.includeMoon : days <= 10;
    const natalPoints = chartPoints(natalChart, opts.includeAngles);
    const bodies = BODIES.filter((b) => includeMoon || b.key !== "Moon");
    /* aspect targets across the full circle: A and 360−A */
    const targets = [];
    for (const aspect of ASPECTS) {
      targets.push({ angle: aspect.angle, aspect });
      if (aspect.angle > 0 && aspect.angle < 180) targets.push({ angle: 360 - aspect.angle, aspect });
    }
    const startTime = A.MakeTime(startUtc);
    const hits = [];

    for (const body of bodies) {
      const step = TRANSIT_STEP[body.key] || 1;
      const samples = [];
      for (let d = 0; d <= days + 1e-9; d += step) {
        const t = startTime.AddDays(Math.min(d, days));
        samples.push({ d: Math.min(d, days), lonRaw: norm(bodyLongitude(body.key, t)) });
        if (d >= days) break;
      }
      if (samples[samples.length - 1].d < days) {
        samples.push({ d: days, lonRaw: norm(bodyLongitude(body.key, startTime.AddDays(days))) });
      }
      for (const point of natalPoints) {
        if (point.key === body.key && body.key !== "Sun" && body.key !== "Moon" && point.kind === "body") {
          /* a slow body transiting its own natal place is a return too —
             keep it; nothing to skip here */
        }
        /* unwrap the relative longitude into a continuous series */
        let prevU = norm(samples[0].lonRaw - point.lon);
        const unwrapped = [prevU];
        for (let i = 1; i < samples.length; i++) {
          const raw = norm(samples[i].lonRaw - point.lon);
          prevU = prevU + separation(norm(prevU), raw);
          unwrapped.push(prevU);
        }
        for (let i = 1; i < samples.length; i++) {
          const u0 = unwrapped[i - 1];
          const u1 = unwrapped[i];
          const lo = Math.min(u0, u1);
          const hi = Math.max(u0, u1);
          if (hi - lo < 1e-9) continue;
          for (const target of targets) {
            /* every representation target.angle + 360k inside [lo, hi] is a crossing */
            for (let k = Math.ceil((lo - target.angle) / 360); target.angle + 360 * k <= hi; k++) {
              const T = target.angle + 360 * k;
              if (T < lo) continue;
              /* bisect the crossing time to well under a minute */
              let d0 = samples[i - 1].d, d1 = samples[i].d;
              let v0 = u0 - T;
              for (let iter = 0; iter < 22; iter++) {
                const dm = (d0 + d1) / 2;
                const rawM = norm(bodyLongitude(body.key, startTime.AddDays(dm)) - point.lon);
                /* re-anchor against u0 so the unwrap stays consistent */
                const um = u0 + separation(norm(u0), rawM);
                if ((um - T) * v0 <= 0) d1 = dm; else { d0 = dm; v0 = um - T; }
              }
              const dHit = (d0 + d1) / 2;
              const tHit = startTime.AddDays(dHit);
              const speed = separation(
                bodyLongitude(body.key, tHit.AddDays(-1 / 48)),
                bodyLongitude(body.key, tHit.AddDays(1 / 48))
              ) * 24;
              hits.push({
                when: new Date(startUtc.getTime() + dHit * 86400000),
                dayOffset: dHit,
                body: body.key,
                bodyGlyph: body.glyph,
                retrograde: speed < 0,
                point: point.key,
                pointGlyph: point.glyph,
                pointKind: point.kind,
                type: target.aspect.name,
                typeGlyph: target.aspect.glyph,
                angle: target.aspect.angle,
                isReturn: body.key === point.key && point.kind === "body" && target.aspect.angle === 0,
              });
            }
          }
        }
      }
    }
    hits.sort((x, y) => x.dayOffset - y.dayOffset);
    return hits;
  }

  window.GZ_ASTRO = {
    computeChart, computeSynastry, computeTransits,
    splitSign, SIGNS, SIGN_GLYPHS,
  };
})();
