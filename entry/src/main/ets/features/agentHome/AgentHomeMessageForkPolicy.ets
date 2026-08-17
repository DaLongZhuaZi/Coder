import { AgentHomeChatItem, AgentHomeMessageRole } from './AgentHomeModels';

export class AgentHomeMessageForkWorkspaceMode {
  static readonly SHARED: string = 'shared';
  static readonly ISOLATED: string = 'isolated';
}

export class AgentHomeMessageForkPolicy {
  static isEligible(item: AgentHomeChatItem, activeSessionId: string): boolean {
    return activeSessionId.length > 0 && item.sessionId === activeSessionId &&
      item.role === AgentHomeMessageRole.ASSISTANT && item.messageId.length > 0 &&
      AgentHomeMessageForkPolicy.isAuthoritativeCursor(item.timelineEpoch, item.timelineSeq);
  }

  static matchesAuthoritativeCursor(
    item: AgentHomeChatItem,
    boundaryMessageId: string,
    timelineEpoch: number,
    timelineSeq: number
  ): boolean {
    return boundaryMessageId.length > 0 && AgentHomeMessageForkPolicy.isAuthoritativeCursor(timelineEpoch, timelineSeq) &&
      item.messageId === boundaryMessageId && item.timelineEpoch === timelineEpoch &&
      item.timelineSeq === timelineSeq;
  }

  static normalizeWorkspaceMode(workspaceMode: string): string {
    return workspaceMode.trim().toLowerCase() === AgentHomeMessageForkWorkspaceMode.ISOLATED ?
      AgentHomeMessageForkWorkspaceMode.ISOLATED : AgentHomeMessageForkWorkspaceMode.SHARED;
  }

  static matchesPreviewBinding(
    expectedMessageId: string,
    expectedTimelineEpoch: number,
    expectedTimelineSeq: number,
    expectedWorkspaceMode: string,
    responseMessageId: string,
    responseTimelineEpoch: number,
    responseTimelineSeq: number,
    responseWorkspaceMode: string
  ): boolean {
    if (expectedMessageId.length === 0 || responseMessageId !== expectedMessageId ||
      !AgentHomeMessageForkPolicy.isAuthoritativeCursor(expectedTimelineEpoch, expectedTimelineSeq) ||
      responseTimelineEpoch !== expectedTimelineEpoch || responseTimelineSeq !== expectedTimelineSeq) {
      return false;
    }
    if (responseWorkspaceMode.length === 0) {
      return true;
    }
    if (!AgentHomeMessageForkPolicy.isKnownWorkspaceMode(responseWorkspaceMode)) {
      return false;
    }
    return AgentHomeMessageForkPolicy.normalizeWorkspaceMode(responseWorkspaceMode) ===
      AgentHomeMessageForkPolicy.normalizeWorkspaceMode(expectedWorkspaceMode);
  }

  private static isAuthoritativeCursor(timelineEpoch: number, timelineSeq: number): boolean {
    return Number.isFinite(timelineEpoch) && Number.isFinite(timelineSeq) && timelineEpoch > 0 && timelineSeq > 0 &&
      Math.floor(timelineEpoch) === timelineEpoch && Math.floor(timelineSeq) === timelineSeq;
  }

  private static isKnownWorkspaceMode(workspaceMode: string): boolean {
    const value = workspaceMode.trim().toLowerCase();
    return value === AgentHomeMessageForkWorkspaceMode.SHARED ||
      value === AgentHomeMessageForkWorkspaceMode.ISOLATED;
  }
}
