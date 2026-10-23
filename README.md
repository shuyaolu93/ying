# Ying 交易决策研究室（Trading Decision Desk）

Ying 是一个面向个人投资者的交易决策研究工作台，提供宏观象限、决策姿态、估值、单票、组合、风险、行为自检和周复盘等模块，并配套日本蜡烛图形态学习页面。

## 当前版本

- 研究工作台和日本蜡烛图页面均通过 GitHub Pages 在线提供。
- 首次打开需要注册或登录账号，并兑换有效卡密后使用完整内容。
- 个人中心提供账号信息、卡密到期日倒计时、修改密码和留言功能。
- 账号会话、卡密校验和留言接口由配套 Cloudflare Worker 提供；研究草稿和决策快照按账号保存在浏览器中。
- `core/risk-engine.js` 提供仓位上限、回撤熔断、减仓放行、无效价格拒绝和压力测试。
- `backend/` 保留本地分析与风控服务，部署说明见 [`backend/README.md`](backend/README.md)。

## 网页版在线地址

[Ying 网页版](https://shuyaolu93.github.io/ying/)

[日本蜡烛图 · 形态与案例图谱](https://shuyaolu93.github.io/ying/candle.html)

## 本地运行

后端启动：

```bash
python3.12 backend/server.py
```

运行测试：

```bash
npm test
```

浏览器回归测试：

```bash
npm install
npm run test:browser
```

## 文件说明

| 文件 | 说明 |
| --- | --- |
| `index.html` | Ying 交易决策研究室网页入口，包含登录、卡密兑换和个人中心入口 |
| `candle.html` | 日本蜡烛图形态与案例图谱，登录并兑换有效卡密后可访问 |
| `app.js` | 网页版研究逻辑、决策摘要和浏览器端数据管理 |
| `assets/data*.js` | 蜡烛图章节和形态数据 |
| `optional/auth-gated/` | 登录、卡密、个人中心、留言和云端风控相关脚本及部署配置 |
| `core/risk-engine.js` | 本地确定性风控核心 |

## 功能模块

1. 宏观象限（PMI 扩张/收缩 × 流动性参考评分）
2. 决策姿态（进攻 / 防守 / 均衡）
3. 估值区间
4. 单票角色卡
5. 组合配置（自动保持 100%）
6. 风险管理
7. 行为校验
8. 周复盘
9. 日本蜡烛图形态与案例学习

研究数据和快照保存在当前浏览器，并按登录账号区分；卡密到期后需要重新兑换有效卡密才能继续使用受保护内容。

## 来源说明

本仓库整合了交易研究、数据质量和确定性风控相关模块。后端依赖与来源说明见 [`backend/README.md`](backend/README.md)。
