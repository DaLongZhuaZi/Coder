import { describe, expect, it } from '@ohos/hypium';
import { AgentHomeBrowserUploadPolicy } from '../main/ets/features/agentHome/AgentHomeBrowserUploadPolicy';
import { AgentHomeWorkspaceFileItem } from '../main/ets/features/agentHome/AgentHomeModels';

function workspaceFile(workspaceId: string, path: string, kind: string): AgentHomeWorkspaceFileItem {
  return new AgentHomeWorkspaceFileItem(
    workspaceId + ':' + path,
    workspaceId,
    path,
    '',
    path,
    kind,
    0,
    10,
    1,
    false,
    1
  );
}

export default function agentHomeBrowserUploadPolicyTest(): void {
  describe('AgentHomeBrowserUploadPolicy', (): void => {
    it('normalizesRelativeWorkspacePathsOnly', 0, (): void => {
      expect(AgentHomeBrowserUploadPolicy.normalizeRelativePath('./src\\main.ets')).assertEqual('src/main.ets');
      expect(AgentHomeBrowserUploadPolicy.normalizeRelativePath('/src/main.ets')).assertEqual('');
      expect(AgentHomeBrowserUploadPolicy.normalizeRelativePath('C:/workspace/src/main.ets')).assertEqual('');
      expect(AgentHomeBrowserUploadPolicy.normalizeRelativePath('../src/main.ets')).assertEqual('');
      expect(AgentHomeBrowserUploadPolicy.normalizeRelativePath('src/../main.ets')).assertEqual('');
    });

    it('resolvesOnlySelectedRegularFileInActiveWorkspace', 0, (): void => {
      const files: Array<AgentHomeWorkspaceFileItem> = [
        workspaceFile('workspace-a', 'src/main.ets', 'file'),
        workspaceFile('workspace-a', 'assets', 'directory'),
        workspaceFile('workspace-b', 'src/main.ets', 'file')
      ];
      expect(AgentHomeBrowserUploadPolicy.resolveSelectedFilePath(files, './src\\main.ets', 'workspace-a'))
        .assertEqual('src/main.ets');
      expect(AgentHomeBrowserUploadPolicy.resolveSelectedFilePath(files, 'assets', 'workspace-a')).assertEqual('');
      expect(AgentHomeBrowserUploadPolicy.resolveSelectedFilePath(files, 'src/main.ets', 'workspace-b'))
        .assertEqual('src/main.ets');
      expect(AgentHomeBrowserUploadPolicy.resolveSelectedFilePath(files, 'src/main.ets', 'workspace-missing'))
        .assertEqual('');
    });

    it('doesNotInferAFileFromAnUnselectedOrInvalidPath', 0, (): void => {
      const files: Array<AgentHomeWorkspaceFileItem> = [workspaceFile('workspace-a', 'src/main.ets', 'file')];
      expect(AgentHomeBrowserUploadPolicy.resolveSelectedFilePath(files, '', 'workspace-a')).assertEqual('');
      expect(AgentHomeBrowserUploadPolicy.resolveSelectedFilePath(files, 'src/unknown.ets', 'workspace-a')).assertEqual('');
      expect(AgentHomeBrowserUploadPolicy.resolveSelectedFilePath(files, '/src/main.ets', 'workspace-a')).assertEqual('');
    });
  });
}
