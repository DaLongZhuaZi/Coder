import { describe, it, expect } from '@ohos/hypium';
import { AgentHomeRelayUiPolicy } from '../main/ets/features/agentHome/AgentHomeRelayUiPolicy';

export default function agentHomeRelayUiPolicyTest() {
  describe('AgentHomeRelayUiPolicy', () => {
    it('allowsWssAndLoopbackWsWithoutUrlSecrets', 0, () => {
      expect(AgentHomeRelayUiPolicy.isSafeRelayUrl('wss://relay.example.com/socket')).assertTrue();
      expect(AgentHomeRelayUiPolicy.isSafeRelayUrl('ws://localhost:8787/relay')).assertTrue();
      expect(AgentHomeRelayUiPolicy.isSafeRelayUrl('ws://127.0.0.1:8787/relay')).assertTrue();
      expect(AgentHomeRelayUiPolicy.isSafeRelayUrl('ws://[::1]:8787/relay')).assertTrue();
      expect(AgentHomeRelayUiPolicy.isSafeRelayUrl('ws://relay.example.com/socket')).assertFalse();
      expect(AgentHomeRelayUiPolicy.isSafeRelayUrl('wss://relay.example.com/socket?token=secret')).assertFalse();
      expect(AgentHomeRelayUiPolicy.isSafeRelayUrl('wss://user@relay.example.com/socket')).assertFalse();
      expect(AgentHomeRelayUiPolicy.isSafeRelayUrl('wss://relay.example.com/socket#fragment')).assertFalse();
    });

    it('persistsOnlyPublicDescriptorFromPairingUri', 0, () => {
      const pairingUri: string = 'ngf-agent-bridge://relay#offer=YWJjZA';
      const publicEndpoint: string = 'ngf-agent-bridge://relay?relayUrl=wss%3A%2F%2Frelay.example.com' +
        '&relayId=relay_123456789012345678901234&bridgeIdentityPublicKeyBase64=YWJjZA' +
        '&bridgeIdentityFingerprint=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      expect(AgentHomeRelayUiPolicy.isRelayPairingUri(pairingUri)).assertTrue();
      expect(AgentHomeRelayUiPolicy.isRelayPublicEndpoint(publicEndpoint)).assertTrue();
      expect(AgentHomeRelayUiPolicy.safePublicEndpointFromPairing(pairingUri, publicEndpoint))
        .assertEqual(publicEndpoint);
      expect(AgentHomeRelayUiPolicy.safePublicEndpointFromPairing(
        pairingUri,
        publicEndpoint + '&pairingSecret=do-not-store'
      )).assertEqual('');
      expect(AgentHomeRelayUiPolicy.safePublicEndpointFromPairing(
        pairingUri,
        publicEndpoint + '&token=do-not-store'
      )).assertEqual('');
      expect(AgentHomeRelayUiPolicy.safePublicEndpointFromPairing('https://example.com', publicEndpoint))
        .assertEqual('');
    });

    it('letsPublicRelayHostsConnectWithoutStandardCredential', 0, () => {
      const relayEndpoint: string = 'ngf-agent-bridge://relay?relayUrl=wss%3A%2F%2Frelay.example.com' +
        '&relayId=relay_123456789012345678901234&bridgeIdentityPublicKeyBase64=YWJjZA' +
        '&bridgeIdentityFingerprint=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      expect(AgentHomeRelayUiPolicy.canConnectHost(relayEndpoint, false)).assertTrue();
      expect(AgentHomeRelayUiPolicy.canConnectHost(
        'ngf-agent-bridge://relay#offer=YWJjZA',
        true
      )).assertFalse();
      expect(AgentHomeRelayUiPolicy.canConnectHost('wss://bridge.example.com/ws', false)).assertFalse();
      expect(AgentHomeRelayUiPolicy.canConnectHost('wss://bridge.example.com/ws', true)).assertTrue();
      expect(AgentHomeRelayUiPolicy.canConnectHost('', true)).assertFalse();
    });
  });
}
