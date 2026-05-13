import { useEffect, useState } from "react";
import { Button } from "../../shared/components";
import { useSettingsForm } from "./useSettingsForm";
import TranscriptionSettingsSection from "./sections/TranscriptionSettingsSection";
import CompressionSettingsSection from "./sections/CompressionSettingsSection";
import "./SettingsPanel.css";

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  /** Optional slot for Phase D's compression batch UI (storage stats + Compress Now). */
  renderCompressionExtras?: (
    form: ReturnType<typeof useSettingsForm>
  ) => {
    onCompressNow?: () => void;
    compressNowDisabledReason?: string;
    storageSummary?: React.ReactNode;
  };
}

/**
 * Settings panel modal — host for all in-app configuration sections.
 *
 * The panel itself is dumb chrome: it owns the open/close lifecycle and the
 * Save/Cancel bar. Each settings *section* is a self-contained component that
 * subscribes to the shared `useSettingsForm` handle. To add a new section,
 * drop a new `<*SettingsSection form={form} />` inside `.settings-panel-body`.
 */
export default function SettingsPanel({
  isOpen,
  onClose,
  renderCompressionExtras,
}: SettingsPanelProps) {
  const form = useSettingsForm();
  const [pendingDiscard, setPendingDiscard] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleRequestClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, form.isDirty]);

  if (!isOpen) return null;

  const handleRequestClose = () => {
    if (form.isDirty) {
      setPendingDiscard(true);
      return;
    }
    onClose();
  };

  const handleDiscardConfirm = () => {
    form.cancel();
    setPendingDiscard(false);
    onClose();
  };

  const handleSave = async () => {
    const outcome = await form.save();
    if (outcome.ok) {
      onClose();
    }
  };

  const extras = renderCompressionExtras?.(form) ?? {};

  return (
    <div className="settings-overlay" role="dialog" aria-modal="true">
      <div
        className="settings-backdrop"
        onClick={handleRequestClose}
        aria-hidden="true"
      />
      <div className="settings-panel">
        <header className="settings-panel-header">
          <h2 className="settings-panel-title">Settings</h2>
          <button
            type="button"
            className="settings-close-button"
            onClick={handleRequestClose}
            aria-label="Close settings"
          >
            ×
          </button>
        </header>

        <div className="settings-panel-body">
          {form.isLoading ? (
            <p className="settings-loading">Loading settings…</p>
          ) : form.loadError ? (
            <p className="settings-error">⚠ {form.loadError}</p>
          ) : (
            <>
              <TranscriptionSettingsSection form={form} />
              <CompressionSettingsSection
                form={form}
                onCompressNow={extras.onCompressNow}
                compressNowDisabledReason={extras.compressNowDisabledReason}
                storageSummary={extras.storageSummary}
              />
            </>
          )}
        </div>

        <footer className="settings-panel-footer">
          {form.saveError && (
            <span className="settings-save-error">⚠ {form.saveError}</span>
          )}
          <div className="settings-panel-buttons">
            <Button
              variant="secondary"
              onClick={handleRequestClose}
              disabled={form.isSaving}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleSave}
              disabled={!form.isDirty || !form.isValid || form.isSaving}
            >
              {form.isSaving ? "Saving…" : "Save"}
            </Button>
          </div>
        </footer>

        {pendingDiscard && (
          <div className="settings-discard-prompt" role="alertdialog">
            <p>You have unsaved changes. Discard them?</p>
            <div className="settings-discard-actions">
              <Button
                variant="secondary"
                onClick={() => setPendingDiscard(false)}
              >
                Keep editing
              </Button>
              <Button variant="danger" onClick={handleDiscardConfirm}>
                Discard
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
