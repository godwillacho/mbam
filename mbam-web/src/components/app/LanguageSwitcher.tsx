import { useTranslation } from "react-i18next";
import type { SupportedLanguage } from "../../i18n";

const languageOptions: Array<{ value: SupportedLanguage; labelKey: string }> = [
  { value: "en", labelKey: "common.english" },
  { value: "fr", labelKey: "common.french" },
];

export default function LanguageSwitcher() {
  const { i18n, t } = useTranslation();
  const currentLanguage = i18n.resolvedLanguage?.startsWith("fr") ? "fr" : "en";

  const handleLanguageChange = async (language: SupportedLanguage) => {
    window.localStorage.setItem("mbam_language", language);
    await i18n.changeLanguage(language);
    document.documentElement.lang = language;
  };

  return (
    <label className="language-switcher">
      <span>{t("common.language")}</span>
      <select
        value={currentLanguage}
        onChange={(event) => handleLanguageChange(event.target.value as SupportedLanguage)}
      >
        {languageOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {t(option.labelKey)}
          </option>
        ))}
      </select>
    </label>
  );
}
