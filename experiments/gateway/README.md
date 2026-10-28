# Gateway 实验原型

从仓库根目录迁入的早期 Python 原型，未接入客户端构建、npm 测试或 CI：

- `gateway-proto.py`：基于 `aiohttp` 的 HTTP / SSE / WebSocket 网关；通过 `GATEWAY_ROUTES_CONFIG` 指定配置，默认读取 `/tmp/gateway-routes.json`。
- `mock-heartcore.py`：配套模拟 Heart 服务；位置参数为名称和端口，默认 `test`、`4001`。

两个脚本均依赖 Python 与 `aiohttp`，本目录没有锁定依赖或自动化验收。本次只迁移保留，未启动服务或验证部署行为。

客户端的实际代理入口是 [Electron ChatProxy](../../desktop/main/chat/proxy.ts) 和 [Web proxy](../../web/proxy.mjs)。项目结构见[文档导航](../../docs/README.md)。
