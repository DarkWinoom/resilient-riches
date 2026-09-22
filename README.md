# 稳健生财

个人理财记账小应用，可自定义分类进行全面整合统计，支持按天录入。数据均保存在本地，一键部署，简单易用。

![理财概览、资产走势与固定周月持仓指标](assets/screenshots/overview.jpg)

## 使用

- **新增分类**：填写启用日期、初始资金和历史盈亏。“参与统计”默认开启；关闭后仍可单独记录与查看，但不进入概览和报表。
- **记录盈亏**：填写当日余额、转入和转出，实时预览盈亏。分类较多时自动使用可搜索的分类选择器。悬停右上按钮可直接进入单分类；修改后才能保存，补录历史日期时保存后继续录入。
- **查看表现**：周、月、年、总四种范围，默认周。切换收益率或资产轨迹；持仓表的周、月、累计指标固定，拖动左侧手柄可保存排序。

![记录盈亏与累计收益预览](assets/screenshots/daily-entry.jpg)

<details>
<summary>分类详情与报表</summary>

![分类详情与资产走势](assets/screenshots/category-detail.jpg)

![收益报表](assets/screenshots/monthly-report.jpg)

报表可导出PNG，并隐藏金额或分类。没有实际记录的期间不可分享。

</details>

## 部署与更新

需要 Docker Desktop 或 Docker Engine + Compose：

```sh
git clone https://github.com/DarkWinoom/resilient-riches.git
cd resilient-riches
docker compose up -d --build
```

访问 [http://127.0.0.1:8888](http://127.0.0.1:8888)。端口等配置见 [.env.example](.env.example)。应用没有登录，远程访问请自行限制入口权限。

更新前备份，并保留原目录、Compose项目名和数据卷：

```sh
docker compose exec app node apps/server/dist/backup.js data/backups/before-update.sqlite
docker compose cp app:/app/data/backups/before-update.sqlite ./ledger-backup.sqlite
git pull --ff-only
docker compose up -d --build
```

每次备份使用新文件名。**不要执行 `docker compose down -v` 或删除 `ledger-data` 卷。** 数据库自动升级；回退旧版本须停机恢复升级前备份。恢复命令为 `node apps/server/dist/restore.js <备份路径>`，先预览，确认后添加 `--confirm`。

<details>
<summary>Node.js 本机部署</summary>

使用 Node 22.22.2+（22系列）、pnpm 11.19.0，依次运行 `pnpm install --frozen-lockfile`、`pnpm build`、`pnpm start`。默认访问 [8080](http://127.0.0.1:8080)，数据位于 `data/resilient-riches.sqlite`。

</details>

## 收益怎么算

当日本金＝上次余额＋当日转入－当日转出；当日盈亏＝当日余额－当日本金。

收益率按**复利**计算：`∏(1 + 每日收益率) − 1`，不是简单相加。例如先涨10%、再跌10%，最终为−1%。修改历史记录会重算后续结果；未录入日沿用上次余额，不要求每天记账。

初始资金是启用时的实际余额，已包含历史盈亏。初始资金及“初始资金−历史盈亏”都为正时，以两者比值建立独立历史收益因子，再衔接每日收益，启用日的转入转出不会改变历史本金。否则保留历史盈亏金额，百分比只计算可验证的后续收益；不会把旧盈利除以后来首次投入的金额。

周、月、年展示当期收益，总览及持仓累计收益包含可还原的历史收益。例如初始资金0、历史盈利15,000，转入10,000后余额9,800，累计盈亏14,800，收益率为−2%。无本金节点暂不显示百分比，图表以0%位置绘制；收益率不设100%上限。

金额以整数分计算，人民币记账，日期按北京时间。代码采用 [MIT License](LICENSE)。
