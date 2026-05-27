from __future__ import annotations

import argparse
import os
from pathlib import Path


MODELS = {
    "e4b-nvfp4a16": {
        "repo_id": "coolthor/Gemma-4-E4B-it-NVFP4A16",
        "target_dir": "models/quant/gemma-4-E4B-it-NVFP4A16",
        "allow_patterns": [
            "README.md",
            "chat_template.jinja",
            "config.json",
            "generation_config.json",
            "model.safetensors",
            "processor_config.json",
            "recipe.yaml",
            "tokenizer.json",
            "tokenizer_config.json",
        ],
    },
    "26b-nvfp4": {
        "repo_id": "RedHatAI/gemma-4-26B-A4B-it-NVFP4",
        "target_dir": "models/quant/gemma-4-26B-A4B-it-NVFP4",
        "allow_patterns": [
            "README.md",
            "chat_template.jinja",
            "config.json",
            "generation_config.json",
            "model.safetensors",
            "model.safetensors.index.json",
            "processor_config.json",
            "recipe.yaml",
            "tokenizer.json",
            "tokenizer_config.json",
        ],
    },
    "26b-gguf-q4km": {
        "repo_id": "bartowski/google_gemma-4-26B-A4B-it-GGUF",
        "target_dir": "models/quant/gemma-4-26B-A4B-it-GGUF-Q4_K_M",
        "allow_patterns": [
            "README.md",
            "google_gemma-4-26B-A4B-it-Q4_K_M.gguf",
            "mmproj-google_gemma-4-26B-A4B-it-f16.gguf",
        ],
    },
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Download selected Gemma quantized model assets for Thor testing."
    )
    parser.add_argument(
        "models",
        nargs="*",
        default=["e4b-nvfp4a16", "26b-nvfp4", "26b-gguf-q4km"],
        help=(
            "Model groups to download. Defaults to e4b-nvfp4a16, "
            "26b-nvfp4, and 26b-gguf-q4km."
        ),
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
        from huggingface_hub import login, snapshot_download
    except ImportError as exc:
        raise SystemExit(
            "huggingface_hub is required. Install it with: "
            "python -m pip install -U huggingface_hub[hf_transfer]"
        ) from exc

    token = os.getenv("HF_TOKEN") or os.getenv("HUGGING_FACE_HUB_TOKEN")
    if not token:
        for token_path in (
            Path.home() / ".cache" / "huggingface" / "token",
            Path.home() / ".huggingface" / "token",
        ):
            if token_path.exists():
                token = token_path.read_text(encoding="utf-8").strip()
                if token:
                    break

    if token:
        login(token=token, add_to_git_credential=False)
        print("[auth] Hugging Face token loaded")
    else:
        print("[auth] No Hugging Face token found; continuing unauthenticated")

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
