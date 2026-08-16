# WordLeaf

WordLeaf 是一个英→中的英语电子闪卡 Web App。你可以从 500 个高频核心词中挑选想学的内容，再用 FSRS 安排复习。

## 功能

- 搜索、筛选、批量加入或移出学习计划
- 每轮最多 10 张卡：到期复习优先，其余按加入顺序补充新词
- 卡片包含音标、中文释义、双语例句与浏览器英语发音
- 用“忘记 / 困难 / 记得 / 轻松”自评，按 FSRS-6 计算下次复习时间
- 学习计划、卡片状态和复习记录只保存在浏览器 IndexedDB 中
- 支持手机和桌面布局、键盘操作及基础无障碍

## 本地运行

需要 Node.js 22.13 或更高版本。

```bash
npm install
npm run dev
```

浏览器打开终端显示的本地地址。看到 WordLeaf 首页即表示启动成功。

## 验证

```bash
npm test
npm run lint
```

`npm test` 会执行正式构建，并验证词库、学习队列和四种 FSRS 评分。全部命令退出码为 `0` 即表示通过。

## 数据与隐私

词库由 MIT 许可的 [ECDICT](https://github.com/skywind3000/ECDICT) Oxford 核心词条筛选、去重并按频率排序。双语例句来自 MIT 许可的 `@polyglot-bundles/parallel-text-base` 与 `@polyglot-bundles/zh-parallel-text`，经过字段完整性检查。详情见 [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)。

应用没有账号、后端数据库或云同步。学习数据不会写入 GitHub，也不会上传到部署服务器；清除该网站的浏览器数据会删除学习记录。

## 技术栈

React、TypeScript、vinext、Dexie（IndexedDB）与 `ts-fsrs`。项目面向 Codex Sites 构建，由 Cloudflare 承载。

## 许可

应用源码使用 [MIT License](./LICENSE)。第三方数据和依赖保留各自许可。

