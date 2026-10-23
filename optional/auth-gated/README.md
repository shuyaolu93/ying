# Ying 登录与卡密模块

此目录包含 Ying 网页当前使用的账号、卡密和个人中心代码。

- `auth.js`：交易决策研究室的登录、注册、兑换、个人中心和留言界面。
- `candle-gate.js`：日本蜡烛图页面的登录和卡密有效期检查。
- `admin.html`：卡密生成后台页面。
- `cloudflare/free-worker.js`：Cloudflare Worker 的账号、卡密和留言接口。
- `cloudflare/schema.sql`：D1 数据表结构。
- `core/risk-panel.js`：可选的云端风控面板。

前端部署在 GitHub Pages。账号、密码哈希、卡密和留言存储在 Cloudflare D1；研究草稿与决策快照保存在用户当前浏览器，并按账号区分。部署 Worker 时需要配置 D1 绑定和 `ADMIN_SECRET`，详见 [`cloudflare/FREE_PLAN.md`](cloudflare/FREE_PLAN.md)。
