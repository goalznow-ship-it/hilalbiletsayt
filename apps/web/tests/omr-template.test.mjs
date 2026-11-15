import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gridPoints } from '../src/lib/omr-template.ts';

test('calibration overlays use first and last bubble centers, including a single row', () => {
  const grid = { left: .1, right: .4, top: .2, bottom: .8, rows: 3, columns: 4, radius: .006 };
  const points = gridPoints(grid);
  assert.equal(points.length, 12);
  assert.deepEqual(points[0], { x: .1, y: .2 });
  assert.deepEqual(points.at(-1), { x: .4, y: .8 });
  assert.ok(gridPoints({ ...grid, rows: 1 }).every(p => p.y === .2));
  assert.deepEqual(gridPoints({ ...grid, rows: 100000 }), []);
});
