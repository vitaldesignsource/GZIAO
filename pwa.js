/* GZ IAO — install & update plumbing for the app shell.
   Loaded by every page. Registers the service worker, checks for new
   versions on load and whenever the tab regains focus, and offers a
   one-tap update chip when a new worker is installed and waiting.
   Also captures the browser's install prompt so the app can offer
   "Install as app" from its own chrome.

   The page reloads on controllerchange ONLY when this tab asked for the
   update: never on the first install's clients.claim(), and never
   because another tab pressed Update. Tabs that didn't ask keep their
   page and pick the new version up on their next navigation, which is
   safe under a network-first worker. */
(function () {
  "use strict";

  const isIOS =
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  /* ---------------- service worker registration + update flow ---------------- */
  let updateRequested = false;

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!updateRequested) return;
      updateRequested = false;
      location.reload();
    });

    window.addEventListener("load", () => {
      navigator.serviceWorker
        .register("sw.js")
        .then((registration) => {
          const considerWorker = (worker) => {
            if (!worker) return;
            worker.addEventListener("statechange", () => {
              if (worker.state === "installed") considerWaiting(registration);
            });
          };
          const considerWaiting = (reg) => {
            if (!reg.waiting) return;
            if (navigator.serviceWorker.controller) {
              /* an old worker is in control — offer the update */
              offerUpdate(reg);
            } else {
              /* uncontrolled page (hard reload): activate silently; no
                 reload is needed because this page came from the network */
              reg.waiting.postMessage({ type: "SKIP_WAITING" });
            }
          };
          considerWaiting(registration);
          considerWorker(registration.installing);
          registration.addEventListener("updatefound", () =>
            considerWorker(registration.installing)
          );
          /* look for a newer deploy when returning to the app */
          document.addEventListener("visibilitychange", () => {
            if (!document.hidden) registration.update().catch(() => {});
          });
        })
        .catch(() => {
          /* registration failure leaves a perfectly working website */
        });
    });
  }

  function offerUpdate(registration) {
    if (document.getElementById("gz-update-chip")) return;
    const chip = document.createElement("div");
    chip.id = "gz-update-chip";
    chip.setAttribute("role", "status");
    chip.style.cssText =
      "position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:55;" +
      "display:flex;align-items:center;gap:12px;padding:10px 12px 10px 18px;" +
      "background:#0d121a;border:1px solid #2a3a4d;border-radius:999px;" +
      "box-shadow:0 14px 40px rgba(0,0,0,.55);color:#91a8b6;" +
      "font:400 12px Georgia,serif;letter-spacing:.04em";
    const label = document.createElement("span");
    label.textContent = "A new version of GZIAO is ready.";
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Update";
    button.style.cssText =
      "border:1px solid #63dfca;background:none;color:#63dfca;border-radius:999px;" +
      "padding:6px 16px;font:inherit;cursor:pointer;letter-spacing:.08em";
    button.addEventListener("click", () => {
      /* read the waiting worker at click time — a still-newer deploy may
         have replaced the one that raised this chip */
      const worker = registration.waiting;
      if (!worker) {
        chip.remove();
        return;
      }
      label.textContent = "Updating…";
      button.disabled = true;
      updateRequested = true;
      worker.postMessage({ type: "SKIP_WAITING" });
    });
    const dismiss = document.createElement("button");
    dismiss.type = "button";
    dismiss.setAttribute("aria-label", "Not now");
    dismiss.textContent = "×";
    dismiss.style.cssText =
      "border:0;background:none;color:#526879;font-size:15px;cursor:pointer;padding:2px 6px";
    dismiss.addEventListener("click", () => chip.remove());
    chip.append(label, button, dismiss);
    const mount = () => document.body.append(chip);
    if (document.body) mount();
    else document.addEventListener("DOMContentLoaded", mount);
  }

  /* ---------------- install prompt capture ---------------- */
  let deferredPrompt = null;

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event;
    document.dispatchEvent(new CustomEvent("gz-can-install"));
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    document.dispatchEvent(new CustomEvent("gz-installed"));
  });

  window.GZ_PWA = {
    canInstall: () => Boolean(deferredPrompt),
    installed: () =>
      window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true,
    /* iOS Safari never fires beforeinstallprompt — installation is manual
       via the share sheet, and the app can only show instructions */
    manualInstall: () => isIOS && !("onbeforeinstallprompt" in window),
    install: async () => {
      if (!deferredPrompt) return false;
      deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      deferredPrompt = null;
      return choice.outcome === "accepted";
    },
  };
})();
