'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const facadePath = path.resolve(__dirname, '..', '..', '..', 'ngf_framework', 'src', 'main', 'ets', 'media', 'facades', 'VoicePlatformFacade.ets');
const source = fs.readFileSync(facadePath, 'utf8');

function sectionBetween(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert(start >= 0, 'missing source marker: ' + startMarker);
  assert(end > start, 'missing source end marker: ' + endMarker);
  return source.slice(start, end);
}

const finishSection = sectionBetween('async finishRecording(): Promise<void>', '  async cancelRecording(');
const cancelSection = sectionBetween('async cancelRecording(reason: string): Promise<void>', '  async speak(');
const releaseSection = sectionBetween('async release(): Promise<void>', '  handleRecognitionStarted(');
const dispatchSection = sectionBetween('private dispatchAudioChunk(chunk: Uint8Array): void', '  private handleRemotePlayerState(');
const remoteReleaseSection = sectionBetween('private async releaseRemotePlaybackResources(', '  private async activateAudioSession(');
const pcmPlaybackSection = sectionBetween(
  'if (normalizedMimeType === REMOTE_PCM_MIME || normalizedMimeType === REMOTE_RAW_MIME) {',
  '      const player: media.AVPlayer = await media.createAVPlayer();'
);
const compressedPlaybackSection = sectionBetween(
  'const player: media.AVPlayer = await media.createAVPlayer();',
  '      this.updateState(NGFVoicePlatformState.SPEAKING, \'\', \'\');'
);

assert(finishSection.includes("this.captureMode === 'device_stt' && this.recognitionEngine !== null"),
  'remote STT must not finish the local recognition engine');
assert(cancelSection.includes("this.captureMode === 'device_stt' && this.recognitionEngine !== null"),
  'remote STT must not cancel the local recognition engine');
assert(dispatchSection.includes("this.captureMode === 'device_stt' && this.recognitionEngine !== null"),
  'remote STT audio must not be written to the local recognition engine');
assert(source.includes('activeCaptureReadCallback'),
  'capture listener must be tracked per active capturer');
assert(source.includes('this.captureGeneration !== captureGeneration'),
  'late capture callbacks must be rejected by generation');
assert(source.includes('this.capturer !== capturer'),
  'late capture callbacks must be rejected by capturer identity');
assert(source.includes("current.off('readData', readCallback)"),
  'capture listener must be removed with the matching callback');
assert(source.includes('audioSessionDeactivatedCallback'),
  'audio session deactivation listener must be a stable callback');
assert(source.includes("manager.off('audioSessionDeactivated', this.audioSessionDeactivatedCallback)"),
  'audio session deactivation listener must be removed on release');
assert(releaseSection.includes('if (this.recognitionEngine !== null)'),
  'release must clean up a recognition engine regardless of the last capture mode');
assert(source.includes('isSupportedRemoteAudioMimeType'),
  'remote TTS playback must validate the audio MIME allowlist');
assert(source.includes('REMOTE_SUPPORTED_MIME_TYPES'),
  'remote TTS playback must keep an explicit supported MIME list');
assert(source.includes('const playbackGeneration: number = this.remotePlaybackGeneration'),
  'remote TTS playback must capture the active playback generation');
assert(source.includes('this.remotePlaybackGeneration !== playbackGeneration'),
  'late remote player callbacks must be rejected by playback generation');
assert(source.includes('this.remotePlayer !== player'),
  'late remote player callbacks must be rejected by player identity');
assert(source.includes('this.remotePlayerStateCallback = stateCallback'),
  'remote TTS playback must retain the active player callback');
assert(source.includes('this.remotePlayerErrorCallback = errorCallback'),
  'remote TTS playback must retain the active error callback');
const stateListenerIndex = compressedPlaybackSection.indexOf("player.on('stateChange', stateCallback)");
const errorListenerIndex = compressedPlaybackSection.indexOf("player.on('error', errorCallback)");
const dataSourceIndex = compressedPlaybackSection.indexOf('player.dataSrc = {');
const initializedWaitIndex = compressedPlaybackSection.indexOf('await initializationGate.promise;');
const prepareIndex = compressedPlaybackSection.indexOf('await player.prepare();');
const playIndex = compressedPlaybackSection.indexOf('await player.play();');
assert(stateListenerIndex >= 0 && stateListenerIndex < dataSourceIndex,
  'stateChange listener must be registered while the AVPlayer is idle before dataSrc');
assert(errorListenerIndex >= 0 && errorListenerIndex < dataSourceIndex,
  'error listener must be registered while the AVPlayer is idle before dataSrc');
assert(dataSourceIndex < initializedWaitIndex && initializedWaitIndex < prepareIndex && prepareIndex < playIndex,
  'compressed playback must wait for initialized before prepare and await prepare before play');
assert(compressedPlaybackSection.includes("state === 'initialized'") &&
  compressedPlaybackSection.includes('initializationGate.resolve()'),
  'compressed playback must resolve its initialization gate only from initialized state');
assert(compressedPlaybackSection.includes('ensureRemotePlaybackCurrent(player, playbackGeneration, playbackRequestId)'),
  'compressed playback async stages must revalidate player generation and request identity');
assert(compressedPlaybackSection.includes('initializationGate.reject(new Error(message))'),
  'remote player error callback must reject the pending initialization gate');
assert(source.includes('if (this.settled)'),
  'the remote player initialization gate must settle exactly once');
assert(compressedPlaybackSection.includes('const playerAudioBytes: Uint8Array = decoded') &&
  compressedPlaybackSection.includes('playerAudioBytes[offset + index]'),
  'AVPlayer data source must read from playback-local bytes rather than mutable shared state');
assert(remoteReleaseSection.includes('remotePlayerStateCallback') && remoteReleaseSection.includes('const stateCallback'),
  'remote playback release must capture the active player callback');
assert(remoteReleaseSection.includes("player.off('stateChange', stateCallback)"),
  'remote playback release must remove the matching player callback');
assert(remoteReleaseSection.includes('remotePlayerErrorCallback') &&
  remoteReleaseSection.includes("player.off('error', errorCallback)"),
  'remote playback release must remove the matching error callback');
assert(remoteReleaseSection.includes('initializationGate.reject('),
  'remote playback release must reject and settle a pending initialized waiter');
assert(remoteReleaseSection.includes('this.remotePlaybackGeneration === releaseGeneration'),
  'superseded playback cleanup must not deactivate the current audio session');
assert(source.includes('this.remotePlaybackGeneration = this.remotePlaybackGeneration + 1'),
  'remote playback stop must invalidate prior callback generations');
assert(source.includes("this.snapshot.ttsRequestId = '';"),
  'remote playback completion must clear the active TTS request identity');
assert(source.includes('Remote audio sample rate is invalid'),
  'remote TTS playback must reject invalid sample rates instead of silently clamping');
assert(source.includes('Remote audio channel count is invalid'),
  'remote TTS playback must reject invalid channel counts instead of silently clamping');
assert(source.includes('Remote audio sample depth is invalid'),
  'remote TTS playback must reject invalid sample depths instead of silently clamping');
assert(source.includes('resolveRemoteAudioSampleFormat'),
  'remote PCM playback must map the negotiated sample depth to an AudioSampleFormat');
assert(source.includes('SAMPLE_FORMAT_U8') && source.includes('SAMPLE_FORMAT_S24LE') && source.includes('SAMPLE_FORMAT_S32LE'),
  'remote PCM playback must support 8, 24 and 32 bit sample formats');
const drainIndex = pcmPlaybackSection.indexOf('await this.remoteRenderer.drain();');
const pcmAudioBufferCleanupIndex = pcmPlaybackSection.indexOf('new Uint8Array(audioBuffer).fill(0);', drainIndex);
const pcmCleanupIndex = pcmPlaybackSection.indexOf('decoded.fill(0);', drainIndex);
const pcmReturnIndex = pcmPlaybackSection.indexOf('return true;');
assert(drainIndex >= 0, 'remote PCM playback must drain the renderer before cleanup');
assert(pcmAudioBufferCleanupIndex > drainIndex && pcmAudioBufferCleanupIndex < pcmReturnIndex,
  'remote PCM playback must clear the renderer copy buffer after drain before success');
assert(pcmCleanupIndex > drainIndex && pcmCleanupIndex < pcmReturnIndex,
  'remote PCM playback must clear the decoded buffer after drain before success');
const pcmTtsRequestIdCleanupIndex = pcmPlaybackSection.indexOf("this.snapshot.ttsRequestId = '';", pcmCleanupIndex);
assert(pcmTtsRequestIdCleanupIndex > pcmCleanupIndex && pcmTtsRequestIdCleanupIndex < pcmReturnIndex,
  'remote PCM/raw completion must clear the active TTS request identity before success');
assert(source.includes('if (!this.foreground)'),
  'voice capture must be rejected while the App is backgrounded');
assert(source.includes('ensureMicrophonePermission'),
  'voice capture must use one permission gate before creating an AudioCapturer');
assert(source.includes('microphonePermission'),
  'voice capability snapshot must expose microphone permission state');
assert(source.includes('permissionRemediation'),
  'permission denial must expose a stable remediation action');
assert(source.includes('NGFVoicePermissionRemediation.OPEN_APP_PERMISSION_SETTINGS'),
  'permission denial must use the shared remediation constant');
assert(source.includes('NGFVoicePermissionRemediation.NONE'),
  'granted permission must clear remediation with the shared constant');
const appPagePath = path.resolve(__dirname, '..', '..', '..', 'entry', 'src', 'main', 'ets', 'pages', 'ngf', 'NGFAgentHomePage.ets');
const appPageSource = fs.readFileSync(appPagePath, 'utf8');
assert(appPageSource.includes('NGFVoicePermissionRemediation.OPEN_APP_PERMISSION_SETTINGS'),
  'App voice composer must map remediation through the shared contract');
assert(appPageSource.includes('agent_home_voice_permission_remediation'),
  'App voice composer must expose localized permission remediation');
assert(appPageSource.includes('result.sampleBits > 0 ? result.sampleBits : 16'),
  'App voice composer must forward the negotiated sample depth with a 16-bit fallback');
assert(source.includes('expectedAudioSessionDeactivationEvents'),
  'intentional AudioSession deactivation must be distinguishable from interruption');
assert(source.includes('audioSessionInterruptionInFlight'),
  'AudioSession interruption cleanup must be idempotent');
assert(source.includes('NGFVoiceAudioSessionState.INTERRUPTED'),
  'system audio interruption must be observable in the platform snapshot');
assert(source.includes('const hasActiveAudio: boolean'),
  'idle AudioSession deactivation must not synthesize an interruption state');

console.log('voice platform contract smoke ok');
