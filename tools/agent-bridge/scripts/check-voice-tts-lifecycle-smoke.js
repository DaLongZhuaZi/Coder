'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const pagePath = path.resolve(__dirname, '..', '..', '..', 'entry', 'src', 'main', 'ets', 'pages', 'ngf', 'NGFAgentHomePage.ets');
const coordinatorPath = path.resolve(__dirname, '..', '..', '..', 'entry', 'src', 'main', 'ets', 'features', 'agentHome', 'AgentHomeVoicePlaybackCoordinator.ets');
const pageSource = fs.readFileSync(pagePath, 'utf8');
const coordinatorSource = fs.readFileSync(coordinatorPath, 'utf8');

function sectionBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert(start >= 0, 'missing source marker: ' + startMarker);
  assert(end > start, 'missing source end marker: ' + endMarker);
  return source.slice(start, end);
}

const toggleSection = sectionBetween(pageSource, 'private toggleVoiceSpeech(): void', '  private latestAssistantVoiceText(): string');
const snapshotSection = sectionBetween(pageSource, 'private handleLocalVoiceSnapshot(snapshot: NGFVoicePlatformSnapshot): void', '  private handleLocalVoiceChunk(');

assert(coordinatorSource.includes('private playbackStarted: boolean = false;'),
  'Voice playback coordinator must distinguish a pending request from started playback');
assert(coordinatorSource.includes('markPlaybackStarted('),
  'Voice playback coordinator must bind the media start to the active generation');
assert(coordinatorSource.includes('complete('),
  'Voice playback coordinator must have an explicit completion transition');
assert(coordinatorSource.includes('isPlaybackStarted()'),
  'Voice playback coordinator must expose playback completion state');
assert(toggleSection.includes('if (this.isVoiceSpeechActive())'),
  'Voice TTS stop must include a pending remote request, not only local SPEAKING state');
assert(toggleSection.includes('this.client.stopVoiceSpeech('),
  'Voice TTS stop must cancel the matching Bridge request');
assert(toggleSection.includes('this.clearActiveVoiceTtsState();'),
  'Voice TTS stop must clear active page request state');
assert(snapshotSection.includes('this.voiceTtsPlaybackCoordinator.isPlaybackStarted()'),
  'Voice page must observe media completion only after playback has started');
assert(snapshotSection.includes('snapshot.ttsRequestId.length === 0'),
  'Voice page must wait for NGF media cleanup before declaring remote playback complete');
assert(snapshotSection.includes('this.voiceTtsPlaybackCoordinator.complete('),
  'Voice page must invalidate the completed playback generation');
assert(pageSource.includes('this.voiceTtsPlaybackCoordinator.markPlaybackStarted('),
  'Voice page must mark a remote TTS result as active before handing it to media');
assert((pageSource.match(/this\.isVoiceSpeechActive\(\)/g) || []).length >= 3,
  'Voice icon and toggle paths must share the same active speech predicate');

console.log('voice TTS lifecycle smoke ok');
