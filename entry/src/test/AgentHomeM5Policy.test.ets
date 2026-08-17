import { describe, it, expect } from '@ohos/hypium';
import {
  AgentBridgeIncomingParser,
  AgentBridgeRichContentNode
} from '../main/ets/features/agentBridge/AgentBridgeModels';
import {
  AgentHomeChatItem,
  AgentHomeComposerTokenKind,
  AgentHomeDisplayPreferences,
  AgentHomeMessageRole
} from '../main/ets/features/agentHome/AgentHomeModels';
import {
  AgentHomeMessageForkPolicy,
  AgentHomeMessageForkWorkspaceMode
} from '../main/ets/features/agentHome/AgentHomeMessageForkPolicy';
import {
  AgentHomeDiagnosticsActionPolicy,
  AgentHomeDiagnosticsActionTarget
} from '../main/ets/features/agentHome/AgentHomeDiagnosticsActionPolicy';
import {
  AgentHomeCodeLanguageCategory,
  AgentHomeRichContentNodeKind,
  AgentHomeRichContentPolicy,
  AgentHomeTodoStatus,
  AgentHomeToolCardCategory
} from '../main/ets/features/agentHome/AgentHomeRichContentPolicy';

export default function agentHomeM5PolicyTest() {
  describe('AgentHomeM5Policy', () => {
    it('clampsDamagedDisplayPreferences', 0, () => {
      const preferences = new AgentHomeDisplayPreferences(Number.NaN, 99, 2, true, false);
      expect(preferences.chatFontSize).assertEqual(14);
      expect(preferences.codeFontSize).assertEqual(20);
      expect(preferences.lineHeight).assertEqual(18);
      expect(preferences.compactDensity).assertTrue();
      expect(preferences.keyboardShortcutsEnabled).assertFalse();
    });

    it('normalizesComposerTokenKindsWithoutTrustingPlainAtText', 0, () => {
      expect(AgentHomeComposerTokenKind.isTrustedMention(AgentHomeComposerTokenKind.FILE)).assertTrue();
      expect(AgentHomeComposerTokenKind.isTrustedMention(AgentHomeComposerTokenKind.TEXT)).assertFalse();
      expect(AgentHomeComposerTokenKind.normalize('remote_command')).assertEqual(AgentHomeComposerTokenKind.TEXT);
    });

    it('requiresDurableAssistantCursorForMessageFork', 0, () => {
      const durable = new AgentHomeChatItem(
        'local-1', 'session-1', AgentHomeMessageRole.ASSISTANT, '', 'done', '', 1,
        '', 'message-1', '', '[]', 3, 19
      );
      const missingCursor = new AgentHomeChatItem(
        'local-2', 'session-1', AgentHomeMessageRole.ASSISTANT, '', 'old', '', 1,
        '', 'message-2', '', '[]', 0, 0
      );
      const fractionalCursor = new AgentHomeChatItem(
        'local-3', 'session-1', AgentHomeMessageRole.ASSISTANT, '', 'invalid', '', 1,
        '', 'message-3', '', '[]', 3, 19.5
      );
      expect(AgentHomeMessageForkPolicy.isEligible(durable, 'session-1')).assertTrue();
      expect(AgentHomeMessageForkPolicy.isEligible(durable, 'session-2')).assertFalse();
      expect(AgentHomeMessageForkPolicy.isEligible(missingCursor, 'session-1')).assertFalse();
      expect(AgentHomeMessageForkPolicy.isEligible(fractionalCursor, 'session-1')).assertFalse();
      expect(AgentHomeMessageForkPolicy.matchesAuthoritativeCursor(durable, 'message-1', 3, 19)).assertTrue();
      expect(AgentHomeMessageForkPolicy.matchesAuthoritativeCursor(durable, 'message-1', 3, 20)).assertFalse();
      expect(AgentHomeMessageForkPolicy.normalizeWorkspaceMode('ISOLATED'))
        .assertEqual(AgentHomeMessageForkWorkspaceMode.ISOLATED);
      expect(AgentHomeMessageForkPolicy.normalizeWorkspaceMode('unexpected'))
        .assertEqual(AgentHomeMessageForkWorkspaceMode.SHARED);
      expect(AgentHomeMessageForkPolicy.matchesPreviewBinding(
        'message-1', 3, 19, 'isolated', 'message-1', 3, 19, 'isolated'
      )).assertTrue();
      expect(AgentHomeMessageForkPolicy.matchesPreviewBinding(
        'message-1', 3, 19, 'isolated', 'message-1', 3, 19, 'unexpected'
      )).assertFalse();
    });

    it('retainsTimelineCursorInChatModel', 0, () => {
      const item = new AgentHomeChatItem(
        'local-1', 'session-1', AgentHomeMessageRole.ASSISTANT, '', 'text', '', 1,
        '', 'message-1', 'agent', '[{"kind":"text"}]', 4, 27
      );
      expect(item.contentNodesJson).assertEqual('[{"kind":"text"}]');
      expect(item.timelineEpoch).assertEqual(4);
      expect(item.timelineSeq).assertEqual(27);
    });

    it('rejectsEscapingOrMismatchedFileNodes', 0, () => {
      const node = new AgentBridgeRichContentNode();
      node.kind = 'file';
      node.workspaceId = 'workspace-a';
      node.path = 'entry/src/main.ets';
      node.line = 12;
      expect(AgentHomeRichContentPolicy.isSafeWorkspaceFileNode(node, 'workspace-a')).assertTrue();
      node.path = '../secret.txt';
      expect(AgentHomeRichContentPolicy.isSafeWorkspaceFileNode(node, 'workspace-a')).assertFalse();
      node.path = 'entry/src/main.ets';
      expect(AgentHomeRichContentPolicy.isSafeWorkspaceFileNode(node, 'workspace-b')).assertFalse();
      node.path = 'C:\\Users\\name\\secret.txt';
      expect(AgentHomeRichContentPolicy.normalizeRelativePath(node.path)).assertEqual('');
      expect(AgentHomeRichContentPolicy.normalizeRelativePath('safe/C:/secret.txt')).assertEqual('');
      node.path = 'entry/src/main.ets';
      node.line = -1;
      expect(AgentHomeRichContentPolicy.isSafeWorkspaceFileNode(node, 'workspace-a')).assertFalse();
      node.line = 1.5;
      expect(AgentHomeRichContentPolicy.isSafeWorkspaceFileNode(node, 'workspace-a')).assertFalse();
      node.line = AgentHomeRichContentPolicy.MAX_FILE_LINE + 1;
      expect(AgentHomeRichContentPolicy.isSafeWorkspaceFileNode(node, 'workspace-a')).assertFalse();
      node.line = 7;
      node.path = './entry//src/./main.ets';
      const fileDecision = AgentHomeRichContentPolicy.resolveNode(node, 'workspace-a');
      expect(fileDecision.renderKind).assertEqual(AgentHomeRichContentNodeKind.FILE);
      expect(fileDecision.normalizedPath).assertEqual('entry/src/main.ets');
      expect(fileDecision.line).assertEqual(7);
      expect(fileDecision.workspaceId).assertEqual('workspace-a');
      node.path = 'entry/' + String.fromCharCode(0) + 'secret.txt';
      expect(AgentHomeRichContentPolicy.isSafeWorkspaceFileNode(node, 'workspace-a')).assertFalse();
      const parsedFileNodes = AgentBridgeIncomingParser.parseRichContentNodes(
        '[{"kind":"file","workspaceId":"workspace-a","path":"entry/src/main.ets","line":-3}]'
      );
      expect(parsedFileNodes[0].line).assertEqual(-3);
      expect(AgentHomeRichContentPolicy.isSafeWorkspaceFileNode(parsedFileNodes[0], 'workspace-a')).assertFalse();
    });

    it('mapsToolCardsAndTokenizerLanguagesToClosedCategories', 0, () => {
      expect(AgentHomeRichContentPolicy.toolCardCategory('github.pr.merge')).assertEqual(AgentHomeToolCardCategory.GITHUB);
      expect(AgentHomeRichContentPolicy.toolCardCategory('workspace.git.status')).assertEqual(AgentHomeToolCardCategory.GIT);
      expect(AgentHomeRichContentPolicy.toolCardCategory('shell_command')).assertEqual(AgentHomeToolCardCategory.SHELL);
      expect(AgentHomeRichContentPolicy.toolCardCategory('workspace.file.read')).assertEqual(AgentHomeToolCardCategory.FILE);
      expect(AgentHomeRichContentPolicy.toolCardCategory('git.status')).assertEqual(AgentHomeToolCardCategory.GIT);
      expect(AgentHomeRichContentPolicy.toolCardCategory('agent.checkpoint.create')).assertEqual(AgentHomeToolCardCategory.CHECKPOINT);
      expect(AgentHomeRichContentPolicy.toolCardCategory('terminal.resize')).assertEqual(AgentHomeToolCardCategory.TERMINAL);
      expect(AgentHomeRichContentPolicy.toolCardCategory('permission.respond')).assertEqual(AgentHomeToolCardCategory.PERMISSION);
      expect(AgentHomeRichContentPolicy.toolCardCategory('update_plan')).assertEqual(AgentHomeToolCardCategory.PLAN);
      expect(AgentHomeRichContentPolicy.toolCardCategory('thread.create')).assertEqual(AgentHomeToolCardCategory.FALLBACK);
      expect(AgentHomeRichContentPolicy.toolCardCategory('unregistered_tool')).assertEqual(AgentHomeToolCardCategory.FALLBACK);
      expect(AgentHomeRichContentPolicy.normalizeToolCardCategory('terminal', 'unregistered_tool'))
        .assertEqual(AgentHomeToolCardCategory.TERMINAL);
      expect(AgentHomeRichContentPolicy.codeLanguageCategory('TypeScript')).assertEqual(AgentHomeCodeLanguageCategory.ARKTS);
      expect(AgentHomeRichContentPolicy.codeLanguageCategory('unknown-language')).assertEqual(AgentHomeCodeLanguageCategory.PLAIN);
    });

    it('resolvesTodoDiffToolAndFallbackNodesAsClosedRenderKinds', 0, () => {
      const todoNode = new AgentBridgeRichContentNode();
      todoNode.kind = 'todo';
      todoNode.todoId = 'todo-1';
      todoNode.status = 'unexpected';
      todoNode.source = 'provider';
      const todoDecision = AgentHomeRichContentPolicy.resolveNode(todoNode, 'workspace-a');
      expect(todoDecision.renderKind).assertEqual(AgentHomeRichContentNodeKind.TODO);
      expect(todoDecision.todoStatus).assertEqual(AgentHomeTodoStatus.PENDING);
      todoNode.source = '';
      expect(AgentHomeRichContentPolicy.resolveNode(todoNode, 'workspace-a').renderKind)
        .assertEqual(AgentHomeRichContentNodeKind.FALLBACK);

      const diffNode = new AgentBridgeRichContentNode();
      diffNode.kind = 'diff';
      expect(AgentHomeRichContentPolicy.resolveNode(diffNode, 'workspace-a').renderKind)
        .assertEqual(AgentHomeRichContentNodeKind.DIFF);

      const toolNode = new AgentBridgeRichContentNode();
      toolNode.kind = 'tool';
      toolNode.toolName = 'unregistered_tool';
      const toolDecision = AgentHomeRichContentPolicy.resolveNode(toolNode, 'workspace-a');
      expect(toolDecision.renderKind).assertEqual(AgentHomeRichContentNodeKind.TOOL);
      expect(toolDecision.toolCategory).assertEqual(AgentHomeToolCardCategory.FALLBACK);
      expect(toolDecision.fallbackReason).assertEqual('unknown_tool');

      const unknownNode = new AgentBridgeRichContentNode();
      unknownNode.kind = 'remote_command';
      const unknownDecision = AgentHomeRichContentPolicy.resolveNode(unknownNode, 'workspace-a');
      expect(unknownDecision.renderKind).assertEqual(AgentHomeRichContentNodeKind.FALLBACK);
      expect(unknownDecision.fallbackReason).assertEqual('unknown_node_kind');

      const unsafeLinkNode = new AgentBridgeRichContentNode();
      unsafeLinkNode.kind = 'link';
      unsafeLinkNode.url = 'https://user:password@example.com/private';
      expect(AgentHomeRichContentPolicy.resolveNode(unsafeLinkNode, 'workspace-a').renderKind)
        .assertEqual(AgentHomeRichContentNodeKind.FALLBACK);
      unsafeLinkNode.url = 'https://example.com/docs';
      expect(AgentHomeRichContentPolicy.resolveNode(unsafeLinkNode, 'workspace-a').interactive).assertTrue();
    });

    it('allowsOnlyKnownDiagnosticsRemediationActions', 0, () => {
      expect(AgentHomeDiagnosticsActionPolicy.normalize('open_provider_settings'))
        .assertEqual(AgentHomeDiagnosticsActionPolicy.OPEN_PROVIDER_SETTINGS);
      expect(AgentHomeDiagnosticsActionPolicy.normalize('powershell -Command Remove-Item'))
        .assertEqual('');
      expect(AgentHomeDiagnosticsActionPolicy.normalize('')).assertEqual('');
      expect(AgentHomeDiagnosticsActionPolicy.isAllowed('review_message_queue')).assertTrue();
      expect(AgentHomeDiagnosticsActionPolicy.targetForAction('open_daemon_settings'))
        .assertEqual(AgentHomeDiagnosticsActionTarget.SETTINGS);
      expect(AgentHomeDiagnosticsActionPolicy.targetForAction('open_provider_settings'))
        .assertEqual(AgentHomeDiagnosticsActionTarget.PROVIDERS);
      expect(AgentHomeDiagnosticsActionPolicy.targetForAction('open_terminal_settings'))
        .assertEqual(AgentHomeDiagnosticsActionTarget.TERMINAL);
      expect(AgentHomeDiagnosticsActionPolicy.targetForAction('review_message_queue'))
        .assertEqual(AgentHomeDiagnosticsActionTarget.MESSAGE_QUEUE);
      expect(AgentHomeDiagnosticsActionPolicy.targetForAction('open_usage_settings'))
        .assertEqual(AgentHomeDiagnosticsActionTarget.USAGE);
      expect(AgentHomeDiagnosticsActionPolicy.targetForAction('open_secure_storage_help'))
        .assertEqual(AgentHomeDiagnosticsActionTarget.SECURE_STORAGE);
      expect(AgentHomeDiagnosticsActionPolicy.targetForAction('refresh_remote_config'))
        .assertEqual(AgentHomeDiagnosticsActionTarget.REMOTE_CONFIG);
      expect(AgentHomeDiagnosticsActionPolicy.targetForAction('repair_persistence'))
        .assertEqual(AgentHomeDiagnosticsActionTarget.PERSISTENCE);
      expect(AgentHomeDiagnosticsActionPolicy.targetForAction('powershell -Command Remove-Item')).assertEqual('');
    });
  });
}
