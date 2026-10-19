# 可选登录与卡密模块

这里保留了免费公开版暂时不启用的认证与付费代码：

- `auth.js`：前端登录、注册、会话与兑换逻辑。
- `admin.html`：卡密生成后台。
- `cloudflare/`：Cloudflare Worker、D1 数据库结构及部署配置。
- `core/risk-panel.js`：依赖 Worker 与认证令牌的云端风控面板。
- `tests/browser-regression.cjs`：原认证版的浏览器回归测试。

免费版的根目录 `index.html` 不再加载 `auth.js`，也不再展示登录封面、账户按钮或卡密兑换入口。`app.js` 使用 `:public` 本地存储命名空间，所有草稿和快照只保存在当前浏览器。

重新启用时，需要把本目录的认证界面和脚本按版本控制中的本次拆分前版本恢复到根目录，并恢复账户分区存储；部署 Worker 前还必须设置 `ADMIN_SECRET`，初始化 D1 数据库，并完成安全与并发问题的复查。
