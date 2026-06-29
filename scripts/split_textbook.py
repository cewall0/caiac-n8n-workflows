#!/usr/bin/env python3
"""
Split a Word .docx textbook by Heading 1 chapters, export each as PDF.

Usage:
    python3 split_textbook.py <input.docx> <output_dir>
    python3 split_textbook.py --pdf-only <output_dir>

Requirements:
    pip install lxml docx2pdf

Notes:
    - Uses system unzip to extract the source .docx (tolerates Word's
      non-standard CRC checksums that Python's zipfile rejects).
    - docx2pdf uses Microsoft Word on Mac for PDF export — preserves all
      formatting, embedded ChemDraw structures, and images exactly.
    - Output filenames: "01_Bonding_and_Structure.pdf", etc.
    - Any chapter flagged >100 pages must be split further before uploading
      (Docling limit in the admin ingest workflow).
"""

import re
import sys
import copy
import shutil
import subprocess
import tempfile
import zipfile
from pathlib import Path

try:
    from lxml import etree
except ImportError:
    print("ERROR: lxml not installed. Run: pip install lxml")
    sys.exit(1)

W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
W = "{%s}" % W_NS

HEADING1_STYLES = {"heading1", "1", "h1", "titre1", "berschrift1"}

HUGE_PARSER = etree.XMLParser(huge_tree=True, resolve_entities=False, recover=True)


def get_style(para):
    pPr = para.find(f"{W}pPr")
    if pPr is None:
        return ""
    pStyle = pPr.find(f"{W}pStyle")
    if pStyle is None:
        return ""
    return pStyle.get(f"{W}val", "")


def get_text(elem):
    return "".join(t.text or "" for t in elem.iter(f"{W}t"))


def is_heading1(para):
    style = get_style(para).lower().replace(" ", "").replace("_", "")
    return style in HEADING1_STYLES


def slugify(text, maxlen=60):
    text = re.sub(r"[^\w\s]", "", text)
    text = re.sub(r"\s+", "_", text.strip())
    return text[:maxlen].rstrip("_")


def extract_docx(docx_path, dest_dir):
    """Extract .docx using system unzip (tolerant of Word's CRC quirks)."""
    result = subprocess.run(
        ["unzip", "-o", str(docx_path), "-d", str(dest_dir)],
        capture_output=True,
        text=True,
    )
    # unzip returns 1 for warnings (like CRC mismatches) but still extracts
    if result.returncode > 1:
        print(f"WARNING: unzip exited {result.returncode}: {result.stderr.strip()}")
    return dest_dir


def rezip_dir(src_dir, out_path):
    """Zip a directory tree into a .docx file."""
    src_dir = Path(src_dir)
    with zipfile.ZipFile(out_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for file_path in sorted(src_dir.rglob("*")):
            if file_path.is_file():
                zf.write(file_path, file_path.relative_to(src_dir))


def split_docx(docx_path, output_dir):
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    print(f"Reading {Path(docx_path).name} ...")

    with tempfile.TemporaryDirectory() as tmpdir:
        src_dir = Path(tmpdir) / "src"
        extract_docx(docx_path, src_dir)

        doc_xml_path = src_dir / "word" / "document.xml"
        if not doc_xml_path.exists():
            print("ERROR: word/document.xml not found — is this a valid .docx?")
            return []

        print("Parsing document XML...")
        root = etree.fromstring(doc_xml_path.read_bytes(), HUGE_PARSER)
        body = root.find(f"{W}body")
        if body is None:
            print("ERROR: could not find document body.")
            return []

        children = list(body)

        # Find Heading 1 chapter boundaries
        chapters = []
        for i, child in enumerate(children):
            if child.tag == f"{W}p" and is_heading1(child):
                text = get_text(child).strip()
                if text:
                    chapters.append({"idx": i, "title": text})

        if not chapters:
            print("\nNo Heading 1 paragraphs found.")
            print("\nStyles seen in the first 80 paragraphs:")
            seen = set()
            for child in children[:80]:
                if child.tag == f"{W}p":
                    s = get_style(child)
                    t = get_text(child)[:50]
                    if s and s not in seen:
                        seen.add(s)
                        print(f"  style='{s}'  sample='{t}'")
            print("\nAdd your heading style name to HEADING1_STYLES in this script.")
            return []

        # Preserve document-level section properties (page size, margins, etc.)
        sect_pr = next(
            (c for c in reversed(children) if c.tag == f"{W}sectPr"), None
        )

        print(f"\nFound {len(chapters)} chapters:\n")
        for i, ch in enumerate(chapters):
            end = chapters[i + 1]["idx"] if i + 1 < len(chapters) else len(children)
            print(f"  {i+1:02d}. {ch['title'][:72]}  ({end - ch['idx']} elements)")

        print(f"\nSplitting into {len(chapters)} files...")
        docx_paths = []

        for i, ch in enumerate(chapters):
            start = ch["idx"]
            end = chapters[i + 1]["idx"] if i + 1 < len(chapters) else len(children)

            # Build new body with just this chapter's elements
            new_root = copy.deepcopy(root)
            new_body = new_root.find(f"{W}body")
            for child in list(new_body):
                new_body.remove(child)
            for elem in children[start:end]:
                new_body.append(copy.deepcopy(elem))
            if sect_pr is not None:
                new_body.append(copy.deepcopy(sect_pr))

            new_doc_xml = etree.tostring(
                new_root,
                xml_declaration=True,
                encoding="UTF-8",
                standalone=True,
            )

            # Copy the full source dir (preserves media, styles, fonts, rels)
            # then overwrite document.xml with the chapter-only version
            ch_dir = Path(tmpdir) / f"ch{i+1:02d}"
            shutil.copytree(src_dir, ch_dir)
            (ch_dir / "word" / "document.xml").write_bytes(new_doc_xml)

            filename = f"{i+1:02d}_{slugify(ch['title'])}"
            out_path = output_dir / f"{filename}.docx"
            rezip_dir(ch_dir, out_path)
            docx_paths.append(out_path)
            print(f"  {out_path.name}")

            # Clean up chapter temp dir to keep disk usage manageable
            shutil.rmtree(ch_dir)

    return docx_paths


def convert_to_pdf(docx_paths, output_dir):
    output_dir = Path(output_dir)

    try:
        from docx2pdf import convert
    except ImportError:
        print("\ndocx2pdf not installed. Run: pip install docx2pdf")
        print("Or re-run with --pdf-only after installing.")
        return

    print(f"\nConverting {len(docx_paths)} files to PDF via Word...")
    print("(Word will open briefly in the background — this is normal)\n")

    warnings = []
    for p in docx_paths:
        pdf_path = output_dir / (p.stem + ".pdf")
        try:
            convert(str(p), str(pdf_path))
            est_pages = max(1, round(pdf_path.stat().st_size / 75_000))
            flag = "  ⚠ MAY EXCEED 100-PAGE LIMIT" if est_pages > 100 else ""
            print(f"  {pdf_path.name}  (~{est_pages}p){flag}")
            if flag:
                warnings.append(pdf_path.name)
        except Exception as e:
            print(f"  ERROR {p.name}: {e}")

    if warnings:
        print(f"\n⚠  These chapters may exceed Docling's 100-page limit:")
        for w in warnings:
            print(f"   {w}")
        print("   Split them manually before uploading to the admin dashboard.")
    else:
        print("\nAll chapters within the 100-page limit. Ready to upload.")

    print(f"\nPDF files are in:\n  {output_dir}/")


def pdf_only(output_dir):
    docx_paths = sorted(Path(output_dir).glob("*.docx"))
    if not docx_paths:
        print(f"No .docx files found in {output_dir}")
        return
    convert_to_pdf(docx_paths, output_dir)


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)

    if sys.argv[1] == "--pdf-only":
        pdf_only(sys.argv[2])
    else:
        paths = split_docx(sys.argv[1], sys.argv[2])
        if paths:
            convert_to_pdf(paths, sys.argv[2])
