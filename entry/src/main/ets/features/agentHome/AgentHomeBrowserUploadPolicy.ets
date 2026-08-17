import { AgentHomeWorkspaceFileItem } from './AgentHomeModels';

/**
 * Keeps Browser upload selection tied to a file already known by the active
 * Bridge workspace. The Browser host receives only this normalized relative
 * path; it resolves and validates the real path on the Bridge side.
 */
export class AgentHomeBrowserUploadPolicy {
  static normalizeRelativePath(rawPath: string): string {
    let value = rawPath.trim().split('\\').join('/');
    while (value.startsWith('./')) {
      value = value.substring(2);
    }
    if (value.length === 0 || value.startsWith('/') || value.indexOf('://') >= 0 ||
      (value.length > 1 && value.charAt(1) === ':')) {
      return '';
    }
    const parts: Array<string> = value.split('/');
    for (let index = 0; index < parts.length; index++) {
      if (parts[index].length === 0 || parts[index] === '.' || parts[index] === '..') {
        return '';
      }
    }
    return value;
  }

  static resolveSelectedFilePath(
    items: Array<AgentHomeWorkspaceFileItem>,
    selectedPath: string,
    workspaceId: string
  ): string {
    if (workspaceId.trim().length === 0) {
      return '';
    }
    const candidate = AgentHomeBrowserUploadPolicy.normalizeRelativePath(selectedPath);
    if (candidate.length === 0) {
      return '';
    }
    for (let index = 0; index < items.length; index++) {
      const item = items[index];
      if (item.workspaceId === workspaceId &&
        AgentHomeBrowserUploadPolicy.normalizeRelativePath(item.path) === candidate &&
        item.kind.trim().toLowerCase() === 'file') {
        return candidate;
      }
    }
    return '';
  }
}
