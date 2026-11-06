import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expandAbbreviations as x } from '../js/core/abbrev.js';

test('abbreviations in compound names are expanded for OPSIN', () => {
  assert.equal(x('2-naphthyl-OTf').name, '2-naphthyl triflate');
  assert.equal(x('4-OBn-benzaldehyde').name, '4-benzyloxybenzaldehyde');
  assert.equal(x('methyl 4-(OMe)benzoate').name, 'methyl 4-methoxybenzoate');
  assert.equal(x('4-Cl-3-CF3-benzoic acid').name, '4-chloro-3-trifluoromethylbenzoic acid');
  assert.equal(x('N-Ts-aniline').name, 'N-tosylaniline');
  assert.equal(x('N,N-Me2-aniline').name, 'N,N-dimethylaniline');
  assert.equal(x('4-(TBSO)phenol').name, '4-((tert-butyldimethylsilyl)oxy)phenol');
  assert.equal(x('piperidin-4-amine · TFA').name, 'piperidin-4-amine TFA salt');
  assert.equal(x('benzylamine•HCl').name, 'benzylamine hydrochloride');
  assert.equal(x('1-methylpyridinium OTf').name, '1-methylpyridinium triflate');
  assert.equal(x('4-Bpin-anisole').name, '4-(4,4,5,5-tetramethyl-1,3,2-dioxaborolan-2-yl)anisole');
});

test('ordinary names are left alone', () => {
  for (const n of ['4-Phenylbutan-2-one', 'Benzyl alcohol', '4-(Naphthalen-1-yl)pentanoic acid', 'Iodobenzene', 'Methyl acetate', 'N-methylaniline']) {
    assert.equal(x(n).name, n); assert.equal(x(n).used.length, 0);
  }
});
