'use strict';

const assert = require('assert');
const { VoiceManager, normalizeAudioProfile, normalizeVoiceLanguage } = require('../src/voice-manager');

async function main() {
  const events = [];
  const manager = new VoiceManager({
    sttEndpoint: 'https://voice.test/stt',
    ttsEndpoint: 'https://voice.test/tts',
    requestJson: async (endpoint) => endpoint.endsWith('/stt')
      ? { partialTranscript: 'hello', transcript: 'hello world', confidence: 0.91 }
      : { audioBase64: Buffer.from('voice-audio', 'utf8').toString('base64'), mimeType: 'audio/mpeg', sampleRate: 24000, channels: 1 },
    onUpdated: (event) => events.push(event)
  });
  const status = manager.status();
  assert.strictEqual(status.speechRecognition, true);
  assert.strictEqual(status.textToSpeech, true);
  assert.strictEqual(status.capabilities.remoteSpeechToText, true);
  assert.strictEqual(status.capabilities.remoteTextToSpeech, true);
  assert.strictEqual(status.capabilities.audioCapture, false);
  assert.strictEqual(status.capabilities.audioPlayback, false);
  assert.strictEqual(status.capabilities.voiceActivityEvents, false);
  assert.strictEqual(status.capabilities.interruptionHandling, false);
  assert.strictEqual(JSON.stringify(status).includes('voice.test'), false);
  const insecure = new VoiceManager({
    sttEndpoint: 'http://voice.test/stt',
    ttsEndpoint: 'https://voice.test/tts',
    sttToken: 'secret-stt-token'
  });
  const insecureStatus = insecure.status();
  assert.strictEqual(insecureStatus.speechRecognition, false);
  assert.ok(insecureStatus.warnings.includes('stt_endpoint_requires_https'));
  assert.ok(insecureStatus.warnings.includes('tts_retention_policy_unknown'));
  assert.strictEqual(JSON.stringify(insecureStatus).includes('secret-stt-token'), false);
  assert.strictEqual(insecure.start({}, 'smoke').failureCategory, 'capability_unavailable');
  assert.strictEqual(normalizeVoiceLanguage('zh-Hans-CN'), 'zh-Hans-CN');
  assert.strictEqual(normalizeVoiceLanguage('language with spaces'), null);
  assert.strictEqual(normalizeAudioProfile({ mimeType: 'audio/pcm', sampleRate: 16000, channels: 1 }, 'voice.session.start').ok, true);
  assert.strictEqual(normalizeAudioProfile({ mimeType: 'audio/pcm', sampleRate: 16000.5 }, 'voice.session.start').failureCategory, 'voice_sample_rate_invalid');
  assert.strictEqual(normalizeAudioProfile({ mimeType: 'audio/x-unknown' }, 'voice.session.start').failureCategory, 'voice_mime_unsupported');
  assert.strictEqual(manager.start({ mimeType: 'audio/pcm', sampleRate: 16000, channels: 3 }, 'smoke').failureCategory, 'voice_channels_invalid');
  const unavailable = new VoiceManager({ requestJson: async () => ({}) }).start({}, 'smoke');
  assert.strictEqual(unavailable.failureCategory, 'capability_unavailable');
  const start = manager.start({ mimeType: 'audio/pcm', sampleRate: 16000 }, 'smoke');
  assert.strictEqual(start.ok, true);
  const sessionId = start.session.id;
  const chunk = manager.chunk({ sessionId, sequence: 0, audioBase64: Buffer.from('pcm', 'utf8').toString('base64') }, 'smoke');
  assert.strictEqual(chunk.ok, true);
  assert.strictEqual(manager.chunk({ sessionId, sequence: 2, audioBase64: Buffer.from('pcm', 'utf8').toString('base64') }, 'smoke').failureCategory, 'voice_sequence_mismatch');
  const finished = await manager.finish({ sessionId }, 'smoke');
  assert.strictEqual(finished.transcript, 'hello world');
  assert.strictEqual(Object.prototype.hasOwnProperty.call(finished, 'confidence'), true);
  assert.strictEqual(finished.mode, 'remote_stt');
  const tts = await manager.speak({ text: 'hello', clientRequestId: 'app_tts_smoke_1' }, 'smoke');
  assert.strictEqual(tts.ok, true);
  assert.ok(tts.audioBase64.length > 0);
  assert.strictEqual(tts.mode, 'remote_tts');
  assert.strictEqual(tts.clientRequestId, 'app_tts_smoke_1');
  assert.strictEqual(tts.sampleRate, 24000);
  assert.ok(tts.audioBytes > 0);
  assert.strictEqual(tts.sampleBits, 16);
  assert.ok(events.some((event) => event.kind === 'transcript.final'));
  assert.ok(events.some((event) => event.kind === 'transcript.partial'));
  const cancelled = manager.cancel({ sessionId: 'missing' }, 'smoke');
  assert.strictEqual(cancelled.failureCategory, 'voice_session_not_found');

  const cancellationEvents = [];
  let resolveCancelledTts = null;
  const cancellationManager = new VoiceManager({
    ttsEndpoint: 'https://voice.test/tts',
    requestJson: async () => new Promise((resolve) => {
      resolveCancelledTts = resolve;
    }),
    onUpdated: (event) => cancellationEvents.push(event)
  });
  const pendingCancelledTts = cancellationManager.speak({ text: 'cancel me', clientRequestId: 'app_tts_smoke_cancel' }, 'smoke');
  while (resolveCancelledTts === null) await Promise.resolve();
  const startedCancelledTts = cancellationEvents.find((event) => event.kind === 'tts.started');
  assert.ok(startedCancelledTts && startedCancelledTts.requestId);
  assert.strictEqual(startedCancelledTts.clientRequestId, 'app_tts_smoke_cancel');
  const stopResult = cancellationManager.stop({ clientRequestId: 'app_tts_smoke_cancel' }, 'smoke');
  assert.strictEqual(stopResult.ok, true);
  assert.strictEqual(stopResult.clientRequestId, 'app_tts_smoke_cancel');
  resolveCancelledTts({
    audioBase64: Buffer.from('late-audio', 'utf8').toString('base64'),
    mimeType: 'audio/mpeg',
    sampleRate: 24000,
    channels: 1
  });
  const cancelledTts = await pendingCancelledTts;
  assert.strictEqual(cancelledTts.ok, false);
  assert.strictEqual(cancelledTts.failureCategory, 'voice_cancelled');
  assert.strictEqual(cancellationEvents.some((event) => event.kind === 'tts.ready'), false);
  assert.strictEqual(cancellationEvents.some((event) => event.kind === 'tts.failed'), false);
  cancellationManager.shutdown();

  const sttCancellationEvents = [];
  let resolveCancelledStt = null;
  const sttCancellationManager = new VoiceManager({
    sttEndpoint: 'https://voice.test/stt',
    requestJson: async () => new Promise((resolve) => {
      resolveCancelledStt = resolve;
    }),
    onUpdated: (event) => sttCancellationEvents.push(event)
  });
  const sttStart = sttCancellationManager.start({ mimeType: 'audio/pcm' }, 'stt-owner');
  const sttSessionId = sttStart.session.id;
  sttCancellationManager.chunk({
    sessionId: sttSessionId,
    sequence: 0,
    audioBase64: Buffer.from('stt-audio', 'utf8').toString('base64')
  }, 'stt-owner');
  const pendingCancelledStt = sttCancellationManager.finish({ sessionId: sttSessionId }, 'stt-owner');
  while (resolveCancelledStt === null) await Promise.resolve();
  const sttCancelResult = sttCancellationManager.cancel({ sessionId: sttSessionId }, 'stt-owner');
  assert.strictEqual(sttCancelResult.ok, true);
  resolveCancelledStt({ transcript: 'late transcript' });
  const cancelledStt = await pendingCancelledStt;
  assert.strictEqual(cancelledStt.ok, false);
  assert.strictEqual(cancelledStt.failureCategory, 'voice_cancelled');
  assert.strictEqual(cancelledStt.state, 'cancelled');
  assert.strictEqual(sttCancellationEvents.some((event) => event.kind === 'transcript.final'), false);
  assert.strictEqual(sttCancellationEvents.some((event) => event.kind === 'session.failed'), false);
  assert.strictEqual(sttCancellationManager.status().activeSessions, 0);
  assert.strictEqual(sttCancellationManager.status().activeSttRequests, 0);
  sttCancellationManager.shutdown();

  const detachedSttEvents = [];
  let resolveDetachedStt = null;
  const detachedSttManager = new VoiceManager({
    sttEndpoint: 'https://voice.test/stt',
    requestJson: async () => new Promise((resolve) => {
      resolveDetachedStt = resolve;
    }),
    onUpdated: (event) => detachedSttEvents.push(event)
  });
  const detachedStart = detachedSttManager.start({}, 'detached-owner');
  const detachedSessionId = detachedStart.session.id;
  detachedSttManager.chunk({
    sessionId: detachedSessionId,
    sequence: 0,
    audioBase64: Buffer.from('detached-audio', 'utf8').toString('base64')
  }, 'detached-owner');
  const pendingDetachedStt = detachedSttManager.finish({ sessionId: detachedSessionId }, 'detached-owner');
  while (resolveDetachedStt === null) await Promise.resolve();
  detachedSttManager.detachOwner('detached-owner');
  resolveDetachedStt({ transcript: 'late detached transcript' });
  const detachedStt = await pendingDetachedStt;
  assert.strictEqual(detachedStt.failureCategory, 'voice_cancelled');
  assert.strictEqual(detachedSttEvents.some((event) => event.kind === 'transcript.final'), false);
  assert.strictEqual(detachedSttEvents.some((event) => event.kind === 'session.failed'), false);
  assert.strictEqual(detachedSttManager.status().activeSessions, 0);
  assert.strictEqual(detachedSttManager.status().activeSttRequests, 0);
  detachedSttManager.shutdown();

  const priorityEvents = [];
  const priorityResolvers = new Map();
  const priorityManager = new VoiceManager({
    ttsEndpoint: 'https://voice.test/tts',
    requestJson: async (_endpoint, _token, payload) => new Promise((resolve) => {
      priorityResolvers.set(payload.requestId, resolve);
    }),
    onUpdated: (event) => priorityEvents.push(event)
  });
  const firstPriority = priorityManager.speak({ text: 'first', clientRequestId: 'app_tts_priority_first' }, 'smoke');
  while (priorityEvents.filter((event) => event.kind === 'tts.started').length < 1) await Promise.resolve();
  const firstPriorityId = priorityEvents.find((event) => event.kind === 'tts.started').requestId;
  const secondPriority = priorityManager.speak({ text: 'second', clientRequestId: 'app_tts_priority_second' }, 'smoke');
  while (priorityEvents.filter((event) => event.kind === 'tts.started').length < 2) await Promise.resolve();
  const secondPriorityId = priorityEvents.filter((event) => event.kind === 'tts.started')[1].requestId;
  const priorityStop = priorityManager.stop({
    requestId: firstPriorityId,
    clientRequestId: 'app_tts_priority_second'
  }, 'smoke');
  assert.strictEqual(priorityStop.ok, true);
  assert.strictEqual(priorityStop.clientRequestId, 'app_tts_priority_second');
  priorityResolvers.get(firstPriorityId)({
    audioBase64: Buffer.from('first-audio', 'utf8').toString('base64'),
    mimeType: 'audio/mpeg',
    sampleRate: 24000,
    channels: 1
  });
  priorityResolvers.get(secondPriorityId)({
    audioBase64: Buffer.from('second-audio', 'utf8').toString('base64'),
    mimeType: 'audio/mpeg',
    sampleRate: 24000,
    channels: 1
  });
  const firstPriorityResult = await firstPriority;
  const secondPriorityResult = await secondPriority;
  assert.strictEqual(firstPriorityResult.ok, true);
  assert.strictEqual(secondPriorityResult.failureCategory, 'voice_cancelled');
  priorityManager.shutdown();

  const invalidClientRequest = await new VoiceManager({
    ttsEndpoint: 'https://voice.test/tts',
    requestJson: async () => ({ audioBase64: 'c29tZQ==', mimeType: 'audio/mpeg' })
  }).speak({ text: 'hello', clientRequestId: 'invalid request id' }, 'smoke');
  assert.strictEqual(invalidClientRequest.failureCategory, 'voice_client_request_id_invalid');

  const invalidTtsFormat = await new VoiceManager({
    ttsEndpoint: 'https://voice.test/tts',
    requestJson: async () => ({ audioBase64: Buffer.from('voice-audio', 'utf8').toString('base64'), mimeType: 'image/png' })
  }).speak({ text: 'hello', format: 'audio/mpeg' }, 'smoke');
  assert.strictEqual(invalidTtsFormat.failureCategory, 'voice_tts_format_unsupported');

  const invalidTtsProfile = await new VoiceManager({
    ttsEndpoint: 'https://voice.test/tts',
    requestJson: async () => ({ audioBase64: Buffer.from('voice-audio', 'utf8').toString('base64'), mimeType: 'audio/mpeg', sampleRate: 16000.5 })
  }).speak({ text: 'hello' }, 'smoke');
  assert.strictEqual(invalidTtsProfile.failureCategory, 'voice_tts_audio_profile_invalid');

  const providerFailure = await new VoiceManager({
    sttEndpoint: 'https://voice.test/stt',
    requestJson: async () => { throw Object.assign(new Error('Authorization: Bearer leaked-secret'), { code: 'unexpected_provider_error' }); }
  }).finish({ sessionId: 'missing' }, 'smoke');
  assert.strictEqual(providerFailure.failureCategory, 'voice_session_not_found');
  const providerEvents = [];
  const failingManager = new VoiceManager({
    sttEndpoint: 'https://voice.test/stt',
    requestJson: async () => { throw Object.assign(new Error('Authorization: Bearer leaked-secret'), { code: 'unexpected_provider_error' }); },
    onUpdated: (event) => providerEvents.push(event)
  });
  const failingStart = failingManager.start({}, 'smoke');
  const failingSessionId = failingStart.session.id;
  failingManager.chunk({ sessionId: failingSessionId, sequence: 0, audioBase64: Buffer.from('pcm', 'utf8').toString('base64') }, 'smoke');
  const failingFinish = await failingManager.finish({ sessionId: failingSessionId }, 'smoke');
  assert.strictEqual(failingFinish.failureCategory, 'voice_provider_failed');
  assert.strictEqual(failingFinish.message.includes('leaked-secret'), false);
  assert.strictEqual(providerEvents.some((event) => String(event.message || '').includes('leaked-secret')), false);
  failingManager.shutdown();
  manager.shutdown();
  console.log('voice manager smoke ok');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
