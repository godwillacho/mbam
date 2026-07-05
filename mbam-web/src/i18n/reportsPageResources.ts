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
    printReport: "Print report",
    customTimeframe: "Custom",
    customRangeStart: "From",
    customRangeEnd: "To",
    customRangeInvalid: "End date must not be before start date.",
    detailToggle: {
      summary: "Summary",
      detail: "Detail",
    },
    customRangePending: "Pick a start and end date to see this report.",
    detailTable: {
      title: "Raw transaction detail",
      hint: "Every transaction line in the selected timeframe and scope — for audit and record-keeping.",
      loading: "Loading transaction detail…",
      error: "The transaction detail report could not be loaded.",
      truncatedWarning: "Showing the first {{count}} rows. Narrow the timeframe or scope to see the rest.",
      empty: "No transactions match this timeframe and scope.",
      columns: {
        dateTime: "Date/time",
        transaction: "Transaction",
        business: "Business",
        shop: "Shop",
        customer: "Customer",
        product: "Product",
        sku: "SKU",
        quantity: "Qty",
        unitPrice: "Unit price",
        lineTotal: "Line total",
        paymentMethod: "Payment",
        status: "Status",
        recordedBy: "Recorded by",
        transactionTotal: "Transaction total",
      },
    },
    entityPicker: {
      searchLabel: {
        businesses: "Search businesses",
        shops: "Search shops",
        employees: "Search employees",
        products: "Search products",
      },
      searchPlaceholder: {
        businesses: "Search businesses…",
        shops: "Search shops…",
        employees: "Search employees…",
        products: "Search products…",
      },
      remove: "Remove {{name}}",
      noMatches: "No matches.",
      loadError: "Couldn't load this list. Try again.",
    },
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
    printReport: "Imprimer le rapport",
    customTimeframe: "Personnalisé",
    customRangeStart: "Du",
    customRangeEnd: "Au",
    customRangeInvalid: "La date de fin ne doit pas précéder la date de début.",
    detailToggle: {
      summary: "Résumé",
      detail: "Détail",
    },
    customRangePending: "Choisissez une date de début et de fin pour voir ce rapport.",
    detailTable: {
      title: "Détail brut des transactions",
      hint: "Chaque ligne de transaction pour la période et le périmètre sélectionnés — pour l'audit et la tenue de registres.",
      loading: "Chargement du détail des transactions…",
      error: "Le rapport détaillé des transactions n'a pas pu être chargé.",
      truncatedWarning: "Affichage des {{count}} premières lignes. Restreignez la période ou le périmètre pour voir le reste.",
      empty: "Aucune transaction ne correspond à cette période et à ce périmètre.",
      columns: {
        dateTime: "Date/heure",
        transaction: "Transaction",
        business: "Entreprise",
        shop: "Boutique",
        customer: "Client",
        product: "Produit",
        sku: "SKU",
        quantity: "Qté",
        unitPrice: "Prix unitaire",
        lineTotal: "Total ligne",
        paymentMethod: "Paiement",
        status: "Statut",
        recordedBy: "Enregistré par",
        transactionTotal: "Total transaction",
      },
    },
    entityPicker: {
      searchLabel: {
        businesses: "Rechercher des entreprises",
        shops: "Rechercher des boutiques",
        employees: "Rechercher des employés",
        products: "Rechercher des produits",
      },
      searchPlaceholder: {
        businesses: "Rechercher des entreprises…",
        shops: "Rechercher des boutiques…",
        employees: "Rechercher des employés…",
        products: "Rechercher des produits…",
      },
      remove: "Retirer {{name}}",
      noMatches: "Aucun résultat.",
      loadError: "Impossible de charger cette liste. Réessayez.",
    },
  },
};

i18n.addResourceBundle("en", "translation", en, true, true);
i18n.addResourceBundle("fr", "translation", fr, true, true);
