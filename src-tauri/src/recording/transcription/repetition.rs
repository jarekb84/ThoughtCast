//! Detects and removes Whisper's repetition loops: the decoder gets stuck and
//! emits the same phrase over and over ("I don't know if I'm not going to be
//! able to do that." twelve times), usually while the real speech under it is
//! lost. Pure functions over text; the engine decides what to do about it.

/// Longest repeated phrase, in words, the detector looks for.
const MAX_PERIOD: usize = 15;

/// A run only counts as a loop once the repeated copies (beyond the first)
/// cover at least this many words. Keeps natural repetition ("very very",
/// "you know, you know") out of it.
const MIN_LOOPED_WORDS: usize = 12;

/// Number of words that sit inside a loop, beyond the first copy of the
/// repeated phrase. Zero means no loop.
pub fn looped_word_count(text: &str) -> usize {
    let tokens = tokenize(text);
    loop_flags(&tokens).iter().filter(|&&f| f).count()
}

/// Remove the repeated copies of every loop, keeping the first. Line breaks
/// and punctuation of the surviving text are preserved.
pub fn collapse_loops(text: &str) -> String {
    let tokens = tokenize(text);
    let flags = loop_flags(&tokens);
    if !flags.iter().any(|&f| f) {
        return text.to_string();
    }

    let mut out = String::with_capacity(text.len());
    let mut cursor = 0;
    for (token, flagged) in tokens.iter().zip(flags) {
        if flagged {
            // Drop the token and the whitespace in front of it.
            out.push_str(&text[cursor..token.leading_ws_start]);
            cursor = token.end;
        }
    }
    out.push_str(&text[cursor..]);
    tidy_blank_lines(&out)
}

struct Token {
    /// Byte offset where the whitespace preceding this token starts.
    leading_ws_start: usize,
    end: usize,
    /// Lowercased, punctuation-stripped form used for comparison.
    norm: String,
}

fn tokenize(text: &str) -> Vec<Token> {
    let mut tokens = Vec::new();
    let mut ws_start = 0;
    let mut start: Option<usize> = None;
    for (i, c) in text.char_indices() {
        if c.is_whitespace() {
            if let Some(s) = start.take() {
                tokens.push(make_token(text, ws_start, s, i));
                ws_start = i;
            }
        } else if start.is_none() {
            start = Some(i);
        }
    }
    if let Some(s) = start {
        tokens.push(make_token(text, ws_start, s, text.len()));
    }
    // Tokens that are pure punctuation ("—", "...") carry no words.
    tokens.retain(|t| !t.norm.is_empty());
    tokens
}

fn make_token(text: &str, ws_start: usize, start: usize, end: usize) -> Token {
    let norm = text[start..end]
        .chars()
        .filter(|c| c.is_alphanumeric() || *c == '\'')
        .flat_map(char::to_lowercase)
        .collect();
    Token {
        leading_ws_start: ws_start,
        end,
        norm,
    }
}

/// For each token, whether it is a repeated copy inside a loop.
fn loop_flags(tokens: &[Token]) -> Vec<bool> {
    let mut flags = vec![false; tokens.len()];
    for period in 1..=MAX_PERIOD {
        let mut i = period;
        while i < tokens.len() {
            if tokens[i].norm != tokens[i - period].norm {
                i += 1;
                continue;
            }
            let mut j = i;
            while j < tokens.len() && tokens[j].norm == tokens[j - period].norm {
                j += 1;
            }
            if j - i >= MIN_LOOPED_WORDS.max(2 * period) {
                // Flag whole copies only, so the kept text ends on a phrase
                // boundary rather than mid-phrase.
                let whole = (j - i) / period * period;
                flags[i..i + whole].iter_mut().for_each(|f| *f = true);
            }
            i = j;
        }
    }
    flags
}

/// Collapse the empty lines left behind where whole repeated lines were removed.
fn tidy_blank_lines(text: &str) -> String {
    let mut out: Vec<&str> = Vec::new();
    let mut blank_run = 0;
    for line in text.lines() {
        if line.trim().is_empty() {
            blank_run += 1;
            if blank_run > 1 {
                continue;
            }
        } else {
            blank_run = 0;
        }
        out.push(line.trim_end());
    }
    out.join("\n").trim().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    const LOOP_LINE: &str = "I don't know if I'm not going to be able to do that.";

    fn looped_transcript(repeats: usize) -> String {
        let mut lines = vec!["I don't find it as fruitful to sit and think.".to_string()];
        lines.extend(std::iter::repeat(LOOP_LINE.to_string()).take(repeats));
        lines.push("I've used AI tooling to build three apps.".to_string());
        lines.join("\n")
    }

    #[test]
    fn test_clean_text_has_no_loop() {
        let text = "So we built this app a year ago. I use it for work.\nI use it for personal stuff too.";
        assert_eq!(looped_word_count(text), 0);
        assert_eq!(collapse_loops(text), text);
    }

    #[test]
    fn test_natural_repetition_is_not_a_loop() {
        let text = "it was very very very good, you know, you know, and I I think so. Yeah yeah.";
        assert_eq!(looped_word_count(text), 0);
    }

    #[test]
    fn test_identical_repeated_lines_are_a_loop() {
        let text = looped_transcript(12);
        // 13 words per line, 11 extra copies.
        assert_eq!(looped_word_count(&text), 11 * 13);
    }

    #[test]
    fn test_repeated_phrase_within_lines_is_a_loop() {
        let text = format!("something like that and {} fine with it", "I'm just like ".repeat(9));
        assert!(looped_word_count(&text) >= 12, "got {}", looped_word_count(&text));
    }

    #[test]
    fn test_collapse_keeps_one_copy_and_surrounding_text() {
        let text = looped_transcript(12);
        let collapsed = collapse_loops(&text);
        assert_eq!(
            collapsed,
            format!(
                "I don't find it as fruitful to sit and think.\n{}\nI've used AI tooling to build three apps.",
                LOOP_LINE
            )
        );
        assert_eq!(looped_word_count(&collapsed), 0);
    }

    #[test]
    fn test_collapse_phrase_loop_inside_a_line() {
        let text = format!("and {}fine with it", "I'm just like ".repeat(9));
        assert_eq!(collapse_loops(&text), "and I'm just like fine with it");
    }

    #[test]
    fn test_short_repeat_below_threshold_is_kept() {
        let text = looped_transcript(1).replace(LOOP_LINE, &format!("{} {}", LOOP_LINE, LOOP_LINE));
        // One extra copy of a 13-word line is under 2 x period (26 words).
        assert_eq!(looped_word_count(&text), 0);
    }

    #[test]
    fn test_handles_multibyte_text() {
        let text = format!("café — {}", "naïve résumé ".repeat(10));
        assert!(looped_word_count(&text) > 0);
        assert_eq!(collapse_loops(&text), "café — naïve résumé");
    }
}
