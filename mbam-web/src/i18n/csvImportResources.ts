import i18n from "../i18n";

// Shared strings for the reusable CSV-import + column-mapping panel
// (components/csv/CsvImportPanel.tsx), plus the employee-CSV-import
// additions to the existing "team" namespace.

const en = {
  csvImport: {
    eyebrow: "CSV import",
    mapTitle: "Map your CSV columns",
    mapHint: "We guessed a field for columns with a matching name. Adjust any column below, then confirm to bring the rows into the review table.",
    csvColumn: "CSV column",
    sampleValue: "Sample value",
    mapsTo: "Maps to",
    ignoreColumn: "Don't import this column",
    unnamedColumn: "Column {{number}}",
    requiredFieldMissing: "Map every required field (marked with *) before continuing.",
    cancel: "Cancel",
    confirmMapping: "Import {{count}} rows",
    noRows: "The CSV file has no data rows.",
    readError: "Could not read the CSV file.",
  },
  team: {
    importEmployees: "Import CSV",
    csvFields: {
      email: "Email",
      role: "Role",
      business: "Business",
      unit: "Shop or unit",
    },
    csvReviewTitle: "Review imported employees",
    csvReviewHint: "Confirm the role, business, and shop for each row, then send invites. Rows without a matching role will be skipped.",
    csvNoRows: "No rows with an email address were found in the CSV file.",
    csvRoleUnresolved: "Not matched — choose a role",
    csvBusinessUnresolved: "No business",
    csvUnitUnresolved: "No unit",
    csvCancelReview: "Cancel import",
    csvSendInvites: "Send {{count}} invites",
    csvSendingInvites: "Sending invites…",
    csvImportResult: "Sent {{success}} invite(s).",
    csvImportPartialFailure: "{{count}} invite(s) could not be sent: {{emails}}.",
  },
};

const fr = {
  csvImport: {
    eyebrow: "Import CSV",
    mapTitle: "Associez vos colonnes CSV",
    mapHint: "Nous avons deviné un champ pour les colonnes dont le nom correspond. Ajustez les colonnes ci-dessous, puis confirmez pour envoyer les lignes vers le tableau de vérification.",
    csvColumn: "Colonne CSV",
    sampleValue: "Exemple de valeur",
    mapsTo: "Correspond à",
    ignoreColumn: "Ne pas importer cette colonne",
    unnamedColumn: "Colonne {{number}}",
    requiredFieldMissing: "Associez chaque champ obligatoire (marqué d’un *) avant de continuer.",
    cancel: "Annuler",
    confirmMapping: "Importer {{count}} lignes",
    noRows: "Le fichier CSV ne contient aucune ligne de données.",
    readError: "Impossible de lire le fichier CSV.",
  },
  team: {
    importEmployees: "Importer CSV",
    csvFields: {
      email: "E-mail",
      role: "Rôle",
      business: "Entreprise",
      unit: "Boutique ou unité",
    },
    csvReviewTitle: "Vérifier les employés importés",
    csvReviewHint: "Confirmez le rôle, l’entreprise et la boutique de chaque ligne, puis envoyez les invitations. Les lignes sans rôle correspondant seront ignorées.",
    csvNoRows: "Aucune ligne avec une adresse e-mail n’a été trouvée dans le fichier CSV.",
    csvRoleUnresolved: "Non trouvé — choisissez un rôle",
    csvBusinessUnresolved: "Aucune entreprise",
    csvUnitUnresolved: "Aucune unité",
    csvCancelReview: "Annuler l’import",
    csvSendInvites: "Envoyer {{count}} invitations",
    csvSendingInvites: "Envoi des invitations…",
    csvImportResult: "{{success}} invitation(s) envoyée(s).",
    csvImportPartialFailure: "{{count}} invitation(s) n’ont pas pu être envoyées : {{emails}}.",
  },
};

i18n.addResourceBundle("en", "translation", en, true, true);
i18n.addResourceBundle("fr", "translation", fr, true, true);
