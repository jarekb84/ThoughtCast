@echo off
setlocal EnableDelayedExpansion

:: --- Log File Setup ---
for %%I in ("%~f0") do set SCRIPT_DIR=%%~dpI
set LOG_FILE="%SCRIPT_DIR%transcribe_log.txt"
:: Clear the log file - redirect errors to error.txt just in case
:: type nul > "%LOG_FILE%" 2> error.txt

:: Start the log with overwrite redirection
echo ====================================  > %LOG_FILE%
echo Log started at: %date% %time%       >> %LOG_FILE%
echo Script Path: "%~f0"                >> %LOG_FILE%
echo Script Directory: "%SCRIPT_DIR%"     >> %LOG_FILE%
echo Log File Path: %LOG_FILE%           >> %LOG_FILE%
echo ====================================  >> %LOG_FILE%

:: --- USER CONFIGURATION - EDIT THESE PATHS! ---
set WHISPER_CPP_MAIN_PATH="C:\Source\whisper.cpp\build\bin\Release\whisper-cli.exe"
set WHISPER_MODEL_PATH="C:\Source\whisper.cpp\models\ggml-large-v3-turbo.bin"
:: set WHISPER_MODEL_PATH="C:\Source\whisper.cpp\models\ggml-large-v3.bin"
echo User Config WHISPER_CPP_MAIN_PATH=%WHISPER_CPP_MAIN_PATH%  >> %LOG_FILE%
echo User Config WHISPER_MODEL_PATH=%WHISPER_MODEL_PATH%      >> %LOG_FILE%
echo Config logging complete.  >> %LOG_FILE%

:: --- Script Setup ---
echo Setting up directories and status...  >> %LOG_FILE%
set PROCESSING_DIR=%SCRIPT_DIR%processing\
set ARCHIVE_DIR=%SCRIPT_DIR%archive\
set SCRIPT_STATUS=Initializing...
echo ============================================ >> %LOG_FILE%
echo        Transcription Script Started >> %LOG_FILE%
echo ============================================ >> %LOG_FILE%
echo Script Directory: %SCRIPT_DIR% >> %LOG_FILE%
echo Processing Directory: %PROCESSING_DIR% >> %LOG_FILE%
echo Archive Directory: %ARCHIVE_DIR% >> %LOG_FILE%
echo Log File: %LOG_FILE% >> %LOG_FILE%
echo. >> %LOG_FILE%
echo Script setup echo lines complete.  >> %LOG_FILE%

:: --- Input Validation ---
echo Starting input validation...  >> %LOG_FILE%
if [%1]==[] ( echo ERROR: No input file provided. & set SCRIPT_STATUS=Error: No input file & echo ERROR: No input file provided.  & goto end_script )
set inputFile=%~f1
echo Input file: "%inputFile%" >> %LOG_FILE%
echo Input file set to: "%inputFile%"  >> %LOG_FILE%
if not exist "%inputFile%" ( echo ERROR: Input file not found: "%inputFile%" & set SCRIPT_STATUS=Error: Input file not found & echo ERROR: Input file not found: "%inputFile%"  & goto end_script )
if not exist %WHISPER_CPP_MAIN_PATH% ( echo ERROR: whisper.cpp main path invalid: %WHISPER_CPP_MAIN_PATH% & set SCRIPT_STATUS=Error: Bad whisper.cpp path & echo ERROR: whisper.cpp main path invalid: %WHISPER_CPP_MAIN_PATH%  & goto end_script )
if not exist %WHISPER_MODEL_PATH% ( echo ERROR: whisper model path invalid: %WHISPER_MODEL_PATH% & set SCRIPT_STATUS=Error: Bad whisper model path & echo ERROR: whisper model path invalid: %WHISPER_MODEL_PATH%  & goto end_script )
echo Input validation passed.  >> %LOG_FILE%
echo. >> %LOG_FILE%

echo ============================================ >> %LOG_FILE%
echo Step 0: Preparing Directories & Archiving... >> %LOG_FILE%
echo ============================================ >> %LOG_FILE%
set SCRIPT_STATUS=Preparing directories...
echo Starting directory preparation...  >> %LOG_FILE%
if not exist "%PROCESSING_DIR%" ( echo Creating Processing Dir: "%PROCESSING_DIR%"  & mkdir "%PROCESSING_DIR%"  2>&1 || ( echo ERROR: Failed to create processing directory. & set SCRIPT_STATUS=Error: Failed mkdir processing & goto end_script ) ) 
if not exist "%ARCHIVE_DIR%" ( echo Creating Archive Dir: "%ARCHIVE_DIR%"  & mkdir "%ARCHIVE_DIR%"  2>&1 || ( echo ERROR: Failed to create archive directory. & set SCRIPT_STATUS=Error: Failed mkdir archive & goto end_script ) )
dir "%PROCESSING_DIR%" /b /a-d > nul 2>&1
if not errorlevel 1 (
    echo Archiving previous files from "%PROCESSING_DIR%" to "%ARCHIVE_DIR%" >> %LOG_FILE%
    echo Checking for files to archive in "%PROCESSING_DIR%"  >> %LOG_FILE%
    move /Y "%PROCESSING_DIR%*.*" "%ARCHIVE_DIR%" > nul
    if errorlevel 1 ( echo WARNING: Failed to move all files from processing to archive. Check permissions/locks. & echo WARNING: Failed archiving move. Errorlevel: %errorlevel%  & set SCRIPT_STATUS=Warning: Archive move failed ) else ( echo Previous files archived successfully.  )
) else ( echo Processing directory is empty. Nothing to archive. & echo Nothing to archive found in "%PROCESSING_DIR%"  )
echo Directory preparation complete.  >> %LOG_FILE%
echo. >> %LOG_FILE%

echo ============================================ >> %LOG_FILE%
echo Step 1: Defining File Names (AM/PM Format)... >> %LOG_FILE%
echo ============================================ >> %LOG_FILE%
set SCRIPT_STATUS=Defining names...
echo Getting timestamp...  >> %LOG_FILE%
for /f "tokens=*" %%a in ('powershell -ExecutionPolicy Bypass -Command "Get-Date -Format 'yyyyMMdd_hhmmss_tt'"') do set TIMESTAMP=%%a
if "!TIMESTAMP!"=="" ( echo ERROR: Failed to get timestamp. & set SCRIPT_STATUS=Error: Timestamp failed & echo ERROR: Failed to get timestamp.  & goto end_script )
set INPUT_BASENAME=%~n1
set INPUT_EXT=%~x1
set NEW_BASENAME=%TIMESTAMP%_%INPUT_BASENAME%
set FINAL_AUDIO_PATH=%PROCESSING_DIR%%NEW_BASENAME%%INPUT_EXT%
set FINAL_TXT_PATH=%PROCESSING_DIR%%NEW_BASENAME%.txt
echo Original Basename: %INPUT_BASENAME% >> %LOG_FILE%
echo Timestamp: %TIMESTAMP% >> %LOG_FILE%
echo New Basename: %NEW_BASENAME% >> %LOG_FILE%
echo Final Audio Path: "%FINAL_AUDIO_PATH%" >> %LOG_FILE%
echo Final Text Path: "%FINAL_TXT_PATH%" >> %LOG_FILE%
echo --- Variables set ---  & echo INPUT_BASENAME=%INPUT_BASENAME%  & echo INPUT_EXT=%INPUT_EXT%  & echo TIMESTAMP=%TIMESTAMP%  & echo NEW_BASENAME=%NEW_BASENAME%  & echo FINAL_AUDIO_PATH="%FINAL_AUDIO_PATH%"  & echo FINAL_TXT_PATH="%FINAL_TXT_PATH%"  >> %LOG_FILE%
echo. >> %LOG_FILE%

:: Create dedicated temp directory
set PROCESS_TEMP_DIR=%TEMP%\whisper_transcribe_%TIMESTAMP%_%RANDOM%
echo Creating temp directory: "%PROCESS_TEMP_DIR%"  >> %LOG_FILE%
mkdir "%PROCESS_TEMP_DIR%"  2>&1 || ( echo ERROR: Failed to create temp dir "%PROCESS_TEMP_DIR%" & set SCRIPT_STATUS=Error: Failed mkdir temp & goto cleanup_temp_only )
set TEMP_WAV=%PROCESS_TEMP_DIR%\%NEW_BASENAME%_temp.wav
echo Temporary WAV will be: "%TEMP_WAV%" >> %LOG_FILE%
echo TEMP_WAV="%TEMP_WAV%"  >> %LOG_FILE%
echo File name definition complete.  >> %LOG_FILE%
echo. >> %LOG_FILE%

echo ============================================ >> %LOG_FILE%
echo Step 2: Converting "%inputFile%" to WAV... >> %LOG_FILE%
echo ============================================ >> %LOG_FILE%
set SCRIPT_STATUS=Converting to WAV...
echo Running ffmpeg... Command logged.  >> %LOG_FILE%
ffmpeg -i "%inputFile%" -ar 16000 -ac 1 -c:a pcm_s16le "%TEMP_WAV%" -y -loglevel warning  2>&1
if errorlevel 1 ( echo ERROR: ffmpeg conversion failed. Check log file. & echo FFMPEG ERROR: Errorlevel %errorlevel%  & set SCRIPT_STATUS=Error: ffmpeg failed & goto cleanup )
if not exist "%TEMP_WAV%" ( echo ERROR: Temp WAV file was not created after ffmpeg. Check log. & echo FFMPEG ERROR: Temp WAV missing post-run.  & set SCRIPT_STATUS=Error: Temp WAV missing & goto cleanup )
echo Conversion complete: "%TEMP_WAV%" >> %LOG_FILE%
echo FFMPEG conversion successful.  >> %LOG_FILE%
echo. >> %LOG_FILE%

echo =================================================================== >> %LOG_FILE%
echo Step 3: Running Whisper.cpp Transcription... >> %LOG_FILE%
echo =================================================================== >> %LOG_FILE%
set SCRIPT_STATUS=Running whisper.cpp...
set TEMP_WHISPER_TXT=%TEMP_WAV%.txt
echo Running Whisper... Command logged.  >> %LOG_FILE%
%WHISPER_CPP_MAIN_PATH% -m %WHISPER_MODEL_PATH% -f "%TEMP_WAV%" -otxt 2>&1
if errorlevel 1 ( echo ERROR: Whisper.cpp transcription failed. Check log file. & echo WHISPER ERROR: Errorlevel %errorlevel%  & set SCRIPT_STATUS=Error: whisper.cpp failed & goto cleanup )
ping 127.0.0.1 -n 2 > nul
if not exist "%TEMP_WHISPER_TXT%" ( echo ERROR: Whisper temp text file not created: "%TEMP_WHISPER_TXT%". Check log. & echo WHISPER ERROR: Temp TXT missing post-run.  & set SCRIPT_STATUS=Error: Temp TXT missing & goto cleanup )
echo Whisper transcription complete. Temp text: "%TEMP_WHISPER_TXT%" >> %LOG_FILE%
echo WHISPER transcription successful.  >> %LOG_FILE%
echo. >> %LOG_FILE%

echo ================================================================== >> %LOG_FILE%
echo Step 4: Removing timestamps and creating final "%FINAL_TXT_PATH%" >> %LOG_FILE%
echo ================================================================== >> %LOG_FILE%
set SCRIPT_STATUS=Cleaning timestamps...
echo Running PowerShell timestamp cleaning... Command logged.  >> %LOG_FILE%
powershell -ExecutionPolicy Bypass -Command "(Get-Content -Path '%TEMP_WHISPER_TXT%') | Where-Object { $_ -notmatch '^\s*\[\d\d:\d\d:\d\d' } | Set-Content -Path '%FINAL_TXT_PATH%' -Encoding UTF8"  2>&1
if errorlevel 1 ( echo ERROR: Failed to clean timestamps. Check log file. & echo POWERSHELL CLEAN ERROR: Errorlevel %errorlevel%  & set SCRIPT_STATUS=Error: Timestamp cleaning failed & goto cleanup )
if not exist "%FINAL_TXT_PATH%" ( echo ERROR: Final text file was not created: "%FINAL_TXT_PATH%". Check log. & echo POWERSHELL CLEAN ERROR: Final TXT missing post-run.  & set SCRIPT_STATUS=Error: Final TXT missing & goto cleanup )
for %%F in ("%FINAL_TXT_PATH%") do if %%~zF equ 0 ( echo WARNING: Final output file is empty. & echo WARNING: Final TXT is empty.  & set SCRIPT_STATUS=Warning: Empty output TXT ) else ( echo Cleaning complete. Final text saved to "%FINAL_TXT_PATH%" & echo POWERSHELL CLEAN successful.  )
echo. >> %LOG_FILE%

echo ============================================ >> %LOG_FILE%
echo Step 5: Copying text to clipboard... >> %LOG_FILE%
echo ============================================ >> %LOG_FILE%
set SCRIPT_STATUS=Copying to clipboard...
set CLIPBOARD_SUCCESS=0

powershell -ExecutionPolicy Bypass -Command "$text = Get-Content -Path '%FINAL_TXT_PATH%' -Raw; Set-Clipboard -Value $text"  2>&1
echo Text copied to clipboard. You can paste it now. >> %LOG_FILE%
set SCRIPT_STATUS=Success! Transcription complete and copied.


echo ============================================ >> %LOG_FILE%
echo Step 6: Moving and Renaming original audio file... >> %LOG_FILE%
echo ============================================ >> %LOG_FILE%
set SCRIPT_STATUS=Moving original audio...
echo Starting Move/Rename step...  >> %LOG_FILE%

echo DEBUG: Checking source file existence before move: "%inputFile%" >> %LOG_FILE%
echo DEBUG: Checking source: "%inputFile%"  >> %LOG_FILE%
if not exist "%inputFile%" (
    echo ########## FATAL ERROR in Step 6 ########## >> %LOG_FILE%
    echo # Source audio file NOT FOUND right before attempting move! Path: "%inputFile%" >> %LOG_FILE%
    echo FATAL ERROR: Source audio missing pre-move: "%inputFile%"  >> %LOG_FILE%
    echo ############################################# >> %LOG_FILE%
    set SCRIPT_STATUS=Error: Source audio missing pre-move
    goto cleanup
) else (
    echo DEBUG: Source file "%inputFile%" exists. Proceeding with move. >> %LOG_FILE%
    echo DEBUG: Source exists.  >> %LOG_FILE%
)

echo DEBUG: Pausing for 2 seconds before attempting move... >> %LOG_FILE%
echo DEBUG: Pausing 2 seconds...  >> %LOG_FILE%
ping 127.0.0.1 -n 3 > nul

echo DEBUG: Attempting to move: FROM: "%inputFile%" TO: "%FINAL_AUDIO_PATH%" >> %LOG_FILE%
echo DEBUG: Running move command... Command logged.  >> %LOG_FILE%
move "%inputFile%" "%FINAL_AUDIO_PATH%"  2>&1
set MOVE_ERRORLEVEL=%errorlevel%
echo DEBUG: Move command finished with Errorlevel: !MOVE_ERRORLEVEL! >> %LOG_FILE%
echo DEBUG: Move finished. Errorlevel: !MOVE_ERRORLEVEL!  >> %LOG_FILE%

if !MOVE_ERRORLEVEL! neq 0 (
    echo ########## ERROR during Step 6 ########## >> %LOG_FILE%
    echo # Failed to move/rename original audio file! (Errorlevel: !MOVE_ERRORLEVEL!)
    echo # Source: "%inputFile%" >> %LOG_FILE%
    echo # Target: "%FINAL_AUDIO_PATH%" >> %LOG_FILE%
    echo # Error message from MOVE command should be in the log file. >> %LOG_FILE%
    echo MOVE ERROR: Failed. Errorlevel: !MOVE_ERRORLEVEL!  >> %LOG_FILE%
    echo MOVE ERROR DETAILS: Source: "%inputFile%" Target: "%FINAL_AUDIO_PATH%"  >> %LOG_FILE%
    echo ############################################# >> %LOG_FILE%
    set SCRIPT_STATUS=Error: Failed final audio move (Code: !MOVE_ERRORLEVEL!)
    if exist "%inputFile%" ( echo DEBUG: Original file "%inputFile%" still exists after failed move attempt. & echo DEBUG: Original file still exists post-fail.  ) else ( echo DEBUG: Original file "%inputFile%" is GONE after failed move attempt (Unexpected!). & echo DEBUG WARNING: Original file gone post-fail (Unexpected!).  )
    goto cleanup
) else (
    echo SUCCESS: Original audio file moved and renamed successfully. >> %LOG_FILE%
    echo MOVE SUCCESS.  >> %LOG_FILE%
    if exist "%FINAL_AUDIO_PATH%" (
        echo DEBUG: Verified target file exists: "%FINAL_AUDIO_PATH%" >> %LOG_FILE%
        echo DEBUG: Verified target exists: "%FINAL_AUDIO_PATH%"  >> %LOG_FILE%
        if exist "%FINAL_TXT_PATH%" (
            if %CLIPBOARD_SUCCESS% == 1 ( set SCRIPT_STATUS=Success! Processed, archived, clipboard SKIPPED. ) else ( set SCRIPT_STATUS=Success (with Clipboard FAIL/SKIPPED)! Processed and archived. )
        ) else { set SCRIPT_STATUS=Error: Audio moved but TXT missing post-process? & echo ERROR: Audio moved but TXT missing post-process?  } >> %LOG_FILE%
    ) else (
        echo ########## CRITICAL WARNING ########## >> %LOG_FILE%
        echo # Move command reported success (Errorlevel 0), but the target file cannot be found! Path: "%FINAL_AUDIO_PATH%" >> %LOG_FILE%
        echo CRITICAL WARNING: Move success but target missing! Path: "%FINAL_AUDIO_PATH%"  >> %LOG_FILE%
        echo ##################################### >> %LOG_FILE%
        set SCRIPT_STATUS=CRITICAL Warning: Move success but target missing! Check manually!
        goto cleanup
    )
)
echo Move/Rename step finished. Status: %SCRIPT_STATUS%  >> %LOG_FILE%
echo. >> %LOG_FILE%


:cleanup
echo ============================================ >> %LOG_FILE%
echo Step 7: Cleaning up temporary files... >> %LOG_FILE%
echo ============================================ >> %LOG_FILE%
:cleanup_temp_only
if exist "%PROCESS_TEMP_DIR%" (
    echo Deleting temporary files from "%PROCESS_TEMP_DIR%" >> %LOG_FILE%
    echo Deleting temp dir: "%PROCESS_TEMP_DIR%"  >> %LOG_FILE%
    rmdir /s /q "%PROCESS_TEMP_DIR%"  2>&1
    if errorlevel 1 ( 
        echo WARNING: Could not delete temp dir "%PROCESS_TEMP_DIR%". Manual cleanup needed. >> %LOG_FILE%
        echo WARNING: Failed deleting temp dir. Errorlevel: %errorlevel% >> %LOG_FILE%
    ) else ( 
        echo Temporary directory cleaned up. & echo Temp dir deleted successfully.  
    )
) else ( 
    echo No temporary directory found to clean. >> %LOG_FILE%
    echo No temp dir found to clean. >> %LOG_FILE%
) 
echo ============================================ >> %LOG_FILE%
echo. >> %LOG_FILE%

:end_script
echo ============================================ >> %LOG_FILE%
echo        Transcription Script Finished >> %LOG_FILE%
echo ============================================ >> %LOG_FILE%
echo Final Status: %SCRIPT_STATUS% >> %LOG_FILE%
echo --- Final Summary ---  >> %LOG_FILE%
echo Final Status: %SCRIPT_STATUS%  >> %LOG_FILE%
if exist "%FINAL_TXT_PATH%" ( echo Last Processed Text File: "%FINAL_TXT_PATH%"  )
if exist "%FINAL_AUDIO_PATH%" ( echo Last Processed Audio File: "%FINAL_AUDIO_PATH%"  ) else ( >> %LOG_FILE%
     if defined MOVE_ERRORLEVEL if !MOVE_ERRORLEVEL! neq 0 ( echo NOTE: Original audio file FAILED to move/rename. Check source dir: "%inputFile%" & echo NOTE: Original audio FAILED move/rename. Source: "%inputFile%"  )
     if defined SCRIPT_STATUS if "!SCRIPT_STATUS!"=="CRITICAL Warning: Move success but target missing! Check manually!" ( echo NOTE: Move *reported* success, but target is missing. Original may be lost! Check manually. & echo NOTE: Move success but target missing. Target: "%FINAL_AUDIO_PATH%"  )
)
echo ============================================  >> %LOG_FILE%
echo Log finished at: %date% %time%              >> %LOG_FILE%
echo ============================================  >> %LOG_FILE%

:: Display final status to user and pause
echo Script execution finished. See %LOG_FILE% for details. >> %LOG_FILE%
echo Final Status: %SCRIPT_STATUS% >> %LOG_FILE%
echo Press any key to close this window... >> %LOG_FILE%
pause > nul