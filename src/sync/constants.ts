// 知识同步 — 云端接口常量
//
// 接口地址硬编码(用户确认,后续如需灵活可挪到 settings)。
// 鉴权依赖 tianzhi_iip_token cookie (见 IAMAuthService.COOKIE_URLS),
// Obsidian requestUrl 在桌面端对同 *.cosmoplat.com 域自动带 cookie。

export const SYNC_API = {
  KB_LIST_URL:
    "https://agent-embed.s.cosmoplat.com/intelligent-agent/api/knowledge/page",
  KB_CREATE_URL:
    "https://agent-embed.s.cosmoplat.com/api/v1/knowledge/create",
  PERMISSION_URL:
    "https://agent-embed.s.cosmoplat.com/intelligent-agent/api/v1/resource/permission/saveNewResourcePermission",
  DOC_LIST_URL:
    "https://agent-embed.s.cosmoplat.com/kb-api/v1/document/list",
  DOC_UPLOAD_URL:
    "https://agent-embed.s.cosmoplat.com/kb-api/v1/document/upload",
} as const;

// 知识库默认参数 — 用户给出的固定值
export const KB_MODEL = "text-embedding-ada-002";
export const KB_TYPE = "document";
export const KB_RESOURCE_GROUP = "0";

// 自动同步:每小时一次
export const SYNC_INTERVAL_MS = 60 * 60 * 1000;

// 远端上传限制
// 1) 每批最多 10 个文件(超出的在 SyncService 内部按 batch 顺序串行上传)
// 2) 单文件最大 200 MB(超过直接进 failedFiles,syncErrorFileTooLarge)
export const KB_BATCH_SIZE = 10;
export const KB_MAX_FILE_BYTES = 200 * 1024 * 1024;

// 支持上传的扩展名(白名单,大小写不敏感)。
// DOCX/EXCEL/PPT/IMAGE/PDF/TXT/MD/JSON/EML/HTML
//  - DOCX:  docx
//  - EXCEL: xls, xlsx, csv
//  - PPT:   ppt, pptx
//  - IMAGE: jpg, jpeg, png, gif, bmp, webp, svg, tiff, tif
//  - PDF:   pdf
//  - TXT:   txt
//  - MD:    md, markdown
//  - JSON:  json
//  - EML:   eml
//  - HTML:  html, htm
export const KB_ALLOWED_EXTS: ReadonlySet<string> = new Set([
  "docx",
  "xls", "xlsx", "csv",
  "ppt", "pptx",
  "jpg", "jpeg", "png", "gif", "bmp", "webp", "svg", "tiff", "tif",
  "pdf",
  "txt",
  "md", "markdown",
  "json",
  "eml",
  "html", "htm",
]);
