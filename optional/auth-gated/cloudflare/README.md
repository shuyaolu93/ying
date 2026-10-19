# Cloudflare 部署

架构：GitHub Pages 提供网页，Cloudflare Worker 提供 API 网关，Cloudflare Container 运行 `backend/server.py`。

Cloudflare Containers 需要 Workers Paid 方案和本机 Docker。第一次部署：

```bash
cd cloudflare
npm install
npx wrangler login
npx wrangler deploy
```

部署成功后，把前端调用地址设置为 Wrangler 输出的 `https://ronghe-api.<账户>.workers.dev`。

注意：当前容器配置固定为单实例，适合先验证功能。风控状态与审计目前由后端 SQLite 保存；正式多实例部署前，应把状态/审计迁移到 Cloudflare Durable Object SQLite 或 D1，避免实例迁移时只依赖容器文件系统。
