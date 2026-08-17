import { logger } from '../../utils/Logger';
import { securityToolkit } from '../../utils/SecurityToolkit';
import { ngfKeyStoreManagerFacade } from '../../security';

const TAG: string = 'NGFEncryptedSettingsStoreFacade';

export class NGFEncryptedSettingsStoreStatus {
  readonly ready: boolean;
  readonly storage: string;
  readonly failureCategory: string;

  constructor(ready: boolean, storage: string, failureCategory: string) {
    this.ready = ready;
    this.storage = storage;
    this.failureCategory = failureCategory;
  }
}

/**
 * 透明加密 Preferences 门面
 * 值在存储前自动加密，读取后自动解密。
 * 主密钥由 AssetStoreKit 托管；旧版本 AppStorage 密钥仅在首次启动时迁移。
 */
class EncryptedSettingsStoreFacade {
  private static instance: EncryptedSettingsStoreFacade | null = null;
  private masterKeyBase64: string = '';
  private storage: string = '';
  private initializationFailure: string = '';
  private readonly initialization: Promise<void>;
  private readonly cache: Map<string, string> = new Map<string, string>();

  // 仅用于迁移旧版本；新密钥只写入 AssetStoreKit。
  private static readonly MASTER_KEY_STORAGE: string = 'ngf_encrypted_master_key';
  private static readonly MASTER_KEY_ALIAS: string = 'ngf.encrypted.settings.master.v1';

  private constructor() {
    this.initialization = this.initializeMasterKey();
  }

  private async initializeMasterKey(): Promise<void> {
    try {
      const secureKey = await ngfKeyStoreManagerFacade.querySecret(
        EncryptedSettingsStoreFacade.MASTER_KEY_ALIAS
      );
      if (secureKey !== null && secureKey.length > 0) {
        this.masterKeyBase64 = secureKey;
        this.storage = 'asset_store';
        this.clearLegacyMasterKey();
        return;
      }

      const legacyKey = AppStorage.get<string>(EncryptedSettingsStoreFacade.MASTER_KEY_STORAGE);
      if (legacyKey !== undefined && legacyKey !== null && legacyKey.length > 0) {
        const migrated = await ngfKeyStoreManagerFacade.addSecret(
          EncryptedSettingsStoreFacade.MASTER_KEY_ALIAS,
          legacyKey
        );
        if (migrated) {
          this.masterKeyBase64 = legacyKey;
          this.storage = 'asset_store';
          this.clearLegacyMasterKey();
          logger.info(TAG, '旧加密主密钥已迁移到安全存储');
          return;
        }
        this.markUnavailable();
        return;
      }

      const generated = securityToolkit.generateRandomBase64(16);
      if (generated.length === 0) {
        this.markUnavailable();
        return;
      }
      const stored = await ngfKeyStoreManagerFacade.addSecret(
        EncryptedSettingsStoreFacade.MASTER_KEY_ALIAS,
        generated
      );
      if (!stored) {
        this.markUnavailable();
        return;
      }
      this.masterKeyBase64 = generated;
      this.storage = 'asset_store';
      logger.info(TAG, '新的加密主密钥已写入安全存储');
    } catch (error) {
      this.markUnavailable();
    }
  }

  private clearLegacyMasterKey(): void {
    AppStorage.setOrCreate<string>(EncryptedSettingsStoreFacade.MASTER_KEY_STORAGE, '');
  }

  private markUnavailable(): void {
    this.masterKeyBase64 = '';
    this.storage = '';
    this.initializationFailure = 'secure_storage_unavailable';
    logger.warn(TAG, '加密设置不可用：安全存储不可用');
  }

  private async ensureReady(): Promise<boolean> {
    await this.initialization;
    if (this.masterKeyBase64.length > 0) {
      return true;
    }
    return false;
  }

  static getInstance(): EncryptedSettingsStoreFacade {
    if (!EncryptedSettingsStoreFacade.instance) {
      EncryptedSettingsStoreFacade.instance = new EncryptedSettingsStoreFacade();
    }
    return EncryptedSettingsStoreFacade.instance;
  }

  async getStatus(): Promise<NGFEncryptedSettingsStoreStatus> {
    const ready = await this.ensureReady();
    return new NGFEncryptedSettingsStoreStatus(ready, this.storage, this.initializationFailure);
  }

  async getString(key: string, defaultValue: string = ''): Promise<string> {
    const cached = this.cache.get(key);
    if (cached !== undefined) {
      return cached;
    }
    if (!(await this.ensureReady())) {
      return defaultValue;
    }
    const raw = AppStorage.get<string>('enc_' + key);
    if (raw === undefined || raw === null || raw.length === 0) {
      return defaultValue;
    }
    try {
      const decrypted = await securityToolkit.aesDecrypt(raw, this.masterKeyBase64, '');
      if (decrypted.success) {
        this.cache.set(key, decrypted.data);
        return decrypted.data;
      }
      logger.warn(TAG, '解密失败，返回默认值: key=' + key);
      return defaultValue;
    } catch (e) {
      logger.warn(TAG, 'getString 异常: key=' + key + ', err=' + e);
      return defaultValue;
    }
  }

  async setString(key: string, value: string): Promise<void> {
    if (!(await this.ensureReady())) {
      logger.warn(TAG, '安全存储不可用，跳过加密写入: key=' + key);
      return;
    }
    try {
      const encrypted = await securityToolkit.aesEncrypt(value, this.masterKeyBase64, '');
      if (encrypted.success) {
        AppStorage.setOrCreate<string>('enc_' + key, encrypted.data);
        this.cache.set(key, value);
        logger.debug(TAG, '加密写入: key=' + key);
      } else {
        logger.error(TAG, '加密失败，跳过写入: key=' + key);
      }
    } catch (e) {
      logger.error(TAG, 'setString 异常: key=' + key + ', err=' + e);
    }
  }

  async getNumber(key: string, defaultValue: number = 0): Promise<number> {
    const str = await this.getString(key, '');
    if (str.length === 0) {
      return defaultValue;
    }
    const parsed = parseFloat(str);
    return isNaN(parsed) ? defaultValue : parsed;
  }

  async setNumber(key: string, value: number): Promise<void> {
    await this.setString(key, String(value));
  }

  async getBoolean(key: string, defaultValue: boolean = false): Promise<boolean> {
    const str = await this.getString(key, '');
    if (str.length === 0) {
      return defaultValue;
    }
    return str === 'true';
  }

  async setBoolean(key: string, value: boolean): Promise<void> {
    await this.setString(key, value ? 'true' : 'false');
  }

  async remove(key: string): Promise<void> {
    AppStorage.setOrCreate<string>('enc_' + key, '');
    this.cache.delete(key);
    logger.debug(TAG, '删除加密键: key=' + key);
  }

  async clear(): Promise<void> {
    this.cache.clear();
    logger.info(TAG, '清空加密设置缓存（AppStorage 项需逐个删除）');
  }

  async contains(key: string): Promise<boolean> {
    if (!(await this.ensureReady())) {
      return false;
    }
    const raw = AppStorage.get<string>('enc_' + key);
    return raw !== undefined && raw !== null && raw.length > 0;
  }
}

export const ngfEncryptedSettingsStore: EncryptedSettingsStoreFacade = EncryptedSettingsStoreFacade.getInstance();
