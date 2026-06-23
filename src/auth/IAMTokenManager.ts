/**
 * IAM Token 存储管理器。
 *
 * 从 tianzhi 迁移的简化版 — 不再依赖 tianzhi 的 KeychainService
 * （keychainService 又依赖系统级 credential vault，移动端和
 *  跨平台不可靠）。改为存到插件自己的 data.json，调用方通过
 *  plugin.loadData()/saveData() 注入。
 */

const TOKEN_KEY = "iamToken";
const USER_INFO_KEY = "iamUserInfo";

export class IAMTokenManager {
  private static backing: Record<string, string> = {};

  /** 注入当前已加载的 data.json 快照（onload 时调用一次）。 */
  static hydrate(data: Record<string, unknown> | null): void {
    this.backing = {};
    if (!data) return;
    const tokenVal = data[TOKEN_KEY];
    if (typeof tokenVal === "string") this.backing[TOKEN_KEY] = tokenVal;
    const userVal = data[USER_INFO_KEY];
    if (typeof userVal === "string") this.backing[USER_INFO_KEY] = userVal;
  }

  /** 导出当前 backing（plugin 在 saveSettings 时写入 data.json）。 */
  static dump(): Record<string, string> {
    return { ...this.backing };
  }

  /** 保存 token（空串视为清空）。 */
  static saveToken(token: string): void {
    this.backing[TOKEN_KEY] = token;
  }

  /** 读取 token。返回 null 表示未登录或登录过期。 */
  static getToken(): string | null {
    const token = this.backing[TOKEN_KEY];
    return token && token.length > 0 ? token : null;
  }

  /** 保存用户信息（序列化为 JSON）。 */
  static saveUserInfo(userInfo: Record<string, unknown>): void {
    this.backing[USER_INFO_KEY] = JSON.stringify(userInfo);
  }

  /** 读取用户信息。返回 null 表示未保存或已清空。 */
  static getUserInfo<T = Record<string, unknown>>(): T | null {
    const raw = this.backing[USER_INFO_KEY];
    if (!raw || raw.length === 0) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  /** 清空所有 IAM 认证数据（登出时调用）。 */
  static clearAll(): void {
    delete this.backing[TOKEN_KEY];
    delete this.backing[USER_INFO_KEY];
  }
}