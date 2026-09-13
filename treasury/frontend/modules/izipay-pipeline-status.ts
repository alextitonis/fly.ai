export type PipelineStage =
  | "check-dedup"
  | "swap"
  | "resolve-intent"
  | "resolve-card"
  | "request-card"
  | "request-topup"
  | "store-card"
  | "bridge"
  | "poll-confirmation"
  | "mark-done"
  | "mark-failed";

export type PipelineStatus = "pending" | "running" | "completed" | "failed";

export interface PipelineStageInfo {
  stage: PipelineStage;
  status: PipelineStatus;
  startedAt?: number;
  completedAt?: number;
  error?: string;
}

export interface PipelineState {
  depositId: string;
  depositType: "issuance" | "topup";
  status: PipelineStatus;
  stages: PipelineStageInfo[];
  startedAt: number;
  completedAt?: number;
  cardId?: string;
  txHash?: string;
}
