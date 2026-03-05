import type { Locale, TranslationKey } from "./types";

type Dictionary = Record<TranslationKey, string>;

export const DEFAULT_LOCALE: Locale = "pt-BR";

const MESSAGES: Record<Locale, Dictionary> = {
  "pt-BR": {
    "app.title": "Reino Idle Medieval",
    "app.subtitle": "Base de arquitetura da Etapa 1 pronta.",
    "panel.simulation": "Contratos centrais da simulação definidos.",
    "panel.saves": "Schema de saves local-first preparado.",
    "panel.multiplayerPorts": "Portas para multiplayer futuro isoladas."
  },
  "en-US": {
    "app.title": "Medieval Idle Kingdom",
    "app.subtitle": "Stage 1 architecture baseline is ready.",
    "panel.simulation": "Core simulation contracts defined.",
    "panel.saves": "Local-first save schema drafted.",
    "panel.multiplayerPorts": "Multiplayer-ready ports isolated."
  }
};

function normalizeLocale(locale: string | undefined | null): Locale {
  const value = locale?.trim().toLowerCase() ?? "";

  if (value.startsWith("pt")) {
    return "pt-BR";
  }

  if (value.startsWith("en")) {
    return "en-US";
  }

  return DEFAULT_LOCALE;
}

export function resolveLocale(preferredLocale?: string): Locale {
  if (preferredLocale) {
    return normalizeLocale(preferredLocale);
  }

  if (typeof navigator !== "undefined") {
    return normalizeLocale(navigator.language);
  }

  return DEFAULT_LOCALE;
}

export function translate(locale: Locale, key: TranslationKey): string {
  return MESSAGES[locale][key] ?? MESSAGES[DEFAULT_LOCALE][key];
}
