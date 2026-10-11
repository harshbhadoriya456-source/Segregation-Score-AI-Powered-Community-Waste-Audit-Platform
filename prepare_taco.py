
import json
import random
from pathlib import Path
from collections import defaultdict

ROOT = Path(r"C:\segregation-score\datasets\taco\raw\TACO\data")
OUT = Path(r"C:\segregation-score\datasets\taco\yolo")

random.seed(42)

with (ROOT / "annotations.json").open("r", encoding="utf-8") as f:
    data = json.load(f)

categories = sorted(data["categories"], key=lambda c: c["id"])
category_map = {c["id"]: i for i, c in enumerate(categories)}
category_names = [c["name"] for c in categories]

images = data["images"]
annotations_by_image = defaultdict(list)

for ann in data["annotations"]:
    annotations_by_image[ann["image_id"]].append(ann)

random.shuffle(images)
split = int(len(images) * 0.8)
splits = {
    "train": images[:split],
    "val": images[split:]
}

for name, items in splits.items():
    (OUT / "images" / name).mkdir(parents=True, exist_ok=True)
    (OUT / "labels" / name).mkdir(parents=True, exist_ok=True)

    for image in items:
        source = ROOT / image["file_name"]
        destination = OUT / "images" / name / Path(image["file_name"]).name

        # Unique filename prevents collisions between TACO batches.
        destination = destination.with_name(
            f"{Path(image['file_name']).parent.name}_{destination.name}"
        )

        import shutil
        shutil.copy2(source, destination)

        label_lines = []
        W, H = image["width"], image["height"]

        for ann in annotations_by_image[image["id"]]:
            x, y, w, h = ann["bbox"]

            # Clip boxes to image boundaries.
            x1 = max(0.0, min(float(W), x))
            y1 = max(0.0, min(float(H), y))
            x2 = max(0.0, min(float(W), x + w))
            y2 = max(0.0, min(float(H), y + h))

            if x2 <= x1 or y2 <= y1:
                continue

            xc = ((x1 + x2) / 2) / W
            yc = ((y1 + y2) / 2) / H
            nw = (x2 - x1) / W
            nh = (y2 - y1) / H

            label_lines.append(
                f"{category_map[ann['category_id']]} "
                f"{xc:.6f} {yc:.6f} {nw:.6f} {nh:.6f}"
            )

        label_path = OUT / "labels" / name / f"{destination.stem}.txt"
        label_path.write_text(
            "\n".join(label_lines),
            encoding="utf-8"
        )

yaml_text = (
    f"path: {OUT.as_posix()}\n"
    "train: images/train\n"
    "val: images/val\n"
    "names:\n"
    + "".join(
        f"  {i}: {json.dumps(label)}\n"
        for i, label in enumerate(category_names)
    )
)

(OUT / "taco.yaml").write_text(yaml_text, encoding="utf-8")

print("Dataset conversion complete.")
print("Training images:", len(splits["train"]))
print("Validation images:", len(splits["val"]))
print("Classes:", len(category_names))
print("Dataset YAML:", OUT / "taco.yaml")
