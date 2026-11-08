# Cloudflare Workers static mirror

Connect only the public `syun99771-netizen/xiangqi-play` repository, production branch `main`.
Keep the project root at the repository root. Set `NODE_VERSION=22`.

- Project name: `xiangqi-play`
- Build: `node source/scripts/build-cloudflare.mjs`
- Deploy: `npx wrangler deploy --config source/cloudflare/wrangler.json`
- Disable preview builds; leave Cloudflare Access disabled for the public mirror.

The build verifies the release manifest, downloads the pinned model from the provenance URL only when a validated local copy is absent, validates its byte count and SHA256, runs all tests, and creates `pages-dist` outside the source tree. Only that output is deployed. The browser loads the model from the same Cloudflare origin. There is no server-side chess engine or Worker entry point. Original GitHub Pages deployment is unchanged.

Configuration and build script are part of the reviewed source manifest, so the existing private-to-public sync preserves them without changing either GitHub workflow. Every public main push triggers the connected Workers build. No API tokens or account identifiers belong in this repository. Cloudflare provisions build authentication through its account setup.

The generated mirror retains the release source archive and license files. Use the actual workers.dev URL shown after deployment; no custom domain is required. Mainland China performance must be measured, not assumed.
