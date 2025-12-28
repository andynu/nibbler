#!/usr/bin/env python3
"""
TTS Generation Script for Nibbler RSS Reader

Generates audio from text using Piper TTS and extracts word-level timestamps
using ForceAlign (wav2vec2 forced alignment).

Usage:
    python lib/tts/generate.py --text "Text to speak" --output /path/to/output
    python lib/tts/generate.py --input /path/to/text.txt --output /path/to/output

Output:
    - {output}.wav - Audio file
    - {output}.json - Word timestamps

Example:
    python lib/tts/generate.py --text "Hello world" --output /tmp/hello
    # Creates /tmp/hello.wav and /tmp/hello.json
"""

import argparse
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

# Add the project root to path for imports
PROJECT_ROOT = Path(__file__).parent.parent.parent
MODELS_DIR = PROJECT_ROOT / "lib" / "tts" / "models"
VENV_BIN = PROJECT_ROOT / ".venv" / "bin"

# Piper model configuration
DEFAULT_MODEL = "en_US-lessac-medium"
MODEL_PATH = MODELS_DIR / f"{DEFAULT_MODEL}.onnx"

# Padding to prevent word clipping (in seconds)
SILENCE_PADDING_START = 0.15  # 150ms at start
SILENCE_PADDING_END = 0.25    # 250ms at end


def add_silence_padding(input_path: Path, output_path: Path, start_pad: float, end_pad: float) -> Path:
    """Add silence padding to audio file using ffmpeg.

    Args:
        input_path: Path to input WAV file
        output_path: Path for output WAV file
        start_pad: Seconds of silence to add at start
        end_pad: Seconds of silence to add at end

    Returns:
        Path to the padded WAV file
    """
    # Use ffmpeg to add silence padding using adelay and apad filters
    # adelay adds silence at the start, apad adds silence at the end
    # Format: adelay=START_MS|START_MS (stereo), apad=pad_dur=END_S
    start_ms = int(start_pad * 1000)

    ffmpeg_cmd = [
        "ffmpeg",
        "-y",  # Overwrite output
        "-i", str(input_path),
        "-af", f"adelay={start_ms}|{start_ms},apad=pad_dur={end_pad}",
        "-ar", "22050",  # Keep sample rate consistent with Piper output
        str(output_path),
    ]

    result = subprocess.run(
        ffmpeg_cmd,
        capture_output=True,
    )

    if result.returncode != 0:
        raise RuntimeError(f"FFmpeg padding failed: {result.stderr.decode()}")

    return output_path


def extract_timestamps(audio_path: Path, transcript: str) -> list[dict]:
    """Extract word-level timestamps using ForceAlign.

    Args:
        audio_path: Path to WAV file
        transcript: Original text transcript

    Returns:
        List of word timing dicts with 'word', 'start', 'end' keys
    """
    # Import ForceAlign here to avoid import overhead when not needed
    from forcealign import ForceAlign

    aligner = ForceAlign(audio_file=str(audio_path), transcript=transcript)
    words = aligner.inference()

    timestamps = []
    for word in words:
        timestamps.append({
            "word": word.word,
            "start": round(word.time_start, 3),
            "end": round(word.time_end, 3),
        })

    return timestamps


def process_text(text: str, output_path: Path) -> dict:
    """Generate audio and extract timestamps for text.

    Args:
        text: Text to process
        output_path: Base path for output files (without extension)

    Returns:
        Dict with 'audio_path', 'timestamps_path', and 'timestamps' keys
    """
    # Clean and normalize text
    text = text.strip()
    if not text:
        raise ValueError("Empty text provided")

    wav_path = output_path.with_suffix(".wav")

    # Generate raw audio to temp file, extract timestamps, then add padding
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as temp_file:
        raw_audio_path = Path(temp_file.name)

    try:
        # Generate raw audio using Piper
        piper_cmd = [
            str(VENV_BIN / "piper"),
            "--model", str(MODEL_PATH),
            "--output_file", str(raw_audio_path),
        ]

        result = subprocess.run(
            piper_cmd,
            input=text.encode("utf-8"),
            capture_output=True,
        )

        if result.returncode != 0:
            raise RuntimeError(f"Piper TTS failed: {result.stderr.decode()}")

        # Extract timestamps from raw (unpadded) audio
        timestamps = extract_timestamps(raw_audio_path, text)

        # Adjust timestamps to account for start padding
        for ts in timestamps:
            ts["start"] = round(ts["start"] + SILENCE_PADDING_START, 3)
            ts["end"] = round(ts["end"] + SILENCE_PADDING_START, 3)

        # Add silence padding to create final audio
        add_silence_padding(raw_audio_path, wav_path, SILENCE_PADDING_START, SILENCE_PADDING_END)

        # Calculate total duration including padding
        total_duration = timestamps[-1]["end"] + SILENCE_PADDING_END if timestamps else 0

    finally:
        # Clean up temp file
        if raw_audio_path.exists():
            raw_audio_path.unlink()

    # Save timestamps to JSON
    json_path = output_path.with_suffix(".json")
    with open(json_path, "w") as f:
        json.dump({
            "text": text,
            "timestamps": timestamps,
            "duration": total_duration,
        }, f, indent=2)

    return {
        "audio_path": str(wav_path),
        "timestamps_path": str(json_path),
        "timestamps": timestamps,
    }


def main():
    parser = argparse.ArgumentParser(
        description="Generate TTS audio with word timestamps"
    )
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--text", help="Text to convert to speech")
    group.add_argument("--input", type=Path, help="Input file containing text")

    parser.add_argument(
        "--output", "-o",
        type=Path,
        required=True,
        help="Output path (without extension). Creates .wav and .json files",
    )
    parser.add_argument(
        "--json-only",
        action="store_true",
        help="Only output JSON result to stdout (for programmatic use)",
    )

    args = parser.parse_args()

    # Get text from argument or file
    if args.text:
        text = args.text
    else:
        with open(args.input) as f:
            text = f.read()

    try:
        result = process_text(text, args.output)

        if args.json_only:
            print(json.dumps(result))
        else:
            print(f"Audio: {result['audio_path']}")
            print(f"Timestamps: {result['timestamps_path']}")
            print(f"Duration: {result['timestamps'][-1]['end']:.2f}s")
            print(f"Words: {len(result['timestamps'])}")

    except Exception as e:
        if args.json_only:
            print(json.dumps({"error": str(e)}))
            sys.exit(1)
        else:
            print(f"Error: {e}", file=sys.stderr)
            sys.exit(1)


if __name__ == "__main__":
    main()
