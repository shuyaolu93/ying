# Ronghe 融合交易决策台（Trading Decision Desk）

> 本仓库以 Lianghua 的前端角色台为基础，逐步吸收 TradeHelper 的数据质量与测试思路，以及 RiskGuard 的确定性风控边界。当前仍是个人研究与复盘工具，不连接真实资金，也不构成投资建议。

## 当前融合状态

- 原始版本保存在 `original-lianghua` 分支和 `v2.3.0-original` 标签。
- `core/risk-engine.js` 提供仓位上限、回撤熔断、减仓放行、无效价格拒绝和压力测试。
- `backend/` 已接入两个仓库的 Python 后端：TradeHelper 的分析/数据质量/策略/回测模块，以及 RiskGuard 的风控/持久化/审计模块。
- `cloudflare/` 提供 Cloudflare Worker + Container 部署配置。
- 网页版已移除单笔仓位计算器和风控闸门面板；八个研究模块在前端运行，账户与卡密由 Worker 提供。
- `tests/risk-engine.test.js` 提供 Node.js 内置测试，不依赖第三方测试框架。

后端启动：

```bash
python3.12 backend/server.py
```

后端提供 `/api/analysis/quality` 和 `/api/risk/check`。风控状态及审计记录保存于 `backend/data/`。GitHub Pages 只能运行前端，生产使用时需要把后端部署到单独的服务器或容器，具体说明见 [`backend/README.md`](backend/README.md)。

Cloudflare 部署配置见 [`cloudflare/README.md`](cloudflare/README.md)。Cloudflare Containers 需要 Workers Paid 方案。

运行测试：

```bash
npm test
```

一个面向个人投资者的交易决策工作台：从宏观象限 → 决策姿态 → 估值 → 单票 → 组合 → 风险 → 行为 → 周复盘，全流程引导记录交易决策，并自动生成决策摘要。

## 文件说明

| 文件 | 说明 |
| --- | --- |
| `index.html` | 网页版布局，加载同目录的 `app.js`、`auth.js`，部署于 Ronghe GitHub Pages |
| `交易决策研究室-小红书小工具-v2.3.0.zip` | 小红书小工具版（符合小红书 minitool 规范，zip 根目录为 `index.html` + `app.js`，上传至小红书创服平台发布） |
| `app.js` | 网页版研究逻辑；历史小红书 ZIP 为独立版本，本次修复未更新该 ZIP |

## 网页版在线地址

Ronghe 网页版在线地址：

https://shuyaolu93.github.io/ronghe/

## 功能模块

1. 宏观象限（PMI 扩张/收缩 × 流动性参考评分；不推断通胀）
2. 决策姿态（进攻 / 防守 / 均衡）
3. 估值区间
4. 单票角色卡
5. 组合配置（自动保持 100%）
6. 风险管理
7. 行为校验
8. 周复盘

研究草稿、决策快照和行为暂停截止时间保存在当前浏览器，并按账户 ID 分区；账户、密码校验与卡密通过 Cloudflare Worker / D1 处理。研究记录尚未提供跨设备云同步。

## 网页版 2.4.0 规则与验证

- 宏观数据不再预填数值或自动伪造发布日期。须填写实际来源，PMI/社融/M2 复核期限 45 天，国债数据 7 天；未来日期或过期数据阻止正式结论。
- PMI 水平相对 50 判断扩张/收缩，较上期变化单独描述。流动性权重、PB/PS 修正系数、参考区间 ±15% 和仓位预设均为自定义研究假设，尚未回测校准。
- DDM 使用下一年度股息 / (股权成本 − 永续增长率)，PEG 使用 EPS × 增速百分数 × 目标 PEG。买入须估值偏低、相对模型中心折价至少 15%、人工确认并填写三项证据；DDM 利差不足 1 个百分点时不通过买入检查。
- 风险检查要求填写止损或逻辑失效条件，单票 ≤15%、杠杆 ≤20%。行为高风险产生 24 小时本地暂停，重置、取消勾选和刷新不会解除，到期后重新回答五问。此机制是浏览器内研究纪律，并非服务器端交易拦截。
- 卡密无效或到期时展示封面与兑换入口，每分钟复核账户状态。GitHub Pages 的静态源码仍可公开访问；真正受保护的操作必须由后端核验卡密。
- 旧版未区分账户的本地存储保留原样，不自动归属给任何登录账户；旧规则快照不能直接作为新规则执行结论。
- `npm test` 运行风控核心测试；`npm install` 后运行 `npm run test:browser` 执行 Chrome 端回归测试。测试使用模拟认证接口，不修改线上账户或数据库。

## 使用提示

- 网页版：通过网站地址打开，登录并兑换有效卡密后使用，研究数据按账户保存在当前浏览器
- 小红书版：将 zip 上传到小红书创作者服务平台 → 小工具 → 上传发布，平台内验证后可在笔记中挂载
