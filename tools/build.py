#!/usr/bin/env python3
"""index.template.html のトークンを data URI に置換して2つの成果物を出力する。

  {{IMG:name}} → assets/clip-<name>.jpg（必須）
  {{VID:name}} → assets/clip-<name>.mp4（無ければ空文字＝静止画にフォールバック）

  index.html    … <!DOCTYPE html> で包んだ完全な文書。GitHub Pages・ローカル・配布用
  artifact.html … 包まない断片。claude.ai Artifact 公開用（公開時に向こうが包む）
"""
import base64
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
TEMPLATE = ROOT / "index.template.html"
OUT_FULL = ROOT / "index.html"
OUT_FRAGMENT = ROOT / "artifact.html"
ASSETS = ROOT / "assets"


def data_uri(kind: str, name: str) -> str:
    if kind == "IMG":
        path = ASSETS / f"clip-{name}.jpg"
        if not path.exists():
            sys.exit(f"missing asset: {path}")
        return "data:image/jpeg;base64," + base64.b64encode(path.read_bytes()).decode()
    path = ASSETS / f"clip-{name}.mp4"
    if not path.exists():
        print(f"  (no video for {name}; still image only)")
        return ""
    return "data:video/mp4;base64," + base64.b64encode(path.read_bytes()).decode()


def wrap(fragment: str) -> str:
    """先頭の meta/title/link/style を <head> に、残りを <body> に入れた完全な文書にする。"""
    cut = fragment.index("</style>") + len("</style>")
    head, body = fragment[:cut], fragment[cut:]
    return (
        '<!DOCTYPE html>\n<html lang="ja">\n<head>\n'
        + head.strip()
        + "\n</head>\n<body>\n"
        + body.strip()
        + "\n</body>\n</html>\n"
    )


def main() -> None:
    html = TEMPLATE.read_text(encoding="utf-8")
    html, n = re.subn(r"\{\{(IMG|VID):([a-z0-9_-]+)\}\}", lambda m: data_uri(m.group(1), m.group(2)), html)
    OUT_FRAGMENT.write_text(html, encoding="utf-8")
    OUT_FULL.write_text(wrap(html), encoding="utf-8")
    for out in (OUT_FULL, OUT_FRAGMENT):
        print(f"{out.relative_to(ROOT)}: {n} tokens replaced, {out.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
