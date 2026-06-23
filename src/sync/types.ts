// 知识同步 — 共享类型

export type SyncPhase =
  | "idle"
  | "enumerating"
  | "creatingKb"
  | "listingDocs"
  | "uploading"
  | "completed"
  | "error";

export type SyncStatus = "idle" | "syncing" | "completed" | "error";

export interface SyncProgressEvent {
  status: SyncStatus;
  phase: SyncPhase;
  current: number;
  total: number;
  currentFile: string;
  failedFiles: string[];
  errorMessage?: string;
}

export interface RemoteDoc {
  id: string;
  name: string;
}

export interface RemoteDocList {
  docs: RemoteDoc[];
  total: number;
}

export type SyncErrorCode =
  | "KB_LIST"
  | "KB_CREATE"
  | "PERMISSION"
  | "LIST_DOCS"
  | "UPLOAD"
  | "NETWORK"
  | "UNAUTHORIZED";

export interface SyncError {
  code: SyncErrorCode;
  message: string;
  status?: number;
}

export interface KnowledgeBaseRef {
  ragflowId: string;
  isNew: boolean;
  /** 知识库 id (仅新建时供 grantPermission 用) */
  resourceId?: number;
}

export interface SyncResult {
  uploaded: number;
  skipped: number;
  failed: string[];
  cancelled?: boolean;
}

export type SyncListener = (event: SyncProgressEvent) => void;

/** 用于 `getOrCreateKnowledgeBase` 内部"创建成功"分支的回执数据 */
export interface KBCreateResponse {
  status_code: number;
  data: {
    ragflow_id: string;
    id: number;
    name?: string;
  };
}

/** 知识库 page 列表的 data 项 (API 返回驼峰字段) */
export interface KBListDataItem {
  ragflowId?: string;
  id?: number;
  name?: string;
}

export interface KBListResponse {
  code: number;
  msg?: string;
  data?: { total?: number; rows?: KBListDataItem[] };
}

export interface DocListApiResponse {
  retcode: number;
  retmsg: string;
  data: {
    docs: Array<{ id: string; name: string }>;
    total: number;
  };
}
