import json
import math
import os
import sys
from pathlib import Path

from ultralytics import YOLO


DEFAULT_MODEL_PATH = (
    r"C:\segregation-score\runs\taco\baseline\weights\best.pt"
)


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("Usage: yolo_inference.py <image-path>")

    image_path = Path(sys.argv[1])
    if not image_path.is_file():
        raise FileNotFoundError(f"Uploaded image does not exist: {image_path}")

    model_path = Path(os.environ.get("YOLO_MODEL_PATH") or DEFAULT_MODEL_PATH)
    if not model_path.is_file():
        raise FileNotFoundError(f"YOLO checkpoint does not exist: {model_path}")

    model = YOLO(str(model_path))
    results = model.predict(
        source=str(image_path),
        device="cpu",
        imgsz=416,
        verbose=False,
    )

    detections = []
    for result in results:
        if result.boxes is None:
            continue

        normalized_boxes = result.boxes.xywhn.cpu().tolist()
        class_ids = result.boxes.cls.cpu().tolist()
        confidences = result.boxes.conf.cpu().tolist()

        for box, class_id, confidence in zip(
            normalized_boxes, class_ids, confidences
        ):
            x, y, width, height = (float(value) for value in box)
            score = float(confidence)
            class_name = result.names.get(int(class_id))
            if not isinstance(class_name, str) or not class_name:
                raise ValueError(f"Missing class name for model class {class_id}.")
            if (
                not all(math.isfinite(value) for value in (x, y, width, height, score))
                or not 0 <= x <= 1
                or not 0 <= y <= 1
                or width <= 0
                or height <= 0
                or x + width > 1.001
                or y + height > 1.001
                or not 0 <= score <= 1
            ):
                raise ValueError("YOLO produced an invalid box or confidence score.")

            detections.append(
                {
                    "className": class_name,
                    "confidence": score,
                    "boundingBox": {
                        "x": max(0.0, x),
                        "y": max(0.0, y),
                        "width": min(1.0, x + width) - max(0.0, x),
                        "height": min(1.0, y + height) - max(0.0, y),
                    },
                }
            )

    json.dump({"detections": detections}, sys.stdout, ensure_ascii=False)


if __name__ == "__main__":
    main()
