// cosmo-bootstrap-guard — 纯函数化的 CosmoGPT auto-bootstrap 前置闸门。
//
// 抽离自 `main.ts:maybeRunCosmoBootstrap` 的 provider/apiKey 判定,使其可
// 单测(原方法是 plugin 私有方法,强依赖 IAMAuthService / requestUrl / plugin
// 实例,无法轻量测试)。`maybeRunCosmoBootstrap` 在调用 IAM 拿 employee_code
// 之前先用本函数决定是否进入流水线。
//
// 设计要点:
//   1. 唯一职责:依据 (provider, apiKey) 判定是否允许进入 bootstrap。
//   2. 不读取 IAM 状态、不触碰 settings 副作用 —— 那些仍是 main.ts 的职责。
//   3. 对全新账号友好:DEFAULT_SETTINGS.provider === 'anthropic',新登录用户
//      的 apiKey 为空,应允许进入 bootstrap(内部再把 provider 写成
//      'anthropic-compatible' 并填 key/baseUrl/model)。

/**
 * 判定是否允许进入 CosmoGPT auto-bootstrap 流水线。
 *
 * 允许进入的两种路径:
 *   (a) provider === 'cosmogpt' —— 用户显式选择了 CosmoGPT provider。
 *   (b) provider 属于 Anthropic 系('anthropic' 或 'anthropic-compatible')
 *       且 apiKey 为空 —— 用户刚登录、尚未配置,需要自动填充默认值。
 *
 * @param provider  当前 `settings.provider`。
 * @param apiKey    当前 `settings.apiKey`(空字符串或纯空白均视为未配置)。
 * @returns true 表示允许进入 bootstrap;false 表示应跳过。
 */
export function shouldRunCosmoBootstrap(provider: string, apiKey: string): boolean {
  const isCosmoLike = provider === 'cosmogpt';
  const isAnthropicFamily = provider === 'anthropic' || provider === 'anthropic-compatible';
  // 与 main.ts 既有保护门(existingKey?.trim())保持一致:纯空白视为未配置,
  // 避免用户误留空格导致自动填充被跳过。
  const isFreshAnthropic = isAnthropicFamily && !apiKey?.trim();
  return isCosmoLike || isFreshAnthropic;
}
