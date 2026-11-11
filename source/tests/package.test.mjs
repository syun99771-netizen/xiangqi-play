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
  assert.equal(manifest.files.length,37);
  for (const item of manifest.files) {
    const bytes = await fs.readFile(new URL('../'+item.path,import.meta.url));
    assert.equal(bytes.length,item.bytes,item.path);
    assert.equal(createHash('sha256').update(bytes).digest('hex'),item.sha256,item.path);
    if(item.path==='engine/src/search-public-b562.js') {
      assert.equal(item.baselineSha256,'cee41fed67ae0c219ef1276b77bdd418624f0f9986c0646b5547f089878865f7');
      assert.equal(item.transformation,'2026-11-08: skip unused checked-quiescence static evaluation; bypass unused leaf ordering-only TT probe; 2026-11-10: defer ordinary quiescence move ordering until expansion (typed compatibility unchanged); 2026-11-11: honor external cancellation immediately after onInfo returns before mate/time/depth completion; preserve completed iteration; 2026-11-12 isolated candidate: retain completed strict-public root forced-win lower bound on later time/node stop only, reject cycle contamination/extensions/external cancellation, expose unfinished-root metadata without score');
      assert.equal(item.previousSha256,'333ecb6ff06f9ee2f2058134c72b822a90811a18b0afde949a47d03f30309c27');
      assert.equal(item.priorVersions.at(-1).sha256,'333ecb6ff06f9ee2f2058134c72b822a90811a18b0afde949a47d03f30309c27');
      assert.equal(item.priorVersions.at(-1).bytes,25749);
    } else if(item.path==='engine/experimental/fairy-cc0-sparse-head-v1/forward.mjs') {
      assert.equal(item.baselineSha256,'f91140639992dc304dc6ec88917b30ebb9ec4d8a05f8cdc84e756814de223ad0');
      assert.equal(item.transformation,'2026-11-08: transactional two-bank accumulator workspace; preserve arithmetic and arbitrary-jump semantics; incremental sorted-owned validation without Set (full-refresh unchanged); paired independent mod16 delta lanes via private native-endian Uint32 views (unaligned scalar fallback); exact Float64 adjacent-output paired first head (Q=2^26); 2026-11-10: session-private raw inference intermediate workspace (diagnostic/full-refresh ownership unchanged); 2026-11-10: reuse exact paired-lane kernel for aligned private-session refresh; scalar full-refresh and unaligned fallback unchanged; 2026-11-12: raw inference may use one exact fixed-memory WASM SIMD numeric head; diagnostics and scalar fallback unchanged');
      assert.equal(item.priorVersions.at(-1).sha256,'d3c43059573adf741854d89b61fdcc04961ca63ad65625db7390a39ff09d4731');
      assert.equal(item.priorVersions.at(-1).bytes,17486);
    } else if(item.path.endsWith('/wasm-head.mjs')){assert.equal(item.transformation,'2026-11-12: optional exact zero-import numeric-head SIMD bridge; native CompileError capability/CSP fallback only; layout and runtime faults propagate');} else if(item.path.endsWith('/wasm-head-source.c')){assert.equal(item.transformation,'2026-11-12: full corresponding GPL C numeric-head translation, byte-identical to independently reviewed kernel; see provenance/WASM-HEAD.json');} else if(['engine/src/sdk/core.js','engine/experimental/cc0-portable-public-b562-v2/profile.mjs'].includes(item.path)){assert.equal(item.transformation,'2026-11-09: explicit fixed-depth and infinite search budget modes; preserve legacy request semantics');assert.match(item.baselineSha256,/^[a-f0-9]{64}$/);} else if(item.path==='engine/src/endgame-guide.js')assert.equal(item.transformation,'generated exact KNK/KNKA guide; see provenance/KNKA-GUIDE.md'); else assert.equal(item.transformation,'none');
  }
});

test('browser closure permits only the exact audited numeric-head helper; forbids every other WASM/native loader', async () => {
  const allowedHead=new URL('../engine/experimental/fairy-cc0-sparse-head-v1/wasm-head.mjs',import.meta.url).href;
  const seen = new Set(), pending = [new URL('../api.mjs',import.meta.url),new URL('../worker-demo.mjs',import.meta.url),new URL('../web/engine-worker.mjs',import.meta.url),new URL('../web/app.mjs',import.meta.url)];
  while (pending.length) {
    const url = pending.pop();
    if (seen.has(url.href)) continue;
    seen.add(url.href);
    const source = await fs.readFile(url,'utf8');
    assert(!/\b(?:require\s*\(|import\s*\(|(?:process\s*\.\s*)?dlopen\s*\()/.test(source),url.href+' unexpected dynamic/native loader');
    if(url.href===allowedHead){
      assert.equal(createHash('sha256').update(source).digest('hex'),'8c1a9cbfc839dea7303101076912e76893688fb46b2a36d86d209d15a9ff483c','Only the reviewed helper is allowed');
      const payloads=[...source.matchAll(/const encoded='([^']+)';/g)];assert.equal(payloads.length,1);
      const bytes=Buffer.from(payloads[0][1],'base64');assert.equal(bytes.length,1184);
      assert.equal(createHash('sha256').update(bytes).digest('hex'),'9e806804d5e5a0041c20165a2cc3481060ad63bf774b598dc7d99858d5eab046');
      assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)),[]);
    }else assert(!/\bWebAssembly\b/.test(source),url.href+' unapproved WASM loader');
    for (const match of source.matchAll(/\b(?:from\s*|import\s*)['"]([^'"]+)['"]/g)) {
      assert(match[1].startsWith('.'),url.href+' nonlocal import '+match[1]);
      assert(/\.(?:mjs|js)$/.test(match[1]),url.href+' non-JS import');
      // Deployment places web files at release root alongside engine/api.
      const spec=url.pathname.includes('/web/')&&/^\.\/(?:engine\/|api\.mjs$|reference-core\.mjs$)/.test(match[1])?'../'+match[1].slice(2):match[1];
      pending.push(new URL(spec,url));
    }
  }
  assert(seen.size >= 25);assert(seen.has(allowedHead));
});
