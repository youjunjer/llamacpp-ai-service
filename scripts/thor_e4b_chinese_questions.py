from __future__ import annotations

import json
import time
from pathlib import Path

import torch
from transformers import AutoProcessor, Gemma4ForConditionalGeneration


QUESTIONS = [
    "\u4f60\u662f\u8ab0?",
    "\u6838\u80fd\u96fb\u5ee0\u662f\u5426\u9069\u5408\u53f0\u7063",
    "\u4eba\u5de5\u667a\u6167\u5728\u5546\u696d\u4e0a\u7684\u4e94\u500b\u61c9\u7528",
    "\u624b\u6a5f\u5c0d\u65bc\u5e7c\u5152\u7684\u5f71\u97ff",
]


def main() -> int:
    root = Path(__file__).resolve().parents[1]
    model_path = root / "models" / "hf" / "gemma-4-E4B-it"
    out_path = root / "testdata" / "gemmae4b_chinese_questions_result.json"

    result: dict[str, object] = {
        "model_path": str(model_path),
        "questions": [],
    }

    t0 = time.time()
    processor = AutoProcessor.from_pretrained(model_path, local_files_only=True)
    model = Gemma4ForConditionalGeneration.from_pretrained(
        model_path,
        local_files_only=True,
        torch_dtype=torch.bfloat16,
        device_map="auto",
    )
    result["model_load_sec"] = round(time.time() - t0, 2)

    history = []
    session_t0 = time.time()

    for question in QUESTIONS:
        history.append({"role": "user", "content": [{"type": "text", "text": question}]})
        prompt = processor.apply_chat_template(history, tokenize=False, add_generation_prompt=True)
        inputs = processor(text=prompt, return_tensors="pt")
        inputs = {k: v.to(model.device) if hasattr(v, "to") else v for k, v in inputs.items()}
        prompt_tokens = int(inputs["input_ids"].shape[1])

        t1 = time.time()
        with torch.inference_mode():
            output = model.generate(**inputs, max_new_tokens=192, do_sample=False)
        dt = time.time() - t1

        new_tokens = output[:, prompt_tokens:]
        generated_tokens = int(new_tokens.shape[1])
        answer = processor.batch_decode(new_tokens, skip_special_tokens=True)[0].strip()
        history.append({"role": "assistant", "content": [{"type": "text", "text": answer}]})

        result["questions"].append(
            {
                "question": question,
                "generated_tokens": generated_tokens,
                "elapsed_sec": round(dt, 2),
                "tokens_per_sec": round(generated_tokens / dt, 2) if dt else 0,
                "answer": answer,
            }
        )

    result["session_total_sec"] = round(time.time() - session_t0, 2)
    out_path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(out_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
