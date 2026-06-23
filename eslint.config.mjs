import tsparser from "@typescript-eslint/parser";
import obsidianmd from "eslint-plugin-obsidianmd";

export default [
  ...obsidianmd.configs.recommended,
  {
    // 仅对 ts/tsx 文件加自定义 parser,obsidianmd.configs.recommended
    // 内部已通过 extends 引入 tseslint.configs.recommendedTypeChecked,
    // 我们只显式提供 parser 让 type-aware 规则可以工作。
    // 注意:不要再声明 `plugins: { "@typescript-eslint": tsplugin }`,
    // 否则会与 obsidianmd 已注册的同名插件冲突,eslint 报
    // "Cannot redefine plugin \"@typescript-eslint\""。
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        project: "./tsconfig.json",
      },
    },
  },
  {
    ignores: ["main.js", "node_modules/"],
  },
];
