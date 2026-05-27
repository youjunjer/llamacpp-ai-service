from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import torch
from PIL import Image
from transformers import AutoModelForImageTextToText, AutoProcessor


ROOT = Path(__file__).resolve().parents[1]
MODEL_DIR = ROOT / "models" / "quant" / "gemma-4-E4B-it-NVFP4A16"
DEFAULT_IMAGE = ROOT / "testdata" / "red.png"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--image", type=Path, default=DEFAULT_IMAGE)
    parser.add_argument("--text-runs", type=int, default=2)
    parser.add_argument("--vision-runs", type=int, default=2)
    parser.add_argument("--text-max-new-tokens", type=int, default=128)
    parser.add_argument("--vision-max-new-tokens", type=int, default=32)
    return parser.parse_args()


def build_inputs(processor, image: Image.Image, prompt_text: str, device: torch.device) -> dict:
    messages = [
        {
            "role": "user",
            "content": [
                {"type": "image", "image": image},
                {"type": "text", "text": prompt_text},
            ],
        }
    ]
    prompt = processor.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
    inputs = processor(text=prompt, images=[image], return_tensors="pt")
    return {key: value.to(device) if hasattr(value, "to") else value for key, value in inputs.items()}


def run_generate(model, processor, image: Image.Image, prompt_text: str, max_new_tokens: int) -> dict:
    inputs = build_inputs(processor, image, prompt_text, model.device)
    start = time.perf_counter()
    with torch.inference_mode():
        output = model.generate(**inputs, max_new_tokens=max_new_tokens, do_sample=False)
    elapsed = time.perf_counter() - start
    prompt_tokens = int(inputs["input_ids"].shape[-1])
    generated = output[0][prompt_tokens:]
    generated_tokens = int(generated.shape[-1])
    text = processor.tokenizer.decode(generated, skip_special_tokens=True).strip()
    return {
        "elapsed_sec": round(elapsed, 3),
        "prompt_tokens": prompt_tokens,
        "generated_tokens": generated_tokens,
        "tokens_per_sec": round(generated_tokens / elapsed, 3) if elapsed > 0 else None,
        "text": text,
    }


def main() -> int:
    args = parse_args()
    image = Image.open(args.image).convert("RGB")

    load_start = time.perf_counter()
    processor = AutoProcessor.from_pretrained(MODEL_DIR, local_files_only=True)
    model = AutoModelForImageTextToText.from_pretrained(
        MODEL_DIR,
        local_files_only=True,
        device_map="auto",
        torch_dtype="auto",
    )
    if torch.cuda.is_available():
        torch.cuda.synchronize()
    load_elapsed = time.perf_counter() - load_start

    warmup = run_generate(
        model,
        processor,
        image,
        "Reply with only the word ready.",
        max_new_tokens=8,
    )

    text_results = []
    for _ in range(args.text_runs):
        text_results.append(
            run_generate(
                model,
                processor,
                image,
                "請用繁體中文列出人工智慧在商業上的五個應用，每點一句話。",
                max_new_tokens=args.text_max_new_tokens,
            )
        )

    vision_results = []
    for _ in range(args.vision_runs):
        vision_results.append(
            run_generate(
                model,
                processor,
                image,
                "請用一句繁體中文描述這張圖片。",
                max_new_tokens=args.vision_max_new_tokens,
            )
        )

    summary = {
        "model_dir": str(MODEL_DIR),
        "image": str(args.image),
        "load_sec": round(load_elapsed, 3),
        "warmup": warmup,
        "text_results": text_results,
        "vision_results": vision_results,
        "text_avg_tokens_per_sec": round(
            sum(item["tokens_per_sec"] for item in text_results if item["tokens_per_sec"] is not None) / len(text_results),
            3,
        ),
        "vision_avg_sec_per_image": round(
            sum(item["elapsed_sec"] for item in vision_results) / len(vision_results),
            3,
        ),
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
