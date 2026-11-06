import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
import { DOMParser } from '@xmldom/xmldom';
import { readDocx } from '../js/core/docx.js';
import { splitEntries, splitParagraphs, cleanTitle } from '../js/core/document.js';

test('title cleaning', () => {
  assert.deepEqual(cleanTitle('4-Phenylbutan-2-one (1a)'), { name: '4-Phenylbutan-2-one', label: '1a' });
  assert.deepEqual(cleanTitle('4-Phenylbutanoic acid (B3)'), { name: '4-Phenylbutanoic acid', label: 'B3' });
  assert.deepEqual(cleanTitle('3b: tert-Butyl benzoate'), { name: 'tert-Butyl benzoate', label: '3b' });
  assert.deepEqual(cleanTitle('Benzophenone'), { name: 'Benzophenone', label: '' });
});

test('a Word file is split into one entry per compound', async () => {
  const ctx = await readDocx(readFileSync(new URL('./fixtures/example-si.docx', import.meta.url)), { JSZip, DOMParser });
  const e = splitParagraphs(ctx.paragraphs);
  assert.deepEqual(e.map(x => x.label), ['1a', '1b', '1c', '1d']);
  assert.equal(e[2].name, 'Ethyl 3-(4-fluorophenyl)propanoate');
  assert.match(e[2].text, /19F NMR/);
  assert.match(e[2].text, /HRMS/);       // data spread over four paragraphs stays together
  assert.doesNotMatch(e[0].text, /Prepared according/);
});

test('name and data in one paragraph', () => {
  const e = splitEntries('Benzophenone (2a): 1H NMR (400 MHz, CDCl3) δ 7.81 (d, J = 7.6 Hz, 4H).\nAcetophenone (2b): 1H NMR (400 MHz, CDCl3) δ 2.61 (s, 3H).');
  assert.deepEqual(e.map(x => [x.name, x.label]), [['Benzophenone', '2a'], ['Acetophenone', '2b']]);
});
