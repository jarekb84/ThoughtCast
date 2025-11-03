import { useState, useEffect, useCallback } from 'react';
import { Session, useApi } from '../../api';

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
  isRetranscribing: boolean;
  isCopying: boolean;
  copyButtonText: string;
}

interface TranscriptViewerActions {
  handleCopyToClipboard: () => Promise<void>;
  handleRetranscribe: () => Promise<void>;
}

/**
 * Custom hook managing transcript viewing and operations
 *
 * Orchestrates:
 * - Transcript loading when session changes
 * - Retranscription workflow
 * - Clipboard copy with feedback
 */
export function useTranscriptViewer(
  selectedSession: Session | null,
  onSessionsChanged: () => Promise<void>
): TranscriptViewerState & TranscriptViewerActions {
  const { transcriptService, clipboardService } = useApi();
  const [transcript, setTranscript] = useState<string | null>(null);
  const [transcriptError, setTranscriptError] = useState<string | null>(null);
  const [isLoadingTranscript, setIsLoadingTranscript] = useState(false);
  const [isRetranscribing, setIsRetranscribing] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const [copyButtonText, setCopyButtonText] = useState("Copy to Clipboard");

  // Load transcript when selected session changes
  useEffect(() => {
    const loadTranscript = async () => {
      if (!selectedSession) {
        setTranscript(null);
        setTranscriptError(null);
        return;
      }

      // Check if transcript is available
      if (!hasTranscript(selectedSession)) {
        setTranscript(null);
        setTranscriptError("No transcript available");
        return;
      }

      setIsLoadingTranscript(true);
      setTranscriptError(null);

      try {
        const text = await transcriptService.loadTranscript(selectedSession.id);
        setTranscript(text);
      } catch (error) {
        console.error("Failed to load transcript:", error);
        setTranscriptError(formatErrorMessage(error));
        setTranscript(null);
      } finally {
        setIsLoadingTranscript(false);
      }
    };

    loadTranscript();
  }, [selectedSession?.id, transcriptService]);

  const handleCopyToClipboard = useCallback(async () => {
    if (!selectedSession) return;

    setIsCopying(true);
    try {
      await clipboardService.copyTranscriptToClipboard(selectedSession.id);
      setCopyButtonText("Copied!");
      setTimeout(() => setCopyButtonText("Copy to Clipboard"), 2000);
    } catch (error) {
      console.error("Failed to copy to clipboard:", error);
      alert(`Failed to copy: ${formatErrorMessage(error)}`);
    } finally {
      setIsCopying(false);
    }
  }, [selectedSession, clipboardService]);

  const handleRetranscribe = useCallback(async () => {
    if (!selectedSession) return;

    setIsRetranscribing(true);
    setIsLoadingTranscript(true);
    setTranscriptError(null);

    try {
      const newTranscript = await transcriptService.retranscribe(selectedSession.id);
      setTranscript(newTranscript);

      // Refresh the session list to get updated preview and transcript_path
      await onSessionsChanged();
    } catch (error) {
      console.error("Failed to retranscribe:", error);
      setTranscriptError(`Retranscription failed: ${formatErrorMessage(error)}`);
      setTranscript(null);
    } finally {
      setIsRetranscribing(false);
      setIsLoadingTranscript(false);
    }
  }, [selectedSession, transcriptService, onSessionsChanged]);

  return {
    transcript,
    transcriptError,
    isLoadingTranscript,
    isRetranscribing,
    isCopying,
    copyButtonText,
    handleCopyToClipboard,
    handleRetranscribe,
  };
}
