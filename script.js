const toggle = document.querySelector(".theme-toggle");
const label = document.querySelector(".theme-toggle-copy");

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  localStorage.setItem("gz-theme", theme);
  label.textContent = theme === "dark" ? "Dark" : "Light";
}

setTheme(document.documentElement.dataset.theme || "dark");

toggle.addEventListener("click", () => {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  setTheme(next);
});

/* ---------------- install buttons: iOS + Android, honestly ----------------
   pwa.js (loaded with defer, so after this file) owns the captured
   beforeinstallprompt via window.GZ_PWA and announces it with the
   "gz-can-install" event. iOS never fires that event, so its button
   always opens the share-sheet guide instead. */
(function () {
  const iosBtn = document.getElementById("install-ios");
  const androidBtn = document.getElementById("install-android");
  if (!iosBtn || !androidBtn) return;

  const ua = navigator.userAgent;
  const isAndroid = /android/i.test(ua);
  const isIOS =
    !isAndroid &&
    (/iphone|ipad|ipod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));
  const isSafari = /safari/i.test(ua) && !/crios|fxios|edgios|chrome/i.test(ua);
  const installed =
    window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;

  /* highlight the button for the device in hand */
  if (isIOS) iosBtn.classList.add("is-this-device");
  if (isAndroid) androidBtn.classList.add("is-this-device");

  const note = document.getElementById("entry-install-note");
  if (installed) {
    document.getElementById("entry-install").classList.add("is-installed");
    note.textContent = "You are inside the installed app already.";
  } else if (isIOS) {
    note.textContent = "iPhone installs happen from Safari's share sheet — the button walks you through it.";
  } else if (isAndroid) {
    note.textContent = "One tap — Android installs directly from this page.";
  }

  /* enable the Android/desktop path the moment the browser offers it */
  document.addEventListener("gz-can-install", () => androidBtn.classList.add("is-ready"));

  const guide = document.getElementById("install-guide");
  const guideTitle = document.getElementById("install-guide-title");
  const guideSteps = document.getElementById("install-guide-steps");
  const guideNote = document.getElementById("install-guide-note");

  function openGuide(title, steps, noteText) {
    guideTitle.innerHTML = title;
    guideSteps.innerHTML = steps.map((step) => "<li>" + step + "</li>").join("");
    guideNote.textContent = noteText || "";
    guide.hidden = false;
  }
  function closeGuide() {
    guide.hidden = true;
  }
  document.getElementById("install-guide-close").addEventListener("click", closeGuide);
  guide.addEventListener("click", (event) => {
    if (event.target === guide) closeGuide();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !guide.hidden) closeGuide();
  });

  iosBtn.addEventListener("click", () => {
    if (installed) return openGuide("Already installed", ["Open GZIAO from your Home Screen — you are set."], "");
    if (isIOS && !isSafari) {
      openGuide(
        "Open this page in Safari first",
        [
          "Copy this address: <b>gziao.com</b>",
          "Open <b>Safari</b> and go there",
          "Then: Share button &rarr; <b>Add to Home Screen</b>",
        ],
        "Apple only allows Home Screen installs from Safari."
      );
      return;
    }
    openGuide(
      "Install on iPhone &amp; iPad",
      [
        "Tap the <b>Share</b> button in Safari &mdash; the square with the upward arrow",
        "Scroll down and tap <b>Add to Home Screen</b>",
        "Tap <b>Add</b> &mdash; the GZ seal lands on your Home Screen",
      ],
      "It opens full screen in its own window, works offline, and updates itself."
    );
  });

  androidBtn.addEventListener("click", async () => {
    if (installed) return openGuide("Already installed", ["Open GZIAO from your Home Screen — you are set."], "");
    const pwa = window.GZ_PWA;
    if (pwa && pwa.canInstall()) {
      const accepted = await pwa.install();
      if (accepted) return;
    }
    openGuide(
      "Install on Android",
      [
        "Open <b>gziao.com</b> in Chrome",
        "Tap the <b>&#8942;</b> menu in the top right",
        "Tap <b>Add to Home screen</b> (or <b>Install app</b>)",
      ],
      "If Chrome shows its own install banner, that works too — same result."
    );
  });

  window.addEventListener("appinstalled", () => {
    document.getElementById("entry-install").classList.add("is-installed");
    note.textContent = "Installed. Open GZIAO from your Home Screen or dock.";
  });
})();
