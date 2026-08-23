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

const installCard = document.getElementById("install-card");
if (installCard) {
  const dismissKey = "gz-install-dismissed";
  let pendingPrompt = null;

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    pendingPrompt = event;
    if (!localStorage.getItem(dismissKey)) installCard.hidden = false;
  });

  function dismissInstall() {
    installCard.hidden = true;
    localStorage.setItem(dismissKey, "1");
  }

  document.getElementById("install-close").addEventListener("click", dismissInstall);
  document.getElementById("install-later").addEventListener("click", dismissInstall);
  document.getElementById("install-go").addEventListener("click", async () => {
    installCard.hidden = true;
    if (!pendingPrompt) return;
    pendingPrompt.prompt();
    await pendingPrompt.userChoice;
    pendingPrompt = null;
  });

  window.addEventListener("appinstalled", () => {
    installCard.hidden = true;
  });
}
