#!/usr/bin/env python3
"""
Safely rename UI Romanian terms inside JS/TS/TSX string literals.

Goal: Replace "lucrare/lucrări" wording with "tichet/tichete" in *UI text* only,
without touching identifiers, routes, firestore collection names, etc.

This script:
- Walks selected directories
- For .ts/.tsx/.js/.jsx files, performs replacements ONLY inside:
  - single-quoted strings
  - double-quoted strings
  - template literal *static parts* (excluding ${...} expressions)
- Skips comments and code outside string literals

Usage (UI-only recommended):
  python3 scripts/rename_ui_terms.py --dry-run app/dashboard app/portal app/login components
  python3 scripts/rename_ui_terms.py app/dashboard app/portal app/login components

If you *must* run over app/, you can exclude server routes:
  python3 scripts/rename_ui_terms.py --dry-run --exclude-dir app/api app components
"""

from __future__ import annotations

import argparse
import os
import re
from dataclasses import dataclass
from typing import Iterable, List, Tuple


REPLACEMENTS: List[Tuple[re.Pattern, str]] = [
    # Longer / specific forms first (with and without diacritics)
    (re.compile(r"\bLucrările\b"), "Tichetele"),
    (re.compile(r"\blucrările\b"), "tichetele"),
    (re.compile(r"\bLucrarile\b"), "Tichetele"),
    (re.compile(r"\blucrarile\b"), "tichetele"),

    (re.compile(r"\bLucrărilor\b"), "Tichetelor"),
    (re.compile(r"\blucrărilor\b"), "tichetelor"),
    (re.compile(r"\bLucrarilor\b"), "Tichetelor"),
    (re.compile(r"\blucrarilor\b"), "tichetelor"),

    (re.compile(r"\bLucrării\b"), "Tichetului"),
    (re.compile(r"\blucrării\b"), "tichetului"),
    (re.compile(r"\bLucrarii\b"), "Tichetului"),
    (re.compile(r"\blucrarii\b"), "tichetului"),

    (re.compile(r"\bLucrări\b"), "Tichete"),
    (re.compile(r"\blucrări\b"), "tichete"),
    (re.compile(r"\bLucrari\b"), "Tichete"),
    (re.compile(r"\blucrari\b"), "tichete"),

    (re.compile(r"\bLucrare\b"), "Tichet"),
    (re.compile(r"\blucrare\b"), "tichet"),
]


def apply_replacements(text: str) -> str:
    out = text
    for pat, rep in REPLACEMENTS:
        out = pat.sub(rep, out)
    return out


@dataclass
class TransformResult:
    changed: bool
    new_text: str
    change_count: int


def transform_js_like_source(src: str) -> TransformResult:
    NORMAL = "NORMAL"
    SQ = "SINGLE_QUOTE"
    DQ = "DOUBLE_QUOTE"
    TL = "TEMPLATE"
    TL_EXPR = "TEMPLATE_EXPR"
    LINE_COMMENT = "LINE_COMMENT"
    BLOCK_COMMENT = "BLOCK_COMMENT"

    state = NORMAL
    i = 0
    n = len(src)
    out_chars: List[str] = []
    changed = False
    change_count = 0

    # For template expressions: track nested braces inside ${ ... }
    brace_depth = 0

    def flush_segment(seg: str) -> str:
        nonlocal changed, change_count
        new_seg = apply_replacements(seg)
        if new_seg != seg:
            # Rough count: how many replacements happened (best-effort)
            # by summing occurrences of each rep delta.
            # We compute count based on patterns.
            for pat, rep in REPLACEMENTS:
                # Count matches in original segment
                for _ in pat.finditer(seg):
                    change_count += 1
            changed = True
        return new_seg

    # Current literal segment buffer (for SQ/DQ/TL static)
    buf: List[str] = []

    def buf_flush():
        nonlocal buf
        if not buf:
            return
        seg = "".join(buf)
        out_chars.append(flush_segment(seg))
        buf = []

    while i < n:
        ch = src[i]
        nxt = src[i + 1] if i + 1 < n else ""

        if state == NORMAL:
            # Enter comments
            if ch == "/" and nxt == "/":
                out_chars.append(ch)
                out_chars.append(nxt)
                i += 2
                state = LINE_COMMENT
                continue
            if ch == "/" and nxt == "*":
                out_chars.append(ch)
                out_chars.append(nxt)
                i += 2
                state = BLOCK_COMMENT
                continue

            # Enter strings
            if ch == "'":
                out_chars.append(ch)
                i += 1
                state = SQ
                buf = []
                continue
            if ch == '"':
                out_chars.append(ch)
                i += 1
                state = DQ
                buf = []
                continue
            if ch == "`":
                out_chars.append(ch)
                i += 1
                state = TL
                buf = []
                continue

            out_chars.append(ch)
            i += 1
            continue

        if state == LINE_COMMENT:
            out_chars.append(ch)
            i += 1
            if ch == "\n":
                state = NORMAL
            continue

        if state == BLOCK_COMMENT:
            out_chars.append(ch)
            i += 1
            if ch == "*" and nxt == "/":
                out_chars.append(nxt)
                i += 1
                state = NORMAL
            continue

        if state in (SQ, DQ):
            quote = "'" if state == SQ else '"'
            if ch == "\\":
                # Keep escapes as-is
                if i + 1 < n:
                    buf.append(ch)
                    buf.append(src[i + 1])
                    i += 2
                else:
                    buf.append(ch)
                    i += 1
                continue
            if ch == quote:
                buf_flush()
                out_chars.append(ch)
                i += 1
                state = NORMAL
                continue
            buf.append(ch)
            i += 1
            continue

        if state == TL:
            # Template literal static text, but may contain ${ ... }
            if ch == "\\":
                if i + 1 < n:
                    buf.append(ch)
                    buf.append(src[i + 1])
                    i += 2
                else:
                    buf.append(ch)
                    i += 1
                continue
            if ch == "`":
                buf_flush()
                out_chars.append(ch)
                i += 1
                state = NORMAL
                continue
            if ch == "$" and nxt == "{":
                # flush static part before expression
                buf_flush()
                out_chars.append(ch)
                out_chars.append(nxt)
                i += 2
                state = TL_EXPR
                brace_depth = 1
                continue
            buf.append(ch)
            i += 1
            continue

        if state == TL_EXPR:
            # Inside ${...} we do not transform; we just copy,
            # but we must detect nested braces and the closing }
            out_chars.append(ch)
            i += 1
            if ch == "{":
                brace_depth += 1
            elif ch == "}":
                brace_depth -= 1
                if brace_depth == 0:
                    state = TL
            elif ch == "'" or ch == '"' or ch == "`":
                # We could be entering nested strings inside expression; ignore.
                pass
            continue

        # fallback
        out_chars.append(ch)
        i += 1

    # In case we ended inside a literal (malformed), flush buffer
    if state in (SQ, DQ, TL):
        buf_flush()

    new_src = "".join(out_chars)
    return TransformResult(changed=changed, new_text=new_src, change_count=change_count)


def iter_source_files(paths: Iterable[str]) -> Iterable[str]:
    # NOTE: We intentionally allow excluding directories to avoid touching server logic.
    exts = {".ts", ".tsx", ".js", ".jsx"}
    for p in paths:
        if os.path.isfile(p):
            _, ext = os.path.splitext(p)
            if ext in exts:
                yield p
            continue
        for root, dirs, files in os.walk(p):
            # Skip common noise dirs
            dirs[:] = [d for d in dirs if d not in {"node_modules", ".next", "dist", "build"}]
            for fn in files:
                _, ext = os.path.splitext(fn)
                if ext in exts:
                    yield os.path.join(root, fn)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("paths", nargs="+", help="directories/files to process (e.g. app components)")
    ap.add_argument("--dry-run", action="store_true", help="do not write files, only report")
    ap.add_argument(
        "--exclude-dir",
        action="append",
        default=[],
        help="directory path prefix to exclude (can be repeated), e.g. --exclude-dir app/api",
    )
    args = ap.parse_args()

    total_files = 0
    changed_files = 0
    total_changes = 0

    # Normalize exclude prefixes
    exclude_prefixes = [os.path.normpath(x) for x in (args.exclude_dir or [])]

    for fpath in iter_source_files(args.paths):
        norm_path = os.path.normpath(fpath)
        if any(norm_path.startswith(pref + os.sep) or norm_path == pref for pref in exclude_prefixes):
            continue

        total_files += 1
        try:
            with open(fpath, "r", encoding="utf-8") as f:
                src = f.read()
        except Exception:
            continue

        res = transform_js_like_source(src)
        if not res.changed:
            continue

        changed_files += 1
        total_changes += res.change_count
        rel = fpath
        print(f"[CHANGE] {rel} (+{res.change_count})")

        if not args.dry_run:
            with open(fpath, "w", encoding="utf-8") as f:
                f.write(res.new_text)

    print()
    print(f"Scanned files: {total_files}")
    print(f"Changed files: {changed_files}")
    print(f"Total replacements (approx): {total_changes}")
    if args.dry_run:
        print("Dry-run only: no files were modified.")


if __name__ == "__main__":
    main()


