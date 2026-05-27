from __future__ import annotations

from pathlib import Path

from transformers import AutoConfig, AutoProcessor, AutoTokenizer


ROOT = Path(__file__).resolve().parents[1]
MODELS = {
    "e4b": ROOT / "models" / "hf" / "gemma-4-E4B-it",
    "26b": ROOT / "models" / "hf" / "gemma-4-26B-A4B-it",
}


def check_model(name: str, model_dir: Path) -> None:
    print(f"[{name}] dir: {model_dir}")
    if not model_dir.exists():
        print("  status: missing")
        return

    config = AutoConfig.from_pretrained(model_dir, local_files_only=True)
    tokenizer = AutoTokenizer.from_pretrained(model_dir, local_files_only=True)
    processor = AutoProcessor.from_pretrained(model_dir, local_files_only=True)

    print(f"  config: {type(config).__name__} ({getattr(config, 'model_type', 'unknown')})")
    print(f"  tokenizer: {type(tokenizer).__name__} vocab={tokenizer.vocab_size}")
    print(f"  processor: {type(processor).__name__}")

    if name == "e4b":
        weights = model_dir / "model.safetensors"
        print(f"  weights: {'ok' if weights.exists() else 'missing'}")
    elif name == "26b":
        shard_1 = model_dir / "model-00001-of-00002.safetensors"
        shard_2 = model_dir / "model-00002-of-00002.safetensors"
        print(
            "  weights: "
            f"shard1={'ok' if shard_1.exists() else 'missing'}, "
            f"shard2={'ok' if shard_2.exists() else 'missing'}"
        )


def main() -> int:
    for name, model_dir in MODELS.items():
        check_model(name, model_dir)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
