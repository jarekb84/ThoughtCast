import { wrapTauriInvoke } from "../../api/services/tauriInvokeWrapper";
import {
  AudioFileValidation,
  CueType,
} from "../settings/appConfig";

/**
 * Audio cue playback + custom-cue management.
 *
 * The Rust side resolves config + paths on each call, so React never has to
 * pass volume or enabled state — that lets the user toggle feedback off
 * mid-session and have it take effect immediately on the next cue.
 *
 * `playCue` is **blocking** (awaits playback completion) so callers can
 * sequence: start cue → recording start, ensuring the cue never bleeds onto
 * the recorded waveform.
 */
export interface IAudioCueService {
  playCue(cue: CueType): Promise<void>;
  previewFile(path: string, volume: number): Promise<void>;
  validateFile(path: string): Promise<AudioFileValidation>;
  getDefaultPath(cue: CueType): Promise<string>;
}

export class TauriAudioCueService implements IAudioCueService {
  async playCue(cue: CueType): Promise<void> {
    return wrapTauriInvoke<void>(
      "play_audio_cue",
      { cue },
      "Failed to play audio cue",
      "AUDIO_CUE_PLAY_FAILED"
    );
  }

  async previewFile(path: string, volume: number): Promise<void> {
    return wrapTauriInvoke<void>(
      "preview_audio_file",
      { path, volume },
      "Failed to preview audio file",
      "AUDIO_CUE_PREVIEW_FAILED"
    );
  }

  async validateFile(path: string): Promise<AudioFileValidation> {
    return wrapTauriInvoke<AudioFileValidation>(
      "validate_audio_cue_file",
      { path },
      "Failed to validate audio file",
      "AUDIO_CUE_VALIDATE_FAILED"
    );
  }

  async getDefaultPath(cue: CueType): Promise<string> {
    return wrapTauriInvoke<string>(
      "get_default_cue_path_command",
      { cue },
      "Failed to resolve default cue path",
      "AUDIO_CUE_DEFAULT_PATH_FAILED"
    );
  }
}

/** Mock for tests — records calls and answers with fixed payloads. */
export class MockAudioCueService implements IAudioCueService {
  public playCueCalls: CueType[] = [];
  public previewCalls: { path: string; volume: number }[] = [];

  async playCue(cue: CueType): Promise<void> {
    this.playCueCalls.push(cue);
  }

  async previewFile(path: string, volume: number): Promise<void> {
    this.previewCalls.push({ path, volume });
  }

  async validateFile(path: string): Promise<AudioFileValidation> {
    const exists = path.length > 0;
    return {
      exists,
      format_ok: exists && /\.(wav|mp3|ogg|flac)$/i.test(path),
      size_bytes: exists ? 10_000 : 0,
      size_ok: true,
      message: exists ? "Mock OK" : "File does not exist",
    };
  }

  async getDefaultPath(cue: CueType): Promise<string> {
    return `/mock/sounds/${cue}.wav`;
  }
}
