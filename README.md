# Racing

基于 `Nuxt 4 + TresJS + Three.js + crashcat` 复刻的 `Starter Kit Racing`。

## 特性

- 复用参考项目的车辆、赛道块、装饰、贴图与音效资源
- 使用 TresJS 管理渲染循环，用 Nuxt 承载页面与 HUD
- 支持键盘、手柄和触屏摇杆
- 保留 `?map=` 自定义赛道参数解析

## 开发

```bash
pnpm install
pnpm dev
```

默认地址为 `http://localhost:3000`。

## 构建

```bash
pnpm build
node .output/server/index.mjs
```

## 自定义赛道

```text
http://localhost:3000/?map=...
```

## 赛道编辑器

```text
http://localhost:3000/editor
```

编辑器支持自动连路、清空、试玩，以及复制当前赛道分享链接。
