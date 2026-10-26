import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { publicRequest, sessionDate } from '../src/lib/public-sales.ts';
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
test('public sales uses one public API prefix and no login token', async () => {
  globalThis.fetch = async (url, init) => {
    assert.equal(url, '/api/public/orders');
    assert.equal(init.headers.Authorization, undefined);
    assert.equal(init.cache, 'no-store');
    return Response.json({ receiptToken: 'opaque' });
  };
  assert.deepEqual(await publicRequest('/orders', { method: 'POST', body: '{}' }), { receiptToken: 'opaque' });
});
test('public request preserves validation messages and hides internal errors', async () => {
  globalThis.fetch = async () => Response.json({ message: ['Sessiya seçin.', 'Filial seçin.'] }, { status: 400 });
  await assert.rejects(publicRequest('/orders'), /Sessiya seçin. Filial seçin./);
  globalThis.fetch = async () => Response.json({ message: 'private database details' }, { status: 500 });
  await assert.rejects(publicRequest('/orders'), error => !error.message.includes('private'));
});
test('public request explains retry after a network failure', async () => {
  globalThis.fetch = async () => { throw new Error('network'); };
  await assert.rejects(publicRequest('/orders'), /yenidən cəhd edin/);
});
test('session dates show numeric dates in Baku time', () => {
  const date = sessionDate('2026-11-01T09:00:00Z');
  assert.match(date, /01[.]11[.]2026/);
  assert.match(date, /13:00/);
});
