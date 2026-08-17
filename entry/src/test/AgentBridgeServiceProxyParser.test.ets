import { describe, expect, it } from '@ohos/hypium';
import {
  AgentBridgeIncomingParser,
  AgentBridgeWorkspaceServiceResult
} from '../main/ets/features/agentBridge/AgentBridgeModels';

export default function agentBridgeServiceProxyParserTest(): void {
  describe('AgentBridgeServiceProxyParser', (): void => {
    it('parsesServiceListAndHealth', 0, (): void => {
      const result: AgentBridgeWorkspaceServiceResult = AgentBridgeIncomingParser.parseWorkspaceServiceResult(
        '{"type":"response","ok":true,"payload":{"ok":true,"services":[{"serviceId":"svc-1","name":"Docs","workspaceId":"ws-1","status":"running","port":4100,"proxyPath":"/service/svc-1/","lastHealth":{"ok":true,"statusCode":200,"checkedAt":"2026-07-15T00:00:00Z"}}],"totalCount":1}}'
      );
      expect(result.ok).assertTrue();
      expect(result.services.length).assertEqual(1);
      expect(result.services[0].serviceId).assertEqual('svc-1');
      expect(result.services[0].lastHealth.statusCode).assertEqual(200);
    });

    it('keepsSafeDefaultsForMissingFields', 0, (): void => {
      const result: AgentBridgeWorkspaceServiceResult = AgentBridgeIncomingParser.parseWorkspaceServiceResult(
        '{"type":"response","ok":true,"payload":{"ok":true,"services":[]}}'
      );
      expect(result.services.length).assertEqual(0);
      expect(result.totalCount).assertEqual(0);
      expect(result.service.status).assertEqual('stopped');
      expect(result.service.auth.mode).assertEqual('bridge');
      expect(result.accessUrl).assertEqual('');
      expect(result.ticket).assertEqual('');
      expect(result.expiresAt).assertEqual('');
    });

    it('parsesShortLivedServiceAccessResult', 0, (): void => {
      const result: AgentBridgeWorkspaceServiceResult = AgentBridgeIncomingParser.parseWorkspaceServiceResult(
        '{"type":"response","ok":true,"payload":{"ok":true,"confirmed":true,"serviceId":"svc-1","accessUrl":"https://bridge.example/service/svc-1/?ticket=once","ticket":"once","expiresAt":"2026-07-16T01:02:03Z"}}'
      );
      expect(result.confirmed).assertTrue();
      expect(result.serviceId).assertEqual('svc-1');
      expect(result.accessUrl).assertEqual('https://bridge.example/service/svc-1/?ticket=once');
      expect(result.ticket).assertEqual('once');
      expect(result.expiresAt).assertEqual('2026-07-16T01:02:03Z');
    });
  });
}
