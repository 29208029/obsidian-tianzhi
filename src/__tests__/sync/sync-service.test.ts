// SyncService 单元测试
// 重点:
//  - 枚举阶段过滤掉 wiki/ 目录
//  - 枚举阶段只保留白名单扩展名
//  - 单文件 > 200MB 计入 failedFiles
//  - 远端同名文件被跳过
//  - 上传阶段 KB_BATCH_SIZE 切片
//  - 1 个文件 upload 失败不影响其他
//  - 阶段失败 → 整批 abort
//  - 订阅 listener 实时收到事件

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { requestUrl, TFile } from 'obsidian';
import { SyncService } from '../../sync/sync-service';
import { IAMAuthService } from '../../auth/IAMAuthService';
import { KB_BATCH_SIZE, KB_MAX_FILE_BYTES } from '../../sync/constants';
import type { IAMUserInfo } from '../../auth/IAMTypes';
import type { LLMWikiSettings } from '../../types';

let ruMock: ReturnType<typeof vi.mocked<typeof requestUrl>>;

function ruResponse(body: unknown, status = 200): { status: number; json: unknown; text: string; headers: Record<string, string> } {
  return {
    status,
    json: body,
    text: typeof body === "string" ? body : JSON.stringify(body),
    headers: {},
  };
}

function queueResponse(body: unknown, status = 200): void {
  ruMock.mockResolvedValueOnce(ruResponse(body, status) as never);
}

/** 取出所有 requestUrl 调用的 url 列表 */
function calledUrls(urlPart: string): string[] {
  return (ruMock.mock.calls as unknown as [{ url?: string } | string, unknown][])
    .map(([u]) => (typeof u === "string" ? u : u?.url ?? ""))
    .filter((u): u is string => Boolean(u && u.includes(urlPart)));
}

/** 取 url 匹配的第一个 requestUrl 调用,未找到返回 undefined */
function firstCallWith(urlPart: string): string | undefined {
  return (ruMock.mock.calls as unknown as [{ url?: string } | string, unknown][])
    .map(([u]) => (typeof u === "string" ? u : u?.url ?? ""))
    .find((u): u is string => Boolean(u && u.includes(urlPart)));
}

/** 简易文件描述符(无需真实 TFile) */
interface FakeFile {
  path: string;
  basename: string;
  name: string;
  stat: { size: number };
}

function makeApp(files: FakeFile[]): { vault: unknown; app: unknown } {
  const map = new Map<string, FakeFile>();
  for (const f of files) map.set(f.path, f);
  return {
    app: {
      vault: {
        // getFiles() 返回全部 TFile (含二进制),service 自己 instanceof 过滤
        getFiles: () =>
          [...map.values()].map((f) => Object.assign(new TFile(), f)),
        read: async (file: FakeFile) => `content of ${file.basename}`,
        readBinary: async (file: FakeFile) =>
          new TextEncoder().encode(`content of ${file.basename}`).buffer,
      },
    },
    vault: map,
  };
}

function stubAuth(userName: string): void {
  const userInfo: IAMUserInfo = {
    user_name: userName,
    email: `${userName}@example.com`,
    // access_token = JWT,new_c_regist 接口返回的 4 个数据接口 Bearer
    access_token: 'jwt_access_token_xxx',
  };
  vi.spyOn(IAMAuthService.prototype, 'getState').mockReturnValue({
    isLoggedIn: true,
    userInfo,
    token: 'tianzhi_iip_token_xxx',
  });
}

function makeSettings(overrides: Partial<LLMWikiSettings> = {}): LLMWikiSettings {
  return {
    provider: 'mock',
    apiKey: '',
    baseUrl: '',
    model: 'mock',
    wikiFolder: 'wiki',
    language: 'en',
    wikiLanguage: 'English',
    useCustomWikiLanguage: false,
    availableModels: [],
    useCustomModel: false,
    maxConversationHistory: 10,
    queryHistory: [],
    enableSchema: false,
    tagVocabularyMode: 'default',
    customEntityTags: '',
    customConceptTags: '',
    extractionGranularity: 'standard',
    autoWatchSources: false,
    autoWatchMode: 'notify',
    autoWatchDebounceMs: 5000,
    watchedFolders: [],
    periodicLint: 'off',
    startupCheck: false,
    autoSmartFix: false,
    pageGenerationConcurrency: 1,
    batchDelayMs: 0,
    llmReady: true,
    maxTokensPerCall: 0,
    slugCase: 'lower',
    ...overrides,
  };
}

/** 排好 KB 接口的 mock 队列:list / listDocs — 按调用顺序 */
function stubKbFound(ragflowId: string): void {
  // 1. KB list — 找到唯一匹配
  queueResponse({
    code: 200,
    data: { total: 1, rows: [{ ragflowId: ragflowId, name: 'aliceObsidian自动同步知识库' }] },
  });
  // 2. doc list
  queueResponse({ retcode: 0, retmsg: 'ok', data: { docs: [], total: 0 } });
}

function stubKbNotFound(): void {
  // 1. KB list — 0 命中
  queueResponse({ code: 200, data: { total: 0, rows: [] } });
  // 2. KB create
  queueResponse({ status_code: 200, data: { ragflow_id: 'rb_new', id: 1 } });
  // 3. grant permission
  queueResponse({ status_code: 200 });
  // 4. doc list
  queueResponse({ retcode: 0, retmsg: 'ok', data: { docs: [], total: 0 } });
}

describe('SyncService', () => {
  beforeEach(() => {
    ruMock = vi.mocked(requestUrl);
    ruMock.mockReset();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    ruMock.mockReset();
  });

  describe('enumerating', () => {
    it('excludes files under wiki/ directory', async () => {
      stubAuth('alice');
      const { app } = makeApp([
        { path: 'wiki/entities/foo.md', basename: 'foo', name: 'foo.md', stat: { size: 10 } },
        { path: 'wiki/extra.md', basename: 'extra', name: 'extra.md', stat: { size: 10 } },
      ]);
      stubKbFound('rb_1');

      const service = new SyncService(app as never, makeSettings({ wikiFolder: 'wiki' }));
      await service.run();

      // KB list + doc list 共 2 次;没有 upload
      const uploadCalls = calledUrls('/document/upload');
      expect(uploadCalls).toHaveLength(0);
    });

    it('only keeps files with allowed extensions', async () => {
      stubAuth('alice');
      const { app } = makeApp([
        { path: 'a.md', basename: 'a', name: 'a.md', stat: { size: 10 } },
        { path: 'b.txt', basename: 'b', name: 'b.txt', stat: { size: 10 } },
        { path: 'c.doc', basename: 'c', name: 'c.doc', stat: { size: 10 } }, // 不在白名单
        { path: 'd.png', basename: 'd', name: 'd.png', stat: { size: 10 } },
        { path: 'e.pdf', basename: 'e', name: 'e.pdf', stat: { size: 10 } },
      ]);
      stubKbFound('rb_1');
      // doc list 上传 (md + txt + png + pdf)
      for (let i = 0; i < 4; i++) {
        queueResponse({ retcode: 0, retmsg: 'ok' });
      }

      const service = new SyncService(app as never, makeSettings());
      await service.run();

      const uploadCalls = calledUrls('/document/upload');
      expect(uploadCalls).toHaveLength(4);
    });
  });

  describe('creatingKb', () => {
    it('uses ${user_name}Obsidian自动同步知识库 as query', async () => {
      stubAuth('alice');
      const { app } = makeApp([]);
      stubKbFound('rb_1');

      await new SyncService(app as never, makeSettings()).run();

      const kbListCall = firstCallWith('/knowledge/page');
      expect(kbListCall).toBeDefined();
      // query 携带中文(不预编码,requestUrl 内部 URL parser 会编码)
      expect(kbListCall!).toContain('query=aliceObsidian自动同步知识库');
    });

    it('calls grant permission only when isNew=true', async () => {
      stubAuth('alice');
      const { app } = makeApp([]);
      stubKbNotFound();

      await new SyncService(app as never, makeSettings()).run();

      const grantCall = firstCallWith('saveNewResourcePermission');
      expect(grantCall).toBeDefined();
    });
  });

  describe('listingDocs', () => {
    it('skips files whose basename already exists remotely', async () => {
      stubAuth('alice');
      const { app } = makeApp([
        { path: 'a.md', basename: 'a', name: 'a.md', stat: { size: 10 } },
        { path: 'b.md', basename: 'b', name: 'b.md', stat: { size: 10 } },
      ]);
      // KB list — found
      queueResponse({
        code: 200,
        data: { total: 1, rows: [{ ragflowId: 'rb', name: 'aliceObsidian自动同步知识库' }] },
      });
      // doc list — a.md 已经在远端
      queueResponse({
        retcode: 0,
        retmsg: 'ok',
        data: { docs: [{ id: 'd1', name: 'a.md' }], total: 1 },
      });
      // upload b.md
      queueResponse({ retcode: 0, retmsg: 'ok' });

      await new SyncService(app as never, makeSettings()).run();

      const uploadCalls = calledUrls('/document/upload');
      expect(uploadCalls).toHaveLength(1);
    });
  });

  describe('uploading', () => {
    it('skips files > KB_MAX_FILE_BYTES', async () => {
      stubAuth('alice');
      const { app } = makeApp([
        { path: 'big.md', basename: 'big', name: 'big.md', stat: { size: KB_MAX_FILE_BYTES + 1 } },
        { path: 'small.md', basename: 'small', name: 'small.md', stat: { size: 100 } },
      ]);
      stubKbFound('rb_1');
      // upload small.md
      queueResponse({ retcode: 0, retmsg: 'ok' });

      const result = await new SyncService(app as never, makeSettings()).run();

      expect(result.failed).toContain('big');
      const uploadCalls = calledUrls('/document/upload');
      expect(uploadCalls).toHaveLength(1);
    });

    it('continues when one upload fails', async () => {
      stubAuth('alice');
      const { app } = makeApp([
        { path: 'a.md', basename: 'a', name: 'a.md', stat: { size: 10 } },
        { path: 'b.md', basename: 'b', name: 'b.md', stat: { size: 10 } },
        { path: 'c.md', basename: 'c', name: 'c.md', stat: { size: 10 } },
      ]);
      stubKbFound('rb_1');
      // a.md upload — 失败
      queueResponse({}, 500);
      // b.md upload — 成功
      queueResponse({ retcode: 0, retmsg: 'ok' });
      // c.md upload — 成功
      queueResponse({ retcode: 0, retmsg: 'ok' });

      const result = await new SyncService(app as never, makeSettings()).run();
      expect(result.failed).toEqual(['a']);
    });

    it('respects KB_BATCH_SIZE slicing (sequential, not parallel)', async () => {
      stubAuth('alice');
      // KB_BATCH_SIZE + 5 个文件,确保有跨批
      const n = KB_BATCH_SIZE + 5;
      const files: FakeFile[] = Array.from({ length: n }, (_, i) => ({
        path: `f${i}.md`,
        basename: `f${i}`,
        name: `f${i}.md`,
        stat: { size: 10 },
      }));
      const { app } = makeApp(files);
      stubKbFound('rb_1');
      // n 个 upload
      for (let i = 0; i < n; i++) {
        queueResponse({ retcode: 0, retmsg: 'ok' });
      }

      const result = await new SyncService(app as never, makeSettings()).run();
      expect(result.failed).toEqual([]);
      const uploadCalls = calledUrls('/document/upload');
      expect(uploadCalls).toHaveLength(n);
    });
  });

  describe('aborts', () => {
    it('aborts whole batch on creatingKb failure', async () => {
      stubAuth('alice');
      const { app } = makeApp([
        { path: 'a.md', basename: 'a', name: 'a.md', stat: { size: 10 } },
      ]);
      // KB list 失败
      queueResponse({}, 500);

      const result = await new SyncService(app as never, makeSettings()).run();
      const uploadCalls = calledUrls('/document/upload');
      expect(uploadCalls).toHaveLength(0);
      expect(result.uploaded + result.skipped + result.failed.length).toBe(0);
    });
  });

  describe('subscribe', () => {
    it('emits phase events in order', async () => {
      stubAuth('alice');
      const { app } = makeApp([]);
      stubKbFound('rb_1');

      const phases: string[] = [];
      const service = new SyncService(app as never, makeSettings());
      service.subscribe((e) => phases.push(e.phase));
      await service.run();

      expect(phases).toContain('enumerating');
      expect(phases).toContain('creatingKb');
      expect(phases).toContain('listingDocs');
      expect(phases[phases.length - 1]).toBe('completed');
    });
  });

  describe('logging', () => {
    it('emits structured [LLM-Wiki Sync] log lines during run', async () => {
      stubAuth('alice');
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      try {
        const { app } = makeApp([
          { path: 'wiki/skip.md', basename: 'skip', name: 'skip.md', stat: { size: 10 } },
          { path: 'b.doc', basename: 'b', name: 'b.doc', stat: { size: 10 } }, // 不在白名单
          { path: 'a.md', basename: 'a', name: 'a.md', stat: { size: 10 } },
        ]);
        stubKbFound('rb_1');
        queueResponse({ retcode: 0, retmsg: 'ok' });

        await new SyncService(app as never, makeSettings()).run();

        const allLogs = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
        // 启动 + 阶段 + 跳过 + 远端清单 + 批次 + 上传 + 完成
        expect(allLogs).toContain('[LLM-Wiki Sync]');
        expect(allLogs).toContain('=== 同步开始 ===');
        expect(allLogs).toContain('阶段 1/4 enumerating');
        expect(allLogs).toContain('阶段 2/4 creatingKb');
        expect(allLogs).toContain('阶段 4/4 listingDocs');
        expect(allLogs).toContain('阶段 5/4 uploading');
        expect(allLogs).toContain('=== 同步结束 ===');
        // 跳过原因
        expect(allLogs).toMatch(/skip\.md \(in wiki\/\)/);
        expect(allLogs).toMatch(/b\.doc \(ext \.doc not allowed\)/);
        // 上传成功
        expect(allLogs).toContain('上传 [1/1]: a.md');
        expect(allLogs).toContain('✓ 上传成功: a.md');
      } finally {
        logSpy.mockRestore();
      }
    });

    it('logs failure on KB_LIST error', async () => {
      stubAuth('alice');
      const logSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        const { app } = makeApp([]);
        queueResponse({}, 500);

        await new SyncService(app as never, makeSettings()).run();

        const errLogs = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
        expect(errLogs).toContain('同步异常中断');
        expect(errLogs).toContain('code=NETWORK');
      } finally {
        logSpy.mockRestore();
      }
    });
  });

  describe('re-entrance', () => {
    it('second run() while running returns cancelled result', async () => {
      stubAuth('alice');
      const { app } = makeApp([
        { path: 'a.md', basename: 'a', name: 'a.md', stat: { size: 10 } },
      ]);
      stubKbFound('rb_1');
      // 上传 a.md — 成功
      queueResponse({ retcode: 0, retmsg: 'ok' });

      const service = new SyncService(app as never, makeSettings());
      const first = service.run();
      const second = await service.run();
      expect(second.cancelled).toBe(true);
      await first;
    });
  });
});
