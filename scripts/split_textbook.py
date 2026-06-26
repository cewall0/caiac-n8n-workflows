#!/usr/bin/env python3
"""
Split a Word .docx textbook by Heading 1 chapters, export each as PDF.

Usage:
    python3 split_textbook.py <input.docx> <output_dir>

Requirements:
    pip install python-docx docx2pdf

Notes:
    - docx2pdf uses Microsoft Word on Mac for PDF export, preserving all
      formatting, embedded ChemDraw structures, and images exactly.
    - Output filenames are numbered and slugified from the chapter title,
      e.g. "01_Introduction_to_Organic_Chemistry.pdf"
    - Files >100 pages will trigger a warning (Docling limit in the admin
      ingest workflow). Split those chapters further before uploading.
"""

import sys
import re
import copy
from pathlib import Path

try:
    from docx import Document
    from docx.oxml.ns import qn
except ImportError:
    print("ERROR: python-docx not installed. Run: pip install python-docx")
    sys.exit(1)


# Heading 1 style names Word uses internally (varies by locale/template)
HEADING1_STYLES = {"heading1", "heading 1", "1", "h1", "titre1", "überschrift1"}


def get_para_style(para_elem):
    pPr = para_elem.find(qn("w:pPr"))
    if pPr is None:
        return ""
    pStyle = pPr.find(qn("w:pStyle"))
    if pStyle is None:
        return ""
    return pStyle.get(qn("w:val"), "")


def get_para_text(para_elem):
    return "".join(t.text or "" for t in para_elem.iter(qn("w:t")))


def is_heading1(para_elem):
    style = get_para_style(para_elem).lower().replace("_", "")
    return style in HEADING1_STYLES


def slugify(text, maxlen=60):
    text = re.sub(r"[^\w\s]", "", text)
    text = re.sub(r"\s+", "_", text.strip())
    return text[:maxlen].rstrip("_")


def estimate_pages(docx_path):
    """Rough page estimate from file size (matches Docling check in n8n)."""
    size_bytes = Path(docx_path).stat().st_size
    return max(1, round(size_bytes / 75000))


def split_docx(docx_path, output_dir):
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    doc = Document(docx_path)
    body = doc.element.body
    children = list(body)

    # Locate Heading 1 paragraph indices
    chapters = []
    for i, child in enumerate(children):
        if child.tag == qn("w:p") and is_heading1(child):
            text = get_para_text(child).strip()
            if text:
                chapters.append({"idx": i, "title": text})

    if not chapters:
        print("No Heading 1 paragraphs found.\n")
        print("Styles present in the first 60 paragraphs:")
        for child in children[:60]:
            if child.tag == qn("w:p"):
                s = get_para_style(child)
                t = get_para_text(child)[:50]
                if s:
                    print(f"  style='{s}'  text='{t}'")
        print("\nUpdate HEADING1_STYLES in this script to match your heading style name.")
        return []

    print(f"Found {len(chapters)} chapters:\n")
    for i, ch in enumerate(chapters):
        end = chapters[i + 1]["idx"] if i + 1 < len(chapters) else len(children)
        elem_count = end - ch["idx"]
        print(f"  {i+1:02d}. {ch['title'][:70]}  ({elem_count} elements)")

    # Find the document-level sectPr (last child) to preserve page setup
    sect_pr = None
    for child in reversed(children):
        if child.tag == qn("w:sectPr"):
            sect_pr = child
            break

    print(f"\nSplitting into {len(chapters)} .docx files...")
    docx_paths = []

    for i, ch in enumerate(chapters):
        ch_num = i + 1
        start = ch["idx"]
        end = chapters[i + 1]["idx"] if i + 1 < len(chapters) else len(children)

        # Copy the full document (preserves styles, fonts, media relationships)
        new_doc = Document(docx_path)
        new_body = new_doc.element.body

        # Clear body
        for child in list(new_body):
            new_body.remove(child)

        # Insert this chapter's elements
        for elem in children[start:end]:
            new_body.append(copy.deepcopy(elem))

        # Re-append page/section properties
        if sect_pr is not None:
            new_body.append(copy.deepcopy(sect_pr))

        filename = f"{ch_num:02d}_{slugify(ch['title'])}"
        out_path = output_dir / f"{filename}.docx"
        new_doc.save(out_path)
        docx_paths.append(out_path)
        print(f"  Saved {out_path.name}")

    return docx_paths


def convert_to_pdf(docx_paths, output_dir):
    output_dir = Path(output_dir)

    try:
        from docx2pdf import convert
    except ImportError:
        print("\ndocx2pdf not installed. Run: pip install docx2pdf")
        print("Then re-run with --pdf-only to convert the saved .docx files.")
        return

    print(f"\nConverting {len(docx_paths)} files to PDF via Word (this may take a few minutes)...")
    warnings = []

    for p in docx_paths:
        pdf_path = output_dir / (p.stem + ".pdf")
        try:
            convert(str(p), str(pdf_path))
            size_mb = pdf_path.stat().st_size / 1_048_576
            est_pages = round(size_mb * 1_048_576 / 75_000)
            flag = "  ⚠ OVER 100-PAGE LIMIT" if est_pages > 100 else ""
            print(f"  {pdf_path.name}  (~{est_pages}p, {size_mb:.1f}MB){flag}")
            if flag:
                warnings.append(pdf_path.name)
        except Exception as e:
            print(f"  ERROR converting {p.name}: {e}")

    if warnings:
        print(f"\n⚠  These chapters may exceed Docling's 100-page limit:")
        for w in warnings:
            print(f"   {w}")
        print("   Split them further or use /opt/caiac/ingest.py directly.")
    else:
        print("\nAll chapters are within the 100-page limit.")

    print(f"\nDone. Upload the PDF files from:\n  {output_dir}/")


def pdf_only(output_dir):
    """Convert any .docx files already in output_dir to PDF."""
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
        docx_path = sys.argv[1]
        output_dir = sys.argv[2]
        docx_paths = split_docx(docx_path, output_dir)
        if docx_paths:
            convert_to_pdf(docx_paths, output_dir)
