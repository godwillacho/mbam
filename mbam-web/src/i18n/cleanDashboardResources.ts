import i18n from "../i18n";

const en = {
  app: {
    nav: {
      products: "Products",
    },
  },
  transactions: {
    filteredRecords: "{{count}} records shown",
    products: "Products",
    searchLabel: "Search transactions",
    searchPlaceholder: "Search by customer, phone, product, reference, worker, date, or payment method",
    searchHint: "Use this for dispute checks, customer history, product lookup, and future printable reports.",
    roleFilter: "Role filter",
    allRoles: "All roles",
    filters: {
      all: "All transactions",
      allHint: "Completed and queued",
      completed: "Completed",
      completedHint: "Already synced or settled",
      queued: "Queued offline",
      queuedHint: "Waiting for sync",
      today: "Today",
      todayHint: "Transactions recorded today",
    },
  },
  businesses: {
    teamMembers: "Team on this unit",
    noTeamMembers: "No team members assigned yet",
    openEmployees: "Open employees",
    employeeCount: "{{count}} employees",
  },
  team: {
    savePermissions: "Save permissions",
    permissionsSaved: "Permissions saved for {{name}}.",
    performance: "Employee performance",
    performanceHint: "Sales and transaction activity for the selected employee.",
    revenueHandled: "Revenue handled",
    transactionsHandled: "Transactions handled",
    productsSold: "Products sold",
    noPerformance: "No sales activity found for this employee yet.",
  },
};

const fr = {
  app: {
    nav: {
      products: "Produits",
    },
  },
  transactions: {
    filteredRecords: "{{count}} enregistrements affichés",
    products: "Produits",
    searchLabel: "Rechercher des transactions",
    searchPlaceholder: "Rechercher par client, téléphone, produit, référence, employé, date ou mode de paiement",
    searchHint: "Utilisez cette recherche pour les litiges, l’historique client, la recherche produit et les futurs rapports imprimables.",
    roleFilter: "Filtre par rôle",
    allRoles: "Tous les rôles",
    filters: {
      all: "Toutes les transactions",
      allHint: "Terminées et en attente",
      completed: "Terminées",
      completedHint: "Déjà synchronisées ou réglées",
      queued: "En attente hors ligne",
      queuedHint: "En attente de synchronisation",
      today: "Aujourd’hui",
      todayHint: "Transactions enregistrées aujourd’hui",
    },
  },
  businesses: {
    teamMembers: "Équipe de cette unité",
    noTeamMembers: "Aucun membre assigné pour le moment",
    openEmployees: "Ouvrir les employés",
    employeeCount: "{{count}} employés",
  },
  team: {
    savePermissions: "Enregistrer les permissions",
    permissionsSaved: "Permissions enregistrées pour {{name}}.",
    performance: "Performance de l’employé",
    performanceHint: "Ventes et transactions de l’employé sélectionné.",
    revenueHandled: "Revenu géré",
    transactionsHandled: "Transactions gérées",
    productsSold: "Produits vendus",
    noPerformance: "Aucune activité de vente trouvée pour cet employé pour le moment.",
  },
};

i18n.addResourceBundle("en", "translation", en, true, true);
i18n.addResourceBundle("fr", "translation", fr, true, true);
