import { AgentBridgeRichContentNode } from '../agentBridge/AgentBridgeModels';

export class AgentHomeRichContentNodeKind {
  static readonly TEXT: string = 'text';
  static readonly CODE: string = 'code';
  static readonly LINK: string = 'link';
  static readonly FILE: string = 'file';
  static readonly TOOL: string = 'tool';
  static readonly TODO: string = 'todo';
  static readonly DIFF: string = 'diff';
  static readonly WARNING: string = 'warning';
  static readonly FALLBACK: string = 'fallback';
}

export class AgentHomeToolCardCategory {
  static readonly FILE: string = 'file';
  static readonly SHELL: string = 'shell';
  static readonly GIT: string = 'git';
  static readonly GITHUB: string = 'github';
  static readonly CHECKPOINT: string = 'checkpoint';
  static readonly TERMINAL: string = 'terminal';
  static readonly PERMISSION: string = 'permission';
  static readonly PLAN: string = 'plan';
  static readonly FALLBACK: string = 'fallback';
}

export class AgentHomeCodeLanguageCategory {
  static readonly ARKTS: string = 'arkts';
  static readonly JSON: string = 'json';
  static readonly SHELL: string = 'shell';
  static readonly DIFF: string = 'diff';
  static readonly PLAIN: string = 'plain';
}

export class AgentHomeTodoStatus {
  static readonly PENDING: string = 'pending';
  static readonly IN_PROGRESS: string = 'in_progress';
  static readonly COMPLETED: string = 'completed';
  static readonly CANCELLED: string = 'cancelled';
}

export class AgentHomeRichContentDecision {
  renderKind: string;
  toolCategory: string;
  normalizedPath: string;
  line: number;
  todoStatus: string;
  interactive: boolean;
  fallbackReason: string;
  workspaceId: string;

  constructor(
    renderKind: string,
    toolCategory: string = AgentHomeToolCardCategory.FALLBACK,
    normalizedPath: string = '',
    line: number = 0,
    todoStatus: string = '',
    interactive: boolean = false,
    fallbackReason: string = '',
    workspaceId: string = ''
  ) {
    this.renderKind = renderKind;
    this.toolCategory = toolCategory;
    this.normalizedPath = normalizedPath;
    this.line = line;
    this.todoStatus = todoStatus;
    this.interactive = interactive;
    this.fallbackReason = fallbackReason;
    this.workspaceId = workspaceId;
  }
}

export class AgentHomeRichContentPolicy {
  static readonly MAX_FILE_PATH_LENGTH: number = 4096;
  static readonly MAX_FILE_PATH_SEGMENTS: number = 256;
  static readonly MAX_FILE_LINE: number = 10000000;

  static normalizeRelativePath(rawPath: string): string {
    let value = rawPath.trim().split('\\').join('/');
    if (value.length > AgentHomeRichContentPolicy.MAX_FILE_PATH_LENGTH ||
      AgentHomeRichContentPolicy.hasControlCharacter(value)) {
      return '';
    }
    while (value.startsWith('./')) {
      value = value.substring(2);
    }
    if (value.length === 0 || value.startsWith('/') || value.indexOf('://') >= 0 ||
      (value.length > 1 && value.charAt(1) === ':')) {
      return '';
    }
    const segments: Array<string> = value.split('/');
    if (segments.length > AgentHomeRichContentPolicy.MAX_FILE_PATH_SEGMENTS) {
      return '';
    }
    const normalizedSegments: Array<string> = [];
    for (let index = 0; index < segments.length; index++) {
      const segment = segments[index];
      if (segment.length === 0 || segment === '.') {
        continue;
      }
      if (segment === '..') {
        return '';
      }
      if (segment.indexOf(':') >= 0) {
        return '';
      }
      normalizedSegments.push(segment);
    }
    return normalizedSegments.join('/');
  }

  static normalizeFileLine(line: number): number {
    if (!Number.isFinite(line) || Math.floor(line) !== line || line < 0 ||
      line > AgentHomeRichContentPolicy.MAX_FILE_LINE) {
      return -1;
    }
    return line;
  }

  static isSafeWorkspaceFileNode(node: AgentBridgeRichContentNode, authoritativeWorkspaceId: string): boolean {
    if (node.kind !== AgentHomeRichContentNodeKind.FILE || authoritativeWorkspaceId.length === 0 ||
      node.workspaceId.length === 0 || node.workspaceId !== authoritativeWorkspaceId ||
      AgentHomeRichContentPolicy.normalizeFileLine(node.line) < 0) {
      return false;
    }
    return AgentHomeRichContentPolicy.normalizeRelativePath(node.path).length > 0;
  }

  static toolCardCategory(toolName: string): string {
    const value = toolName.trim().toLowerCase();
    if (value.length === 0) {
      return AgentHomeToolCardCategory.FALLBACK;
    }
    if (AgentHomeRichContentPolicy.matchesToolName(value, 'github') ||
      AgentHomeRichContentPolicy.matchesToolName(value, 'gh') ||
      AgentHomeRichContentPolicy.matchesToolName(value, 'pull_request') ||
      AgentHomeRichContentPolicy.matchesToolName(value, 'pull-request')) {
      return AgentHomeToolCardCategory.GITHUB;
    }
    if (AgentHomeRichContentPolicy.matchesToolName(value, 'checkpoint') ||
      AgentHomeRichContentPolicy.matchesToolName(value, 'agent.checkpoint')) {
      return AgentHomeToolCardCategory.CHECKPOINT;
    }
    if (AgentHomeRichContentPolicy.matchesToolName(value, 'terminal') ||
      AgentHomeRichContentPolicy.matchesToolName(value, 'pty')) {
      return AgentHomeToolCardCategory.TERMINAL;
    }
    if (AgentHomeRichContentPolicy.matchesToolName(value, 'permission') ||
      AgentHomeRichContentPolicy.matchesToolName(value, 'approval') ||
      AgentHomeRichContentPolicy.matchesToolName(value, 'request.permission')) {
      return AgentHomeToolCardCategory.PERMISSION;
    }
    if (AgentHomeRichContentPolicy.matchesToolName(value, 'plan') ||
      AgentHomeRichContentPolicy.matchesToolName(value, 'todo') || value === 'update_plan') {
      return AgentHomeToolCardCategory.PLAN;
    }
    if (AgentHomeRichContentPolicy.matchesToolName(value, 'git') ||
      AgentHomeRichContentPolicy.matchesToolName(value, 'workspace.git')) {
      return AgentHomeToolCardCategory.GIT;
    }
    if (AgentHomeRichContentPolicy.matchesToolName(value, 'shell') ||
      AgentHomeRichContentPolicy.matchesToolName(value, 'exec') ||
      AgentHomeRichContentPolicy.matchesToolName(value, 'command') || value === 'bash' ||
      value === 'powershell' || AgentHomeRichContentPolicy.matchesToolName(value, 'cmd')) {
      return AgentHomeToolCardCategory.SHELL;
    }
    if (AgentHomeRichContentPolicy.matchesToolName(value, 'file') ||
      AgentHomeRichContentPolicy.matchesToolName(value, 'workspace.file') || value === 'read_file' ||
      value === 'write_file' || value === 'apply_patch' || AgentHomeRichContentPolicy.matchesToolName(value, 'patch')) {
      return AgentHomeToolCardCategory.FILE;
    }
    return AgentHomeToolCardCategory.FALLBACK;
  }

  static normalizeToolCardCategory(toolType: string, toolName: string): string {
    const normalizedType = toolType.trim().toLowerCase();
    if (normalizedType === AgentHomeToolCardCategory.FILE || normalizedType === AgentHomeToolCardCategory.SHELL ||
      normalizedType === AgentHomeToolCardCategory.GIT || normalizedType === AgentHomeToolCardCategory.GITHUB ||
      normalizedType === AgentHomeToolCardCategory.CHECKPOINT || normalizedType === AgentHomeToolCardCategory.TERMINAL ||
      normalizedType === AgentHomeToolCardCategory.PERMISSION || normalizedType === AgentHomeToolCardCategory.PLAN) {
      return normalizedType;
    }
    return AgentHomeRichContentPolicy.toolCardCategory(toolName);
  }

  static codeLanguageCategory(language: string): string {
    const value = language.trim().toLowerCase();
    if (value === 'arkts' || value === 'ets' || value === 'typescript' || value === 'ts' ||
      value === 'javascript' || value === 'js' || value === 'tsx' || value === 'jsx') {
      return AgentHomeCodeLanguageCategory.ARKTS;
    }
    if (value === 'json' || value === 'json5') {
      return AgentHomeCodeLanguageCategory.JSON;
    }
    if (value === 'shell' || value === 'sh' || value === 'bash' || value === 'zsh' ||
      value === 'powershell' || value === 'ps1' || value === 'cmd' || value === 'bat') {
      return AgentHomeCodeLanguageCategory.SHELL;
    }
    if (value === 'diff' || value === 'patch') {
      return AgentHomeCodeLanguageCategory.DIFF;
    }
    return AgentHomeCodeLanguageCategory.PLAIN;
  }

  static normalizeTodoStatus(status: string): string {
    const value = status.trim().toLowerCase();
    if (value === AgentHomeTodoStatus.IN_PROGRESS || value === AgentHomeTodoStatus.COMPLETED ||
      value === AgentHomeTodoStatus.CANCELLED) {
      return value;
    }
    return AgentHomeTodoStatus.PENDING;
  }

  static resolveNode(node: AgentBridgeRichContentNode, authoritativeWorkspaceId: string): AgentHomeRichContentDecision {
    const kind = AgentHomeRichContentPolicy.normalizeNodeKind(node.kind);
    if (kind === AgentHomeRichContentNodeKind.FILE) {
      if (!AgentHomeRichContentPolicy.isSafeWorkspaceFileNode(node, authoritativeWorkspaceId)) {
        return new AgentHomeRichContentDecision(
          AgentHomeRichContentNodeKind.FALLBACK, AgentHomeToolCardCategory.FALLBACK, '', 0, '', false,
          'unsafe_file_reference'
        );
      }
      return new AgentHomeRichContentDecision(
        AgentHomeRichContentNodeKind.FILE,
        AgentHomeToolCardCategory.FILE,
        AgentHomeRichContentPolicy.normalizeRelativePath(node.path),
        AgentHomeRichContentPolicy.normalizeFileLine(node.line),
        '',
        true,
        '',
        node.workspaceId
      );
    }
    if (kind === AgentHomeRichContentNodeKind.LINK) {
      if (!AgentHomeRichContentPolicy.isSafeExternalLink(node.url)) {
        return new AgentHomeRichContentDecision(
          AgentHomeRichContentNodeKind.FALLBACK, AgentHomeToolCardCategory.FALLBACK, '', 0, '', false,
          'unsafe_link'
        );
      }
      return new AgentHomeRichContentDecision(kind, AgentHomeToolCardCategory.FALLBACK, '', 0, '', true);
    }
    if (kind === AgentHomeRichContentNodeKind.TODO) {
      if (node.todoId.trim().length === 0 || node.source.trim().length === 0) {
        return new AgentHomeRichContentDecision(
          AgentHomeRichContentNodeKind.FALLBACK, AgentHomeToolCardCategory.FALLBACK, '', 0, '', false,
          'invalid_todo'
        );
      }
      return new AgentHomeRichContentDecision(
        kind, AgentHomeToolCardCategory.PLAN, '', 0,
        AgentHomeRichContentPolicy.normalizeTodoStatus(node.status), false
      );
    }
    if (kind === AgentHomeRichContentNodeKind.TOOL) {
      const category = AgentHomeRichContentPolicy.normalizeToolCardCategory(node.toolType, node.toolName);
      return new AgentHomeRichContentDecision(
        kind, category, '', 0, '', false,
        category === AgentHomeToolCardCategory.FALLBACK ? 'unknown_tool' : ''
      );
    }
    if (kind === AgentHomeRichContentNodeKind.FALLBACK) {
      return new AgentHomeRichContentDecision(
        kind, AgentHomeToolCardCategory.FALLBACK, '', 0, '', false,
        node.source.length > 0 ? node.source : 'unknown_node_kind'
      );
    }
    return new AgentHomeRichContentDecision(kind);
  }

  private static normalizeNodeKind(kind: string): string {
    const value = kind.trim().toLowerCase();
    if (value === AgentHomeRichContentNodeKind.TEXT || value === AgentHomeRichContentNodeKind.CODE ||
      value === AgentHomeRichContentNodeKind.LINK || value === AgentHomeRichContentNodeKind.FILE ||
      value === AgentHomeRichContentNodeKind.TOOL || value === AgentHomeRichContentNodeKind.TODO ||
      value === AgentHomeRichContentNodeKind.DIFF || value === AgentHomeRichContentNodeKind.WARNING ||
      value === AgentHomeRichContentNodeKind.FALLBACK) {
      return value;
    }
    return AgentHomeRichContentNodeKind.FALLBACK;
  }

  private static matchesToolName(value: string, candidate: string): boolean {
    return value === candidate || value.startsWith(candidate + '.') || value.startsWith(candidate + '_') ||
      value.startsWith(candidate + '-');
  }

  private static hasControlCharacter(value: string): boolean {
    for (let index = 0; index < value.length; index++) {
      const code = value.charCodeAt(index);
      if (code < 32 || code === 127) {
        return true;
      }
    }
    return false;
  }

  private static isSafeExternalLink(rawUrl: string): boolean {
    const value = rawUrl.trim();
    const lowerValue = value.toLowerCase();
    if (value.length === 0 || AgentHomeRichContentPolicy.hasControlCharacter(value) ||
      (lowerValue.indexOf('https://') !== 0 && lowerValue.indexOf('http://') !== 0)) {
      return false;
    }
    const schemeLength = lowerValue.indexOf('https://') === 0 ? 8 : 7;
    const pathIndex = value.indexOf('/', schemeLength);
    const authority = pathIndex >= 0 ? value.substring(schemeLength, pathIndex) : value.substring(schemeLength);
    return authority.length > 0 && !authority.startsWith('#') && !authority.startsWith('?') &&
      authority.indexOf('@') < 0 && authority.indexOf(' ') < 0 && authority.indexOf('\t') < 0 &&
      authority.indexOf('\\') < 0;
  }
}
