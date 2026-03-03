# Future Work: PDF Page Classification Improvements

The current classifier in `src/pdf-analyzer.ts` uses a binary text/render decision
based on three hard-coded thresholds: image count (> 0), text length (< 50 chars),
and vector path count (> 15). This works well for common cases but has known blind
spots -- particularly with math-heavy LaTeX PDFs, scanned documents, and pages
where visual content is embedded in ways that do not produce obvious operator-list
signals.

This document describes four improvements, ordered from most immediately useful to
most infrastructure-heavy.

---

## 1. Confidence Scoring

**What it does:** Replace the binary `"text" | "render"` classification with a
continuous confidence score (0--1) reflecting how certain we are that text
extraction captures the full page content. Pages below a configurable threshold
(default 0.7) get rendered as images. This eliminates the fragile if/else chain
and makes the system tunable without code changes.

**Why it matters:** The current classifier has no middle ground. A page with 14
vector paths is "text" while 16 paths is "render" -- a cliff edge. A confidence
score lets callers choose their own precision/recall tradeoff and makes threshold
tuning data-driven.

**Signals to incorporate:**

| Signal                      | Weight direction       | Rationale                                    |
| --------------------------- | ---------------------- | -------------------------------------------- |
| Image count                 | High confidence render | Any embedded image is visual content         |
| Path sub-op complexity      | Proportional           | More path ops = more complex vector graphics |
| Text length / page area     | Inverse                | Low text density suggests figures            |
| Garbled character ratio     | Proportional           | Extraction quality is poor                   |
| Single-character word ratio | Proportional           | Math symbols extract as isolated chars       |
| Font count / diversity      | Proportional           | Many fonts suggest complex layout            |

**Code sketch:**

```typescript
// src/pdf-analyzer.ts

export interface ClassificationSignals {
  imageCount: number;
  pathCount: number;
  pathSubOpCount: number; // total args across all constructPath ops
  textLength: number;
  pageArea: number; // width * height in points
  garbledCharRatio: number; // control/replacement chars over total
  singleCharWordRatio: number; // single-char words over total words
  fontCount: number;
}

export interface PageClassification {
  pageNum: number;
  type: "text" | "render";
  confidence: number; // 0 = certainly needs render, 1 = certainly text
  reason: string;
  textContent: string;
  signals: ClassificationSignals;
}

const DEFAULT_CONFIDENCE_THRESHOLD = 0.7;

export function computeConfidence(s: ClassificationSignals): number {
  // Images are a hard override -- any embedded image means render
  if (s.imageCount > 0) return 0.0;

  let score = 1.0;

  // Text density: chars per point^2 of page area
  const textDensity = s.pageArea > 0 ? s.textLength / s.pageArea : 0;
  if (textDensity < 0.0001)
    score -= 0.4; // very sparse
  else if (textDensity < 0.001) score -= 0.15; // moderately sparse

  // Vector path complexity
  if (s.pathCount > 50) score -= 0.35;
  else if (s.pathCount > 15) score -= 0.2;
  else if (s.pathCount > 5) score -= 0.05;

  // Garbled text signals bad extraction
  if (s.garbledCharRatio > 0.1) score -= 0.3;
  else if (s.garbledCharRatio > 0.03) score -= 0.1;

  // Single-char words suggest math symbols
  if (s.singleCharWordRatio > 0.4) score -= 0.2;
  else if (s.singleCharWordRatio > 0.2) score -= 0.1;

  // Font diversity suggests complex layout
  if (s.fontCount > 8) score -= 0.1;

  return Math.max(0, Math.min(1, score));
}

function classifyWithConfidence(
  signals: ClassificationSignals,
  pageNum: number,
  text: string,
  threshold = DEFAULT_CONFIDENCE_THRESHOLD,
): PageClassification {
  const confidence = computeConfidence(signals);
  return {
    pageNum,
    type: confidence >= threshold ? "text" : "render",
    confidence,
    reason: buildReason(signals, confidence, threshold),
    textContent: text,
    signals,
  };
}
```

**Integration:** The `analyzePdf` function signature stays the same.
`PageClassification` gains `confidence` and `signals` fields. Callers that only
check `.type` continue to work unchanged. The `RenderPdfSmartSchema` could gain
an optional `confidenceThreshold` parameter.

**Effort:** ~2 hours implementation, ~1 hour testing. No new dependencies.

---

## 2. Garbled Text Detection for LaTeX Math

**What it does:** Detect when pdfjs text extraction produces garbled output --
a common failure mode with older LaTeX PDFs compiled with pdflatex before
`\pdfgentounicode=1` became standard (~2018). When extraction quality is low,
escalate to render regardless of other signals.

**Why it matters:** LaTeX PDFs are a primary use case for this tool. Papers
from arxiv compiled before 2018 frequently use Type1/Type3 math fonts (CMMI,
CMSY, CMEX, MSBM) that lack proper Unicode mappings. Integral signs extract as
"R", Greek letters as random Latin characters, and Type3 bitmap fonts produce
empty strings. The current classifier sees "lots of text" and marks these pages
as text-extractable, but the extracted content is useless.

**Detection approach:**

```typescript
// src/pdf-analyzer.ts

/** Characters that signal garbled extraction. */
const GARBLED_CHARS = /[\u0000-\u0008\u000E-\u001F\uFFFD\uFFFE\uFFFF]/g;

/** Font name patterns for TeX math fonts with known extraction issues. */
const TEX_MATH_FONT_PATTERNS = [
  /^CM[A-Z]{2,}/, // CMMI, CMSY, CMEX, CMR (Computer Modern)
  /^MSB[A-Z]/, // MSBM (AMS symbols)
  /^EUR[A-Z]/, // Euler math fonts
  /^RSFS/, // Ralph Smith Formal Script
  /^STIX/, // STIX fonts (better, but older versions have issues)
];

export interface TextQuality {
  garbledRatio: number;
  singleCharWordRatio: number;
  hasMathFonts: boolean;
  mathFontNames: string[];
  extractionReliable: boolean;
}

export function assessTextQuality(
  text: string,
  fontNames: string[],
): TextQuality {
  const garbledMatches = text.match(GARBLED_CHARS) ?? [];
  const garbledRatio =
    text.length > 0 ? garbledMatches.length / text.length : 0;

  const words = text.split(/\s+/).filter((w) => w.length > 0);
  const singleCharWords = words.filter((w) => w.length === 1);
  const singleCharWordRatio =
    words.length > 0 ? singleCharWords.length / words.length : 0;

  const mathFontNames = fontNames.filter((name) =>
    TEX_MATH_FONT_PATTERNS.some((pat) => pat.test(name)),
  );
  const hasMathFonts = mathFontNames.length > 0;

  // Extraction is unreliable if:
  // - More than 5% garbled characters, OR
  // - More than 40% single-char words AND math fonts present, OR
  // - More than 60% single-char words regardless of fonts
  const extractionReliable = !(
    garbledRatio > 0.05 ||
    (singleCharWordRatio > 0.4 && hasMathFonts) ||
    singleCharWordRatio > 0.6
  );

  return {
    garbledRatio,
    singleCharWordRatio,
    hasMathFonts,
    mathFontNames,
    extractionReliable,
  };
}
```

**Integration with classifyPage:**

```typescript
async function classifyPage(page: PDFPageProxy): Promise<PageClassification> {
  const [textContent, ops] = await Promise.all([
    page.getTextContent(),
    page.getOperatorList(),
  ]);

  // Extract font names from text content items
  const fontNames = [
    ...new Set(
      textContent.items
        .filter((item): item is TextItem => "fontName" in item)
        .map(item => item.fontName)
    ),
  ];

  const text = /* ... existing extraction ... */;
  const quality = assessTextQuality(text, fontNames);

  // If text extraction is unreliable, escalate to render
  if (!quality.extractionReliable) {
    return {
      pageNum: page.pageNumber,
      type: "render",
      reason: `unreliable text extraction (garbled: ${(quality.garbledRatio * 100).toFixed(1)}%, ` +
        `single-char words: ${(quality.singleCharWordRatio * 100).toFixed(1)}%` +
        `${quality.hasMathFonts ? `, math fonts: ${quality.mathFontNames.join(", ")}` : ""})`,
      textContent: text,
    };
  }

  // ... existing classification logic ...
}
```

**Effort:** ~3 hours implementation, ~2 hours testing (need LaTeX PDF fixtures).
No new dependencies. Pairs naturally with the confidence scoring system -- garbled
ratio and single-char word ratio feed directly into signal weights.

**Prerequisites:** Need test PDFs compiled with old pdflatex. Easiest source:
download a few pre-2018 arxiv papers.

---

## 3. Validation Corpus with Ground Truth

**What it does:** Build a curated set of PDFs with human-annotated per-page
classifications stored as JSON sidecar files. Use for automated threshold tuning,
regression detection, and edge-case coverage.

**Why it matters:** Without ground truth, every threshold change is a guess. The
current thresholds (15 paths, 50 chars) were chosen by inspection of a handful of
PDFs. A validation corpus lets us sweep parameters and measure
precision/recall/F1, catching regressions before they ship.

**Directory structure:**

```
tests/
  fixtures/
    corpus/
      README.md                     # what's in the corpus and how to add to it
      arxiv-pure-text/
        paper.pdf
        ground-truth.json
      arxiv-figures/
        paper.pdf
        ground-truth.json
      arxiv-tikz/
        paper.pdf
        ground-truth.json
      arxiv-math-heavy/
        paper.pdf
        ground-truth.json
      scanned-document/
        paper.pdf
        ground-truth.json
```

**Ground truth format:**

```typescript
// tests/fixtures/corpus/schema.ts

interface GroundTruth {
  /** Source URL or description */
  source: string;
  /** Why this PDF is in the corpus */
  category:
    | "pure-text"
    | "figures"
    | "tikz"
    | "math-heavy"
    | "scanned"
    | "slides"
    | "multi-column";
  /** Per-page expected classification */
  pages: Array<{
    pageNum: number;
    expectedType: "text" | "render";
    /** Optional notes on why this classification is correct */
    notes?: string;
  }>;
}
```

**Test runner:**

```typescript
// tests/validation/corpus-validation.test.ts

import { describe, it, expect } from "vitest";
import { analyzePdf } from "../../src/pdf-analyzer.js";
import { readdir, readFile } from "node:fs/promises";
import { resolve, join } from "node:path";

const CORPUS_DIR = resolve(import.meta.dirname, "../fixtures/corpus");

interface GroundTruth {
  source: string;
  category: string;
  pages: Array<{
    pageNum: number;
    expectedType: "text" | "render";
    notes?: string;
  }>;
}

async function loadCorpus(): Promise<
  Array<{ name: string; pdfPath: string; truth: GroundTruth }>
> {
  const entries = await readdir(CORPUS_DIR, { withFileTypes: true });
  const cases: Array<{ name: string; pdfPath: string; truth: GroundTruth }> =
    [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = join(CORPUS_DIR, entry.name);
    const truthPath = join(dir, "ground-truth.json");
    const pdfPath = join(dir, "paper.pdf");

    try {
      const raw = await readFile(truthPath, "utf-8");
      const truth = JSON.parse(raw) as GroundTruth;
      cases.push({ name: entry.name, pdfPath, truth });
    } catch {
      // Skip directories without ground truth
    }
  }

  return cases;
}

describe("corpus validation", async () => {
  const corpus = await loadCorpus();

  for (const { name, pdfPath, truth } of corpus) {
    describe(name, () => {
      it("matches ground truth classifications", async () => {
        const maxPage = Math.max(...truth.pages.map((p) => p.pageNum));
        const { classifications } = await analyzePdf(pdfPath, 1, maxPage);

        let correct = 0;
        let total = 0;
        const mismatches: string[] = [];

        for (const expected of truth.pages) {
          const actual = classifications.find(
            (c) => c.pageNum === expected.pageNum,
          );
          if (!actual) continue;
          total++;
          if (actual.type === expected.expectedType) {
            correct++;
          } else {
            mismatches.push(
              `page ${expected.pageNum}: expected ${expected.expectedType}, ` +
                `got ${actual.type} (${actual.reason})` +
                (expected.notes ? ` -- ${expected.notes}` : ""),
            );
          }
        }

        const accuracy = total > 0 ? correct / total : 0;

        // Report all mismatches in one assertion for visibility
        expect(mismatches, `accuracy: ${(accuracy * 100).toFixed(1)}%`).toEqual(
          [],
        );
      });
    });
  }
});
```

**Threshold sweep (offline script, not CI):**

```typescript
// scripts/sweep-thresholds.ts

import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

// Parameterized version of analyzePdf that accepts thresholds
// ... sweep over pathThreshold=[5,10,15,20,30], minTextChars=[20,50,100]
// ... for each combination, compute precision/recall/F1 against ground truth
// ... output best combination
```

**Recommended corpus (5--10 freely redistributable PDFs):**

1. **Pure text:** An arxiv paper with no figures (e.g., a short math proof paper)
2. **Embedded figures:** A paper with PNG/JPEG figures in the body
3. **TikZ diagrams:** A paper using TikZ/PGF for inline diagrams (vector paths)
4. **Math-heavy:** A paper dense with equations, compiled with old pdflatex
5. **Scanned document:** A scanned page (full-page raster image, no text layer)

Note: arxiv papers are typically available under CC-BY or similar licenses.
Check the license before including in the repository. Alternatively, generate
synthetic PDFs with LaTeX specifically for this purpose to avoid any licensing
concerns.

**Effort:** ~4 hours to build initial corpus and test runner. ~1 hour per
additional PDF to annotate. Ongoing: ~15 minutes per new edge case. No new
dependencies beyond the test framework already in use.

**Prerequisites:** None -- can be built immediately. Pairs well with confidence
scoring (sweep over confidence threshold in addition to signal weights).

---

## 4. Render-then-OCR Validation

**What it does:** For each page classified as "text", render it as an image, run
OCR with tesseract, and compare the OCR output against the pdfjs-extracted text.
High divergence signals that the extraction missed visual content (diagrams drawn
with unusual operators, text baked into images, or garbled font mappings).

**Why it matters:** This is the gold standard for classification validation. If
pdfjs says a page is "text content: `R dx f(x)`" but tesseract reads
"`integral dx f(x)`", we know the extraction is garbled and the page should be
rendered. It catches failure modes that no heuristic can anticipate.

**Metrics:**

| Metric                        | What it measures                                       |
| ----------------------------- | ------------------------------------------------------ |
| Word-level Jaccard similarity | Overall overlap between extraction and OCR             |
| Content coverage ratio        | Words in OCR but not in extraction (missed content)    |
| Structural completeness       | Whether theorem/proof/definition markers are preserved |

**Code sketch:**

```typescript
// src/ocr-validator.ts

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

const execFileAsync = promisify(execFile);

export interface OcrComparison {
  pageNum: number;
  jaccardSimilarity: number; // 0-1, word-level
  contentCoverageRatio: number; // words in OCR but missing from extraction
  structuralMarkers: {
    inExtraction: string[];
    inOcr: string[];
    missing: string[]; // in OCR but not extraction
  };
  recommendation: "text" | "render";
}

const STRUCTURAL_MARKERS = [
  "theorem",
  "lemma",
  "proposition",
  "corollary",
  "proof",
  "definition",
  "remark",
  "example",
  "figure",
  "table",
  "algorithm",
];

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 0),
  );
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1.0;

  let intersection = 0;
  for (const word of a) {
    if (b.has(word)) intersection++;
  }

  const union = a.size + b.size - intersection;
  return union > 0 ? intersection / union : 0;
}

function contentCoverage(extraction: Set<string>, ocr: Set<string>): number {
  if (ocr.size === 0) return 0;

  let missingFromExtraction = 0;
  for (const word of ocr) {
    if (!extraction.has(word)) missingFromExtraction++;
  }

  return missingFromExtraction / ocr.size;
}

function findStructuralMarkers(text: string): string[] {
  const lower = text.toLowerCase();
  return STRUCTURAL_MARKERS.filter((marker) => lower.includes(marker));
}

export async function ocrPage(imageBuf: Buffer): Promise<string> {
  const tmpPath = join(tmpdir(), `render-mcp-ocr-${randomUUID()}.png`);

  try {
    await writeFile(tmpPath, imageBuf);

    const { stdout } = await execFileAsync(
      "tesseract",
      [
        tmpPath,
        "stdout",
        "--psm",
        "6", // assume uniform block of text
        "-l",
        "eng",
      ],
      { maxBuffer: 10 * 1024 * 1024 },
    );

    return stdout;
  } finally {
    await unlink(tmpPath).catch(() => {});
  }
}

export function compareTexts(
  pageNum: number,
  extractedText: string,
  ocrText: string,
): OcrComparison {
  const extractionWords = tokenize(extractedText);
  const ocrWords = tokenize(ocrText);

  const jaccard = jaccardSimilarity(extractionWords, ocrWords);
  const coverage = contentCoverage(extractionWords, ocrWords);

  const extractionMarkers = findStructuralMarkers(extractedText);
  const ocrMarkers = findStructuralMarkers(ocrText);
  const missingMarkers = ocrMarkers.filter(
    (m) => !extractionMarkers.includes(m),
  );

  // Recommend render if:
  // - Jaccard similarity is below 0.5 (texts are very different), OR
  // - More than 30% of OCR content is missing from extraction, OR
  // - Structural markers are missing from extraction
  const recommendation: "text" | "render" =
    jaccard < 0.5 || coverage > 0.3 || missingMarkers.length > 0
      ? "render"
      : "text";

  return {
    pageNum,
    jaccardSimilarity: jaccard,
    contentCoverageRatio: coverage,
    structuralMarkers: {
      inExtraction: extractionMarkers,
      inOcr: ocrMarkers,
      missing: missingMarkers,
    },
    recommendation,
  };
}
```

**CI integration (validation test, not runtime):**

```typescript
// tests/validation/ocr-validation.test.ts

import { describe, it, expect } from "vitest";
import { analyzePdf } from "../../src/pdf-analyzer.js";
import { ocrPage, compareTexts } from "../../src/ocr-validator.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve } from "node:path";

const execFileAsync = promisify(execFile);
const CORPUS_DIR = resolve(import.meta.dirname, "../fixtures/corpus");

async function renderPageBuffer(
  pdfPath: string,
  page: number,
): Promise<Buffer> {
  const { stdout } = await execFileAsync(
    "pdftoppm",
    [
      "-png",
      "-r",
      "300",
      "-f",
      String(page),
      "-l",
      String(page),
      "-singlefile",
      pdfPath,
    ],
    { encoding: "buffer", maxBuffer: 50 * 1024 * 1024 },
  );
  return stdout as Buffer;
}

describe("OCR validation of text-classified pages", () => {
  it("text pages have high extraction-OCR agreement", async () => {
    const pdfPath = resolve(CORPUS_DIR, "arxiv-math-heavy/paper.pdf");
    const { classifications } = await analyzePdf(pdfPath, 1, 10);
    const textPages = classifications.filter((c) => c.type === "text");

    const results = [];
    for (const page of textPages) {
      const imageBuf = await renderPageBuffer(pdfPath, page.pageNum);
      const ocrText = await ocrPage(imageBuf);
      const comparison = compareTexts(page.pageNum, page.textContent, ocrText);
      results.push(comparison);
    }

    // Flag pages where OCR disagrees with extraction
    const disagreements = results.filter((r) => r.recommendation === "render");
    if (disagreements.length > 0) {
      console.warn("Pages where OCR suggests render instead of text:");
      for (const d of disagreements) {
        console.warn(
          `  page ${d.pageNum}: jaccard=${d.jaccardSimilarity.toFixed(2)}, ` +
            `coverage=${d.contentCoverageRatio.toFixed(2)}, ` +
            `missing markers: ${d.structuralMarkers.missing.join(", ") || "none"}`,
        );
      }
    }

    // Soft assertion: at least 80% of text pages should agree with OCR
    const agreementRate = 1 - disagreements.length / results.length;
    expect(agreementRate).toBeGreaterThanOrEqual(0.8);
  });
});
```

**Effort:** ~4 hours implementation, ~2 hours CI integration. Slow to run
(tesseract is ~1--2 seconds per page), so best as a separate CI job or nightly
check rather than part of the main test suite.

**Prerequisites:**

- `tesseract` binary installed on CI runners (`apt install tesseract-ocr` or
  `brew install tesseract`)
- Validation corpus (improvement 3) should be in place first
- Consider making OCR validation opt-in via an environment variable
  (`RUN_OCR_VALIDATION=1`) to avoid slowing down local development

---

## Implementation Order

The improvements build on each other but can be implemented independently:

1. **Confidence scoring** -- immediate value, no dependencies, directly improves
   classification quality
2. **Garbled text detection** -- addresses the most common real-world failure mode
   (LaTeX math), feeds signals into confidence scoring
3. **Validation corpus** -- needed to tune thresholds from (1) and (2) with data
   instead of intuition
4. **OCR validation** -- the most expensive but most rigorous, validates that
   (1)--(3) are actually working
