import { type ChangeEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { normalizeCsvHeader, parseCsv } from "../../utils/csv";
import "./CsvImportPanel.css";

export interface CsvFieldDef {
  key: string;
  label: string;
  aliases: string[];
  required?: boolean;
}

interface CsvMappingState {
  headers: string[];
  sampleRows: string[][];
  dataRows: string[][];
  // Column index -> target field key ("" / absent means the column is ignored)
  assignments: Record<number, string>;
}

interface CsvImportPanelProps {
  fields: CsvFieldDef[];
  triggerLabel: string;
  onImport: (records: Array<Record<string, string>>) => void;
  triggerClassName?: string;
}

export default function CsvImportPanel({ fields, triggerLabel, onImport, triggerClassName }: CsvImportPanelProps) {
  const { t } = useTranslation();
  const [mapping, setMapping] = useState<CsvMappingState | null>(null);
  const [error, setError] = useState("");

  const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const csvRows = parseCsv(String(reader.result ?? ""));
      if (csvRows.length < 2) {
        setError(t("csvImport.noRows"));
        return;
      }

      const headers = csvRows[0];
      const dataRows = csvRows.slice(1);
      const normalizedHeaders = headers.map(normalizeCsvHeader);
      const usedFieldKeys = new Set<string>();
      const assignments: Record<number, string> = {};
      normalizedHeaders.forEach((header, index) => {
        const match = fields.find((field) => !usedFieldKeys.has(field.key) && field.aliases.includes(header));
        if (match) {
          assignments[index] = match.key;
          usedFieldKeys.add(match.key);
        }
      });

      setError("");
      setMapping({ headers, sampleRows: dataRows.slice(0, 3), dataRows, assignments });
    };
    reader.onerror = () => setError(t("csvImport.readError"));
    reader.readAsText(file);
  };

  const setColumnField = (index: number, fieldKey: string) => {
    setMapping((current) => {
      if (!current) return current;
      const nextAssignments = { ...current.assignments };
      if (fieldKey) nextAssignments[index] = fieldKey;
      else delete nextAssignments[index];
      return { ...current, assignments: nextAssignments };
    });
  };

  const mappedFieldKeys = mapping ? new Set(Object.values(mapping.assignments)) : new Set<string>();
  const requiredFieldsMapped = fields.filter((field) => field.required).every((field) => mappedFieldKeys.has(field.key));

  const cancel = () => setMapping(null);

  const confirmMapping = () => {
    if (!mapping) return;
    const records = mapping.dataRows
      .map((row) => {
        const record: Record<string, string> = {};
        Object.entries(mapping.assignments).forEach(([indexKey, fieldKey]) => {
          record[fieldKey] = row[Number(indexKey)]?.trim() ?? "";
        });
        return record;
      })
      .filter((record) => Object.values(record).some((value) => value.trim().length > 0));

    onImport(records);
    setMapping(null);
  };

  return (
    <>
      <label className={triggerClassName ?? "secondary-btn file-import-button"}>
        {triggerLabel}
        <input accept=".csv,text/csv" onChange={handleFile} type="file" />
      </label>

      {error && (
        <div className="validation-summary csv-import-error" role="alert">
          {error}
        </div>
      )}

      {mapping && (
        <div className="csv-mapping-overlay" role="dialog" aria-modal="true" aria-label={t("csvImport.mapTitle")}>
          <div className="card csv-mapping-card">
            <header>
              <span className="eyebrow">{t("csvImport.eyebrow")}</span>
              <h3>{t("csvImport.mapTitle")}</h3>
              <p className="card-muted">{t("csvImport.mapHint")}</p>
            </header>

            <div className="csv-mapping-table-wrap">
              <table className="data-table csv-mapping-table">
                <thead>
                  <tr>
                    <th>{t("csvImport.csvColumn")}</th>
                    <th>{t("csvImport.sampleValue")}</th>
                    <th>{t("csvImport.mapsTo")}</th>
                  </tr>
                </thead>
                <tbody>
                  {mapping.headers.map((header, index) => (
                    <tr key={`csv-column-${index}`}>
                      <td>
                        <strong>{header || t("csvImport.unnamedColumn", { number: index + 1 })}</strong>
                      </td>
                      <td className="card-muted">
                        {mapping.sampleRows.map((row) => row[index]).filter(Boolean).join(", ") || "—"}
                      </td>
                      <td>
                        <select
                          aria-label={t("csvImport.mapsTo")}
                          onChange={(event) => setColumnField(index, event.target.value)}
                          value={mapping.assignments[index] ?? ""}
                        >
                          <option value="">{t("csvImport.ignoreColumn")}</option>
                          {fields.map((field) => (
                            <option key={field.key} value={field.key}>
                              {field.label}
                              {field.required ? " *" : ""}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {!requiredFieldsMapped && (
              <div className="validation-summary" role="alert">
                {t("csvImport.requiredFieldMissing")}
              </div>
            )}

            <div className="csv-mapping-actions">
              <button className="secondary-btn" onClick={cancel} type="button">
                {t("csvImport.cancel")}
              </button>
              <button
                className="primary-btn"
                disabled={!requiredFieldsMapped}
                onClick={confirmMapping}
                type="button"
              >
                {t("csvImport.confirmMapping", { count: mapping.dataRows.length })}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
