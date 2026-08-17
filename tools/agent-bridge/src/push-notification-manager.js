'use strict';

const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const https = require('https');
const { URL } = require('url');
const { randomId, writeJsonFileAtomic } = require('./daemon-store');

const MAX_SUBSCRIPTIONS = 100;
const MAX_RESPONSE_BYTES = 512 * 1024;
const PUSH_TYPE_ALERT = '0';
const SUCCESS_CODES = new Set(['0', '80000000']);
const VALID_CATEGORIES = new Set([
  'IM',
  'VOIP',
  'SUBSCRIPTION',
  'TRAVEL',
  'HEALTH',
  'WORK',
  'ACCOUNT',
  'EXPRESS',
  'FINANCE',
  'DEVICE_REMINDER',
  'SYSTEM_REMINDER',
  'MAIL',
  'CUSTOMER_SERVICE',
  'MARKETING',
  'NEWS',
  'CONTENT_RECOMMENDATION',
  'SOCIAL_DYNAMICS',
  'PROMO'
]);

function nowIso() {
  return new Date().toISOString();
}

function readString(source, key, fallbackValue) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return fallbackValue;
  }
  const value = source[key];
  return typeof value === 'string' ? value : fallbackValue;
}

function readBoolean(source, key, fallbackValue) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return fallbackValue;
  }
  const value = source[key];
  return typeof value === 'boolean' ? value : fallbackValue;
}

function readNumber(source, key, fallbackValue) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return fallbackValue;
  }
  const value = source[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallbackValue;
}

function normalizeHostProfileId(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function hostProfileScope(payload, hostProfileId, explicitHostProfileId) {
  if (explicitHostProfileId) {
    return normalizeHostProfileId(hostProfileId);
  }
  return normalizeHostProfileId(readString(payload, 'hostProfileId', ''));
}

function readJsonFile(filePath, fallbackValue) {
  if (typeof filePath !== 'string' || filePath.length === 0 || !fs.existsSync(filePath)) {
    return fallbackValue;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_error) {
    return fallbackValue;
  }
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function tokenFingerprint(token) {
  return sha256(token).substring(0, 24);
}

function normalizeCategory(value) {
  const category = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return VALID_CATEGORIES.has(category) ? category : 'MARKETING';
}

function normalizeBaseUrl(value) {
  const source = typeof value === 'string' && value.length > 0
    ? value
    : 'https://push-api.cloud.huawei.com';
  return source.endsWith('/') ? source.substring(0, source.length - 1) : source;
}

function normalizeConfig(source) {
  const config = source && typeof source === 'object' && !Array.isArray(source) ? source : {};
  return {
    apiBaseUrl: normalizeBaseUrl(readString(config, 'apiBaseUrl', '')),
    serviceAccountPath: readString(config, 'serviceAccountPath', ''),
    bearerToken: readString(config, 'bearerToken', ''),
    projectId: readString(config, 'projectId', ''),
    category: normalizeCategory(readString(config, 'category', 'MARKETING')),
    testMessage: readBoolean(config, 'testMessage', false),
    requestTimeoutMs: Math.max(1000, Math.min(readNumber(config, 'requestTimeoutMs', 15000), 120000))
  };
}

function normalizeSubscription(source) {
  const item = source && typeof source === 'object' && !Array.isArray(source) ? source : {};
  const createdAt = readString(item, 'createdAt', nowIso());
  return {
    subscriptionId: readString(item, 'subscriptionId', randomId('pushsub')),
    token: readString(item, 'token', ''),
    tokenFingerprint: readString(item, 'tokenFingerprint', ''),
    hostProfileId: normalizeHostProfileId(readString(item, 'hostProfileId', '')),
    deviceId: readString(item, 'deviceId', ''),
    platform: readString(item, 'platform', 'harmonyos'),
    appVersion: readString(item, 'appVersion', ''),
    enabled: readBoolean(item, 'enabled', true),
    createdAt,
    updatedAt: readString(item, 'updatedAt', createdAt),
    lastAttemptAt: readString(item, 'lastAttemptAt', ''),
    lastSuccessAt: readString(item, 'lastSuccessAt', ''),
    lastFailureCategory: readString(item, 'lastFailureCategory', ''),
    lastError: readString(item, 'lastError', ''),
    deliveryCount: Math.max(0, Math.floor(readNumber(item, 'deliveryCount', 0)))
  };
}

function publicSubscription(source) {
  const item = normalizeSubscription(source);
  return {
    subscriptionId: item.subscriptionId,
    tokenFingerprint: item.tokenFingerprint,
    hostProfileId: item.hostProfileId,
    deviceId: item.deviceId,
    platform: item.platform,
    appVersion: item.appVersion,
    enabled: item.enabled,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    lastAttemptAt: item.lastAttemptAt,
    lastSuccessAt: item.lastSuccessAt,
    lastFailureCategory: item.lastFailureCategory,
    lastError: item.lastError,
    deliveryCount: item.deliveryCount
  };
}

function base64UrlJson(value) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function createPs256Jwt(serviceAccount, issuedAt, expiresAt) {
  const header = base64UrlJson({
    kid: serviceAccount.keyId,
    typ: 'JWT',
    alg: 'PS256'
  });
  const payload = base64UrlJson({
    iss: serviceAccount.subAccount,
    iat: issuedAt,
    exp: expiresAt,
    aud: serviceAccount.tokenUri
  });
  const signingInput = header + '.' + payload;
  const signature = crypto.sign('sha256', Buffer.from(signingInput, 'utf8'), {
    key: serviceAccount.privateKey,
    padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
    saltLength: 32
  });
  return signingInput + '.' + signature.toString('base64url');
}

function parseServiceAccount(source) {
  const account = source && typeof source === 'object' && !Array.isArray(source) ? source : {};
  return {
    projectId: readString(account, 'project_id', ''),
    keyId: readString(account, 'key_id', ''),
    privateKey: readString(account, 'private_key', ''),
    subAccount: readString(account, 'sub_account', ''),
    tokenUri: readString(account, 'token_uri', '')
  };
}

function serviceAccountValid(account) {
  return account.projectId.length > 0 &&
    account.keyId.length > 0 &&
    account.privateKey.includes('BEGIN PRIVATE KEY') &&
    account.subAccount.length > 0 &&
    account.tokenUri.length > 0;
}

function requestJson(urlText, headers, body, timeoutMs) {
  return new Promise((resolve, reject) => {
    const requestUrl = new URL(urlText);
    const transport = requestUrl.protocol === 'http:' ? http : https;
    const request = transport.request(requestUrl, {
      method: 'POST',
      headers
    }, (response) => {
      const chunks = [];
      let receivedBytes = 0;
      response.on('data', (chunk) => {
        receivedBytes += chunk.length;
        if (receivedBytes <= MAX_RESPONSE_BYTES) {
          chunks.push(chunk);
        }
      });
      response.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let parsed = {};
        if (text.length > 0) {
          try {
            parsed = JSON.parse(text);
          } catch (_error) {
            parsed = {};
          }
        }
        resolve({
          statusCode: typeof response.statusCode === 'number' ? response.statusCode : 0,
          text,
          parsed
        });
      });
    });
    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error('push_request_timeout'));
    });
    request.on('error', reject);
    request.write(body);
    request.end();
  });
}

function classifyDeliveryFailure(statusCode, code, message) {
  const normalized = String(code || '').toLowerCase();
  const text = String(message || '').toLowerCase();
  if (statusCode === 401 || statusCode === 403 || normalized === '80200001') {
    return 'auth_failed';
  }
  if (statusCode === 429 || text.includes('rate') || text.includes('frequency')) {
    return 'rate_limited';
  }
  if (text.includes('token') && (text.includes('invalid') || text.includes('expired'))) {
    return 'invalid_token';
  }
  if (statusCode >= 500 || statusCode === 0) {
    return 'api_unavailable';
  }
  return 'api_error';
}

function tapActionForNotification(notification) {
  if (notification.kind === 'permission' || notification.kind === 'question') {
    return 'agent_home.open_request';
  }
  if (notification.kind === 'plan') {
    return 'agent_home.open_plan';
  }
  if (notification.kind === 'terminal_attention') {
    return 'agent_home.open_terminal';
  }
  return 'agent_home.open_session';
}

function routePayloadForNotification(notification) {
  const route = notification.route && typeof notification.route === 'object' && !Array.isArray(notification.route)
    ? notification.route
    : {};
  const routeSessionId = readString(route, 'sessionId', '');
  const sessionId = routeSessionId.length > 0 ? routeSessionId : readString(notification, 'sessionId', '');
  const requestId = notification.kind === 'permission' || notification.kind === 'question'
    ? readString(route, 'requestId', '')
    : '';
  const planId = notification.kind === 'plan' ? readString(route, 'requestId', '') : '';
  const routeTerminalId = readString(route, 'terminalId', '');
  return {
    sessionId,
    requestId,
    planId,
    notificationId: readString(notification, 'notificationId', ''),
    messageId: readString(route, 'messageId', ''),
    terminalId: routeTerminalId.length > 0 ? routeTerminalId : readString(notification, 'terminalId', '')
  };
}

function stableNotifyId(notificationId) {
  const digest = crypto.createHash('sha256').update(notificationId).digest();
  const value = digest.readUInt32BE(0) & 0x7fffffff;
  return value > 0 ? value : 1;
}

function clampText(value, maxLength) {
  const text = typeof value === 'string' ? value : '';
  return text.length > maxLength ? text.substring(0, maxLength) : text;
}

function buildAlertRequest(notification, tokens, config) {
  const routePayload = routePayloadForNotification(notification);
  const clickData = {
    ngfNotificationTapAction: tapActionForNotification(notification),
    ngfNotificationTapPayloadJson: JSON.stringify(routePayload),
    ngfBridgeNotificationId: readString(notification, 'notificationId', '')
  };
  const result = {
    pushOptions: {
      testMessage: config.testMessage
    },
    payload: {
      notification: {
        category: config.category,
        title: clampText(readString(notification, 'title', 'Agent Bridge'), 128),
        body: clampText(readString(notification, 'body', ''), 1024),
        notifyId: stableNotifyId(readString(notification, 'notificationId', 'notification')),
        clickAction: {
          actionType: 0,
          data: clickData
        },
        badge: {
          addNum: 1
        }
      }
    },
    target: {
      token: tokens
    }
  };
  const ttlMs = readNumber(notification, 'ttlMs', 0);
  if (ttlMs > 0) {
    result.pushOptions.ttl = Math.max(1, Math.min(Math.ceil(ttlMs / 1000), 2592000));
  }
  return result;
}

class HuaweiPushClient {
  constructor(config, options) {
    this.config = normalizeConfig(config);
    this.request = options && typeof options.request === 'function' ? options.request : requestJson;
    this.cachedJwt = '';
    this.cachedJwtExpiresAt = 0;
    this.cachedServiceAccountPath = '';
    this.cachedServiceAccountMtimeMs = -1;
    this.cachedServiceAccount = null;
  }

  loadConfiguration() {
    if (this.config.bearerToken.length > 0 && this.config.projectId.length > 0) {
      return {
        configured: true,
        authMode: 'bearer',
        projectId: this.config.projectId,
        bearerToken: this.config.bearerToken,
        serviceAccount: null,
        failureCategory: '',
        message: 'Huawei Push delivery is configured.',
        remediation: ''
      };
    }
    if (this.config.serviceAccountPath.length === 0) {
      return {
        configured: false,
        authMode: 'none',
        projectId: this.config.projectId,
        bearerToken: '',
        serviceAccount: null,
        failureCategory: 'config_missing',
        message: 'Huawei Push service account is not configured.',
        remediation: 'Set AGENT_BRIDGE_HUAWEI_PUSH_SERVICE_ACCOUNT to a local service account JSON file.'
      };
    }
    if (!fs.existsSync(this.config.serviceAccountPath)) {
      return {
        configured: false,
        authMode: 'service_account',
        projectId: this.config.projectId,
        bearerToken: '',
        serviceAccount: null,
        failureCategory: 'service_account_missing',
        message: 'Huawei Push service account file was not found.',
        remediation: 'Verify AGENT_BRIDGE_HUAWEI_PUSH_SERVICE_ACCOUNT and file permissions.'
      };
    }
    let stats;
    try {
      stats = fs.statSync(this.config.serviceAccountPath);
    } catch (error) {
      return {
        configured: false,
        authMode: 'service_account',
        projectId: this.config.projectId,
        bearerToken: '',
        serviceAccount: null,
        failureCategory: 'service_account_unreadable',
        message: error instanceof Error ? error.message : String(error),
        remediation: 'Grant the Bridge process read access to the service account file.'
      };
    }
    if (
      this.cachedServiceAccount === null ||
      this.cachedServiceAccountPath !== this.config.serviceAccountPath ||
      this.cachedServiceAccountMtimeMs !== stats.mtimeMs
    ) {
      this.cachedServiceAccount = parseServiceAccount(readJsonFile(this.config.serviceAccountPath, {}));
      this.cachedServiceAccountPath = this.config.serviceAccountPath;
      this.cachedServiceAccountMtimeMs = stats.mtimeMs;
      this.cachedJwt = '';
      this.cachedJwtExpiresAt = 0;
    }
    if (!serviceAccountValid(this.cachedServiceAccount)) {
      return {
        configured: false,
        authMode: 'service_account',
        projectId: this.config.projectId,
        bearerToken: '',
        serviceAccount: null,
        failureCategory: 'service_account_invalid',
        message: 'Huawei Push service account JSON is missing required fields.',
        remediation: 'Use an AGC service account JSON containing project_id, key_id, private_key, sub_account, and token_uri.'
      };
    }
    return {
      configured: true,
      authMode: 'service_account',
      projectId: this.config.projectId.length > 0 ? this.config.projectId : this.cachedServiceAccount.projectId,
      bearerToken: '',
      serviceAccount: this.cachedServiceAccount,
      failureCategory: '',
      message: 'Huawei Push delivery is configured.',
      remediation: ''
    };
  }

  status() {
    const state = this.loadConfiguration();
    return {
      configured: state.configured,
      authMode: state.authMode,
      projectId: state.projectId,
      apiBaseUrl: this.config.apiBaseUrl,
      category: this.config.category,
      testMessage: this.config.testMessage,
      failureCategory: state.failureCategory,
      message: state.message,
      remediation: state.remediation
    };
  }

  bearerToken(configuration) {
    if (configuration.bearerToken.length > 0) {
      return configuration.bearerToken;
    }
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (this.cachedJwt.length > 0 && this.cachedJwtExpiresAt - nowSeconds > 10) {
      return this.cachedJwt;
    }
    const expiresAt = nowSeconds + 3600;
    this.cachedJwt = createPs256Jwt(configuration.serviceAccount, nowSeconds, expiresAt);
    this.cachedJwtExpiresAt = expiresAt;
    return this.cachedJwt;
  }

  async send(notification, tokens) {
    const configuration = this.loadConfiguration();
    if (!configuration.configured) {
      return {
        ok: false,
        attempted: false,
        deliveredCount: 0,
        failureCategory: configuration.failureCategory,
        message: configuration.message,
        remediation: configuration.remediation,
        requestId: '',
        responseCode: '',
        statusCode: 0
      };
    }
    if (!Array.isArray(tokens) || tokens.length === 0) {
      return {
        ok: false,
        attempted: false,
        deliveredCount: 0,
        failureCategory: 'no_subscriptions',
        message: 'No active Push Kit subscriptions are registered.',
        remediation: 'Open the App and register its Push Token with this Bridge.',
        requestId: '',
        responseCode: '',
        statusCode: 0
      };
    }
    let bearerToken;
    try {
      bearerToken = this.bearerToken(configuration);
    } catch (error) {
      return {
        ok: false,
        attempted: false,
        deliveredCount: 0,
        failureCategory: 'jwt_sign_failed',
        message: error instanceof Error ? error.message : String(error),
        remediation: 'Verify the AGC service account private key and key format.',
        requestId: '',
        responseCode: '',
        statusCode: 0
      };
    }
    const requestBody = JSON.stringify(buildAlertRequest(notification, tokens, this.config));
    const requestUrl = this.config.apiBaseUrl + '/v3/' + encodeURIComponent(configuration.projectId) + '/messages:send';
    try {
      const response = await this.request(requestUrl, {
        'Content-Type': 'application/json; charset=UTF-8',
        'Content-Length': Buffer.byteLength(requestBody),
        Authorization: 'Bearer ' + bearerToken,
        'push-type': PUSH_TYPE_ALERT
      }, requestBody, this.config.requestTimeoutMs);
      const responseCode = readString(response.parsed, 'code', '');
      const responseMessage = readString(response.parsed, 'msg', response.text || '');
      const requestId = readString(response.parsed, 'requestId', '');
      const statusOk = response.statusCode >= 200 && response.statusCode < 300;
      const codeOk = responseCode.length === 0 || SUCCESS_CODES.has(responseCode);
      if (statusOk && codeOk) {
        return {
          ok: true,
          attempted: true,
          deliveredCount: tokens.length,
          failureCategory: '',
          message: responseMessage.length > 0 ? responseMessage : 'Huawei Push notification accepted.',
          remediation: '',
          requestId,
          responseCode,
          statusCode: response.statusCode
        };
      }
      return {
        ok: false,
        attempted: true,
        deliveredCount: 0,
        failureCategory: classifyDeliveryFailure(response.statusCode, responseCode, responseMessage),
        message: responseMessage.length > 0 ? responseMessage : 'Huawei Push API rejected the notification.',
        remediation: 'Check Push Kit service entitlement, service account, category entitlement, rate limits, and token validity.',
        requestId,
        responseCode,
        statusCode: response.statusCode
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        ok: false,
        attempted: true,
        deliveredCount: 0,
        failureCategory: message === 'push_request_timeout' ? 'timeout' : 'network_error',
        message,
        remediation: 'Check network access and AGENT_BRIDGE_HUAWEI_PUSH_API_BASE_URL.',
        requestId: '',
        responseCode: '',
        statusCode: 0
      };
    }
  }
}

class PushNotificationManager {
  constructor(store, config, options) {
    this.store = store;
    this.filePath = store && store.paths ? store.paths.pushSubscriptions : '';
    this.client = options && options.client ? options.client : new HuaweiPushClient(config, options || {});
    this.deliveryQueue = Promise.resolve();
  }

  isAvailable() {
    return this.filePath.length > 0;
  }

  isConfigured() {
    return this.client.status().configured;
  }

  readAll() {
    const source = readJsonFile(this.filePath, []);
    if (!Array.isArray(source)) {
      return [];
    }
    return source.map(normalizeSubscription).filter((item) => item.token.length > 0 && item.tokenFingerprint.length > 0);
  }

  writeAll(items) {
    const normalized = Array.isArray(items)
      ? items.map(normalizeSubscription).filter((item) => item.token.length > 0 && item.tokenFingerprint.length > 0)
      : [];
    normalized.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    writeJsonFileAtomic(this.filePath, normalized.slice(0, MAX_SUBSCRIPTIONS));
    try {
      fs.chmodSync(this.filePath, 0o600);
    } catch (_error) {
      // Some Windows filesystems do not expose POSIX permission bits.
    }
    return normalized.slice(0, MAX_SUBSCRIPTIONS);
  }

  status(payload, hostProfileId) {
    const clientStatus = this.client.status();
    const includeDisabled = readBoolean(payload, 'includeDisabled', true);
    const deviceId = readString(payload, 'deviceId', '');
    const scope = hostProfileScope(payload, hostProfileId, arguments.length >= 2);
    let items = this.readAll().filter((item) => scope.length === 0 || item.hostProfileId === scope);
    if (!includeDisabled) {
      items = items.filter((item) => item.enabled);
    }
    if (deviceId.length > 0) {
      items = items.filter((item) => item.deviceId === deviceId);
    }
    return {
      ok: true,
      action: 'notification.push.status',
      available: this.isAvailable(),
      configured: clientStatus.configured,
      deliveryReady: clientStatus.configured && items.some((item) => item.enabled),
      authMode: clientStatus.authMode,
      projectId: clientStatus.projectId,
      apiBaseUrl: clientStatus.apiBaseUrl,
      category: clientStatus.category,
      testMessage: clientStatus.testMessage,
      subscriptions: items.map(publicSubscription),
      totalCount: items.length,
      activeCount: items.filter((item) => item.enabled).length,
      failureCategory: clientStatus.failureCategory,
      message: clientStatus.message,
      remediation: clientStatus.remediation,
      storePath: this.filePath
    };
  }

  register(payload, hostProfileId) {
    const scope = hostProfileScope(payload, hostProfileId, arguments.length >= 2);
    const token = readString(payload, 'token', '').trim();
    if (token.length < 8) {
      const result = this.status(payload, scope);
      result.ok = false;
      result.action = 'notification.push.register';
      result.failureCategory = 'token_invalid';
      result.message = 'Push Token is missing or too short.';
      result.remediation = 'Obtain a Push Token from Push Kit before registering.';
      return result;
    }
    const fingerprint = tokenFingerprint(token);
    const deviceId = readString(payload, 'deviceId', '');
    const items = this.readAll();
    let subscription = null;
    const updatedAt = nowIso();
    for (const item of items) {
      const sameScope = scope.length === 0 || item.hostProfileId === scope;
      if (sameScope && (item.tokenFingerprint === fingerprint || (deviceId.length > 0 && item.deviceId === deviceId))) {
        item.token = token;
        item.tokenFingerprint = fingerprint;
        item.hostProfileId = scope.length > 0 ? scope : item.hostProfileId;
        item.deviceId = deviceId.length > 0 ? deviceId : item.deviceId;
        item.platform = readString(payload, 'platform', item.platform || 'harmonyos');
        item.appVersion = readString(payload, 'appVersion', item.appVersion);
        item.enabled = readBoolean(payload, 'enabled', true);
        item.updatedAt = updatedAt;
        item.lastFailureCategory = '';
        item.lastError = '';
        subscription = item;
        break;
      }
    }
    if (subscription === null) {
      subscription = normalizeSubscription({
        subscriptionId: randomId('pushsub'),
        token,
        tokenFingerprint: fingerprint,
        hostProfileId: scope,
        deviceId,
        platform: readString(payload, 'platform', 'harmonyos'),
        appVersion: readString(payload, 'appVersion', ''),
        enabled: readBoolean(payload, 'enabled', true),
        createdAt: updatedAt,
        updatedAt
      });
      items.unshift(subscription);
    }
    this.writeAll(items);
    const result = this.status({ includeDisabled: true }, scope);
    result.action = 'notification.push.register';
    result.subscription = publicSubscription(subscription);
    result.failureCategory = result.configured ? '' : result.failureCategory;
    result.message = result.configured
      ? 'Push Kit subscription registered.'
      : 'Push Kit subscription registered, but Bridge delivery is not configured.';
    return result;
  }

  unregister(payload, hostProfileId) {
    const scope = hostProfileScope(payload, hostProfileId, arguments.length >= 2);
    const subscriptionId = readString(payload, 'subscriptionId', '');
    const deviceId = readString(payload, 'deviceId', '');
    const fingerprint = readString(payload, 'tokenFingerprint', '');
    const items = this.readAll();
    const kept = [];
    let removed = null;
    for (const item of items) {
      const sameScope = scope.length === 0 || item.hostProfileId === scope;
      const matches = sameScope && (
        (subscriptionId.length > 0 && item.subscriptionId === subscriptionId) ||
        (deviceId.length > 0 && item.deviceId === deviceId) ||
        (fingerprint.length > 0 && item.tokenFingerprint === fingerprint)
      );
      if (matches && removed === null) {
        removed = item;
      } else {
        kept.push(item);
      }
    }
    this.writeAll(kept);
    const result = this.status({ includeDisabled: true }, scope);
    result.ok = removed !== null;
    result.action = 'notification.push.unregister';
    result.subscription = null;
    result.removedSubscriptionId = removed === null ? '' : removed.subscriptionId;
    result.removedTokenFingerprint = removed === null ? '' : removed.tokenFingerprint;
    result.failureCategory = removed === null ? 'not_found' : '';
    result.message = removed === null ? 'Push Kit subscription was not found.' : 'Push Kit subscription removed.';
    result.remediation = removed === null ? 'Refresh Push Kit status and retry with a current subscription id.' : '';
    return result;
  }

  hasActiveSubscriptions(hostProfileId) {
    const scope = normalizeHostProfileId(hostProfileId);
    return this.readAll().some((item) => item.enabled && (scope.length === 0 || item.hostProfileId === scope));
  }

  enqueue(notification) {
    const operation = this.deliveryQueue.then(() => this.deliver(notification));
    this.deliveryQueue = operation.catch(() => undefined);
    return operation;
  }

  async deliver(notification) {
    const scope = normalizeHostProfileId(readString(notification, 'hostProfileId', ''));
    const items = this.readAll();
    const active = items.filter((item) => item.enabled && item.token.length > 0 && (scope.length === 0 || item.hostProfileId === scope));
    const attemptedAt = nowIso();
    const delivery = await this.client.send(notification, active.map((item) => item.token));
    for (const item of items) {
      if (!item.enabled || item.token.length === 0 || (scope.length > 0 && item.hostProfileId !== scope)) {
        continue;
      }
      item.lastAttemptAt = attemptedAt;
      item.updatedAt = attemptedAt;
      if (delivery.ok) {
        item.lastSuccessAt = attemptedAt;
        item.lastFailureCategory = '';
        item.lastError = '';
        item.deliveryCount += 1;
      } else {
        item.lastFailureCategory = delivery.failureCategory;
        item.lastError = delivery.message;
      }
    }
    if (active.length > 0) {
      this.writeAll(items);
    }
    const status = this.status({ includeDisabled: true }, scope);
    status.action = 'notification.push.deliver';
    status.ok = delivery.ok;
    status.notificationId = readString(notification, 'notificationId', '');
    status.delivery = delivery;
    status.failureCategory = delivery.failureCategory;
    status.message = delivery.message;
    status.remediation = delivery.remediation;
    return status;
  }
}

module.exports = {
  HuaweiPushClient,
  PushNotificationManager,
  buildAlertRequest,
  createPs256Jwt,
  publicSubscription,
  tokenFingerprint
};
