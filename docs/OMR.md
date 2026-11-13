# OMR (answer sheet recognition)

## Flow

1. **Answer key** (central admin, *OMR → Cavab açarları*): enter A–E answers directly
   (touch choices or paste a sequential list), or pick active questions of the exam.
   Each question has 1–1000 points. Direct answers do not require question bank entries.
   The key is an immutable, versioned snapshot (answers, points,
   penalties for wrong / blank / multiple marks, floor at zero) with a digest.
2. **Answer sheet** (*OMR → Vərəqlər*): issued for a paid ticket with a
   candidate. The A4 PDF (template `hilal-a4-v1`) carries alignment markers, a
   QR code with a random 256-bit sheet token, and 1–150 questions × 2–5 options.
3. **Scan upload** (*OMR → Skan yükləmə*): PDF/PNG/JPEG, ≤ 4 files, ≤ 25 MB each,
   50 MB per request, 240 uploads per user per hour. Originals are stored on the
   `omr_data` volume and are downloadable for comparison.
   The web form handles one file at a time and supports live rear-camera capture,
   native phone-camera capture, and gallery/file selection. Live capture preserves
   the entire frame and produces JPEG at up to 2560 pixels on the longer side.
   Closing the camera, leaving the page or hiding the browser stops its tracks.
   On touch devices automatic capture is on by default: a frame with a maximum
   side of 480 px is sampled every 200 ms. Four marker-shaped components must form
   a sufficiently large page rectangle, and the view must remain adequately lit
   and steady for six frames. This is a framing aid, not ArUco or QR authentication;
   the worker verifies marker IDs and sheet identity. Choose the exam first.
   A captured photo is submitted automatically; successful scans cannot be submitted
   again accidentally. “Növbəti kartı skan et” opens the camera for the next sheet.
   Browser uploads resize large phone photos to a maximum side of 2560 px without
   cropping the page. The original selected file must still fit the 25 MB limit.
4. **Recognition** (worker, bounded subprocess): rasterise → detect markers →
   perspective/rotation correction (0/90/180/270° and skew) → read QR → measure
   bubble fill ratios → classify each answer.
5. **Binding and scoring** (API): the sheet token must belong to the same exam
   and an authorised branch; ticket/candidate must be unchanged, not cancelled
   and paid. Scores are computed in integer thousandths.
6. **Review queue**: anything doubtful goes to `REVIEW`; a person decides.
7. **Publication**: see [OPERATIONS.md](OPERATIONS.md#results-publication).

## What goes to manual review

| Case | Flag |
| --- | --- |
| Faint / partial mark, confidence < 0.85 | `UNCERTAIN`, `LOW_CONFIDENCE` |
| Two or more marks on one question | `MULTIPLE` |
| Sheet with no marks at all | `ALL_BLANK` |
| Blurred image (Laplacian variance < 25) | `IMAGE_BLURRED` |
| Markers missing/duplicated, page cropped | `ALIGNMENT_MARKERS_MISSING_OR_DUPLICATED`, `PAGE_CROPPED` |
| QR unreadable or unknown sheet | `IDENTIFIER_REQUIRED`, `IDENTITY_NOT_AUTHORIZED_FOR_EXAM` |
| Ticket/candidate changed, cancelled or unpaid | `TICKET_IDENTITY_OR_STATUS_CHANGED` |
| Key and template disagree | `TEMPLATE_KEY_MISMATCH` |

A page without a verified QR identity can never be finalised by hand: the
sheet must be re-scanned. The same sheet scanned again is stored as
`DUPLICATE` and never replaces the first result.

Manual review records the reviewer, time, changed questions and a written
reason; the recognised answers are preserved next to the corrected ones.
The reviewer can open an authorized image inline, filter uncertain answers and
confirm an accurate scan without inventing a correction. Unresolved uncertain
answers still block confirmation on both client and server.

## Publication and candidate answers

`/dashboard/results` shows each exam's readiness, processing and review counts,
with links to its scans and exports. Publication still requires a cleared queue.
The public `/results` page requires a ticket reference and candidate number.
Only published, completed results reveal the candidate's choices, correct answers
from the sheet's immutable key, per-question points and scoring rules. Private
identity fields, scan originals and review notes are never included. Answer filters
affect the screen; printing includes the complete answer breakdown. Historical
score-only records remain readable without fabricated answer details.

## Scanning guidelines

* Print sheets at 100 % (no scaling), black on white A4.
* Scanner: 200–300 dpi, greyscale or colour, PDF or PNG. Phone photos work
  when the whole page including the four corner markers is visible, flat and
  sharp.
* Candidates fill bubbles completely with a dark pen; corrections cause
  `UNCERTAIN`/`MULTIPLE` and need review.
* [Live camera access requires a secure context and camera permission](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia).
  Use HTTPS on phones. Native photo capture and file selection remain available
  when live access fails. HEIC is not supported; use live capture or export JPEG.
* The worker limits image uploads to 20 million pixels; the web form resizes larger
  JPEG/PNG photos before upload. An unknown or unverified QR never
  grants branch staff access to the original or recognised answers. Their upload
  response contains only processing status so they can retry or ask a central
  administrator to inspect it. A failed worker response is never shown as success.

## Tests and fixtures

`services/omr-worker/tests/fixtures/` holds committed scans: `clean.png`,
`blurry.jpg`, `rotated.jpg` (180° + 4° tilt on a larger bed),
`double_marked.png`, `blank.png`, the expected answers and a worker-output
snapshot that `apps/api/src/omr/omr.fixture.unit.spec.ts` scores. Regenerate
with `PYTHONPATH=. python tests/fixtures/generate.py` after template changes.

Run the worker tests on Linux or in the worker image — `RLIMIT_AS` limits used
by the subprocess supervisor are not available on macOS:

```bash
docker build -t hilal-omr-worker services/omr-worker
docker run --rm -v "$PWD/services/omr-worker":/src -w /src -e PYTHONPATH=/src --user 0 \
  hilal-omr-worker sh -c "pip install -q -r requirements-dev.txt && python -m pytest -q"
```

## Known limits

* Recognition is synchronous per request (worker timeout 110 s); there is no
  background queue yet.
* Only template `hilal-a4-v1`; up to 150 questions and 5 options.
* Fixtures are synthetic renders, not photos of real printed sheets. Validate
  with a batch of real scans from each branch printer/scanner before the first
  live exam.
