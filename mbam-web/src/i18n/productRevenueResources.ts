import i18n from "../i18n";

const en = {
  productRevenue: {
    loading: "Loading product revenue…",
    loadError: "Unable to load product revenue report.",
    mockSourceNote: "Using local demo product sales because no deployed API base URL is configured.",
  },
};

const fr = {
  productRevenue: {
    loading: "Chargement des revenus des produits…",
    loadError: "Impossible de charger le rapport des revenus des produits.",
    mockSourceNote: "Utilisation des ventes produit de démonstration locales, car aucune URL d’API déployée n’est configurée.",
  },
};

i18n.addResourceBundle("en", "translation", en, true, true);
i18n.addResourceBundle("fr", "translation", fr, true, true);
