import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import initRDKit from '@rdkit/rdkit';
import { runChecks, splitParagraphs, locate, readDocx, annotateDocx, commentsForEntry } from '../js/core/index.js';

const deps = { JSZip, DOMParser, XMLSerializer };
const RDKit = await initRDKit();
const fixture = () => readFileSync(new URL('./fixtures/example-si.docx', import.meta.url));

test('paragraphs and entries are read straight from the Word XML', async () => {
  const ctx = await readDocx(fixture(), deps);
  const e = splitParagraphs(ctx.paragraphs);
  assert.deepEqual(e.map(x => x.label), ['1a', '1b', '1c', '1d']);
  assert.match(ctx.paragraphs[e[0].parts[0].para], /^1H NMR/);   // superscript runs joined
});

test('comments are anchored to the offending text and the file stays valid', async () => {
  const ctx = await readDocx(fixture(), deps);
  const entries = splitParagraphs(ctx.paragraphs);
  const comments = [];
  for (const e of entries) comments.push(...commentsForEntry(e, runChecks({ text: e.text }, RDKit), locate));
  const bad = comments.find(c => /sum to 11 H/.test(c.text));
  assert.ok(bad, 'integration error becomes a comment');
  assert.match(ctx.paragraphs[bad.para].slice(bad.start, bad.end), /^1H NMR \(400 MHz/);
  assert.ok(!comments.some(c => /No structure given/.test(c.text)), 'internal notes are not commented');

  const { bytes, placed } = await annotateDocx(ctx, comments, deps, { date: '2026-11-06T12:00:00Z' });
  assert.equal(placed, comments.length);
  const zip = await JSZip.loadAsync(bytes);
  const docXml = await zip.file('word/document.xml').async('string');
  const cXml = await zip.file('word/comments.xml').async('string');
  assert.equal((docXml.match(/<w:commentRangeStart /g) || []).length, comments.length);
  assert.equal((cXml.match(/<w:comment /g) || []).length, comments.length);
  assert.match(await zip.file('[Content_Types].xml').async('string'), /comments\+xml/);
  assert.match(await zip.file('word/_rels/document.xml.rels').async('string'), /relationships\/comments/);
  // the visible text is unchanged
  const again = await readDocx(bytes, deps);
  assert.deepEqual(again.paragraphs, ctx.paragraphs);
  assert.ok(!Object.values(zip.files).some(f => f.dir), 'no folder entries');
});

test('ion labels are printed properly and recurring problems are summarised', async () => {
  const { prettyIons, recurringIssues } = await import('../js/core/docx.js');
  assert.equal(prettyIons('label [M]- should be [M-H]-'), 'label [M]⁻ should be [M−H]⁻');
  assert.equal(prettyIons('[M+2H]2+ and [M+Na]+'), '[M+2H]²⁺ and [M+Na]⁺');
  const mk = f => ({ findings: [{ level: 'error', section: 'HRMS', title: `Ion label [M]- should be [M-H]-`, detail: f }] });
  const rec = recurringIssues([mk('C11H13O2'), mk('C12H15O3'), mk('C9H11O2S')]);
  assert.equal(rec.length, 1); assert.equal(rec[0].n, 3);
});
