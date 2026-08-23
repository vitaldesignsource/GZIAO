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
