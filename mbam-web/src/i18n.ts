import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";

export const supportedLanguages = ["en", "fr"] as const;
export type SupportedLanguage = typeof supportedLanguages[number];

const resources = {
  en: {
    translation: {
      common: {
        language: "Language",
        english: "English",
        french: "French",
      },
      app: {
        nav: {
          dashboard: "Master dashboard",
          recordTransaction: "Record transaction",
          transactions: "Transactions",
          businesses: "Businesses & shops",
          team: "Team access",
          reports: "Reports",
        },
        ownerLabel: "Current owner",
        masterScope: "Master account scope",
        workspaceLabel: "Offline-first workspace",
        readyToSync: "Ready to sync",
      },
    },
  },
  fr: {
    translation: {
      common: {
        language: "Langue",
        english: "Anglais",
        french: "Français",
      },
      app: {
        nav: {
          dashboard: "Tableau de bord principal",
          recordTransaction: "Enregistrer une vente",
          transactions: "Transactions",
          businesses: "Entreprises et boutiques",
          team: "Accès équipe",
          reports: "Rapports",
        },
        ownerLabel: "Propriétaire actuel",
        masterScope: "Périmètre du compte principal",
        workspaceLabel: "Espace hors ligne d’abord",
        readyToSync: "Prêt à synchroniser",
      },
    },
  },
};

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: "en",
    supportedLngs: [...supportedLanguages],
    interpolation: {
      escapeValue: false,
    },
    detection: {
      // First use a saved manual choice. If none exists, use the browser/device language.
      order: ["localStorage", "navigator", "htmlTag"],
      lookupLocalStorage: "mbam_language",
      // Do not automatically cache browser detection. The language switcher saves only explicit user choices.
      caches: [],
    },
  });

export default i18n;
