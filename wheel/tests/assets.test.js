import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const asset = path => new URL(`../${path}`, import.meta.url);
const manifest = JSON.parse(await readFile(asset('assets/manifest.json'), 'utf8'));
const puzzles = JSON.parse(await readFile(asset('assets/puzzles.json'), 'utf8'));

test('complete original puzzle bank fits the recovered 52-tile board', () => {
  assert.equal(puzzles.length, 8976);
  assert.equal(puzzles.filter(p => p.bonus).length, 1122);
  assert.equal(new Set(puzzles.map(p => p.id)).size, puzzles.length);
  for (const puzzle of puzzles) {
    assert.equal(puzzle.rows.length, 4);
    for (const row of puzzle.rows) assert.equal(row.length, 14);
    for (const row of [puzzle.rows[0], puzzle.rows[3]]) {
      assert.equal(row[0], ' ');
      assert.equal(row[13], ' ');
    }
    assert.equal(puzzle.answer, puzzle.rows.map(r => r.trim()).filter(Boolean).join(' '));
  }
});

test('every declared GLB is present and has a valid binary container length', async () => {
  assert.equal(manifest.models.length, 25);
  for (const model of manifest.models) {
    const buffer = await readFile(asset(model.url));
    assert.equal(buffer.toString('ascii', 0, 4), 'glTF', model.id);
    assert.equal(buffer.readUInt32LE(4), 2, model.id);
    assert.equal(buffer.readUInt32LE(8), buffer.length, model.id);
    assert.equal(buffer.length, model.bytes, model.id);
  }
  assert.equal(manifest.stages.length, 12);
  for (const stage of manifest.stages) {
    assert.ok(manifest.models.some(model => model.url === stage.url));
  }
});

test('all original audio tracks are packaged; no player bodies are required', async () => {
  assert.equal(manifest.audio.length, 36);
  assert.deepEqual(manifest.avatars, []);
  assert.deepEqual(manifest.conversionErrors, []);
  for (const track of manifest.audio) {
    const buffer = await readFile(asset(track.url));
    assert.ok(buffer.length > 1000, track.id);
    assert.ok(track.duration > 0, track.id);
  }
});
