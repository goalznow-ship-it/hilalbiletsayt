import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepareOmrFile, omrUploadFeedback, analyzeFrame, frameGuidance, detectSheetFrame, AUTO_CAPTURE } from '../src/lib/omr-scan.ts';

test('OMR accepts PDF and phone JPEG/PNG, including missing browser MIME', async () => {
  for (const [name, type, signature] of [
    ['scan.pdf', 'application/pdf', [37, 80, 68, 70, 45]],
    ['IMG_001.JPEG', 'image/jpeg', [255, 216, 255, 224]],
    ['scan.png', 'image/png', [137, 80, 78, 71, 13, 10, 26, 10]],
  ]) {
    for (const mime of [type, '']) {
      const file = await prepareOmrFile(new File([new Uint8Array(signature)], name, { type: mime }));
      assert.equal(file.type, type);
      assert.deepEqual(new Uint8Array(await file.arrayBuffer()), new Uint8Array(signature));
    }
  }
});

test('automatic capture requires four separate marker shapes in page geometry', () => {
  const width = 320, height = 452;
  const pixels = new Uint8ClampedArray(width * height * 4).fill(255);
  const marker = (left, top) => {
    for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) {
      if (x >= 2 && x < 10 && y >= 2 && y < 10) continue;
      const index = ((top + y) * width + left + x) * 4;
      pixels[index] = pixels[index + 1] = pixels[index + 2] = 0;
    }
  };
  assert.equal(detectSheetFrame(pixels, width, height).ready, false, 'blank wall');
  marker(16, 16); marker(292, 16); marker(292, 424);
  assert.equal(detectSheetFrame(pixels, width, height).ready, false, 'cropped corner');
  marker(16, 424);
  assert.equal(detectSheetFrame(pixels, width, height).ready, true, 'whole page');
  assert.equal(detectSheetFrame(pixels, width, height).corners.length, 4);
  assert.equal(detectSheetFrame(pixels, 200, 200).ready, false, 'invalid frame size');
});

test('OMR refuses unsupported photos, empty/oversized files and spoofed signatures', async () => {
  for (const file of [
    new File([], 'empty.jpg', { type: 'image/jpeg' }),
    new File([new Uint8Array(25 * 1024 * 1024 + 1)], 'large.jpg', { type: 'image/jpeg' }),
    new File(['fake'], 'fake.pdf', { type: 'application/pdf' }),
    new File(['heic'], 'IMG_001.HEIC', { type: 'image/heic' }),
    new File([new Uint8Array([255, 216, 255])], 'scan.png', { type: 'image/png' }),
  ]) await assert.rejects(prepareOmrFile(file));
});

test('OMR does not report failed or rejected processing as successful', () => {
  assert.equal(omrUploadFeedback('COMPLETED').kind, 'success');
  assert.equal(omrUploadFeedback('REVIEW').kind, 'review');
  for (const status of ['FAILED', 'REJECTED', 'unexpected'])
    assert.equal(omrUploadFeedback(status).kind, 'error');
  for (const status of ['PENDING', 'PROCESSING'])
    assert.equal(omrUploadFeedback(status).kind, 'pending');
});

const grayFrame = (...levels) =>
  new Uint8ClampedArray(levels.flatMap(value => [value, value, value, 255]));

test('phone auto-capture sees light, movement and printed contrast in video frames', () => {
  const bright = Array.from({ length: 16 }, (_, index) => [60, 220, 120][index % 3]);
  const first = analyzeFrame(grayFrame(...bright));
  assert.equal(Math.round(first.brightness), 115);
  assert.ok(first.contrast >= AUTO_CAPTURE.minContrast);
  assert.equal(first.motion, 255, 'the first frame cannot be compared');
  assert.equal(first.gray.length, 4);

  const still = analyzeFrame(grayFrame(...bright), first.gray);
  assert.equal(still.motion, 0);
  assert.equal(frameGuidance(still), 'steady');

  const shifted = bright.map(value => value + 20);
  const moved = analyzeFrame(grayFrame(...shifted), first.gray);
  assert.ok(moved.motion > AUTO_CAPTURE.maxMotion);
  assert.equal(frameGuidance(moved), 'move');

  assert.equal(frameGuidance(analyzeFrame(grayFrame(...Array(16).fill(20)))), 'dark');
  assert.equal(frameGuidance({ brightness: 150, motion: 0, contrast: 0 }), 'flat');
  assert.equal(frameGuidance({ brightness: AUTO_CAPTURE.minBrightness, motion: AUTO_CAPTURE.maxMotion, contrast: AUTO_CAPTURE.minContrast }), 'steady');
  assert.equal(frameGuidance({ brightness: AUTO_CAPTURE.minBrightness - 1, motion: 0, contrast: 40 }), 'dark');
  assert.equal(frameGuidance({ brightness: 200, motion: AUTO_CAPTURE.maxMotion + 1, contrast: 40 }), 'move');
  assert.equal(frameGuidance({ brightness: 200, motion: 0, contrast: AUTO_CAPTURE.minContrast - 1 }), 'flat');
});
