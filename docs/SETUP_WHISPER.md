# Setting Up Local Transcription

ThoughtCast transcribes on your machine with [whisper.cpp](https://github.com/ggml-org/whisper.cpp). You install whisper.cpp and a model once, then point ThoughtCast at them in **Settings → Transcription**. Nothing is sent anywhere.

What you need:

| Piece | Recommended | Required? |
| --- | --- | --- |
| whisper.cpp | 1.9.x (1.7.6+ for voice activity detection) | Yes |
| Whisper model | `ggml-large-v3-turbo.bin` | Yes |
| Silero VAD model | `ggml-silero-v6.2.0.bin` | Strongly recommended |
| FFmpeg | any recent version | For long recordings (chunking) and audio compression |
| Parakeet model | `ggml-parakeet-tdt-0.6b-v3-f16.bin` | Only for the Parakeet engine |

[transcription-accuracy.md](transcription-accuracy.md) explains why these are the recommendations.

## 1. Install whisper.cpp

### Windows: prebuilt binaries

Download the latest release from [whisper.cpp releases](https://github.com/ggml-org/whisper.cpp/releases):

- NVIDIA GPU: `whisper-bin-win-cuda-12.4.0-x64.zip` (or the CUDA 11.8 build for older drivers)
- No NVIDIA GPU: `whisper-bin-x64.zip`

Unzip it somewhere permanent, e.g. `C:\Tools\whisper.cpp-1.9.5\`. The `Release` folder contains `whisper-cli.exe` and `parakeet-cli.exe`.

### macOS (Apple Silicon): build from source

```bash
git clone https://github.com/ggml-org/whisper.cpp.git
cd whisper.cpp
cmake -B build
cmake --build build -j --config Release
```

Metal acceleration is on by default. The binaries are `build/bin/whisper-cli` and `build/bin/parakeet-cli`.

### Upgrading an existing install

Pull and rebuild (or unzip the new release next to the old one), then point Settings at the new `whisper-cli`. ThoughtCast checks the binary's `--help` and only passes options it supports, so an older build keeps working: it just skips voice activity detection and the carried vocabulary prompt. Check your version with `whisper-cli --version` (1.8.7+).

## 2. Download the models

From the whisper.cpp folder (macOS/Linux):

```bash
bash ./models/download-ggml-model.sh large-v3-turbo
bash ./models/download-vad-model.sh silero-v6.2.0
```

Or download directly:

- Whisper: [ggml-large-v3-turbo.bin](https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin) (1.6 GB)
- VAD: [ggml-silero-v6.2.0.bin](https://huggingface.co/ggml-org/whisper-vad/resolve/main/ggml-silero-v6.2.0.bin) (under 1 MB)
- Parakeet (optional): [ggml-parakeet-tdt-0.6b-v3-f16.bin](https://huggingface.co/ggml-org/parakeet-GGUF/resolve/main/ggml-parakeet-tdt-0.6b-v3-f16.bin) (1.2 GB; `q8_0` is half the size)

Model choice: `large-v3-turbo` is the most accurate in practice. `large-v3` is several times slower and more prone to repetition loops; the smaller models (`base`, `small`) are only worth it on slow machines.

## 3. Configure ThoughtCast

Open **Settings → Transcription**:

1. **Engine:** Whisper (recommended) or Parakeet.
2. **Whisper CLI** and **Model file:** the paths from steps 1 and 2.
3. **Voice activity detection model:** the Silero file. With voice activity detection Whisper only decodes detected speech, which reliably stops repetition loops, but it can skip a few quiet words. So with loop repair on, it's used as the last-resort retry for audio that keeps looping; with repair off, it's used on every pass.
4. **Vocabulary:** names and terms you say often, comma-separated (product names, people, jargon). Whisper uses them as a spelling hint. Keep it to a few dozen terms.
5. **Repair repetition loops:** leave on. If Whisper repeats a phrase over and over, ThoughtCast re-transcribes that chunk (first without carried context, then with voice activity detection) and removes any repeats that remain.

Set **FFmpeg** under the Audio Compression tab; long recordings are split at pauses before transcribing (Settings → Transcription → Audio Chunking).

Settings are saved to `config.json` in your ThoughtCast folder (`C:\Users\<you>\Documents\ThoughtCast\` or `~/Documents/ThoughtCast/`). The equivalent file:

```json
{
  "whisperPath": "C:\\Tools\\whisper.cpp-1.9.5\\Release\\whisper-cli.exe",
  "modelPath": "C:\\Tools\\models\\ggml-large-v3-turbo.bin",
  "ffmpegPath": "C:\\ProgramData\\chocolatey\\bin\\ffmpeg.exe",
  "transcription": {
    "engine": "whisper",
    "vadModelPath": "C:\\Tools\\models\\ggml-silero-v6.2.0.bin",
    "vocabulary": "ThoughtCast, Claude, Tauri",
    "repairRepetitions": true,
    "parakeetPath": "C:\\Tools\\whisper.cpp-1.9.5\\Release\\parakeet-cli.exe",
    "parakeetModelPath": "C:\\Tools\\models\\ggml-parakeet-tdt-0.6b-v3-f16.bin"
  }
}
```

## 4. Test it

Record a short note and stop. The transcript appears in the session list and is copied to the clipboard. Session Details also shows a **Mic signal** rating with your voice and background levels; if it says Fair or Poor, the tips there (usually: get closer to the mic, or use a headset) do more for accuracy than any model change.

To re-run an older session with new settings, select it and click **Re-transcribe**.

## Troubleshooting

**"Whisper.cpp is not set up" / "model file is missing":** the path in Settings doesn't exist. Use Browse… and check the green tick under each field.

**Transcription fails right after upgrading whisper.cpp:** run the binary by hand to see the error:

```bash
whisper-cli -m ggml-large-v3-turbo.bin -f some-recording.wav
```

On Windows, the CUDA build needs its DLLs next to `whisper-cli.exe`; keep the whole `Release` folder together.

**Slow transcription:** use a GPU build (CUDA on Windows, Metal on macOS). On an RTX 3080, a 23-minute recording takes about 35 seconds with large-v3-turbo.

**Words missing around pauses:** if loop repair is off, voice activity detection runs on every pass and can skip quiet speech. Turn repair on (VAD is then only used for audio that loops), or speak closer to the mic.

**Repeated lines in a transcript:** turn on Repair repetition loops and set a VAD model, then Re-transcribe the session.
