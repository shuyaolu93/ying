# Ronghe 后端

后端把两个仓库接到同一条链路：

1. `vendor/tradehelper`：分析、策略、回测和数据质量模块；
2. `vendor/riskguard`：仓位限制、回撤熔断、敞口限制、状态持久化和审计；
3. `server.py`：统一 HTTP 接口，把数据质量检查放在风控裁决之前。

启动：

```bash
python3 backend/server.py
```

接口：

- `GET /health`
- `POST /api/analysis/quality`，请求体 `{ "bars": [...] }`
- `POST /api/risk/check`，请求体包含 `symbol`、`side`、`quantity`、`price`、`equity`

状态和审计会写入 `backend/data/`。前端 GitHub Pages 不能运行 Python 进程，部署生产环境时需要把本目录部署到单独的服务器或容器，再把前端 API 地址改成该服务地址。

## 来源说明

- RiskGuard 来源：[SilentFleetKK/riskguard](https://github.com/SilentFleetKK/riskguard)，MIT 许可，许可证副本见 `vendor/RISKGUARD_LICENSE`。
- TradeHelper 来源：[Little-Pr1nce/TradeHelper](https://github.com/Little-Pr1nce/TradeHelper)。该仓库未发现许可证文件；本项目保留来源链接，并将其后端模块置于 `vendor/tradehelper`，后续公开部署前应向原作者确认再分发许可。
