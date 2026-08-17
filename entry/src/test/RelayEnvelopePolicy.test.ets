import { describe, it, expect } from '@ohos/hypium';
import { RelayCryptoProtocol } from 'ngf_framework';
import {
  AgentBridgeRelayDirection,
  AgentBridgeRelayEncryptedEnvelope
} from '../main/ets/features/agentBridge/AgentBridgeModels';
import {
  AgentBridgeRelayAttemptGuard,
  AgentBridgeRelayEnvelopePolicy,
  AgentBridgeRelayPolicyDecision,
  AgentBridgeRelayPolicyFailureCategory,
  AgentBridgeRelayReceiveSequencer,
  AgentBridgeRelayRemediationAction,
  AgentBridgeRelayTranscriptPolicy
} from '../main/ets/features/agentBridge/AgentBridgeRelayPolicy';

function buildEnvelope(seq: number): AgentBridgeRelayEncryptedEnvelope {
  const envelope: AgentBridgeRelayEncryptedEnvelope = new AgentBridgeRelayEncryptedEnvelope();
  envelope.version = 1;
  envelope.sessionId = 'session-1';
  envelope.direction = AgentBridgeRelayDirection.BRIDGE_TO_APP;
  envelope.seq = seq;
  envelope.keyEpoch = 2;
  envelope.contentType = 'application/json';
  envelope.nonceBase64 = 'AAAAAAAAAAAAAAAA';
  envelope.cipherTextBase64 = 'AQ==';
  envelope.authTagBase64 = 'AAAAAAAAAAAAAAAAAAAAAA==';
  envelope.aadBase64 = 'AQ==';
  return envelope;
}

export default function relayEnvelopePolicyTest() {
  describe('RelayEnvelopePolicy', () => {
    it('keepsCanonicalAadAlignedWithSecurityFacade', 0, () => {
      const envelope: AgentBridgeRelayEncryptedEnvelope = buildEnvelope(7);
      const appAad: string = AgentBridgeRelayEnvelopePolicy.buildAadText(envelope);
      const frameworkAad: string = RelayCryptoProtocol.buildAadText(
        envelope.sessionId,
        envelope.direction,
        envelope.seq,
        envelope.keyEpoch,
        envelope.contentType
      );
      expect(appAad).assertEqual(frameworkAad);
      expect(appAad.indexOf('ngf-relay-v1\n') === 0).assertTrue();
      expect(appAad).assertEqual(
        'ngf-relay-v1\n9:session-1\n13:bridge_to_app\n7\n2\n16:application/json'
      );
    });

    it('keepsNodeKdfContextTextStable', 0, () => {
      const saltText: string = RelayCryptoProtocol.buildKdfSaltText('relay', 'client', 'bridge');
      const infoText: string = RelayCryptoProtocol.buildKdfInfoText(
        'session_1',
        'client_fp',
        'bridge_fp',
        1
      );
      expect(saltText).assertEqual('ngf-relay-hkdf-salt-v1\nrelay\nclient\nbridge');
      expect(infoText).assertEqual('ngf-relay-session-v1\nsession_1\nclient_fp\nbridge_fp\n1');
    });

    it('keepsNodeHandshakeTranscriptsStable', 0, () => {
      const pairing: string = AgentBridgeRelayTranscriptPolicy.buildPairingHello(
        'relay', 'offer', 'device', 'identity', 'clientfp', 'bridgefp', 'session', 'ephemeral', 'nonce', 123
      );
      const hello: string = AgentBridgeRelayTranscriptPolicy.buildSessionHello(
        'relay', 'device', 'clientfp', 'bridgefp', 'session', 'ephemeral', 'nonce', 123
      );
      const response: string = AgentBridgeRelayTranscriptPolicy.buildSessionResponse(
        'relay', 'device', 'clientfp', 'bridgefp', 'session', 'client_ephemeral', 'bridge_ephemeral',
        'client_nonce', 'bridge_nonce', 123
      );
      expect(pairing).assertEqual(
        '["ngf-agent-bridge.relay.v1","pairing.hello","relay","offer","device","identity",' +
          '"clientfp","bridgefp","session","ephemeral","nonce",123]'
      );
      expect(hello).assertEqual(
        '["ngf-agent-bridge.relay.v1","session.hello","relay","device","clientfp","bridgefp",' +
          '"session","ephemeral","nonce",123]'
      );
      expect(response).assertEqual(
        '["ngf-agent-bridge.relay.v1","session.response","relay","device","clientfp","bridgefp",' +
          '"session","client_ephemeral","bridge_ephemeral","client_nonce","bridge_nonce",123]'
      );
    });

    it('invalidatesAsyncWorkFromOlderTransportAttempts', 0, () => {
      const guard: AgentBridgeRelayAttemptGuard = new AgentBridgeRelayAttemptGuard();
      const firstEpoch: number = guard.beginNextEpoch();
      expect(guard.isCurrent(firstEpoch)).assertTrue();
      const secondEpoch: number = guard.beginNextEpoch();
      expect(guard.isCurrent(firstEpoch)).assertFalse();
      expect(guard.isCurrent(secondEpoch)).assertTrue();
      expect(guard.getCurrentEpoch()).assertEqual(secondEpoch);
    });

    it('acceptsOnlyTheExactReceiveSequence', 0, () => {
      const sequencer: AgentBridgeRelayReceiveSequencer = new AgentBridgeRelayReceiveSequencer();
      const first: AgentBridgeRelayEncryptedEnvelope = buildEnvelope(1);
      first.aadBase64 = '';
      const accepted: AgentBridgeRelayPolicyDecision = sequencer.validate(
        first,
        'session-1',
        AgentBridgeRelayDirection.BRIDGE_TO_APP,
        2
      );
      expect(accepted.accepted).assertTrue();
      expect(sequencer.getExpectedSequence()).assertEqual(1);
      expect(sequencer.commitAuthenticated(first)).assertTrue();
      expect(sequencer.getExpectedSequence()).assertEqual(2);

      const replay: AgentBridgeRelayPolicyDecision = sequencer.validate(
        first,
        'session-1',
        AgentBridgeRelayDirection.BRIDGE_TO_APP,
        2
      );
      const gap: AgentBridgeRelayPolicyDecision = sequencer.validate(
        buildEnvelope(3),
        'session-1',
        AgentBridgeRelayDirection.BRIDGE_TO_APP,
        2
      );
      expect(replay.failureCategory).assertEqual(AgentBridgeRelayPolicyFailureCategory.REPLAY_DETECTED);
      expect(replay.remediation).assertEqual(AgentBridgeRelayRemediationAction.DISCARD_ENVELOPE);
      expect(gap.failureCategory).assertEqual(AgentBridgeRelayPolicyFailureCategory.SEQUENCE_GAP);
      expect(gap.remediation).assertEqual(AgentBridgeRelayRemediationAction.RECONNECT);
      expect(sequencer.getExpectedSequence()).assertEqual(2);
    });

    it('rejectsWrongScopeBeforeSequenceCommit', 0, () => {
      const envelope: AgentBridgeRelayEncryptedEnvelope = buildEnvelope(1);
      const wrongSession: AgentBridgeRelayPolicyDecision = AgentBridgeRelayEnvelopePolicy.validate(
        envelope,
        'session-2',
        AgentBridgeRelayDirection.BRIDGE_TO_APP,
        1,
        2
      );
      const wrongDirection: AgentBridgeRelayPolicyDecision = AgentBridgeRelayEnvelopePolicy.validate(
        envelope,
        'session-1',
        AgentBridgeRelayDirection.APP_TO_BRIDGE,
        1,
        2
      );
      const wrongEpoch: AgentBridgeRelayPolicyDecision = AgentBridgeRelayEnvelopePolicy.validate(
        envelope,
        'session-1',
        AgentBridgeRelayDirection.BRIDGE_TO_APP,
        1,
        3
      );
      expect(wrongSession.failureCategory).assertEqual(AgentBridgeRelayPolicyFailureCategory.SESSION_MISMATCH);
      expect(wrongDirection.failureCategory).assertEqual(AgentBridgeRelayPolicyFailureCategory.DIRECTION_MISMATCH);
      expect(wrongEpoch.failureCategory).assertEqual(AgentBridgeRelayPolicyFailureCategory.KEY_EPOCH_MISMATCH);
    });

    it('rejectsMalformedEnvelopeEncoding', 0, () => {
      const envelope: AgentBridgeRelayEncryptedEnvelope = buildEnvelope(1);
      envelope.authTagBase64 = 'not-base64!';
      const decision: AgentBridgeRelayPolicyDecision = AgentBridgeRelayEnvelopePolicy.validate(
        envelope,
        'session-1',
        AgentBridgeRelayDirection.BRIDGE_TO_APP,
        1,
        2
      );
      expect(decision.accepted).assertFalse();
      expect(decision.failureCategory).assertEqual(AgentBridgeRelayPolicyFailureCategory.INVALID_ENVELOPE);
    });
  });
}
