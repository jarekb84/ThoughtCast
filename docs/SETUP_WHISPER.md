# Setting Up Whisper Transcription

This guide walks you through setting up Whisper.cpp for automatic transcription in ThoughtCast.

## Prerequisites

Before you start, you need:
- ThoughtCast installed and running
- Whisper.cpp compiled on your machine
- A Whisper model file downloaded

## Step 1: Install Whisper.cpp

### Option A: Build from Source (Recommended)

1. **Clone the repository:**
   ```bash
   git clone https://github.com/ggerganov/whisper.cpp.git
   cd whisper.cpp
   ```

2. **Build for Windows:**
   ```bash
   mkdir build
   cd build
   cmake ..
   cmake --build . --config Release
   ```

   The executable will be at: `build/bin/Release/whisper-cli.exe`

3. **Build for macOS:**
   ```bash
   make
   ```

   The executable will be at: `./main`

### Option B: Pre-built Binaries

Check the [Whisper.cpp releases page](https://github.com/ggerganov/whisper.cpp/releases) for pre-built binaries (availability varies).

## Step 2: Download a Model

1. **Navigate to your whisper.cpp directory:**
   ```bash
   cd whisper.cpp
   ```

2. **Download a model using the provided script:**

   **For quick testing (smallest, fastest):**
   ```bash
   bash ./models/download-ggml-model.sh base
   ```

   **For better accuracy:**
   ```bash
   bash ./models/download-ggml-model.sh large-v3-turbo
   ```

   **For best accuracy (slower):**
   ```bash
   bash ./models/download-ggml-model.sh large-v3
   ```

3. **Model files will be saved to:** `models/ggml-{name}.bin`

### Model Comparison

| Model | Size | Speed | Accuracy | Recommended For |
|-------|------|-------|----------|-----------------|
| `tiny` | 75 MB | Very Fast | Basic | Testing only |
| `base` | 142 MB | Fast | Good | Quick notes |
| `small` | 466 MB | Medium | Better | General use |
| `medium` | 1.5 GB | Slow | Great | Important recordings |
| `large-v3-turbo` | 809 MB | Fast | Excellent | **Best balance** ⭐ |
| `large-v3` | 3.1 GB | Very Slow | Best | Maximum accuracy |

**Recommendation:** Start with `large-v3-turbo` for the best speed/accuracy balance.

## Step 3: Create Configuration File

1. **Find your ThoughtCast data directory:**
   - **Windows:** `C:\Users\YourName\Documents\ThoughtCast\`
   - **macOS:** `~/Documents/ThoughtCast/`

2. **Create `config.json` in that directory:**

### Windows Example

Create: `C:\Users\YourName\Documents\ThoughtCast\config.json`

```json
{
  "whisperPath": "C:\\Source\\whisper.cpp\\build\\bin\\Release\\whisper-cli.exe",
  "modelPath": "C:\\Source\\whisper.cpp\\models\\ggml-large-v3-turbo.bin"
}
```

**Important:** Use double backslashes `\\` in Windows paths!

### macOS Example

Create: `~/Documents/ThoughtCast/config.json`

```json
{
  "whisperPath": "/usr/local/bin/whisper",
  "modelPath": "/Users/yourname/whisper.cpp/models/ggml-large-v3-turbo.bin"
}
```

### Tips for Path Configuration

**Finding your Whisper executable:**
- Windows: Look in `whisper.cpp\build\bin\Release\whisper-cli.exe`
- macOS: The executable is usually named `main` in the whisper.cpp root directory

**Finding your model file:**
- Always in the `models/` subdirectory of your whisper.cpp installation
- Named like: `ggml-base.bin`, `ggml-large-v3-turbo.bin`, etc.

**Path format:**
- Windows: Use `C:\\path\\to\\file.exe` (double backslashes)
- macOS: Use `/path/to/file` (forward slashes)
- Always use absolute paths, not relative paths

## Step 4: Test Your Configuration

1. **Open ThoughtCast**

2. **Record a test:**
   - Click the **Record** button
   - Say: "This is a test recording for ThoughtCast"
   - Click **Stop**

3. **Watch the status:**
   - You should see: "Saving and transcribing audio..."
   - Then: "Transcription complete!"

4. **Check the transcript:**
   - The sidebar should show your spoken text
   - Click the session to see the full transcript

## Troubleshooting

### Error: "Config file not found"

**Problem:** ThoughtCast can't find your config.json

**Solution:**
1. Check you created the file in the correct location
2. Windows: `C:\Users\YourName\Documents\ThoughtCast\config.json`
3. macOS: `~/Documents/ThoughtCast/config.json`

### Error: "Whisper executable not found"

**Problem:** The path to your Whisper executable is wrong

**Solution:**
1. Open your config.json
2. Verify the `whisperPath` points to the actual executable file
3. Test the path in your terminal:
   ```bash
   # Windows
   C:\Source\whisper.cpp\build\bin\Release\whisper-cli.exe --help

   # macOS
   /usr/local/bin/whisper --help
   ```
4. If the command works, copy that exact path into config.json

### Error: "Whisper model not found"

**Problem:** The path to your model file is wrong

**Solution:**
1. Check your `models/` directory in whisper.cpp
2. List the files:
   ```bash
   # Windows
   dir C:\Source\whisper.cpp\models\

   # macOS
   ls ~/whisper.cpp/models/
   ```
3. Copy the full path to the `.bin` file into `modelPath`

### Transcription shows garbage text

**Problem:** Model or audio format issue

**Solutions:**
1. Try a different model (download `base` or `large-v3-turbo`)
2. Verify your audio is being recorded (check the .wav file in `audio/` folder)
3. Make sure you're using a model in the correct format (ggml-*.bin)

### Transcription is very slow

**Problem:** Model is too large for your hardware

**Solutions:**
1. Use a smaller model (try `base` or `large-v3-turbo`)
2. Enable GPU acceleration (requires rebuilding Whisper.cpp with CUDA/Metal support)
3. Close other applications while transcribing

### No error but transcript is empty

**Problem:** Whisper ran but produced no output

**Solutions:**
1. Test Whisper directly from command line:
   ```bash
   # Windows
   C:\Source\whisper.cpp\build\bin\Release\whisper-cli.exe -m C:\Source\whisper.cpp\models\ggml-base.bin -f test.wav

   # macOS
   ./main -m models/ggml-base.bin -f test.wav
   ```
2. If Whisper works standalone, check file permissions on your Documents folder
3. Try recording a longer clip (5+ seconds)

## Advanced Configuration

### Using GPU Acceleration

If you have an NVIDIA GPU (Windows) or Apple Silicon (macOS), you can enable GPU acceleration for much faster transcription.

**NVIDIA GPU (CUDA):**
```bash
cd whisper.cpp
mkdir build
cd build
cmake .. -DWHISPER_CUDA=ON
cmake --build . --config Release
```

**Apple Silicon (Metal):**
```bash
cd whisper.cpp
make WHISPER_METAL=1
```

Then update your config.json to point to the new GPU-enabled executable.

### Multiple Models

You can switch between models by just changing the `modelPath` in your config.json. No need to restart ThoughtCast - just record a new session and it will use the new model.

## Verification Checklist

- [ ] Whisper.cpp compiled successfully
- [ ] Model file downloaded (at least `base` or `large-v3-turbo`)
- [ ] config.json created in Documents/ThoughtCast/
- [ ] Paths in config.json are absolute and correct
- [ ] Windows paths use double backslashes `\\`
- [ ] Test recording produces a transcript
- [ ] Transcript appears in the UI
- [ ] Transcript text matches what you said

## Next Steps

Once transcription is working:
1. Try different models to find the best speed/accuracy for your needs
2. Record longer sessions to test with real use cases
3. Check the [WHISPER_IMPLEMENTATION.md](WHISPER_IMPLEMENTATION.md) for technical details
4. Enable GPU acceleration for faster transcription
5. Consider setting up automatic clipboard copy (coming soon!)

## Getting Help

If you're still having issues:
1. Check the [Whisper.cpp documentation](https://github.com/ggerganov/whisper.cpp)
2. Verify Whisper works standalone before debugging ThoughtCast
3. Look at the logs in ThoughtCast console (if running in dev mode)
4. Open an issue on the ThoughtCast GitHub repository

## Quick Reference

**Config file location:**
- Windows: `C:\Users\YourName\Documents\ThoughtCast\config.json`
- macOS: `~/Documents/ThoughtCast/config.json`

**Example config.json:**
```json
{
  "whisperPath": "C:\\Source\\whisper.cpp\\build\\bin\\Release\\whisper-cli.exe",
  "modelPath": "C:\\Source\\whisper.cpp\\models\\ggml-large-v3-turbo.bin"
}
```

**Recommended model:** `large-v3-turbo` (best balance of speed and accuracy)

**Download command:**
```bash
bash ./models/download-ggml-model.sh large-v3-turbo
```

Happy transcribing! 🎙️→📝
