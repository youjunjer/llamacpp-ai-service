from __future__ import annotations

import argparse
from pathlib import Path


MODELS = {
    "e4b": {
        "repo_id": "google/gemma-4-E4B-it",
        "target_dir": "models/hf/gemma-4-E4B-it",
        "allow_patterns": [
            "README.md",
            "chat_template.jinja",
            "config.json",
            "generation_config.json",
            "model.safetensors",
            "processor_config.json",
            "tokenizer.json",
            "tokenizer_config.json",
        ],
    },
    "26b": {
        "repo_id": "google/gemma-4-26B-A4B-it",
        "target_dir": "models/hf/gemma-4-26B-A4B-it",
        "allow_patterns": [
            "README.md",
            "chat_template.jinja",
            "config.json",
            "generation_config.json",
            "model-00001-of-00002.safetensors",
            "model-00002-of-00002.safetensors",
            "model.safetensors.index.json",
            "processor_config.json",
            "tokenizer.json",
            "tokenizer_config.json",
        ],
    },
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Download Gemma model assets for the custom multimodal app."
    )
    parser.add_argument(
        "models",
        nargs="*",
        default=["e4b", "26b"],
        help="Model groups to download. Defaults to e4b and 26b.",
    )
    parser.add_argument(
        "--root",
        type=Path,
        default=Path(__file__).resolve().parents[1],
        help="Project root. Defaults to this script's parent project.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print the plan without downloading files.",
    )
    args = parser.parse_args()
    invalid = [model for model in args.models if model not in MODELS]
    if invalid:
        parser.error(
            f"invalid model key(s): {', '.join(invalid)}; choose from {', '.join(sorted(MODELS))}"
        )
    return args


def main() -> int:
    args = parse_args()

    try:
        from huggingface_hub import snapshot_download
    except ImportError as exc:  # pragma: no cover - runtime setup path
        raise SystemExit(
            "huggingface_hub is required. Install it with: "
            "python -m pip install -U huggingface_hub[hf_transfer]"
        ) from exc

    for model_key in args.models:
        spec = MODELS[model_key]
        local_dir = (args.root / spec["target_dir"]).resolve()
        local_dir.mkdir(parents=True, exist_ok=True)

        print(f"[{model_key}] repo: {spec['repo_id']}")
        print(f"[{model_key}] dir : {local_dir}")
        for pattern in spec["allow_patterns"]:
            print(f"  - {pattern}")

        if args.dry_run:
            continue

        snapshot_download(
            repo_id=spec["repo_id"],
            local_dir=str(local_dir),
            local_dir_use_symlinks=False,
            allow_patterns=spec["allow_patterns"],
            resume_download=True,
        )
        print(f"[{model_key}] download complete")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
