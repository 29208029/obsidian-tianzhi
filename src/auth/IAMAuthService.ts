/* eslint-disable @typescript-eslint/no-require-imports, obsidianmd/prefer-window-timers */
// IAMAuthService — 拷贝自 tianzhi 项目的 src/auth/IAMAuthService.ts
//
// 改动：
// 1. 去掉对 tianzhi KeychainService 的依赖（改用 IAMTokenManager 的
//    data.json 路径，由 plugin.loadData/saveData 调度）
// 2. debugLog 输出更紧凑
// 3. 保留所有云端 API URL、cookie 域名、轮询/超时参数原样
// 4. 保留 Electron BrowserWindow OAuth 流程（仅桌面端可用）
//
// 注意：移动端不支持 Electron BrowserWindow，调用 login() 会
// reject("当前环境不支持 BrowserWindow")。

import { requestUrl, type App } from "obsidian";
import type { IAMUserInfo, IAMAuthState, IAMAuthListener, IAMAuthError } from "./IAMTypes";
import { IAMTokenManager } from "./IAMTokenManager";

function debugLog(...args: unknown[]): void {
  // eslint-disable-next-line obsidianmd/rule-custom-message
  console.log("[IAMAuth]", ...args);
}

interface ElectronRemoteShape {
  remote?: {
    BrowserWindow?: new (...args: unknown[]) => ElectronBrowserWindow;
    session?: { defaultSession?: { cookies?: CookiesApi } };
  };
}

interface ElectronBrowserWindow {
  loadURL(url: string): Promise<void>;
  on(event: "closed", cb: () => void): void;
  removeAllListeners(event: string): void;
  close(): void;
  isDestroyed(): boolean;
}

interface CookiesApi {
  get(query: { url: string; name?: string }): Promise<Array<{ name: string; value: string }>>;
  remove(url: string, name: string): Promise<void>;
}

export class IAMAuthService {
  private static instance: IAMAuthService | null = null;

  private static readonly AUTHORIZE_URL =
    "https://agent-embed.s.cosmoplat.com/eiip-api/c/iam/login/get_authorize_url" +
    "?page_url=https%3A%2F%2Fagent-embed.s.cosmoplat.com%2FdevelopAgent%2Fhome" +
    "&root_url=https%3A%2F%2Fagent.s.cosmoplat.com";

  private static readonly COOKIE_URL = "https://agent.s.cosmoplat.com";
  private static readonly COOKIE_URLS = [
    "https://agent.s.cosmoplat.com",
    "https://agent-embed.s.cosmoplat.com",
    "https://cosmoplat.com",
  ];
  private static readonly COOKIE_NAME = "tianzhi_iip_token";
  private static readonly USER_INFO_URL =
    "https://agent.s.cosmoplat.com/api/v1/user/new_c_regist";
  private static readonly POLL_INTERVAL_MS = 500;
  private static readonly LOGIN_TIMEOUT_MS = 5 * 60 * 1000;

  private static readonly LOGOUT_URL =
    "https://agent-embed.s.cosmoplat.com/eiip-api/c/iam/login/get_logout_url" +
    "?current_page_url=https%3A%2F%2Fagent-embed.s.cosmoplat.com%2FdeveloperPlatform";

  private token: string | null = null;
  private userInfo: IAMUserInfo | null = null;
  private listeners = new Set<IAMAuthListener>();
  private initialized = false;

  static getInstance(): IAMAuthService {
    if (!IAMAuthService.instance) {
      IAMAuthService.instance = new IAMAuthService();
    }
    return IAMAuthService.instance;
  }

  static resetInstance(): void {
    IAMAuthService.instance = null;
  }

  initialize(_app?: App): void {
    if (this.initialized) return;
    this.initialized = true;
    const token = IAMTokenManager.getToken();
    const userInfo = IAMTokenManager.getUserInfo<IAMUserInfo>();
    if (token && userInfo) {
      this.token = token;
      this.userInfo = userInfo;
    }
    debugLog("初始化完成，登录状态:", this.token ? "已登录" : "未登录");
    this.notifyListeners();
  }

  getState(): IAMAuthState {
    return {
      isLoggedIn: this.token !== null && this.userInfo !== null,
      userInfo: this.userInfo,
      token: this.token,
    };
  }

  getToken(): string | null {
    return this.token;
  }

  subscribe(listener: IAMAuthListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async login(): Promise<IAMUserInfo> {
    debugLog("=== 开始 IAM 登录 ===");
    let authUrl: string;
    try {
      authUrl = await this.fetchAuthorizeUrl();
    } catch {
      throw new Error("TOKEN_FAILED: 获取登录授权地址失败");
    }

    let token: string;
    try {
      token = await this.pollTokenFromBrowserWindow(authUrl);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "登录失败";
      const code: IAMAuthError["code"] = msg.includes("超时") ? "TIMEOUT" : "WINDOW_CLOSED";
      throw new Error(`${code}: ${msg}`);
    }

    let userInfo: IAMUserInfo;
    try {
      userInfo = await this.fetchUserInfo(token);
    } catch {
      throw new Error("USER_INFO_FAILED: 获取用户信息失败");
    }

    this.token = token;
    this.userInfo = userInfo;
    IAMTokenManager.saveToken(token);
    IAMTokenManager.saveUserInfo(userInfo);
    this.notifyListeners();
    debugLog("=== IAM 登录完成 ===");
    return userInfo;
  }

  async logout(): Promise<void> {
    debugLog("=== 退出登录 ===");
    try {
      const response = await requestUrl({
        url: IAMAuthService.LOGOUT_URL,
        method: "GET",
      });
      const logoutUrl = (response.json as { data?: string } | null)?.data;
      if (typeof logoutUrl === "string" && logoutUrl.length > 0) {
        await this.openLogoutPage(logoutUrl);
      }
    } catch (err) {
      debugLog("退出登录接口失败（继续清理本地）:", err);
    }
    try {
      await this.clearIAMCookies();
    } catch (err) {
      debugLog("清除 cookie 异常（继续）:", err);
    }
    this.token = null;
    this.userInfo = null;
    IAMTokenManager.clearAll();
    this.notifyListeners();
  }

  private openLogoutPage(logoutUrl: string): Promise<void> {
    return new Promise<void>((resolve) => {
      // eslint-disable-next-line no-undef
      const electron = require("electron") as ElectronRemoteShape;
      if (typeof electron.remote?.BrowserWindow !== "function") {
        resolve();
        return;
      }
      const win = new electron.remote.BrowserWindow({
        width: 600,
        height: 400,
        show: false,
        webPreferences: { nodeIntegration: false, contextIsolation: true },
      });
      win.loadURL(logoutUrl).catch(() => {});
      setTimeout(() => {
        try {
          if (!win.isDestroyed()) win.close();
        } catch {
          /* ignore */
        }
        resolve();
      }, 2000);
    });
  }

  private async clearIAMCookies(): Promise<void> {
    // eslint-disable-next-line no-undef
    const electron = require("electron") as ElectronRemoteShape;
    const api = electron.remote?.session?.defaultSession?.cookies;
    if (!api || typeof api.get !== "function") return;

    const domains = [
      "https://iam.cosmoplat.com",
      "https://agent.s.cosmoplat.com",
      "https://agent-embed.s.cosmoplat.com",
      "https://cosmoplat.com",
    ];
    for (const url of domains) {
      try {
        const cookies = await api.get({ url });
        for (const c of cookies) {
          try {
            await api.remove(url, c.name);
          } catch {
            /* single-remove failure is non-fatal */
          }
        }
      } catch {
        /* no cookies for this domain is fine */
      }
    }
  }

  private async fetchAuthorizeUrl(): Promise<string> {
    const response = await requestUrl({
      url: IAMAuthService.AUTHORIZE_URL,
      method: "GET",
    });
    if (response.status >= 400) {
      throw new Error(`授权接口返回 ${response.status}`);
    }
    const data = (response.json as { data?: string } | null)?.data;
    if (typeof data !== "string" || data.length === 0) {
      throw new Error("授权接口返回 data 为空或非字符串");
    }
    return data;
  }

  private pollTokenFromBrowserWindow(authUrl: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      // eslint-disable-next-line no-undef
      const electron = require("electron") as ElectronRemoteShape;
      const BW = electron.remote?.BrowserWindow;
      const cookiesApi = electron.remote?.session?.defaultSession?.cookies;

      const rejectAuth = (code: IAMAuthError["code"], message: string) => {
        const e = this.makeError(code, message);
        reject(new Error(`${code}: ${e.message}`));
      };

      if (typeof BW !== "function") {
        rejectAuth("TOKEN_FAILED", "当前环境不支持 BrowserWindow");
        return;
      }
      if (!cookiesApi) {
        rejectAuth("TOKEN_FAILED", "当前环境不支持 session cookies");
        return;
      }

      const win = new BW({
        width: 1000,
        height: 700,
        show: true,
        title: "天智大模型 - IAM登录",
        autoHideMenuBar: true,
        webPreferences: { nodeIntegration: false, contextIsolation: true },
      });
      win.loadURL(authUrl).catch(() => {});

      let pollCount = 0;
      const pollTimer = setInterval(() => {
        // Fire-and-forget; promise errors are logged inside.
        void (async () => {
        pollCount++;
        try {
          for (const url of IAMAuthService.COOKIE_URLS) {
            const cookies = await cookiesApi.get({
              url,
              name: IAMAuthService.COOKIE_NAME,
            });
            if (cookies.length > 0 && cookies[0].value) {
              cleanup();
              resolve(cookies[0].value);
              return;
            }
          }
          if (pollCount % 5 === 1) {
            for (const url of IAMAuthService.COOKIE_URLS) {
              const all = await cookiesApi.get({ url });
              debugLog(`#${pollCount} ${url} cookies:`, all.map(c => c.name).join(", ") || "(空)");
            }
          }
        } catch (e) {
          debugLog(`轮询#${pollCount} 异常:`, e);
        }
        })();
      }, IAMAuthService.POLL_INTERVAL_MS);

      const timeoutTimer = setTimeout(() => {
        cleanup();
        rejectAuth("TIMEOUT", "登录超时，请重试");
      }, IAMAuthService.LOGIN_TIMEOUT_MS);

      win.on("closed", () => {
        cleanup();
        rejectAuth("WINDOW_CLOSED", "登录窗口已关闭");
      });

      const cleanup = () => {
        clearInterval(pollTimer);
        clearTimeout(timeoutTimer);
        try {
          if (!win.isDestroyed()) {
            win.removeAllListeners("closed");
            win.close();
          }
        } catch {
          /* ignore */
        }
      };
    });
  }

  private async fetchUserInfo(token: string): Promise<IAMUserInfo> {
    let response = await requestUrl({
      url: IAMAuthService.USER_INFO_URL,
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
      throw: false,
    });
    if (response.status === 405) {
      response = await requestUrl({
        url: IAMAuthService.USER_INFO_URL,
        method: "POST",
        contentType: "application/json",
        body: JSON.stringify({ third_token: token }),
        throw: false,
      });
    }
    if (response.status >= 400) {
      throw new Error(`用户信息接口返回 ${response.status}`);
    }
    const rawData = (response.json as { data?: IAMUserInfo } | null)?.data;
    if (!rawData || typeof rawData.user_name !== "string") {
      throw new Error("用户信息接口返回格式异常");
    }
    return rawData;
  }

  private notifyListeners(): void {
    const state = this.getState();
    this.listeners.forEach((fn) => {
      try {
        fn(state);
      } catch {
        /* listener errors don't break the chain */
      }
    });
  }

  private makeError(code: IAMAuthError["code"], message: string): IAMAuthError {
    return { code, message };
  }
}