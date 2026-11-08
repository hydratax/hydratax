export type PracticeTaskKind = "document" | "query";
export type PracticeTaskStatus =
  | "unallocated"
  | "allocated"
  | "done"
  | "cancelled";
export type PracticeTaskSource = "email" | "manual" | "forward";

export type PracticeTask = {
  id: string;
  practiceId: string;
  kind: PracticeTaskKind;
  status: PracticeTaskStatus;
  title: string;
  body: string | null;
  fromAddress: string | null;
  source: PracticeTaskSource;
  sourceEmailId: string | null;
  clientId: string | null;
  clientName?: string | null;
  assigneeUserId: string | null;
  assigneeName?: string | null;
  allocatedBy: string | null;
  allocatedAt: string | null;
  filename: string | null;
  contentType: string | null;
  storageKey: string | null;
  byteSize: number | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  commentCount?: number;
};

export type PracticeTaskComment = {
  id: string;
  practiceId: string;
  taskId: string;
  authorUserId: string;
  authorName?: string | null;
  body: string;
  createdAt: string;
};
