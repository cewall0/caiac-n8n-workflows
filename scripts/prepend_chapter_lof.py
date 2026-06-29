#!/usr/bin/env python3
"""
Prepend a per-chapter List of Figures page to each chapter PDF.

Parses the book's List of Figures from the full PDF front matter, then for each
chapter PDF generates a clean text page containing only that chapter's figures
and prepends it. This helps the AI retriever match student questions about
figures to the correct chapter content.

Usage:
    python3 prepend_chapter_lof.py <full_book.pdf> <chapters_dir>

chapters_dir should contain files like 07_Stereochemistry.pdf (from split_pdf_chapters.py).
Output is written in-place (originals are overwritten with the prepended version).
"""

import re
import sys
import io
from pathlib import Path
from pypdf import PdfReader, PdfWriter
from fpdf import FPDF


LOF_PDF_PAGES = range(18, 24)   # PDF pages xviii–xxiii (1-indexed)


def parse_lof(pdf_path):
    """Return {chapter_num: [(fig_id, caption), ...]} from the book's LOF."""
    reader = PdfReader(str(pdf_path))
    raw = ""
    for i in LOF_PDF_PAGES:
        raw += (reader.pages[i - 1].extract_text() or "") + "\n"

    entries = {}
    # Match lines like: "Figure 7.11  A polarimeter  ....  170"
    # Capture figure id (N.M) and description (strip trailing dots + page number)
    for m in re.finditer(
        r'Figure\s+(\d+)\.(\d+)\s{1,10}(.+?)(?:\s+\.{2,}\s*\d+\s*)?$',
        raw, re.MULTILINE
    ):
        ch = int(m.group(1))
        if ch == 0:
            continue
        fig_num = f"{m.group(1)}.{m.group(2)}"
        caption = re.sub(r'\s+', ' ', m.group(3)).strip()
        caption = re.sub(r'\.+\s*\d*\s*$', '', caption).strip()
        entries.setdefault(ch, []).append((fig_num, caption))

    return entries


def safe(text):
    """Strip characters that can't be encoded in latin-1 (fpdf core fonts)."""
    return text.encode("latin-1", errors="replace").decode("latin-1")


def make_lof_pdf(chapter_num, title, figures):
    """Return bytes of a single-page PDF listing the chapter's figures."""
    pdf = FPDF()
    pdf.add_page()
    pdf.set_margins(20, 20, 20)
    usable_w = pdf.w - pdf.l_margin - pdf.r_margin  # ~170 mm

    # Header
    pdf.set_font("Helvetica", "B", 13)
    header = safe(f"Chapter {chapter_num}. {title.replace('_', ' ')} - List of Figures")
    pdf.cell(0, 8, header, new_x="LMARGIN", new_y="NEXT")
    pdf.ln(3)

    # Entries
    id_col = 24  # mm for "Figure N.NN"
    cap_col = usable_w - id_col
    for fig_id, caption in figures:
        x_before = pdf.get_x()
        y_before = pdf.get_y()
        pdf.set_font("Helvetica", "B", 9)
        pdf.cell(id_col, 6, safe(f"Figure {fig_id}"), new_x="RIGHT", new_y="TOP")
        pdf.set_font("Helvetica", "", 9)
        pdf.multi_cell(cap_col, 6, safe(caption))
        # If multi_cell moved us left (new line), align next row from left margin
        if pdf.get_x() < x_before + id_col:
            pass  # multi_cell already moved to next line

    return pdf.output()


def prepend(lof_bytes, chapter_pdf_path):
    """Prepend the LOF page to the chapter PDF, overwriting in place."""
    lof_reader = PdfReader(io.BytesIO(lof_bytes))
    ch_reader  = PdfReader(str(chapter_pdf_path))

    writer = PdfWriter()
    for page in lof_reader.pages:
        writer.add_page(page)
    for page in ch_reader.pages:
        writer.add_page(page)

    with open(chapter_pdf_path, "wb") as f:
        writer.write(f)


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)

    book_pdf   = sys.argv[1]
    chapters_dir = Path(sys.argv[2])

    print("Parsing List of Figures from book...")
    lof = parse_lof(book_pdf)
    total_entries = sum(len(v) for v in lof.values())
    print(f"  Found {total_entries} figure entries across {len(lof)} chapters\n")

    chapter_pdfs = sorted(chapters_dir.glob("[0-9][0-9]_*.pdf"))
    if not chapter_pdfs:
        print(f"No chapter PDFs found in {chapters_dir}")
        sys.exit(1)

    for pdf_path in chapter_pdfs:
        m = re.match(r'^(\d+)_(.+)\.pdf$', pdf_path.name)
        if not m:
            continue
        ch_num = int(m.group(1))
        title  = m.group(2)

        figures = lof.get(ch_num, [])
        if not figures:
            print(f"  Chapter {ch_num:2d}: no figures found in LOF — skipping")
            continue

        lof_bytes = make_lof_pdf(ch_num, title, figures)
        prepend(lof_bytes, pdf_path)
        print(f"  Chapter {ch_num:2d}: prepended {len(figures)} figure entries → {pdf_path.name}")

    print(f"\nDone. All chapter PDFs updated in:\n  {chapters_dir}/")


if __name__ == "__main__":
    main()
