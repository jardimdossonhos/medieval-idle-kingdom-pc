export type Locale = "pt-BR" | "en-US";

export type TranslationKey =
  | "app.title"
  | "app.subtitle"
  | "panel.simulation"
  | "panel.saves"
  | "panel.multiplayerPorts";

export type Translator = (key: TranslationKey) => string;
