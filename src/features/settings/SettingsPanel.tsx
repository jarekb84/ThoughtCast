import { useEffect, useRef, useState } from "react";
import { Button } from "../../shared/components";
import { useSettingsForm } from "./useSettingsForm";
import TranscriptionSettingsSection from "./sections/TranscriptionSettingsSection";
import CompressionSettingsSection from "./sections/CompressionSettingsSection";
import KeyboardShortcutsSection from "./sections/KeyboardShortcutsSection";
import AudioFeedbackSection from "./sections/AudioFeedbackSection";
import SettingsTabsNav, { SettingsTab } from "./tabs/SettingsTabsNav";
import type { RecordingStatus } from "../../api";
import "./SettingsPanel.css";

type SettingsTabKey =
  | "keyboard-shortcuts"
  | "audio-feedback"
  | "audio-compression"
  | "transcription";

const TABS: ReadonlyArray<SettingsTab<SettingsTabKey>> = [
  { key: "keyboard-shortcuts", label: "Keyboard Shortcuts" },
  { key: "audio-feedback", label: "Audio Feedback" },
  { key: "audio-compression", label: "Audio Compression" },
  { key: "transcription", label: "Transcription" },
];

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  /** Hoisted form so saved-config consumers (e.g. the global-shortcut hook in
   *  App.tsx) read the same state the panel writes. */
  form: ReturnType<typeof useSettingsForm>;
  recordingStatus: RecordingStatus;
  /** Optional slot for the compression batch's "Compress Now" wiring. */
  renderCompressionExtras?: (
    form: ReturnType<typeof useSettingsForm>
  ) => {
    onCompressNow?: () => void;
    compressNowDisabledReason?: string;
    storageSummary?: React.ReactNode;
  };
}

/**
 * Settings panel — host for all in-app configuration sections.
 *
 * The panel owns chrome (modal lifecycle, Save/Cancel bar, tab navigation),
 * but each settings *section* is a self-contained component that subscribes
 * to a shared `useSettingsForm` handle owned by the parent. Hoisting the form
 * lets the rest of the app (global hotkey hook, audio cue dispatchers) read
 * the same baseline the user just saved without a second backend round-trip.
 */
export default function SettingsPanel({
  isOpen,
  onClose,
  form,
  recordingStatus,
  renderCompressionExtras,
}: SettingsPanelProps) {
  const [activeTab, setActiveTab] = useState<SettingsTabKey>(
    "keyboard-shortcuts"
  );
  const [pendingDiscard, setPendingDiscard] = useState(false);

  // Read isDirty through a ref inside the listener so the (re-bound on every
  // render) close handler always sees the latest value without needing
  // exhaustive deps on `form`. Keeps the effect's lifecycle gated purely on
  // `isOpen` — the listener is mounted once per open/close cycle.
  const isDirtyRef = useRef(form.isDirty);
  isDirtyRef.current = form.isDirty;

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (isDirtyRef.current) {
        setPendingDiscard(true);
        return;
      }
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

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

        <div className="settings-panel-tabbed-body">
          <SettingsTabsNav<SettingsTabKey>
            tabs={TABS}
            activeKey={activeTab}
            onSelect={setActiveTab}
          />
          <div className="settings-panel-body">
            {form.isLoading ? (
              <p className="settings-loading">Loading settings…</p>
            ) : form.loadError ? (
              <p className="settings-error">⚠ {form.loadError}</p>
            ) : (
              <ActiveTabContent
                activeTab={activeTab}
                form={form}
                recordingStatus={recordingStatus}
                extras={extras}
              />
            )}
          </div>
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

interface ActiveTabContentProps {
  activeTab: SettingsTabKey;
  form: ReturnType<typeof useSettingsForm>;
  recordingStatus: RecordingStatus;
  extras: {
    onCompressNow?: () => void;
    compressNowDisabledReason?: string;
    storageSummary?: React.ReactNode;
  };
}

function ActiveTabContent({
  activeTab,
  form,
  recordingStatus,
  extras,
}: ActiveTabContentProps) {
  switch (activeTab) {
    case "keyboard-shortcuts":
      return (
        <KeyboardShortcutsSection
          form={form}
          recordingStatus={recordingStatus}
        />
      );
    case "audio-feedback":
      return <AudioFeedbackSection form={form} />;
    case "audio-compression":
      return (
        <CompressionSettingsSection
          form={form}
          onCompressNow={extras.onCompressNow}
          compressNowDisabledReason={extras.compressNowDisabledReason}
          storageSummary={extras.storageSummary}
        />
      );
    case "transcription":
      return <TranscriptionSettingsSection form={form} />;
  }
}
