import { Plugin, Notice, TFile, requestUrl } from 'obsidian';

import {
  PREDEFINED_PROVIDERS,
  DEFAULT_SETTINGS,
  LLMWikiSettings,
  LLMClient,
  IngestReport
} from './types';
import { TOKENS_QUERY_MODEL_DETECT, NOTICE_NORMAL, NOTICE_ERROR } from './constants';
import { AnthropicClient, AnthropicCompatibleClient, OpenAICompatibleClient } from './llm-client';
import { capMaxTokens } from './core/token-cap';
import { runSchemaAnalyze } from './wiki/schema-analyze';

// Issue #243: derive a consistent cache key for the thinking-control cache.
// Used in both the read (createLLMClient) and write (testLLMConnection) paths
// so they stay aligned when the user picks a predefined provider without
// overriding baseUrl.
function getThinkingControlCacheKey(settings: LLMWikiSettings): string {
  return settings.baseUrl?.trim() || PREDEFINED_PROVIDERS[settings.provider]?.baseUrl || '';
}

function createLLMClient(settings: LLMWikiSettings): LLMClient {
  let client: LLMClient;

  if (settings.provider === 'anthropic') {
    client = new AnthropicClient(settings.apiKey.trim());
  } else if (settings.provider === 'anthropic-compatible') {
    const baseUrl = settings.baseUrl?.trim();
    if (baseUrl) {
      client = new AnthropicCompatibleClient(settings.apiKey.trim(), baseUrl);
    } else {
      client = new AnthropicClient(settings.apiKey.trim());
    }
  } else {
    const providerConfig = PREDEFINED_PROVIDERS[settings.provider];
    const baseUrl = settings.baseUrl?.trim() || providerConfig?.baseUrl || undefined;
    const apiKey = (settings.provider === 'ollama' || settings.provider === 'lmstudio')
      ? (settings.apiKey.trim() || 'lmstudio')
      : settings.apiKey.trim();
    client = new OpenAICompatibleClient(apiKey, baseUrl);
  }

  // Sync thinking control cache from settings to client
  if (client instanceof OpenAICompatibleClient) {
    const cacheKey = getThinkingControlCacheKey(settings);
    if (cacheKey && settings.thinkingControlCache?.[cacheKey] !== undefined) {
      client.thinkingControlSupported = settings.thinkingControlCache[cacheKey];
    }
  }

  // Issue #75: wrap createMessage with token cap when configured
  if (settings.maxTokensPerCall > 0) {
    const originalCreate = client.createMessage.bind(client) as (params: Parameters<typeof client.createMessage>[0]) => ReturnType<typeof client.createMessage>;
    client.createMessage = async (params) => {
      return originalCreate({
        ...params,
        max_tokens: capMaxTokens(params.max_tokens, settings),
        maxTokensPerCall: settings.maxTokensPerCall,
      });
    };
  }

  return client;
}
import { TEXTS } from './texts';
import { slugify, parseFrontmatter, getText, normalizeVocabularyCsv, hasLLMConfig } from './utils';
import { LLMWikiSettingTab } from './ui/settings';
import { SidebarView, SIDEBAR_VIEW_TYPE } from './ui/sidebar-view';
import { WikiEngine } from './wiki/wiki-engine';
import { IAMAuthService } from './auth/IAMAuthService';
import { IAMTokenManager } from './auth/IAMTokenManager';
import {
  cosmoGptBootstrap,
  isCosmoBootstrapCompleted,
  markCosmoBootstrapCompleted,
  COSMO_DEFAULT_MODEL,
} from './auth/cosmo-gpt-bootstrap';
import { FileSuggestModal, FolderSuggestModal, IngestReportModal } from './ui/modals';
import { SchemaManager } from './schema/schema-manager';
import { AutoMaintainManager } from './schema/auto-maintain';
import { runLintWiki } from './wiki/lint-controller';
import { SyncService } from './sync/sync-service';
import { SYNC_INTERVAL_MS } from './sync/constants';

// esbuild production banner 替换 console.debug 为空函数；Obsidian 规则
// 要求 console.log 须带说明。模仿 sync-service.ts:45-50 风格。
const LOG_TAG = '[cosmo-bootstrap]';
// eslint-disable-next-line obsidianmd/rule-custom-message
const cosmoLog = (...args: unknown[]): void => console.log(LOG_TAG, ...args);
const cosmoWarn = (...args: unknown[]): void => console.warn(LOG_TAG, ...args);
const cosmoError = (...args: unknown[]): void => console.error(LOG_TAG, ...args);

export default class LLMWikiPlugin extends Plugin {
  settings: LLMWikiSettings;
  llmClient: LLMClient | null = null;
  wikiEngine: WikiEngine;
  schemaManager: SchemaManager;
  autoMaintainManager: AutoMaintainManager;
  syncService: SyncService;
  private progressNotice: Notice | null = null;
  private ingestStatusBar: HTMLElement | null = null;
  private syncIntervalId: number | null = null;
  private iamAuthSubscription: (() => void) | null = null;
  // Settings tab reference, set when the tab is registered. Used by
  // the CosmoGPT bootstrap to push freshly written apiKey/baseUrl/model
  // back into the visible input fields.
  private settingsTab: LLMWikiSettingTab | null = null;
  // Single-flight guard for the CosmoGPT bootstrap. Multiple call sites
  // (onload, IAM subscribe, settings login button, provider switch) may
  // race for the same key — cosmoBootstrapTask coalesces them so we
  // never issue duplicate /getByEmployeeCode requests.
  private cosmoBootstrapTask: Promise<void> | null = null;
  async onload() {
    await this.loadSettings();
    IAMTokenManager.hydrate(this.settings as unknown as Record<string, unknown>);
    IAMAuthService.getInstance().initialize(this.app);
    this.cleanupVocabularyTags();
    this.initializeLLMClient();

    this.schemaManager = new SchemaManager(
      this.app,
      this.settings,
      () => this.llmClient
    );

    this.wikiEngine = new WikiEngine(
      this.app,
      this.settings,
      () => this.llmClient,
      this.schemaManager,
      // Delayed evaluation: this closure captures autoMaintainManager by reference,
      // but the variable is assigned at :68 below. By the time wikiEngine calls
      // this callback (during file writes), autoMaintainManager is guaranteed
      // to exist. This is intentional — reordering the assignments would break it.
      (path: string) => this.autoMaintainManager.watchWrite(path),
      (msg: string) => this.showProgress(msg),
      (report: IngestReport) => this.onIngestDone(report)
    );

    this.autoMaintainManager = new AutoMaintainManager(
      this.app,
      this.settings,
      this.wikiEngine,
      this,
      () => this.lintWiki()
    );

    if (this.settings.autoWatchSources) {
      this.autoMaintainManager.startWatching();
    }
    this.autoMaintainManager.schedulePeriodicLint();
    if (this.settings.startupCheck) {
      void this.autoMaintainManager.runStartupCheck();
    }

    const t = TEXTS[this.settings.language];
    this.addCommand({
      id: 'ingest-source',
      name: t.cmdIngestSource,
      callback: () => this.selectSourceToIngest()
    });

    this.addCommand({
      id: 'ingest-folder',
      name: t.cmdIngestFolder,
      callback: () => this.selectFolderToIngest()
    });

    this.addCommand({
      id: 'query-wiki',
      name: t.cmdQueryWiki,
      callback: () => this.queryWiki()
    });

    this.addCommand({
      id: 'lint-wiki',
      name: t.cmdLintWiki,
      callback: () => this.lintWiki()
    });

    this.addCommand({
      id: 'regenerate-index',
      name: t.cmdRegenerateIndex,
      callback: () => {
        void (async () => {
          new Notice(getText(this.settings.language, 'regenerateIndexCompleted') + '...');
          try {
            await this.wikiEngine.generateIndexFromEngine();
            new Notice(getText(this.settings.language, 'regenerateIndexCompleted'));
          } catch (err) {
            console.error('Regenerate index failed:', err);
            new Notice(getText(this.settings.language, 'operationFailed') + (err instanceof Error ? err.message : String(err)));
          }
        })();
      }
    });

    this.addCommand({
      id: 'suggest-schema-update',
      name: t.cmdSuggestSchema,
      callback: () => this.suggestSchemaUpdate()
    });

    this.addCommand({
      id: 'cancel-ingestion',
      name: t.cmdCancelIngestion,
      callback: () => {
        if (this.wikiEngine.isIngesting()) {
          this.wikiEngine.cancelIngestion();
        } else if (this.wikiEngine.isLintRunning()) {
          this.wikiEngine.cancelLint();
        }
      }
    });

    this.addCommand({
      id: 'ingest-active-file',
      name: t.cmdIngestActiveFile,
      callback: () => this.ingestActiveFile()
    });

    this.addCommand({
      id: 'open-sidebar',
      name: t.cmdOpenSidebar,
      callback: () => this.openSidebar()
    });

    this.registerView(SIDEBAR_VIEW_TYPE, (leaf) => new SidebarView(leaf, this));

    // SyncService: 插件启动时立即执行一次同步,之后每小时轮询
    this.syncService = new SyncService(this.app, this.settings);
    void this.syncService.run().catch(() => {});
    this.syncIntervalId = window.setInterval(() => {
      void this.syncService.run().catch(() => {});
    }, SYNC_INTERVAL_MS);

    this.addRibbonIcon('message-square', t.cmdOpenSidebar, () => {
      void this.openSidebar();
    });

    this.ingestStatusBar = this.addStatusBarItem();
    this.ingestStatusBar.addClass('llm-wiki-status-bar');
    this.ingestStatusBar.addClass('llm-wiki-status-bar-hidden');
    this.ingestStatusBar.setText('LLM wiki');
    this.ingestStatusBar.onclick = () => {
      if (this.wikiEngine.isIngesting()) {
        this.wikiEngine.cancelIngestion();
      } else if (this.wikiEngine.isLintRunning()) {
        this.wikiEngine.cancelLint();
      }
    };

    this.wikiEngine.setIngestionCallbacks(
      () => {
        const label = getText(this.settings.language, 'ingestionStatusBar');
        if (this.ingestStatusBar) {
          this.ingestStatusBar.setText(label);
          this.ingestStatusBar.removeClass('llm-wiki-status-bar-hidden');
        }
      },
      () => {
        if (this.ingestStatusBar) {
          this.ingestStatusBar.addClass('llm-wiki-status-bar-hidden');
        }
      }
    );

    this.wikiEngine.setLintCallbacks(
      () => {
        const label = getText(this.settings.language, 'lintStatusBar');
        if (this.ingestStatusBar) {
          this.ingestStatusBar.setText(label);
          this.ingestStatusBar.removeClass('llm-wiki-status-bar-hidden');
        }
      },
      () => {
        if (this.ingestStatusBar) {
          this.ingestStatusBar.addClass('llm-wiki-status-bar-hidden');
        }
      }
    );

    this.settingsTab = new LLMWikiSettingTab(this.app, this);
    this.addSettingTab(this.settingsTab);

    // CosmoGPT auto-bootstrap: if user picked the cosmogpt provider AND
    // has already signed in to Tianzhi IAM (the employee_code field is
    // populated by /new_c_regist), auto-fetch the API key, populate the
    // base URL, list models, and select COSMO-Mind-think so the plugin
    // is ready to use without any manual setup.
    void this.maybeRunCosmoBootstrap('onload');

    // Subscribe to IAM login so a user who signs in later (or whose
    // session was hydrated from data.json) also gets the auto-bootstrap.
    this.iamAuthSubscription = IAMAuthService.getInstance().subscribe((state) => {
      if (state.isLoggedIn && this.settings.provider === 'cosmogpt') {
        void this.maybeRunCosmoBootstrap('iam-login');
      }
    });

    console.debug('LLM Wiki Plugin loaded - Karpathy implementation');
  }

  /**
   * Public entry point for the CosmoGPT auto-bootstrap pipeline.
   *
   * Mirrors `SyncService.run()`:
   *   - Reads IAM state DIRECTLY from `IAMAuthService.getState()` —
   *     does NOT depend on `this.settings.provider` being up to date
   *     or any subscribe callback firing. After `IAMAuthService.login()`
   *     resolves, `userInfo.employee_code` is guaranteed to be populated.
   *   - Single-flight via `cosmoBootstrapTask`: re-entrant calls return
   *     the in-flight promise instead of starting a second one.
   *   - Returns the promise so callers (settings panel, sync panel)
   *     can `await` it for feedback or chain follow-ups.
   *
   * Mirrors the sync panel pattern: login button in `sync-panel-react.tsx`
   * does `await IAMAuthService.login(); void plugin.syncService.run()`.
   * This method is the equivalent for CosmoGPT.
   */
  runCosmoBootstrap(): Promise<void> {
    if (this.cosmoBootstrapTask) {
      cosmoLog('runCosmoBootstrap: returning in-flight task');
      return this.cosmoBootstrapTask;
    }
    cosmoLog('runCosmoBootstrap: starting new task');
    this.cosmoBootstrapTask = (async () => {
      try {
        // bootstrap 内部会自己把 provider 设为 anthropic-compatible,
        // baseUrl 设为 https://gpt.cosmoplat.com。我们不强制 provider = cosmogpt,
        // 因为用户期望的是「登录完直接能用」,而不是先选 cosmogpt 再触发。
        await this.maybeRunCosmoBootstrap('run');
      } finally {
        this.cosmoBootstrapTask = null;
      }
    })();
    return this.cosmoBootstrapTask;
  }

  /**
   * Public entry point for settings panel to trigger bootstrap after
   * IAM login or provider switch. Delegates to `maybeRunCosmoBootstrap`
   * which handles dedup and precondition checks.
   *
   * The subscribe path above CAN miss the trigger when the user switches
   * provider in settings (tempSettings.provider is 'cosmogpt' but
   * this.settings.provider is still the OLD value because settings
   * haven't been saved yet). This method gives settings an explicit
   * path that bypasses the stale-provider problem.
   */
  triggerCosmoBootstrap(trigger: string): void {
    void this.maybeRunCosmoBootstrap(trigger);
  }

  /**
   * Run the CosmoGPT bootstrap pipeline iff:
   *   - the current provider is `cosmogpt`
   *   - the IAM user is logged in with an employee_code
   *   - the bootstrap has not already completed for this employee_code
   *
   * Idempotent — safe to call from multiple call sites (onload + IAM
   * subscribe). Shows a single Notice on success/failure.
   *
   * @param trigger  Free-form label for logs (onload | iam-login | settings).
   */
  private async maybeRunCosmoBootstrap(trigger: string): Promise<void> {
    cosmoLog(`maybeRunCosmoBootstrap called (trigger=${trigger}, ` +
        `provider=${this.settings.provider}, ` +
        `apiKey empty? ${!this.settings.apiKey})`);

    // Auto-bootstrap when:
    //   (a) user explicitly selected the cosmogpt provider, OR
    //   (b) apiKey is empty AND provider is currently an Anthropic-compatible
    //       variant (so users who just logged in without configuring get the
    //       right defaults applied automatically).
    const isCosmoLike = this.settings.provider === 'cosmogpt';
    const isFreshAnthropic = this.settings.provider === 'anthropic-compatible'
        && !this.settings.apiKey;
    if (!isCosmoLike && !isFreshAnthropic) {
      cosmoLog(`⏭ skip (provider=${this.settings.provider}, ` +
          `apiKey present? ${!!this.settings.apiKey} — not a CosmoGPT path)`);
      return;
    }

    const iamState = IAMAuthService.getInstance().getState();
    const employeeCode = iamState.userInfo?.employee_code;
    const accessToken = iamState.userInfo?.access_token;
    cosmoLog(`IAM state: isLoggedIn=${iamState.isLoggedIn}, ` +
        `userName=${iamState.userInfo?.user_name ?? '(none)'}, ` +
        `employeeCode=${employeeCode ?? '(missing)'}, ` +
        `accessToken length=${accessToken?.length ?? 0}`);
    if (!iamState.isLoggedIn || !employeeCode) {
      cosmoLog(`⏭ skip (no IAM login or no employee_code) — ` +
          `isLoggedIn=${iamState.isLoggedIn}, employeeCode=${!!employeeCode}`);
      return;
    }
    if (!accessToken) {
      cosmoError(`⏭ skip (no access_token in userInfo — ` +
          `the /getByEmployeeCode endpoint will 401)`);
      return;
    }
    // User-protection gate: NEVER overwrite a user-configured apiKey.
    // Only run bootstrap (which writes provider/baseUrl/apiKey/model
    // into plugin.settings) when the user has NOT configured an API
    // key yet. Once they have a working key, the bootstrap must not
    // touch their settings — even if the IAM login is fresh.
    const existingKey = this.settings.apiKey?.trim();
    if (existingKey) {
      cosmoLog(`⏭ skip (apiKey already configured, length=${existingKey.length}) — ` +
          `bootstrap is a one-time auto-fill only. User can re-trigger manually ` +
          `by clearing apiKey in settings.`);
      return;
    }
    if (isCosmoBootstrapCompleted(employeeCode)) {
      cosmoLog(`⏭ skip (already completed for employeeCode=${employeeCode})`);
      return;
    }

    cosmoLog(`🚀 all preconditions met, running bootstrap (trigger=${trigger})`);

    try {
      await cosmoGptBootstrap({
        settings: this.settings,
        requestUrl: async (opts) => {
          const r = await requestUrl({
            url: opts.url,
            method: opts.method ?? 'GET',
            headers: opts.headers,
            throw: false,
          });
          return { status: r.status, json: r.json };
        },
        employeeCode,
        accessToken,
        trigger,
      });
      markCosmoBootstrapCompleted(employeeCode);
      cosmoLog(`✅ cosmoGptBootstrap returned OK; ` +
          `apiKey length=${this.settings.apiKey.length}, ` +
          `baseUrl=${this.settings.baseUrl}, ` +
          `model=${this.settings.model}, ` +
          `availableModels=${this.settings.availableModels?.length ?? 0}`);

      // Re-create the LLM client so the freshly written apiKey is picked up,
      // and refresh the wiki engine's view of provider/baseUrl/model.
      cosmoLog(`re-initializing LLM client + wiki engine…`);
      this.initializeLLMClient();
      this.wikiEngine?.updateSettings(this.settings);
      cosmoLog(`llmClient=${this.llmClient ? 'initialized' : 'NULL'} — ` +
          `wikiEngine updated`);

      // Best-effort Test Connection so commands like "Query Wiki" work
      // immediately without a manual "Test Connection" click.
      cosmoLog(`starting testLLMConnection…`);
      const result = await this.testLLMConnection();
      cosmoLog(`testLLMConnection → success=${result.success}, ` +
          `message=${result.message}`);
      if (result.success) {
        cosmoLog(`🎉 bootstrap fully succeeded (trigger=${trigger})`);
        // Push the freshly written apiKey/baseUrl/model into the settings
        // tab's tempSettings and re-render so the user sees the values
        // immediately (without having to close + reopen the tab).
        if (this.settingsTab) {
          this.settingsTab.refreshFromPluginSettings();
        }
        new Notice(
          getText(this.settings.language, 'cosmoFetchKeySuccess')
            .replace('{}', COSMO_DEFAULT_MODEL),
          NOTICE_NORMAL,
        );
      } else {
        cosmoWarn(`⚠️ bootstrap completed but Test Connection failed: ${result.message}`);
        // Even on Test Connection failure the apiKey/baseUrl/model have
        // been written — refresh the panel so the user can see/edit them
        // and re-test manually.
        if (this.settingsTab) {
          this.settingsTab.refreshFromPluginSettings();
        }
        new Notice(
          getText(this.settings.language, 'cosmoFetchKeyFailed')
            .replace('{}', result.message),
          NOTICE_ERROR,
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      cosmoError(`💥 bootstrap threw (trigger=${trigger}): ${msg}`, err);
      new Notice(
        getText(this.settings.language, 'cosmoFetchKeyFailed').replace('{}', msg),
        NOTICE_ERROR,
      );
    }
  }

  onunload() {
    this.autoMaintainManager?.stop();
    if (this.syncIntervalId !== null) {
      window.clearInterval(this.syncIntervalId);
      this.syncIntervalId = null;
    }
    if (this.iamAuthSubscription) {
      this.iamAuthSubscription();
      this.iamAuthSubscription = null;
    }
    console.debug('LLM Wiki Plugin unloaded');
  }

  async loadSettings() {
    const savedData = await this.loadData() as Partial<LLMWikiSettings> | null;
    this.settings = Object.assign({}, DEFAULT_SETTINGS, savedData || {});

    console.debug('loadSettings: loaded watchedFolders =', JSON.stringify(this.settings.watchedFolders));

    if (savedData && !savedData.wikiLanguage) {
      this.settings.wikiLanguage = this.settings.language;
      await this.saveData(this.settings);
    }

    if (!Array.isArray(this.settings.watchedFolders)) {
      this.settings.watchedFolders = [];
      console.debug('loadSettings: watchedFolders was not an array, reset to []');
    }

    // Migrate existing users: if they already have a working config, trust it.
    // Uses the same hasLLMConfig() helper as requireLLMReady() so the two
    // paths never disagree on what "configured" means (Issue: user config
    // present but llmReady=false → commands blocked).
    if (savedData && !('llmReady' in savedData)) {
      const hasConfig = hasLLMConfig(this.settings);
      this.settings.llmReady = hasConfig;
      if (hasConfig) {
        console.debug('loadSettings: existing user with config detected, llmReady = true');
      }
    }
  }

  /**
   * Issue #85 v2: Migrate v1 textarea CSV (which may contain untrimmed
   * whitespace, empty entries, or case-variant duplicates from manual
   * editing) into the canonical form the chip input uses. Idempotent.
   * Called once on onload() before any UI renders so users see clean
   * chips immediately on first reload after upgrade.
   */
  private cleanupVocabularyTags(): void {
    const fields: ('customEntityTags' | 'customConceptTags')[] = [
      'customEntityTags',
      'customConceptTags',
    ];
    let changed = false;
    for (const field of fields) {
      const current = this.settings[field];
      if (!current) continue;
      const cleaned = normalizeVocabularyCsv(current);
      if (cleaned !== current) {
        this.settings[field] = cleaned;
        changed = true;
      }
    }
    if (changed) void this.saveSettings();
  }

  async saveSettings() {
    console.debug('saveSettings: watchedFolders =', JSON.stringify(this.settings.watchedFolders));
    // Merge IAMTokenManager state (token, userInfo) into settings before persisting.
    // This keeps auth data co-located with the plugin's other persisted state in data.json.
    const iamDump = IAMTokenManager.dump();
    for (const [k, v] of Object.entries(iamDump)) {
      (this.settings as unknown as Record<string, string>)[k] = v;
    }
    await this.saveData(this.settings);
    console.debug('saveSettings: data saved to data.json');
    this.initializeLLMClient();
    this.schemaManager?.updateSettings(this.settings);
    if (this.wikiEngine) {
      this.wikiEngine.updateSettings(this.settings);
      console.debug('[saveSettings] wikiEngine provider updated to:', this.settings.provider);
    }
    if (this.autoMaintainManager) {
      this.autoMaintainManager.settings = this.settings;
      this.autoMaintainManager.stop();
      if (this.settings.autoWatchSources) {
        this.autoMaintainManager.startWatching();
      }
      this.autoMaintainManager.schedulePeriodicLint();
    }
  }

  initializeLLMClient() {
    if (!this.settings.apiKey?.trim() && this.settings.provider !== 'ollama') {
      this.llmClient = null;
      return;
    }

    try {
      this.llmClient = createLLMClient(this.settings);
      console.debug('LLM Client initialized:', this.settings.provider);
    } catch (error) {
      console.error('LLM Client initialization failed:', error);
      this.llmClient = null;
    }
  }

  private showProgress(msg: string): void {
    if (this.progressNotice) {
      this.progressNotice.setMessage(msg);
    } else {
      this.progressNotice = new Notice(msg, 0);
    }
  }

  private dismissProgress(): void {
    if (this.progressNotice) {
      this.progressNotice.hide();
      this.progressNotice = null;
    }
  }

  private onIngestDone(report: IngestReport): void {
    this.dismissProgress();
    new IngestReportModal(this.app, report, this.settings.language).open();
  }

  // ==================== Ingestion ====================

  private async isAlreadyIngested(sourceFile: TFile): Promise<boolean> {
    const slug = slugify(sourceFile.basename, this.settings.slugCase === 'preserve');
    const wikiPath = `${this.settings.wikiFolder}/sources/${slug}.md`;

    try {
      const file = this.app.vault.getAbstractFileByPath(wikiPath);
      if (!(file instanceof TFile)) return false;

      try {
        const content = await this.app.vault.read(file);
        const fm = parseFrontmatter(content);
        if (fm && fm.sources) {
          const normalizedSources = fm.sources.map(s => {
            const trimmed = s.trim();
            if (trimmed.startsWith('[[') && trimmed.endsWith(']]')) {
              return trimmed.slice(2, -2).trim();
            }
            return trimmed;
          });
          return normalizedSources.includes(sourceFile.path);
        }
        return true;
      } catch {
        return true;
      }
    } catch {
      return false;
    }
  }

  selectSourceToIngest(): void {
    if (!this.requireLLMReady()) return;
    if (!this.llmClient) {
      new Notice(TEXTS[this.settings.language].errorNoApiKey);
      return;
    }

    new FileSuggestModal(this.app, this.settings.wikiFolder, (file) => {
      this.showProgress(getText(this.settings.language, 'mainIngestingFile')
        .replace('{}', file.basename));
      this.wikiEngine.ingestSource(file).catch(e => {
        console.error('Single ingest failed:', e);
        const errMsg = e instanceof Error ? e.message : String(e);
        new Notice(TEXTS[this.settings.language].errorIngestFailed + errMsg, NOTICE_ERROR);
      });
    }).open();
  }

  ingestActiveFile(): void {
    if (!this.requireLLMReady()) return;
    if (!this.llmClient) {
      new Notice(TEXTS[this.settings.language].errorNoApiKey);
      return;
    }

    const activeFile = this.app.workspace.getActiveFile();
    if (!activeFile) {
      new Notice(getText(this.settings.language, 'noActiveFile'), NOTICE_NORMAL);
      return;
    }

    if (activeFile.extension !== 'md') {
      new Notice(getText(this.settings.language, 'mdOnlyFile'), NOTICE_NORMAL);
      return;
    }

    this.showProgress(getText(this.settings.language, 'mainIngestingFile')
      .replace('{}', activeFile.basename));
    this.wikiEngine.ingestSource(activeFile).catch(e => {
      console.error('Ingest active file failed:', e);
      const errMsg = e instanceof Error ? e.message : String(e);
      new Notice(TEXTS[this.settings.language].errorIngestFailed + errMsg, NOTICE_ERROR);
    });
  }

  selectFolderToIngest(): void {
    if (!this.requireLLMReady()) return;
    if (!this.llmClient) {
      new Notice(TEXTS[this.settings.language].errorNoApiKey);
      return;
    }

    new FolderSuggestModal(this.app, this.settings.wikiFolder, (folder) => {
      void (async () => {
      const files = this.app.vault.getMarkdownFiles()
        .filter(f => f.path.startsWith(folder.path));

      if (files.length === 0) {
        const msg = TEXTS[this.settings.language].selectFolderNoMdFiles.replace('{path}', folder.path);
        new Notice(msg);
        return;
      }

      this.showProgress(getText(this.settings.language, 'mainCheckingAlreadyIngested'));
      const alreadyIngestedFiles: TFile[] = [];
      const newFiles: TFile[] = [];

      for (const file of files) {
        if (await this.isAlreadyIngested(file)) {
          alreadyIngestedFiles.push(file);
        } else {
          newFiles.push(file);
        }
      }

      const totalFiles = files.length;
      const skippedCount = alreadyIngestedFiles.length;
      const ingestCount = newFiles.length;

      if (skippedCount > 0) {
        const texts = TEXTS[this.settings.language];
        new Notice(
          texts.batchIngestSkipNotice
            .replace('{skipped}', String(skippedCount))
            .replace('{total}', String(totalFiles))
            .replace('{new}', String(ingestCount)),
          6000
        );
      }

      if (ingestCount === 0) {
        this.wikiEngine.setDoneCallback((report: IngestReport) => this.onIngestDone(report));
        const texts = TEXTS[this.settings.language];
        new Notice(texts.batchIngestAllIngested.replace('{total}', String(totalFiles)), NOTICE_NORMAL);
        return;
      }

      const reports: IngestReport[] = [];

      this.wikiEngine.setDoneCallback((report: IngestReport) => {
        reports.push(report);
      });

      const texts = TEXTS[this.settings.language];
      this.showProgress(texts.batchIngestStarting
        .replace('{count}', String(ingestCount))
        .replace('{folder}', folder.name));

      for (let i = 0; i < newFiles.length; i++) {
        const file = newFiles[i];

        try {
          this.showProgress(getText(this.settings.language, 'mainIngestingProgress')
            .replace('{current}', String(i + 1))
            .replace('{total}', String(ingestCount))
            .replace('{}', file.basename));
          console.debug(`(${i + 1}/${ingestCount}) ingesting: ${file.path}`);
          await this.wikiEngine.ingestSource(file);
          if (this.wikiEngine.wasCancelled) {
            console.debug(`Folder ingestion cancelled at file ${i + 1}/${ingestCount}`);
            break;
          }
          console.debug(`(${i + 1}/${ingestCount}) ingestion success: ${file.path}`);
        } catch (error) {
          console.error(`(${i + 1}/${ingestCount}) ingestion failed: ${file.path}`, error);
          const errMsg = error instanceof Error ? error.message : String(error);
          new Notice(texts.errorIngestFailed + file.basename + ': ' + errMsg, NOTICE_ERROR);
        }
      }

      this.wikiEngine.setDoneCallback((report: IngestReport) => this.onIngestDone(report));

      this.dismissProgress();

      if (reports.length > 0) {
        const allCreated = [...new Set(reports.flatMap(r => r.createdPages))];
        const allUpdated = [...new Set(reports.flatMap(r => r.updatedPages))];
        const totalEntities = reports.reduce((sum, r) => sum + r.entitiesCreated, 0);
        const totalConcepts = reports.reduce((sum, r) => sum + r.conceptsCreated, 0);
        const totalContradictions = reports.reduce((sum, r) => sum + r.contradictionsFound, 0);
        const totalElapsed = reports.reduce((sum, r) => sum + (r.elapsedSeconds || 0), 0);
        const allFailedItems = reports.flatMap(r => r.failedItems);
        const allCollisions = reports.flatMap(r => r.collisions || []);
        const allSuccess = reports.every(r => r.success);

        const aggregated: IngestReport = {
          sourceFile: `${reports.length} files from ${folder.path}`,
          createdPages: allCreated,
          updatedPages: allUpdated,
          entitiesCreated: totalEntities,
          conceptsCreated: totalConcepts,
          failedItems: allFailedItems,
          collisions: allCollisions,
          contradictionsFound: totalContradictions,
          success: allSuccess,
          elapsedSeconds: totalElapsed,
          skippedFiles: skippedCount,
          totalFilesInFolder: totalFiles,
        };

        new IngestReportModal(this.app, aggregated, this.settings.language).open();
      } else {
        const texts = TEXTS[this.settings.language];
        new Notice(texts.batchIngestComplete
          .replace('{success}', '0')
          .replace('{total}', String(ingestCount))
          .replace('{fail}', String(ingestCount)), 10000);
      }
    })().catch(e => console.error(e));
    }).open();
  }

  // ==================== Query ====================

  // "Query Wiki" is now a sidebar action: the chat UI lives in the right
  // sidebar, so opening a separate Modal would duplicate the UI. We just
  // reveal the sidebar and switch to the chat tab. The old QueryModal is
  // preserved (no longer triggered by any command) for future use cases
  // that explicitly need a modal-style chat.
  queryWiki() {
    if (!this.requireLLMReady()) return;
    if (!this.llmClient) {
      new Notice(TEXTS[this.settings.language].errorNoApiKey);
      return;
    }
    void this.openSidebar('chat');
  }

  // ==================== Sidebar (ItemView) ====================

  /**
   * Open (or focus) the right-side sidebar ItemView that hosts the Chat and
   * Wiki Sync tabs. Mirrors the tianzhi copilot 侧边栏 interaction.
   *
   * @param tab  Optional tab to switch to after opening.
   */
  async openSidebar(tab?: 'chat' | 'sync'): Promise<void> {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(SIDEBAR_VIEW_TYPE)[0];

    if (!leaf) {
      // New leaf on the right side. `false` means don't split an existing
      // pane — just open the right sidebar if it isn't already showing.
      const newLeaf = workspace.getRightLeaf(false);
      if (!newLeaf) return;
      leaf = newLeaf;
      await leaf.setViewState({ type: SIDEBAR_VIEW_TYPE, active: true });
    }

    void workspace.revealLeaf(leaf);

    const view = leaf.view;
    if (view instanceof SidebarView && tab) {
      view.switchTab(tab);
    }
  }

  // ==================== Lint ====================

  async lintWiki(): Promise<void> {
    if (!this.requireLLMReady()) return;
    const signal = this.wikiEngine.startLintOperation();
    try {
      await runLintWiki({
        app: this.app,
        settings: this.settings,
        llmClient: this.llmClient,
        wikiEngine: this.wikiEngine,
        onAnalyzeSchema: () => { void this.suggestSchemaUpdate(); },
      }, signal);
    } finally {
      this.wikiEngine.endLintOperation();
    }
  }

  // ==================== Schema ====================

  async suggestSchemaUpdate(): Promise<void> {
    // ROADMAP v1.17.0 P1 #1: delegate to runSchemaAnalyze so the status bar's
    // "click to cancel" works for both this call site and the Lint Report
    // Modal's "Suggest Schema Updates" button (both ultimately reach here).
    await runSchemaAnalyze({
      settings: this.settings,
      llmClient: this.llmClient,
      wikiEngine: this.wikiEngine,
      schemaManager: this.schemaManager,
      requireLLMReady: () => this.requireLLMReady(),
    });
  }

  // ==================== Connection Test ====================

  async testLLMConnection(): Promise<{ success: boolean; message: string }> {
    const t = TEXTS[this.settings.language] || TEXTS.en;

    const isOllama = this.settings.provider === 'ollama';
    if (!isOllama && (!this.settings.apiKey || this.settings.apiKey.trim() === '')) {
      return { success: false, message: t.errorNoApiKey || 'API Key is not configured' };
    }

    try {
      const testClient = createLLMClient(this.settings);

      const testResponse = await testClient.createMessage({
        model: this.settings.model,
        max_tokens: TOKENS_QUERY_MODEL_DETECT,
        messages: [{
          role: 'user',
          content: 'Test connection. Please reply "Connection successful".'
        }]
      });

      console.debug('Test response:', testResponse);
      this.settings.llmReady = true;

      // Probe: does this provider accept `thinking: { type: 'disabled' }`?
      // The result is cached in settings so subsequent LLM calls can avoid a
      // redundant 400 round-trip. The in-request fallback (retry without
      // thinking control) handles any mismatch between probe and runtime.
      if (testClient instanceof OpenAICompatibleClient || testClient instanceof AnthropicCompatibleClient || testClient instanceof AnthropicClient) {
        try {
          await testClient.createMessage({
            model: this.settings.model,
            max_tokens: 1,
            messages: [{ role: 'user', content: 'think' }],
            disableThinking: true,
          });
          if (testClient instanceof OpenAICompatibleClient) {
            testClient.thinkingControlSupported = true;
          }
          // Issue #243: skip writing when cacheKey is empty to avoid
          // polluting the cache with an unusable key.
          const cacheKey = getThinkingControlCacheKey(this.settings);
          if (cacheKey) {
            this.settings.thinkingControlCache = {
              ...this.settings.thinkingControlCache,
              [cacheKey]: true,
            };
            console.debug('Thinking control supported by', cacheKey);
          }
        } catch {
          if (testClient instanceof OpenAICompatibleClient) {
            testClient.thinkingControlSupported = false;
          }
          const cacheKey = getThinkingControlCacheKey(this.settings);
          if (cacheKey) {
            this.settings.thinkingControlCache = {
              ...this.settings.thinkingControlCache,
              [cacheKey]: false,
            };
            console.debug('Thinking control NOT supported by', cacheKey);
          }
        }
      }
      await this.saveSettings();

      // Auto-initialize wiki structure after first successful connection
      if (this.wikiEngine) {
        const isInit = await this.isWikiInitialized();
        if (!isInit) {
          try {
            await this.wikiEngine.ensureWikiStructure();
            console.debug('Wiki structure auto-initialized');
          } catch (initError) {
            console.warn('Auto wiki init failed:', initError);
            // Non-fatal: user can still use plugin, just needs manual init
          }
        }
      }

      const providerName = (PREDEFINED_PROVIDERS[this.settings.provider]?.nameEn || this.settings.provider);

      return {
        success: true,
        message: `✅ ${t.testConnectionSuccessful || 'Connection successful'}${t.testConnectionProvider ? ': ' : ''}${providerName}`
      };
    } catch (error) {
      console.error('Connection test failed:', error);
      this.settings.llmReady = false;
      await this.saveSettings();
      const errorMsg = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        message: `❌ ${t.testConnectionFailed || 'Connection failed'}: ${errorMsg || t.errorUnknown || 'Unknown error'}`
      };
    }
  }

  /**
   * Check if wiki structure exists by IO inspection (no persistent flag).
   * Handles custom wikiFolder changes gracefully.
   */
  private async isWikiInitialized(): Promise<boolean> {
    const wikiFolder = this.settings.wikiFolder || 'wiki';
    const requiredFolders = [
      `${wikiFolder}/entities`,
      `${wikiFolder}/concepts`,
      `${wikiFolder}/sources`,
      `${wikiFolder}/schema`
    ];
    for (const folder of requiredFolders) {
      const folderObj = this.app.vault.getAbstractFileByPath(folder);
      if (!folderObj) return false;
    }
    return true;
  }

  // ==================== Sidebar Maintain Panel accessors ====================

  /**
   * Public wrapper for the LLM readiness check used by requireLLMReady().
   * Sidebar panels (e.g. MaintainPanel) call this to gate button enabled
   * state without duplicating the llmReady || hasLLMConfig logic.
   */
  isLLMReady(): boolean {
    return this.settings.llmReady || hasLLMConfig(this.settings);
  }

  /**
   * Returns the file currently active in the editor, or null if no markdown
   * view is focused. Wrapper over app.workspace.getActiveFile so React
   * components don't need to hold the Obsidian app reference directly.
   */
  getActiveFile(): TFile | null {
    return this.app.workspace.getActiveFile();
  }

  /**
   * Snapshot of the wikiEngine's busy state. Sidebar panels poll this
   * (e.g. every 500ms) to enable/disable the "Cancel" button in real time
   * without coupling to internal wikiEngine event APIs.
   */
  getEngineBusy(): { ingesting: boolean; lintRunning: boolean } {
    return {
      ingesting: this.wikiEngine.isIngesting(),
      lintRunning: this.wikiEngine.isLintRunning(),
    };
  }

  private requireLLMReady(): boolean {
    // 1. 老标志位优先（兼容历史数据 + 测试连接成功的会话）
    if (this.settings.llmReady) return true;
    // 2. 配置齐全也算就绪 —— 不强迫用户每次点"测试连接"。
    //    改 provider/apiKey/baseUrl 时 settings.ts 已重置 llmReady=false，
    //    用户填完配置就能用，避免命令面板误报"LLM 尚未配置"。
    if (hasLLMConfig(this.settings)) return true;

    new Notice(getText(this.settings.language, 'llmNotReady'), NOTICE_ERROR);
    return false;
  }
}
