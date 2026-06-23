/**
 * IAM 登录认证相关的类型定义。
 *
 * 从 tianzhi (基于 copilot) 迁移而来，独立于 Copilot 主插件。
 * 与 tianzhi 原版的差异：不再依赖 KeychainService，token/userInfo
 * 走插件自己的 data.json（见 IAMTokenManager）。
 */

/** 用户信息（来自 new_c_regist 接口 data 字段） */
export interface IAMUserInfo {
  user_name: string;
  email?: string;
  user_id?: number;
  phone_number?: string;
  third_user_id?: string;
  dept_id?: string;
  remark?: string | null;
  /** 后端返回的 JWT access_token（不同于 cookie 中的 tianzhi_iip_token） */
  access_token?: string;
  refresh_token?: string;
  platform_role?: string;
  role?: string;
  web_menu?: string[];
  admin_groups?: string[];
  third_user_name?: string;
  create_time?: string;
  update_time?: string;
  /**
   * 工号。new_c_regist 接口返回，作为 CosmoGPT provider 的钥匙：
   * 插件启动时若 provider === 'cosmogpt' 且已登录（userInfo.employee_code
   * 存在），会自动用此工号调用
   * https://agent-embed.s.cosmoplat.com/intelligent-agent/api/v1/cosmo-gpt/sk/getByEmployeeCode
   * 换取 API Key，免去用户手动粘贴。
   */
  employee_code?: string;
  [key: string]: unknown;
}

/** IAM 认证状态快照 */
export interface IAMAuthState {
  /** 是否已登录 */
  isLoggedIn: boolean;
  /** 用户信息，未登录时为 null */
  userInfo: IAMUserInfo | null;
  /** tianzhi_iip_token，未登录时为 null */
  token: string | null;
}

/** 状态变化监听器 */
export type IAMAuthListener = (state: IAMAuthState) => void;

/** IAM 登录错误类型 */
export interface IAMAuthError {
  code: "WINDOW_CLOSED" | "TIMEOUT" | "TOKEN_FAILED" | "USER_INFO_FAILED";
  message: string;
}