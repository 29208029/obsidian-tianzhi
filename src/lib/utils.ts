// cn — 合并 className,处理条件类名 + Tailwind 类冲突
// 拷贝自 tianzhi/src/lib/utils.ts,简化了 extend 块(本项目暂不需要
// 自定义 color 组的合并规则)

import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

const customTwMerge = extendTailwindMerge({
  prefix: "tw-",
});

export function cn(...inputs: ClassValue[]): string {
  return customTwMerge(clsx(inputs));
}
