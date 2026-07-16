#!/usr/bin/env python3
"""Generate preview images and the 5-in-1 PDF for the dinosaur outreach pack."""
import os
from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT = "/Users/dongwanlong/mywork/printly-admin"
OUT = os.path.join(ROOT, "data/outreach/5-in-1-dinosaur-printable-activity-pack")
IMG = os.path.join(OUT, "images")

# ---- palette ----
GREEN = (47, 122, 86)        # primary jungle green
GREEN_DK = (33, 92, 64)
CREAM = (248, 246, 238)
ORANGE = (240, 138, 54)
YELLOW = (247, 197, 72)
TEAL = (58, 160, 140)
INK = (38, 46, 42)
WHITE = (255, 255, 255)
GREY = (110, 120, 115)

ACCENTS = {
    "coloring-pages": (235, 110, 95),
    "tracing-worksheets": (90, 150, 210),
    "scissor-skills": (240, 160, 60),
    "number-sequencing": (130, 175, 90),
    "grid-puzzles": (160, 120, 200),
}
LABELS = {
    "coloring-pages": "Coloring Pages",
    "tracing-worksheets": "Tracing Worksheets",
    "scissor-skills": "Scissor Skills",
    "number-sequencing": "Number Sequencing",
    "grid-puzzles": "Grid Puzzles",
}

DINOS = [
    "t-rex", "velociraptor", "triceratops", "brachiosaurus", "stegosaurus",
    "ankylosaurus", "diplodocus", "pachycephalosaurus", "dilophosaurus", "suchomimus",
]
DINO_TITLES = {
    "t-rex": "T-Rex",
    "velociraptor": "Velociraptor",
    "triceratops": "Triceratops",
    "brachiosaurus": "Brachiosaurus",
    "stegosaurus": "Stegosaurus",
    "ankylosaurus": "Ankylosaurus",
    "diplodocus": "Diplodocus",
    "pachycephalosaurus": "Pachycephalosaurus",
    "dilophosaurus": "Dilophosaurus",
    "suchomimus": "Suchomimus",
}

FONT_DIR = "/System/Library/Fonts/Supplemental"
def font(size, bold=True, black=False):
    if black:
        path = os.path.join(FONT_DIR, "Arial Black.ttf")
    elif bold:
        path = os.path.join(FONT_DIR, "Arial Bold.ttf")
    else:
        path = os.path.join(FONT_DIR, "Arial.ttf")
    return ImageFont.truetype(path, size)


def load(slug, activity):
    p = os.path.join(IMG, slug, activity + ".webp")
    return Image.open(p).convert("RGB")


def text_w(draw, txt, fnt):
    b = draw.textbbox((0, 0), txt, font=fnt)
    return b[2] - b[0]


def text_h(draw, txt, fnt):
    b = draw.textbbox((0, 0), txt, font=fnt)
    return b[3] - b[1]


def center_text(draw, cx, y, txt, fnt, fill):
    w = text_w(draw, txt, fnt)
    draw.text((cx - w / 2, y), txt, font=fnt, fill=fill)


def wrap(draw, txt, fnt, max_w):
    words = txt.split()
    lines, cur = [], ""
    for w in words:
        test = (cur + " " + w).strip()
        if text_w(draw, test, fnt) <= max_w:
            cur = test
        else:
            if cur:
                lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def fit_thumb(im, size, radius=18, border=4, bg=WHITE):
    """Return a square thumbnail of the image, contained on a white rounded card."""
    sw, sh = size, size
    card = Image.new("RGB", (sw, sh), bg)
    inner = ImageOps.contain(im, (sw - border * 2, sh - border * 2))
    ix = (sw - inner.width) // 2
    iy = (sh - inner.height) // 2
    card.paste(inner, (ix, iy))
    # rounded mask
    mask = Image.new("L", (sw, sh), 0)
    md = ImageDraw.Draw(mask)
    md.rounded_rectangle([0, 0, sw - 1, sh - 1], radius=radius, fill=255)
    out = Image.new("RGB", (sw, sh), bg)
    out.paste(card, (0, 0), mask)
    return out, mask


def paste_card(base, im, x, y, size, radius=18, shadow=True):
    thumb, mask = fit_thumb(im, size, radius=radius)
    if shadow:
        sh = Image.new("L", (size, size), 0)
        sd = ImageDraw.Draw(sh)
        sd.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=70)
        shadow_layer = Image.new("RGB", (size, size), (0, 0, 0))
        base.paste(shadow_layer, (x + 6, y + 8), sh)
    base.paste(thumb, (x, y), mask)


# ---------------------------------------------------------------------------
def make_cover():
    W, H = 1200, 630
    img = Image.new("RGB", (W, H), CREAM)
    d = ImageDraw.Draw(img)
    # left text panel
    d.rectangle([0, 0, 660, H], fill=GREEN)
    d.rectangle([0, 0, 660, 14], fill=YELLOW)
    # badge
    d.rounded_rectangle([48, 56, 250, 116], radius=30, fill=YELLOW)
    center_text(d, 149, 70, "FREE", font(34, black=True), GREEN_DK)
    # title
    title_font = font(56, black=True)
    d.text((48, 150), "5-in-1", font=font(72, black=True), fill=YELLOW)
    d.text((48, 235), "Dinosaur", font=title_font, fill=WHITE)
    d.text((48, 300), "Printable", font=title_font, fill=WHITE)
    d.text((48, 365), "Activity Pack", font=title_font, fill=WHITE)
    sub = font(22, bold=False)
    for i, line in enumerate([
        "Coloring  •  Tracing  •  Scissor Skills",
        "Number Sequencing  •  Grid Puzzles",
    ]):
        d.text((50, 455 + i * 30), line, font=sub, fill=CREAM)
    d.text((48, 560), "PrintlyKiddo.com", font=font(26, black=True), fill=YELLOW)
    # right collage
    samples = [
        load("t-rex", "coloring-pages"),
        load("triceratops", "number-sequencing"),
        load("stegosaurus", "tracing-worksheets"),
        load("velociraptor", "grid-puzzles"),
    ]
    s = 232
    gap = 24
    ox, oy = 700, 70
    coords = [(ox, oy), (ox + s + gap, oy), (ox, oy + s + gap), (ox + s + gap, oy + s + gap)]
    for im, (x, y) in zip(samples, coords):
        paste_card(img, im, x, y, s, radius=20)
    img.save(os.path.join(OUT, "preview-5-in-1-cover.webp"), "WEBP", quality=90)
    print("cover done")


def make_overview():
    W, H = 1200, 800
    img = Image.new("RGB", (W, H), CREAM)
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, W, 120], fill=GREEN)
    center_text(d, W / 2, 26, "5-in-1 Dinosaur Printable Activity Pack", font(40, black=True), WHITE)
    center_text(d, W / 2, 80, "Five activity types in one free pack", font(24, bold=False), CREAM)
    order = ["coloring-pages", "tracing-worksheets", "scissor-skills",
             "number-sequencing", "grid-puzzles"]
    # sample dino per block
    sample_dino = {
        "coloring-pages": "t-rex",
        "tracing-worksheets": "brachiosaurus",
        "scissor-skills": "ankylosaurus",
        "number-sequencing": "triceratops",
        "grid-puzzles": "stegosaurus",
    }
    # 5 blocks: top row 3, bottom row 2 (centered)
    bw, bh = 340, 300
    gapx, gapy = 30, 26
    top_y = 160
    bot_y = top_y + bh + gapy
    top_x0 = (W - (bw * 3 + gapx * 2)) // 2
    bot_x0 = (W - (bw * 2 + gapx)) // 2
    positions = {
        order[0]: (top_x0, top_y),
        order[1]: (top_x0 + bw + gapx, top_y),
        order[2]: (top_x0 + 2 * (bw + gapx), top_y),
        order[3]: (bot_x0, bot_y),
        order[4]: (bot_x0 + bw + gapx, bot_y),
    }
    for act in order:
        x, y = positions[act]
        accent = ACCENTS[act]
        d.rounded_rectangle([x, y, x + bw, y + bh], radius=22, fill=WHITE,
                            outline=accent, width=4)
        # number chip
        d.ellipse([x + 16, y + 16, x + 64, y + 64], fill=accent)
        center_text(d, x + 40, y + 24, str(order.index(act) + 1), font(28, black=True), WHITE)
        # thumbnail
        ts = 180
        paste_card(img, load(sample_dino[act], act), x + (bw - ts) // 2, y + 40, ts,
                   radius=16, shadow=False)
        center_text(d, x + bw / 2, y + bh - 46, LABELS[act], font(26, black=True), INK)
    img.save(os.path.join(OUT, "preview-5-in-1-overview.webp"), "WEBP", quality=90)
    print("overview done")


def make_pinterest():
    W, H = 1000, 1500
    img = Image.new("RGB", (W, H), CREAM)
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, W, 360], fill=GREEN)
    d.rectangle([0, 360, W, 372], fill=YELLOW)
    d.rounded_rectangle([400, 40, 600, 100], radius=30, fill=YELLOW)
    center_text(d, 500, 52, "FREE", font(34, black=True), GREEN_DK)
    center_text(d, 500, 120, "5-in-1", font(90, black=True), YELLOW)
    center_text(d, 500, 220, "Dinosaur Printables", font(52, black=True), WHITE)
    center_text(d, 500, 290, "for Kids", font(40, bold=False), CREAM)
    # 2x3 grid of varied activities
    combos = [
        ("t-rex", "coloring-pages"),
        ("triceratops", "tracing-worksheets"),
        ("stegosaurus", "scissor-skills"),
        ("brachiosaurus", "number-sequencing"),
        ("velociraptor", "grid-puzzles"),
        ("ankylosaurus", "coloring-pages"),
    ]
    s = 280
    gapx = 40
    gapy = 36
    x0 = (W - (s * 2 + gapx)) // 2
    y0 = 430
    for i, (dino, act) in enumerate(combos):
        r, c = divmod(i, 2)
        x = x0 + c * (s + gapx)
        y = y0 + r * (s + gapy)
        paste_card(img, load(dino, act), x, y, s, radius=22)
    # footer band
    d.rectangle([0, H - 110, W, H], fill=GREEN)
    center_text(d, 500, H - 92, "Coloring • Tracing • Scissor Skills", font(28, bold=True), CREAM)
    center_text(d, 500, H - 54, "Number Sequencing • Grid Puzzles", font(28, bold=True), CREAM)
    img.save(os.path.join(OUT, "pinterest-5-in-1-dinosaur-printables.webp"), "WEBP", quality=90)
    print("pinterest done")


def make_activity_grid(activity):
    """3x3 grid of 9 different dinosaurs for the given activity."""
    W, H = 1200, 1320
    img = Image.new("RGB", (W, H), CREAM)
    d = ImageDraw.Draw(img)
    accent = ACCENTS[activity]
    d.rectangle([0, 0, W, 130], fill=accent)
    center_text(d, W / 2, 28, "Dinosaur " + LABELS[activity], font(44, black=True), WHITE)
    center_text(d, W / 2, 86, "Part of the free 5-in-1 dinosaur printable pack",
                font(22, bold=False), WHITE)
    dinos9 = DINOS[:9]
    s = 350
    gap = 24
    x0 = (W - (s * 3 + gap * 2)) // 2
    y0 = 165
    for i, dino in enumerate(dinos9):
        r, c = divmod(i, 3)
        x = x0 + c * (s + gap)
        y = y0 + r * (s + gap)
        paste_card(img, load(dino, activity), x, y, s, radius=20)
    d.rectangle([0, H - 60, W, H], fill=accent)
    center_text(d, W / 2, H - 46, "PrintlyKiddo.com/dinosaurs", font(24, black=True), WHITE)
    fn = "preview-" + activity + ".webp"
    img.save(os.path.join(OUT, fn), "WEBP", quality=90)
    print(fn, "done")


# ---------------------------------------------------------------------------
# PDF
PW, PH = 1275, 1650  # letter @ 150dpi
LINK = "https://printlykiddo.com/dinosaurs/"
FOOTER = "More free dinosaur printables: " + LINK


def page_bg():
    return Image.new("RGB", (PW, PH), WHITE)


def footer(d, accent=GREEN):
    d.rectangle([0, PH - 70, PW, PH], fill=accent)
    center_text(d, PW / 2, PH - 54, FOOTER, font(24, bold=True), WHITE)


def pdf_cover():
    img = Image.new("RGB", (PW, PH), GREEN)
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, PW, 26], fill=YELLOW)
    d.rectangle([0, PH - 26, PW, PH], fill=YELLOW)
    d.rounded_rectangle([PW/2 - 110, 120, PW/2 + 110, 196], radius=38, fill=YELLOW)
    center_text(d, PW / 2, 134, "FREE", font(44, black=True), GREEN_DK)
    center_text(d, PW / 2, 240, "5-in-1", font(150, black=True), YELLOW)
    center_text(d, PW / 2, 410, "Dinosaur Printable", font(70, black=True), WHITE)
    center_text(d, PW / 2, 490, "Activity Pack", font(70, black=True), WHITE)
    sub = font(30, bold=False)
    lines = wrap(d, "Coloring pages, tracing worksheets, scissor skills, number "
                    "sequencing puzzles, and grid puzzles for kids.", sub, PW - 260)
    yy = 600
    for ln in lines:
        center_text(d, PW / 2, yy, ln, sub, CREAM)
        yy += 42
    # collage row
    samples = [
        load("t-rex", "coloring-pages"),
        load("triceratops", "number-sequencing"),
        load("stegosaurus", "tracing-worksheets"),
        load("velociraptor", "grid-puzzles"),
        load("ankylosaurus", "scissor-skills"),
    ]
    s = 210
    gap = 18
    total = s * 5 + gap * 4
    x = (PW - total) // 2
    y = 780
    for im in samples:
        paste_card(img, im, x, y, s, radius=18)
        x += s + gap
    center_text(d, PW / 2, 1080, "PrintlyKiddo.com", font(46, black=True), YELLOW)
    center_text(d, PW / 2, 1150, LINK, font(28, bold=False), CREAM)
    return img


def pdf_info():
    img = page_bg()
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, PW, 150], fill=GREEN)
    center_text(d, PW / 2, 46, "About This Free Pack", font(52, black=True), WHITE)
    intro = ("This 5-in-1 dinosaur printable activity pack brings together five "
             "kid-favorite activity types in one easy download. Just print and play.")
    yy = 210
    for ln in wrap(d, intro, font(30, bold=False), PW - 220):
        center_text(d, PW / 2, yy, ln, font(30, bold=False), INK)
        yy += 44
    center_text(d, PW / 2, yy + 30, "Perfect for:", font(38, black=True), GREEN_DK)
    items = [
        "Preschool", "Kindergarten", "Homeschool",
        "Classroom centers", "Dinosaur unit study", "Fine motor practice",
        "Quiet time activities",
    ]
    by = yy + 110
    bx0 = 220
    bw, bh = 380, 86
    gapx, gapy = 35, 26
    for i, it in enumerate(items):
        r, c = divmod(i, 2)
        x = bx0 + c * (bw + gapx)
        y = by + r * (bh + gapy)
        d.rounded_rectangle([x, y, x + bw, y + bh], radius=20, fill=CREAM,
                            outline=TEAL, width=3)
        d.ellipse([x + 22, y + bh/2 - 9, x + 40, y + bh/2 + 9], fill=ORANGE)
        d.text((x + 64, y + 24), it, font=font(30, bold=True), fill=INK)
    footer(d)
    return img


def pdf_overview():
    img = page_bg()
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, PW, 150], fill=GREEN)
    center_text(d, PW / 2, 30, "What's Inside: 5 Activities", font(50, black=True), WHITE)
    center_text(d, PW / 2, 96, "Five ways to learn and play with dinosaurs",
                font(26, bold=False), CREAM)
    order = ["coloring-pages", "tracing-worksheets", "scissor-skills",
             "number-sequencing", "grid-puzzles"]
    sample_dino = {
        "coloring-pages": "t-rex",
        "tracing-worksheets": "brachiosaurus",
        "scissor-skills": "ankylosaurus",
        "number-sequencing": "triceratops",
        "grid-puzzles": "diplodocus",
    }
    descs = {
        "coloring-pages": "Bold outlines for creative coloring fun.",
        "tracing-worksheets": "Trace lines for pre-writing and fine motor skills.",
        "scissor-skills": "Cutting practice to build hand control.",
        "number-sequencing": "Order numbers and build early math logic.",
        "grid-puzzles": "Copy the picture to grow visual perception.",
    }
    y = 200
    row_h = 268
    for i, act in enumerate(order):
        accent = ACCENTS[act]
        x = 90
        d.rounded_rectangle([x, y, PW - 90, y + row_h - 24], radius=22, fill=CREAM,
                            outline=accent, width=4)
        paste_card(img, load(sample_dino[act], act), x + 24, y + 22, row_h - 70,
                   radius=16, shadow=False)
        tx = x + row_h + 10
        d.ellipse([tx, y + 28, tx + 56, y + 84], fill=accent)
        center_text(d, tx + 28, y + 36, str(i + 1), font(34, black=True), WHITE)
        d.text((tx + 78, y + 34), LABELS[act], font=font(40, black=True), fill=INK)
        for j, ln in enumerate(wrap(d, descs[act], font(28, bold=False), PW - tx - 140)):
            d.text((tx, y + 110 + j * 38), ln, font=font(28, bold=False), fill=GREY)
        y += row_h
    return img


def pdf_activity_page(dino, activity):
    img = page_bg()
    d = ImageDraw.Draw(img)
    accent = ACCENTS[activity]
    d.rectangle([0, 0, PW, 130], fill=accent)
    center_text(d, PW / 2, 18, DINO_TITLES[dino], font(48, black=True), WHITE)
    center_text(d, PW / 2, 80, LABELS[activity], font(28, bold=True), WHITE)
    im = load(dino, activity)
    s = 1050
    x = (PW - s) // 2
    y = 175
    paste_card(img, im, x, y, s, radius=24, shadow=True)
    footer(d, accent)
    return img


def pdf_cta():
    img = Image.new("RGB", (PW, PH), GREEN)
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, PW, 26], fill=YELLOW)
    d.rectangle([0, PH - 26, PW, PH], fill=YELLOW)
    center_text(d, PW / 2, 230, "Want More", font(86, black=True), YELLOW)
    center_text(d, PW / 2, 330, "Dinosaur Printables?", font(86, black=True), YELLOW)
    body = ("Explore more dinosaur coloring pages, tracing worksheets, scissor "
            "skills pages, number sequencing puzzles, and grid puzzles at "
            "PrintlyKiddo.")
    yy = 520
    for ln in wrap(d, body, font(34, bold=False), PW - 260):
        center_text(d, PW / 2, yy, ln, font(34, bold=False), CREAM)
        yy += 52
    # button
    bw, bh = 760, 110
    bx = (PW - bw) // 2
    by = yy + 60
    d.rounded_rectangle([bx, by, bx + bw, by + bh], radius=55, fill=YELLOW)
    center_text(d, PW / 2, by + 30, "PrintlyKiddo.com/dinosaurs", font(36, black=True), GREEN_DK)
    # mini collage
    samples = [load("t-rex", "coloring-pages"), load("stegosaurus", "grid-puzzles"),
               load("triceratops", "tracing-worksheets"), load("suchomimus", "scissor-skills")]
    s = 220
    gap = 22
    total = s * 4 + gap * 3
    x = (PW - total) // 2
    y = by + 200
    for im in samples:
        paste_card(img, im, x, y, s, radius=18)
        x += s + gap
    return img


def build_pdf():
    pages = [pdf_cover(), pdf_info(), pdf_overview()]
    rotation = ["tracing-worksheets", "scissor-skills", "number-sequencing", "grid-puzzles"]
    for i, dino in enumerate(DINOS):
        pages.append(pdf_activity_page(dino, "coloring-pages"))
        pages.append(pdf_activity_page(dino, rotation[i % len(rotation)]))
    pages.append(pdf_cta())
    out_pdf = os.path.join(OUT, "5-in-1-dinosaur-printable-activity-pack.pdf")
    pages[0].save(out_pdf, "PDF", resolution=150.0, save_all=True,
                  append_images=pages[1:])
    print(f"PDF done: {len(pages)} pages -> {out_pdf}")


def main():
    make_cover()
    make_overview()
    make_pinterest()
    for act in ["coloring-pages", "tracing-worksheets", "scissor-skills",
                "number-sequencing", "grid-puzzles"]:
        make_activity_grid(act)
    build_pdf()


if __name__ == "__main__":
    main()
