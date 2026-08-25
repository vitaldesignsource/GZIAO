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

  /* ------------------------------------------------------------------ */
  /* Placidus houses, solved from the definition: an intermediate cusp   */
  /* is the ecliptic point whose time from upper culmination is a fixed  */
  /* fraction of its own diurnal (or nocturnal) semi-arc. Rather than    */
  /* trust a textbook iteration, we bisect the defining equation and     */
  /* then verify the property holds — nothing arbitrary.                 */
  /* ------------------------------------------------------------------ */

  const D2R = Math.PI / 180;
  const R2D = 180 / Math.PI;

  /* ecliptic-of-date longitude → right ascension and declination */
  function eclToEq(lonDeg, epsDeg) {
    const L = lonDeg * D2R;
    const E = epsDeg * D2R;
    const alpha = norm(Math.atan2(Math.sin(L) * Math.cos(E), Math.cos(L)) * R2D);
    const delta = Math.asin(Math.sin(L) * Math.sin(E)) * R2D;
    return { alpha, delta };
  }

  function placidusHouses(time, latDeg, lonDeg) {
    const eps = A.e_tilt(time).tobl;
    const { asc, mc, ramc } = anglesFor(time, latDeg, lonDeg);
    const phi = latDeg * D2R;

    /* time from upper culmination (in degrees of rotation), 0 at MC,
       growing eastward to 180 at IC, for the ecliptic point at lonDeg */
    const untilCulmination = (lon) => norm(eclToEq(lon, eps).alpha - ramc);

    /* diurnal semi-arc of the ecliptic point; null when circumpolar */
    const semiArc = (lon) => {
      const delta = eclToEq(lon, eps).delta * D2R;
      const x = -Math.tan(phi) * Math.tan(delta);
      if (x < -1 || x > 1) return null;
      return Math.acos(x) * R2D;
    };

    /* g(λ) = time-from-culmination − target-fraction-of-semi-arc.
       diurnal=true targets f·SA (houses 11, 12); false targets
       SA + f·(180−SA) (houses 2, 3). */
    const residual = (lon, f, diurnal) => {
      const sa = semiArc(lon);
      if (sa === null) return null;
      const t = untilCulmination(lon);
      return t - (diurnal ? f * sa : sa + f * (180 - sa));
    };

    /* bisect g over the ecliptic arc (from, to) measured eastward */
    const solveCusp = (fromLon, toLon, f, diurnal) => {
      const span = norm(toLon - fromLon);
      let lo = 0, hi = span;
      let gLo = residual(fromLon, f, diurnal);
      let gHi = residual(toLon, f, diurnal);
      if (gLo === null || gHi === null) return null;
      /* untilCulmination wraps at the MC itself — nudge off the endpoint */
      if (gLo > 0) { gLo = residual(norm(fromLon + 0.01), f, diurnal); lo = 0.01; }
      if (gLo === null || gLo > 0 || gHi < 0) return null;
      for (let iter = 0; iter < 60; iter++) {
        const mid = (lo + hi) / 2;
        const g = residual(norm(fromLon + mid), f, diurnal);
        if (g === null) return null;
        if (g < 0) lo = mid; else hi = mid;
      }
      const lon = norm(fromLon + (lo + hi) / 2);
      /* verify the defining property actually holds at the solution */
      const check = residual(lon, f, diurnal);
      if (check === null || Math.abs(check) > 0.001) return null;
      return lon;
    };

    const ic = norm(mc + 180);
    const c11 = solveCusp(mc, asc, 1 / 3, true);
    const c12 = solveCusp(mc, asc, 2 / 3, true);
    const c2 = solveCusp(asc, ic, 1 / 3, false);
    const c3 = solveCusp(asc, ic, 2 / 3, false);

    let system = "Placidus";
    let cusps;
    if (c11 === null || c12 === null || c2 === null || c3 === null) {
      /* circumpolar ecliptic — Placidus is undefined; fall back to
         Porphyry (each quadrant of the ecliptic trisected) and say so */
      system = "Porphyry (polar fallback)";
      const q1 = norm(asc - mc) / 3;     // MC → Asc
      const q2 = norm(ic - asc) / 3;     // Asc → IC
      cusps = [
        asc, norm(asc + q2), norm(asc + 2 * q2), ic,
        norm(ic + q1), norm(ic + 2 * q1), norm(asc + 180),
        norm(asc + 180 + q2), norm(asc + 180 + 2 * q2), mc,
        norm(mc + q1), norm(mc + 2 * q1),
      ];
    } else {
      cusps = [
        asc, norm(c2), norm(c3), ic,
        norm(c11 + 180), norm(c12 + 180), norm(asc + 180),
        norm(c2 + 180), norm(c3 + 180), mc,
        norm(c11), norm(c12),
      ];
    }
    return { system, cusps, asc, mc, ramc };
  }

  /* which house (1-12) a longitude falls in, given the cusp array */
  function houseOf(lon, cusps) {
    for (let h = 0; h < 12; h++) {
      const start = cusps[h];
      const end = cusps[(h + 1) % 12];
      const width = norm(end - start);
      if (norm(lon - start) < width) return h + 1;
    }
    return 12;
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
    /* remember where the cast stood, so a chart can be re-cast at another
       instant for the same place (time-scrolling the wheel) */
    if (Number.isFinite(opts.lat) && Number.isFinite(opts.lon)) {
      chart.location = { lat: opts.lat, lon: opts.lon };
    }

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
      /* houses come with the angles — Placidus, with a stated fallback */
      const houses = placidusHouses(time, opts.lat, opts.lon);
      chart.houses = {
        system: houses.system,
        cusps: houses.cusps.map((lon, i) => ({
          house: i + 1, lon, split: splitSign(lon),
        })),
      };
      for (const place of placements) {
        place.house = houseOf(place.lon, houses.cusps);
      }
    }
    return chart;
  }

  /* ------------------------------------------------------------------ */
  /* Composite: the midpoint chart of two natals — each body at the      */
  /* shorter-arc midpoint of the pair, with the composite's own internal */
  /* aspects. Midpoints have no motion, so no speeds and no retrogrades, */
  /* and without a shared birth moment there are no angles or houses.    */
  /* ------------------------------------------------------------------ */

  function midpointLon(a, b) {
    return norm(a + separation(a, b) / 2);
  }

  function computeComposite(chartA, chartB) {
    const placements = chartA.placements.map((pa) => {
      const pb = chartB.placements.find((p) => p.body === pa.body);
      const lon = midpointLon(pa.lon, pb.lon);
      return {
        body: pa.body,
        glyph: pa.glyph,
        lon,
        tropical: splitSign(lon),
        fromA: pa.tropical.label,
        fromB: pb.tropical.label,
      };
    });
    const aspects = [];
    for (let i = 0; i < placements.length; i++) {
      for (let j = i + 1; j < placements.length; j++) {
        const sep = Math.abs(separation(placements[i].lon, placements[j].lon));
        for (const aspect of ASPECTS) {
          const luminary = i < 2 || j < 2;
          const orb = luminary ? 8 : 6;
          const off = Math.abs(sep - aspect.angle);
          if (off <= orb) {
            aspects.push({
              a: placements[i].body, aGlyph: placements[i].glyph,
              b: placements[j].body, bGlyph: placements[j].glyph,
              type: aspect.name, typeGlyph: aspect.glyph, orb: off,
            });
            break;
          }
        }
      }
    }
    aspects.sort((x, y) => x.orb - y.orb);
    const sun = placements.find((p) => p.body === "Sun");
    const moon = placements.find((p) => p.body === "Moon");
    return {
      method: "midpoint",
      placements,
      aspects,
      moonPhaseAngle: norm(moon.lon - sun.lon),
      timeUnknown: Boolean(chartA.timeUnknown || chartB.timeUnknown),
    };
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

  /* ------------------------------------------------------------------ */
  /* Planetary hours: the day runs sunrise to sunrise, split into twelve  */
  /* unequal hours of day and twelve of night. The first hour of the day  */
  /* belongs to the weekday's ruler; the rest follow the Chaldean order.  */
  /* Sunrise and sunset come from the ephemeris, not from approximation.  */
  /* ------------------------------------------------------------------ */

  const CHALDEAN = ["Saturn", "Jupiter", "Mars", "Sun", "Venus", "Mercury", "Moon"];
  /* weekday (0=Sunday) → its ruler's index in the Chaldean sequence */
  const DAY_RULER_INDEX = [3, 6, 2, 5, 1, 4, 0]; // Sun Moon Mars Mercury Jupiter Venus Saturn

  function weekdayInZone(dateUtc, zone) {
    try {
      const name = new Intl.DateTimeFormat("en-US", { timeZone: zone, weekday: "short" }).format(dateUtc);
      return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(name);
    } catch (error) {
      return dateUtc.getUTCDay();
    }
  }

  /* the sunrise/sunset events bracketing the instant, found by search */
  function sunEventsAround(dateUtc, lat, lon) {
    const observer = new A.Observer(lat, lon, 0);
    const start = A.MakeTime(new Date(dateUtc.getTime() - 2 * 86400000));
    const events = [];
    for (const dir of [+1, -1]) {
      let cursor = start;
      for (let i = 0; i < 5; i++) {
        const found = A.SearchRiseSet(A.Body.Sun, observer, dir, cursor, 2);
        if (!found) break;
        events.push({ kind: dir > 0 ? "rise" : "set", when: found.date });
        cursor = found.AddDays(0.05);
        if (found.date.getTime() > dateUtc.getTime() + 2 * 86400000) break;
      }
    }
    events.sort((x, y) => x.when - y.when);
    return events;
  }

  function planetaryHour(dateUtc, lat, lon, zone) {
    let events;
    try {
      events = sunEventsAround(dateUtc, lat, lon);
    } catch (error) {
      return null;
    }
    const t = dateUtc.getTime();
    const lastRise = [...events].reverse().find((e) => e.kind === "rise" && e.when.getTime() <= t);
    const lastSet = [...events].reverse().find((e) => e.kind === "set" && e.when.getTime() <= t);
    if (!lastRise) return null; // polar conditions — no honest answer
    const isDay = !lastSet || lastRise.when.getTime() > lastSet.when.getTime();
    let index, hourStart, hourEnd;
    if (isDay) {
      const nextSet = events.find((e) => e.kind === "set" && e.when.getTime() > lastRise.when.getTime());
      if (!nextSet) return null;
      const span = (nextSet.when.getTime() - lastRise.when.getTime()) / 12;
      index = Math.min(11, Math.floor((t - lastRise.when.getTime()) / span));
      hourStart = new Date(lastRise.when.getTime() + index * span);
      hourEnd = new Date(lastRise.when.getTime() + (index + 1) * span);
    } else {
      const nextRise = events.find((e) => e.kind === "rise" && e.when.getTime() > lastSet.when.getTime());
      if (!nextRise) return null;
      const span = (nextRise.when.getTime() - lastSet.when.getTime()) / 12;
      index = 12 + Math.min(11, Math.floor((t - lastSet.when.getTime()) / span));
      hourStart = new Date(lastSet.when.getTime() + (index - 12) * span);
      hourEnd = new Date(lastSet.when.getTime() + (index - 11) * span);
    }
    /* the planetary day began at the last sunrise; its weekday names the ruler */
    const weekday = weekdayInZone(lastRise.when, zone);
    const startIndex = DAY_RULER_INDEX[weekday];
    const ruler = CHALDEAN[(startIndex + index) % 7];
    return {
      ruler,
      index: index + 1,          // 1..24
      isDay,
      dayRuler: CHALDEAN[startIndex],
      hourStart: hourStart.toISOString(),
      hourEnd: hourEnd.toISOString(),
      sunrise: lastRise.when.toISOString(),
    };
  }

  /* the moment's sky, reduced to a journal stamp */
  const PHASE_NAMES = [
    [22.5, "New Moon"], [67.5, "Waxing Crescent"], [112.5, "First Quarter"],
    [157.5, "Waxing Gibbous"], [202.5, "Full Moon"], [247.5, "Waning Gibbous"],
    [292.5, "Last Quarter"], [337.5, "Waning Crescent"], [360.1, "New Moon"],
  ];

  function celestialStamp(dateUtc, lat, lon, zone) {
    const time = A.MakeTime(dateUtc);
    const sunLon = A.SunPosition(time).elon;
    const moonLon = A.EclipticGeoMoon(time).lon;
    const phaseAngle = norm(A.MoonPhase(time));
    const stamp = {
      utc: dateUtc.toISOString(),
      sun: splitSign(sunLon),
      moon: splitSign(moonLon),
      phaseAngle,
      phaseName: PHASE_NAMES.find(([limit]) => phaseAngle < limit)[1],
      illumination: (1 - Math.cos(phaseAngle * Math.PI / 180)) / 2,
    };
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      stamp.hour = planetaryHour(dateUtc, lat, lon, zone);
    }
    return stamp;
  }

  /* ------------------------------------------------------------------ */
  /* The ladder's upper rungs: progressions, returns, and dashas.        */
  /* ------------------------------------------------------------------ */

  /* Secondary progressions — a day for a year. The progressed chart is
     the real sky of (birth + age-in-years DAYS), cast by the same
     ephemeris as everything else. Angles are omitted: progressed angles
     require a rate convention (solar arc, Naibod…) that is a choice,
     not a fact, and this system does not smuggle choices in as facts. */
  function computeProgressed(birthUtc, targetUtc) {
    const ageYears = (targetUtc.getTime() - birthUtc.getTime()) / (365.2425 * 86400000);
    const progressedInstant = new Date(birthUtc.getTime() + ageYears * 86400000);
    const chart = computeChart(progressedInstant);
    return { ageYears, progressedInstant: progressedInstant.toISOString(), chart };
  }

  /* the instant a body returns to an exact natal longitude, found by
     bisection on the signed separation in a window around a guess */
  function returnInstant(bodyKey, natalLon, guessUtc, windowDays) {
    const startTime = A.MakeTime(new Date(guessUtc.getTime() - windowDays * 86400000));
    const total = windowDays * 2;
    const step = bodyKey === "Moon" ? 0.2 : 0.5;
    let prev = separation(natalLon, bodyLongitude(bodyKey, startTime));
    let prevD = 0;
    for (let d = step; d <= total + 1e-9; d += step) {
      const cur = separation(natalLon, bodyLongitude(bodyKey, startTime.AddDays(d)));
      /* a return is a crossing of 0 moving forward (prev<0 → cur>=0) */
      if (prev < 0 && cur >= 0 && cur - prev < 180) {
        let lo = prevD, hi = d;
        for (let iter = 0; iter < 40; iter++) {
          const mid = (lo + hi) / 2;
          const v = separation(natalLon, bodyLongitude(bodyKey, startTime.AddDays(mid)));
          if (v < 0) lo = mid; else hi = mid;
        }
        const dHit = (lo + hi) / 2;
        return new Date(startTime.date.getTime() + dHit * 86400000);
      }
      prev = cur;
      prevD = d;
    }
    return null;
  }

  /* the solar return for the birthday falling in `year` */
  function solarReturn(natalSunLon, birthUtc, year, opts) {
    const guess = new Date(Date.UTC(
      year, birthUtc.getUTCMonth(), Math.min(28, birthUtc.getUTCDate()),
      birthUtc.getUTCHours(), birthUtc.getUTCMinutes()
    ));
    const when = returnInstant("Sun", natalSunLon, guess, 5);
    if (!when) return null;
    return { when: when.toISOString(), chart: computeChart(when, opts || {}) };
  }

  /* the next `count` lunar returns from `fromUtc` */
  function lunarReturns(natalMoonLon, fromUtc, count) {
    const out = [];
    let cursor = new Date(fromUtc.getTime());
    for (let i = 0; i < count; i++) {
      /* the next return lies within one sidereal month of the cursor */
      const guess = new Date(cursor.getTime() + 13.66 * 86400000);
      const when = returnInstant("Moon", natalMoonLon, guess, 14.5);
      if (!when || when.getTime() <= cursor.getTime()) break;
      out.push(when.toISOString());
      cursor = new Date(when.getTime() + 86400000);
    }
    return out;
  }

  /* Vimshottari dasha — the 120-year cycle seeded by the natal Moon's
     nakshatra. Years are 365.25 days by convention, stated plainly. */
  const DASHA_SEQUENCE = [
    ["Ketu", 7], ["Venus", 20], ["Sun", 6], ["Moon", 10], ["Mars", 7],
    ["Rahu", 18], ["Jupiter", 16], ["Saturn", 19], ["Mercury", 17],
  ];
  const DASHA_YEAR_MS = 365.25 * 86400000;

  function vimshottari(natalChart, birthUtc, horizonYears) {
    const moon = natalChart.placements.find((p) => p.body === "Moon");
    const span = 360 / 27;
    const sidereal = norm(moon.siderealLon);
    const nakIndex = Math.floor(sidereal / span);
    const fraction = (sidereal - nakIndex * span) / span; // traversed
    const startLordIndex = nakIndex % 9;
    const balanceYears = DASHA_SEQUENCE[startLordIndex][1] * (1 - fraction);

    const mahas = [];
    let cursor = birthUtc.getTime();
    const horizon = birthUtc.getTime() + (horizonYears || 120) * DASHA_YEAR_MS;
    for (let i = 0; i < 9 && cursor < horizon; i++) {
      const [lord, years] = DASHA_SEQUENCE[(startLordIndex + i) % 9];
      const lengthYears = i === 0 ? balanceYears : years;
      const end = cursor + lengthYears * DASHA_YEAR_MS;
      /* antardashas subdivide the maha proportionally, beginning with the
         maha lord; the first maha's antars are the TAIL of a full maha —
         computed on the full-length maha, clipped to birth */
      const fullStart = i === 0 ? end - years * DASHA_YEAR_MS : cursor;
      const antars = [];
      let antarCursor = fullStart;
      for (let j = 0; j < 9; j++) {
        const [antarLord, antarYears] = DASHA_SEQUENCE[((startLordIndex + i) % 9 + j) % 9];
        const antarLength = (years * antarYears / 120) * DASHA_YEAR_MS;
        const antarEnd = antarCursor + antarLength;
        if (antarEnd > cursor + 1000) {
          antars.push({
            lord: antarLord,
            start: new Date(Math.max(antarCursor, cursor)).toISOString(),
            end: new Date(Math.min(antarEnd, end)).toISOString(),
          });
        }
        antarCursor = antarEnd;
      }
      mahas.push({
        lord,
        start: new Date(cursor).toISOString(),
        end: new Date(end).toISOString(),
        years: lengthYears,
        antars,
      });
      cursor = end;
    }
    return {
      nakshatra: moon.nakshatra.name,
      pada: moon.nakshatra.pada,
      startLord: DASHA_SEQUENCE[startLordIndex][0],
      balanceYears,
      yearConvention: "365.25-day years",
      mahas,
    };
  }

  function dashaAt(dasha, whenUtc) {
    const t = whenUtc.toISOString();
    const maha = dasha.mahas.find((m) => m.start <= t && t < m.end);
    if (!maha) return null;
    const antar = maha.antars.find((a2) => a2.start <= t && t < a2.end) || null;
    return { maha, antar };
  }

  window.GZ_ASTRO = {
    computeChart, computeSynastry, computeTransits, computeComposite,
    computeProgressed, solarReturn, lunarReturns, vimshottari, dashaAt,
    planetaryHour, celestialStamp, houseOf, splitSign, SIGNS, SIGN_GLYPHS,
  };
})();
