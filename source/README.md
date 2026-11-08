# 中国象棋纯 JavaScript 恢复版

这是 **2026-11-02 恢复出的旧 publicSearch 基线**，合入已经确认的三项优化：SDK 历史单着合法性准备、保留自定义生成器兼容性的 `Board.isLegalMove` 单着检查，以及 NNUE `applyColumn` 四路展开。**不是丢失的 latestSearch（b75bd4…）恢复件。**

走法生成、搜索、规则判断和 NNUE 推理均为 JavaScript。没有 native / WASM 替换，没有自动下载、训练、遥测或 npm 依赖。初始基线的 34 个 `engine/` 文件来源已记录；2026-11-08 更新搜索器以省去将军态无用估值及叶节点无用置换表提示查询，并将 NNUE 累加器改为事务式双缓冲，减少临时数组分配；其余 32 个引擎文件保持不变。双缓冲在两轮固定样本 Node 测量中减少约 6.4–7.8% 搜索 CPU，完整搜索及评价签名一致；这不是 Elo 提升或浏览器加速证明。详见 `OPTIMIZATION-20261108.md`。保留源码中的历史 `experimental/` 路径只是为了避免改动导入及文件内容，不代表纳入新的实验候选。

## 运行

Node.js 22+，本次测试使用 v24.22.1。无需 `npm install`。

权重单独提供，**不在源码包内**。使用原始 C07 CC0 文件，不能用其他 Pikafish 权重代替：

- 文件名：`xiangqi-c07e94a5c7cb.nnue`
- 大小：11,261,932 bytes
- SHA-256：`c07e94a5c7cbeae443ed79a8fa412875d833a7f8e04333815e39729c59d52e11`

将它放入 `models/`，或设置外部本地路径：

```sh
export XIANGQI_MODEL_PATH=/absolute/path/xiangqi-c07e94a5c7cb.nnue
npm run verify
npm test
npm run example
```

没有权重时可先运行 `npm run test:unit`。完整 `npm test` 会因缺失或错误权重明确失败，不会静默跳过模型测试。验证器检查源码包，不将可选的 `models/*.nnue` 或 `.git/` 当作分发内容；运行时仍验证权重 SHA-256。

## Node 异步入口

```js
import {START_FEN} from './api.mjs';
import {createNodeClient} from './node-client.mjs';

const client = createNodeClient({
  modelPath: '/absolute/path/xiangqi-c07e94a5c7cb.nnue'
});
try {
  const result = await client.search({
    requestId: 'turn-1',
    fen: START_FEN,
    moves: [],
    historyComplete: true,
    limits: {movetime: 500, depth: 16}
  }, {timeoutMs: 5000});
  console.log(result.status, result.move, result.depth, result.stopReason);
} finally {
  await client.close();
}
```

`modelPath` 可省略：先取 `XIANGQI_MODEL_PATH`，否则使用包内 `models/` 默认文件。相对 `modelPath` 按调用进程工作目录解析。`ready` 可等待 worker 启动；`requestCooperativeStop()` 设置共享取消标记；`cancel()` 或 watchdog 超时会终止 worker，并永久关闭该 client，需要显式新建。

## 可调预算与时间边界

- `limits.movetime`：整数 **1–60,000 ms**，是搜索的**软时限**。
- `limits.nodes`：整数 **1–10,000,000**。
- `limits.depth`：整数 **1–32**，省略时 public facade 使用 16。
- 必须显式提供 `nodes` 或 `movetime`。仅有 `depth` 不足以发起请求。
- 可以组合预算，先达到的停止条件生效。仅 `nodes` 时内部时间预算为 Infinity，不会暗中套用一秒上限；外部传入 Infinity 会被拒绝。
- `timeoutMs`：Node client 的请求 watchdog，整数 **1–120,000 ms**，默认 30,000；worker 启动有独立 10 秒超时。

例如 `movetime: 60000` 应配合 `{timeoutMs: 90000}`，为加载和准备留出余量；否则默认 30 秒 watchdog 会先终止请求。默认深度 16 也可能先达到，需要更深时显式设置，最高 32。

`movetime` 从 Search 内部开始计时，包括其内部历史验证和设置，但**不包括** facade 的预检、模型读取、SHA 验证和解析。JS 运算与规则重放只在检查点响应时间/取消信号，因此它不是完整请求的硬时限保证。Node watchdog 在 worker 就绪后的请求提交阶段开始，覆盖随后读取模型、预检和搜索，并由主线程终止 worker。它仍依赖操作系统及主线程调度，不是实时系统保证。

结果可能只有合法回退着：`status: 'budget-exhausted'`、`depth: 0` 不代表完成了一层搜索。请检查 `terminal`、`status`、`depth`、`stopped`、`stopReason` 和 `completionReason`。终局返回 `move: null`，不需要加载模型。

## 浏览器安全入口与导出

`api.mjs` 的静态依赖闭包仅有本地 JavaScript，无 Node imports。导出：

- `createReference({readModelBytes})`：懒加载、SHA 验证、私有模型；提供异步 `search()`、`dispose()`、`modelLoaded`。
- `loadPinnedModel(bytes)`、`searchWithModel(request, {model, stopFlag, onInfo})`：显式加载及同步搜索。
- `preflight(request)`、`START_FEN`、`MODEL_SHA256`、`SDK_LIMITS`、`REFERENCE`。

package exports：`xiangqi-recovered-js` 指向 facade；`xiangqi-recovered-js/node` 仅导出 Node client；`xiangqi-recovered-js/browser-worker` 指向模块 worker 示例。

**浏览器真实运行仍未验证。** 已通过静态导入闭包检查不等于浏览器/WebWorker实测。请用 module worker 承载同步 Search；即使 `createReference.search()` 返回 Promise，加载完成后的搜索仍会阻塞所在线程，不要放在 UI 主线程。

`worker-demo.mjs` 接收 `{id, request, modelBytes, cancelBuffer?}`，返回 `{id, ok, result}` 或 `{id, ok, error}`。先通过现有页面/文件选择逻辑提供原始 C07 bytes；示例本身不会下载模型。需要 HTTPS 或 localhost 安全上下文的 Web Crypto、现代 ES modules、`structuredClone`。共享取消需要 SharedArrayBuffer 支持及适当跨源隔离；普通取消消息不能中断同步循环，应由宿主页调用 `worker.terminate()`。这个文件是集成示例，不是已测试的完整 UI。

每次 facade 请求新建 Search、TT 和 evaluator cache，仅私有模型跨请求保留。不要将保留整局状态的 benchmark 服务时序直接套到此接口。

## 历史与规则范围

每个请求都要显式提供声明起点 `fen`、从该起点开始的完整合法 `moves`，以及 `historyComplete: true`。实战中固定起点并不断追加每一步；不能把当前局面 FEN 与旧走法拼接。UCI 坐标为 `a`–`i`、`0`–`9`，例如 `a3a4`。空走法可声明一个题目起点，但不能凭空重建此前重复、长将、长捉和计数历史。

facade 固定使用 `pikafish-public-b562` 配置，拒绝冲突选项（例如 `ttBounds: true`）。这是指定版本公开规则适配，不是全部 CCA2020/2026 中国规则的认证，也不是 native UCI 搜索根节点优先级的逐项等价证明。语法和给出的合法转移会检查，历史可达性不认证。

## 验证、性能与许可证

见 [VERIFICATION.md](VERIFICATION.md) 的命令、覆盖范围和旧测试适配记录。旧 FT4 固定节点研究曾得到约 **12% CPU 用时减少**，不代表棋力提升、固定时间强度或浏览器速度保证。本包没有混入失败的 board-pseudo-index / board-attack-index 候选。

代码为 **GPL-3.0-or-later**；原始 C07 权重单独为 **CC0-1.0**。规则及 NNUE 上游来源和许可分别见 [NOTICE.md](NOTICE.md)、`LICENSE`、`licenses/`、`provenance/`。CC0 权重不能解除代码的 GPL 义务，也不许可其他受限网络或训练数据。
