import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  loadEntityItems,
  type EntityItem,
  type EntityKind,
} from "../../services/entityDirectoryService";
import "./EntityMultiSelect.css";

interface EntityMultiSelectProps {
  kind: EntityKind;
  /** Currently selected entity ids for this dimension. */
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

/**
 * Search-and-tag picker for building a raw detail report across a
 * hand-picked set of entities in one dimension (e.g. "these three
 * employees" or "this one shop"). Typing filters the authorized directory
 * for the given `kind`; selecting a suggestion adds it as a removable tag,
 * mirroring the comma-delimited grouping the user asked for ("employee
 * name ... , delimiter ... group the reports for more than one employee").
 *
 * Each dimension keeps its own selection state in the parent (ReportsPage),
 * so switching dimension tabs does not clear a different dimension's
 * picks -- this component only renders whatever `selectedIds` it's given
 * for the currently active `kind`.
 */
export default function EntityMultiSelect({
  kind,
  selectedIds,
  onChange,
}: EntityMultiSelectProps) {
  const { t } = useTranslation();
  const [items, setItems] = useState<EntityItem[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [query, setQuery] = useState("");

  useEffect(() => {
    let ignore = false;
    setState("loading");
    setQuery("");
    loadEntityItems(kind)
      .then((nextItems) => {
        if (ignore) return;
        setItems(nextItems);
        setState("ready");
      })
      .catch(() => {
        if (ignore) return;
        setItems([]);
        setState("error");
      });
    return () => {
      ignore = true;
    };
  }, [kind]);

  const selectedItems = useMemo(
    () =>
      selectedIds
        .map((id) => items.find((item) => item.id === id))
        .filter((item): item is EntityItem => Boolean(item)),
    [items, selectedIds],
  );

  const suggestions = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return [];
    return items
      .filter((item) => !selectedIds.includes(item.id))
      .filter((item) => item.name.toLowerCase().includes(trimmed))
      .slice(0, 8);
  }, [items, query, selectedIds]);

  function addEntity(id: string) {
    if (selectedIds.includes(id)) return;
    onChange([...selectedIds, id]);
    setQuery("");
  }

  function removeEntity(id: string) {
    onChange(selectedIds.filter((selectedId) => selectedId !== id));
  }

  return (
    <div className="entity-multi-select">
      {selectedItems.length > 0 && (
        <ul className="entity-multi-select-tags">
          {selectedItems.map((item) => (
            <li className="entity-multi-select-tag" key={item.id}>
              <span>{item.name}</span>
              <button
                aria-label={t("reportsPage.entityPicker.remove", { name: item.name })}
                onClick={() => removeEntity(item.id)}
                type="button"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="entity-multi-select-input-wrap">
        <input
          aria-label={t(`reportsPage.entityPicker.searchLabel.${kind}`)}
          disabled={state === "loading"}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t(`reportsPage.entityPicker.searchPlaceholder.${kind}`)}
          type="text"
          value={query}
        />
        {query.trim() !== "" && suggestions.length > 0 && (
          <ul className="entity-multi-select-suggestions" role="listbox">
            {suggestions.map((item) => (
              <li key={item.id}>
                <button onClick={() => addEntity(item.id)} type="button">
                  <span>{item.name}</span>
                  {item.description && <small>{item.description}</small>}
                </button>
              </li>
            ))}
          </ul>
        )}
        {query.trim() !== "" && suggestions.length === 0 && state === "ready" && (
          <ul className="entity-multi-select-suggestions" role="listbox">
            <li className="entity-multi-select-no-match">
              {t("reportsPage.entityPicker.noMatches")}
            </li>
          </ul>
        )}
      </div>
      {state === "error" && (
        <p className="entity-multi-select-error" role="alert">
          {t("reportsPage.entityPicker.loadError")}
        </p>
      )}
    </div>
  );
}
