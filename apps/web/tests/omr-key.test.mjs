import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAnswerKey } from '../src/lib/omr-key.ts';

test('answer keys accept phone-friendly letters and numbered pasted answers', () => {
  for (const input of ['ab cd', 'A,B;C|D', '1:A 2:B\n3:C\n4:D', '1. A\n2) B\n3-C\n4:D'])
    assert.deepEqual(parseAnswerKey(input, 4), ['A', 'B', 'C', 'D']);
});
test('answer key import never silently drops typos, missing numbers or extra answers', () => {
  for (const input of ['', 'A F B', '1:A 3:B', '1:A 1:B', '2:A 1:B', '1:A extra', 'AB/E', 'A'.repeat(151)])
    assert.throws(() => parseAnswerKey(input, 5), input);
  assert.throws(() => parseAnswerKey('ABCDE', 4));
});
