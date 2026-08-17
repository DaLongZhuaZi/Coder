import { describe, expect, it } from '@ohos/hypium';
import {
  AgentHomeDaemonFleetAvailabilityPolicy
} from '../main/ets/features/agentHome/AgentHomeDaemonFleetAvailabilityPolicy';
import {
  AgentHomeDaemonFleetQueryResult
} from '../main/ets/features/agentHome/AgentHomeDaemonFleetConnectionPool';
import { AgentHomeHostProfile } from '../main/ets/features/agentHome/AgentHomeModels';
import { AgentBridgeDaemonStatus } from '../main/ets/features/agentBridge/AgentBridgeModels';
import { AgentHomeDaemonInstanceSnapshot } from '../main/ets/features/agentHome/AgentHomeDaemonFleetCoordinator';

function profileWith(hostProfileId: string, endpoint: string): AgentHomeHostProfile {
  const profile = AgentHomeHostProfile.empty();
  profile.hostProfileId = hostProfileId;
  profile.endpoint = endpoint;
  return profile;
}

function resultFor(hostProfileId: string): AgentHomeDaemonFleetQueryResult {
  const status = new AgentBridgeDaemonStatus();
  return new AgentHomeDaemonFleetQueryResult(
    hostProfileId, true, '', '', status,
    new AgentHomeDaemonInstanceSnapshot(hostProfileId, 'instance-' + hostProfileId, 1, 'healthy', '1.0.0', '', false, '', true)
  );
}

export default function agentHomeDaemonFleetAvailabilityPolicyTest(): void {
  describe('AgentHomeDaemonFleetAvailabilityPolicy', (): void => {
    it('keeps the Fleet panel hidden when no saved host profiles exist', 0, (): void => {
      expect(AgentHomeDaemonFleetAvailabilityPolicy.isFleetPanelAvailable([])).assertEqual(false);
    });

    it('does not count incomplete profiles as queryable', 0, (): void => {
      const emptyProfile = AgentHomeHostProfile.empty();
      emptyProfile.hostProfileId = 'host-no-endpoint';
      const noIdProfile = profileWith('', 'ws://127.0.0.1:1');
      expect(AgentHomeDaemonFleetAvailabilityPolicy.queryableProfileCount([emptyProfile, noIdProfile])).assertEqual(0);
      expect(AgentHomeDaemonFleetAvailabilityPolicy.isFleetPanelAvailable([emptyProfile, noIdProfile])).assertEqual(false);
    });

    it('shows the Fleet panel from saved profiles without any active Bridge dependency', 0, (): void => {
      const profiles: Array<AgentHomeHostProfile> = [
        profileWith('host-a', 'ws://127.0.0.1:8765'),
        profileWith('host-b', 'ws://127.0.0.1:8766')
      ];
      expect(AgentHomeDaemonFleetAvailabilityPolicy.isFleetPanelAvailable(profiles)).assertEqual(true);
      expect(AgentHomeDaemonFleetAvailabilityPolicy.queryableProfileCount(profiles)).assertEqual(2);
    });

    it('accepts a collect batch that covers exactly the current profiles', 0, (): void => {
      const profiles: Array<AgentHomeHostProfile> = [
        profileWith('host-a', 'ws://127.0.0.1:8765'),
        profileWith('host-b', 'ws://127.0.0.1:8766')
      ];
      const results: Array<AgentHomeDaemonFleetQueryResult> = [resultFor('host-a'), resultFor('host-b')];
      expect(AgentHomeDaemonFleetAvailabilityPolicy.matchesCurrentProfiles(results, profiles)).assertEqual(true);
    });

    it('rejects a stale batch whose host set differs from the current profiles', 0, (): void => {
      const profiles: Array<AgentHomeHostProfile> = [
        profileWith('host-a', 'ws://127.0.0.1:8765'),
        profileWith('host-b', 'ws://127.0.0.1:8766'),
        profileWith('host-c', 'ws://127.0.0.1:8767')
      ];
      const stale: Array<AgentHomeDaemonFleetQueryResult> = [resultFor('host-a'), resultFor('host-b')];
      expect(AgentHomeDaemonFleetAvailabilityPolicy.matchesCurrentProfiles(stale, profiles)).assertEqual(false);

      const replaced: Array<AgentHomeDaemonFleetQueryResult> = [resultFor('host-a'), resultFor('host-c')];
      expect(AgentHomeDaemonFleetAvailabilityPolicy.matchesCurrentProfiles(replaced, profiles)).assertEqual(false);
    });
  });
}
