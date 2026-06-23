// Categorize fetch-model errors so the Notice can give specific guidance
// (check API Key, check BaseURL, try again, or enter model ID manually).
// Pure function — extracted from settings.ts to enable unit testing without
// the heavy Obsidian module graph.


// esbuild production banner 替换 console.debug 为空函数；Obsidian 规则
// 要求 console.log 须带说明。模仿 sync-service.ts:45-50 风格。
const LOG_TAG = '[cosmo-bootstrap:fetchKey]';
const logInfo = (...args: unknown[]): void => {
  // eslint-disable-next-line obsidianmd/rule-custom-message
  console.log(LOG_TAG, ...args);
};
const logError = (...args: unknown[]): void => {
  console.error(LOG_TAG, ...args);
};

export type FetchErrorCategory = 'Auth' | 'Endpoint' | 'Server' | 'Empty' | 'Network';

export function classifyFetchError(msg: string): FetchErrorCategory {
  if (msg === 'empty model list') return 'Empty';

  // Auth: any 401/403, or keywords like "unauthorized"/"forbidden"/"invalid key".
  // Case-insensitive to match varying server error formats.
  // \b word boundaries prevent partial matches inside other identifiers.
  if (/\b(401|403)\b/.test(msg)
      || /\bunauthor\w*|\bforbidden\b|\binvalid[_\s-]?(api[_\s-]?)?key\b|\binvalid[_\s-]?token\b|\bauth(entication|orization)?[_\s-]?fail/i.test(msg)) {
    return 'Auth';
  }

  // Endpoint: 404/405/410/421, or "not found"/"method not allowed".
  // The "not found" pattern uses a word boundary on both sides to avoid
  // false-positive matches like "ENOTFOUND" (DNS error code).
  if (/\b(404|405|410|421)\b/.test(msg)
      || /\bnot[_\s-]?found\b|\bmethod[_\s-]?not[_\s-]?allowed\b/i.test(msg)) {
    return 'Endpoint';
  }

  // Server: any 5xx status code, or server error keywords.
  if (/\b5\d\d\b/.test(msg)
      || /\bserver[_\s-]?error\b|\bbad[_\s-]?gateway\b|\bservice[_\s-]?unavailable\b|\brate[_\s-]?limit/i.test(msg)) {
    return 'Server';
  }

  return 'Network';
}

// ---------------------------------------------------------------------------
// CosmoGPT (天智大模型) employee-code → API key exchange.
//
// Endpoint: GET https://agent-embed.s.cosmoplat.com/intelligent-agent/api/v1/cosmo-gpt/sk/getByEmployeeCode?employeeCode={code}
// Response: { code: 200, msg: '...', data: { fullKey: 'sk-...' } }
//
// We accept an injected `fetch`-style function so unit tests can stub the
// network call without Obsidian's `requestUrl` module graph. `requestUrl`
// has the same shape as `fetch`'s `Request` (url + headers); the helper
// uses whichever signature is provided.
//
// Returns: { fullKey: string } on success.
// Throws:  Error with a user-facing Chinese message on failure
//          (status codes, network errors, missing fields, etc.).
// ---------------------------------------------------------------------------

// Anthropic-Compatible 客户端构造时会自动在 baseUrl 后追加 /v1:
//   src/llm-client.ts:65  this.baseUrl = baseUrl.replace(/\/v1\/?$/, '').replace(/\/+$/, '') + '/v1'
// 所以这里只写 host 即可,不要带 /v1 后缀。
export const COSMO_DEFAULT_BASE_URL = 'https://gpt.cosmoplat.com';
export const COSMO_DEFAULT_MODEL = 'COSMO-Mind-think';

export interface CosmoKeyResponse {
  fullKey: string;
}

/**
 * Build the full URL for the CosmoGPT employee-code key endpoint.
 * Pure function — extracted for unit testing.
 */
export function buildCosmoKeyUrl(employeeCode: string): string {
  const base = 'https://agent-embed.s.cosmoplat.com/intelligent-agent/api/v1/cosmo-gpt/sk/getByEmployeeCode';
  return `${base}?employeeCode=${encodeURIComponent(employeeCode.trim())}`;
}

/**
 * Parse the CosmoGPT exchange response body. Throws on any structural
 * deviation so the caller can show a single user-facing Notice.
 * Pure function — extracted for unit testing.
 */
export function parseCosmoKeyResponse(body: unknown): CosmoKeyResponse {
  if (!body || typeof body !== 'object') {
    throw new Error('响应格式错误（不是 JSON 对象）');
  }
  const obj = body as { code?: unknown; msg?: unknown; data?: unknown };
  if (obj.code !== 200 && obj.code !== '200') {
    const serverMsg = typeof obj.msg === 'string' && obj.msg ? obj.msg : '未知错误';
    throw new Error(`服务端返回失败：${serverMsg}`);
  }
  const data = obj.data as { fullKey?: unknown } | undefined;
  if (!data || typeof data.fullKey !== 'string' || !data.fullKey) {
    throw new Error('响应缺少 fullKey 字段');
  }
  return { fullKey: data.fullKey };
}

/**
 * Minimal request shape — accepts either Obsidian's `requestUrl`
 * or a `fetch`-compatible function. Kept narrow on purpose so
 * tests can stub with `vi.fn()` returning `{ status, json }`.
 */
export type CosmoRequest = (opts: {
  url: string;
  method?: string;
  headers?: Record<string, string>;
}) => Promise<{
  status: number;
  json: unknown;
}>;

/**
 * Fetch the API key for a CosmoGPT (天智大模型) employee code.
 *
 * The IAM endpoint requires the user's JWT (`access_token` from
 * `new_c_regist`) in the `Authorization: <token>` header — NOTE: no
 * `Bearer ` prefix. This matches the convention used by the
 * `SyncService` / `KBClient` (see `src/sync/kb-client.ts:8,33,280`).
 * KB_CREATE is the only endpoint that uses the `Bearer ` prefix;
 * `/getByEmployeeCode` follows the same convention as the other 4
 * sync APIs.
 *
 * Without the header the server returns 401.
 *
 * @param employeeCode  Numeric / alphanumeric employee identifier.
 * @param accessToken   JWT access token from `new_c_regist`. Must be
 *                      non-empty — without it the server returns 401.
 * @param request       Injectable request function (defaults to a thin
 *                      wrapper around `window.fetch`). Tests inject a stub.
 */
export async function fetchCosmoApiKey(
  employeeCode: string,
  accessToken: string,
  request: CosmoRequest,
): Promise<CosmoKeyResponse> {
  
  const trimmed = employeeCode.trim();
  if (!trimmed) {
    logInfo( 'rejected: empty employeeCode');
    throw new Error('工号不能为空');
  }
  if (!accessToken || !accessToken.trim()) {
    logError( 'rejected: empty accessToken (would 401)');
    throw new Error('缺少 IAM access_token（请先完成天智云登录）');
  }

  const url = buildCosmoKeyUrl(trimmed);
  // Log shows prefix + last 4 of the token, so the user can verify in
  // the dev console that the right token is being sent.
  logInfo(
    `GET ${url} (Authorization: ${accessToken.slice(0, 6)}…${accessToken.slice(-4)}, no Bearer prefix)`);

  let response: { status: number; json: unknown };
  try {
    response = await request({
      url,
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        // No "Bearer " prefix — the IAM endpoint expects the raw JWT,
        // matching the project's existing SyncService convention.
        'Authorization': accessToken.trim(),
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logError( `network error: ${msg}`);
    throw new Error(`网络请求失败：${msg}`);
  }

  logInfo( `← HTTP ${response.status}`);
  // Dump the full response body so the user can verify the shape in the
  // dev console — `fullKey` is the field we need but `msg` and other
  // fields are useful when debugging. Truncate the key in the log so we
  // don't leak the secret to anyone tailing the console.
  const respJson = response.json;
  if (respJson && typeof respJson === 'object') {
    const obj = respJson as Record<string, unknown>;
    const data = obj.data as Record<string, unknown> | undefined;
    const fullKeyRaw = data?.fullKey;
    const fullKeyMasked = typeof fullKeyRaw === 'string' && fullKeyRaw.length > 0
      ? `${fullKeyRaw.slice(0, 6)}…${fullKeyRaw.slice(-4)} (length=${fullKeyRaw.length})`
      : fullKeyRaw;
    logInfo( `response body: ${JSON.stringify({
      ...obj,
      data: data ? { ...data, fullKey: fullKeyMasked } : data,
    })}`);
  } else {
    logInfo( `response body (raw):`, respJson);
  }
  if (response.status === 401 || response.status === 403) {
    logError( `auth rejected: HTTP ${response.status} (token may be expired)`);
    throw new Error(`认证失败 HTTP ${response.status}（请重新登录天智云）`);
  }
  if (response.status < 200 || response.status >= 300) {
    logError( `non-2xx: HTTP ${response.status}`);
    throw new Error(`服务端返回 HTTP ${response.status}`);
  }

  try {
    const parsed = parseCosmoKeyResponse(response.json);
    // Log the actual fullKey (length + prefix only) at the entrypoint
    // for traceability. The full value is NOT logged anywhere — only
    // the bootstrap caller has it.
    logInfo( `✅ parsed fullKey, length=${parsed.fullKey.length}, ` +
        `prefix=${parsed.fullKey.slice(0, 6)}…`);
    return parsed;
  } catch (err) {
    logError( `parse error:`, err);
    throw err;
  }
}
