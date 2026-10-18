# 免费方案部署

免费方案使用 `wrangler.free.jsonc`，不使用 Containers、不需要 Docker：

```bash
cd cloudflare
npx wrangler deploy --config wrangler.free.jsonc
```

部署后会得到 `https://ronghe-risk-free.<账户>.workers.dev`。

免费版提供健康检查、数据质量门和基础确定性风控接口。TradeHelper 的完整 pandas/numpy/PyTorch 分析后端需要完整 Python 容器，不能直接放入免费 Workers；后续升级方案后再启用 `wrangler.jsonc` 的 Container 配置。
