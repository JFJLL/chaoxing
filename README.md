# 文化产院管理学院课程平台

这是一个基于 Next.js、Prisma 和 SQLite 的课程空间系统，包含课程、专题、收件箱、小组、笔记、通讯录、云盘、论文检测、直播和 AI 文档建课等功能。

## 默认账号

执行 `npm run db:seed` 后会生成以下演示账号：

| 角色 | 邮箱 | 密码 |
| --- | --- | --- |
| 教师 | `li.suyan@example.local` | `Teacher@2026` |
| 教师 | `wang.yifan@example.local` | `Teacher@2026` |
| 学生 | `student@example.local` | `Student@2026` |

生产环境请尽快修改默认密码，或改造为后台账号管理/统一身份认证。

## 默认邀请码

执行 `npm run db:seed` 后会生成以下演示邀请码：

| 邀请码 | 类型 | 用途 |
| --- | --- | --- |
| `COURSE2026` | 课程 | 学生在课程页点击“添加课程”后输入，可加入示例课程 |
| `GROUP2026` | 小组 | 通过顶部邀请码入口输入，可加入示例小组 |
| `DRIVE2026` | 云盘分享 | 用于演示云盘分享访问计数 |
| `LIVE2026` | 直播 | 通过顶部邀请码入口输入，可加入示例直播 |

云盘文件点击“分享”时，也会自动生成类似 `DRIVE-XXXXXX` 的分享码。

## 本地启动

```bash
npm install
npm exec prisma -- migrate deploy
npm run db:seed
npm run build
npm run start -- --port 3014
```

开发模式：

```bash
npm run dev -- --port 3014
```

## 服务器部署

服务器需要配置 `.env`，不要直接上传本地 `.env`。

示例：

```env
DATABASE_URL="file:./dev.db"
SESSION_SECRET="replace-with-a-long-random-secret"
OPENAI_API_KEY=""
OPENAI_BASE_URL="https://api.openai.com/v1"
OPENAI_MODEL="gpt-4.1-mini"
UPLOAD_DIR="./.uploads"
```

首次部署或覆盖代码后执行：

```bash
npm ci
npx prisma generate
npx prisma migrate deploy
npm run build
pm2 restart cuc --update-env
```

如果是第一次部署且需要演示数据：

```bash
npm run db:seed
```

## 常用检查命令

```bash
npm run typecheck
npm run test
npm run build
npm run verify
```

`npm run verify` 会清理构建产物后依次执行类型检查、单元测试和生产构建。

## 使用注意事项

- `next start` 只能启动已经执行过 `npm run build` 的项目。
- 如果登录时报 `User table does not exist`，说明还没有执行 `npm exec prisma -- migrate deploy`。
- 如果服务器 build 扫描到临时目录导致失败，请删除项目根目录下的 `temp/` 等临时目录。
- 本项目使用 SQLite，默认数据库文件是 `prisma/dev.db`。生产环境需要做好文件备份。
- `.uploads/` 是上传文件目录，生产环境需要保留并备份。
- 当前没有开放注册页面，账号由 seed 或后台/数据库初始化产生。
- 学生加入课程主要通过课程邀请码完成。
