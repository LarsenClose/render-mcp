#!/usr/bin/env python3
"""
Generate a multi-page test PDF for hybrid PDF processing tests.

Pages:
  1 - Pure text (prose paragraph)
  2 - Text with an embedded raster image (a colored rectangle as PNG)
  3 - Vector diagram (lines, arrows, shapes via PDF path operators)
  4 - Another text-only page (different content)

Requires: reportlab, Pillow
"""

import io
import os
from PIL import Image as PILImage

from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.lib.colors import (
    black, red, blue, green, orange, gray, white, darkblue, darkgreen
)
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Image, PageBreak, Flowable
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER

OUTPUT_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT_PATH = os.path.join(OUTPUT_DIR, "test-multipage.pdf")


# ---------------------------------------------------------------------------
# Helper: create a small raster image in memory and return as a
# reportlab Image flowable
# ---------------------------------------------------------------------------
def make_raster_image(width_px=200, height_px=120):
    """Create a simple colored-rectangle raster PNG in memory."""
    img = PILImage.new("RGB", (width_px, height_px), color=(240, 240, 240))
    pixels = img.load()

    # Draw colored bands
    band_h = height_px // 4
    colors = [(220, 60, 60), (60, 160, 60), (60, 60, 200), (200, 160, 40)]
    for band_idx, color in enumerate(colors):
        y_start = band_idx * band_h
        y_end = (band_idx + 1) * band_h if band_idx < 3 else height_px
        for y in range(y_start, y_end):
            for x in range(width_px):
                pixels[x, y] = color

    # Draw a small white cross in the center
    cx, cy = width_px // 2, height_px // 2
    for dx in range(-15, 16):
        pixels[cx + dx, cy] = (255, 255, 255)
    for dy in range(-10, 11):
        pixels[cx, cy + dy] = (255, 255, 255)

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return buf


# ---------------------------------------------------------------------------
# Custom Flowable for vector diagram (page 3)
# ---------------------------------------------------------------------------
class VectorDiagram(Flowable):
    """Draw a simple vector diagram using PDF path operators."""

    def __init__(self, width=5 * inch, height=4 * inch):
        super().__init__()
        self.width = width
        self.height = height

    def draw(self):
        c = self.canv

        # Background rectangle with light fill
        c.setStrokeColor(black)
        c.setFillColor(white)
        c.setLineWidth(1.5)
        c.rect(0, 0, self.width, self.height, fill=1)

        # Title inside diagram
        c.setFillColor(black)
        c.setFont("Helvetica-Bold", 12)
        c.drawCentredString(self.width / 2, self.height - 20, "System Architecture Diagram")

        # --- Draw boxes ---
        box_w, box_h = 1.2 * inch, 0.6 * inch

        # Box A (top-left)
        ax, ay = 0.5 * inch, self.height - 1.2 * inch
        c.setFillColor(blue)
        c.setStrokeColor(darkblue)
        c.setLineWidth(2)
        c.roundRect(ax, ay, box_w, box_h, 6, fill=1)
        c.setFillColor(white)
        c.setFont("Helvetica-Bold", 10)
        c.drawCentredString(ax + box_w / 2, ay + box_h / 2 - 4, "Client")

        # Box B (top-right)
        bx, by = 3.2 * inch, self.height - 1.2 * inch
        c.setFillColor(green)
        c.setStrokeColor(darkgreen)
        c.roundRect(bx, by, box_w, box_h, 6, fill=1)
        c.setFillColor(white)
        c.drawCentredString(bx + box_w / 2, by + box_h / 2 - 4, "Server")

        # Box C (bottom-center)
        cx_pos, cy_pos = 1.8 * inch, 0.8 * inch
        c.setFillColor(orange)
        c.setStrokeColor(red)
        c.roundRect(cx_pos, cy_pos, box_w, box_h, 6, fill=1)
        c.setFillColor(white)
        c.drawCentredString(cx_pos + box_w / 2, cy_pos + box_h / 2 - 4, "Database")

        # --- Draw connecting lines (arrows) ---
        c.setStrokeColor(black)
        c.setLineWidth(1.5)

        # Arrow from A to B (horizontal)
        c.line(ax + box_w, ay + box_h / 2, bx, by + box_h / 2)
        # Arrowhead
        arrow_size = 8
        c.setFillColor(black)
        p = c.beginPath()
        p.moveTo(bx, by + box_h / 2)
        p.lineTo(bx - arrow_size, by + box_h / 2 + arrow_size / 2)
        p.lineTo(bx - arrow_size, by + box_h / 2 - arrow_size / 2)
        p.close()
        c.drawPath(p, fill=1)

        # Arrow from B down to C
        mid_bx = bx + box_w / 2
        mid_cy = cy_pos + box_h
        c.line(mid_bx, by, cx_pos + box_w, cy_pos + box_h)
        # Arrowhead pointing at C
        p2 = c.beginPath()
        p2.moveTo(cx_pos + box_w, cy_pos + box_h)
        p2.lineTo(cx_pos + box_w + 4, cy_pos + box_h + arrow_size)
        p2.lineTo(cx_pos + box_w - 6, cy_pos + box_h + arrow_size - 2)
        p2.close()
        c.drawPath(p2, fill=1)

        # Arrow from A down to C
        mid_ax = ax + box_w / 2
        c.line(mid_ax, ay, cx_pos, cy_pos + box_h)
        p3 = c.beginPath()
        p3.moveTo(cx_pos, cy_pos + box_h)
        p3.lineTo(cx_pos + 6, cy_pos + box_h + arrow_size - 2)
        p3.lineTo(cx_pos - 4, cy_pos + box_h + arrow_size)
        p3.close()
        c.drawPath(p3, fill=1)

        # --- Draw a dashed circle (decorative) ---
        c.setStrokeColor(gray)
        c.setDash(3, 3)
        c.setLineWidth(1)
        c.circle(self.width / 2, self.height / 2, 0.4 * inch, fill=0)
        c.setDash()  # reset

        # Label on connecting line
        c.setFillColor(red)
        c.setFont("Helvetica-Oblique", 8)
        c.drawString(2.0 * inch, ay + box_h / 2 + 8, "HTTP/JSON")

        # Legend at bottom
        c.setFillColor(black)
        c.setFont("Helvetica", 7)
        c.drawString(0.2 * inch, 0.3 * inch,
                     "Figure 1: Example architecture with vector paths, shapes, and arrows.")


# ---------------------------------------------------------------------------
# Build the PDF
# ---------------------------------------------------------------------------
def build_pdf():
    doc = SimpleDocTemplate(
        OUTPUT_PATH,
        pagesize=letter,
        topMargin=1 * inch,
        bottomMargin=1 * inch,
        leftMargin=1 * inch,
        rightMargin=1 * inch,
    )

    styles = getSampleStyleSheet()
    body_style = styles["BodyText"]
    heading_style = styles["Heading1"]

    title_style = ParagraphStyle(
        "TitleCustom",
        parent=styles["Title"],
        fontSize=18,
        alignment=TA_CENTER,
        spaceAfter=24,
    )

    caption_style = ParagraphStyle(
        "Caption",
        parent=body_style,
        fontSize=9,
        alignment=TA_CENTER,
        spaceAfter=12,
        spaceBefore=6,
        textColor=gray,
    )

    story = []

    # -----------------------------------------------------------------------
    # PAGE 1: Pure text
    # -----------------------------------------------------------------------
    story.append(Paragraph("Page 1: Text Content", title_style))
    story.append(Spacer(1, 12))

    text_paragraphs = [
        (
            "This is a test PDF fixture designed for hybrid PDF processing. "
            "This first page contains only text content with no images or "
            "vector graphics. The purpose is to verify that text extraction "
            "works correctly on pages that contain purely textual information."
        ),
        (
            "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do "
            "eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut "
            "enim ad minim veniam, quis nostrud exercitation ullamco laboris "
            "nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor "
            "in reprehenderit in voluptate velit esse cillum dolore eu fugiat "
            "nulla pariatur."
        ),
        (
            "Excepteur sint occaecat cupidatat non proident, sunt in culpa qui "
            "officia deserunt mollit anim id est laborum. Curabitur pretium "
            "tincidunt lacus. Nulla gravida orci a odio. Nullam varius, turpis "
            "et commodo pharetra, est eros bibendum elit, nec luctus magna "
            "felis sollicitudin mauris."
        ),
        (
            "Integer in mauris eu nibh euismod gravida. Duis ac tellus et "
            "risus vulputate vehicula. Donec lobortis risus a elit. Etiam "
            "tempor. Ut ullamcorper, ligula ut dictum pharetra, nisi nunc "
            "fringilla magna, in commodo elit erat nec turpis. Ut pharetra "
            "augue nec augue."
        ),
    ]
    for para_text in text_paragraphs:
        story.append(Paragraph(para_text, body_style))
        story.append(Spacer(1, 10))

    story.append(PageBreak())

    # -----------------------------------------------------------------------
    # PAGE 2: Text with embedded raster image
    # -----------------------------------------------------------------------
    story.append(Paragraph("Page 2: Text with Embedded Image", title_style))
    story.append(Spacer(1, 12))

    story.append(Paragraph(
        "This page contains text along with an embedded raster image. "
        "The image below is a PNG with colored bands and a white cross, "
        "generated programmatically. Hybrid processing should detect this "
        "page as containing visual content that cannot be fully captured "
        "by text extraction alone.",
        body_style,
    ))
    story.append(Spacer(1, 16))

    # Create the raster image and embed it
    img_buf = make_raster_image(200, 120)
    img = Image(img_buf, width=3 * inch, height=1.8 * inch)
    story.append(img)
    story.append(Paragraph("Figure: Colored bands with a centered white cross (raster PNG).", caption_style))
    story.append(Spacer(1, 12))

    story.append(Paragraph(
        "Additional text follows the image. This paragraph exists to ensure "
        "that the page has meaningful text content both above and below the "
        "embedded raster graphic. A good hybrid processor should extract all "
        "of this text while also rendering the image visually.",
        body_style,
    ))

    story.append(PageBreak())

    # -----------------------------------------------------------------------
    # PAGE 3: Vector diagram
    # -----------------------------------------------------------------------
    story.append(Paragraph("Page 3: Vector Graphics Diagram", title_style))
    story.append(Spacer(1, 12))

    story.append(Paragraph(
        "This page contains a vector diagram drawn with PDF path operators. "
        "The diagram includes rectangles, rounded rectangles, lines with "
        "arrowheads, circles, and text labels. None of this is a raster "
        "image; it is composed entirely of vector drawing commands.",
        body_style,
    ))
    story.append(Spacer(1, 12))

    story.append(VectorDiagram())
    story.append(Spacer(1, 12))

    story.append(Paragraph(
        "The diagram above should be identified by a hybrid processor as "
        "visual content that requires rendering rather than pure text "
        "extraction, even though it is not a raster image.",
        body_style,
    ))

    story.append(PageBreak())

    # -----------------------------------------------------------------------
    # PAGE 4: Another text-only page
    # -----------------------------------------------------------------------
    story.append(Paragraph("Page 4: Additional Text Content", title_style))
    story.append(Spacer(1, 12))

    story.append(Paragraph(
        "This final page is another text-only page, providing a second "
        "pure-text reference point. It helps verify that the processor "
        "correctly classifies text-only pages even after encountering "
        "pages with images and vector graphics.",
        body_style,
    ))
    story.append(Spacer(1, 10))

    story.append(Paragraph(
        "Key test expectations for hybrid processing:",
        ParagraphStyle("BoldBody", parent=body_style, fontName="Helvetica-Bold"),
    ))
    story.append(Spacer(1, 6))

    bullet_style = ParagraphStyle(
        "Bullet",
        parent=body_style,
        leftIndent=20,
        bulletIndent=10,
    )
    bullets = [
        "Pages 1 and 4 should be handled via text extraction (pdftotext or equivalent).",
        "Page 2 should be rendered as an image because it contains an embedded raster graphic.",
        "Page 3 should be rendered as an image because it contains vector paths forming a diagram.",
        "The processor should combine text and rendered images into a coherent output.",
    ]
    for bullet_text in bullets:
        story.append(Paragraph(f"\u2022 {bullet_text}", bullet_style))
        story.append(Spacer(1, 4))

    story.append(Spacer(1, 16))
    story.append(Paragraph(
        "End of test fixture. This PDF was generated programmatically using "
        "Python reportlab for testing purposes.",
        ParagraphStyle("Footer", parent=body_style, textColor=gray, fontSize=8),
    ))

    # Build
    doc.build(story)
    print(f"Generated: {OUTPUT_PATH}")
    print(f"Size: {os.path.getsize(OUTPUT_PATH)} bytes")


if __name__ == "__main__":
    build_pdf()
