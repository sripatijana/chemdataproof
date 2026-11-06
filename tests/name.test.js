import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractName } from '../js/name.js';

test('compound name is taken from the title line', () => {
  const entry = `4-Phenylbutanoic acid (B3)

Prepared according to general procedure B and obtained as a white solid in 81% yield.
¹H-NMR (400 MHz, CDCl₃): δ = 7.31 – 7.17 (m, 5H)`;
  assert.equal(extractName(entry), '4-Phenylbutanoic acid');
  assert.equal(extractName('3a: tert-Butyl (S)-2-formylpyrrolidine-1-carboxylate\n1H NMR (400 MHz, CDCl3) δ 9.50 (s, 1H)'), 'tert-Butyl (S)-2-formylpyrrolidine-1-carboxylate');
  assert.equal(extractName('Following GP-A, the product was obtained in 70% yield.\n1H NMR (400 MHz) δ 1.00 (s, 3H)'), '');
  assert.equal(extractName('1H NMR (400 MHz) δ 1.00 (s, 3H)'), '');
});
