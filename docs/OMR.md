# OMR (answer sheet recognition)

## Flow

1. **Answer key** (central admin, *OMR → Cavab açarları*): enter A–E answers directly
   (touch choices or paste a sequential list), or pick active questions of the exam.
   Each question has 1–1000 points. Direct answers do not require question bank entries.
   The key is an immutable, versioned snapshot (answers, points,
   penalties for wrong / blank / multiple marks, floor at zero) with a digest.
2. **Answer sheet** (*OMR → Vərəqlər*): issued for a paid ticket with a
   candidate. Enter its eight-digit work number or ticket UUID. New A4 sheets use
   `hilal-a4-v2`: four alignment markers, an opaque QR token, 1–150 questions ×
   2–5 options, and an eight-column work-number grid. Names and codes are printed
   using an embedded Unicode font. Previously issued `hilal-a4-v1` sheets remain readable.
   The on-screen sample PDF is illustrative; it is not issued to a candidate.
3. **Scan upload** (*OMR → Skan yükləmə*): PDF/PNG/JPEG, ≤ 4 files, ≤ 25 MB each,
   50 MB per request, 240 uploads per user per hour. Originals are stored on the
   `omr_data` volume and are downloadable for comparison.
   The web form handles one file at a time and supports live rear-camera capture,
   native phone-camera capture, and gallery/file selection. Live capture preserves
   the entire frame and produces JPEG at up to 20 million pixels.
   Closing the camera, leaving the page or hiding the browser stops its tracks.
   On touch devices single-card automatic capture is on by default: a frame with a maximum
   side of 480 px is sampled every 200 ms. Four marker-shaped components must form
   a sufficiently large page rectangle, and the view must remain adequately lit
   and steady for six frames. This is a framing aid, not ArUco or QR authentication;
   the worker verifies marker IDs and sheet identity. Choose the exam first.
   A captured photo is submitted automatically; successful scans cannot be submitted
   again accidentally. “Növbəti kartı skan et” opens the camera for the next sheet.
   For multiple cards in one photo, select the group-photo mode and use the shutter
   or the phone's native camera. Browser uploads retain up to 20 million pixels
   without cropping. The original selected file must still fit the 25 MB limit.
   One image may contain up to 20 separate cards; a PDF may have up to 10 pages
   and a document at most 100 recognized card/review entries. Cards must not overlap.
4. **Recognition** (worker, bounded subprocess): rasterise → detect markers →
   perspective/rotation correction (0/90/180/270° and skew) → read QR → measure
   bubble fill ratios → classify each answer. Repeated corner IDs are grouped
   geometrically into individual cards. Each has its own index and QR identity.
   Unmatched markers produce a review entry rather than silently disappearing.
5. **Binding and scoring** (API): the sheet token must belong to the same exam
   and an authorised branch; ticket/candidate must be unchanged, not cancelled
   and paid. On v2 the coded work number must exactly match that ticket. Names are
   resolved from the verified ticket, not guessed from handwriting. Scores are
   computed in integer thousandths. Private scan results and CSV/Excel/PDF exports
   include the candidate name, registration code, ticket code and work number.
6. **Review queue**: anything doubtful goes to `REVIEW`; a person decides.
7. **Publication**: see [OPERATIONS.md](OPERATIONS.md#results-publication).

## What goes to manual review

| Case | Flag |
| --- | --- |
| Faint / partial mark, confidence < 0.85 | `UNCERTAIN`, `LOW_CONFIDENCE` |
| Two or more marks on one question | `MULTIPLE` |
| Sheet with no marks at all | `ALL_BLANK` |
| Blurred image (Laplacian variance < 25) | `IMAGE_BLURRED` |
| Card shorter edge below 600 source pixels | `LOW_RESOLUTION` |
| Some cards' markers cannot form complete groups | `UNRESOLVED_SHEETS` |
| Missing/ambiguous work-number digits or disagreement with QR ticket | `WORK_NUMBER_UNREADABLE`, `WORK_NUMBER_MISMATCH` |
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
* On v2, copy the ticket's eight-digit work number left to right, marking exactly
  one digit in each column. An invalid identity requires correction and a fresh
  photo; an answer reviewer cannot assign it to a different pupil.
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
* Only issued `hilal-a4-v1` and `hilal-a4-v2` cards; up to 150 questions and 5 options.
* Fixtures are synthetic renders, not photos of real printed sheets. Validate
  with a batch of real scans from each branch printer/scanner before the first
  live exam.

## Release order

Apply migration `20261114000100_ticket_work_number` before starting the updated
API. It gives existing tickets unique work numbers while preserving their codes;
new staff and online sales receive numbers from the same non-cycling sequence.
Deploy API and worker together: the updated worker recognizes v2 and provides
the Unicode `/api/omr/report` PDF endpoint. The public results lookup still requires
the ticket reference and private candidate code; a predictable work number alone
does not grant access to results.
## User-supplied answer cards

In **OMR → Öz cavab kartımı əlavə et**, a central administrator selects the exam
and immutable answer key, then uploads one blank PDF/JPEG/PNG page. The preview
is normalized to at most 2000 pixels per side. Upload a straight, tightly cropped
scan; the blank page itself is the reference, so no Hilal QR or ArUco markers are
required. Names written by hand are not OCR'd.

Calibrate each evenly spaced answer block in question order: select the centers
of its first A bubble and last answer bubble, set its row count and bubble radius,
and verify the overlay. Add the eight-column work-number grid (digits 0–9 from
top to bottom). Every question must match the selected key's count and choices.
The worker checks blank interiors, printed rings, bounds and overlapping grids
before saving. Unsupported irregular layouts need a separate calibration method;
they must not be represented by an approximate uniform grid.

The saved model appears in the scan form. Its sample, calibration and key are
immutable. A different layout/key requires a new model. Existing standard cards
continue to use their original marker/QR reader. On phones, custom cards use the
camera shutter or gallery; automatic corner-triggered capture is for standard
cards only.

Custom scans register against the blank image using feature matching and a
perspective transform, including rotation and repeated cards in a single image.
The same 20-card/photo, 100-card/document, 20 MP and worker resource limits apply.
Compare the reported card count with the photo: covered, very small or unrelated
cards may not yield enough features to be located. Rescan missing cards closer.
Synthetic regression tests include 12 custom cards in a single photo under the
actual worker subprocess limits; physical device/paper calibration is still needed.

A confidently read eight-digit work number resolves a paid/live ticket in the
selected exam and an authorized branch. Candidate name comes from that ticket.
Missing/ambiguous numbers, unauthorized identities, changed tickets and conflicting
previously issued models stay in REVIEW without exposing pupil data. Duplicate
scans preserve existing results. Retries are scoped to the selected model as well
as uploader/exam/file. Human answer review never changes the recognized identity.

Deploy migration `20261115000100_custom_omr_templates` before the updated API and
deploy the worker and frontend together. Models are held in the database (up to
3 MB each, 50 per exam, 200 overall); scan originals still use `OMR_STORAGE_DIR`.
Model creation is central-admin-only and audited. The database migration adds
tables/columns without replacing existing sheets or results.
