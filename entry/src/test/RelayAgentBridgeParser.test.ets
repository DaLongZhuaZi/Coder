import { describe, it, expect } from '@ohos/hypium';
import {
  AgentBridgeIncomingParser,
  AgentBridgeRelayBrokerAck,
  AgentBridgeRelayBrokerAttach,
  AgentBridgeRelayBrokerDetach,
  AgentBridgeRelayBrokerFrame,
  AgentBridgeRelayConnectionState,
  AgentBridgeRelayDirection,
  AgentBridgeRelayEncryptedEnvelope,
  AgentBridgeRelayPairingOffer,
  AgentBridgeRelayPublicEndpoint,
  AgentBridgeRelayResult,
  AgentBridgeRelayStatus
} from '../main/ets/features/agentBridge/AgentBridgeModels';

export default function relayAgentBridgeParserTest() {
  describe('RelayAgentBridgeParser', () => {
    it('parsesTypedStatusPairingDeviceEnvelopeAndFailure', 0, () => {
      const result: AgentBridgeRelayResult = AgentBridgeIncomingParser.parseRelayResult(
        '{"payload":{"ok":false,"action":"relay.status","status":{"state":"connected","transport":"websocket","connectionId":"c1","sessionId":"s1","deviceId":"app1","connected":true,"encrypted":true,"forwardSecrecy":true,"keyEpoch":2,"sendSeq":4,"receiveSeq":3,"pairedDeviceCount":1,"lastHeartbeatAt":"2026-07-14T08:00:00Z"},"offer":{"offerId":"o1","pairingSessionId":"p1","userCode":"ABCD-EFGH","verificationUrl":"https://relay.example/pair","identityPublicKeyBase64":"AQ==","identityFingerprintSha256":"abc","ephemeralPublicKeyBase64":"Ag==","challengeBase64":"Aw==","signatureBase64":"BA==","algorithm":"P-256_ECDH_HKDF_SHA256","expiresAt":"2026-07-14T08:05:00Z","device":{"deviceId":"bridge1","displayName":"Bridge","platform":"windows","publicKeyFingerprint":"def","trusted":true,"keyEpoch":2}},"devices":[{"deviceId":"bridge1","displayName":"Bridge","trusted":true,"keyEpoch":2,"lastSeenAt":"2026-07-14T08:00:00Z"}],"envelope":{"version":1,"sessionId":"s1","direction":"bridge_to_app","seq":3,"keyEpoch":2,"contentType":"application/json","nonceBase64":"AAAAAAAAAAAAAAAA","cipherTextBase64":"AQ==","authTagBase64":"AAAAAAAAAAAAAAAAAAAAAA==","aadBase64":"AQ=="},"failure":{"failureCategory":"rate_limited","message":"retry later","remediation":"relay_retry","warnings":["backoff"]}}}'
      );
      expect(result.status.state).assertEqual(AgentBridgeRelayConnectionState.CONNECTED);
      expect(result.status.encrypted).assertTrue();
      expect(result.status.receiveSeq).assertEqual(3);
      expect(result.pairingOffer.verificationUrl).assertEqual('https://relay.example/pair');
      expect(result.pairingOffer.device.deviceId).assertEqual('bridge1');
      expect(result.devices.length).assertEqual(1);
      expect(result.devices[0].trusted).assertTrue();
      expect(result.envelope.direction).assertEqual(AgentBridgeRelayDirection.BRIDGE_TO_APP);
      expect(result.envelope.seq).assertEqual(3);
      expect(result.failure.failureCategory).assertEqual('rate_limited');
      expect(result.failure.warnings[0]).assertEqual('backoff');
    });

    it('usesSafeDefaultsForMissingOrMalformedFields', 0, () => {
      const status: AgentBridgeRelayStatus = AgentBridgeIncomingParser.parseRelayStatus(
        '{"payload":{"status":{"state":"execute_remote_command","sendSeq":-1,"receiveSeq":1.5}}}'
      );
      const offer: AgentBridgeRelayPairingOffer = AgentBridgeIncomingParser.parseRelayPairingOffer(
        '{"offer":{"verificationUrl":"javascript:alert(1)","identityPublicKeyBase64":"not base64!"}}'
      );
      const envelope: AgentBridgeRelayEncryptedEnvelope = AgentBridgeIncomingParser.parseRelayEncryptedEnvelope(
        '{"envelope":{"version":1,"direction":"sideways","seq":-2,"nonceBase64":"%%%"}}'
      );
      expect(status.state).assertEqual(AgentBridgeRelayConnectionState.DEGRADED);
      expect(status.sendSeq).assertEqual(0);
      expect(status.receiveSeq).assertEqual(0);
      expect(offer.verificationUrl).assertEqual('');
      expect(offer.identityPublicKeyBase64).assertEqual('');
      expect(envelope.direction).assertEqual('');
      expect(envelope.seq).assertEqual(0);
      expect(envelope.nonceBase64).assertEqual('');
    });

    it('normalizesBridgePrimitiveEnvelopeAliases', 0, () => {
      const envelope: AgentBridgeRelayEncryptedEnvelope = AgentBridgeIncomingParser.parseRelayEncryptedEnvelope(
        '{"envelope":{"version":1,"sessionId":"s1","direction":"bridge_to_app","seq":1,"contentType":"application/json","iv":"AAAAAAAAAAAAAAAA","ciphertext":"AQ==","authTag":"AAAAAAAAAAAAAAAAAAAAAA=="}}'
      );
      expect(envelope.nonceBase64).assertEqual('AAAAAAAAAAAAAAAA');
      expect(envelope.cipherTextBase64).assertEqual('AQ==');
      expect(envelope.authTagBase64).assertEqual('AAAAAAAAAAAAAAAAAAAAAA==');
      expect(envelope.aadBase64).assertEqual('');
    });

    it('normalizesPairingExpiryAndAbsentResult', 0, () => {
      const offer: AgentBridgeRelayPairingOffer = AgentBridgeIncomingParser.parseRelayPairingOffer(
        '{"payload":{"offer":{"offerId":"o2","expiresAt":1784016300000}}}'
      );
      const emptyResult: AgentBridgeRelayResult = AgentBridgeIncomingParser.parseRelayResult('{}');
      expect(offer.expiresAt.length > 0).assertTrue();
      expect(offer.expiresAtEpochMs).assertEqual(1784016300000);
      expect(emptyResult.ok).assertFalse();
      expect(emptyResult.status.state).assertEqual(AgentBridgeRelayConnectionState.DISCONNECTED);
      expect(emptyResult.devices.length).assertEqual(0);
    });

    it('matchesRelayBrokerWireSchemaExactly', 0, () => {
      const attach: AgentBridgeRelayBrokerAttach = new AgentBridgeRelayBrokerAttach('relay_id');
      const broadcast: AgentBridgeRelayBrokerFrame = new AgentBridgeRelayBrokerFrame(
        'relay_id',
        'app_connection',
        '',
        'frame_1',
        '{}'
      );
      const targeted: AgentBridgeRelayBrokerFrame = new AgentBridgeRelayBrokerFrame(
        'relay_id',
        'app_connection',
        'bridge_connection',
        'frame_2',
        '{}'
      );
      const ack: AgentBridgeRelayBrokerAck = new AgentBridgeRelayBrokerAck(
        'relay_id',
        'app_connection',
        'bridge_connection',
        'frame_2'
      );
      const detach: AgentBridgeRelayBrokerDetach = new AgentBridgeRelayBrokerDetach(
        'relay_id',
        'app_connection'
      );
      expect(JSON.stringify(attach)).assertEqual('{"type":"relay.attach","relayId":"relay_id"}');
      expect(JSON.stringify(broadcast)).assertEqual(
        '{"type":"relay.frame","relayId":"relay_id","connectionId":"app_connection",' +
          '"frameId":"frame_1","payload":"{}"}'
      );
      expect(JSON.stringify(targeted)).assertEqual(
        '{"type":"relay.frame","relayId":"relay_id","connectionId":"app_connection",' +
          '"targetConnectionId":"bridge_connection","frameId":"frame_2","payload":"{}"}'
      );
      expect(JSON.stringify(ack)).assertEqual(
        '{"type":"relay.ack","relayId":"relay_id","connectionId":"app_connection",' +
          '"targetConnectionId":"bridge_connection","frameId":"frame_2"}'
      );
      expect(JSON.stringify(detach)).assertEqual(
        '{"type":"relay.detach","relayId":"relay_id","connectionId":"app_connection"}'
      );
    });

    it('parsesNestedRelayAndPairingLifecycleState', 0, () => {
      const result: AgentBridgeRelayResult = AgentBridgeIncomingParser.parseRelayResult(
        '{"payload":{"ok":true,"confirmed":true,"planId":"plan_1","relay":{' +
          '"transportStatus":"connected","pairedDevices":2,"pairing":{' +
          '"active":true,"offerId":"offer_1","expiresAt":"2026-07-14T08:05:00Z"}}}}'
      );
      expect(result.confirmed).assertTrue();
      expect(result.planId).assertEqual('plan_1');
      expect(result.status.state).assertEqual(AgentBridgeRelayConnectionState.CONNECTED);
      expect(result.status.pairedDeviceCount).assertEqual(2);
      expect(result.status.pairingActive).assertTrue();
      expect(result.status.pairingOfferId).assertEqual('offer_1');
      expect(result.status.pairingExpiresAt).assertEqual('2026-07-14T08:05:00.000Z');
    });

    it('acceptsOnlyWssOrExactLoopbackRelayUrls', 0, () => {
      const relayId: string = 'abcdefghijklmnopqrstuvwxyzABCDEF';
      const fingerprint: string = '0000000000000000000000000000000000000000000000000000000000000000';
      const valid: AgentBridgeRelayPublicEndpoint = AgentBridgeIncomingParser.parseRelayPublicEndpoint(
        'ngf-agent-bridge://relay?relayUrl=ws%3A%2F%2F127.0.0.1%3A8080%2Frelay&relayId=' + relayId +
          '&bridgeIdentityPublicKeyBase64=AQ%3D%3D&bridgeIdentityFingerprint=' + fingerprint
      );
      const hostile: AgentBridgeRelayPublicEndpoint = AgentBridgeIncomingParser.parseRelayPublicEndpoint(
        'ngf-agent-bridge://relay?relayUrl=ws%3A%2F%2Flocalhost.evil%2Frelay&relayId=' + relayId +
          '&bridgeIdentityPublicKeyBase64=AQ%3D%3D&bridgeIdentityFingerprint=' + fingerprint
      );
      expect(valid.isValid()).assertTrue();
      expect(hostile.isValid()).assertFalse();
    });

    it('decodesUnpaddedNodePairingUriWithoutPersistingItInEndpoint', 0, () => {
      const encodedOffer: string =
        'eyJ2ZXJzaW9uIjoxLCJwcm90b2NvbFZlcnNpb24iOiJuZ2YtYWdlbnQtYnJpZGdlLnJlbGF5LnYxIiwicmVs' +
          'YXlVcmwiOiJ3c3M6Ly9yZWxheS5leGFtcGxlL3JlbGF5IiwicmVsYXlJZCI6ImFiY2RlZmdoaWprbG1ub3Bx' +
          'cnN0dXZ3eHl6QUJDREVGIiwib2ZmZXJJZCI6Im9mZmVyXzEyMzQ1NiIsInBhaXJpbmdTZWNyZXQiOiJhYmNk' +
          'ZWZnaGlqa2xtbm9wIiwiZXhwaXJlc0F0IjoiMjA5OS0wMS0wMVQwMDowMDowMC4wMDBaIiwiYnJpZGdlSWRl' +
          'bnRpdHkiOnsicHVibGljS2V5QmFzZTY0IjoiQVE9PSIsInB1YmxpY0tleUZpbmdlcnByaW50IjoiMDAwMDAw' +
          'MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMCIs' +
          'ImdlbmVyYXRpb24iOjEsImRpc3BsYXlOYW1lIjoiQnJpZGdlIiwicGxhdGZvcm0iOiJ3aW5kb3dzIn19';
      const offer: AgentBridgeRelayPairingOffer = AgentBridgeIncomingParser.parseRelayPairingUri(
        'ngf-agent-bridge://relay#offer=' + encodedOffer
      );
      const endpoint: string = AgentBridgeIncomingParser.buildRelayPublicEndpoint(offer);
      expect(offer.offerId).assertEqual('offer_123456');
      expect(offer.pairingSecret).assertEqual('abcdefghijklmnop');
      expect(endpoint.indexOf('pairingSecret')).assertEqual(-1);
      expect(endpoint.indexOf('offer_123456')).assertEqual(-1);
      expect(endpoint.indexOf('bridgeIdentityFingerprint=') >= 0).assertTrue();
    });
  });
}
