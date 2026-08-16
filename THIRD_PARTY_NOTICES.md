# Third-party notices

WordLeaf 的静态词库使用了以下 MIT 许可资源：

## ECDICT

- 项目：https://github.com/skywind3000/ECDICT
- 用途：Oxford 核心词标记、词频、音标与中文释义
- 许可：MIT License
- 处理：筛选核心词，排除异常项与重复项，按频率排序并保留 500 个字段完整的唯一词条

## Polyglot parallel-text bundles

- 包：`@polyglot-bundles/parallel-text-base`、`@polyglot-bundles/zh-parallel-text`
- 项目：https://www.npmjs.com/org/polyglot-bundles
- 用途：英文例句及其简体中文对译
- 许可：MIT License
- 处理：按句对对齐，匹配词形，优先采用简短完整句，并进行字段完整性检查

以上数据已经转换为 `app/data/vocabulary.json`，随应用静态发布。第三方资源的权利归各自作者所有。

