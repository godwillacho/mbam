# Frontend bilingual GUI guidelines

Mbam must treat English and French as first-class interface languages.

Cameroon is bilingual, so every GUI update must feel native in both English and French. French support must not be added later as an afterthought.

## Required rule

Every new visible GUI text must be added in both languages at the same time.

This includes:

- page titles
- headings
- labels
- placeholders
- helper text
- validation messages
- button text
- table headers
- empty states
- alerts
- badges
- status text
- accessibility labels
- aria labels
- tooltips
- modal text
- success and error messages

## Do not hardcode visible text in components

Avoid this:

```tsx
<button>Save transaction</button>
```

Use this:

```tsx
<button>{t("transactionRecord.saveTransaction")}</button>
```

Then define both translations:

```ts
en: {
  transactionRecord: {
    saveTransaction: "Save transaction"
  }
}

fr: {
  transactionRecord: {
    saveTransaction: "Enregistrer la transaction"
  }
}
```

## Business data is not UI text

Do not translate user-entered or business-entered data automatically.

Examples that should stay as entered:

- customer names
- worker names
- business names
- product names
- invoice numbers
- transaction references
- phone numbers
- email addresses
- addresses

Examples that should be translated:

- `Status`
- `Payment method`
- `Record sale`
- `Pending payment`
- `No pending balance`
- `Create business`
- `Invite worker`

## Device and PWA language behavior

The installed app should use this order:

1. Use the language manually selected by the user, if one exists.
2. Otherwise use the browser or device language.
3. If the detected language is French, start in French.
4. Otherwise fall back to English.

## Review checklist for every GUI PR

Before merging a GUI update, check:

- no new hardcoded English UI text was added
- every new key exists in English and French
- placeholders and validation errors are translated
- aria labels are translated
- status/badge text is translated
- the page still reads naturally in French
- business data remains unchanged and is not accidentally translated

## Current language files

Auth translations:

```text
mbam-web/src/i18n/authEn.ts
mbam-web/src/i18n/authFr.ts
```

Shared app translations:

```text
mbam-web/src/i18n.ts
```

As the app grows, large translation groups should be split into dedicated files per domain, for example:

```text
mbam-web/src/i18n/transactionsEn.ts
mbam-web/src/i18n/transactionsFr.ts
mbam-web/src/i18n/inventoryEn.ts
mbam-web/src/i18n/inventoryFr.ts
```
