#!/usr/bin/env python3
"""
Split Organic Chemistry by Wallace PDF into individual chapter PDFs.

Usage:
    python3 split_pdf_chapters.py <input.pdf> <output_dir>
"""

import sys
from pathlib import Path
from pypdf import PdfReader, PdfWriter

# Chapter start pages (textbook page numbers) + 24 offset = PDF page number
# Parsed from the book's Table of Contents
CHAPTERS = [
    (0,  "To_the_Student_About_Author",          1),
    (1,  "Periodic_Table_and_Trends",           25),
    (2,  "Bonding_and_Structure",                35),
    (3,  "Mass_Spectrometry_Infrared_Spectroscopy", 87),
    (4,  "Resonance",                           118),
    (5,  "Acids_and_Bases",                     136),
    (6,  "Alkanes",                             154),
    (7,  "Stereochemistry",                     178),
    (8,  "Organic_Reaction_Basics",             203),
    (9,  "Alkyl_Halides",                       237),
    (10, "Alkenes_Alkynes",                     286),
    (11, "Alkene_Alkyne_Reactions",             302),
    (12, "Nuclear_Magnetic_Resonance_NMR",      353),
    (13, "Alcohols",                            381),
    (14, "Alcohol_Reactions",                   410),
    (15, "Ethers_Epoxides_Sulfides",            434),
    (16, "Carbonyl_Compounds",                  456),
    (17, "Carbonyl_Reactions",                  485),
    (18, "Enolates",                            505),
    (19, "Conjugated_Alkenes",                  525),
    (20, "Aromatic_Compounds",                  563),
    (21, "Aromatic_Compound_Reactions",         584),
    (22, "Amines_and_Nitriles",                 625),
    (23, "Answers_to_Exercises",                650),
]


def split(pdf_path, output_dir):
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    reader = PdfReader(str(pdf_path))
    total = len(reader.pages)
    print(f"Source: {Path(pdf_path).name}  ({total} pages)\n")

    for i, (ch_num, title, start_pdf) in enumerate(CHAPTERS):
        # End = start of next chapter - 1, or last page for final chapter
        if i + 1 < len(CHAPTERS):
            end_pdf = CHAPTERS[i + 1][2] - 1
        else:
            end_pdf = total

        writer = PdfWriter()
        for pg in range(start_pdf - 1, end_pdf):   # pypdf is 0-indexed
            writer.add_page(reader.pages[pg])

        filename = f"{ch_num:02d}_{title}.pdf"
        out_path = output_dir / filename
        with open(out_path, "wb") as f:
            writer.write(f)

        page_count = end_pdf - start_pdf + 1
        flag = "  ⚠ may exceed 100-page limit" if page_count > 100 else ""
        print(f"  {filename}  ({page_count} pages){flag}")

    print(f"\nDone. {len(CHAPTERS)} chapter PDFs saved to:\n  {output_dir}/")


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)
    split(sys.argv[1], sys.argv[2])
