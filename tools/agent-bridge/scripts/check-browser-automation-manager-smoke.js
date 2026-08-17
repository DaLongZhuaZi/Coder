'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  BrowserAutomationManager,
  domainAllowed,
  normalizeDomainRule,
  normalizeHttpUrl,
  normalizeHostMetadataValue,
  normalizeSupportedPlatforms,
  normalizeCapabilityWarnings,
  sanitizeScreenshotHostResult,
  MAX_BROWSER_ACTION_TEXT_BYTES,
  validateBrowserActionPayload
} = require('../src/browser-automation-manager');
const {
  createBrowserPlatformHostAdapter: createPlatformAdapter,
  isPlatformHostRegistration,
  validateBrowserPlatformHost
} = require('../src/browser-platform-host');

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ngf-browser-manager-'));
  const workspacePath = path.join(root, 'workspace');
  fs.mkdirSync(workspacePath, { recursive: true });
  const uploadPath = path.join(workspacePath, 'upload.txt');
  fs.writeFileSync(uploadPath, 'upload', 'utf8');
  const workspaceRegistry = {
    findWorkspaceById(workspaceId) {
      return workspaceId === 'wks-browser' ? { workspaceId, cwd: workspacePath, archivedAt: '' } : null;
    }
  };
  const agentManager = {
    find(agentId) {
      return agentId === 'agent-browser' ? { id: agentId, workspaceId: 'wks-browser', archivedAt: '' } : null;
    }
  };
  const events = [];
  let persistedState = { version: 1, permissions: [] };
  const store = {
    readBrowserAutomationState() { return persistedState; },
    writeBrowserAutomationState(value) { persistedState = value; return value; }
  };
  let now = Date.parse('2026-07-16T00:00:00.000Z');
  const manager = new BrowserAutomationManager({
    workspaceRegistry,
    agentManager,
    store,
    broadcast: (event) => events.push(event),
    now: () => now,
    commandTimeoutMs: 100
  });
  let lastEnvelope = null;
  let nextEnvelopeResolve = null;
  let autoSnapshot = false;
  let snapshotText = 'button "Continue" [ref=@e1]';
  const connection = {
    connectionId: 'conn-browser',
    sendJson(value) {
      lastEnvelope = value;
      const isSnapshotCommand = autoSnapshot && value && value.payload && value.payload.command === 'page.snapshot';
      if (nextEnvelopeResolve && !isSnapshotCommand) {
        const resolve = nextEnvelopeResolve;
        nextEnvelopeResolve = null;
        resolve(value);
      }
      if (isSnapshotCommand) {
        manager.handleHostResult({
          commandId: value.payload.commandId,
          ok: true,
          result: { snapshot: { text: snapshotText, nodeCount: 1, truncated: false } }
        }, this);
      }
    }
  };
  const otherConnection = { connectionId: 'conn-other', sendJson() {} };
  try {
    assert.strictEqual(normalizeDomainRule('*.Example.COM'), '*.example.com');
    assert.strictEqual(normalizeDomainRule('https://example.com'), '');
    assert.strictEqual(domainAllowed('docs.example.com', new Set(['*.example.com'])), true);
    assert.strictEqual(domainAllowed('example.com', new Set(['*.example.com'])), false);
    assert.strictEqual(normalizeHttpUrl('javascript:alert(1)'), null);
    const missingRef = validateBrowserActionPayload({ action: 'click' });
    assert.strictEqual(missingRef.failureCategory, 'browser_action_ref_invalid');
    const emptyScript = validateBrowserActionPayload({ action: 'evaluate', functionSource: '  ' });
    assert.strictEqual(emptyScript.failureCategory, 'browser_script_empty');
    const oversizedInput = validateBrowserActionPayload({ action: 'type', text: 'x'.repeat(MAX_BROWSER_ACTION_TEXT_BYTES + 1) });
    assert.strictEqual(oversizedInput.failureCategory, 'browser_action_input_too_large');
    const invalidKey = validateBrowserActionPayload({ action: 'keypress', key: 'Enter\u0000' });
    assert.strictEqual(invalidKey.failureCategory, 'browser_action_key_invalid');
    const invalidScope = validateBrowserActionPayload({ action: 'click', ref: '@e1', hostId: 'host\ninvalid' });
    assert.strictEqual(invalidScope.failureCategory, 'browser_action_scope_invalid');
    const invalidScroll = validateBrowserActionPayload({ action: 'scroll', deltaY: 'not-a-number' });
    assert.strictEqual(invalidScroll.failureCategory, 'browser_action_scroll_invalid');
    const invalidDrag = validateBrowserActionPayload({ action: 'drag', sourceRef: '@e1' });
    assert.strictEqual(invalidDrag.failureCategory, 'browser_action_target_invalid');
    const validEvaluate = validateBrowserActionPayload({ action: 'evaluate', functionSource: '() => document.title' });
    assert.strictEqual(validEvaluate.ok, true);
    assert.strictEqual(validEvaluate.payload.function, '() => document.title');
    const projectedAction = validateBrowserActionPayload({
      workspaceId: 'wks-browser',
      agentId: 'agent-browser',
      hostId: 'host-browser',
      instanceId: 'instance-browser',
      pageId: 'page-browser',
      action: 'click',
      ref: '@e1',
      url: 'https://user:password@example.invalid/private',
      headers: { authorization: 'Bearer secret' },
      cwd: 'C:\\Users\\coder\\private',
      functionSource: '() => secret'
    });
    assert.strictEqual(projectedAction.ok, true);
    assert.deepStrictEqual(Object.keys(projectedAction.payload).sort(), [
      'action', 'agentId', 'hostId', 'instanceId', 'pageId', 'ref', 'workspaceId'
    ]);
    const invalidSteps = validateBrowserActionPayload({ action: 'drag', sourceRef: '@e1', targetRef: '@e2', steps: 1.5 });
    assert.strictEqual(invalidSteps.failureCategory, 'browser_action_steps_invalid');

    const missingCapabilities = manager.registerHost({ workspaceIds: ['wks-browser'] }, connection);
    assert.strictEqual(missingCapabilities.failureCategory, 'browser_host_capabilities_invalid');
    const registered = manager.registerHost({
      hostId: 'host-browser',
      label: 'Browser host',
      platform: 'test',
      workspaceIds: ['wks-browser'],
      supportedCommands: ['instance.list', 'page.list', 'page.create', 'page.close', 'page.navigate', 'page.snapshot', 'page.screenshot', 'page.logs', 'page.action', 'download.list'],
      supportedActions: ['click', 'upload', 'download']
    }, connection);
    assert.strictEqual(registered.ok, true);
    assert.strictEqual(registered.host.hostKind, 'external');
    assert.strictEqual(registered.host.capabilitySource, 'declared');
    assert.strictEqual(registered.host.readiness, 'ready');
    assert.deepStrictEqual(registered.host.supportedPlatforms, ['test']);
    assert.strictEqual(registered.host.actionCapabilitiesExplicit, true);
    assert.strictEqual(registered.host.platformHost, false);
    assert.deepStrictEqual(registered.host.supportedActions.sort(), ['click', 'download', 'upload']);
    assert.strictEqual(manager.listHosts({ workspaceId: 'wks-browser' }).totalCount, 1);
    assert.strictEqual(manager.registerHost({ hostId: 'host-browser', workspaceIds: ['wks-browser'], supportedCommands: ['page.list'] }, otherConnection).failureCategory, 'browser_host_id_conflict');
    assert.strictEqual(normalizeHostMetadataValue('HarmonyOS', ['harmonyos'], ''), 'harmonyos');
    assert.deepStrictEqual(normalizeSupportedPlatforms(['HarmonyOS', 'harmonyos', '../escape'], 'test'), ['harmonyos']);
    const sanitizedWarnings = normalizeCapabilityWarnings([
      'native host needs an update',
      'debug https://user:password@example.invalid/private?token=secret C:\\Users\\coder\\secret.txt token=abc123',
      'Bearer super-secret-value',
      'transport wss://user:password@example.invalid/private?token=secret file:///C:/Users/coder/private/key.pem ssh://git:secret@example.invalid/repo'
    ]);
    assert.strictEqual(sanitizedWarnings[0], 'native host needs an update');
    assert.strictEqual(sanitizedWarnings[1].includes('https://'), false);
    assert.strictEqual(sanitizedWarnings[1].includes('C:\\Users'), false);
    assert.strictEqual(sanitizedWarnings[1].includes('abc123'), false);
    assert.strictEqual(sanitizedWarnings[2], 'Bearer [redacted]');
    assert.strictEqual(sanitizedWarnings[3].includes('wss://'), false);
    assert.strictEqual(sanitizedWarnings[3].includes('file://'), false);
    assert.strictEqual(sanitizedWarnings[3].includes('ssh://'), false);
    assert.strictEqual(sanitizedWarnings[3].includes('secret@example.invalid'), false);
    const unverifiedPlatformHost = manager.registerHost({
      hostId: 'host-harmony-unverified',
      hostKind: 'harmonyos',
      capabilitySource: 'declared',
      workspaceIds: ['wks-browser'],
      supportedCommands: ['page.list']
    }, connection);
    assert.strictEqual(unverifiedPlatformHost.failureCategory, 'browser_host_capability_unverified');
    assert.strictEqual(isPlatformHostRegistration({ hostKind: 'harmonyos', capabilitySource: 'platform' }), true);
    assert.strictEqual(isPlatformHostRegistration({ hostKind: 'external', capabilitySource: 'declared' }), false);
    assert.strictEqual(validateBrowserPlatformHost(createPlatformAdapter(), { hostKind: 'harmonyos', capabilitySource: 'platform' }).failureCategory, 'browser_platform_host_unavailable');
    const throwingPlatformAdapter = createPlatformAdapter({
      isAvailable: () => { throw new Error('adapter probe failed'); }
    });
    assert.strictEqual(
      validateBrowserPlatformHost(throwingPlatformAdapter, { hostKind: 'harmonyos', capabilitySource: 'platform' }).failureCategory,
      'browser_platform_host_unavailable'
    );
    const platformManager = new BrowserAutomationManager({
      workspaceRegistry,
      agentManager,
      platformHostAdapter: createPlatformAdapter({
        isAvailable: () => true,
        validateRegistration: (descriptor) => descriptor.hostKind === 'harmonyos' && descriptor.capabilitySource === 'platform' ? { ok: true } : { ok: false }
      })
    });
    const platformActionWithoutCapabilities = platformManager.registerHost({
      hostId: 'host-harmony-platform-action-missing',
      hostKind: 'harmonyos',
      capabilitySource: 'platform',
      workspaceIds: ['wks-browser'],
      supportedCommands: ['page.action']
    }, connection);
    assert.strictEqual(platformActionWithoutCapabilities.failureCategory, 'browser_host_action_capabilities_required');
    const platformHost = platformManager.registerHost({
      hostId: 'host-harmony-platform',
      hostKind: 'harmonyos',
      capabilitySource: 'platform',
      workspaceIds: ['wks-browser'],
      supportedCommands: ['page.list']
    }, connection);
    assert.strictEqual(platformHost.ok, true);
    assert.strictEqual(platformHost.host.platformHost, true);
    const platformActionHost = platformManager.registerHost({
      hostId: 'host-harmony-platform-action',
      hostKind: 'harmonyos',
      capabilitySource: 'platform',
      workspaceIds: ['wks-browser'],
      supportedCommands: ['page.action'],
      supportedActions: ['click']
    }, connection);
    assert.strictEqual(platformActionHost.ok, true);
    assert.strictEqual(platformActionHost.host.actionCapabilitiesExplicit, true);
    assert.deepStrictEqual(platformActionHost.host.supportedActions, ['click']);
    const platformTargetSnapshotRequired = await platformManager.action({
      workspaceId: 'wks-browser',
      agentId: 'agent-browser',
      pageId: 'page-1',
      hostId: 'host-harmony-platform-action',
      action: 'click',
      ref: '@e1'
    });
    assert.strictEqual(platformTargetSnapshotRequired.failureCategory, 'browser_target_snapshot_required');
    const degradedHost = manager.registerHost({
      hostId: 'host-degraded',
      hostKind: 'electron',
      capabilitySource: 'native',
      readiness: 'degraded',
      capabilityWarnings: ['native host needs an update'],
      workspaceIds: ['wks-browser'],
      supportedCommands: ['page.list']
    }, connection);
    assert.strictEqual(degradedHost.ok, true);
    assert.strictEqual(degradedHost.host.readiness, 'degraded');
    assert.strictEqual(
      (await manager.execute('browser.page.list', { workspaceId: 'wks-browser', hostId: 'host-degraded' })).failureCategory,
      'browser_host_not_ready'
    );
    assert.strictEqual(manager.unregisterHost({ hostId: 'host-degraded' }, connection).ok, true);
    const degradedActionHost = manager.registerHost({
      hostId: 'host-degraded-action',
      readiness: 'degraded',
      workspaceIds: ['wks-browser'],
      supportedCommands: ['page.action'],
      supportedActions: ['click']
    }, connection);
    assert.strictEqual(degradedActionHost.ok, true);
    const degradedActionPreview = await manager.action({ workspaceId: 'wks-browser', agentId: 'agent-browser', pageId: 'page-1', action: 'click', ref: '@e1', hostId: 'host-degraded-action' });
    assert.strictEqual(degradedActionPreview.failureCategory, 'browser_host_not_ready');
    assert.strictEqual(manager.unregisterHost({ hostId: 'host-degraded-action' }, connection).ok, true);

    const blocked = await manager.execute('browser.page.create', { workspaceId: 'wks-browser', agentId: 'agent-browser', url: 'https://example.com' });
    assert.strictEqual(blocked.failureCategory, 'browser_domain_not_allowed');
    const permissionPreview = manager.permissionSet({ workspaceId: 'wks-browser', domains: ['example.com', '*.example.org'] });
    assert.strictEqual(permissionPreview.preview, true);
    assert.strictEqual(permissionPreview.permission.workspaceId, 'wks-browser');
    assert.strictEqual(permissionPreview.permission.downloadDirectoryConfigured, true);
    const permissionConfirmed = manager.permissionSet({ workspaceId: 'wks-browser', domains: ['example.com', '*.example.org'], planId: permissionPreview.planId, confirm: true });
    assert.strictEqual(permissionConfirmed.confirmed, true);
    assert.deepStrictEqual(permissionConfirmed.permission.domains, ['example.com', '*.example.org']);
    const restoredManager = new BrowserAutomationManager({ workspaceRegistry, agentManager, store });
    const permissionStatus = restoredManager.permissionGet({ workspaceId: 'wks-browser' });
    assert.strictEqual(permissionStatus.domains[0], 'example.com');
    assert.strictEqual(permissionStatus.permission.downloadDirectoryConfigured, true);
    assert.strictEqual(typeof permissionStatus.permission.downloadDirectory, 'undefined');
    assert.strictEqual(permissionStatus.downloadDirectory, '.agent-bridge-downloads');
    assert.strictEqual(permissionStatus.downloadDirectory.includes(workspacePath), false);

    const createPromise = manager.execute('browser.page.create', {
      workspaceId: 'wks-browser',
      agentId: 'agent-browser',
      url: 'https://example.com/start'
    });
    assert(lastEnvelope && lastEnvelope.type === 'browser.host.command');
    assert.strictEqual(lastEnvelope.payload.command, 'page.create');
    assert.strictEqual(lastEnvelope.payload.payload.url, 'https://example.com/start');
    const accepted = manager.handleHostResult({
      commandId: lastEnvelope.payload.commandId,
      ok: true,
      result: { page: { pageId: 'page-1', url: 'https://example.com/start' } }
    }, connection);
    assert.strictEqual(accepted.accepted, true);
    const created = await createPromise;
    assert.strictEqual(created.page.pageId, 'page-1');

    const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const pngBase64 = pngBytes.toString('base64');
    const sanitizedScreenshot = sanitizeScreenshotHostResult({ screenshot: { mimeType: 'IMAGE/PNG', dataBase64: pngBase64, fullPage: false, bytes: 999999 } });
    assert.strictEqual(sanitizedScreenshot.ok, true);
    assert.strictEqual(sanitizedScreenshot.result.screenshot.mimeType, 'image/png');
    assert.strictEqual(sanitizedScreenshot.result.screenshot.bytes, pngBytes.length);
    const jpegBytes = Buffer.from([0xff, 0xd8, 0xff]);
    const webpBytes = Buffer.from('RIFF0000WEBP', 'ascii');
    assert.strictEqual(sanitizeScreenshotHostResult({ screenshot: { mimeType: 'image/jpeg', dataBase64: jpegBytes.toString('base64') } }).ok, true);
    assert.strictEqual(sanitizeScreenshotHostResult({ screenshot: { mimeType: 'image/webp', dataBase64: webpBytes.toString('base64') } }).ok, true);
    assert.strictEqual(sanitizeScreenshotHostResult({ screenshot: { mimeType: 'image/svg+xml', dataBase64: pngBase64 } }).failureCategory, 'browser_screenshot_invalid');
    assert.strictEqual(sanitizeScreenshotHostResult({ screenshot: { mimeType: 'image/png', dataBase64: 'not-base64' } }).failureCategory, 'browser_screenshot_invalid');
    assert.strictEqual(sanitizeScreenshotHostResult({ screenshot: { mimeType: 'image/png', dataBase64: Buffer.from('fake-png', 'utf8').toString('base64') } }).failureCategory, 'browser_screenshot_invalid');
    assert.strictEqual(sanitizeScreenshotHostResult({ screenshot: { mimeType: 'image/jpeg', dataBase64: pngBase64 } }).failureCategory, 'browser_screenshot_invalid');
    const screenshotPromise = manager.execute('browser.page.screenshot', { workspaceId: 'wks-browser', agentId: 'agent-browser', pageId: 'page-1' });
    const screenshotEnvelope = lastEnvelope;
    manager.handleHostResult({ commandId: screenshotEnvelope.payload.commandId, ok: true, result: { screenshot: { mimeType: 'image/png', dataBase64: pngBase64, fullPage: false } } }, connection);
    const screenshot = await screenshotPromise;
    assert.strictEqual(screenshot.screenshot.mimeType, 'image/png');
    assert.strictEqual(screenshot.screenshot.bytes, pngBytes.length);

    const spoofedResultPromise = manager.execute('browser.page.create', {
      workspaceId: 'wks-browser',
      agentId: 'agent-browser',
      url: 'https://example.com/second'
    });
    const spoofedEnvelope = lastEnvelope;
    const spoofedResult = JSON.parse('{"page":{"pageId":"page-2"},"ok":false,"commandId":"spoofed-command","hostId":"spoofed-host","updatedAt":"spoofed-time","failureCategory":"spoofed_failure","message":"spoofed message","remediation":"spoofed remediation","warnings":["spoofed warning"],"__proto__":{"polluted":true}}');
    const spoofedAccepted = manager.handleHostResult({
      commandId: spoofedEnvelope.payload.commandId,
      ok: true,
      result: spoofedResult
    }, connection);
    assert.strictEqual(spoofedAccepted.accepted, true);
    const spoofedResolved = await spoofedResultPromise;
    assert.strictEqual(spoofedResolved.ok, true);
    assert.strictEqual(spoofedResolved.commandId, spoofedEnvelope.payload.commandId);
    assert.strictEqual(spoofedResolved.hostId, 'host-browser');
    assert.notStrictEqual(spoofedResolved.updatedAt, 'spoofed-time');
    assert.strictEqual(Object.prototype.hasOwnProperty.call(spoofedResolved, 'failureCategory'), false);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(spoofedResolved, '__proto__'), false);
    assert.strictEqual(Object.prototype.polluted, undefined);
    assert.strictEqual(manager.handleHostResult({ commandId: spoofedEnvelope.payload.commandId, ok: true, result: {} }, connection).failureCategory, 'browser_command_not_found');

    const closePreview = await manager.execute('browser.page.close', { workspaceId: 'wks-browser', pageId: 'page-1' });
    assert.strictEqual(closePreview.preview, true);
    const closePromise = manager.execute('browser.page.close', { workspaceId: 'wks-browser', pageId: 'page-1', planId: closePreview.planId, confirm: true });
    const closeEnvelope = lastEnvelope;
    manager.handleHostResult({ commandId: closeEnvelope.payload.commandId, ok: true, result: { pageId: 'page-1', closed: true } }, connection);
    assert.strictEqual((await closePromise).closed, true);

    autoSnapshot = true;
    const actionPreview = await manager.action({
      workspaceId: 'wks-browser',
      agentId: 'agent-browser',
      pageId: 'page-1',
      action: 'click',
      ref: '@e1'
    });
    assert.strictEqual(actionPreview.preview, true);
    assert.deepStrictEqual(actionPreview.targetState, { mode: 'bound' });
    assert.deepStrictEqual(actionPreview.target, {
      workspaceId: 'wks-browser',
      agentId: 'agent-browser',
      hostId: 'host-browser',
      instanceId: '',
      pageId: 'page-1',
      action: 'click'
    });
    const targetStatePreview = await manager.action({
      workspaceId: 'wks-browser',
      agentId: 'agent-browser',
      pageId: 'page-1',
      action: 'click',
      ref: '@state'
    });
    assert.deepStrictEqual(targetStatePreview.targetState, { mode: 'bound' });
    snapshotText = 'button "Changed" [ref=@e1]';
    const changedTarget = await manager.action({
      workspaceId: 'wks-browser',
      agentId: 'agent-browser',
      pageId: 'page-1',
      action: 'click',
      ref: '@state',
      planId: targetStatePreview.planId,
      confirm: true
    });
    assert.strictEqual(changedTarget.failureCategory, 'browser_target_changed');
    snapshotText = 'button "Continue" [ref=@e1]';
    const stale = await manager.action({
      workspaceId: 'wks-browser',
      agentId: 'agent-browser',
      pageId: 'page-1',
      action: 'click',
      ref: '@different',
      planId: actionPreview.planId,
      confirm: true
    });
    assert.strictEqual(stale.failureCategory, 'browser_plan_stale');

    const projectionPreviewPayload = {
      workspaceId: 'wks-browser',
      agentId: 'agent-browser',
      hostId: 'host-browser',
      instanceId: 'instance-browser',
      pageId: 'page-1',
      action: 'click',
      ref: '@e1',
      url: 'https://user:password@example.invalid/private',
      cwd: 'C:\\Users\\coder\\private',
      headers: { authorization: 'Bearer secret' },
      functionSource: '() => secret'
    };
    const projectionPreview = await manager.action(projectionPreviewPayload);
    assert.strictEqual(projectionPreview.preview, true);
    lastEnvelope = null;
    const projectionEnvelopePromise = new Promise((resolve) => { nextEnvelopeResolve = resolve; });
    const projectionPromise = manager.action(Object.assign({}, projectionPreviewPayload, { planId: projectionPreview.planId, confirm: true }));
    const projectionEnvelope = await projectionEnvelopePromise;
    assert(projectionEnvelope && projectionEnvelope.type === 'browser.host.command');
    const projectedHostPayload = projectionEnvelope.payload.payload;
    assert.deepStrictEqual(Object.keys(projectedHostPayload).sort(), [
      'action', 'agentId', 'hostId', 'instanceId', 'pageId', 'ref', 'workspaceId'
    ]);
    assert.strictEqual(projectedHostPayload.url, undefined);
    assert.strictEqual(projectedHostPayload.headers, undefined);
    manager.handleHostResult({ commandId: projectionEnvelope.payload.commandId, ok: true, result: { applied: true } }, connection);
    assert.strictEqual((await projectionPromise).applied, true);

    const uploadPreview = await manager.action({
      workspaceId: 'wks-browser',
      agentId: 'agent-browser',
      pageId: 'page-1',
      action: 'upload',
      ref: '@file',
      filePaths: [uploadPath]
    });
    assert.strictEqual(uploadPreview.preview, true);
    assert.strictEqual(uploadPreview.uploadFileCount, 1);
    assert.strictEqual(uploadPreview.uploadBytes, fs.statSync(uploadPath).size);
    fs.appendFileSync(uploadPath, '-changed', 'utf8');
    const changedUpload = await manager.action({
      workspaceId: 'wks-browser',
      agentId: 'agent-browser',
      pageId: 'page-1',
      action: 'upload',
      ref: '@file',
      filePaths: [uploadPath],
      planId: uploadPreview.planId,
      confirm: true
    });
    assert.strictEqual(changedUpload.failureCategory, 'browser_plan_stale');
    const refreshedUploadPreview = await manager.action({
      workspaceId: 'wks-browser',
      agentId: 'agent-browser',
      pageId: 'page-1',
      action: 'upload',
      ref: '@file',
      filePaths: [uploadPath]
    });
    lastEnvelope = null;
    const uploadEnvelopePromise = new Promise((resolve) => { nextEnvelopeResolve = resolve; });
    const uploadPromise = manager.action({
      workspaceId: 'wks-browser',
      agentId: 'agent-browser',
      pageId: 'page-1',
      action: 'upload',
      ref: '@file',
      filePaths: [uploadPath],
      planId: refreshedUploadPreview.planId,
      confirm: true
    });
    const uploadEnvelope = await uploadEnvelopePromise;
    assert.strictEqual(uploadEnvelope.payload.payload.filePaths[0], fs.realpathSync(uploadPath));
    manager.handleHostResult({ commandId: uploadEnvelope.payload.commandId, ok: true, result: { uploaded: true } }, connection);
    const uploaded = await uploadPromise;
    assert.strictEqual(uploaded.uploaded, true);
    assert.deepStrictEqual(uploaded.target, {
      workspaceId: 'wks-browser',
      agentId: 'agent-browser',
      hostId: 'host-browser',
      instanceId: '',
      pageId: 'page-1',
      action: 'upload'
    });
    const reusedUploadPlan = await manager.action({
      workspaceId: 'wks-browser',
      agentId: 'agent-browser',
      pageId: 'page-1',
      action: 'upload',
      ref: '@file',
      filePaths: [uploadPath],
      planId: refreshedUploadPreview.planId,
      confirm: true
    });
    assert.strictEqual(reusedUploadPlan.failureCategory, 'browser_plan_stale');

    const downloadPreview = await manager.action({
      workspaceId: 'wks-browser',
      agentId: 'agent-browser',
      pageId: 'page-1',
      action: 'download',
      ref: '@download'
    });
    assert.strictEqual(downloadPreview.preview, true);
    assert.strictEqual(fs.existsSync(path.join(workspacePath, '.agent-bridge-downloads')), false, 'download preview must not create the managed directory');
    const downloadEnvelopePromise = new Promise((resolve) => { nextEnvelopeResolve = resolve; });
    const downloadPromise = manager.action({
      workspaceId: 'wks-browser',
      agentId: 'agent-browser',
      pageId: 'page-1',
      action: 'download',
      ref: '@download',
      planId: downloadPreview.planId,
      confirm: true
    });
    const downloadEnvelope = await downloadEnvelopePromise;
    assert.strictEqual(
      downloadEnvelope.payload.payload.downloadDirectory,
      path.join(workspacePath, '.agent-bridge-downloads')
    );
    manager.handleHostResult({
      commandId: downloadEnvelope.payload.commandId,
      ok: true,
      result: {
        applied: true,
        url: 'https://download-user:download-pass@example.com/file.zip',
        downloadDirectory: path.join(workspacePath, '.agent-bridge-downloads'),
        filePath: path.join(workspacePath, '.agent-bridge-downloads', 'file.zip')
      }
    }, connection);
    const downloadResult = await downloadPromise;
    assert.strictEqual(downloadResult.downloadDirectory, '.agent-bridge-downloads');
    assert.strictEqual(downloadResult.downloadDirectoryConfigured, true);
    assert.strictEqual(downloadResult.url, 'https://example.com/file.zip');
    assert.strictEqual(downloadResult.url.includes('@'), false);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(downloadResult, 'filePath'), false);

    const downloadListPromise = manager.execute('browser.download.list', { workspaceId: 'wks-browser', pageId: 'page-1' });
    const downloadListEnvelope = lastEnvelope;
    manager.handleHostResult({
      commandId: downloadListEnvelope.payload.commandId,
      ok: true,
      result: {
        downloads: [
          { guid: 'download-1', url: 'https://download-user:download-pass@example.com/file.zip', filePath: path.join(workspacePath, '.agent-bridge-downloads', 'file.zip'), state: 'completed' },
          { guid: 'download-invalid', url: 'file:///private/secret.zip', state: 'completed' }
        ]
      }
    }, connection);
    const downloadListResult = await downloadListPromise;
    assert.strictEqual(downloadListResult.downloads[0].guid, 'download-1');
    assert.strictEqual(downloadListResult.downloads[0].url, 'https://example.com/file.zip');
    assert.strictEqual(downloadListResult.downloads[0].url.includes('@'), false);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(downloadListResult.downloads[0], 'filePath'), false);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(downloadListResult.downloads[1], 'url'), false);

    const logsPromise = manager.execute('browser.page.logs', { workspaceId: 'wks-browser', pageId: 'page-1', maxEntries: 100 });
    const logsEnvelope = lastEnvelope;
    manager.handleHostResult({
      commandId: logsEnvelope.payload.commandId,
      ok: true,
      result: {
        logs: [
          {
            method: 'Runtime.consoleAPICalled',
            type: 'log',
            text: 'request https://user:pass@example.invalid/private?token=secret C:\\Users\\Smoke\\token.txt Bearer super-secret',
            errorText: 'authorization: Bearer another-secret',
            requestId: 'request-1',
            headers: { authorization: 'Bearer leaked', cookie: 'session=leaked' }
          },
          { method: 'Network.loadingFailed', errorText: 'safe error', encodedDataLength: 12 }
        ]
      }
    }, connection);
    const logsResult = await logsPromise;
    assert.strictEqual(logsResult.logs.length, 2);
    const publicLog = logsResult.logs[0];
    assert.strictEqual(publicLog.text.includes('https://'), false);
    assert.strictEqual(publicLog.text.includes('C:\\Users\\Smoke'), false);
    assert.strictEqual(publicLog.text.includes('super-secret'), false);
    assert.strictEqual(publicLog.errorText.includes('another-secret'), false);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(publicLog, 'headers'), false);

    const genericResultPromise = manager.execute('browser.page.list', { workspaceId: 'wks-browser', pageId: 'page-1' });
    const genericResultEnvelope = lastEnvelope;
    manager.handleHostResult({
      commandId: genericResultEnvelope.payload.commandId,
      ok: true,
      result: {
        pages: [{
          pageId: 'page-1',
          url: 'https://user:pass@example.invalid/page?token=leaked&safe=1',
          title: 'Safe page',
          headers: { authorization: 'Bearer leaked' },
          cookies: [{ name: 'session', value: 'leaked' }],
          nested: {
            password: 'leaked',
            path: path.join(workspacePath, 'secret.txt'),
            status: 'ready'
          }
        }]
      }
    }, connection);
    const genericResult = await genericResultPromise;
    assert.strictEqual(genericResult.pages[0].url, 'https://example.invalid/page?safe=1');
    assert.strictEqual(Object.prototype.hasOwnProperty.call(genericResult.pages[0], 'headers'), false);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(genericResult.pages[0], 'cookies'), false);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(genericResult.pages[0].nested, 'password'), false);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(genericResult.pages[0].nested, 'path'), false);
    assert.strictEqual(genericResult.pages[0].nested.status, 'ready');

    const dragPreview = await manager.action({
      workspaceId: 'wks-browser',
      agentId: 'agent-browser',
      pageId: 'page-1',
      action: 'drag',
      sourceRef: '@source',
      targetRef: '@target'
    });
    assert.strictEqual(dragPreview.failureCategory, 'browser_action_unavailable');
    const hostRebindPreview = await manager.action({
      workspaceId: 'wks-browser',
      agentId: 'agent-browser',
      pageId: 'page-1',
      action: 'click',
      ref: '@rebind'
    });
    assert.strictEqual(hostRebindPreview.preview, true);
    assert.strictEqual(hostRebindPreview.target.hostId, 'host-browser');
    assert.strictEqual(hostRebindPreview.target.pageId, 'page-1');
    const reboundHost = manager.registerHost({
      hostId: 'host-browser',
      workspaceIds: ['wks-browser'],
      supportedCommands: ['instance.list', 'page.list', 'page.create', 'page.close', 'page.navigate', 'page.snapshot', 'page.logs', 'page.action', 'download.list'],
      supportedActions: ['click', 'fill', 'upload', 'download']
    }, connection);
    assert.strictEqual(reboundHost.ok, true);
    const staleHostPlan = await manager.action({
      workspaceId: 'wks-browser',
      agentId: 'agent-browser',
      pageId: 'page-1',
      action: 'click',
      ref: '@rebind',
      planId: hostRebindPreview.planId,
      confirm: true
    });
    assert.strictEqual(staleHostPlan.failureCategory, 'browser_plan_stale');

    const legacyManager = new BrowserAutomationManager({ workspaceRegistry, agentManager });
    const legacyConnection = { connectionId: 'conn-legacy', sendJson() {} };
    const legacy = legacyManager.registerHost({
      hostId: 'host-legacy',
      workspaceIds: ['wks-browser'],
      supportedCommands: ['page.action']
    }, legacyConnection);
    assert.strictEqual(legacy.host.actionCapabilitiesExplicit, false);
    const legacyTargetSnapshot = await legacyManager.action({
      workspaceId: 'wks-browser',
      agentId: 'agent-browser',
      pageId: 'page-1',
      action: 'click',
      ref: '@legacy'
    });
    assert.strictEqual(legacyTargetSnapshot.preview, true);
    assert.deepStrictEqual(legacyTargetSnapshot.targetState, { mode: 'legacy' });
    assert(legacyTargetSnapshot.warnings.includes('browser_target_snapshot_unavailable'));

    const reconfigureConnection = { connectionId: 'conn-reconfigure', messages: [], sendJson(message) { this.messages.push(message); } };
    const reconfigureManager = new BrowserAutomationManager({ workspaceRegistry, agentManager, commandTimeoutMs: 5000 });
    const initialRegistration = reconfigureManager.registerHost({
      hostId: 'host-reconfigure',
      workspaceIds: ['wks-browser'],
      supportedCommands: ['page.snapshot']
    }, reconfigureConnection);
    assert.strictEqual(initialRegistration.ok, true);
    assert.strictEqual(reconfigureManager.hosts.get('host-reconfigure').registrationGeneration, 1);
    const pendingReconfigure = reconfigureManager.execute('browser.page.snapshot', {
      workspaceId: 'wks-browser',
      pageId: 'page-reconfigure'
    });
    assert.strictEqual(reconfigureConnection.messages.length, 1);
    const oldCommandId = reconfigureConnection.messages[0].payload.commandId;
    const updatedRegistration = reconfigureManager.registerHost({
      hostId: 'host-reconfigure',
      workspaceIds: ['wks-browser'],
      supportedCommands: ['page.list']
    }, reconfigureConnection);
    assert.strictEqual(updatedRegistration.ok, true);
    assert.strictEqual(reconfigureManager.hosts.get('host-reconfigure').registrationGeneration, 2);
    const reconfiguredResult = await pendingReconfigure;
    assert.strictEqual(reconfiguredResult.failureCategory, 'browser_host_reconfigured');
    const lateReconfigureResult = reconfigureManager.handleHostResult({
      commandId: oldCommandId,
      ok: true,
      result: { page: { pageId: 'stale-page' } }
    }, reconfigureConnection);
    assert.strictEqual(lateReconfigureResult.failureCategory, 'browser_command_not_found');
    reconfigureManager.detachConnection(reconfigureConnection);

    const escapePath = path.join(root, 'outside.txt');
    fs.writeFileSync(escapePath, 'outside', 'utf8');
    const escaped = await manager.action({ workspaceId: 'wks-browser', pageId: 'page-1', action: 'upload', filePaths: [escapePath] });
    assert.strictEqual(escaped.failureCategory, 'browser_upload_scope_violation');
    const largePath = path.join(workspacePath, 'large.txt');
    fs.writeFileSync(largePath, '0123456789', 'utf8');
    const limitedManager = new BrowserAutomationManager({ workspaceRegistry, agentManager, maxUploadFileBytes: 4 });
    const tooLarge = await limitedManager.action({ workspaceId: 'wks-browser', pageId: 'page-1', action: 'upload', filePaths: [largePath] });
    assert.strictEqual(tooLarge.failureCategory, 'browser_upload_too_large');

    autoSnapshot = false;
    const timeout = await manager.execute('browser.page.snapshot', { workspaceId: 'wks-browser', pageId: 'page-1' });
    assert.strictEqual(timeout.failureCategory, 'browser_timeout');

    const pendingPromise = manager.execute('browser.page.snapshot', { workspaceId: 'wks-browser', pageId: 'page-1' });
    manager.detachConnection(connection);
    const disconnected = await pendingPromise;
    assert.strictEqual(disconnected.failureCategory, 'browser_host_disconnected');
    assert.strictEqual(manager.listHosts({ workspaceId: 'wks-browser' }).totalCount, 0);
    assert(events.some((event) => event.kind === 'browser.host.registered'));
    assert(events.some((event) => event.kind === 'browser.permission.updated'));
    assert(events.some((event) => event.kind === 'browser.host.unregistered'));
    console.log('browser automation manager smoke ok');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exitCode = 1;
});
