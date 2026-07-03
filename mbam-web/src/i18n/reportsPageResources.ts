import i18n from "../i18n";

// Strings for the new distribution pie chart on ReportsPage.tsx. The rest of
// that page predates the i18n rollout and still uses hardcoded English copy
// (a pre-existing gap, out of scope here) — only the newly added visible
// text below is wired through i18n, per docs/frontend-i18n-guidelines.md.

const en = {
  reportsPage: {
    distributionEyebrow: "Distribution",
    distributionTitle: {
      businesses: "Revenue share by business",
      shops: "Revenue share by shop",
      employees: "Revenue share by employee",
      products: "Units sold share by product",
    },
    distributionHint: "How the current timeframe's total splits across each authorized entity.",
    distributionEmpty: "Not enough data yet to show a distribution.",
    unitsSold: "{{count}} sold",
  },
};

const fr = {
  reportsPage: {
    distributionEyebrow: "Répartition",
    distributionTitle: {
      businesses: "Répartition du chiffre d’affaires par entreprise",
      shops: "Répartition du chiffre d’affaires par boutique",
      employees: "Répartition du chiffre d’affaires par employé",
      products: "Répartition des unités vendues par produit",
    },
    distributionHint: "Comment le total de la période sélectionnée se répartit entre chaque entité autorisée.",
    distributionEmpty: "Pas encore assez de données pour afficher une répartition.",
    unitsSold: "{{count}} vendues",
  },
};

i18n.addResourceBundle("en", "translation", en, true, true);
i18n.addResourceBundle("fr", "translation", fr, true, true);
