import { useState, useEffect, useCallback } from 'react';
import { Session, useApi } from '../../api';
import { logger } from '../../shared/utils/logger';

/**
 * Formats error as user-friendly message
 */
export function formatErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Checks if session has a valid transcript path
 */
export function hasTranscript(session: Session | null): boolean {
  return !!session?.transcript_path && session.transcript_path.length > 0;
}

interface TranscriptViewerState {
  transcript: string | null;
  transcriptError: string | null;
  isLoadingTranscript: boolean;
  isCopying: boolean;
  copyButtonText: string;
}

interface TranscriptViewerActions {
  handleCopyToClipboard: () => Promise<void>;
}

/**
 * Custom hook managing transcript viewing and operations
 *
 * Orchestrates:
 * - Transcript loading when session changes (or its content changes)
 * - Clipboard copy with feedback
 *
 * Retranscription itself lives in `useRecordingWorkflow` so it can drive the
 * top-bar "Transcribing..." UI through the same `isProcessing` flag the
 * stop-recording flow uses.
 */
export function useTranscriptViewer(
  selectedSession: Session | null,
  _onSessionsChanged: () => Promise<void>
): TranscriptViewerState & TranscriptViewerActions {
  const { transcriptService, clipboardService } = useApi();
  const [transcript, setTranscript] = useState<string | null>(null);
  const [transcriptError, setTranscriptError] = useState<string | null>(null);
  const [isLoadingTranscript, setIsLoadingTranscript] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const [copyButtonText, setCopyButtonText] = useState("Copy to Clipboard");

  // Reload the transcript when the session changes OR when its content
  // changes underneath us. The third dep — `preview` — is what catches a
  // completed retranscription: the transcript file path stays the same
  // (text/<session_id>.txt) but its bytes change, and the session row's
  // preview flips from "Processing..." to a fresh prefix of the new text.
  // Without that dep the transcript pane keeps showing the stale loaded
  // string until the user navigates away and back.
  //
  // The `cancelled` guard handles a real race: this effect fires both when
  // preview flips into "Processing..." and again when it flips out. The
  // first run's in-flight `loadTranscript` would otherwise resolve LAST with
  // the stale file contents (Whisper hadn't rewritten the file yet), stomping
  // the second run's correct read. Bailing on stale runs keeps the freshest
  // load authoritative.
  useEffect(() => {
    let cancelled = false;

    const loadTranscript = async () => {
      if (!selectedSession) {
        setTranscript(null);
        setTranscriptError(null);
        return;
      }

      // Re-transcription is in flight — show the "Transcribing..." view
      // (gated on `transcript` being empty in SessionViewer) and don't read
      // the file yet: it still has the OLD content until Whisper rewrites it.
      if (selectedSession.preview === 'Processing...') {
        setTranscript(null);
        setTranscriptError(null);
        return;
      }

      if (!hasTranscript(selectedSession)) {
        setTranscript(null);
        setTranscriptError("No transcript available");
        return;
      }

      setIsLoadingTranscript(true);
      setTranscriptError(null);

      try {
        const text = await transcriptService.loadTranscript(selectedSession.id);
        if (cancelled) return;
        setTranscript(text);
      } catch (error) {
        if (cancelled) return;
        logger.error("Failed to load transcript:", error);
        setTranscriptError(formatErrorMessage(error));
        setTranscript(null);
      } finally {
        if (!cancelled) setIsLoadingTranscript(false);
      }
    };

    loadTranscript();

    return () => {
      cancelled = true;
    };
  }, [
    selectedSession?.id,
    selectedSession?.transcript_path,
    selectedSession?.preview,
    transcriptService,
  ]);

  const handleCopyToClipboard = useCallback(async () => {
    if (!selectedSession) return;

    setIsCopying(true);
    try {
      await clipboardService.copyTranscriptToClipboard(selectedSession.id);
      setCopyButtonText("Copied!");
      setTimeout(() => setCopyButtonText("Copy to Clipboard"), 2000);
    } catch (error) {
      logger.error("Failed to copy to clipboard:", error);
      alert(`Failed to copy: ${formatErrorMessage(error)}`);
    } finally {
      setIsCopying(false);
    }
  }, [selectedSession, clipboardService]);

  return {
    transcript,
    transcriptError,
    isLoadingTranscript,
    isCopying,
    copyButtonText,
    handleCopyToClipboard,
  };
}
