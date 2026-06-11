import i18n from "../i18n";

const en = {
  app: {
    nav: {
      products: "Products",
    },
  },
  transactions: {
    filteredRecords: "{{count}} records shown",
    filters: {
      all: "All transactions",
      allHint: "Completed and queued",
      completed: "Completed",
      completedHint: "Already synced or settled",
      queued: "Queued offline",
      queuedHint: "Waiting for sync",
    },
  },
  businesses: {
    teamMembers: "Team on this unit",
    noTeamMembers: "No team members assigned yet",
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
    filters: {
      all: "Toutes les transactions",
      allHint: "Terminées et en attente",
      completed: "Terminées",
      completedHint: "Déjà synchronisées ou réglées",
      queued: "En attente hors ligne",
      queuedHint: "En attente de synchronisation",
    },
  },
  businesses: {
    teamMembers: "Équipe de cette unité",
    noTeamMembers: "Aucun membre assigné pour le moment",
  },
};

i18n.addResourceBundle("en", "translation", en, true, true);
i18n.addResourceBundle("fr", "translation", fr, true, true);
