#!/usr/bin/env python3
"""
Fix chapter heading numbering in split OCME textbook chapters.

Each split chapter docx has its chapter/section counter reset to 1 because the
Word numbering definition always starts at 1. This script patches word/numbering.xml
in each chapter file so the chapter counter starts at the correct number N.

The numbering chain:
  Heading1/2/3 paragraphs → numId=X → abstractNumId=85
  abstractNum=85 has numStyleLink="OCMEHeadings"
  abstractNum=95 has styleLink="OCMEHeadings" and the actual level defs:
    ilvl=0: fmt=decimal start=1 lvlText="Chapter %1."  ← FIX THIS
    ilvl=1: fmt=decimal start=1 lvlText="%1.%2"        (auto-correct when ilvl=0 is fixed)
    ilvl=2: fmt=decimal start=1 lvlText="%1.%2.%3"

Usage:
    python3 fix_chapter_numbering.py <chapters_dir>

The chapters_dir should contain files like:
    01_Periodic_Table_and_Trends.docx
    07_Stereochemistry.docx
    ...

Files starting with a two-digit number are treated as chapters.
Non-numeric-prefixed files are skipped.

Output: fixed files are written to <chapters_dir>/fixed/ with the same names.
"""

import re
import sys
import zipfile
import shutil
from pathlib import Path
from lxml import etree

W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
W = "{%s}" % W_NS
HUGE = etree.XMLParser(huge_tree=True, resolve_entities=False, recover=True)


def get_chapter_number(filename):
    """Extract chapter number from filename like '07_Stereochemistry.docx' → 7."""
    m = re.match(r"^(\d+)_", filename)
    if m:
        return int(m.group(1))
    return None


def fix_numbering_xml(num_xml_bytes, chapter_num):
    """
    Patch numbering.xml so heading counters start at chapter_num.

    Targets abstractNums that are the destination of a numStyleLink (i.e., they have
    a styleLink child). Specifically looks for styleLink="OCMEHeadings" but will also
    patch any abstractNum whose ilvl=0 has lvlText containing "Chapter" with a %1
    placeholder and fmt=decimal — making it robust to minor naming variations.

    Returns patched XML bytes.
    """
    root = etree.fromstring(num_xml_bytes, HUGE)
    patched = 0

    for an in root.findall(f"{W}abstractNum"):
        aid = an.get(f"{W}abstractNumId")

        # Check for styleLink (these are the "template" abstractNums that headings link to)
        style_link = an.find(f"{W}styleLink")
        has_style_link = style_link is not None

        # Also check if ilvl=0 has "Chapter" in lvlText — belt-and-suspenders
        ilvl0 = None
        for lvl in an.findall(f"{W}lvl"):
            if lvl.get(f"{W}ilvl") == "0":
                ilvl0 = lvl
                break

        chapter_pattern = False
        if ilvl0 is not None:
            lt = ilvl0.find(f"{W}lvlText")
            fmt = ilvl0.find(f"{W}numFmt")
            lt_val = lt.get(f"{W}val") if lt is not None else ""
            fmt_val = fmt.get(f"{W}val") if fmt is not None else ""
            if "Chapter" in (lt_val or "") and "%1" in (lt_val or "") and fmt_val == "decimal":
                chapter_pattern = True

        if has_style_link or chapter_pattern:
            if ilvl0 is not None:
                start_el = ilvl0.find(f"{W}start")
                if start_el is not None:
                    old_val = start_el.get(f"{W}val")
                    start_el.set(f"{W}val", str(chapter_num))
                    print(f"  abstractNum={aid}: ilvl=0 start {old_val} → {chapter_num}"
                          f" (styleLink={has_style_link}, chapPattern={chapter_pattern})")
                    patched += 1

    # Also patch any num instance (w:num) that has an explicit startOverride=1 for ilvl=0
    # on a num that references a chapter-numbering abstractNum.
    # Collect chapter-relevant abstractNumIds first.
    chapter_ab_ids = set()
    for an in root.findall(f"{W}abstractNum"):
        ilvl0 = None
        for lvl in an.findall(f"{W}lvl"):
            if lvl.get(f"{W}ilvl") == "0":
                ilvl0 = lvl
                break
        style_link = an.find(f"{W}styleLink")
        if style_link is not None and ilvl0 is not None:
            chapter_ab_ids.add(an.get(f"{W}abstractNumId"))
        elif ilvl0 is not None:
            lt = ilvl0.find(f"{W}lvlText")
            fmt = ilvl0.find(f"{W}numFmt")
            lt_val = lt.get(f"{W}val") if lt is not None else ""
            fmt_val = fmt.get(f"{W}val") if fmt is not None else ""
            if "Chapter" in (lt_val or "") and fmt_val == "decimal":
                chapter_ab_ids.add(an.get(f"{W}abstractNumId"))

    for num in root.findall(f"{W}num"):
        ab_ref = num.find(f"{W}abstractNumId")
        ab_id = ab_ref.get(f"{W}val") if ab_ref is not None else None
        if ab_id not in chapter_ab_ids:
            continue
        for ov in num.findall(f"{W}lvlOverride"):
            if ov.get(f"{W}ilvl") != "0":
                continue
            so = ov.find(f"{W}startOverride")
            if so is not None and so.get(f"{W}val") not in (None, ""):
                old = so.get(f"{W}val")
                so.set(f"{W}val", str(chapter_num))
                nid = num.get(f"{W}numId")
                print(f"  numId={nid}: ilvl=0 startOverride {old} → {chapter_num}")

    if patched == 0:
        print(f"  WARNING: no chapter numbering definition found to patch!")

    return etree.tostring(root, xml_declaration=True, encoding="UTF-8", standalone=True)


def fix_chapter_docx(src_path, dst_path, chapter_num):
    """Read src_path, patch numbering.xml, write to dst_path."""
    with zipfile.ZipFile(src_path, "r") as zin:
        names = zin.namelist()
        files = {}
        for name in names:
            try:
                files[name] = zin.read(name)
            except Exception as e:
                print(f"    WARNING: could not read {name}: {e}")

    if "word/numbering.xml" not in files:
        print(f"  WARNING: no word/numbering.xml in {src_path.name} — skipping")
        shutil.copy2(src_path, dst_path)
        return

    files["word/numbering.xml"] = fix_numbering_xml(files["word/numbering.xml"], chapter_num)

    with zipfile.ZipFile(dst_path, "w", zipfile.ZIP_DEFLATED) as zout:
        for name in names:
            if name in files:
                zout.writestr(name, files[name])

    print(f"  → {dst_path.name}")


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    chapters_dir = Path(sys.argv[1])
    if not chapters_dir.is_dir():
        print(f"ERROR: {chapters_dir} is not a directory")
        sys.exit(1)

    output_dir = chapters_dir / "fixed"
    output_dir.mkdir(exist_ok=True)

    docx_files = sorted(chapters_dir.glob("*.docx"))
    if not docx_files:
        print(f"No .docx files found in {chapters_dir}")
        sys.exit(1)

    print(f"Output directory: {output_dir}\n")

    for docx_path in docx_files:
        ch_num = get_chapter_number(docx_path.name)
        if ch_num is None:
            print(f"Skipping (no chapter number): {docx_path.name}")
            continue

        print(f"Chapter {ch_num:02d}: {docx_path.name}")
        dst = output_dir / docx_path.name
        fix_chapter_docx(docx_path, dst, ch_num)
        print()

    print(f"Done. Fixed files are in:\n  {output_dir}/")
    print("\nNext step: convert to PDF with:")
    print(f"  python3 split_textbook.py --pdf-only '{output_dir}'")


if __name__ == "__main__":
    main()
