# 免费方案部署

免费方案使用 `wrangler.free.jsonc`，不使用 Containers、不需要 Docker。现在额外使用 D1 保存风控记录：

```bash
cd cloudflare
npx wrangler deploy --config wrangler.free.jsonc
```

首次创建数据库并初始化表：

```bash
npx wrangler d1 create ronghe-db
npx wrangler d1 execute ronghe-db --remote --file=./schema.sql
```

把创建结果里的 `database_id` 写入 `wrangler.free.jsonc`，再重新部署。

已有数据库升级蜡烛图阅读进度同步时，先执行迁移，再部署 Worker：

```bash
npx wrangler d1 execute ronghe-db --remote --file=./migrations/2026-10-26-candle-reading.sql
npx wrangler deploy --config wrangler.free.jsonc
```

已有数据库升级统一管理后台时，先创建登录事件表，再部署 Worker 和网页：

```bash
npx wrangler d1 execute ronghe-db --remote --file=./migrations/2026-10-26-admin-dashboard.sql
npx wrangler deploy --config wrangler.free.jsonc
```

后台入口为站点根目录的 `admin.html`。以配置在 `MESSAGE_ADMIN_USER_ID` 的管理账号登录，便可查看用户、卡密使用、兑换、同步、留言及上线后的登录记录，并生成卡密。普通账号无法读取这些接口；数据库只保存卡密哈希，已生成的卡密明文必须在生成时复制保存。

部署后会得到 `https://ronghe-risk-free.<账户>.workers.dev`。

免费版提供健康检查、独立的数据质量检查和基础确定性风控接口。风控接口目前不会自动读取质量检查结果，调用方需自行决定是否继续；TradeHelper 的完整 pandas/numpy/PyTorch 分析后端需要完整 Python 容器，不能直接放入免费 Workers；后续升级方案后再启用 `wrangler.jsonc` 的 Container 配置。

个人中心的管理员留言列表由 Worker 的 `MESSAGE_ADMIN_USER_ID` 环境变量控制。将其设置为**已核实的管理员账号的数据库 `users.id`**；不要使用可自行注册的账号名作为权限依据。未设置时，个人中心不显示全站留言，管理员仍可通过现有的 `ADMIN_SECRET` 使用 `/api/admin/messages`。修改密码后，所有设备的旧会话都会失效，需要重新登录。
