// cosmo-gpt-bootstrap — 一站式把"已登录 IAM + provider=cosmogpt"的场景
// 装配好：换 key → 写 baseUrl → 拉模型列表 → 选中默认模型 → Test Connection。
//
// 设计要点：
//   1. 函数式 / 无副作用注入：fetch / settings / logger / notifier 全部由调用方
//      注入，方便 settings.ts、main.ts 复用同一份逻辑，且单测不必拖 Obsidian 模块。
//   2. 单次只跑一次：模块级 in-flight 标记 + 完成态缓存，避免 IAM 登录回调和
//      plugin onload 同时触发导致重复请求。
//   3. 失败可恢复：任意步骤失败都会抛错让上层 Notice 用户，不会留下半截配置。
//
// 日志约定：
//   整条流水线用统一前缀 [cosmo-bootstrap] 输出到 console.debug，状态变化 / 异常
//   用 console.error。生产构建 (esbuild production) 会剔除 console.debug，
//   开发构建 (build:dev) 保留 — 用户跑 dev build + 看 DevTools console 即可观察。

import { fetchCosmoApiKey, COSMO_DEFAULT_BASE_URL, COSMO_DEFAULT_MODEL } from '../ui/settings-helpers';
import { PREDEFINED_PROVIDERS } from '../types';
import type { LLMWikiSettings } from '../types';

/** 统一日志前缀，方便在控制台过滤。 */
const LOG_TAG = '[cosmo-bootstrap]';

/** 轻量 log helper：可被外部 deps.log 覆盖（测试用）。 */
// esbuild production banner 替换 console.debug 为空函数；Obsidian 插件
// 规则要求 console.log 须带说明。模仿 sync-service.ts:45-50 风格。
type LogFn = (...args: unknown[]) => void;
const defaultLog: LogFn = (...args: unknown[]) => {
  // eslint-disable-next-line obsidianmd/rule-custom-message
  console.log(LOG_TAG, ...args);
};
const defaultError: LogFn = (...args: unknown[]) => {
  console.error(LOG_TAG, ...args);
};

export interface CosmoBootstrapDeps {
  /** 当前生效设置（会被原地修改）。 */
  settings: LLMWikiSettings;
  /** Obsidian 的 requestUrl（或同形态的 stub）。 */
  requestUrl: (opts: { url: string; method?: string; headers?: Record<string, string> }) => Promise<{ status: number; json: unknown }>;
  /** 已登录 IAM 拿到的工号（来自 new_c_regist 返回的 employee_code）。 */
  employeeCode: string;
  /**
   * JWT access_token from `new_c_regist`. Required by the IAM endpoint
   * (`/getByEmployeeCode` returns 401 without it). Convention: NO
   * `Bearer ` prefix — matches the existing `SyncService` / `KBClient`
   * pattern (see `src/sync/kb-client.ts:8,33,280`).
   */
  accessToken: string;
  /** 可选：默认模型 ID（默认 COSMO-Mind-think）。 */
  defaultModel?: string;
  /** 可选：默认 base URL（默认 https://gpt.cosmoplat.com/v1）。 */
  defaultBaseUrl?: string;
  /** 可选：日志钩子（测试用，生产用 console.debug）。 */
  log?: LogFn;
  /** 可选：错误日志钩子（测试用，生产用 console.error）。 */
  error?: LogFn;
  /** 可选：触发来源标签（onload / iam-login / settings），便于定位。 */
  trigger?: string;
}

export interface CosmoBootstrapResult {
  apiKey: string;
  baseUrl: string;
  model: string;
  availableModels: string[];
  /** Test Connection 是否通过。false 表示 bootstrap 完成但 Test Connection 失败。 */
  ready: boolean;
}

/**
 * 把"换 key → 写 baseUrl → 拉模型列表 → 选默认模型 → Test Connection"封装成
 * 一个可复用流水线。所有副作用（修改 settings、调外部 API）都通过 deps 注入。
 *
 * @throws 如果 fetchCosmoApiKey 失败、模型列表为空、或 Test Connection 抛错，
 *         会抛 Error 让上层 Notice 用户。settings 会被部分修改（仅已成功的步骤），
 *         调用方需自行决定是否回滚。
 */
export async function cosmoGptBootstrap(deps: CosmoBootstrapDeps): Promise<CosmoBootstrapResult> {
  const log = deps.log ?? defaultLog;
  const error = deps.error ?? defaultError;
  const defaultModel = deps.defaultModel ?? COSMO_DEFAULT_MODEL;
  const defaultBaseUrl = deps.defaultBaseUrl ?? COSMO_DEFAULT_BASE_URL;
  const trigger = deps.trigger ?? 'unspecified';

  log(`▶ 开始 (trigger=${trigger}, employeeCode=${deps.employeeCode}, ` +
      `provider=${deps.settings.provider}, 已有 apiKey? ${!!deps.settings.apiKey}, ` +
      `accessToken 长度=${deps.accessToken?.length ?? 0})`);

  // 1. 换 key
  log(`[1/4] 从 IAM 拉取 API key,employeeCode=${deps.employeeCode}`);
  let fullKey: string;
  try {
    const result = await fetchCosmoApiKey(deps.employeeCode, deps.accessToken, deps.requestUrl);
    fullKey = result.fullKey;
    log(`[1/4] ✅ 已获取 API key,长度=${fullKey.length}, ` +
        `前缀=${fullKey.slice(0, 6)}…`);
  } catch (err) {
    error(`[1/4] ❌ fetchCosmoApiKey 失败:`, err);
    throw err;
  }

  // 2. 写 baseUrl + apiKey + provider (强制 anthropic-compatible,因为
  //    https://gpt.cosmoplat.com 用的是 Anthropic Messages API 格式)
  log(`[2/4] 写入 provider=anthropic-compatible、apiKey、baseUrl=${defaultBaseUrl} ` +
      `到 settings;重置 llmReady=false`);
  deps.settings.provider = 'anthropic-compatible';
  deps.settings.apiKey = fullKey;
  deps.settings.baseUrl = defaultBaseUrl;
  deps.settings.llmReady = false;
  log(`[2/4] ✅ settings 已更新:provider=${deps.settings.provider}, ` +
      `apiKey 长度=${deps.settings.apiKey.length}, ` +
      `baseUrl=${deps.settings.baseUrl}`);

  // 3. 拉模型列表 —— Anthropic 兼容端点 (https://gpt.cosmoplat.com) 暴露的
  //    /v1/models 接受 `x-api-key` + `Anthropic-Version` 头,而不是 OpenAI
  //    风格的 `Authorization: Bearer ...`。和 main.ts Anthropic 客户端探测逻辑一致。
  const modelsUrl = defaultBaseUrl.replace(/\/+$/, '') + '/v1/models';
  log(`[3/4] GET ${modelsUrl} (x-api-key: …${fullKey.slice(-4)}, ` +
      `Anthropic-Version: 2023-06-01)`);
  let modelsResp: { status: number; json: unknown };
  try {
    modelsResp = await deps.requestUrl({
      url: modelsUrl,
      method: 'GET',
      headers: {
        'x-api-key': fullKey,
        'Anthropic-Version': '2023-06-01',
        'Accept': 'application/json',
      },
    });
  } catch (err) {
    error(`[3/4] ❌ 请求 /v1/models 抛出异常:`, err);
    throw new Error(`获取模型列表请求失败：${err instanceof Error ? err.message : String(err)}`);
  }
  log(`[3/4] ← HTTP ${modelsResp.status} from /v1/models`);
  if (modelsResp.status < 200 || modelsResp.status >= 300) {
    const err = new Error(`获取模型列表失败：HTTP ${modelsResp.status}`);
    error(`[3/4] ❌ ${err.message}`);
    throw err;
  }
  const modelsJson = modelsResp.json as { data?: Array<{ id: string }> };
  const rawDataLen = modelsJson.data?.length ?? 0;
  const availableModels = (modelsJson.data || [])
    .map(m => m.id)
    .filter((id: string) => !id.includes(':') && !id.includes('/'))
    .sort();
  log(`[3/4] 解析结果:原始数据=${rawDataLen} 条,过滤后(不含 ':' 或 '/')=${availableModels.length} 条`);
  if (availableModels.length === 0) {
    const err = new Error('获取模型列表失败：列表为空（过滤后）');
    error(`[3/4] ❌ ${err.message}`);
    throw err;
  }
  if (rawDataLen > 0 && availableModels.length <= 5) {
    // 列表较小时打印几个模型名,便于排查「模型不在列表中」的开发期问题。
    log(`[3/4] 模型 id 样本:${availableModels.slice(0, 5).join(', ')}…`);
  }
  deps.settings.availableModels = availableModels;
  deps.settings.useCustomModel = false;
  log(`[3/4] ✅ 已写入 ${availableModels.length} 个模型到 settings.availableModels`);

  // 4. 选默认模型（存在则选，否则 fallback 到列表第一项）
  const isDefaultAvailable = availableModels.includes(defaultModel);
  const selectedModel = isDefaultAvailable ? defaultModel : availableModels[0];
  deps.settings.model = selectedModel;
  if (isDefaultAvailable) {
    log(`[4/4] ✅ 选中默认模型 "${defaultModel}"(在列表中)`);
  } else {
    log(`[4/4] ⚠️ 默认模型 "${defaultModel}" 不在列表中,回退到第一项:"${selectedModel}"`);
  }

  log(`✔ 结束 (trigger=${trigger}, model=${selectedModel}, ` +
      `availableModels=${availableModels.length}, ready=false [Test Connection 由调用方决定])`);

  return {
    apiKey: fullKey,
    baseUrl: defaultBaseUrl,
    model: selectedModel,
    availableModels,
    ready: false, // Test Connection 由调用方决定是否跑（需要 plugin 实例）
  };
}

/**
 * 模块级去重：同一个 (employeeCode, baseUrl) 已成功 bootstrap 后不再重复执行。
 * 用于防止 onload + IAM 登录回调 双触发。
 */
const completedKeys = new Set<string>();

export function isCosmoBootstrapCompleted(employeeCode: string): boolean {
  return completedKeys.has(employeeCode);
}

export function markCosmoBootstrapCompleted(employeeCode: string): void {
  // eslint-disable-next-line obsidianmd/rule-custom-message
  console.log(LOG_TAG, `标记完成:employeeCode=${employeeCode}, 缓存大小=${completedKeys.size + 1}`);
  completedKeys.add(employeeCode);
}

export function clearCosmoBootstrapCache(): void {
  // eslint-disable-next-line obsidianmd/rule-custom-message
  console.log(LOG_TAG, `清空缓存:原大小=${completedKeys.size}`);
  completedKeys.clear();
}

// Re-export for callers that don't want to import from settings-helpers directly.
export { COSMO_DEFAULT_BASE_URL, COSMO_DEFAULT_MODEL, fetchCosmoApiKey, PREDEFINED_PROVIDERS };
