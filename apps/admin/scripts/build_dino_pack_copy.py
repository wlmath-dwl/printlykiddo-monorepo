#!/usr/bin/env python3
"""Copy representative dinosaur images into the outreach pack image folders."""
import os
import glob
import shutil

ROOT = "/Users/dongwanlong/mywork/printly-admin"
SRC_BASE = os.path.join(ROOT, "data/imgs/dinosaurs")
OUT_BASE = os.path.join(ROOT, "data/outreach/5-in-1-dinosaur-printable-activity-pack")
IMG_OUT = os.path.join(OUT_BASE, "images")

# dinosaur slug -> relative source path under dinosaurs/
DINOS = {
    "t-rex": "carnivorous-dinosaurs/t-rex",
    "velociraptor": "raptors/velociraptor",
    "triceratops": "horned-dinosaurs/triceratops",
    "brachiosaurus": "long-neck-dinosaurs/brachiosaurus",
    "stegosaurus": "plated-dinosaurs/stegosaurus",
    "ankylosaurus": "armored-dinosaurs/ankylosaurus",
    "diplodocus": "long-neck-dinosaurs/diplodocus",
    "pachycephalosaurus": "dome-head-dinosaurs/pachycephalosaurus",
    "dilophosaurus": "carnivorous-dinosaurs/dilophosaurus",
    "suchomimus": "spinosaurs/suchomimus",
}

# activity source folder -> output filename basename
ACTIVITIES = {
    "coloring-pages": "coloring-pages",
    "tracing-worksheets": "tracing-worksheets",
    "cut": "scissor-skills",
    "number-sequencing": "number-sequencing",
    "grid-puzzles": "grid-puzzles",
}


def pick_original(folder):
    """Pick the best non-card, full-resolution original webp from a folder."""
    if not os.path.isdir(folder):
        return None
    files = sorted(glob.glob(os.path.join(folder, "*.webp")))
    originals = [
        f for f in files
        if not f.endswith("-card.webp")
        and not f.endswith("-512.webp")
        and not f.endswith("-1024.webp")
    ]
    if not originals:
        return None
    # choose the largest file (usually clearest / highest detail)
    originals.sort(key=lambda f: os.path.getsize(f), reverse=True)
    return originals[0]


def main():
    os.makedirs(IMG_OUT, exist_ok=True)
    manifest = []
    for slug, rel in DINOS.items():
        dino_out = os.path.join(IMG_OUT, slug)
        os.makedirs(dino_out, exist_ok=True)
        for src_act, out_name in ACTIVITIES.items():
            src_folder = os.path.join(SRC_BASE, rel, src_act)
            chosen = pick_original(src_folder)
            if not chosen:
                print(f"WARNING: no image for {slug}/{src_act}")
                continue
            dest = os.path.join(dino_out, out_name + ".webp")
            shutil.copy2(chosen, dest)
            manifest.append((slug, out_name, os.path.relpath(chosen, ROOT)))
    print(f"Copied {len(manifest)} images.")
    for slug, name, src in manifest:
        print(f"  {slug}/{name}.webp  <- {src}")


if __name__ == "__main__":
    main()
