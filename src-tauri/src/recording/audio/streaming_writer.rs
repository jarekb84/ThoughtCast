use std::fs::{File, OpenOptions};
use std::io::{Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};

/// Constants for a 16-bit mono PCM WAV file. We commit to this format
/// up-front because it matches what `audio/writer.rs::write_wav_file` already
/// produces (and what whisper.cpp consumes), and because keeping the format
/// fixed lets us hand-roll a compact, seek-friendly header that we can flush
/// safely from the capture thread.
const BITS_PER_SAMPLE: u16 = 16;
const NUM_CHANNELS: u16 = 1;
const BYTES_PER_SAMPLE: u32 = (BITS_PER_SAMPLE as u32) / 8;
const HEADER_SIZE_BYTES: u32 = 44;

/// File-offset constants the header-flush code seeks to. Documented inline so
/// a future reader doesn't have to re-derive them from the WAV spec.
const RIFF_CHUNK_SIZE_OFFSET: u64 = 4;
const DATA_CHUNK_SIZE_OFFSET: u64 = 40;

/// Incremental WAV writer used to give in-progress recordings on-disk presence
/// before the user presses Stop.
///
/// Why a hand-rolled writer instead of `hound::WavWriter`: hound finalizes the
/// header only when its `finalize()` method consumes the writer, which we
/// cannot call mid-recording. We need to keep the file open across many
/// `append_*` calls and periodically flush the RIFF/data chunk sizes so that
/// a crash at any point leaves a *readable* WAV behind. Writing the header
/// ourselves makes that re-flush a few-byte seek+write.
///
/// Crash-safety guarantees, assuming the OS flushes our writes (which the
/// periodic `flush_headers` call enforces):
///   - File header always reflects a sample count ≤ the actual amount of
///     audio on disk. A reader playing back the file may stop a fraction of
///     a second early, but never reads past valid audio.
///   - After a crash, the data on disk between the last header flush and the
///     crash point is recoverable by re-deriving the header from the file's
///     length (see `recovery::repair_partial_wav_header`).
pub struct StreamingWavWriter {
    file: File,
    path: PathBuf,
    sample_rate: u32,
    /// Count of 16-bit samples successfully written to the data chunk. Drives
    /// both the header size fields and the `duration_seconds` trust signal
    /// the UI surfaces.
    samples_written: u64,
}

impl StreamingWavWriter {
    /// Create a new WAV file at `path` and write the 44-byte header with
    /// placeholder size fields. The header is immediately re-flushed via
    /// `flush_headers` so even a zero-byte recording leaves a valid file.
    pub fn create(path: &Path, sample_rate: u32) -> Result<Self, String> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| {
                format!("Failed to create streaming WAV parent dir {}: {}", parent.display(), e)
            })?;
        }
        let file = File::create(path)
            .map_err(|e| format!("Failed to create streaming WAV at {}: {}", path.display(), e))?;
        let mut writer = StreamingWavWriter {
            file,
            path: path.to_path_buf(),
            sample_rate,
            samples_written: 0,
        };
        writer.write_initial_header()?;
        writer.flush_headers()?;
        Ok(writer)
    }

    /// Total duration of audio on disk so far, in seconds. The
    /// reconciliation tick reads this to publish the "Saved through" trust
    /// signal to the UI.
    pub fn duration_seconds(&self) -> f64 {
        if self.sample_rate == 0 {
            return 0.0;
        }
        self.samples_written as f64 / self.sample_rate as f64
    }

    /// Append a slice of f32 samples to the file, converting to the same
    /// 16-bit signed PCM format `audio/writer.rs::write_wav_file` produces.
    /// The header is NOT updated here — call `flush_headers` periodically to
    /// commit the size fields so a crash leaves a readable file.
    pub fn append_f32_samples(&mut self, samples: &[f32]) -> Result<(), String> {
        if samples.is_empty() {
            return Ok(());
        }

        let mut bytes: Vec<u8> = Vec::with_capacity(samples.len() * BYTES_PER_SAMPLE as usize);
        let amplitude = i16::MAX as f32;
        for &sample in samples {
            let clamped = sample.clamp(-1.0, 1.0);
            let i16_sample = (clamped * amplitude) as i16;
            bytes.extend_from_slice(&i16_sample.to_le_bytes());
        }

        self.file
            .write_all(&bytes)
            .map_err(|e| format!("Failed to append samples to streaming WAV: {}", e))?;
        self.samples_written += samples.len() as u64;
        Ok(())
    }

    /// Re-write the RIFF and data chunk size fields based on `samples_written`,
    /// then flush the OS file buffer. Call this periodically (e.g. every few
    /// seconds) so the on-disk header is approximately current. A crash
    /// between flushes loses at most the bytes written since the last flush
    /// — but the file is still a valid WAV because the header tells a reader
    /// to stop at the previously-committed sample count.
    pub fn flush_headers(&mut self) -> Result<(), String> {
        let data_bytes = self.samples_written * BYTES_PER_SAMPLE as u64;
        let riff_size = (HEADER_SIZE_BYTES as u64) - 8 + data_bytes;

        self.file
            .seek(SeekFrom::Start(RIFF_CHUNK_SIZE_OFFSET))
            .map_err(|e| format!("Failed to seek to RIFF size: {}", e))?;
        self.file
            .write_all(&(riff_size as u32).to_le_bytes())
            .map_err(|e| format!("Failed to write RIFF size: {}", e))?;

        self.file
            .seek(SeekFrom::Start(DATA_CHUNK_SIZE_OFFSET))
            .map_err(|e| format!("Failed to seek to data size: {}", e))?;
        self.file
            .write_all(&(data_bytes as u32).to_le_bytes())
            .map_err(|e| format!("Failed to write data size: {}", e))?;

        // Seek back to the end so the next `append_f32_samples` extends the
        // file rather than overwriting from byte 44.
        self.file
            .seek(SeekFrom::End(0))
            .map_err(|e| format!("Failed to seek back to file end: {}", e))?;

        self.file
            .flush()
            .map_err(|e| format!("Failed to flush streaming WAV: {}", e))?;

        Ok(())
    }

    /// Finalize the writer: flush a final header pass and drop the file
    /// handle. Returns the path the audio lives at so the caller can rename
    /// it to a permanent location.
    pub fn finalize(mut self) -> Result<PathBuf, String> {
        self.flush_headers()?;
        let path = self.path.clone();
        // Explicitly drop the file so the OS releases the handle before the
        // caller tries to rename the file (Windows requires this).
        drop(self.file);
        Ok(path)
    }

    fn write_initial_header(&mut self) -> Result<(), String> {
        let byte_rate = self.sample_rate * NUM_CHANNELS as u32 * BYTES_PER_SAMPLE;
        let block_align = NUM_CHANNELS * (BITS_PER_SAMPLE / 8);

        let mut header: Vec<u8> = Vec::with_capacity(HEADER_SIZE_BYTES as usize);
        header.extend_from_slice(b"RIFF");
        header.extend_from_slice(&0u32.to_le_bytes()); // placeholder RIFF size
        header.extend_from_slice(b"WAVE");
        header.extend_from_slice(b"fmt ");
        header.extend_from_slice(&16u32.to_le_bytes()); // PCM fmt chunk size
        header.extend_from_slice(&1u16.to_le_bytes()); // PCM format tag
        header.extend_from_slice(&NUM_CHANNELS.to_le_bytes());
        header.extend_from_slice(&self.sample_rate.to_le_bytes());
        header.extend_from_slice(&byte_rate.to_le_bytes());
        header.extend_from_slice(&block_align.to_le_bytes());
        header.extend_from_slice(&BITS_PER_SAMPLE.to_le_bytes());
        header.extend_from_slice(b"data");
        header.extend_from_slice(&0u32.to_le_bytes()); // placeholder data size

        debug_assert_eq!(header.len() as u32, HEADER_SIZE_BYTES);

        self.file
            .write_all(&header)
            .map_err(|e| format!("Failed to write initial WAV header: {}", e))?;
        Ok(())
    }
}

/// Repair the header of a partially-written WAV file by inferring the data
/// length from the file size on disk. Used at startup to make orphan in-flight
/// WAVs readable when the previous app run crashed before `finalize`.
///
/// Strategy: trust the data chunk follows the 44-byte canonical header that
/// `StreamingWavWriter::create` writes; anything past that is sample data. We
/// reconcile the RIFF and data chunk sizes against the file's actual length
/// and re-flush. On a clean shutdown via `finalize` the header is already
/// correct and this is a no-op.
pub fn repair_partial_wav_header(path: &Path) -> Result<(), String> {
    let file_len = std::fs::metadata(path)
        .map_err(|e| format!("Failed to stat {} for header repair: {}", path.display(), e))?
        .len();

    if file_len < HEADER_SIZE_BYTES as u64 {
        return Err(format!(
            "WAV at {} is shorter than a 44-byte header ({} bytes); cannot repair",
            path.display(),
            file_len
        ));
    }

    let data_bytes = file_len - HEADER_SIZE_BYTES as u64;
    let riff_size = file_len - 8;

    let mut file = OpenOptions::new()
        .write(true)
        .open(path)
        .map_err(|e| format!("Failed to open {} for header repair: {}", path.display(), e))?;

    file.seek(SeekFrom::Start(RIFF_CHUNK_SIZE_OFFSET))
        .map_err(|e| format!("Failed to seek to RIFF size during repair: {}", e))?;
    file.write_all(&(riff_size as u32).to_le_bytes())
        .map_err(|e| format!("Failed to write RIFF size during repair: {}", e))?;

    file.seek(SeekFrom::Start(DATA_CHUNK_SIZE_OFFSET))
        .map_err(|e| format!("Failed to seek to data size during repair: {}", e))?;
    file.write_all(&(data_bytes as u32).to_le_bytes())
        .map_err(|e| format!("Failed to write data size during repair: {}", e))?;

    file.flush()
        .map_err(|e| format!("Failed to flush header repair on {}: {}", path.display(), e))?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::recording::audio::writer::read_wav_duration_seconds;

    fn temp_path(name: &str) -> PathBuf {
        let mut p = std::env::temp_dir();
        p.push(format!(
            "thoughtcast_streaming_writer_test_{}_{}_{}.wav",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or(0),
            name,
        ));
        p
    }

    #[test]
    fn empty_writer_produces_a_valid_zero_length_wav() {
        let path = temp_path("empty");
        let writer = StreamingWavWriter::create(&path, 48_000).expect("create");
        writer.finalize().expect("finalize");

        let duration = read_wav_duration_seconds(&path).expect("read duration");
        assert_eq!(duration, 0.0);

        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn appended_samples_round_trip_through_hound() {
        let path = temp_path("appended");
        let mut writer = StreamingWavWriter::create(&path, 48_000).expect("create");
        // 1 second of zero samples at 48 kHz.
        let samples = vec![0.0f32; 48_000];
        writer.append_f32_samples(&samples).expect("append");
        writer.finalize().expect("finalize");

        let duration = read_wav_duration_seconds(&path).expect("read duration");
        assert!((duration - 1.0).abs() < 0.001, "expected ~1s, got {}", duration);

        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn flush_headers_makes_a_pre_finalize_file_readable() {
        // Simulate "crash before finalize": create + append + flush, but
        // never call finalize. Re-open with hound and confirm the duration
        // matches what we wrote.
        let path = temp_path("preflush");
        let mut writer = StreamingWavWriter::create(&path, 48_000).expect("create");
        writer.append_f32_samples(&vec![0.0f32; 24_000]).expect("append"); // 0.5 s
        writer.flush_headers().expect("flush");
        // Drop without finalize to simulate an abrupt exit.
        drop(writer);

        let duration = read_wav_duration_seconds(&path).expect("read duration");
        assert!((duration - 0.5).abs() < 0.01, "expected ~0.5s, got {}", duration);

        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn repair_partial_wav_header_recovers_unflushed_tail() {
        // Simulate a worst-case crash: data appended after the last
        // flush_headers, so the on-disk header underestimates the data. The
        // recovery routine should re-derive sizes from file length.
        let path = temp_path("repair");
        let mut writer = StreamingWavWriter::create(&path, 48_000).expect("create");
        writer.append_f32_samples(&vec![0.0f32; 48_000]).expect("first append"); // 1.0 s
        writer.flush_headers().expect("flush after first append");
        writer.append_f32_samples(&vec![0.0f32; 24_000]).expect("second append"); // +0.5 s, NOT flushed
        // Drop the writer mid-recording without flushing the new tail.
        drop(writer);

        // Pre-repair, the header reports only 1.0 s.
        let pre = read_wav_duration_seconds(&path).expect("read pre-repair");
        assert!((pre - 1.0).abs() < 0.01, "pre-repair expected 1.0s, got {}", pre);

        repair_partial_wav_header(&path).expect("repair");

        // Post-repair, the header reflects the full 1.5 s on disk.
        let post = read_wav_duration_seconds(&path).expect("read post-repair");
        assert!((post - 1.5).abs() < 0.01, "post-repair expected 1.5s, got {}", post);

        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn duration_seconds_advances_with_appends() {
        let path = temp_path("duration");
        let mut writer = StreamingWavWriter::create(&path, 16_000).expect("create");
        assert_eq!(writer.duration_seconds(), 0.0);
        writer.append_f32_samples(&vec![0.0f32; 16_000]).expect("append 1s");
        assert!((writer.duration_seconds() - 1.0).abs() < 1e-9);
        writer.append_f32_samples(&vec![0.0f32; 8_000]).expect("append +0.5s");
        assert!((writer.duration_seconds() - 1.5).abs() < 1e-9);

        let _ = std::fs::remove_file(&path);
    }
}
