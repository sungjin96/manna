#!/usr/bin/env python3
"""
Upload generated TTS audio files to Cloudflare R2.

Reads R2 credentials from ../../.env.local:
  R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY

Usage:
  python upload_r2.py              # Upload all generated files
  python upload_r2.py --voice D    # Upload male voice only
  python upload_r2.py --dry-run    # Show what would be uploaded
"""

import argparse
import os
from pathlib import Path

import boto3

SCRIPT_DIR = Path(__file__).parent
PROJECT_DIR = SCRIPT_DIR.parent.parent
OUTPUT_DIR = SCRIPT_DIR / "output"
BUCKET = "manna-tts"
VERSION_PREFIX = "v1"

VOICE_DIRS = {
    "B": "wavenet-b",
    "C": "wavenet-c",
    "D": "wavenet-d",
}

# Also handle legacy "male"/"female" dir names from earlier runs
LEGACY_MAP = {
    "male": "wavenet-d",
    "female": "wavenet-b",
}

CONTENT_TYPES = {
    ".mp3": "audio/mpeg",
    ".json": "application/json",
}


def load_env() -> dict:
    env = {}
    env_path = PROJECT_DIR / ".env.local"
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            line = line.strip()
            if "=" in line and not line.startswith("#"):
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip()
    return env


def create_client(env: dict):
    return boto3.client(
        "s3",
        endpoint_url=env["R2_ENDPOINT"],
        aws_access_key_id=env["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=env["R2_SECRET_ACCESS_KEY"],
        region_name="auto",
    )


def get_files_to_upload(voice_filter: str | None = None) -> list[tuple[Path, str]]:
    """Returns list of (local_path, r2_key) pairs."""
    files = []

    if not OUTPUT_DIR.exists():
        return files

    for voice_dir in OUTPUT_DIR.iterdir():
        if not voice_dir.is_dir():
            continue

        dir_name = voice_dir.name
        # Map legacy dir names to new names
        r2_voice_dir = LEGACY_MAP.get(dir_name, dir_name)

        # Apply voice filter
        if voice_filter:
            target_dir = VOICE_DIRS.get(voice_filter)
            if r2_voice_dir != target_dir:
                continue

        for book_dir in sorted(voice_dir.iterdir()):
            if not book_dir.is_dir():
                continue
            for f in sorted(book_dir.iterdir()):
                if f.suffix in CONTENT_TYPES:
                    r2_key = f"{VERSION_PREFIX}/{r2_voice_dir}/{book_dir.name}/{f.name}"
                    files.append((f, r2_key))

    return files


def main():
    parser = argparse.ArgumentParser(description="Upload TTS audio to R2")
    parser.add_argument("--voice", choices=["B", "C", "D"], help="Upload specific voice only")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be uploaded")
    args = parser.parse_args()

    env = load_env()
    for key in ["R2_ENDPOINT", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"]:
        if key not in env:
            print(f"Error: {key} not found in .env.local")
            return

    files = get_files_to_upload(args.voice)
    print(f"Files to upload: {len(files)}")

    if args.dry_run:
        for local, key in files[:20]:
            print(f"  {key}  ({local.stat().st_size / 1024:.0f}KB)")
        if len(files) > 20:
            print(f"  ... and {len(files) - 20} more")
        return

    client = create_client(env)
    uploaded = 0
    errors = 0

    for local, key in files:
        content_type = CONTENT_TYPES.get(local.suffix, "application/octet-stream")
        try:
            client.upload_file(
                str(local), BUCKET, key,
                ExtraArgs={
                    "ContentType": content_type,
                    "CacheControl": "public, max-age=31536000, immutable",
                },
            )
            uploaded += 1
            if uploaded % 50 == 0 or uploaded == len(files):
                print(f"  [{uploaded}/{len(files)}] uploaded")
        except Exception as e:
            print(f"  ERROR {key}: {e}")
            errors += 1

    print(f"\nDone: {uploaded} uploaded, {errors} errors")


if __name__ == "__main__":
    main()
