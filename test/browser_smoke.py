"""Exercise the real packaged EVEngine in a headless Edge browser."""
import json
from io import BytesIO
from PIL import Image
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "build/tools/playwright"))
from playwright.sync_api import sync_playwright


def main():
    url = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:18090/toy/local/index.html"
    output = ROOT / "build/browser-smoke"
    output.mkdir(parents=True, exist_ok=True)
    console = []
    errors = []
    report = {"url": url, "ok": False}
    def on_console(message):
        console.append({"type": message.type, "text": message.text})
        print(message.type + ": " + message.text, flush=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(
            executable_path="C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
            headless=True,
            args=["--enable-unsafe-webgpu"],
        )
        try:
            page = browser.new_page(viewport={"width": 1000, "height": 800})
            page.on("console", on_console)
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.goto(url, wait_until="networkidle", timeout=120000)
            page.wait_for_function("document.getElementById('status').textContent === '游戏就绪' || document.getElementById('status').textContent.includes('失败') || document.getElementById('status').textContent.includes('无法启动')", timeout=120000)
            assert page.locator("#status").inner_text() == "游戏就绪", page.locator("#status").inner_text()
            page.wait_for_function("typeof Module.FS !== 'undefined' && Module.FS.analyzePath('/tmp/toy-game-frame.png').exists", timeout=90000)
            image = bytes(page.evaluate("Array.from(Module.FS.readFile('/tmp/toy-game-frame.png'))"))
            assert image.startswith(b"\x89PNG\r\n\x1a\n"), "Engine frame is not a PNG"
            (output / "engine-frame.png").write_bytes(image)
            pixels = Image.open(BytesIO(image)).convert("RGB")
            blue = sum(1 for r,g,b in pixels.getdata() if b > 160 and b > r * 1.4 and g > 60)
            red = sum(1 for r,g,b in pixels.getdata() if r > 160 and r > b * 1.4 and r > g * 1.4)
            assert blue >= 500 and red >= 500, f"Missing rendered game geometry: blue={blue}, red={red}"
            assert not any("present error:" in item["text"] or "render error:" in item["text"] for item in console), "Engine frame errors were reported"
            page.locator("#canvas").focus()
            page.keyboard.down("ArrowRight")
            page.wait_for_timeout(500)
            page.keyboard.up("ArrowRight")
            page.wait_for_timeout(100)
            moved = any("keyboard movement verified" in item["text"] for item in console)
            initialized = any("EVEngine game initialized" in item["text"] for item in console)
            report.update({"status": page.locator("#status").inner_text(),
                           "environment": json.loads(page.locator("#report").text_content()),
                           "engineInitialized": initialized, "keyboardMovement": moved,
                           "engineFrameBytes": len(image), "bluePixels": blue, "redPixels": red, "errors": errors})
            assert initialized, "Missing actual EveScript initialization marker"
            assert moved, "Keyboard input did not reach the EveScript update loop"
            assert not errors, f"Browser runtime errors: {errors}"
            report["ok"] = True
        except Exception as error:
            report["failure"] = str(error)
            if "page" in locals():
                report["status"] = page.locator("#status").inner_text()
                report["environmentText"] = page.locator("#report").text_content()
            raise
        finally:
            report["console"] = console
            report["pageErrors"] = errors
            (output / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
            browser.close()
    print(json.dumps({k: v for k, v in report.items() if k != "console"}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
    main()
