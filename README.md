# 文化产院管理学院课程平台

这是一个基于 **Next.js、Prisma 和 SQLite** 的教师与学生课程空间系统，提供课程管理、云盘、专题、小组、笔记、直播、课程 Copilot、AI 文档建课、图像课件、积分充值和师生收信箱等能力。

## 核心能力

| 功能 | 说明 |
|---|---|
| 课程与教学资料 | 教师可创建课程、组织章节、维护课程云盘和资料库；学生可通过课程邀请码加入课程。 |
| AI 备课 | 基于课程资料生成教案、AI 课件、题目和试卷。非图像类调用会记录模型供应商直接返回的实际 Token usage。 |
| GPT Image 2 图像课件 | 已确认的 AI 课件可按页生成 16:9 整页视觉 PPT；导出时将整页图片铺满幻灯片，并叠加项目 Logo。每页支持单独重新生成。 |
| 积分与充值 | 每位教师初始获得 10 积分。图像 PPT 每个成功页面消耗 1 积分；失败、系统异常或尚未发出请求的取消页面按规则释放积分。支持支付宝电脑网站支付与微信支付 V3 Native 扫码。 |
| 管理员控制台 | `ADMIN` 可查看全量课程、用户、订单、积分账本和 AI 用量，并可为其他用户加减可用积分。管理员不会作为通讯录或收信箱中的普通联系人出现。 |
| 教师新手引导 | 教师首次登录后会看到锚定真实控件的小气泡引导，依次介绍课程、资料、AI 课件、PPT 和收信箱入口。引导只说明操作位置和结果，不替教师执行操作。 |
| 收信箱 | 三栏收信箱支持图片预览、本地文档附件、云盘引用文件、快速回复、归档与删除。消息双方才可读取附件。 |

## 业务规则

### 图像课件与积分

图像课件会先按总页数冻结积分；供应商成功生成并保存一页后，系统才消耗该页的 1 积分。图像页面是视觉底图，PowerPoint 中不能像普通文本框一样直接编辑；教师可在平台保留的结构化 AI 课件中修改内容，再重新生成需要调整的页面。

| 场景 | 积分处理 |
|---|---:|
| 教师首次账户初始化或存量教师补发 | 幂等赠送 10 积分 |
| 新建 `N` 页图像课件 | 冻结 `N` 积分 |
| 单页成功生成 | 消耗 1 积分 |
| 单页重新生成 | 成功后再消耗 1 积分 |
| 图像供应商或系统失败 | 释放尚未成功生成页面的积分 |
| 排队期间取消 | 释放尚未发出请求页面的积分 |

图像课件采用暖白底、中国红 `#C92E2E`、教育蓝 `#1D5FAF` 和生态绿 `#118A45` 的课程视觉体系。首张页面为章节首页，包含章节名称、课程名称、本章要点和学习目标；生成提示词禁止出现页码、`X/Y` 或页脚进度。

### 充值套餐与订单

基础规则为 **1 元 = 1 基础积分**。阶梯套餐的额外额度会以赠送积分单独入账，订单与积分账本会保留基础积分、赠送积分和支付流水。

| 套餐 | 实付金额 | 基础积分 | 赠送积分 | 最终到账 |
|---|---:|---:|---:|---:|
| 轻量包 | ¥10 | 10 | 0 | 10 |
| 备课包 | ¥30 | 30 | 3 | 33 |
| 学期包 | ¥100 | 100 | 15 | 115 |
| 学年包 | ¥300 | 300 | 60 | 360 |

待支付订单可以取消。系统会先调用对应支付渠道关单，再关闭本地订单；已到账订单不会取消或撤销积分。支付成功页面、前端轮询结果均不会直接加积分，只有服务端完成通知验签、金额和订单校验、重复通知幂等校验后才会入账。

### 管理员与实际 Token 用量

管理员是最高权限角色，可访问管理员控制台 `/space/admin`、查看全量课程和订单、为用户调整可用积分，并按教师或课程查看 AI 调用数、已回传 usage 次数、输入 Token、输出 Token 和实际总量。Token 统计**只**汇总供应商响应中返回的 usage；未返回完整 usage 的调用标记为不可获取，仍计入调用数，但不会混入实际 Token 总量。

管理员不会出现在通讯录、收信箱收件人列表或普通消息查询中；管理员账户进入收信箱会回到管理员控制台。

### 教师新手引导

教师首次登录会从欢迎说明开始，点击“下一步”后再依次定位课程页和课程工作台中的真实入口。气泡底部只提供“跳过”和“下一步”，教师自行完成实际操作。

引导步骤为：欢迎说明、新建课程、课程文档导入、课程资料上传、生成 AI 课件、生成正式 PPT、收信箱写消息。引导以成功登录签发的新会话为准，不以 IP、地区、刷新或标签页次数判断；同一登录会话不会重复显示。未完成时最多自动出现 3 次，相邻两次自动提示至少间隔 24 小时；之后教师可从账户菜单的“重新查看新手引导”主动重新开始。

### 收信箱附件

教师和学生可以在一条消息中发送图片、本地文档，或引用云盘文件。支持 JPG、JPEG、PNG、WEBP、PDF、DOCX、PPTX、TXT 和 Markdown；每条消息最多 5 个本地附件和 5 个云盘引用文件，单个本地附件不超过 15MB。图片可在消息详情中预览，文档通过私有下载接口提供，云盘引用会跳转到对应云盘文件。

## 默认账号

执行 `npm run db:seed` 后会生成以下演示账号：

| 角色 | 邮箱 | 密码 |
| --- | --- | --- |
| 教师 | `li.suyan@example.local` | `Teacher@2026` |
| 教师 | `wang.yifan@example.local` | `Teacher@2026` |
| 学生 | `student@example.local` | `Student@2026` |

生产环境请尽快修改默认密码，或改造为后台账号管理、统一身份认证。

管理员不会自动指定。目标账户已存在后，可执行以下命令提升其角色；该用户需要重新登录以刷新会话权限：

```bash
npm run admin:promote -- 管理员邮箱
```

## 默认邀请码

执行 `npm run db:seed` 后会生成以下演示邀请码：

| 邀请码 | 类型 | 用途 |
| --- | --- | --- |
| `COURSE2026` | 课程 | 学生在课程页点击“添加课程”后输入，可加入示例课程 |
| `GROUP2026` | 小组 | 通过顶部邀请码入口输入，可加入示例小组 |
| `DRIVE2026` | 云盘分享 | 用于演示云盘分享访问计数 |
| `LIVE2026` | 直播 | 通过顶部邀请码入口输入，可加入示例直播 |

云盘文件点击“分享”时，也会自动生成类似 `DRIVE-XXXXXX` 的分享码。

## 课程 Copilot

教师先在 Copilot 设置中绑定课程云盘文件夹；课程资料上传和 AI 文档导入会写入该文件夹。学生可以在私密对话中主动 `@` 文档或静态图片，不会默认加载整个文件夹。每个对话最多添加 5 个文件，文档正文合计不超过 100,000 字符，单张图片不超过 10MB、图片合计不超过 20MB。学生每日调用上限由 `COPILOT_DAILY_LIMIT` 配置，默认 100 次；教师只查看近 7 日匿名汇总，不查看学生对话内容。

## 配置

所有密钥必须只保存在部署环境或本地私密 `.env.local` 中，**不得**写入客户端代码或提交到版本库。完整无密钥变量模板见 [`.env.example`](./.env.example)。除了数据库、会话、模型和上传目录配置外，图像课件和支付功能需要以下服务端变量：

```dotenv
# Keystone GPT Image 2
KEYSTONE_IMAGE_GENERATION_URL="https://keystonehk.ai/v1/images/generations"
KEYSTONE_IMAGE_EDIT_URL="https://keystonehk.ai/v1/images/edits"
KEYSTONE_IMAGE_API_KEY=""
KEYSTONE_IMAGE_MODEL="gpt-image-2"
KEYSTONE_IMAGE_ASPECT_RATIO="16:9"
KEYSTONE_IMAGE_RESOLUTION="1k"
KEYSTONE_IMAGE_QUALITY="medium"

# 支付宝
ALIPAY_ENABLED="true"
ALIPAY_APP_ID=""
ALIPAY_PRIVATE_KEY=""
ALIPAY_PUBLIC_KEY=""
ALIPAY_SELLER_ID=""
ALIPAY_NOTIFY_URL="https://你的公开域名/api/payments/alipay/notify"
ALIPAY_RETURN_URL="https://你的公开域名/space/billing"

# 微信支付 V3 Native
WXPAY_ENABLED="true"
WXPAY_APP_ID=""
WXPAY_MCH_ID=""
WXPAY_MERCHANT_SERIAL_NO=""
WXPAY_PRIVATE_KEY=""
WXPAY_API_V3_KEY=""
WXPAY_PLATFORM_PUBLIC_KEY=""
WXPAY_PLATFORM_PUBLIC_KEY_ID=""
WXPAY_NOTIFY_URL="https://你的公开域名/api/payments/wxpay/notify"
```

支付宝和微信的通知地址必须是支付平台可访问的公网 HTTPS 地址。私钥或证书公钥若通过单行环境变量配置，应以 `\n` 表示换行，服务端会恢复真实换行。

## 本地启动

```bash
npm install
npx prisma generate
npx prisma migrate deploy
npm run db:seed
npm run dev
```

## 生产部署

服务器需要配置私密 `.env`，不要上传本地 `.env`。首次部署或覆盖代码后执行：

```bash
npm ci
npx prisma generate
npx prisma migrate deploy
npm run billing:backfill-teacher-credits
npm run build
pm2 restart cuc --update-env
```

其中 `npm run billing:backfill-teacher-credits` 可重复运行，不会让同一教师重复获得初始积分。若本地开发服务在 Prisma 模型或迁移更新前已运行，应重启服务后再验收。

## 常用检查命令

```bash
npm run typecheck
npm test
npm run build
npm run verify
```

`npm run verify` 会清理构建产物后依次执行类型检查、单元测试和生产构建。

## 使用注意事项

- `next start` 只能启动已经执行过 `npm run build` 的项目。
- 如果登录时报 `User table does not exist`，说明还没有执行 `npx prisma migrate deploy`。
- 本项目使用 SQLite，默认数据库文件是 `prisma/dev.db`；生产环境需要做好数据库文件备份。
- `.uploads/` 是私有上传文件目录，生产环境需要保留并备份。
- 当前没有开放注册页面，账号由 seed 或后台/数据库初始化产生。
- 学生加入课程主要通过课程邀请码完成。
