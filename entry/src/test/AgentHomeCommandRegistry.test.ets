import { describe, expect, it } from '@ohos/hypium';
import {
  AgentHomeCommandDefinition,
  AgentHomeCommandId,
  AgentHomeCommandRegistry,
  AgentHomeCommandShortcutDecision,
  AgentHomeKeyboardShortcutInput
} from '../main/ets/features/agentHome/AgentHomeCommandRegistry';

function buildCommandDefinitions(): Array<AgentHomeCommandDefinition> {
  const definitions: Array<AgentHomeCommandDefinition> = [];
  definitions.push(new AgentHomeCommandDefinition(
    AgentHomeCommandId.OPEN_PALETTE, 'navigation', 'Command palette', ['search', 'commands'],
    'magnifyingglass', 'open_palette', 'Ctrl+K'
  ));
  definitions.push(new AgentHomeCommandDefinition(
    AgentHomeCommandId.SEND_MESSAGE, 'composer', 'Send message', ['submit'],
    'paperplane', 'send', 'Ctrl+Enter'
  ));
  definitions.push(new AgentHomeCommandDefinition(
    AgentHomeCommandId.FOCUS_COMPOSER, 'composer', 'Focus composer', ['input'],
    'text_cursor', 'focus_composer', 'Ctrl+L'
  ));
  definitions.push(new AgentHomeCommandDefinition(
    AgentHomeCommandId.OPEN_TERMINAL, 'runtime', 'Open terminal', ['shell'],
    'keyboard', 'open_terminal', 'Ctrl+Shift+T', false, 'terminal_unavailable'
  ));
  definitions.push(new AgentHomeCommandDefinition(
    AgentHomeCommandId.REFRESH_VISIBLE_SCOPE, 'navigation', 'Refresh current scope', ['reload'],
    'arrow_clockwise', 'refresh', 'Ctrl+R'
  ));
  definitions.push(new AgentHomeCommandDefinition(
    AgentHomeCommandId.FOCUS_LEFT_PANE, 'navigation', 'Focus left pane', ['scope'],
    'sidebar_left', 'focus_left', 'Alt+1'
  ));
  definitions.push(new AgentHomeCommandDefinition(
    AgentHomeCommandId.FOCUS_MIDDLE_PANE, 'navigation', 'Focus middle pane', ['conversation'],
    'rectangle_center', 'focus_middle', 'Alt+2'
  ));
  definitions.push(new AgentHomeCommandDefinition(
    AgentHomeCommandId.FOCUS_RIGHT_PANE, 'navigation', 'Focus right pane', ['details'],
    'sidebar_right', 'focus_right', 'Alt+3'
  ));
  definitions.push(new AgentHomeCommandDefinition(
    AgentHomeCommandId.CLOSE_TOP_OVERLAY, 'navigation', 'Close overlay', ['cancel'],
    'xmark', 'close_overlay', 'Esc'
  ));
  return definitions;
}

export default function agentHomeCommandRegistryTest(): void {
  describe('AgentHomeCommandRegistry', (): void => {
    it('filtersCommandsWithStableRelevanceOrdering', 0, (): void => {
      const registry = new AgentHomeCommandRegistry();
      const definitions = buildCommandDefinitions();
      definitions.push(new AgentHomeCommandDefinition(
        AgentHomeCommandId.OPEN_PALETTE, 'duplicate', 'Duplicate', [], '', '', ''
      ));
      registry.replace(definitions);

      const exact = registry.filter('send_message');
      const keyword = registry.filter('shell');
      const all = registry.filter('');

      expect(exact.length).assertEqual(1);
      expect(exact[0].id).assertEqual(AgentHomeCommandId.SEND_MESSAGE);
      expect(keyword.length).assertEqual(1);
      expect(keyword[0].id).assertEqual(AgentHomeCommandId.OPEN_TERMINAL);
      expect(all.length).assertEqual(9);
      expect(registry.nextSelection(-1, 1, all.length)).assertEqual(0);
      expect(registry.nextSelection(0, -1, all.length)).assertEqual(all.length - 1);
      expect(registry.nextSelection(all.length - 1, 1, all.length)).assertEqual(0);
    });

    it('blocksOrdinaryShortcutsWhileTextInputIsFocused', 0, (): void => {
      const registry = new AgentHomeCommandRegistry();
      registry.replace(buildCommandDefinitions());
      const openPaletteInput = new AgentHomeKeyboardShortcutInput('k');
      openPaletteInput.ctrlKey = true;
      openPaletteInput.commandSearchFocused = true;
      const blocked: AgentHomeCommandShortcutDecision = registry.resolveShortcut(openPaletteInput);

      const sendInput = new AgentHomeKeyboardShortcutInput('Enter');
      sendInput.metaKey = true;
      sendInput.composerFocused = true;
      const send: AgentHomeCommandShortcutDecision = registry.resolveShortcut(sendInput);

      expect(blocked.handled).assertTrue();
      expect(blocked.blocked).assertTrue();
      expect(blocked.disabledReason).assertEqual('text_input_focused');
      expect(send.handled).assertTrue();
      expect(send.blocked).assertFalse();
      expect(send.commandId).assertEqual(AgentHomeCommandId.SEND_MESSAGE);
    });

    it('honorsCapabilityAndPaneAvailability', 0, (): void => {
      const registry = new AgentHomeCommandRegistry();
      registry.replace(buildCommandDefinitions());

      const terminalInput = new AgentHomeKeyboardShortcutInput('t');
      terminalInput.ctrlKey = true;
      terminalInput.shiftKey = true;
      const terminal: AgentHomeCommandShortcutDecision = registry.resolveShortcut(terminalInput);

      const paneInput = new AgentHomeKeyboardShortcutInput('3');
      paneInput.altKey = true;
      paneInput.rightPaneAvailable = false;
      const pane: AgentHomeCommandShortcutDecision = registry.resolveShortcut(paneInput);

      const escapeInput = new AgentHomeKeyboardShortcutInput('Escape');
      escapeInput.overlayVisible = true;
      const escape: AgentHomeCommandShortcutDecision = registry.resolveShortcut(escapeInput);

      expect(terminal.blocked).assertTrue();
      expect(terminal.disabledReason).assertEqual('terminal_unavailable');
      expect(pane.blocked).assertTrue();
      expect(pane.disabledReason).assertEqual('pane_unavailable');
      expect(escape.handled).assertTrue();
      expect(escape.commandId).assertEqual(AgentHomeCommandId.CLOSE_TOP_OVERLAY);
    });
  });
}
