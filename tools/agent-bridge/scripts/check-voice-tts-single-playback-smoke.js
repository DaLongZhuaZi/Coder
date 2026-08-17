'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { VoiceManager } = require('../src/voice-manager');

const workspaceRoot = path.resolve(__dirname, '..', '..', '..');
const coordinatorPath = path.join(
  workspaceRoot,
  'entry',
  'src',
  'main',
  'ets',
  'features',
  'agentHome',
  'AgentHomeVoicePlaybackCoordinator.ets'
);
const pagePath = path.join(
  workspaceRoot,
  'entry',
  'src',
  'main',
  'ets',
  'pages',
  'ngf',
  'NGFAgentHomePage.ets'
);
const modelsPath = path.join(
  workspaceRoot,
  'entry',
  'src',
  'main',
  'ets',
  'features',
  'agentBridge',
  'AgentBridgeModels.ets'
);
const serverPath = path.join(__dirname, '..', 'src', 'server.js');

const coordinatorSource = fs.readFileSync(coordinatorPath, 'utf8');
const pageSource = fs.readFileSync(pagePath, 'utf8');
const modelsSource = fs.readFileSync(modelsPath, 'utf8');
const serverSource = fs.readFileSync(serverPath, 'utf8');

function sectionBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert(start >= 0, 'missing source marker: ' + startMarker);
  assert(end > start, 'missing source end marker: ' + endMarker);
  return source.slice(start, end);
}

function loadPlaybackCoordinator() {
  const runnableSource = coordinatorSource
    .replace('export class AgentHomeVoicePlaybackCoordinator', 'class AgentHomeVoicePlaybackCoordinator')
    .replace(/\bprivate\s+/g, '')
    .replace(/:\s*(number|string|boolean)\b/g, '');
  const sandbox = { module: { exports: null } };
  vm.runInNewContext(
    runnableSource + '\nmodule.exports = AgentHomeVoicePlaybackCoordinator;',
    sandbox,
    { filename: coordinatorPath }
  );
  return sandbox.module.exports;
}

function playbackIdentity(delivery, envelopeRequestId) {
  const clientRequestId = String(delivery.clientRequestId || '').trim();
  if (clientRequestId.length > 0) return clientRequestId;
  const ttsRequestId = String(delivery.requestId || delivery.ttsRequestId || '').trim();
  if (ttsRequestId.length > 0) return ttsRequestId;
  return String(envelopeRequestId || '').trim();
}

async function main() {
  const events = [];
  const audioBase64 = Buffer.from('single-playback-audio', 'utf8').toString('base64');
  const manager = new VoiceManager({
    ttsEndpoint: 'https://voice.test/tts',
    requestJson: async () => ({
      audioBase64,
      mimeType: 'audio/mpeg',
      sampleRate: 24000,
      channels: 1,
      sampleBits: 16
    }),
    onUpdated: (event) => events.push(event)
  });

  try {
    const response = await manager.speak({
      text: 'Play this once.',
      clientRequestId: 'app_tts_single_playback'
    }, 'owner-a');
    const readyEvents = events.filter((event) => event.kind === 'tts.ready');
    assert.strictEqual(readyEvents.length, 1, 'Bridge must emit one ready event for synthesized audio');
    const readyEvent = readyEvents[0];
    assert.strictEqual(response.ok, true, 'Bridge must also return the successful RPC response');
    assert.strictEqual(readyEvent.audioBase64, response.audioBase64,
      'event and response must carry the same compatible audio payload');
    assert.strictEqual(readyEvent.requestId, response.requestId,
      'event and response must retain the same Bridge TTS request id');
    assert.strictEqual(readyEvent.clientRequestId, response.clientRequestId,
      'event and response must retain the same client request id');

    assert(serverSource.includes("kind.startsWith('tts.') ? EventType.VOICE_TTS_UPDATED"),
      'server must preserve the voice.tts.updated event path');
    assert(serverSource.includes('makeResponse(id, await voiceManager.speak(payload'),
      'server must preserve the voice.tts.speak response path');
    assert(modelsSource.includes("extractFirstStringProperty(sourceObject, 'ttsRequestId', 'requestId')"),
      'App parser must preserve ttsRequestId/requestId compatibility');
    assert(modelsSource.includes("extractStringProperty(sourceObject, 'clientRequestId')"),
      'App parser must preserve clientRequestId compatibility');

    const PlaybackCoordinator = loadPlaybackCoordinator();
    const coordinator = new PlaybackCoordinator();
    const generation = coordinator.begin('host-a', 7);
    const eventIdentity = playbackIdentity(readyEvent, '');
    const responseIdentity = playbackIdentity(response, 'rpc-envelope-id');
    assert.strictEqual(eventIdentity, 'app_tts_single_playback',
      'clientRequestId must be the preferred playback identity');
    assert.strictEqual(responseIdentity, eventIdentity,
      'event and response must resolve to one playback identity');
    assert.strictEqual(playbackIdentity({ requestId: 'tts-request-only' }, 'rpc-envelope-id'),
      'tts-request-only', 'ttsRequestId must be the second playback identity choice');
    assert.strictEqual(playbackIdentity({}, 'rpc-envelope-id'),
      'rpc-envelope-id', 'envelope request id must be the final playback identity choice');
    assert.strictEqual(coordinator.markPlaybackStarted(generation, 'host-a', 7, ''), false,
      'empty identity must fail closed before any delivery is consumed');
    assert.strictEqual(coordinator.markPlaybackStarted(generation, 'host-b', 7, eventIdentity), false,
      'another host must not consume the active playback generation');
    assert.strictEqual(coordinator.markPlaybackStarted(generation, 'host-a', 8, eventIdentity), false,
      'another connection epoch must not consume the active playback generation');
    assert.strictEqual(coordinator.markPlaybackStarted(generation, 'host-a', 7, eventIdentity), true,
      'first compatible delivery must be consumed');
    assert.strictEqual(coordinator.markPlaybackStarted(generation, 'host-a', 7, responseIdentity), false,
      'second compatible delivery in the same generation must be rejected');
    const nextGeneration = coordinator.begin('host-a', 7);
    assert.strictEqual(coordinator.markPlaybackStarted(nextGeneration, 'host-a', 7, responseIdentity), true,
      'a new generation must permit one playback');

    const resolverSection = sectionBetween(
      pageSource,
      'private resolveVoiceTtsPlaybackIdentity(',
      '  private isCurrentVoiceTtsResult('
    );
    const clientIndex = resolverSection.indexOf('result.clientRequestId.trim()');
    const ttsIndex = resolverSection.indexOf('result.ttsRequestId.trim()');
    const envelopeIndex = resolverSection.indexOf('return envelopeRequestId.trim();');
    assert(clientIndex >= 0 && ttsIndex > clientIndex && envelopeIndex > ttsIndex,
      'App playback identity order must be clientRequestId, ttsRequestId, then envelope request id');

    const applySection = sectionBetween(
      pageSource,
      'private applyBridgeVoiceResult(',
      '  private isRemoteVoiceSessionAction('
    );
    const gateIndex = applySection.indexOf('this.voiceTtsPlaybackCoordinator.markPlaybackStarted(');
    const resultStateIndex = applySection.indexOf('this.voiceBridgeResult = result;');
    const modeStateIndex = applySection.indexOf('this.voiceTtsMode = AgentHomeVoiceMode.REMOTE_TTS;');
    const bridgeStateIndex = applySection.indexOf('this.voiceTtsBridgeRequestId = result.ttsRequestId;');
    const playbackIndex = applySection.indexOf('ngfVoicePlatformFacade.playAudioBase64(');
    assert(gateIndex >= 0 && resultStateIndex > gateIndex && modeStateIndex > gateIndex &&
      bridgeStateIndex > gateIndex && playbackIndex > gateIndex,
    'App must consume the scoped identity before writing playback state or calling the media facade');
    assert(applySection.includes('AgentBridgeRequestType.VOICE_TTS_SPEAK') &&
      applySection.includes('AgentBridgeEventType.VOICE_TTS_UPDATED'),
    'App must keep both response and event audio delivery paths compatible');
  } finally {
    manager.shutdown();
  }

  console.log('voice TTS single playback smoke ok');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
