"""
Joins all individual 32x32 isometric tile PNGs into a single spritesheet.
Excludes example/preview images.
"""
import math
import os

from PIL import Image

TILES_DIR = "/Users/davidfernandezcomesana/Desktop/Proyectos/ghotic-jam/public/assets"
OUTPUT = "/Users/davidfernandezcomesana/Desktop/Proyectos/ghotic-jam/public/assets/tileset.png"
TILE_SIZE = 32

# Exclude non-tile images
EXCLUDE = {"iso_sprite_sheet.png", "isoexample 2.png", "isoexample.png", "isoexample1.png", "isosample3.png", "tileset.png", "README.txt"}

# Collect tile files
files = sorted([
    f for f in os.listdir(TILES_DIR)
    if f.endswith(".png") and f not in EXCLUDE
])

print(f"Found {len(files)} tiles")

# Calculate grid
cols = 16  # 16 tiles per row
rows = math.ceil(len(files) / cols)

print(f"Grid: {cols}x{rows} = {cols*TILE_SIZE}x{rows*TILE_SIZE}px")

# Create spritesheet
sheet = Image.new("RGBA", (cols * TILE_SIZE, rows * TILE_SIZE), (0, 0, 0, 0))

for i, f in enumerate(files):
    path = os.path.join(TILES_DIR, f)
    img = Image.open(path).convert("RGBA")
    
    # Resize if not 32x32
    if img.size != (TILE_SIZE, TILE_SIZE):
        print(f"  Warning: {f} is {img.size}, resizing to {TILE_SIZE}x{TILE_SIZE}")
        img = img.resize((TILE_SIZE, TILE_SIZE), Image.NEAREST)
    
    col = i % cols
    row = i // cols
    sheet.paste(img, (col * TILE_SIZE, row * TILE_SIZE))

sheet.save(OUTPUT)
print(f"Saved spritesheet: {OUTPUT}")
print(f"Size: {sheet.size[0]}x{sheet.size[1]}px")

# Print tile index for reference
print("\nTile index:")
for i, f in enumerate(files):
    name = f.replace(".png", "")
    col = i % cols
    row = i // cols
    print(f"  {i:3d}: ({col},{row}) {name}")
