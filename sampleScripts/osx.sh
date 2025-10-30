#!/bin/bash

# --- USER CONFIGURATION - EDIT THESE PATHS! ---
# NOTE: Assuming 'ffmpeg' is installed (brew install ffmpeg)
WHISPER_CPP_MAIN_PATH="/usr/local/bin/whisper-cli"  # Adjust this path as needed
WHISPER_MODEL_PATH="/usr/local/share/whisper/models/ggml-large-v3-turbo.bin"  # Adjust this path as needed
# --- END USER CONFIGURATION ---

# --- Cleanup function defined first ---
cleanup_and_exit() {
    echo "============================================"
    echo "Step 5: Cleaning up temporary files..."
    echo "============================================"
    
    echo "Deleting temporary files..."
    
    # Remove the entire temp directory
    if [ -d "$PROCESS_TEMP_DIR" ]; then
        rm -rf "$PROCESS_TEMP_DIR"
        echo "Temp directory cleaned up"
    fi
    
    echo "============================================"
    echo "             SCRIPT FINISHED                "
    echo "============================================"
    echo "Final Status: $SCRIPT_STATUS"
    
    if [ -f "$OUTPUT_TXT" ]; then
        echo "Output File: $OUTPUT_TXT"
        echo "First few lines of content:"
        head -n 3 "$OUTPUT_TXT"
    fi
    
    echo "============================================"
    echo
    echo "Transcription complete! Closing in 5 seconds..."
    
    # Wait before exiting
    sleep 5
    
    exit ${1:-0}
}

# Initialize status variable
SCRIPT_STATUS="Processing..."

# Check if a file was provided
if [ $# -eq 0 ]; then
    echo "ERROR: No input file provided."
    echo "Usage: ./transcribe_mac.sh [audio_file]"
    SCRIPT_STATUS="Error: No input file"
    exit 1
fi

# Get the full path of the input file
INPUT_FILE=$(realpath "$1" 2>/dev/null || echo "$(cd "$(dirname "$1")"; pwd)/$(basename "$1")")

# Check if input file exists
if [ ! -f "$INPUT_FILE" ]; then
    echo "ERROR: Input file not found: $INPUT_FILE"
    SCRIPT_STATUS="Error: Input file not found"
    exit 1
fi

# Check if whisper paths are set correctly
if [ ! -f "$WHISPER_CPP_MAIN_PATH" ]; then
    echo "ERROR: whisper.cpp main path invalid: $WHISPER_CPP_MAIN_PATH"
    echo "Please edit this script to set the correct path to whisper-cli"
    SCRIPT_STATUS="Error: Bad whisper.cpp path"
    exit 1
fi

if [ ! -f "$WHISPER_MODEL_PATH" ]; then
    echo "ERROR: whisper model path invalid: $WHISPER_MODEL_PATH"
    echo "Please edit this script to set the correct path to the model file"
    SCRIPT_STATUS="Error: Bad whisper model path"
    exit 1
fi

# --- File Naming ---
INPUT_DIR=$(dirname "$INPUT_FILE")
INPUT_BASENAME=$(basename "$INPUT_FILE" | sed 's/\.[^.]*$//')

# Create a dedicated temp directory for this process
PROCESS_TEMP_DIR="/tmp/whisper_transcribe_$RANDOM"
mkdir -p "$PROCESS_TEMP_DIR"

# Temporary WAV file in dedicated temp directory
TEMP_WAV="$PROCESS_TEMP_DIR/${INPUT_BASENAME}_temp.wav"
# Final output text file 
OUTPUT_TXT="$INPUT_DIR/$INPUT_BASENAME.txt"

echo "============ DEBUG INFO: PATHS ============"
echo "Input file: $INPUT_FILE"
echo "Input directory: $INPUT_DIR"
echo "Input basename: $INPUT_BASENAME"
echo "Process temp dir: $PROCESS_TEMP_DIR"
echo "Temp WAV will be: $TEMP_WAV"
echo "Output TXT will be: $OUTPUT_TXT"
echo "==========================================="
echo

# --- Step 1: Convert audio to 16-bit WAV ---
echo "============================================"
echo "Step 1: Converting $INPUT_FILE to WAV..."
echo "============================================"
ffmpeg -i "$INPUT_FILE" -ar 16000 -ac 1 -c:a pcm_s16le "$TEMP_WAV" -y -loglevel warning

if [ $? -ne 0 ]; then
    echo "ERROR: ffmpeg conversion failed. Check if ffmpeg is installed."
    echo "You can install ffmpeg with: brew install ffmpeg"
    SCRIPT_STATUS="Error: ffmpeg failed"
    cleanup_and_exit 1
fi

if [ ! -f "$TEMP_WAV" ]; then
    echo "ERROR: Temp WAV file was not created."
    SCRIPT_STATUS="Error: Temp WAV missing"
    cleanup_and_exit 1
fi

echo "Conversion complete: $TEMP_WAV"
echo

# --- Step 2: Transcribe WAV using whisper.cpp ---
echo "==================================================================="
echo "Step 2: Running Whisper.cpp Transcription..."
echo "==================================================================="

# Whisper.cpp creates output as input_file.wav.txt by default
TEMP_WHISPER_TXT="${TEMP_WAV}.txt"
"$WHISPER_CPP_MAIN_PATH" -m "$WHISPER_MODEL_PATH" -f "$TEMP_WAV" -otxt

if [ $? -ne 0 ]; then
    echo "ERROR: Whisper.cpp transcription failed."
    SCRIPT_STATUS="Error: whisper.cpp failed"
    cleanup_and_exit 1
fi

# Wait for file to be created
sleep 2

if [ ! -f "$TEMP_WHISPER_TXT" ]; then
    echo "ERROR: Whisper text file was not created: $TEMP_WHISPER_TXT"
    SCRIPT_STATUS="Error: Temp TXT missing"
    cleanup_and_exit 1
fi

echo "Whisper transcription complete"
echo

# --- Step 3: Clean timestamps and create final TXT file ---
echo "=================================================================="
echo "Step 3: Removing timestamps and creating final $OUTPUT_TXT"
echo "=================================================================="

# Use grep to remove timestamp lines and save to final file
grep -v '^\s*\[[0-9][0-9]:[0-9][0-9]:[0-9][0-9]' "$TEMP_WHISPER_TXT" > "$OUTPUT_TXT"

if [ $? -ne 0 ]; then
    echo "ERROR: Failed to clean timestamps."
    SCRIPT_STATUS="Error: Timestamp cleaning failed"
    cleanup_and_exit 1
fi

if [ ! -f "$OUTPUT_TXT" ]; then
    echo "ERROR: Final text file was not created."
    SCRIPT_STATUS="Error: Final TXT missing"
    cleanup_and_exit 1
fi

# Check if the final file is empty
if [ ! -s "$OUTPUT_TXT" ]; then
    echo "WARNING: Final output file is empty."
    SCRIPT_STATUS="Warning: Empty output TXT"
    cleanup_and_exit 1
fi

echo "Cleaning complete. Final text saved to $OUTPUT_TXT"
echo

# --- Step 4: Copy to clipboard ---
echo "============================================"
echo "Step 4: Copying text to clipboard..."
echo "============================================"

# macOS uses pbcopy for clipboard operations
CLIPBOARD_SUCCESS=false

if command -v pbcopy >/dev/null 2>&1; then
    # macOS native clipboard command
    cat "$OUTPUT_TXT" | pbcopy
    echo "Text copied to clipboard using pbcopy"
    CLIPBOARD_SUCCESS=true
else
    echo "WARNING: pbcopy not found. Text not copied to clipboard."
    echo "You can manually copy the content from: $OUTPUT_TXT"
fi

if [ "$CLIPBOARD_SUCCESS" = true ]; then
    SCRIPT_STATUS="Success! Transcription complete and copied."
else
    SCRIPT_STATUS="Success! Transcription complete (clipboard copy failed)."
fi

# Call cleanup function to finish
cleanup_and_exit 0 