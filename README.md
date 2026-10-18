# Ronghe 融合交易决策台（Trading Decision Desk）

> 本仓库以 Lianghua 的前端角色台为基础，逐步吸收 TradeHelper 的数据质量与测试思路，以及 RiskGuard 的确定性风控边界。当前仍是个人研究与复盘工具，不连接真实资金，也不构成投资建议。

## 当前融合状态

- 原始版本保存在 `original-lianghua` 分支和 `v2.3.0-original` 标签。
- `core/risk-engine.js` 提供仓位上限、回撤熔断、减仓放行、无效价格拒绝和压力测试。
- `backend/` 已接入两个仓库的 Python 后端：TradeHelper 的分析/数据质量/策略/回测模块，以及 RiskGuard 的风控/持久化/审计模块。
- 网页版角色台的单笔仓位计算器已接入风控核心。
- `tests/risk-engine.test.js` 提供 Node.js 内置测试，不依赖第三方测试框架。

后端启动：

```bash
python3.12 backend/server.py
```

后端提供 `/api/analysis/quality` 和 `/api/risk/check`。风控状态及审计记录保存于 `backend/data/`。GitHub Pages 只能运行前端，生产使用时需要把后端部署到单独的服务器或容器，具体说明见 [`backend/README.md`](backend/README.md)。

运行测试：

```bash
npm test
```

一个面向个人投资者的交易决策工作台：从宏观象限 → 决策姿态 → 估值 → 单票 → 组合 → 风险 → 行为 → 周复盘，全流程引导记录交易决策，并自动生成决策摘要。

## 文件说明

| 文件 | 说明 |
| --- | --- |
| `index.html` | 网页版（自包含单文件，双击或在浏览器打开即用），已部署到 Ronghe GitHub Pages |
| `交易决策研究室-小红书小工具-v2.3.0.zip` | 小红书小工具版（符合小红书 minitool 规范，zip 根目录为 `index.html` + `app.js`，上传至小红书创服平台发布） |
| `app.js` | 小工具版源码（与 zip 内一致） |

## 网页版在线地址

Ronghe 网页版在线地址：

https://shuyaolu93.github.io/ronghe/

## 功能模块

1. 宏观象限（增长 × 通胀 → 四象限）
2. 决策姿态（进攻 / 防守 / 均衡）
3. 估值区间
4. 单票角色卡
5. 组合配置（自动保持 100%）
6. 风险管理
7. 行为校验
8. 周复盘

数据保存在浏览器本地（localStorage / 飞书容器存储），不上传任何服务器。

## 使用提示

- 网页版：任意现代浏览器打开即可，数据本地保存
- 小红书版：将 zip 上传到小红书创作者服务平台 → 小工具 → 上传发布，平台内验证后可在笔记中挂载
