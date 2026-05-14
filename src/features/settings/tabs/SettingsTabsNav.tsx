import "./SettingsTabsNav.css";

export interface SettingsTab<TKey extends string = string> {
  key: TKey;
  label: string;
}

interface SettingsTabsNavProps<TKey extends string> {
  tabs: ReadonlyArray<SettingsTab<TKey>>;
  activeKey: TKey;
  onSelect: (key: TKey) => void;
}

/**
 * Vertical left-rail tab nav for the Settings panel.
 *
 * Stays presentation-only: the parent owns the active tab state. This way
 * a "click Save with focus on tab X" interaction can keep the same X selected
 * across re-mounts.
 */
export default function SettingsTabsNav<TKey extends string>({
  tabs,
  activeKey,
  onSelect,
}: SettingsTabsNavProps<TKey>) {
  return (
    <nav className="settings-tabs-nav" aria-label="Settings sections">
      {tabs.map((tab) => {
        const isActive = tab.key === activeKey;
        return (
          <button
            key={tab.key}
            type="button"
            className={
              "settings-tab-button" + (isActive ? " settings-tab-button-active" : "")
            }
            onClick={() => onSelect(tab.key)}
            aria-current={isActive ? "page" : undefined}
          >
            {tab.label}
          </button>
        );
      })}
    </nav>
  );
}
