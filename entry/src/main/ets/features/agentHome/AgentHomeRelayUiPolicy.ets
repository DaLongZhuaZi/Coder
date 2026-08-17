export class AgentHomeRelayUiPolicy {
  static readonly MAX_ENDPOINT_LENGTH: number = 32768;
  static readonly MAX_RELAY_URL_LENGTH: number = 2048;

  static isRelayPairingUri(input: string): boolean {
    const value: string = input.trim().toLowerCase();
    return value.length <= AgentHomeRelayUiPolicy.MAX_ENDPOINT_LENGTH &&
      value.startsWith('ngf-agent-bridge://relay#offer=');
  }

  static isRelayPublicEndpoint(input: string): boolean {
    const value: string = input.trim();
    const lower: string = value.toLowerCase();
    if (value.length === 0 || value.length > AgentHomeRelayUiPolicy.MAX_ENDPOINT_LENGTH ||
      !lower.startsWith('ngf-agent-bridge://relay?') || value.indexOf('#') >= 0 ||
      AgentHomeRelayUiPolicy.hasUnsafeWhitespace(value)) {
      return false;
    }
    return lower.indexOf('pairingsecret=') < 0 && lower.indexOf('pairing_secret=') < 0 &&
      lower.indexOf('token=') < 0 && lower.indexOf('secret=') < 0 && lower.indexOf('offerid=') < 0;
  }

  static safePublicEndpointFromPairing(pairingUri: string, publicEndpoint: string): string {
    if (!AgentHomeRelayUiPolicy.isRelayPairingUri(pairingUri) ||
      !AgentHomeRelayUiPolicy.isRelayPublicEndpoint(publicEndpoint)) {
      return '';
    }
    return publicEndpoint.trim();
  }

  static canConnectHost(endpoint: string, credentialAvailable: boolean): boolean {
    const value: string = endpoint.trim();
    if (value.length === 0) {
      return false;
    }
    if (AgentHomeRelayUiPolicy.isRelayPublicEndpoint(value)) {
      return true;
    }
    if (value.toLowerCase().startsWith('ngf-agent-bridge://relay')) {
      return false;
    }
    return credentialAvailable;
  }

  static isSafeRelayUrl(input: string): boolean {
    const value: string = input.trim();
    const lower: string = value.toLowerCase();
    if (value.length === 0 || value.length > AgentHomeRelayUiPolicy.MAX_RELAY_URL_LENGTH ||
      AgentHomeRelayUiPolicy.hasUnsafeWhitespace(value) || value.indexOf('#') >= 0 || value.indexOf('?') >= 0 ||
      value.indexOf('@') >= 0) {
      return false;
    }
    if (lower.startsWith('wss://')) {
      return AgentHomeRelayUiPolicy.hasUrlAuthority(value, 6);
    }
    if (lower.startsWith('ws://localhost')) {
      return AgentHomeRelayUiPolicy.hasLoopbackBoundary(lower, 'ws://localhost'.length);
    }
    if (lower.startsWith('ws://127.0.0.1')) {
      return AgentHomeRelayUiPolicy.hasLoopbackBoundary(lower, 'ws://127.0.0.1'.length);
    }
    if (lower.startsWith('ws://[::1]')) {
      return AgentHomeRelayUiPolicy.hasLoopbackBoundary(lower, 'ws://[::1]'.length);
    }
    return false;
  }

  private static hasUnsafeWhitespace(value: string): boolean {
    return value.indexOf(' ') >= 0 || value.indexOf('\r') >= 0 || value.indexOf('\n') >= 0 ||
      value.indexOf('\t') >= 0;
  }

  private static hasUrlAuthority(value: string, authorityStart: number): boolean {
    const pathIndex: number = value.indexOf('/', authorityStart);
    const queryIndex: number = value.indexOf('?', authorityStart);
    let authorityEnd: number = value.length;
    if (pathIndex >= 0 && pathIndex < authorityEnd) {
      authorityEnd = pathIndex;
    }
    if (queryIndex >= 0 && queryIndex < authorityEnd) {
      authorityEnd = queryIndex;
    }
    return authorityEnd > authorityStart;
  }

  private static hasLoopbackBoundary(value: string, boundaryIndex: number): boolean {
    if (value.length === boundaryIndex) {
      return true;
    }
    const next: string = value.charAt(boundaryIndex);
    return next === ':' || next === '/';
  }
}
