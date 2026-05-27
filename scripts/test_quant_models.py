from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import torch
from PIL import Image
from transformers import AutoConfig, AutoModelForImageTextToText, AutoProcessor, AutoTokenizer


ROOT = Path(__file__).resolve().parents[1]
MODELS = {
    "e4b-nvfp4a16": ROOT / "models" / "quant" / "gemma-4-E4B-it-NVFP4A16",
    "26b-nvfp4": ROOT / "models" / "quant" / "gemma-4-26B-A4B-it-NVFP4",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--model",
        choices=sorted(MODELS),
        required=True,
    )
    parser.add_argument(
        "--mode",
        choices=["inspect", "generate"],
        default="inspect",
    )
    parser.add_argument(
        "--image",
        type=Path,
        default=ROOT / "testdata" / "red.png",
    )
    return parser.parse_args()


def inspect_model(model_key: str, model_dir: Path) -> int:
    print(f"[{model_key}] dir: {model_dir}")
    config = AutoConfig.from_pretrained(model_dir, local_files_only=True)
    tokenizer = AutoTokenizer.from_pretrained(model_dir, local_files_only=True)
    processor = AutoProcessor.from_pretrained(model_dir, local_files_only=True)
    print("config:", type(config).__name__, getattr(config, "model_type", "unknown"))
    print("tokenizer:", type(tokenizer).__name__, getattr(tokenizer, "vocab_size", "n/a"))
    print("processor:", type(processor).__name__)
    config_path = model_dir / "config.json"
    data = json.loads(config_path.read_text(encoding="utf-8"))
    for key in ("architectures", "torch_dtype", "quantization_config"):
        print(f"{key}:", data.get(key))
    for item in sorted(model_dir.iterdir()):
        if item.is_file():
            print(f"file: {item.name} {item.stat().st_size}")
    return 0


def generate_once(model_key: str, model_dir: Path, image_path: Path) -> int:
    print(f"[{model_key}] loading from {model_dir}")
    processor = AutoProcessor.from_pretrained(model_dir, local_files_only=True)
    model = AutoModelForImageTextToText.from_pretrained(
        model_dir,
        local_files_only=True,
        device_map="auto",
        torch_dtype="auto",
    )
    image = Image.open(image_path).convert("RGB")
    messages = [
        {
            "role": "user",
            "content": [
                {"type": "image", "image": image},
                {"type": "text", "text": "Describe this image in one sentence."},
            ],
        }
    ]
    prompt = processor.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
    inputs = processor(text=prompt, images=[image], return_tensors="pt")
    inputs = {k: v.to(model.device) if hasattr(v, "to") else v for k, v in inputs.items()}
    start = time.perf_counter()
    with torch.inference_mode():
        output = model.generate(**inputs, max_new_tokens=48, do_sample=False)
    elapsed = time.perf_counter() - start
    input_len = inputs["input_ids"].shape[-1]
    generated = output[0][input_len:]
    text = processor.tokenizer.decode(generated, skip_special_tokens=True)
    print("elapsed_sec:", round(elapsed, 3))
    print("generated_tokens:", int(generated.shape[-1]))
    print("text:", text)
    return 0


def main() -> int:
    args = parse_args()
    model_dir = MODELS[args.model]
    if args.mode == "inspect":
        return inspect_model(args.model, model_dir)
    return generate_once(args.model, model_dir, args.image)


if __name__ == "__main__":
    raise SystemExit(main())
