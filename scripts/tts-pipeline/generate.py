#!/usr/bin/env python3
"""
Google Cloud TTS WaveNet - Bible audio generation pipeline.

Reads Bible text from manna.db, generates chapter-level MP3 audio
with per-verse timestamps using SSML <mark> tags.

Voices:
  - ko-KR-Wavenet-D (male, default)
  - ko-KR-Wavenet-B (female)

Usage:
  python generate.py                    # Generate all chapters (both voices)
  python generate.py --voice D          # Male voice only
  python generate.py --voice B          # Female voice only
  python generate.py --book 1           # Genesis only
  python generate.py --book 40 --chapter 1  # Matthew 1 only
  python generate.py --test             # Genesis 1 only (quick test)
"""

import argparse
import json
import sqlite3
import time
from io import BytesIO
from pathlib import Path

from google.cloud import texttospeech_v1beta1 as texttospeech
from google.oauth2 import service_account
from pydub import AudioSegment

# --- Config ---
SCRIPT_DIR = Path(__file__).parent
PROJECT_DIR = SCRIPT_DIR.parent.parent
DB_PATH = PROJECT_DIR / "assets" / "manna.db"
OUTPUT_DIR = SCRIPT_DIR / "output"
PROGRESS_FILE = SCRIPT_DIR / "progress.json"
SERVICE_ACCOUNT_KEY = SCRIPT_DIR / "service-account.json"

VOICES = {
    "B": "ko-KR-Wavenet-B",  # female 1
    "C": "ko-KR-Wavenet-C",  # male 2
    "D": "ko-KR-Wavenet-D",  # male 1 (default)
}

VOICE_DIRS = {
    "B": "wavenet-b",
    "C": "wavenet-c",
    "D": "wavenet-d",
}

# SSML byte limit per request (Google TTS limit)
SSML_BYTE_LIMIT = 4800  # leave 200 byte margin from 5000

# Pause between verses
VERSE_BREAK_MS = 600


def create_tts_client() -> texttospeech.TextToSpeechClient:
    """Create TTS client with service account credentials."""
    credentials = service_account.Credentials.from_service_account_file(
        str(SERVICE_ACCOUNT_KEY),
        scopes=["https://www.googleapis.com/auth/cloud-platform"],
    )
    return texttospeech.TextToSpeechClient(credentials=credentials)  # v1beta1 for timepointing


def load_progress() -> dict:
    if PROGRESS_FILE.exists():
        return json.loads(PROGRESS_FILE.read_text())
    return {"completed": {}, "total_chars": 0}


def save_progress(progress: dict):
    PROGRESS_FILE.write_text(json.dumps(progress, indent=2, ensure_ascii=False))


def get_chapters(db_path: Path, book_id: int | None = None, chapter: int | None = None):
    """Get list of (book_id, chapter) pairs from DB."""
    conn = sqlite3.connect(str(db_path))
    query = "SELECT DISTINCT book_id, chapter FROM bible"
    params = []
    conditions = []
    if book_id is not None:
        conditions.append("book_id = ?")
        params.append(book_id)
    if chapter is not None:
        conditions.append("chapter = ?")
        params.append(chapter)
    if conditions:
        query += " WHERE " + " AND ".join(conditions)
    query += " ORDER BY book_id, chapter"
    rows = conn.execute(query, params).fetchall()
    conn.close()
    return rows


def get_verses(db_path: Path, book_id: int, chapter: int) -> list[dict]:
    """Get verses for a specific chapter."""
    conn = sqlite3.connect(str(db_path))
    rows = conn.execute(
        "SELECT verse, text FROM bible WHERE book_id = ? AND chapter = ? ORDER BY verse",
        (book_id, chapter),
    ).fetchall()
    conn.close()
    return [{"verse": r[0], "text": r[1].strip()} for r in rows]


def build_ssml_segments(verses: list[dict]) -> list[list[dict]]:
    """
    Split verses into segments that fit within SSML byte limit.
    Returns list of segments, where each segment is a list of verses.
    """
    segments = []
    current_segment = []
    current_ssml_size = len("<speak></speak>".encode("utf-8"))

    for v in verses:
        verse_ssml = f'<mark name="v{v["verse"]}"/>{v["text"]}<break time="{VERSE_BREAK_MS}ms"/>'
        verse_bytes = len(verse_ssml.encode("utf-8"))

        if current_ssml_size + verse_bytes > SSML_BYTE_LIMIT and current_segment:
            segments.append(current_segment)
            current_segment = []
            current_ssml_size = len("<speak></speak>".encode("utf-8"))

        current_segment.append(v)
        current_ssml_size += verse_bytes

    if current_segment:
        segments.append(current_segment)

    return segments


def build_ssml(verses: list[dict]) -> str:
    """Build SSML string from a list of verses."""
    parts = ["<speak>"]
    for v in verses:
        parts.append(f'<mark name="v{v["verse"]}"/>{v["text"]}')
        parts.append(f'<break time="{VERSE_BREAK_MS}ms"/>')
    parts.append("</speak>")
    return "".join(parts)


def synthesize(client: texttospeech.TextToSpeechClient, ssml: str, voice_name: str) -> dict:
    """Call Google Cloud TTS API. Returns {audio_bytes, timepoints}."""
    request = texttospeech.SynthesizeSpeechRequest(
        input=texttospeech.SynthesisInput(ssml=ssml),
        voice=texttospeech.VoiceSelectionParams(
            language_code="ko-KR",
            name=voice_name,
        ),
        audio_config=texttospeech.AudioConfig(
            audio_encoding=texttospeech.AudioEncoding.MP3,
            sample_rate_hertz=24000,
            speaking_rate=1.0,
        ),
        enable_time_pointing=[
            texttospeech.SynthesizeSpeechRequest.TimepointType.SSML_MARK,
        ],
    )
    response = client.synthesize_speech(request=request)

    timepoints = [
        {"markName": tp.mark_name, "timeSeconds": tp.time_seconds}
        for tp in response.timepoints
    ]

    return {"audio": response.audio_content, "timepoints": timepoints}


def generate_chapter(
    client: texttospeech.TextToSpeechClient,
    book_id: int,
    chapter: int,
    voice_key: str,
    verses: list[dict],
) -> dict:
    """
    Generate audio for one chapter. Handles SSML splitting for long chapters.
    Returns {audio_bytes, timestamps_json, char_count}.
    """
    voice_name = VOICES[voice_key]
    segments = build_ssml_segments(verses)
    char_count = sum(len(v["text"]) for v in verses)

    all_audio = AudioSegment.empty()
    all_timepoints = []  # (verse_num, start_seconds)
    segment_offset = 0.0  # accumulated duration in seconds

    for seg_idx, seg_verses in enumerate(segments):
        ssml = build_ssml(seg_verses)

        result = synthesize(client, ssml, voice_name)

        # Parse audio segment
        seg_audio = AudioSegment.from_mp3(BytesIO(result["audio"]))
        seg_duration = seg_audio.duration_seconds

        # Adjust timepoints with offset
        for tp in result["timepoints"]:
            mark_name = tp.get("markName", "")
            time_sec = tp.get("timeSeconds", 0.0)
            if mark_name.startswith("v"):
                verse_num = int(mark_name[1:])
                all_timepoints.append((verse_num, segment_offset + time_sec))

        # Concatenate audio
        all_audio += seg_audio
        segment_offset += seg_duration

        # Rate limit: small delay between segments
        if seg_idx < len(segments) - 1:
            time.sleep(0.1)

    # Build verse timestamps with start and end
    total_duration = all_audio.duration_seconds
    verse_timestamps = []
    for i, (verse_num, start_sec) in enumerate(all_timepoints):
        if i + 1 < len(all_timepoints):
            # End = next verse start minus the break gap
            end_sec = all_timepoints[i + 1][1] - (VERSE_BREAK_MS / 1000.0)
            end_sec = max(end_sec, start_sec + 0.1)  # minimum duration
        else:
            end_sec = total_duration
        verse_timestamps.append({
            "verse": verse_num,
            "startSec": round(start_sec, 3),
            "endSec": round(end_sec, 3),
        })

    # Export MP3
    mp3_buffer = BytesIO()
    all_audio.export(mp3_buffer, format="mp3", bitrate="48k")
    mp3_bytes = mp3_buffer.getvalue()

    # Build JSON metadata
    timestamps_json = {
        "bookId": book_id,
        "chapter": chapter,
        "voice": voice_name,
        "durationSec": round(total_duration, 3),
        "verses": verse_timestamps,
    }

    return {
        "audio": mp3_bytes,
        "timestamps": timestamps_json,
        "char_count": char_count,
    }


def save_chapter(book_id: int, chapter: int, voice_key: str, result: dict):
    """Save MP3 and JSON files."""
    voice_dir = VOICE_DIRS[voice_key]
    out_dir = OUTPUT_DIR / voice_dir / f"{book_id:02d}"
    out_dir.mkdir(parents=True, exist_ok=True)

    mp3_path = out_dir / f"{chapter:03d}.mp3"
    json_path = out_dir / f"{chapter:03d}.json"

    mp3_path.write_bytes(result["audio"])
    json_path.write_text(
        json.dumps(result["timestamps"], indent=2, ensure_ascii=False),
        encoding="utf-8",
    )

    return mp3_path, json_path


def main():
    parser = argparse.ArgumentParser(description="Generate Bible TTS audio")
    parser.add_argument("--voice", choices=["B", "C", "D", "all"], default="all",
                        help="Voice: B=female1, C=male2, D=male1(default), all=all three")
    parser.add_argument("--book", type=int, help="Generate specific book only")
    parser.add_argument("--chapter", type=int, help="Generate specific chapter only")
    parser.add_argument("--test", action="store_true", help="Test mode: Genesis 1 only")
    parser.add_argument("--resume", action="store_true", default=True,
                        help="Skip already-completed chapters (default: true)")
    args = parser.parse_args()

    client = create_tts_client()
    progress = load_progress()

    # Determine voices to generate
    if args.voice == "all":
        voice_keys = ["D", "B", "C"]
    else:
        voice_keys = [args.voice]

    # Determine chapters
    if args.test:
        chapters = [(1, 1)]
    else:
        chapters = get_chapters(DB_PATH, args.book, args.chapter)

    total = len(chapters) * len(voice_keys)
    print(f"Generating {len(chapters)} chapters x {len(voice_keys)} voices = {total} files")
    print(f"Cumulative characters so far: {progress['total_chars']:,}")
    print()

    done_count = 0
    error_count = 0

    for voice_key in voice_keys:
        voice_name = VOICES[voice_key]
        voice_dir = VOICE_DIRS[voice_key]
        print(f"=== Voice: {voice_name} ({voice_dir}) ===")

        for book_id, chap in chapters:
            key = f"{voice_dir}/{book_id:02d}/{chap:03d}"

            # Skip if already done (progress.json OR files exist on disk)
            if args.resume:
                if key in progress.get("completed", {}):
                    done_count += 1
                    continue
                mp3_file = OUTPUT_DIR / voice_dir / f"{book_id:02d}" / f"{chap:03d}.mp3"
                json_file = OUTPUT_DIR / voice_dir / f"{book_id:02d}" / f"{chap:03d}.json"
                if mp3_file.exists() and json_file.exists():
                    done_count += 1
                    continue

            verses = get_verses(DB_PATH, book_id, chap)
            if not verses:
                print(f"  [SKIP] book={book_id} chapter={chap} (no verses)")
                continue

            char_count = sum(len(v["text"]) for v in verses)
            print(f"  [{done_count + 1}/{total}] book={book_id:02d} ch={chap:03d} "
                  f"verses={len(verses)} chars={char_count:,} ... ", end="", flush=True)

            try:
                result = generate_chapter(client, book_id, chap, voice_key, verses)
                mp3_path, json_path = save_chapter(book_id, chap, voice_key, result)

                # Update progress
                progress["completed"][key] = {
                    "chars": result["char_count"],
                    "duration_sec": result["timestamps"]["durationSec"],
                    "verses": len(verses),
                }
                progress["total_chars"] += result["char_count"]
                save_progress(progress)

                mp3_size = len(result["audio"]) / 1024
                print(f"OK ({mp3_size:.0f}KB, {result['timestamps']['durationSec']:.1f}s)")
                done_count += 1

            except Exception as e:
                print(f"ERROR: {e}")
                error_count += 1

            # Rate limit between chapters
            time.sleep(0.2)

    print()
    print(f"Done: {done_count}, Errors: {error_count}")
    print(f"Total characters used: {progress['total_chars']:,} / 4,000,000 free")


if __name__ == "__main__":
    main()
