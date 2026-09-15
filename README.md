# dsh-harness-control

> 给 DSH 侧边栏底部加两个按钮：**重启**与**刷新** —— 改完插件不用离开界面，也不用切终端。

DSH 的插件分两半，改动生效的方式不一样：

| 你改了什么 | 生效需要 |
| --- | --- |
| 界面端（`*.client.js`、样式、文案） | **刷新页面** |
| 宿主端（profile 里的插件、`node_modules` 里的包、路由、工具） | **重启 dsh 进程** |

以前这两件事都得靠切回终端（或关掉整个桌面版重开）。本插件把它们放到手边，就在「设置」正上方。

## 它长什么样

宽侧边栏（默认）：

```
<img width="1920" height="1050" alt="Snipaste_2026-09-15_16-59-34" src="https://github.com/user-attachments/assets/70ac73a3-5ab8-4253-bba9-571e1b93a38a" />

```

## 安装

前置：DSH 的 **web profile**（桌面版 `DeepSeekHarness.exe` 用的就是它），以及用于重启的 [dshmarket](https://www.npmjs.com/package/dshmarket)（见「依赖与边界」）。

### 从 GitHub 安装（推荐）

```bash
dsh plugin --profile web add github:<你的用户名>/dsh-harness-control
```

### 从 npm 安装

```bash
dsh plugin --profile web add dsh-harness-control
```

`dsh plugin` 会把参数原样转发给 profile 目录下的 pnpm，并在装完后自动把这个包追加进 `dsh.profile.bundles` —— 不需要手改 profile 文件。

### 桌面版（DeepSeekHarness.exe）没有 `dsh` 命令时

用安装目录里自带的 Node 与 CLI：

```powershell
$base = "D:\aiwork\DeepSeekHarness"          # 你的安装目录
& "$base\node-runtime\node.exe" "$base\app\node_modules\@deepseek-ai\dsh\lib\bin.js" `
    plugin --profile web add github:<你的用户名>/dsh-harness-control
```

装完重启一次 Harness（这一步之后就能用界面里的「重启」了）。

### 手动挂载

在 `<DSH_HOME>/profiles/web/package.json` 里加依赖，并把它加进 `dsh.profile.bundles`，然后在该目录执行 `pnpm install`。

### 从旧的手改补丁迁移过来

如果你之前是直接改官方 `ui-settings-general/lib/client.js`（把两行插进设置那一块）来达到同样效果的，**必须先还原那个补丁再装本插件**，否则两套按钮会同时出现（旧补丁在设置座位上 2 行 + 本插件在槽位上 2 行 = 4 行）。还原通常就是把备份文件覆盖回去（例如 `client.js.bak-*`），然后刷一次页面即可，不需要重启。

## 使用

### 刷新

点一下：清空 Cache Storage → 重新加载页面。

客户端 bundle 是按内容哈希 + `immutable` 缓存下发的，直接 `location.reload()` 有可能仍然拿到旧字节，所以先清缓存再刷新。

### 重启（二次确认）

重启会中断宿主正在跑的一切（包括正在进行的对话轮次），所以是两步：

1. **点「重启」** —— 只把这一行变成确认态，不发任何请求；
2. **点「确认重启」** —— 才真正重启。

确认态下：

| 取消方式 | 说明 |
| --- | --- |
| 点右侧 **✕** | 宽侧边栏有独立取消按钮 |
| 按 **Esc** | 监听器随确认态挂载与卸载 |
| **6 秒**不动 | 自动解除，避免误点后一直待触发 |

窄栏（56px）放不下两个按钮，那里确认态就是同一个圆形按钮变成错误色，取消靠 Esc 与超时。

### 失败时会怎样

按钮不会假装成功 —— 失败会写在行内文案与 tooltip 里：

| 情况 | 表现 |
| --- | --- |
| 没有装 dshmarket（找不到重启接口） | 行变「重启失败」，tooltip 说明找不到重启接口 |
| 宿主不允许自行重启（systemd/launchd 等 supervisor、或进程被调试器附着） | 行变「重启失败」，tooltip 说明被保护 |
| 有插件操作持锁（HTTP 409） | 自动重试约 12 秒，仍失败才报错 |
| 重启后 90 秒内等不到新的 boot id | 「重启失败」，提示手动重启 |

## 依赖与边界

- **重启依赖 dshmarket**。重启不是本插件自己实现的，而是调用 dshmarket 自己那套"一键重启"接口（它已经处理好了跨平台重启方式、回环同源校验、supervisor/调试器拒绝、以及操作锁）。这样本插件不需要成为"第二条杀掉宿主的路"。没装 dshmarket 时「刷新」照常可用，「重启」会明确报错。
- **只对 web profile 生效**。插件注册的是 `sidebar.footer.action` 这个界面插槽，非 web profile 不会加载界面半边。
- **桌面版（Electron 外壳）的一个已知副作用**：dshmarket 的重启会把服务交给一个 detached 进程，Electron 主进程不再持有它；关窗后它仍占着固定端口（并锁住 `node_modules` 里的文件），下次启动就会 `EADDRINUSE` 并悄悄连到旧进程上。这是 dshmarket 重启机制的固有行为，不是本插件引入的；受影响的部署可以在自己外壳的退出流程里释放该端口（本仓库本地开发时用的补丁就是这么做的）。

## 设计取舍

1. **注册插槽，而不是打补丁。** 两个按钮注册进 ui-sidebar 声明的 `sidebar.footer.action`（渲染在 `settingsArea` 之前，所以天然在「设置」上方）。不改官方 `ui-settings-general`，因此可以随装随卸，也不会在下一次 DSH 升级时被覆盖。
2. **几何是复刻，不是继承。** 插槽只把列宽状态（`wide`）交给注册者，官方那行用的是哈希过的 CSS Module 类名，外部无法导入。所以本插件用自己的 `hc-*` 类名重述同一套几何与令牌，并用测试锁住这些声明。
3. **重启走 dshmarket 的接口。** 见上一节：少一条独立实现，就少一处能杀掉宿主的地方。
4. **确认是行内的，不是弹窗。** 确认态就出现在点击的位置，窄栏也能渲染，且不必和其他插件的遮罩层抢 z-index。
5. **宿主半边是空的。** 本插件不需要宿主能力：重启交给 dshmarket，刷新浏览器自己能做。空宿主半边意味着它能在任何 web profile 上安装，不注册路由、不写磁盘。

## 开发

```
dsh-harness-control/
├── lib/index.js        宿主半边：空实现（挂载点）
├── lib/client.js       界面半边：唯一需要读的文件，手写、无需构建
├── cordis.patch.yml    bundle 层：把插件行插进 profile
├── test/shim.mjs       零依赖的 React 替身 + 页面替身
├── test/client.test.mjs
└── package.json
```

跑测试（**零依赖**，直接装在裸 Node 上就能跑）：

```bash
node --test test/          # 或 node test/client.test.mjs
```

测试做了这些事：加载真实的 `lib/client.js`（走 `window.__ModuleLoader__.load`）→ 以桩服务调用 `apply(ctx)` → 渲染宽栏/窄栏/确认态 → 模拟点击，用桩网络与桩定时器验证：首次点击不发请求、确认后才 POST、取消能解除、刷新先清缓存再 reload、宿主拒绝时落到「重启失败」。另外还会校验中英词条键集一致、以及样式声明与官方触发按钮逐条相同。

设了 `DSH_HOME` 时，最后一个测试会去读已安装的官方 `ui-settings-general/lib/client.js`，把本插件的 `.hc-trigger` / `.hc-trigger-rail` 声明与它逐条比对；没装 DSH 的环境会自动跳过。**改了 `lib/client.js` 里的 CSS 数组后，如果官方那行变了，这个测试会失败** —— 这正是它存在的意义。

改文案：`lib/client.js` 里的 `zh` / `en` 两个字典（键集必须一致）。改几何：同一个文件顶部的 `css` 数组。

## 卸载

```bash
dsh plugin --profile web remove dsh-harness-control
```

然后重启一次 Harness。插件不写任何持久状态，卸载后除了这两行按钮消失，没有任何残留。

## 兼容性

- DSH `0.1.5-rc.2` / dshmarket `1.47.0` 上开发并测试。
- 界面半边只依赖 web 外壳静态模块表里的 `react` 与 `@deepseek-ai/dsh-client-ui-primitives`，不 require 任何 Node 侧能力。
- 宿主半边只 export 一个空的 `apply`，对 DSH 版本没有要求。

## License

[MIT](./LICENSE)
