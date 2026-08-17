import { UIAbility } from '@kit.AbilityKit';
import { BusinessError } from '@kit.BasicServicesKit';
import { pushCommon, pushService } from '@kit.PushKit';
import {
  IPushManager,
  NGFPushFailureCategory,
  NGFPushMessageListener,
  NGFPushPayloadRecord,
  NGFPushStatus,
  NGFPushStatusListener,
  NGFPushTokenResult
} from '../contracts/IPushManager';
import { logger } from '../../utils/Logger';

const TAG: string = 'PushManagerFacade';

export class PushManagerFacade implements IPushManager {
  private ability: UIAbility | null = null;
  private pushToken: string = '';
  private status: NGFPushStatus = new NGFPushStatus();
  private statusListener: NGFPushStatusListener | null = null;
  private messageListener: NGFPushMessageListener | null = null;
  private initialized: boolean = false;
  private tokenCallbackRegistered: boolean = false;
  private backgroundCallbackRegistered: boolean = false;
  private readonly tokenUpdateCallback: (token: string) => void = (token: string): void => {
    this.handleTokenUpdated(token);
  };
  private readonly backgroundMessageCallback: (payload: pushCommon.PushPayload) => void =
    (payload: pushCommon.PushPayload): void => {
      this.handleBackgroundMessage(payload);
    };

  async initialize(ability: UIAbility): Promise<NGFPushStatus> {
    if (this.initialized && this.ability === ability) {
      return this.copyStatus();
    }
    if (this.initialized) {
      this.destroy();
    }
    this.ability = ability;
    this.initialized = true;
    this.status.initialized = true;
    this.registerTokenUpdateListener(ability);
    this.registerBackgroundMessageListener(ability);
    this.emitStatus();
    const result = await this.refreshToken();
    return result.status;
  }

  destroy(): void {
    if (this.tokenCallbackRegistered) {
      try {
        pushService.off('tokenUpdate', this.tokenUpdateCallback);
      } catch (error) {
        const businessError = error as BusinessError;
        logger.warn(TAG, 'Push Token 更新监听注销失败: code=' + String(businessError.code) + ', message=' + businessError.message);
      }
    }
    this.ability = null;
    this.initialized = false;
    this.tokenCallbackRegistered = false;
    this.backgroundCallbackRegistered = false;
    this.status.initialized = false;
    this.status.tokenListenerRegistered = false;
    this.status.messageListenerRegistered = false;
    this.emitStatus();
  }

  async refreshToken(): Promise<NGFPushTokenResult> {
    try {
      const token = await pushService.getToken();
      if (token.length === 0) {
        this.pushToken = '';
        this.applyFailure(
          NGFPushFailureCategory.TOKEN_EMPTY,
          0,
          'Push Kit returned an empty Push Token.',
          'Verify Push Kit entitlement, application identity, and signing profile.'
        );
        return new NGFPushTokenResult(false, '', this.copyStatus());
      }
      this.handleTokenUpdated(token);
      logger.info(TAG, 'Push Token 获取成功，已更新本地 token 状态');
      return new NGFPushTokenResult(true, token, this.copyStatus());
    } catch (error) {
      const businessError = error as BusinessError;
      this.pushToken = '';
      this.status.tokenAvailable = false;
      this.applyBusinessError(businessError);
      logger.warn(TAG, 'Push Token 获取失败: code=' + String(businessError.code) + ', category=' + this.status.failureCategory);
      return new NGFPushTokenResult(false, '', this.copyStatus());
    }
  }

  async getToken(): Promise<string | null> {
    const result = await this.refreshToken();
    return result.ok ? result.token : null;
  }

  async deleteToken(): Promise<NGFPushStatus> {
    try {
      await pushService.deleteToken();
      this.pushToken = '';
      this.status.tokenAvailable = false;
      this.status.tokenUpdatedAt = Date.now();
      this.clearFailure();
      this.status.message = 'Push Token deleted.';
      this.emitStatus();
      logger.info(TAG, 'Push Token 已删除');
    } catch (error) {
      const businessError = error as BusinessError;
      this.applyBusinessError(businessError);
      logger.warn(TAG, 'Push Token 删除失败: code=' + String(businessError.code) + ', category=' + this.status.failureCategory);
    }
    return this.copyStatus();
  }

  currentToken(): string {
    return this.pushToken;
  }

  currentStatus(): NGFPushStatus {
    return this.copyStatus();
  }

  setStatusListener(listener: NGFPushStatusListener | null): void {
    this.statusListener = listener;
    if (listener !== null) {
      listener(this.copyStatus());
    }
  }

  onMessageReceived(callback: NGFPushMessageListener): void {
    this.messageListener = callback;
  }

  clearMessageListener(): void {
    this.messageListener = null;
  }

  dispatchMessage(message: NGFPushPayloadRecord): void {
    if (this.messageListener === null) {
      logger.warn(TAG, 'Push 消息已接收，但当前没有消息消费者');
      return;
    }
    try {
      this.messageListener(message);
    } catch (error) {
      const messageError = error as Error;
      logger.error(TAG, 'Push 消息回调执行失败: ' + messageError.message);
    }
  }

  private registerTokenUpdateListener(ability: UIAbility): void {
    try {
      pushService.on('tokenUpdate', ability, this.tokenUpdateCallback);
      this.tokenCallbackRegistered = true;
      this.status.tokenListenerRegistered = true;
    } catch (error) {
      const businessError = error as BusinessError;
      this.tokenCallbackRegistered = false;
      this.status.tokenListenerRegistered = false;
      this.applyFailure(
        NGFPushFailureCategory.LISTENER_REGISTRATION_FAILED,
        businessError.code,
        businessError.message,
        'Verify Push Kit availability and application identity.'
      );
    }
  }

  private registerBackgroundMessageListener(ability: UIAbility): void {
    try {
      pushService.receiveMessage('BACKGROUND', ability, this.backgroundMessageCallback);
      this.backgroundCallbackRegistered = true;
      this.status.messageListenerRegistered = true;
    } catch (error) {
      const businessError = error as BusinessError;
      this.backgroundCallbackRegistered = false;
      this.status.messageListenerRegistered = false;
      this.applyFailure(
        NGFPushFailureCategory.LISTENER_REGISTRATION_FAILED,
        businessError.code,
        businessError.message,
        'Ensure exactly one UIAbility declares action.ohos.push.listener.'
      );
    }
  }

  private handleTokenUpdated(token: string): void {
    if (token.length === 0) {
      return;
    }
    this.pushToken = token;
    this.status.tokenAvailable = true;
    this.status.tokenUpdatedAt = Date.now();
    this.clearFailure();
    this.status.message = 'Push Token is available.';
    this.emitStatus();
  }

  private handleBackgroundMessage(payload: pushCommon.PushPayload): void {
    const record = new NGFPushPayloadRecord(payload.type, payload.data, Date.now());
    this.status.lastPayloadType = record.type;
    this.status.lastMessageAt = record.receivedAt;
    this.emitStatus();
    this.dispatchMessage(record);
  }

  private applyBusinessError(error: BusinessError): void {
    const category = this.failureCategoryForCode(error.code);
    this.applyFailure(category, error.code, error.message, this.remediationForCategory(category));
  }

  private failureCategoryForCode(code: number): string {
    if (code === 401) {
      return NGFPushFailureCategory.PARAMETER_INVALID;
    }
    if (code === 1000900008) {
      return NGFPushFailureCategory.SERVICE_UNAVAILABLE;
    }
    if (code === 1000900010) {
      return NGFPushFailureCategory.APP_IDENTITY_INVALID;
    }
    if (code === 1000900011) {
      return NGFPushFailureCategory.NETWORK_UNAVAILABLE;
    }
    if (code === 1000900012) {
      return NGFPushFailureCategory.ENTITLEMENT_MISSING;
    }
    if (code === 1000900013) {
      return NGFPushFailureCategory.CROSS_LOCATION_NOT_ALLOWED;
    }
    if (code === 1000900014) {
      return NGFPushFailureCategory.DEVICE_UNSUPPORTED;
    }
    return NGFPushFailureCategory.INTERNAL_ERROR;
  }

  private remediationForCategory(category: string): string {
    if (category === NGFPushFailureCategory.ENTITLEMENT_MISSING) {
      return 'Enable Push Kit in AppGallery Connect and sign again with a profile containing the Push entitlement.';
    }
    if (category === NGFPushFailureCategory.APP_IDENTITY_INVALID) {
      return 'Verify bundle name, signing certificate, and AGC application identity.';
    }
    if (category === NGFPushFailureCategory.NETWORK_UNAVAILABLE) {
      return 'Check device network connectivity and retry.';
    }
    if (category === NGFPushFailureCategory.CROSS_LOCATION_NOT_ALLOWED) {
      return 'Verify the AGC data processing location and application service region.';
    }
    if (category === NGFPushFailureCategory.DEVICE_UNSUPPORTED) {
      return 'Use a standard HarmonyOS device that supports SystemCapability.Push.PushService.';
    }
    if (category === NGFPushFailureCategory.SERVICE_UNAVAILABLE) {
      return 'Check Push service availability and retry later.';
    }
    return 'Check Push Kit configuration, signing profile, and device logs.';
  }

  private applyFailure(category: string, code: number, message: string, remediation: string): void {
    this.status.failureCategory = category;
    this.status.errorCode = code;
    this.status.message = message;
    this.status.remediation = remediation;
    this.emitStatus();
  }

  private clearFailure(): void {
    this.status.failureCategory = '';
    this.status.errorCode = 0;
    this.status.remediation = '';
  }

  private copyStatus(): NGFPushStatus {
    const copy = new NGFPushStatus();
    copy.available = this.status.available;
    copy.initialized = this.status.initialized;
    copy.tokenAvailable = this.status.tokenAvailable;
    copy.tokenUpdatedAt = this.status.tokenUpdatedAt;
    copy.tokenListenerRegistered = this.status.tokenListenerRegistered;
    copy.messageListenerRegistered = this.status.messageListenerRegistered;
    copy.lastPayloadType = this.status.lastPayloadType;
    copy.lastMessageAt = this.status.lastMessageAt;
    copy.failureCategory = this.status.failureCategory;
    copy.errorCode = this.status.errorCode;
    copy.message = this.status.message;
    copy.remediation = this.status.remediation;
    return copy;
  }

  private emitStatus(): void {
    if (this.statusListener !== null) {
      this.statusListener(this.copyStatus());
    }
  }
}

export const ngfPushManagerFacade: IPushManager = new PushManagerFacade();
