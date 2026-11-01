# 团建助手小程序

基于 TypeScript 的微信小程序，提供活动项目、队伍、排行榜、项目地图与 3D 场地预览。

## 本地开发

1. 执行 `npm install` 安装开发依赖。
2. 使用微信开发者工具导入本仓库根目录。
3. 在开发者工具中点击“编译”，通过“预览”验证真机效果。

## 检查

```bash
npm run check:device-syntax
```

## 目录

- `miniprogram/`：页面、共享逻辑和资源。
- `typings/`：微信 API 与应用类型声明。
- `scripts/`：设备语法检查脚本。
- `docs/`：演示范围与操作说明。

地图定位需要微信授权。活动与参赛数据通过微信云开发共享；3D 场地为示意模型。

## 云开发部署

先按 [部署说明](docs/cloud-deployment.md) 初始化数据库、配置权限并部署云函数，再上传小程序。无需 Docker 或 Express 容器。当前实现面向单场团建活动。
机器专属的 `project.private.config.json` 不提交到仓库。
