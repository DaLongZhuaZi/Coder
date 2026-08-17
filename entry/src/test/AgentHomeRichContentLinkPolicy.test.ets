import { describe, it, expect } from '@ohos/hypium';
import {
  AgentHomeRichContentLinkIndex,
  AgentHomeRichContentLinkPolicy
} from '../main/ets/features/agentHome/AgentHomeRichContentLinkPolicy';

export default function agentHomeRichContentLinkPolicyTest() {
  describe('AgentHomeRichContentLinkPolicy', () => {
    it('rejectsTechnicalTokensThatAreNotFiles', 0, () => {
      expect(AgentHomeRichContentLinkPolicy.isImplicitWorkspaceFileCandidate('already running/reused')).assertFalse();
      expect(AgentHomeRichContentLinkPolicy.isImplicitWorkspaceFileCandidate('supervisor/worker')).assertFalse();
      expect(AgentHomeRichContentLinkPolicy.isImplicitWorkspaceFileCandidate('/health')).assertFalse();
      expect(AgentHomeRichContentLinkPolicy.isImplicitWorkspaceFileCandidate('NGF/远端代理能力')).assertFalse();
      expect(AgentHomeRichContentLinkPolicy.isImplicitWorkspaceFileCandidate('child.exitCode')).assertFalse();
      expect(AgentHomeRichContentLinkPolicy.isImplicitWorkspaceFileCandidate('bridge.server')).assertFalse();
      expect(AgentHomeRichContentLinkPolicy.isImplicitWorkspaceFileCandidate('serverId')).assertFalse();
      expect(AgentHomeRichContentLinkPolicy.isImplicitWorkspaceFileCandidate('waitHttpOk')).assertFalse();
      expect(AgentHomeRichContentLinkPolicy.isImplicitWorkspaceFileCandidate('waitForExit')).assertFalse();
      expect(AgentHomeRichContentLinkPolicy.isImplicitWorkspaceFileCandidate('port reassigned')).assertFalse();
      expect(AgentHomeRichContentLinkPolicy.isImplicitWorkspaceFileCandidate('0.1.4')).assertFalse();
    });

    it('acceptsSupportedWorkspaceFileNames', 0, () => {
      expect(AgentHomeRichContentLinkPolicy.isImplicitWorkspaceFileCandidate('profile.json')).assertTrue();
      expect(AgentHomeRichContentLinkPolicy.isImplicitWorkspaceFileCandidate('tools/agent-bridge/src/desktop-launcher.js')).assertTrue();
      expect(AgentHomeRichContentLinkPolicy.isImplicitWorkspaceFileCandidate('entry/src/main/ets/pages/ngf/NGFAgentHomePage.ets:27929')).assertTrue();
      expect(AgentHomeRichContentLinkPolicy.isImplicitWorkspaceFileCandidate('README.md')).assertTrue();
      expect(AgentHomeRichContentLinkPolicy.isImplicitWorkspaceFileCandidate('Dockerfile')).assertTrue();
      expect(AgentHomeRichContentLinkPolicy.isImplicitWorkspaceFileCandidate('.gitignore')).assertTrue();
    });

    it('requiresWorkspaceEvidenceBeforeRenderingImplicitLink', 0, () => {
      const knownFiles: Array<string> = [
        'tools/agent-bridge/src/desktop-launcher.js',
        'entry/src/main/ets/pages/ngf/NGFAgentHomePage.ets',
        'README.md'
      ];
      expect(AgentHomeRichContentLinkPolicy.isKnownWorkspaceFileReference('desktop-launcher.js', knownFiles)).assertTrue();
      expect(AgentHomeRichContentLinkPolicy.isKnownWorkspaceFileReference('entry/src/main/ets/pages/ngf/NGFAgentHomePage.ets', knownFiles)).assertTrue();
      expect(AgentHomeRichContentLinkPolicy.isKnownWorkspaceFileReference('readme.md', knownFiles)).assertFalse();
      expect(AgentHomeRichContentLinkPolicy.isKnownWorkspaceFileReference('profile.json', knownFiles)).assertFalse();
      expect(AgentHomeRichContentLinkPolicy.isKnownWorkspaceFileReference(
        'f:/workspace/entry/src/main/ets/pages/ngf/NGFAgentHomePage.ets',
        ['F:/Workspace/entry/src/main/ets/pages/ngf/NGFAgentHomePage.ets']
      )).assertTrue();
    });

    it('rejectsAmbiguousShortFileNames', 0, () => {
      const knownFiles: Array<string> = [
        'config/profile.json',
        'fixtures/profile.json'
      ];
      expect(AgentHomeRichContentLinkPolicy.isKnownWorkspaceFileReference('profile.json', knownFiles)).assertFalse();
      expect(AgentHomeRichContentLinkPolicy.isKnownWorkspaceFileReference('config/profile.json', knownFiles)).assertTrue();
    });

    it('normalizesSupportedFileUrlsAndLineSuffixes', 0, () => {
      expect(AgentHomeRichContentLinkPolicy.normalizeReference('`file:///F:/Workspace/src/main.ets:42`'))
        .assertEqual('F:/Workspace/src/main.ets');
      expect(AgentHomeRichContentLinkPolicy.isImplicitWorkspaceFileCandidate('https://example.com/main.js')).assertFalse();
    });

    it('indexesExactAndUniqueShortWorkspaceReferences', 0, () => {
      const index = new AgentHomeRichContentLinkIndex();
      index.addKnownFilePath('tools/agent-bridge/src/desktop-launcher.js');
      index.addKnownFilePath('entry/src/main/ets/pages/ngf/NGFAgentHomePage.ets');
      expect(index.resolveKnownFileReference('desktop-launcher.js'))
        .assertEqual('tools/agent-bridge/src/desktop-launcher.js');
      expect(index.resolveKnownFileReference('entry/src/main/ets/pages/ngf/NGFAgentHomePage.ets'))
        .assertEqual('entry/src/main/ets/pages/ngf/NGFAgentHomePage.ets');
      expect(index.resolveKnownFileReference('/health')).assertEqual('');
    });

    it('keepsAmbiguousShortWorkspaceReferencesUnclickable', 0, () => {
      const index = new AgentHomeRichContentLinkIndex();
      index.addKnownFilePath('config/profile.json');
      index.addKnownFilePath('fixtures/profile.json');
      expect(index.resolveKnownFileReference('profile.json')).assertEqual('');
      expect(index.resolveKnownFileReference('config/profile.json')).assertEqual('config/profile.json');
    });

    it('normalizesCatalogPathsOnlyAgainstActiveWorkspaceScope', 0, () => {
      expect(AgentHomeRichContentLinkPolicy.normalizeWorkspaceCatalogPath(
        'F:\\DevEcoStudioProject\\Coder\\entry\\src\\main.ets',
        'F:\\DevEcoStudioProject\\Coder',
        'Coder'
      )).assertEqual('entry/src/main.ets');
      expect(AgentHomeRichContentLinkPolicy.normalizeWorkspaceCatalogPath(
        'Coder/entry/src/main.ets',
        'F:\\DevEcoStudioProject\\Coder',
        'Coder'
      )).assertEqual('entry/src/main.ets');
      expect(AgentHomeRichContentLinkPolicy.normalizeWorkspaceCatalogPath(
        'entry/src/main.ets',
        'F:\\DevEcoStudioProject\\Coder',
        'Coder'
      )).assertEqual('entry/src/main.ets');
      const index = new AgentHomeRichContentLinkIndex();
      index.addKnownFilePath('entry/src/main.ets');
      const normalizedAbsoluteReference = AgentHomeRichContentLinkPolicy.normalizeWorkspaceCatalogPath(
        'F:\\DevEcoStudioProject\\Coder\\entry\\src\\main.ets',
        'F:\\DevEcoStudioProject\\Coder',
        'Coder'
      );
      expect(index.resolveKnownFileReference(normalizedAbsoluteReference)).assertEqual('entry/src/main.ets');
    });

    it('resolvesRepeatedQueriesFromLargeCatalogIndex', 0, () => {
      const index = new AgentHomeRichContentLinkIndex();
      for (let itemIndex = 0; itemIndex < 1000; itemIndex++) {
        index.addKnownFilePath('generated/file-' + String(itemIndex) + '.ts');
      }
      for (let queryIndex = 0; queryIndex < 1000; queryIndex++) {
        expect(index.resolveKnownFileReference('file-999.ts')).assertEqual('generated/file-999.ts');
      }
    });
  });
}
