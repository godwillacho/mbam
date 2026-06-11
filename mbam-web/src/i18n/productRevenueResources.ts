import i18n from "../i18n";

const en = {
  productRevenue: {
    loading: "Loading product revenue…",
    loadError: "Unable to load product revenue report.",
    mockSourceNote: "Using local demo product sales because no deployed API base URL is configured.",
    searchLabel: "Search products",
    searchPlaceholder: "Search by name, SKU, barcode, brand, size, unit, or manufacturer",
    searchHint: "Use this to find a product and check its available quantity, expiry date, cost price, and sales history.",
    noSearchResults: "No products match this search.",
    selectedProduct: "Selected product",
    branchBreakdown: "Branch breakdown",
    employeeBreakdown: "Employee ranking",
    customerBreakdown: "Customer / personnel sales",
    barcode: "Barcode",
    availableQuantity: "Available",
    expiryDate: "Expiry date",
    costPrice: "Cost price",
    notTracked: "Not tracked",
    stockStatus: {
      available: "Stock available",
      low: "Low stock",
      out: "Out of stock",
      expired: "Expired",
      unknown: "Stock not tracked",
    },
  },
};

const fr = {
  productRevenue: {
    loading: "Chargement des revenus des produits…",
    loadError: "Impossible de charger le rapport des revenus des produits.",
    mockSourceNote: "Utilisation des ventes produit de démonstration locales, car aucune URL d’API déployée n’est configurée.",
    searchLabel: "Rechercher des produits",
    searchPlaceholder: "Rechercher par nom, SKU, code-barres, marque, taille, unité ou fabricant",
    searchHint: "Utilisez cette recherche pour trouver un produit et consulter sa quantité disponible, sa date d’expiration, son prix de revient et son historique de ventes.",
    noSearchResults: "Aucun produit ne correspond à cette recherche.",
    selectedProduct: "Produit sélectionné",
    branchBreakdown: "Répartition par agence",
    employeeBreakdown: "Classement des employés",
    customerBreakdown: "Ventes par client / personnel",
    barcode: "Code-barres",
    availableQuantity: "Disponible",
    expiryDate: "Date d’expiration",
    costPrice: "Prix de revient",
    notTracked: "Non suivi",
    stockStatus: {
      available: "Stock disponible",
      low: "Stock faible",
      out: "Rupture de stock",
      expired: "Expiré",
      unknown: "Stock non suivi",
    },
  },
};

i18n.addResourceBundle("en", "translation", en, true, true);
i18n.addResourceBundle("fr", "translation", fr, true, true);
