import assert from 'node:assert/strict';

await import('../grant-utils.js');

const { amountValue } = globalThis.GrantUtils;

assert.equal(amountValue('up to $100K'), 100000);
assert.equal(amountValue('$5K–$50K'), 50000);
assert.equal(amountValue('$150k–$250k'), 250000);
assert.equal(amountValue('Up to $1,000,000'), 1000000);
assert.equal(amountValue('$1.5M'), 1500000);
assert.equal(amountValue('Full summit scholarship'), 0);

console.log('Grant amount parser regression tests passed.');
