# Transcription accuracy: research and measurements

What we know about getting the most accurate local transcripts, measured on real ThoughtCast recordings (October 2026). Update this when engines or models change; keep conclusions, not raw transcripts.

## How it was measured

- **Reference recording:** a 23-minute walking-around voice note, chunked exactly like the app does (3 chunks), scored as word error rate against a cloud transcript of the same audio (OpenAI). That reference tidies disfluencies ("the the", repeated "I"), so the numbers are a *disagreement* rate and penalize verbatim engines. Compare configs with each other, not with 0%.
- **Loop sessions:** 8 stored sessions whose production transcripts contained repetition loops, re-run from their M4A audio. Scored by *looped words*: words inside consecutive repeats of the same 1–15 word phrase beyond the first copy (the same detector the app now uses, `transcription/repetition.rs`).
- **Speech kept:** when a config produced fewer words, the missing spans were checked against an independent run: a span counts as real lost speech when the other run produced the same 5-word phrases.
- Hardware: RTX 3080, whisper.cpp CUDA builds. The scripts lived in a scratch folder; rerun them from this description if needed.

## Findings

### Loops are the biggest accuracy problem, not word choice

- A manual review of the reference note found word accuracy around 98–99%, except one repetition loop that replaced 5–10 seconds of speech.
- 56 of 1,625 stored transcripts (3.4%) contain loops. In the worst, 35% of the words (1,871 of 5,416) were loop text.
- Loops are stochastic. Re-running the same audio often doesn't reproduce one, and decoding the compressed M4A instead of the original WAV changes the outcome. A single clean re-run proves nothing; count loops across many sessions.

### Engine and model comparison (reference recording)

| Config | WER vs reference | Notes |
| --- | --- | --- |
| whisper.cpp 1.7.5 (March 2025), large-v3-turbo, bare flags (production before this change) | 9.0% | The production run of this audio looped; this re-run didn't. |
| whisper.cpp 1.9.5, large-v3-turbo, bare flags | 11.9% | Looped at the same spot as production ("I don't know if it's a good thing but…"). |
| 1.9.5 + VAD (default parameters) | 8.5% | No loop (but see the VAD section: it skips quiet speech). |
| 1.9.5 + VAD + vocabulary prompt | **5.9%** | Fixes product names (Claude, Annum, ThoughtCast). The prompt listed terms from this note, so this flatters it; a user's real vocabulary list behaves the same way for their recurring terms. |
| 1.9.5, `--max-context 0` | 9.6% | No loop; slightly worse elsewhere. Used as the retry, not the default. |
| large-v3 (non-turbo) + VAD | 11.3% | 8× slower and still looped ("I'm just like…" ×9). Not an upgrade. |
| Parakeet TDT 0.6B v3 (whisper.cpp 1.9.5 `parakeet-cli`, f16) | 11.2% | No loops. Verbatim (keeps "um", "gonna", repeated words), so the tidy reference penalizes it; real misses are proper nouns ("clot" for Claude). No vocabulary prompt. |

Conclusions:

- **Keep Whisper large-v3-turbo as the default.** No newer open Whisper model exists (OpenAI's newer transcription models are API-only). large-v3 is slower and loops more.
- **Upgrade whisper.cpp to 1.9.x** for VAD (1.7.6+), `--carry-initial-prompt` (1.8.1+), flash attention on by default (1.8.0), and Parakeet (1.9.0). Upgrading alone, without VAD, doesn't help.
- **Parakeet** is a solid alternative when loops matter more than names, and it's selectable in Settings. It isn't more accurate here.

### Voice activity detection

VAD removed every loop in testing, but it skips quiet speech, and walking-around sessions have a lot of it. On a 42-minute session, measured against a run without VAD (a lost span counts only when an independent run confirms the words):

| Config | Real words lost |
| --- | --- |
| VAD, whisper.cpp defaults (100 ms min silence, 30 ms padding) | 141 (~3%) |
| VAD, 2 s min silence, 400 ms padding (`whisper_cli.rs`) | 85 (~2%) |
| No VAD, `--max-context 0` | 44 (~1%) |

So VAD isn't on the first pass.

### Repetition repair: the retry ladder

With repair on (the default), each chunk goes through `engine.rs`:

1. Full context, no VAD: keeps every quiet word. Most chunks stop here.
2. If that loops: `--max-context 0` (no carried text, which is what lets a loop feed on itself). This fixed every loop it was tried on.
3. If that still loops and a VAD model is configured: `--max-context 0` with VAD.

The least-looped attempt is kept, and any repeated copies it still has are removed. A retry costs one extra pass, only for chunks that loop. With repair off, VAD (if configured) runs on every pass.

### Stop cue and trailing "Thank you."

23 stored transcripts end in a "thank you"-style line. The stop cue was being recorded: it played while capture was still running, and its two-tone chirp sat in the last ~0.2 s of the WAV, right after the silence of reaching for the stop button. That's where Whisper invents trailing words. The cue now plays only after capture stops.

## Microphone and recording quality

Analysis of the reference recording (FIFINE USB mic, user walking around the desk):

- Integrated loudness −36.7 LUFS, peaks −7 dBFS: quiet. Typical speech recordings sit at −16 to −23 LUFS.
- Voice level (90th percentile of 50 ms frames) −33 dBFS, background (10th percentile) −60 dBFS: **27 dB apart**, a clean signal. No hum, no tonal noise, and full bandwidth to 12 kHz in the spectrogram.
- Level changes by minute were small (about 4 dB) in this note. A session that produced a 119-line loop showed 20 dB voice-to-background and a 15 dB swing between minutes: the walking-around signature.

Whisper normalizes its input, so raising gain alone barely changes accuracy. Distance does: the further from the mic, the more room echo and background relative to voice. In order of impact:

1. **Keep the distance constant.** A headset or clip-on (lavalier) mic stays a few centimeters from the mouth while walking. This beats any desk-mic upgrade for this way of recording.
2. If staying at the desk mic, stay within about a forearm's length and talk toward it.
3. A better desk mic (a dynamic mic, which picks up less room) helps less than either of the above, because the current mic's signal is already clean when you're close.

The app now measures every recording (`audio/quality.rs`) and shows the voice level, background level and tips under Session Details.

## Other engines considered

- **Benchmarks vs this user's audio:** on the Hugging Face Open ASR leaderboard, Parakeet TDT v3 beats Whisper large-v3 (about 6.3% vs 7.4% average WER) and NVIDIA Canary-Qwen 2.5B leads (about 5.6%). Those test sets have few product names and no hour-long walking monologues. On the recordings measured here, Whisper turbo with a vocabulary did better.
- **mistral.rs:** a Rust inference engine for LLMs and multimodal models. Mistral's speech models (Voxtral, Voxtral Transcribe 2) are strong but are mainly served through Mistral's API or Python stacks; there's no clearly better, single-binary local path than whisper.cpp today. Not adopted.
- **Canary-Qwen 2.5B, Qwen3-ASR, IBM Granite Speech, Moonshine:** no whisper.cpp-style CLI with GPU support on both Windows and macOS yet. Worth revisiting if one lands in whisper.cpp or a similar single-binary runtime; the engine seam (`transcription/engine.rs`) makes a new CLI engine one file plus a Settings option.
- **Confidence scores:** whisper.cpp can emit per-token probabilities (`-ojf`), which could flag low-confidence passages. Not done yet; repetition detection catches the failure that actually costs the most.
