import { test } from 'node:test';
import assert from 'node:assert/strict';
import initRDKit from '@rdkit/rdkit';
import {
  parseFormula, formatFormula, parseAdduct, ionMz, parseProtonData, parsePeakList, parseHRMS,
  segment, splitNmrHeader, runChecks,
} from '../js/core/index.js';

const RDKit = await initRDKit();
const levels = (r, section) => r.findings.filter(f => !section || f.section === section).map(f => f.level);
const has = (r, level, re) => r.findings.some(f => f.level === level && re.test(f.title + ' ' + f.detail));

test('formula parsing and Hill order', () => {
  assert.deepEqual(parseFormula('C12H14NaO2'), { C: 12, H: 14, Na: 1, O: 2 });
  assert.deepEqual(parseFormula('[C10H13O2]+'), { C: 10, H: 13, O: 2 });
  assert.deepEqual(parseFormula('C6H4(CH3)2'), { C: 8, H: 10 });
  assert.equal(formatFormula({ O: 1, H: 10, C: 8 }), 'C8H10O');
  assert.throws(() => parseFormula('C10Xx2'));
});

test('adducts and exact masses', () => {
  assert.deepEqual(parseAdduct('[M+H]+'), { label: '[M+H]+', add: { H: 1 }, charge: 1 });
  assert.equal(parseAdduct('[M−H]−').charge, -1);
  assert.deepEqual(parseAdduct('[M+NH4]+').add, { N: 1, H: 4 });
  assert.equal(parseAdduct('[M+2H]2+').charge, 2);
  assert.equal(parseAdduct('M+').charge, 1);
  assert.equal(ionMz(parseFormula('C10H13O2'), 1).toFixed(4), '165.0910');
  assert.equal(ionMz(parseFormula('C7H5O2'), -1).toFixed(4), '121.0295');
});

test('1H parser handles common styles', () => {
  const s = parseProtonData('3.65 (h, J = 6.8 Hz, 1H), 7.26 (dd, J = 8.0, 2.1 Hz, 1H), 3.80 (s, 3H, OCH3), 2.31-2.25 (m, 2H), 1.20 (2H, t, J = 7.1 Hz), 6.95 (ddd, J1 = 8.4, J2 = 2.0, J3 = 1.0 Hz, 1H)');
  assert.equal(s.length, 6);
  assert.equal(s[0].code, 'h');
  assert.deepEqual(s[1].J.map(j => j.value), [8.0, 2.1]);
  assert.equal(s[2].nH, 3);
  assert.equal(s[3].shiftEnd, 2.25);
  assert.equal(s[4].code, 't');
  assert.deepEqual(s[5].J.map(j => j.value), [8.4, 2.0, 1.0]);
});

test('peak list parser', () => {
  const p = parsePeakList('158.0, 129.8 (2C), 124.1 (q, J = 272.1 Hz), 55.3 and 20.4');
  assert.equal(p.length, 5);
  assert.equal(p[1].count, 2);
  assert.equal(p[2].code, 'q');
});

test('segmenting and header parsing', () => {
  const sec = segment('¹H NMR (500 MHz, DMSO-d6) δ 1.00 (s, 3H). ¹³C{¹H} NMR (126 MHz, DMSO-d6) δ 20.0. IR (neat) 2950 cm-1. HRMS (ESI) m/z 100.0000');
  assert.deepEqual(sec.map(s => s.type), ['1H', '13C', 'other', 'HRMS']);
  const h = splitNmrHeader(sec[0].header);
  assert.equal(h.freq, 500);
  assert.equal(h.solvent, 'DMSO-d6');
});

test('HRMS sentence styles', () => {
  const a = parseHRMS(' (ESI+): calcd for C10H13O2 [M+H]+: 165.0910, found: 165.0912.');
  assert.equal(a.formulaRaw, 'C10H13O2'); assert.equal(a.calc, 165.091); assert.equal(a.found, 165.0912); assert.equal(a.adductRaw, '[M+H]+');
  const b = parseHRMS(' (APCI) m/z: [M+H]+ calcd for [C10H13O2]+ 165.0910; found 165.0908.');
  assert.equal(b.formulaRaw, 'C10H13O2'); assert.equal(b.found, 165.0908);
});

const GOOD = `1H NMR (400 MHz, CDCl3) δ 7.60 (d, J = 8.1 Hz, 2H), 7.48 (d, J = 8.1 Hz, 2H), 4.96 (q, J = 6.5 Hz, 1H), 1.91 (br s, 1H), 1.50 (d, J = 6.5 Hz, 3H). 13C{1H} NMR (101 MHz, CDCl3) δ 149.7, 129.7 (q, J = 32.3 Hz), 125.7, 125.5 (q, J = 3.8 Hz), 124.2 (q, J = 272.0 Hz), 69.9, 25.4. 19F NMR (376 MHz, CDCl3) δ -62.4. HRMS (ESI) m/z: [M+Na]+ calcd for C9H9F3NaO 213.0498; found 213.0495.`;
const SMI = 'C[C@H](O)c1ccc(cc1)C(F)(F)F';

test('correct data gives no errors or warnings', () => {
  const r = runChecks({ text: GOOD, smiles: SMI }, RDKit);
  assert.ok(!levels(r).includes('error'), JSON.stringify(r.findings, null, 1));
  assert.ok(!levels(r).includes('warning'), JSON.stringify(r.findings, null, 1));
});

test('missing OH is reported as info, not error', () => {
  const r = runChecks({ text: GOOD.replace('1.91 (br s, 1H), ', ''), smiles: SMI }, RDKit);
  assert.ok(has(r, 'info', /could be OH\/NH/));
  assert.ok(!levels(r, '1H NMR').includes('error'));
});

test('typical mistakes are caught', () => {
  const bad = GOOD
    .replace('7.48 (d, J = 8.1 Hz, 2H)', '7.48 (d, 2H)')
    .replace('1.50 (d, J = 6.5 Hz, 3H)', '1.50 (d, J = 6.5 Hz, 4H)')
    .replace('69.9, 25.4', '69.9, 69.9, 25.4')
    .replace('calcd for C9H9F3NaO 213.0498; found 213.0495', 'calcd for C9H9F3O 213.0498; found 213.0571');
  const r = runChecks({ text: bad, smiles: SMI }, RDKit);
  assert.ok(has(r, 'error', /without a coupling constant/));
  assert.ok(has(r, 'error', /sum to 10 H/));
  assert.ok(has(r, 'warning', /more than once/));
  assert.ok(has(r, 'error', /neutral compound/));
  assert.ok(has(r, 'info', /only the written formula/));
  assert.ok(has(r, 'error', /outside 5 ppm/));
});

test('wrong calculated value', () => {
  const r = runChecks({ text: 'HRMS (ESI) m/z: [M+H]+ calcd for C10H13O2 165.0930; found 165.0912.', formula: 'C10H12O2' }, null);
  assert.ok(has(r, 'error', /is wrong for C10H13O2/));
});

test('electron mass ignored -> info', () => {
  const r = runChecks({ text: 'HRMS (ESI) m/z: [M+H]+ calcd for C10H13O2 165.0916; found 165.0912.', formula: 'C10H12O2' }, null);
  assert.ok(has(r, 'info', /ignores the electron mass/));
});

test('salt: thiazolium cation measured as [M]+', () => {
  const r = runChecks({ text: 'HRMS (ESI) m/z: [M]+ calcd for C5H8NS 114.0372; found 114.0370.', smiles: 'Cc1sc[n+](c1)C.F[B-](F)(F)F' }, RDKit);
  assert.ok(has(r, 'ok', /charged component/), JSON.stringify(r.findings, null, 1));
  assert.ok(!levels(r, 'HRMS').includes('error'));
});

test('81Br isotopologue is recognised', () => {
  const r = runChecks({ text: 'HRMS (EI) m/z: [M]+ calcd for C7H7BrO 187.9654; found 187.9651.', smiles: 'COc1ccc(Br)cc1' }, RDKit);
  assert.ok(has(r, 'info', /⁸¹Br/));
  assert.ok(!levels(r, 'HRMS').includes('error'), JSON.stringify(r.findings, null, 1));
});

test('negative mode [M-H]-', () => {
  const r = runChecks({ text: 'HRMS (ESI) m/z: [M−H]− calcd for C7H5O2 121.0295; found 121.0297.', smiles: 'OC(=O)c1ccccc1' }, RDKit);
  assert.ok(!levels(r, 'HRMS').includes('error'), JSON.stringify(r.findings, null, 1));
});

test('frequency mismatch between 1H and 13C', () => {
  const r = runChecks({ text: '1H NMR (400 MHz, CDCl3) δ 1.00 (s, 3H). 13C NMR (126 MHz, CDCl3) δ 20.0.' }, null);
  assert.ok(has(r, 'warning', /126 MHz does not fit/));
});

test('Word-style paragraph: subscripts, unicode minus, mislabelled [M]- ion', () => {
  const text = `¹H-NMR (400 MHz, CDCl₃): δ = 7.31 – 7.17 (m, 5H), 2.68 (t, J = 7.5 Hz, 2H), 2.38 (t, J = 7.4 Hz, 2H), 1.97 (p, J = 7.5 Hz, 2H) ppm.
¹³C-NMR (101 MHz, CDCl₃): δ = 180.0, 141.1, 128.6, 128.5, 126.2, 35.1, 33.4, 26.3 ppm.
HRMS (ESI): m/z: [M]⁻ Calcd for C₁₀H₁₁O₂⁻ 163.0765; Found 163.0763.
IR (ATR): 2940, 1705, 1450 cm⁻¹.`;
  const r = runChecks({ text, smiles: 'OC(=O)CCCc1ccccc1' }, RDKit);
  const errs = r.findings.filter(f => f.level === 'error');
  assert.equal(errs.length, 1, JSON.stringify(errs));
  assert.match(errs[0].title, /should be \[M-H\]-/);
  assert.ok(has(r, 'ok', /8 peaks reported, matching 8/));
  assert.ok(has(r, 'ok', /within 5 ppm/));
  assert.ok(has(r, 'info', /could be OH/));
});

test('name vs structure comparison', () => {
  const base = { text: '', smiles: 'C[C@H](O)c1ccc(cc1)C(F)(F)F', name: 'x' };
  assert.ok(has(runChecks({ ...base, nameSmiles: 'FC(C1=CC=C(C=C1)[C@H](C)O)(F)F' }, RDKit), 'ok', /same compound/));
  assert.ok(has(runChecks({ ...base, nameSmiles: 'FC(C1=CC=C(C=C1)[C@@H](C)O)(F)F' }, RDKit), 'warning', /only in stereochemistry/));
  assert.ok(has(runChecks({ ...base, nameSmiles: 'CC(O)c1ccc(cc1)C(F)(F)F' }, RDKit), 'warning', /no stereodescriptor/));
  assert.ok(has(runChecks({ ...base, nameSmiles: 'CC(O)c1ccc(cc1)Cl' }, RDKit), 'error', /different compounds/));
});

test('without a structure the formula comes from the HRMS ion', () => {
  const r = runChecks({ text: '1H NMR (400 MHz, CDCl3) δ 7.55 (d, J = 7.4 Hz, 2H), 7.42-7.31 (m, 3H), 5.47 (d, J = 2.2 Hz, 1H), 2.67 (d, J = 2.2 Hz, 1H), 2.20 (br s, 1H). HRMS (ESI) m/z: [M+Na]+ calcd for C9H8NaO 155.0467; found 155.0465.' }, null);
  assert.ok(has(r, 'info', /C9H8O from the HRMS/));
  assert.ok(has(r, 'ok', /sum to 8 H/));
  assert.ok(!levels(r).includes('error'));
});

test('diastereotopic carbons next to a stereocentre are allowed', () => {
  const r = runChecks({ text: '13C NMR (101 MHz, CDCl3) δ = 180.1, 42.9, 37.5, 32.0, 30.4, 29.2, 28.9, 26.9, 26.8, 26.7, 16.1 ppm.', smiles: 'CC(CCC(=O)O)C1CCCCC1' }, RDKit);
  assert.ok(has(r, 'ok', /9–11 carbon environments/), JSON.stringify(r.findings));
  const iso = runChecks({ text: '13C NMR (101 MHz, CDCl3) δ 70.0, 35.0, 18.5, 17.9, 16.0.', smiles: 'CC(O)C(C)C' }, RDKit);
  assert.ok(has(iso, 'ok', /4–5 carbon/), JSON.stringify(iso.findings));
  const ph = runChecks({ text: '13C NMR (101 MHz, CDCl3) δ 179.0, 146.1, 128.6, 127.1, 126.4, 39.4, 33.0, 32.1, 22.3, 21.0.', smiles: 'CC(CCC(=O)O)c1ccccc1' }, RDKit);
  assert.ok(has(ph, 'warning', /at most 9/), 'phenyl ortho carbons stay equivalent');
});

test('decimal comma and solvent notation', () => {
  const r = runChecks({ text: '1H NMR (400 MHz, CDCl3): δ = 2.41 - 2.25 (m, 2H), 2,05 - 1.91 (m, 2H) ppm. 19F NMR (376 MHz, Chloroform-d): δ = -63.10 ppm.' }, null);
  assert.ok(has(r, 'error', /Decimal comma.*2,05/));
  assert.ok(!has(r, 'info', /low-to-high/));
  assert.ok(has(r, 'info', /Same solvent written in different ways/));
});

test('two decimals used to resolve close peaks are fine', () => {
  const r = runChecks({ text: '13C NMR (101 MHz, CDCl3) δ 130.2, 129.36, 129.33, 125.8.' }, null);
  assert.ok(!has(r, 'info', /Mixed number of decimals/));
});
