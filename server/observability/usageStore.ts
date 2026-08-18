import { PipelineCallLog, AnalysisRunUsageSummary } from "./types";

export interface PipelineUsageStore {
  saveCallLog(log: PipelineCallLog): Promise<void>;
  saveRunSummary(summary: AnalysisRunUsageSummary): Promise<void>;
  getRunSummary(runId: string): Promise<AnalysisRunUsageSummary | null>;
  getCallLogs(runId: string): Promise<PipelineCallLog[]>;
  getAllRunSummaries(limit?: number): Promise<AnalysisRunUsageSummary[]>;
  clearAll(): Promise<void>;
}

class InMemoryUsageStore implements PipelineUsageStore {
  private callLogs: PipelineCallLog[] = [];
  private runSummaries: Map<string, AnalysisRunUsageSummary> = new Map();

  async saveCallLog(log: PipelineCallLog): Promise<void> {
    this.callLogs.push(log);
  }

  async saveRunSummary(summary: AnalysisRunUsageSummary): Promise<void> {
    this.runSummaries.set(summary.analysisRunId, summary);
  }

  async getRunSummary(runId: string): Promise<AnalysisRunUsageSummary | null> {
    return this.runSummaries.get(runId) || null;
  }

  async getCallLogs(runId: string): Promise<PipelineCallLog[]> {
    return this.callLogs.filter((log) => log.analysisRunId === runId);
  }

  async getAllRunSummaries(limit = 20): Promise<AnalysisRunUsageSummary[]> {
    const list = Array.from(this.runSummaries.values());
    list.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
    return list.slice(0, limit);
  }

  async clearAll(): Promise<void> {
    this.callLogs = [];
    this.runSummaries.clear();
  }
}

export const globalUsageStore = new InMemoryUsageStore();
