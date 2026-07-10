# /// script
# requires-python = ">=3.11"
# dependencies = ["playwright"]
# ///
"""Generate Fortudo PWA icons by rendering the brand emoji on the brand background.

Run: uv run scripts/generate_icons.py
Requires: uv run --with playwright python -m playwright install chromium
"""

from pathlib import Path

from playwright.sync_api import sync_playwright

REPO_ROOT = Path(__file__).resolve().parents[1]
ICONS_DIR = REPO_ROOT / "public" / "icons"

BACKGROUND = "#0f766e"  # tailwind teal-700, matches the app accent
EMOJI = "\N{FLEXED BICEPS}\N{EMOJI MODIFIER FITZPATRICK TYPE-5}"  # 💪🏾

# (filename, canvas px, emoji px) — maskable uses a smaller glyph so the
# safe zone (inner 80%) survives circular masks.
SPECS = [
    ("icon-192.png", 192, 140),
    ("icon-512.png", 512, 380),
    ("icon-maskable-512.png", 512, 300),
    ("apple-touch-icon.png", 180, 130),
]


def page_html(size: int, emoji_px: int) -> str:
    return f"""<!doctype html><html><body style="margin:0">
    <div id="icon" style="width:{size}px;height:{size}px;background:{BACKGROUND};
        display:flex;align-items:center;justify-content:center;
        font-size:{emoji_px}px;line-height:1">{EMOJI}</div>
    </body></html>"""


def main() -> None:
    ICONS_DIR.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 600, "height": 600})
        for filename, size, emoji_px in SPECS:
            page.set_content(page_html(size, emoji_px))
            page.locator("#icon").screenshot(path=str(ICONS_DIR / filename))
            print(f"wrote public/icons/{filename}")
        browser.close()


if __name__ == "__main__":
    main()
