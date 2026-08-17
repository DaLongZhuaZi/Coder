import { describe, it, expect } from '@ohos/hypium';
import { AgentBridgeClient } from '../main/ets/features/agentBridge/AgentBridgeClient';
import {
  AgentHomeHostSwitchCoordinator,
  AgentHomeHostSwitchPlan
} from '../main/ets/features/agentHome/AgentHomeHostSwitchCoordinator';
import {
  AgentHomeHostIdentityStatus,
  AgentHomeHostProfile,
  AgentHomeHostSwitchStatus
} from '../main/ets/features/agentHome/AgentHomeModels';

export default function agentHomeHostSwitchCoordinatorTest() {
  describe('AgentHomeHostSwitchCoordinator', () => {
    it('requiresConfirmationOnlyForConnectedHost', 0, () => {
      const coordinator = new AgentHomeHostSwitchCoordinator();
      coordinator.setInitialHost('host_a');
      const currentPlan: AgentHomeHostSwitchPlan = coordinator.plan('host_a', 'connected');
      expect(currentPlan.noOp).assertTrue();
      expect(currentPlan.requiresConfirmation).assertFalse();
      const connectedPlan: AgentHomeHostSwitchPlan = coordinator.plan('host_b', 'connected');
      expect(connectedPlan.requiresConfirmation).assertTrue();
      expect(coordinator.currentState()).assertEqual(AgentHomeHostSwitchStatus.AWAITING_CONFIRMATION);
      coordinator.cancel();
      expect(coordinator.currentState()).assertEqual(AgentHomeHostSwitchStatus.IDLE);
      expect(coordinator.isMutationBlocked()).assertFalse();
      expect(coordinator.accepts('host_a', 0)).assertTrue();
      const disconnectedPlan: AgentHomeHostSwitchPlan = coordinator.plan('host_b', 'disconnected');
      expect(disconnectedPlan.requiresConfirmation).assertFalse();
    });

    it('tracksMutationGateAndSwitchStates', 0, () => {
      const coordinator = new AgentHomeHostSwitchCoordinator();
      coordinator.setInitialHost('host_a');
      const epoch = coordinator.begin('host_b');
      expect(coordinator.currentState()).assertEqual(AgentHomeHostSwitchStatus.QUIESCING);
      expect(coordinator.isMutationBlocked()).assertTrue();
      coordinator.markLoading();
      expect(coordinator.currentState()).assertEqual(AgentHomeHostSwitchStatus.LOADING);
      coordinator.markConnecting();
      expect(coordinator.currentState()).assertEqual(AgentHomeHostSwitchStatus.CONNECTING);
      coordinator.markReady('host_b');
      expect(coordinator.currentState()).assertEqual(AgentHomeHostSwitchStatus.READY);
      expect(coordinator.isMutationBlocked()).assertFalse();
      expect(coordinator.accepts('host_b', epoch)).assertTrue();
      coordinator.begin('host_a');
      coordinator.markFailed();
      expect(coordinator.currentState()).assertEqual(AgentHomeHostSwitchStatus.FAILED);
      expect(coordinator.isMutationBlocked()).assertFalse();
    });

    it('rejectsPreviousConnectionEpoch', 0, () => {
      const coordinator = new AgentHomeHostSwitchCoordinator();
      coordinator.setInitialHost('host_a');
      const firstEpoch = coordinator.begin('host_b');
      coordinator.markReady('host_b');
      expect(coordinator.accepts('host_b', firstEpoch)).assertTrue();
      const secondEpoch = coordinator.begin('host_a');
      coordinator.markReady('host_a');
      expect(coordinator.accepts('host_b', firstEpoch)).assertFalse();
      expect(coordinator.accepts('host_a', secondEpoch)).assertTrue();
    });

    it('allowsProfilesWithIdenticalEndpointAndCredentialDigest', 0, () => {
      const first = new AgentHomeHostProfile(
        'host_a', 'A', 'ws://127.0.0.1:8787/ws', 'alias_a', 'digest', '', '', '', '', '', '', '', '', '', true,
        AgentHomeHostIdentityStatus.UNBOUND, 1, 1, 1
      );
      const second = new AgentHomeHostProfile(
        'host_b', 'B', first.endpoint, 'alias_b', first.credentialDigest, '', '', '', '', '', '', '', '', '', true,
        AgentHomeHostIdentityStatus.UNBOUND, 1, 1, 1
      );
      expect(first.hostProfileId === second.hostProfileId).assertFalse();
      expect(first.endpoint).assertEqual(second.endpoint);
      expect(first.credentialDigest).assertEqual(second.credentialDigest);
    });

    it('normalizesHostEndpointBeforePersistence', 0, () => {
      expect(AgentBridgeClient.normalizeEndpointInput('  HTTPS://Example.com:443/  '))
        .assertEqual('wss://Example.com:443/ws');
      expect(AgentBridgeClient.normalizeEndpointInput('127.0.0.1:8787'))
        .assertEqual('ws://127.0.0.1:8787/ws');
      expect(AgentBridgeClient.normalizeEndpointInput('ws://127.0.0.1:8787/ws'))
        .assertEqual('ws://127.0.0.1:8787/ws');
    });
  });
}
