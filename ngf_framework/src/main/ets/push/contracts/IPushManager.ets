import { UIAbility } from '@kit.AbilityKit';

export class NGFPushFailureCategory {
  static readonly NONE: string = '';
  static readonly PARAMETER_INVALID: string = 'parameter_invalid';
  static readonly SERVICE_UNAVAILABLE: string = 'service_unavailable';
  static readonly APP_IDENTITY_INVALID: string = 'app_identity_invalid';
  static readonly NETWORK_UNAVAILABLE: string = 'network_unavailable';
  static readonly ENTITLEMENT_MISSING: string = 'entitlement_missing';
  static readonly CROSS_LOCATION_NOT_ALLOWED: string = 'cross_location_not_allowed';
  static readonly DEVICE_UNSUPPORTED: string = 'device_unsupported';
  static readonly TOKEN_EMPTY: string = 'token_empty';
  static readonly LISTENER_REGISTRATION_FAILED: string = 'listener_registration_failed';
  static readonly INTERNAL_ERROR: string = 'internal_error';
}

export class NGFPushPayloadRecord {
  type: string;
  data: string;
  receivedAt: number;

  constructor(type: string, data: string, receivedAt: number = Date.now()) {
    this.type = type;
    this.data = data;
    this.receivedAt = receivedAt;
  }
}

export class NGFPushStatus {
  available: boolean;
  initialized: boolean;
  tokenAvailable: boolean;
  tokenUpdatedAt: number;
  tokenListenerRegistered: boolean;
  messageListenerRegistered: boolean;
  lastPayloadType: string;
  lastMessageAt: number;
  failureCategory: string;
  errorCode: number;
  message: string;
  remediation: string;

  constructor() {
    this.available = true;
    this.initialized = false;
    this.tokenAvailable = false;
    this.tokenUpdatedAt = 0;
    this.tokenListenerRegistered = false;
    this.messageListenerRegistered = false;
    this.lastPayloadType = '';
    this.lastMessageAt = 0;
    this.failureCategory = '';
    this.errorCode = 0;
    this.message = '';
    this.remediation = '';
  }
}

export class NGFPushTokenResult {
  ok: boolean;
  token: string;
  status: NGFPushStatus;

  constructor(ok: boolean, token: string, status: NGFPushStatus) {
    this.ok = ok;
    this.token = token;
    this.status = status;
  }
}

export type NGFPushStatusListener = (status: NGFPushStatus) => void;
export type NGFPushMessageListener = (message: NGFPushPayloadRecord) => void;

export interface IPushManager {
  initialize(ability: UIAbility): Promise<NGFPushStatus>;
  destroy(): void;
  refreshToken(): Promise<NGFPushTokenResult>;
  getToken(): Promise<string | null>;
  deleteToken(): Promise<NGFPushStatus>;
  currentToken(): string;
  currentStatus(): NGFPushStatus;
  setStatusListener(listener: NGFPushStatusListener | null): void;
  onMessageReceived(callback: NGFPushMessageListener): void;
  clearMessageListener(): void;
  dispatchMessage(message: NGFPushPayloadRecord): void;
}
