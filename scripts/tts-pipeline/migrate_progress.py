#!/usr/bin/env python3
"""
Migrate progress.json keys from legacy dir names to new names.
Also renames output directories.

male -> wavenet-d
female -> wavenet-b

Run this ONCE after the legacy background process completes.
"""

import json
import shutil
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
OUTPUT_DIR = SCRIPT_DIR / "output"
PROGRESS_FILE = SCRIPT_DIR / "progress.json"

RENAMES = {
    "male": "wavenet-d",
    "female": "wavenet-b",
}


def main():
    # 1. Rename output directories
    for old_name, new_name in RENAMES.items():
        old_dir = OUTPUT_DIR / old_name
        new_dir = OUTPUT_DIR / new_name
        if old_dir.exists() and not new_dir.exists():
            old_dir.rename(new_dir)
            print(f"Renamed: {old_name}/ -> {new_name}/")
        elif old_dir.exists() and new_dir.exists():
            print(f"WARNING: Both {old_name}/ and {new_name}/ exist. Skipping rename.")
        else:
            print(f"Skip: {old_name}/ not found")

    # 2. Migrate progress.json keys
    if not PROGRESS_FILE.exists():
        print("No progress.json found")
        return

    progress = json.loads(PROGRESS_FILE.read_text())
    completed = progress.get("completed", {})
    new_completed = {}
    migrated = 0

    for key, value in completed.items():
        new_key = key
        for old_name, new_name in RENAMES.items():
            if key.startswith(f"{old_name}/"):
                new_key = key.replace(f"{old_name}/", f"{new_name}/", 1)
                migrated += 1
                break
        new_completed[new_key] = value

    progress["completed"] = new_completed
    PROGRESS_FILE.write_text(json.dumps(progress, indent=2, ensure_ascii=False))
    print(f"Migrated {migrated} keys in progress.json")
    print(f"Total completed: {len(new_completed)}")


if __name__ == "__main__":
    main()
