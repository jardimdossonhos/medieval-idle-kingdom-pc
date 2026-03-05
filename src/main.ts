import "./styles/global.css";
import { createTranslator, getLocale, setLocale } from "./ui/i18n";

const appRoot = document.getElementById("app");

if (!appRoot) {
  throw new Error("Elemento #app não encontrado.");
}

const locale = getLocale();
setLocale(locale);
const t = createTranslator(locale);

document.documentElement.lang = locale;
document.title = t("app.title");

appRoot.innerHTML = `
  <main class="shell">
    <header class="topbar">
      <h1>${t("app.title")}</h1>
      <p>${t("app.subtitle")}</p>
    </header>
    <section class="panel-grid">
      <article class="panel">${t("panel.simulation")}</article>
      <article class="panel">${t("panel.saves")}</article>
      <article class="panel">${t("panel.multiplayerPorts")}</article>
    </section>
  </main>
`;
