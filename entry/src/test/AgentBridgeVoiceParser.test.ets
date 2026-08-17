import { describe, it, expect } from '@ohos/hypium';
import {
  AgentBridgeIncomingParser,
  AgentBridgeServerInfo,
  AgentBridgeVoiceResult
} from '../main/ets/features/agentBridge/AgentBridgeModels';
import {
  NGFVoiceAudioSessionState,
  NGFVoiceCapabilitySnapshot,
  NGFVoicePermissionRemediation,
  NGFVoicePermissionState,
  NGFVoicePlatformSnapshot
} from 'ngf_framework';

export default function agentBridgeVoiceParserTest() {
  describe('AgentBridgeVoiceParser', () => {
    it('parsesStartedSessionAndCapabilities', 0, () => {
      const result: AgentBridgeVoiceResult = AgentBridgeIncomingParser.parseVoiceResult(
        '{"payload":{"ok":true,"action":"voice.session.start","session":{"id":"voice-1","status":"recording"}}}'
      );
      expect(result.ok).assertTrue();
      expect(result.sessionId).assertEqual('voice-1');
      expect(result.state).assertEqual('recording');
    });

    it('parsesTranscriptAndFailureSafely', 0, () => {
      const transcript: AgentBridgeVoiceResult = AgentBridgeIncomingParser.parseVoiceResult(
        '{"event":"voice.transcript.final","payload":{"sessionId":"voice-1","transcript":"hello","isFinal":true,"isLast":true}}'
      );
      const failure: AgentBridgeVoiceResult = AgentBridgeIncomingParser.parseVoiceResult(
        '{"payload":{"ok":false,"action":"voice.session.finish","failureCategory":"voice_provider_failed","remediation":"Retry later"}}'
      );
      expect(transcript.action).assertEqual('voice.transcript.final');
      expect(transcript.transcript).assertEqual('hello');
      expect(transcript.isFinal).assertTrue();
      expect(failure.ok).assertFalse();
      expect(failure.failureCategory).assertEqual('voice_provider_failed');
    });

    it('parsesRemoteAudioAndCapabilityFields', 0, () => {
      const result: AgentBridgeVoiceResult = AgentBridgeIncomingParser.parseVoiceResult(
        '{"payload":{"ok":true,"action":"voice.tts.speak","mode":"remote_tts","requestId":"tts-1","clientRequestId":"app_tts_1","audioBase64":"c29tZQ==","mimeType":"audio/mpeg","audioBytes":4,"sampleRate":24000,"channels":1,"sampleBits":24,"durationMs":120}}'
      );
      expect(result.mode).assertEqual('remote_tts');
      expect(result.audioBase64).assertEqual('c29tZQ==');
      expect(result.mimeType).assertEqual('audio/mpeg');
      expect(result.sampleRate).assertEqual(24000);
      expect(result.channels).assertEqual(1);
      expect(result.sampleBits).assertEqual(24);
      expect(result.ttsRequestId).assertEqual('tts-1');
      expect(result.clientRequestId).assertEqual('app_tts_1');
    });

    it('parsesCapabilityWarningsWithoutExposingProviderDetails', 0, () => {
      const result: AgentBridgeVoiceResult = AgentBridgeIncomingParser.parseVoiceResult(
        '{"payload":{"ok":true,"action":"voice.status","warnings":["stt_endpoint_requires_https"],"capabilities":{"audioCapture":false,"audioPlayback":false,"remoteSpeechToText":true,"remoteTextToSpeech":false}}}'
      );
      expect(result.warnings.length).assertEqual(1);
      expect(result.warnings[0]).assertEqual('stt_endpoint_requires_https');
      expect(result.capabilities.audioCapture).assertFalse();
      expect(result.capabilities.audioPlayback).assertFalse();
      expect(result.capabilities.remoteSpeechToText).assertTrue();
      expect(result.capabilities.remoteTextToSpeech).assertFalse();
    });

    it('parsesIndependentVoiceFeatures', 0, () => {
      const info: AgentBridgeServerInfo = AgentBridgeIncomingParser.parseServerInfo(
        '{"serverInfo":{"features":{"voiceCapabilityMatrix":true,"voiceRemoteSpeechToText":true,"voiceRemoteTextToSpeech":false}}}'
      );
      expect(info.features.voiceCapabilityMatrix).assertTrue();
      expect(info.features.voiceRemoteSpeechToText).assertTrue();
      expect(info.features.voiceRemoteTextToSpeech).assertFalse();
      expect(info.features.voice).assertFalse();
    });

    it('keepsVoiceFeatureDisabledWhenMissing', 0, () => {
      const info: AgentBridgeServerInfo = AgentBridgeIncomingParser.parseServerInfo(
        '{"serverInfo":{"features":{"messageQueue":true}}}'
      );
      expect(info.features.voice).assertFalse();
      expect(info.features.voiceCapabilityMatrix).assertFalse();
    });

    it('keepsLocalVoiceLifecycleStatesExplicit', 0, () => {
      const snapshot: NGFVoicePlatformSnapshot = new NGFVoicePlatformSnapshot();
      const capabilities: NGFVoiceCapabilitySnapshot = snapshot.capabilities;
      expect(snapshot.audioSessionState).assertEqual(NGFVoiceAudioSessionState.INACTIVE);
      expect(capabilities.microphonePermission).assertEqual(NGFVoicePermissionState.UNKNOWN);
      capabilities.microphonePermission = NGFVoicePermissionState.DENIED;
      capabilities.permissionRemediation = NGFVoicePermissionRemediation.OPEN_APP_PERMISSION_SETTINGS;
      expect(capabilities.microphonePermission).assertEqual(NGFVoicePermissionState.DENIED);
      expect(capabilities.permissionRemediation).assertEqual(NGFVoicePermissionRemediation.OPEN_APP_PERMISSION_SETTINGS);
    });
  });
}
