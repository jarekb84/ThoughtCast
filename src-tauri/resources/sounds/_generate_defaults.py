"""
Generates the three default audio cues bundled with ThoughtCast:
  start.wav  — short rising chime (recording started)
  stop.wav   — short descending chime (recording stopped)
  ready.wav  — soft major-third bell (transcription ready)

This script is committed alongside the WAV files so the defaults are
reproducible. The actual playback at runtime uses the WAV files; this
script never runs in production.

Run:  python _generate_defaults.py
"""

import math
import struct
import wave
from pathlib import Path

SAMPLE_RATE = 44100
AMPLITUDE = 0.45  # peak, leave headroom


def envelope(t: float, total: float, attack: float = 0.01, release: float = 0.18) -> float:
    """Attack/sustain/release envelope, smooth edges."""
    if t < attack:
        return t / attack
    if t > total - release:
        return max(0.0, (total - t) / release)
    return 1.0


def sine(freq: float, t: float) -> float:
    return math.sin(2.0 * math.pi * freq * t)


def write_wav(path: Path, samples: list[float]) -> None:
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SAMPLE_RATE)
        frames = b"".join(
            struct.pack("<h", max(-32767, min(32767, int(s * 32767))))
            for s in samples
        )
        w.writeframes(frames)


def two_note_chime(notes: list[tuple[float, float]]) -> list[float]:
    """
    notes = [(freq_hz, duration_sec), ...]
    Each note plays sequentially with overlap-free envelope.
    Adds a soft second-harmonic for warmth.
    """
    samples: list[float] = []
    for freq, dur in notes:
        n = int(dur * SAMPLE_RATE)
        for i in range(n):
            t = i / SAMPLE_RATE
            env = envelope(t, dur, attack=0.008, release=min(0.12, dur * 0.55))
            # Fundamental + quiet second harmonic for a "chime" character
            s = sine(freq, t) * 0.85 + sine(freq * 2.0, t) * 0.15
            samples.append(s * env * AMPLITUDE)
    return samples


def chord(freqs: list[float], dur: float) -> list[float]:
    n = int(dur * SAMPLE_RATE)
    out: list[float] = []
    scale = 1.0 / max(1, len(freqs))
    for i in range(n):
        t = i / SAMPLE_RATE
        env = envelope(t, dur, attack=0.012, release=dur * 0.55)
        mix = sum(sine(f, t) for f in freqs) * scale
        # Subtle warmth: octave-down at low level
        mix += sine(freqs[0] / 2.0, t) * 0.15 * scale
        out.append(mix * env * AMPLITUDE)
    return out


def main() -> None:
    here = Path(__file__).parent

    # Start cue: C5 -> G5 (perfect fifth, rising), ~0.18s + ~0.22s
    start = two_note_chime([(523.25, 0.16), (783.99, 0.22)])
    write_wav(here / "start.wav", start)

    # Stop cue: G5 -> C5 (perfect fifth, falling), slightly slower decay
    stop = two_note_chime([(783.99, 0.14), (523.25, 0.26)])
    write_wav(here / "stop.wav", stop)

    # Ready cue: C major triad (C5 + E5 + G5), gentle bell
    ready = chord([523.25, 659.25, 783.99], 0.45)
    write_wav(here / "ready.wav", ready)

    print("Generated:", *[p.name for p in here.glob("*.wav")])


if __name__ == "__main__":
    main()
