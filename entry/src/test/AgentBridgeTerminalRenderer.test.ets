import { describe, it, expect } from '@ohos/hypium';
import {
  AgentBridgeTerminalColor,
  AgentBridgeTerminalRenderer,
  AgentBridgeTerminalRenderRun
} from '../main/ets/features/agentBridge/AgentBridgeTerminalRenderer';

export default function agentBridgeTerminalRendererTest() {
  describe('AgentBridgeTerminalRenderer', () => {
    it('rendersCursorMovementAndClear', 0, () => {
      const renderer = new AgentBridgeTerminalRenderer();
      renderer.feed('abc\rZ');
      expect(renderer.plainText()).assertEqual('Zbc');
      renderer.feed('\u001b[2Jdone');
      expect(renderer.plainText()).assertEqual('done');
    });

    it('preservesBasicSgrStylesAcrossChunks', 0, () => {
      const renderer = new AgentBridgeTerminalRenderer();
      renderer.feed('\u001b[');
      renderer.feed('1;31;44mAlert');
      renderer.feed('\u001b[0m plain');
      const runs: Array<AgentBridgeTerminalRenderRun> = renderer.renderRuns();
      expect(runs.length).assertEqual(2);
      expect(runs[0].text).assertEqual('Alert');
      expect(runs[0].bold).assertTrue();
      expect(runs[0].foreground).assertEqual(AgentBridgeTerminalColor.RED);
      expect(runs[0].background).assertEqual(AgentBridgeTerminalColor.BLUE);
      expect(runs[1].text).assertEqual(' plain');
      expect(runs[1].bold).assertFalse();
    });

    it('consumesUnknownAndOscSequences', 0, () => {
      const renderer = new AgentBridgeTerminalRenderer();
      renderer.feed('before\u001b]0;secret title\u0007after');
      renderer.feed('\u001b[?9999hvisible');
      expect(renderer.plainText()).assertEqual('beforeaftervisible');
    });

    it('handlesLineEraseAndCursorOverwrite', 0, () => {
      const renderer = new AgentBridgeTerminalRenderer();
      renderer.feed('first\nsecond');
      renderer.feed('\u001b[1A\u001b[1Gnew\u001b[K');
      expect(renderer.plainText()).assertEqual('new\nsecond');
    });

    it('rendersIndexedAndTrueColorAcrossChunks', 0, () => {
      const renderer = new AgentBridgeTerminalRenderer();
      renderer.feed('\u001b[38;5;196mred');
      renderer.feed('\u001b[48;2;1;2;3mblock\u001b[0m');
      const runs: Array<AgentBridgeTerminalRenderRun> = renderer.renderRuns();
      expect(runs.length).assertEqual(2);
      expect(runs[0].foreground).assertEqual('#FFFF0000');
      expect(runs[1].background).assertEqual('#FF010203');
    });

    it('restoresPrimaryScreenAfterAlternateScreen', 0, () => {
      const renderer = new AgentBridgeTerminalRenderer();
      renderer.feed('primary');
      renderer.feed('\u001b[?1049halternate');
      expect(renderer.plainText()).assertEqual('alternate');
      renderer.feed('\u001b[?1049l');
      expect(renderer.plainText()).assertEqual('primary');
    });

    it('preservesWideCharactersAndSavedCursor', 0, () => {
      const renderer = new AgentBridgeTerminalRenderer();
      renderer.feed('中A\u001b[sZ\u001b[uB');
      expect(renderer.plainText()).assertEqual('中AB');
    });

    it('scrollsInsideConfiguredRegion', 0, () => {
      const renderer = new AgentBridgeTerminalRenderer();
      renderer.feed('one\ntwo\nthree');
      renderer.feed('\u001b[2;3r\u001b[3;1Hnext\nlast');
      expect(renderer.plainText()).assertEqual('one\nnext\nlast');
    });
  });
}
