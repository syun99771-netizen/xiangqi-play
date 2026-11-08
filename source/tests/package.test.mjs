import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as api from 'xiangqi-recovered-js';
import * as node from 'xiangqi-recovered-js/node';

test('package self-import exports the public facade and separate Node entry', () => {
  assert.deepEqual(Object.keys(api).sort(), ['MODEL_SHA256','REFERENCE','SDK_LIMITS','START_FEN','createReference','loadPinnedModel','preflight','searchWithModel'].sort());
  assert.deepEqual(Object.keys(node), ['createNodeClient']);
  assert.equal(import.meta.resolve('xiangqi-recovered-js/browser-worker'), new URL('../worker-demo.mjs',import.meta.url).href);
  assert.equal(api.MODEL_SHA256,'c07e94a5c7cbeae443ed79a8fa412875d833a7f8e04333815e39729c59d52e11');
});

test('every engine module matches provenance and explicitly recorded updates', async () => {
  const manifest = JSON.parse(await fs.readFile(new URL('../provenance/ENGINE-SOURCE.json',import.meta.url)));
  assert.equal(manifest.files.length,34);
  for (const item of manifest.files) {
    const bytes = await fs.readFile(new URL('../'+item.path,import.meta.url));
    assert.equal(bytes.length,item.bytes,item.path);
    assert.equal(createHash('sha256').update(bytes).digest('hex'),item.sha256,item.path);
    if(item.path==='engine/src/search-public-b562.js') {
      assert.equal(item.baselineSha256,'cee41fed67ae0c219ef1276b77bdd418624f0f9986c0646b5547f089878865f7');
      assert.equal(item.transformation,'2026-11-08: skip unused checked-quiescence static evaluation; bypass unused leaf ordering-only TT probe');
    } else if(item.path==='engine/experimental/fairy-cc0-sparse-head-v1/forward.mjs') {
      assert.equal(item.baselineSha256,'f91140639992dc304dc6ec88917b30ebb9ec4d8a05f8cdc84e756814de223ad0');
      assert.equal(item.transformation,'2026-11-08: transactional two-bank accumulator workspace; preserve arithmetic and arbitrary-jump semantics');
    } else assert.equal(item.transformation,'none');
  }
});

test('browser entry and module-worker closure use only local JavaScript imports (static check only)', async () => {
  const seen = new Set(), pending = [new URL('../api.mjs',import.meta.url),new URL('../worker-demo.mjs',import.meta.url)];
  while (pending.length) {
    const url = pending.pop();
    if (seen.has(url.href)) continue;
    seen.add(url.href);
    const source = await fs.readFile(url,'utf8');
    assert(!/\b(?:require\s*\(|import\s*\(|WebAssembly\b)/.test(source),url.href+' unexpected loader');
    for (const match of source.matchAll(/\b(?:from\s*|import\s*)['"]([^'"]+)['"]/g)) {
      assert(match[1].startsWith('.'),url.href+' nonlocal import '+match[1]);
      assert(/\.(?:mjs|js)$/.test(match[1]),url.href+' non-JS import');
      pending.push(new URL(match[1],url));
    }
  }
  assert(seen.size >= 25);
});
