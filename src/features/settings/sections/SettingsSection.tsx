import "./SettingsSection.css";

interface SettingsSectionProps {
  title: string;
  description?: string;
  children: React.ReactNode;
}

/**
 * Visual + structural wrapper for a section inside the Settings panel.
 *
 * Future settings sections (cleanup, LLM, waveform) slot in by composing this
 * — they don't need to know about modal chrome.
 */
export default function SettingsSection({
  title,
  description,
  children,
}: SettingsSectionProps) {
  return (
    <section className="settings-section">
      <header className="settings-section-header">
        <h3 className="settings-section-title">{title}</h3>
        {description && (
          <p className="settings-section-description">{description}</p>
        )}
      </header>
      <div className="settings-section-body">{children}</div>
    </section>
  );
}
