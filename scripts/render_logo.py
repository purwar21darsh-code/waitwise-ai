"""Regenerate the WAITWISE AI submission logo PNG with Pillow."""
from pathlib import Path

from PIL import Image, ImageDraw


SIZE = 512
SCALE = 4
canvas = Image.new("RGBA", (SIZE * SCALE, SIZE * SCALE), (0, 0, 0, 0))
draw = ImageDraw.Draw(canvas)

def s(value: int) -> int:
    return value * SCALE


navy = "#15233a"
mint = "#6dd6a3"
draw.rounded_rectangle((0, 0, s(SIZE), s(SIZE)), radius=s(144), fill=navy)
# A compact looping mark suggests a pause, a plan, and a completed next step.
draw.rounded_rectangle((s(103), s(111), s(410), s(391)), radius=s(44), fill=mint)
draw.line([(s(163), s(199)), (s(292), s(199)), (s(329), s(208))], fill=navy, width=s(31), joint="curve")
draw.line([(s(222), s(294)), (s(254), s(326)), (s(321), s(251))], fill=navy, width=s(29), joint="curve")
canvas = canvas.resize((SIZE, SIZE), Image.Resampling.LANCZOS)
destination = Path(__file__).resolve().parents[1] / "public" / "logo" / "waitwise-mark.png"
canvas.save(destination, optimize=True)
print(f"Wrote {destination} ({destination.stat().st_size:,} bytes)")
