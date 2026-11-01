# Repository Guidelines

## Project Structure & Module Organization

This repository is a TypeScript WeChat Mini Program starter.

- `miniprogram/app.ts`, `app.json`, and `app.wxss` define application lifecycle, page registration, and global styles.
- `miniprogram/pages/` contains the `index` and `logs` pages. Keep each page’s `.ts`, `.wxml`, `.wxss`, and `.json` files together under a matching directory, such as `pages/logs/logs.*`.
- `miniprogram/utils/` contains shared helpers, including `formatTime` in `util.ts`.
- `typings/` contains WeChat API declarations and the application’s `IAppOption` interface.
- `project.config.json` configures WeChat DevTools; `tsconfig.json` defines TypeScript checks. No dedicated test or asset directory currently exists.

## Build, Test, and Development Commands

- Run `npm install` to install the declared development dependency, `miniprogram-api-typings`.
- Import the repository root into WeChat DevTools. Its configured Mini Program root is `miniprogram/`, and the TypeScript compiler plugin is enabled.
- Use DevTools **Compile** to build and run in the simulator, and **Preview** to check behavior on a device.

`package.json` currently defines no scripts, so there are no repository-provided `npm run build`, `npm test`, or lint commands.

## Coding Style & Naming Conventions

Use two-space indentation. Follow the existing TypeScript style: single-quoted strings, omitted semicolons, and camelCase variables and functions. Use descriptive event handler names such as `onChooseAvatar`. Match existing WXSS conventions with hyphenated class names.

Keep TypeScript compatible with the strict checks in `tsconfig.json`; prefer explicit WeChat event types over adding `any`. Register new pages in `miniprogram/app.json`. No formatter or linter is configured.

## Testing Guidelines

No automated test framework or coverage threshold is configured. Validate changes in DevTools and record the checks performed. For current flows, verify index rendering, avatar and nickname input, navigation to logs, and launch-log persistence. Check the console for compilation and runtime errors. Exercise device-dependent behavior through Preview.

## Commit & Pull Request Guidelines

Git history is unavailable in this checkout, so no existing commit convention can be confirmed. Use concise, imperative subjects such as `Fix launch log formatting`.

Pull requests should describe the change, link relevant issues, and list manual verification steps. Include screenshots for visible WXML or WXSS changes. Keep machine-specific DevTools preferences in `project.private.config.json`, and avoid including unrelated local configuration changes or credentials.
