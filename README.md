# Creative Vision Music

本目录用于推进 AI 音乐生成网站项目，目标是快速落地一个独立站 MVP。

## 项目原则

1. 以 `https://www.suno.cn/home/#/create` 为目标页面，优先复刻核心创作流程。
2. 第三方供应商优先使用 `AIZNT`，先接其已公开的 `Suno + Minimax 音乐` 能力，不先自建复杂音乐生成链路。
3. 新项目全部放在 `Creative Vision Music`，本项目是独立项目，不依赖 `ruoyi` 运行。
4. 如需组织、点数和 AI 聚合代理能力，只允许把 `ruoyi` 中可复用实现复制到本项目后再重构。
5. 商业化路径分两条：组织版管理后台、线上个人充值付费版。

## 当前结构

- `apps/web`: 前端创作台与作品页，Vite + React。
- `apps/api`: 独立后端代理层，Express + AIZNT 封装。
- `docs`: 调研、供应商核验、实施方案和拆解文档。
- `scripts/dev.mjs`: 同时启动前后端的开发脚本。

## 当前已完成

- 已完成独立 monorepo 脚手架，不依赖 `ruoyi` 运行。
- 已完成创作台 `/create` 和作品页 `/works` 的首版页面。
- 已完成开发态登录页 `/login`、当前用户接口和个人积分账户初始化。
- 已完成 AIZNT 供应商封装：
  - Suno 歌词提交
  - Suno 音乐提交
  - Suno 任务查询
  - Minimax 音乐生成
- 已完成快速充值窗口 UI 和首版套餐建议。
- 已完成本地任务存储，当前采用浏览器 `localStorage`。
- 已完成 SQLite 本地数据库底座，并把订单主存储切到 SQLite。
- 已在 `2026-03-25` 完成一次依赖安装、前端构建和 API 健康检查验证。

## 快速启动

1. 安装依赖：

```bash
npm install
```

2. 配置环境变量：

```bash
cp .env.example .env.local
```

3. 至少补充以下配置：

```env
AIZNT_API_KEY=你的AIZNT令牌
VITE_API_BASE_URL=http://127.0.0.1:8787
API_HOST=0.0.0.0
API_PORT=8787
WEB_PORT=5173
SQLITE_DB_FILE=apps/data/creative-vision-music.sqlite
ALIPAY_APP_ID=你的支付宝应用APP_ID
ALIPAY_PRIVATE_KEY=你的应用私钥
ALIPAY_PUBLIC_KEY=支付宝应用公钥
ALIPAY_NOTIFY_URL=https://你的公网域名/api/payments/alipay/notify
ALIPAY_RETURN_URL=http://localhost:5173/checkout/result
ALIPAY_GATEWAY=https://openapi.alipay.com/gateway.do
```

4. 启动前后端开发环境：

```bash
npm run dev
```

5. 单独启动 API：

```bash
npm run start:api
```

6. 构建前端：

```bash
npm run build
```

## 当前接口边界

- `GET /api/health`: 本地服务健康检查。
- `POST /api/auth/login`: 创建或复用开发态账号并返回登录令牌。
- `POST /api/auth/logout`: 注销当前登录令牌。
- `GET /api/me`: 查询当前登录用户。
- `GET /api/me/credits`: 查询当前用户积分账户。
- `GET /api/system/bootstrap`: 前端启动配置、价格目录、推荐套餐。
- `POST /api/music/lyrics`: 提交 Suno 歌词生成任务。
- `POST /api/music/generate`: 提交 Suno 或 Minimax 音乐任务。
- `GET /api/music/tasks`: 查询当前用户任务列表。
- `GET /api/music/works`: 查询当前用户作品列表。
- `GET /api/music/tasks/:taskId?provider=suno`: 查询 Suno 任务。
- `POST /api/music/tasks/:taskId/refresh`: 刷新本地任务并同步作品结果。
- `POST /api/payments/alipay/page/create`: 生成支付宝电脑网站支付链接。
- `POST /api/payments/alipay/notify`: 支付宝异步通知回调。
- `GET /api/payments/orders/:orderNo`: 查询支付订单状态。
- `POST /api/payments/orders/:orderNo/reconcile`: 主动向支付宝同步订单状态。

未配置 `AIZNT_API_KEY` 时，页面和本地 API 可以启动，但真实供应商请求会返回未配置提示。

未配置支付宝商户参数时，充值窗口会退回到“人工确认订单”模式；配置完整后会切换为真实支付宝网页支付。

## 支付说明

当前首个真实支付通道选择的是支付宝电脑网站支付，原因很直接：这是网站场景下最快能落地的真实收银台方案。

- `ALIPAY_NOTIFY_URL` 必须是公网可访问地址，否则异步回调收不到。
- 本地开发阶段即便拿不到异步回调，也可以通过支付结果页和订单同步接口主动向支付宝查单。
- 从 `2026-03-25` 开始，API 默认会使用 SQLite 作为正式订单存储，默认文件为 `apps/data/creative-vision-music.sqlite`。
- `apps/data/payment-orders.json` 只保留为历史迁移来源，不再作为主存储。

## 核心文档

- `docs/AI音乐站MVP实施方案.md`
- `docs/AIZNT供应商切换核验-2026-03-24.md`
- `docs/PoloAI控制台核验-2026-03-24.md`
- `docs/一期开发拆解.md`

## 下一阶段

1. 把 AIZNT 实际令牌接入本地环境，完成真实生成联调。
2. 补作品列表的结果标准化和更细的状态映射。
3. 独立实现组织账号、积分扣减、订单与充值链路。
4. 评估是否在一期开放 `music-2.0` 高客单版本。
