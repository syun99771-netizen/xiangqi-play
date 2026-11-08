# 网页对弈与 GitHub Pages

网页使用本仓库 api.mjs、同一真实搜索器与 SHA-256 固定的 CC0 模型，不是另外一套弱化引擎。搜索在 module Worker 内运行；重开或切换执色会终止旧 Worker，避免旧结果污染新局。思考时间为搜索软预算，首次模型下载/解析另计。每步保留完整棋谱用于公开规则裁决。

## 自动部署

在 GitHub 仓库 Settings → Pages → Build and deployment，将 Source 设为 GitHub Actions，然后运行 `Verified engine and Pages` 工作流。工作流每次 main 提交后先验证完整清单、下载并校验模型、跑测试，再构建和发布。失败的提交不会覆盖已有站点。页面显示部署对应 commit。刷新网页即可读取新版本，正在进行的局不会主动热换引擎。

私有仓库使用 Pages 需要 GitHub 支持该功能的付费计划。不要为了部署自动把仓库改为公开。即使源仓库私有，普通 Pages 站点及其中 JS、模型和对应 GPL 源码包通常仍公开可下载；不能用于存放秘密。发布目录只包含白名单运行文件、许可证、模型和 MANIFEST 中的完整源码，不包含 .git、认证信息或未列入的文件。

## 本地

Node 22+，将校验正确的模型放到 `models/xiangqi-c07e94a5c7cb.nnue`，运行：

```
node verify-manifest.mjs
npm test
node scripts/build-pages.mjs
python3 -m http.server 8000 --directory ../pages-dist
```

浏览器打开 http://localhost:8000 。Worker、ES modules 和 crypto.subtle 需要 HTTP localhost 或 HTTPS，不能直接双击 HTML。

网页支持红/黑执色、0.1–60 秒搜索、合法落点提示、重开、失败重试、棋谱和搜索深度显示。规则沿用 SDK，不宣称完整 CCA2020 认证，也不将搜索深度冒充棋力等级。
