export class AgentHomeWorkspacePreviewRequestMatch {
  matched: boolean;
  path: string;

  constructor(matched: boolean, path: string = '') {
    this.matched = matched;
    this.path = path;
  }
}

export class AgentHomeWorkspacePreviewRequestTracker {
  private requestId: string = '';
  private path: string = '';

  track(requestId: string, path: string): void {
    this.requestId = requestId;
    this.path = requestId.length > 0 ? path : '';
  }

  consume(requestId: string): AgentHomeWorkspacePreviewRequestMatch {
    if (requestId.length === 0 || requestId !== this.requestId) {
      return new AgentHomeWorkspacePreviewRequestMatch(false);
    }
    const matchedPath = this.path;
    this.clear();
    return new AgentHomeWorkspacePreviewRequestMatch(true, matchedPath);
  }

  clear(): void {
    this.requestId = '';
    this.path = '';
  }

  currentRequestId(): string {
    return this.requestId;
  }

  currentPath(): string {
    return this.path;
  }
}
