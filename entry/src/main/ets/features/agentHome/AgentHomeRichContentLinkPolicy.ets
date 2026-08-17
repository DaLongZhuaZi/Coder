export class AgentHomeRichContentLinkPolicy {
  private static readonly SUPPORTED_EXTENSIONS: Array<string> = [
    'ets', 'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs',
    'json', 'json5', 'xml', 'yml', 'yaml', 'toml', 'ini', 'properties',
    'md', 'markdown', 'txt', 'log', 'csv', 'html', 'htm',
    'css', 'scss', 'less', 'vue', 'svelte',
    'java', 'kt', 'swift', 'dart', 'c', 'h', 'cpp', 'hpp', 'cs',
    'go', 'rs', 'py', 'rb', 'php', 'lua',
    'sh', 'ps1', 'bat', 'cmd', 'gradle', 'cmake', 'sql',
    'graphql', 'gql', 'proto', 'lock',
    'svg', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'ico',
    'avif', 'apng', 'heic', 'heif', 'tif', 'tiff'
  ];

  private static readonly SUPPORTED_EXTENSIONLESS_NAMES: Array<string> = [
    'makefile', 'dockerfile', 'jenkinsfile', 'procfile', 'gemfile', 'rakefile',
    'license', 'notice', 'authors', 'contributors', 'copying'
  ];

  private static readonly SUPPORTED_DOTFILE_NAMES: Array<string> = [
    '.env', '.gitignore', '.gitattributes', '.gitmodules', '.npmrc', '.yarnrc',
    '.editorconfig', '.dockerignore', '.eslintignore', '.prettierignore', '.clang-format'
  ];

  static normalizeReference(rawText: string): string {
    let value = AgentHomeRichContentLinkPolicy.stripReferenceEdge(rawText);
    if (value.length === 0 || value.startsWith('#')) {
      return '';
    }
    value = AgentHomeRichContentLinkPolicy.stripFileUrlPrefix(value);
    if (AgentHomeRichContentLinkPolicy.hasExternalScheme(value)) {
      return '';
    }
    value = AgentHomeRichContentLinkPolicy.stripUrlSuffix(value);
    value = AgentHomeRichContentLinkPolicy.stripLineSuffix(value);
    value = AgentHomeRichContentLinkPolicy.stripReferenceEdge(value);
    value = value.split('\\').join('/');
    while (value.startsWith('./')) {
      value = value.substring(2);
    }
    return value;
  }

  static isImplicitWorkspaceFileCandidate(rawText: string): boolean {
    const value = AgentHomeRichContentLinkPolicy.normalizeReference(rawText);
    if (value.length === 0 || AgentHomeRichContentLinkPolicy.hasWhitespace(value) || value.endsWith('/')) {
      return false;
    }
    const fileName = AgentHomeRichContentLinkPolicy.fileNameFromPath(value);
    if (fileName.length === 0) {
      return false;
    }
    const lowerName = fileName.toLowerCase();
    if (AgentHomeRichContentLinkPolicy.SUPPORTED_EXTENSIONLESS_NAMES.includes(lowerName) ||
      AgentHomeRichContentLinkPolicy.SUPPORTED_DOTFILE_NAMES.includes(lowerName)) {
      return true;
    }
    const dotIndex = lowerName.lastIndexOf('.');
    if (dotIndex <= 0 || dotIndex >= lowerName.length - 1) {
      return false;
    }
    const extension = lowerName.substring(dotIndex + 1);
    return AgentHomeRichContentLinkPolicy.SUPPORTED_EXTENSIONS.includes(extension);
  }

  static isKnownWorkspaceFileReference(rawText: string, knownFilePaths: Array<string>): boolean {
    if (!AgentHomeRichContentLinkPolicy.isImplicitWorkspaceFileCandidate(rawText)) {
      return false;
    }
    const candidate = AgentHomeRichContentLinkPolicy.normalizeReference(rawText);
    const comparableCandidate = AgentHomeRichContentLinkPolicy.comparablePath(candidate);
    const isShortReference = candidate.indexOf('/') < 0;
    let shortNameMatches = 0;
    for (let index = 0; index < knownFilePaths.length; index++) {
      const knownPath = AgentHomeRichContentLinkPolicy.normalizeReference(knownFilePaths[index]);
      if (knownPath.length === 0) {
        continue;
      }
      if (AgentHomeRichContentLinkPolicy.comparablePath(knownPath) === comparableCandidate) {
        return true;
      }
      if (isShortReference &&
        AgentHomeRichContentLinkPolicy.comparablePath(AgentHomeRichContentLinkPolicy.fileNameFromPath(knownPath)) === comparableCandidate) {
        shortNameMatches = shortNameMatches + 1;
      }
    }
    return isShortReference && shortNameMatches === 1;
  }

  static normalizeWorkspaceCatalogPath(
    rawPath: string,
    workspacePath: string,
    workspaceTitle: string,
    remoteWorkspacePath: string = '',
    remoteWorkspaceTitle: string = ''
  ): string {
    let normalized = rawPath.trim().split('\\').join('/');
    normalized = AgentHomeRichContentLinkPolicy.stripWorkspacePathPrefix(normalized, workspacePath);
    normalized = AgentHomeRichContentLinkPolicy.stripWorkspacePathPrefix(normalized, remoteWorkspacePath);
    normalized = AgentHomeRichContentLinkPolicy.stripWorkspaceTitlePrefix(normalized, workspaceTitle);
    normalized = AgentHomeRichContentLinkPolicy.stripWorkspaceTitlePrefix(normalized, remoteWorkspaceTitle);
    while (normalized.startsWith('/')) {
      normalized = normalized.substring(1);
    }
    while (normalized.endsWith('/') && normalized.length > 1) {
      normalized = normalized.substring(0, normalized.length - 1);
    }
    return normalized;
  }

  private static stripReferenceEdge(rawText: string): string {
    let value = rawText.trim();
    let changed = true;
    while (changed && value.length > 0) {
      changed = false;
      const first = value.charAt(0);
      if (first === '`' || first === '"' || first === "'" || first === '<' || first === '[' ||
        first === '(' || first === '（') {
        value = value.substring(1).trim();
        changed = true;
      }
      if (value.length === 0) {
        return '';
      }
      const last = value.charAt(value.length - 1);
      if (last === '`' || last === '"' || last === "'" || last === '>' || last === ']' ||
        last === ')' || last === '）' || last === ',' || last === '，' || last === '。' ||
        last === '、' || last === ';' || last === '；') {
        value = value.substring(0, value.length - 1).trim();
        changed = true;
      }
    }
    return value;
  }

  private static stripFileUrlPrefix(value: string): string {
    if (value.startsWith('file:///')) {
      return value.substring(8);
    }
    if (value.startsWith('file://')) {
      return value.substring(7);
    }
    if (value.startsWith('vscode://file/')) {
      return value.substring(14);
    }
    return value;
  }

  private static hasExternalScheme(value: string): boolean {
    const colonIndex = value.indexOf(':');
    if (colonIndex < 0 || colonIndex === 1) {
      return false;
    }
    const slashIndex = value.indexOf('/');
    return slashIndex < 0 || colonIndex < slashIndex;
  }

  private static stripUrlSuffix(value: string): string {
    let normalized = value;
    const hashIndex = normalized.indexOf('#');
    if (hashIndex >= 0) {
      normalized = normalized.substring(0, hashIndex);
    }
    const queryIndex = normalized.indexOf('?');
    if (queryIndex >= 0) {
      normalized = normalized.substring(0, queryIndex);
    }
    return normalized;
  }

  private static stripLineSuffix(value: string): string {
    let normalized = value;
    let shouldContinue = true;
    while (shouldContinue) {
      const colonIndex = normalized.lastIndexOf(':');
      if (colonIndex <= 1 || colonIndex >= normalized.length - 1) {
        shouldContinue = false;
      } else {
        const suffix = normalized.substring(colonIndex + 1);
        if (AgentHomeRichContentLinkPolicy.isPositiveIntegerText(suffix)) {
          normalized = normalized.substring(0, colonIndex);
        } else {
          shouldContinue = false;
        }
      }
    }
    return normalized;
  }

  private static isPositiveIntegerText(value: string): boolean {
    if (value.length === 0) {
      return false;
    }
    for (let index = 0; index < value.length; index++) {
      const char = value.charAt(index);
      if (char < '0' || char > '9') {
        return false;
      }
    }
    return true;
  }

  private static hasWhitespace(value: string): boolean {
    return value.indexOf(' ') >= 0 || value.indexOf('\t') >= 0 || value.indexOf('\r') >= 0 ||
      value.indexOf('\n') >= 0;
  }

  private static fileNameFromPath(value: string): string {
    const slashIndex = value.lastIndexOf('/');
    if (slashIndex >= 0 && slashIndex + 1 < value.length) {
      return value.substring(slashIndex + 1);
    }
    return slashIndex < 0 ? value : '';
  }

  private static comparablePath(value: string): string {
    return value.length >= 2 && value.charAt(1) === ':' ? value.toLowerCase() : value;
  }

  private static stripWorkspacePathPrefix(path: string, workspacePath: string): string {
    const normalizedWorkspace = workspacePath.trim().split('\\').join('/');
    if (normalizedWorkspace.length === 0) {
      return path;
    }
    const comparableWorkspace = AgentHomeRichContentLinkPolicy.comparablePath(normalizedWorkspace);
    const comparablePath = AgentHomeRichContentLinkPolicy.comparablePath(path);
    if (comparablePath === comparableWorkspace) {
      return '';
    }
    const prefix = comparableWorkspace.endsWith('/') ? comparableWorkspace : comparableWorkspace + '/';
    if (comparablePath.startsWith(prefix)) {
      return path.substring(prefix.length);
    }
    return path;
  }

  private static stripWorkspaceTitlePrefix(path: string, workspaceTitle: string): string {
    const title = workspaceTitle.trim();
    if (title.length === 0 || title === '-') {
      return path;
    }
    const normalizedPath = path.split('\\').join('/');
    const lowerPath = normalizedPath.toLowerCase();
    const lowerTitle = title.toLowerCase();
    if (lowerPath === lowerTitle) {
      return '';
    }
    if (lowerPath.startsWith(lowerTitle + '/')) {
      return normalizedPath.substring(title.length + 1);
    }
    if (lowerPath.startsWith('/' + lowerTitle + '/')) {
      return normalizedPath.substring(title.length + 2);
    }
    return path;
  }
}

export class AgentHomeRichContentLinkIndex {
  private readonly exactPaths: Map<string, string> = new Map<string, string>();
  private readonly shortPaths: Map<string, string> = new Map<string, string>();

  addKnownFilePath(rawPath: string): void {
    const normalizedPath = AgentHomeRichContentLinkPolicy.normalizeReference(rawPath);
    if (normalizedPath.length === 0) {
      return;
    }
    const comparablePath = AgentHomeRichContentLinkIndex.comparablePath(normalizedPath);
    if (!this.exactPaths.has(comparablePath)) {
      this.exactPaths.set(comparablePath, normalizedPath);
    }
    const fileName = AgentHomeRichContentLinkIndex.fileNameFromPath(normalizedPath);
    if (fileName.length === 0) {
      return;
    }
    const comparableName = AgentHomeRichContentLinkIndex.comparablePath(fileName);
    const existingPath = this.shortPaths.get(comparableName);
    if (existingPath === undefined) {
      this.shortPaths.set(comparableName, normalizedPath);
      return;
    }
    if (AgentHomeRichContentLinkIndex.comparablePath(existingPath) !== comparablePath) {
      this.shortPaths.set(comparableName, '');
    }
  }

  resolveKnownFileReference(rawText: string): string {
    if (!AgentHomeRichContentLinkPolicy.isImplicitWorkspaceFileCandidate(rawText)) {
      return '';
    }
    const normalizedReference = AgentHomeRichContentLinkPolicy.normalizeReference(rawText);
    const comparableReference = AgentHomeRichContentLinkIndex.comparablePath(normalizedReference);
    const exactPath = this.exactPaths.get(comparableReference);
    if (exactPath !== undefined) {
      return exactPath;
    }
    if (normalizedReference.indexOf('/') >= 0) {
      return '';
    }
    const shortPath = this.shortPaths.get(comparableReference);
    return shortPath === undefined ? '' : shortPath;
  }

  private static fileNameFromPath(value: string): string {
    const slashIndex = value.lastIndexOf('/');
    if (slashIndex >= 0 && slashIndex + 1 < value.length) {
      return value.substring(slashIndex + 1);
    }
    return slashIndex < 0 ? value : '';
  }

  private static comparablePath(value: string): string {
    return value.length >= 2 && value.charAt(1) === ':' ? value.toLowerCase() : value;
  }
}
