# Ying 登录与卡密模块

此目录包含 Ying 网页当前使用的账号、卡密和个人中心代码。

- `auth.js`：交易决策研究室的登录、注册、兑换、个人中心和留言界面。
- `candle-gate.js`：日本蜡烛图页面的登录和卡密有效期检查。
- 根目录 `admin.html`：管理账号使用的统一后台，查看账号、卡密、兑换、登录记录、同步状态和留言，并生成卡密。旧路径 `optional/auth-gated/admin.html` 会跳转到新入口。
- `cloudflare/free-worker.js`：Cloudflare Worker 的账号、卡密和留言接口。
- `cloudflare/candle-data-worker.js`：验证会话和有效卡密后，从同一个 D1 数据库提供蜡烛图图谱。
- `cloudflare/schema.sql`：D1 数据表结构。
- `core/risk-panel.js`：可选的云端风控面板。

前端部署在 GitHub Pages。账号、密码哈希、卡密和留言存储在 Cloudflare D1；研究草稿与决策快照保存在用户当前浏览器，并按账号同步到 D1。统一后台通过已登录管理账号的会话和 `MESSAGE_ADMIN_USER_ID` 授权，原有 `ADMIN_SECRET` 接口仍可用于卡密生成；详见 [`cloudflare/FREE_PLAN.md`](cloudflare/FREE_PLAN.md)。登录事件仅从后台功能上线后开始记录，不保存登录 IP 或明文密码。

图谱数据另存在 D1 的 `candle_assets` 表（建表语句见 `cloudflare/candle-data.sql`），公开 Pages 不再包含 `assets/data*.js`。图谱 JSON 原稿须单独保存于私有位置；公开 Git 历史中的旧文件仍可被访问。
