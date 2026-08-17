import { audio } from '@kit.AudioKit';
import { Permissions } from '@kit.AbilityKit';
import { speechRecognizer, textToSpeech } from '@kit.CoreSpeechKit';
import { media } from '@kit.MediaKit';
import { util } from '@kit.ArkTS';
import { BusinessError } from '@kit.BasicServicesKit';
import { logger } from '../../utils/Logger';
import { ngfPermissionManagerFacade } from '../../platformOhos/facades/PermissionManagerFacade';
import {
  IVoicePlatform,
  NGFVoiceCapabilitySnapshot,
  NGFVoiceAudioSessionState,
  NGFVoiceFailureCategory,
  NGFVoicePlatformListener,
  NGFVoicePlatformSnapshot,
  NGFVoicePlatformState,
  NGFVoicePermissionRemediation,
  NGFVoicePermissionState
} from '../contracts/IVoicePlatform';

const TAG: string = 'VoicePlatformFacade';
const MICROPHONE_PERMISSION: Permissions = 'ohos.permission.MICROPHONE';
const AUDIO_CHUNK_BYTES: number = 640;
const DEFAULT_LANGUAGE: string = 'zh-CN';
const MAX_REMOTE_AUDIO_BYTES: number = 16 * 1024 * 1024;
const REMOTE_PCM_MIME: string = 'audio/pcm';
const REMOTE_RAW_MIME: string = 'audio/raw';
const REMOTE_DEFAULT_MIME: string = 'audio/mpeg';
const REMOTE_DEFAULT_SAMPLE_BITS: number = 16;
const REMOTE_MIN_SAMPLE_RATE: number = 8000;
const REMOTE_MAX_SAMPLE_RATE: number = 192000;
const REMOTE_PLAYER_INITIALIZE_TIMEOUT_MS: number = 10000;
const REMOTE_SUPPORTED_MIME_TYPES: Array<string> = [
  'audio/aac',
  'audio/flac',
  'audio/mpeg',
  'audio/mp4',
  'audio/ogg',
  'audio/opus',
  'audio/pcm',
  'audio/raw',
  'audio/wav',
  'audio/webm',
  'audio/x-wav'
];

class NGFSpeechRecognitionListener implements speechRecognizer.RecognitionListener {
  private readonly owner: VoicePlatformFacade;

  constructor(owner: VoicePlatformFacade) {
    this.owner = owner;
  }

  onStart(sessionId: string, eventMessage: string): void {
    this.owner.handleRecognitionStarted(sessionId, eventMessage);
  }

  onEvent(sessionId: string, eventCode: number, eventMessage: string): void {
    this.owner.handleRecognitionEvent(sessionId, eventCode, eventMessage);
  }

  onResult(sessionId: string, result: speechRecognizer.SpeechRecognitionResult): void {
    this.owner.handleRecognitionResult(sessionId, result.result, result.isFinal, result.isLast);
  }

  onComplete(sessionId: string, eventMessage: string): void {
    this.owner.handleRecognitionCompleted(sessionId, eventMessage);
  }

  onError(sessionId: string, errorCode: number, errorMessage: string): void {
    this.owner.handleRecognitionError(sessionId, errorCode, errorMessage);
  }
}

class NGFTextToSpeechListener implements textToSpeech.SpeakListener {
  private readonly owner: VoicePlatformFacade;

  constructor(owner: VoicePlatformFacade) {
    this.owner = owner;
  }

  onStart(requestId: string, response: textToSpeech.StartResponse): void {
    this.owner.handleTtsStarted(requestId, response.sampleRate);
  }

  onComplete(requestId: string, response: textToSpeech.CompleteResponse): void {
    this.owner.handleTtsCompleted(requestId, response.type, response.message);
  }

  onStop(requestId: string, response: textToSpeech.StopResponse): void {
    this.owner.handleTtsStopped(requestId, response.message);
  }

  onError(requestId: string, errorCode: number, errorMessage: string): void {
    this.owner.handleTtsError(requestId, errorCode, errorMessage);
  }
}

class NGFRemotePlayerInitializationGate {
  readonly promise: Promise<void>;
  private settled: boolean = false;
  private resolveCallback: (() => void) | null = null;
  private rejectCallback: ((error: Error) => void) | null = null;
  private timeoutId: number = -1;

  constructor(timeoutMs: number) {
    this.promise = new Promise<void>((resolve: () => void, reject: (error: Error) => void): void => {
      this.resolveCallback = resolve;
      this.rejectCallback = reject;
    });
    this.timeoutId = setTimeout((): void => {
      this.reject(new Error('Remote audio player initialization timed out'));
    }, timeoutMs);
  }

  resolve(): void {
    if (this.settled) {
      return;
    }
    this.settled = true;
    this.clearTimeout();
    const callback: (() => void) | null = this.resolveCallback;
    this.resolveCallback = null;
    this.rejectCallback = null;
    if (callback !== null) {
      callback();
    }
  }

  reject(error: Error): void {
    if (this.settled) {
      return;
    }
    this.settled = true;
    this.clearTimeout();
    const callback: ((error: Error) => void) | null = this.rejectCallback;
    this.resolveCallback = null;
    this.rejectCallback = null;
    if (callback !== null) {
      callback(error);
    }
  }

  private clearTimeout(): void {
    if (this.timeoutId >= 0) {
      clearTimeout(this.timeoutId);
      this.timeoutId = -1;
    }
  }
}

export class VoicePlatformFacade implements IVoicePlatform {
  private listener: NGFVoicePlatformListener | null = null;
  private snapshot: NGFVoicePlatformSnapshot = new NGFVoicePlatformSnapshot();
  private capturer: audio.AudioCapturer | null = null;
  private sessionManager: audio.AudioSessionManager | null = null;
  private recognitionEngine: speechRecognizer.SpeechRecognitionEngine | null = null;
  private ttsEngine: textToSpeech.TextToSpeechEngine | null = null;
  private remoteRenderer: audio.AudioRenderer | null = null;
  private remotePlayer: media.AVPlayer | null = null;
  private remoteAudioBytes: Uint8Array = new Uint8Array(0);
  private remotePlaybackGeneration: number = 0;
  private remotePlaybackRequestId: string = '';
  private recognitionLanguage: string = '';
  private ttsLanguage: string = '';
  private captureGeneration: number = 0;
  private activeCaptureReadCallback: ((buffer: ArrayBuffer) => void) | null = null;
  private audioChunkSequence: number = 0;
  private pendingAudioBytes: Uint8Array = new Uint8Array(0);
  private recording: boolean = false;
  private captureMode: string = 'device_stt';
  private foreground: boolean = true;
  private expectedAudioSessionDeactivationEvents: number = 0;
  private audioSessionInterruptionInFlight: boolean = false;
  private readonly audioSessionDeactivatedCallback: (event: audio.AudioSessionDeactivatedEvent) => void =
    (_event: audio.AudioSessionDeactivatedEvent): void => {
      this.handleAudioSessionInterrupted();
    };
  private remotePlayerStateCallback: ((state: media.AVPlayerState, reason: media.StateChangeReason) => void) | null = null;
  private remotePlayerErrorCallback: ((error: BusinessError) => void) | null = null;
  private remotePlayerInitializationGate: NGFRemotePlayerInitializationGate | null = null;

  setListener(listener: NGFVoicePlatformListener | null): void {
    this.listener = listener;
    this.publishSnapshot();
  }

  getSnapshot(): NGFVoicePlatformSnapshot {
    return this.copySnapshot(this.snapshot);
  }

  async initializeSpeech(language: string): Promise<NGFVoiceCapabilitySnapshot> {
    const normalizedLanguage = language.trim().length > 0 ? language.trim() : DEFAULT_LANGUAGE;
    await this.ensureRecognitionEngine(normalizedLanguage);
    await this.ensureTtsEngine(normalizedLanguage);
    this.publishSnapshot();
    return this.copyCapabilities(this.snapshot.capabilities);
  }

  async startRecording(sessionId: string, language: string, mode: string = 'device_stt'): Promise<boolean> {
    if (this.recording || sessionId.trim().length === 0) {
      return false;
    }
    if (!this.foreground) {
      this.updateState(NGFVoicePlatformState.INTERRUPTED, NGFVoiceFailureCategory.APP_BACKGROUND,
        'Voice input requires the app to be in the foreground');
      return false;
    }
    this.updateState(NGFVoicePlatformState.REQUESTING_PERMISSION, '', '');
    const granted = await this.ensureMicrophonePermission();
    if (!granted) {
      this.updateState(NGFVoicePlatformState.ERROR, NGFVoiceFailureCategory.PERMISSION_DENIED,
        'Microphone permission denied');
      return false;
    }
    this.updateState(NGFVoicePlatformState.PREPARING, '', '');
    const normalizedLanguage = language.trim().length > 0 ? language.trim() : DEFAULT_LANGUAGE;
    const normalizedMode = mode === 'remote_stt' || mode === 'capture_only' ? mode : 'device_stt';
    this.captureMode = normalizedMode;
    const captureGeneration: number = this.captureGeneration + 1;
    this.captureGeneration = captureGeneration;
    if (normalizedMode === 'device_stt') {
      await this.ensureRecognitionEngine(normalizedLanguage);
      if (this.recognitionEngine === null) {
        this.updateState(NGFVoicePlatformState.ERROR, NGFVoiceFailureCategory.CAPABILITY_UNAVAILABLE,
          this.snapshot.capabilities.message);
        return false;
      }
    }
    try {
      await this.activateAudioSession();
      const options: audio.AudioCapturerOptions = {
        streamInfo: {
          samplingRate: audio.AudioSamplingRate.SAMPLE_RATE_16000,
          channels: audio.AudioChannel.CHANNEL_1,
          sampleFormat: audio.AudioSampleFormat.SAMPLE_FORMAT_S16LE,
          encodingType: audio.AudioEncodingType.ENCODING_TYPE_RAW
        },
        capturerInfo: {
          source: audio.SourceType.SOURCE_TYPE_VOICE_RECOGNITION,
          capturerFlags: 0
        }
      };
      const capturer: audio.AudioCapturer = await audio.createAudioCapturer(options);
      this.capturer = capturer;
      this.snapshot.sessionId = sessionId;
      this.snapshot.partialTranscript = '';
      this.snapshot.finalTranscript = '';
      this.snapshot.vadActive = false;
      this.audioChunkSequence = 0;
      this.pendingAudioBytes = new Uint8Array(0);
      if (normalizedMode === 'device_stt') {
        this.startRecognition(sessionId);
      }
      const readCallback: (buffer: ArrayBuffer) => void = (buffer: ArrayBuffer): void => {
        if (!this.recording || this.captureGeneration !== captureGeneration || this.capturer !== capturer) {
          return;
        }
        this.handleCapturedAudio(buffer);
      };
      this.activeCaptureReadCallback = readCallback;
      capturer.on('readData', readCallback);
      await capturer.start();
      this.recording = true;
      this.updateState(NGFVoicePlatformState.RECORDING, '', '');
      return true;
    } catch (error) {
      await this.releaseCaptureResources();
      this.updateState(NGFVoicePlatformState.ERROR, NGFVoiceFailureCategory.CAPTURE_FAILED, String(error));
      return false;
    }
  }

  async finishRecording(): Promise<void> {
    if (!this.recording && this.capturer === null) {
      return;
    }
    const sessionId = this.snapshot.sessionId;
    this.updateState(NGFVoicePlatformState.FINISHING, '', '');
    this.recording = false;
    this.captureGeneration = this.captureGeneration + 1;
    await this.releaseCaptureResources();
    if (this.captureMode === 'device_stt' && this.recognitionEngine !== null && sessionId.length > 0) {
      try {
        this.recognitionEngine.finish(sessionId);
      } catch (error) {
        this.updateState(NGFVoicePlatformState.ERROR, NGFVoiceFailureCategory.RECOGNITION_FAILED, String(error));
        return;
      }
    }
    this.updateState(NGFVoicePlatformState.IDLE, '', '');
  }

  async cancelRecording(reason: string): Promise<void> {
    const hasCapture: boolean = this.recording || this.capturer !== null;
    if (!hasCapture) {
      return;
    }
    const sessionId = this.snapshot.sessionId;
    this.recording = false;
    this.captureGeneration = this.captureGeneration + 1;
    if (this.captureMode === 'device_stt' && this.recognitionEngine !== null && sessionId.length > 0) {
      try {
        this.recognitionEngine.cancel(sessionId);
      } catch (error) {
        logger.warn(TAG, 'cancel recognition failed: ' + String(error));
      }
    }
    await this.releaseCaptureResources();
    this.snapshot.partialTranscript = '';
    this.snapshot.finalTranscript = '';
    this.snapshot.vadActive = false;
    this.updateState(reason.length > 0 ? NGFVoicePlatformState.INTERRUPTED : NGFVoicePlatformState.IDLE,
      reason.length > 0 ? NGFVoiceFailureCategory.INTERRUPTED : '', reason);
  }

  async speak(text: string, language: string): Promise<boolean> {
    const cleanText = text.trim();
    if (cleanText.length === 0) {
      return false;
    }
    const normalizedLanguage = language.trim().length > 0 ? language.trim() : DEFAULT_LANGUAGE;
    await this.ensureTtsEngine(normalizedLanguage);
    if (this.ttsEngine === null) {
      this.updateState(NGFVoicePlatformState.ERROR, NGFVoiceFailureCategory.CAPABILITY_UNAVAILABLE,
        this.snapshot.capabilities.message);
      return false;
    }
    try {
      await this.stopRemotePlaybackResources();
      await this.activateAudioSession();
      const requestId = 'ngf_tts_' + String(Date.now());
      const params: textToSpeech.SpeakParams = { requestId: requestId };
      this.snapshot.ttsRequestId = requestId;
      this.ttsEngine.speak(cleanText, params);
      this.updateState(NGFVoicePlatformState.SPEAKING, '', '');
      return true;
    } catch (error) {
      this.updateState(NGFVoicePlatformState.ERROR, NGFVoiceFailureCategory.TTS_FAILED, String(error));
      return false;
    }
  }

  async playAudioBase64(audioBase64: string, mimeType: string, sampleRate: number, channels: number,
    sampleBits: number = REMOTE_DEFAULT_SAMPLE_BITS): Promise<boolean> {
    if (audioBase64.trim().length === 0 || audioBase64.length > Math.ceil(MAX_REMOTE_AUDIO_BYTES * 4 / 3) + 8) {
      this.updateState(NGFVoicePlatformState.ERROR, NGFVoiceFailureCategory.TTS_FAILED, 'Remote audio is empty or too large');
      return false;
    }
    const helper: util.Base64Helper = new util.Base64Helper();
    let decoded: Uint8Array;
    try {
      decoded = helper.decodeSync(audioBase64);
    } catch (error) {
      this.updateState(NGFVoicePlatformState.ERROR, NGFVoiceFailureCategory.TTS_FAILED, 'Remote audio encoding is invalid');
      return false;
    }
    if (decoded.length === 0 || decoded.length > MAX_REMOTE_AUDIO_BYTES) {
      decoded.fill(0);
      this.updateState(NGFVoicePlatformState.ERROR, NGFVoiceFailureCategory.TTS_FAILED, 'Remote audio is too large');
      return false;
    }
    await this.stopRemotePlaybackResources();
    const playbackGeneration: number = this.remotePlaybackGeneration + 1;
    this.remotePlaybackGeneration = playbackGeneration;
    const normalizedMimeType: string = mimeType.trim().length > 0 ? mimeType.trim().toLowerCase() : REMOTE_DEFAULT_MIME;
    if (!this.isSupportedRemoteAudioMimeType(normalizedMimeType)) {
      decoded.fill(0);
      this.updateState(NGFVoicePlatformState.ERROR, NGFVoiceFailureCategory.TTS_FAILED, 'Remote audio format is unsupported');
      return false;
    }
    const normalizedSampleRate: number = sampleRate > 0 ? sampleRate : 16000;
    if (!Number.isFinite(normalizedSampleRate) || Math.floor(normalizedSampleRate) !== normalizedSampleRate ||
      normalizedSampleRate < REMOTE_MIN_SAMPLE_RATE || normalizedSampleRate > REMOTE_MAX_SAMPLE_RATE) {
      decoded.fill(0);
      this.updateState(NGFVoicePlatformState.ERROR, NGFVoiceFailureCategory.TTS_FAILED, 'Remote audio sample rate is invalid');
      return false;
    }
    const normalizedChannels: number = channels > 0 ? channels : 1;
    if ((normalizedChannels !== 1 && normalizedChannels !== 2) || !Number.isFinite(normalizedChannels)) {
      decoded.fill(0);
      this.updateState(NGFVoicePlatformState.ERROR, NGFVoiceFailureCategory.TTS_FAILED, 'Remote audio channel count is invalid');
      return false;
    }
    const normalizedSampleBits: number = sampleBits > 0 ? sampleBits : REMOTE_DEFAULT_SAMPLE_BITS;
    if (!Number.isFinite(normalizedSampleBits) || Math.floor(normalizedSampleBits) !== normalizedSampleBits ||
      (normalizedSampleBits !== 8 && normalizedSampleBits !== 16 && normalizedSampleBits !== 24 && normalizedSampleBits !== 32)) {
      decoded.fill(0);
      this.updateState(NGFVoicePlatformState.ERROR, NGFVoiceFailureCategory.TTS_FAILED, 'Remote audio sample depth is invalid');
      return false;
    }
    const playbackRequestId: string = 'ngf_remote_tts_' + String(Date.now());
    this.remotePlaybackRequestId = playbackRequestId;
    this.snapshot.ttsRequestId = playbackRequestId;
    try {
      await this.activateAudioSession();
      if (!this.isRemotePlaybackGenerationCurrent(playbackGeneration, playbackRequestId)) {
        decoded.fill(0);
        return false;
      }
      if (normalizedMimeType === REMOTE_PCM_MIME || normalizedMimeType === REMOTE_RAW_MIME) {
        const options: audio.AudioRendererOptions = {
          streamInfo: {
            samplingRate: normalizedSampleRate as audio.AudioSamplingRate,
            channels: normalizedChannels === 2 ? audio.AudioChannel.CHANNEL_2 : audio.AudioChannel.CHANNEL_1,
            sampleFormat: this.resolveRemoteAudioSampleFormat(normalizedSampleBits),
            encodingType: audio.AudioEncodingType.ENCODING_TYPE_RAW
          },
          rendererInfo: {
            usage: audio.StreamUsage.STREAM_USAGE_VOICE_MESSAGE,
            rendererFlags: 0
          }
        };
        this.remoteRenderer = await audio.createAudioRenderer(options);
        await this.remoteRenderer.start();
        const audioBuffer: ArrayBuffer = decoded.buffer.slice(decoded.byteOffset, decoded.byteOffset + decoded.byteLength);
        try {
          await this.remoteRenderer.write(audioBuffer);
          await this.remoteRenderer.drain();
        } finally {
          new Uint8Array(audioBuffer).fill(0);
          decoded.fill(0);
        }
        await this.stopRemotePlaybackResources();
        this.snapshot.ttsRequestId = '';
        this.updateState(NGFVoicePlatformState.IDLE, '', '');
        return true;
      }
      const player: media.AVPlayer = await media.createAVPlayer();
      if (!this.isRemotePlaybackGenerationCurrent(playbackGeneration, playbackRequestId)) {
        decoded.fill(0);
        try {
          await player.release();
        } catch (error) {
          logger.debug(TAG, 'superseded remote player release skipped: ' + String(error));
        }
        return false;
      }
      this.remotePlayer = player;
      this.remoteAudioBytes = decoded;
      const initializationGate: NGFRemotePlayerInitializationGate =
        new NGFRemotePlayerInitializationGate(REMOTE_PLAYER_INITIALIZE_TIMEOUT_MS);
      this.remotePlayerInitializationGate = initializationGate;
      let playerAudioOffset: number = 0;
      const playerAudioBytes: Uint8Array = decoded;
      const stateCallback: (state: media.AVPlayerState, reason: media.StateChangeReason) => void =
        (state: media.AVPlayerState, reason: media.StateChangeReason): void => {
          if (this.remotePlaybackGeneration !== playbackGeneration || this.remotePlayer !== player) {
            return;
          }
          if (state === 'initialized') {
            initializationGate.resolve();
          } else if (state === 'error') {
            initializationGate.reject(new Error('Remote audio player entered the error state'));
          }
          this.handleRemotePlayerState(player, playbackGeneration, state, reason);
        };
      const errorCallback: (error: BusinessError) => void = (error: BusinessError): void => {
        if (this.remotePlaybackGeneration !== playbackGeneration || this.remotePlayer !== player) {
          return;
        }
        const message: string = 'Remote audio playback failed: ' + String(error.message);
        initializationGate.reject(new Error(message));
        this.finishRemotePlayback(player, playbackGeneration, message);
      };
      this.remotePlayerStateCallback = stateCallback;
      this.remotePlayerErrorCallback = errorCallback;
      player.on('stateChange', stateCallback);
      player.on('error', errorCallback);
      player.dataSrc = {
        fileSize: decoded.byteLength,
        callback: (buffer: ArrayBuffer, length: number, position?: number): number => {
          if (this.remotePlaybackGeneration !== playbackGeneration || this.remotePlayer !== player) {
            return -1;
          }
          const offset: number = typeof position === 'number' ? Math.max(0, Math.floor(position)) : playerAudioOffset;
          if (offset >= playerAudioBytes.length) {
            return -1;
          }
          const count: number = Math.min(length, buffer.byteLength, playerAudioBytes.length - offset);
          const target: Uint8Array = new Uint8Array(buffer);
          for (let index = 0; index < count; index++) {
            target[index] = playerAudioBytes[offset + index];
          }
          playerAudioOffset = offset + count;
          return count;
        }
      };
      await initializationGate.promise;
      this.ensureRemotePlaybackCurrent(player, playbackGeneration, playbackRequestId);
      await player.prepare();
      this.ensureRemotePlaybackCurrent(player, playbackGeneration, playbackRequestId);
      await player.play();
      this.ensureRemotePlaybackCurrent(player, playbackGeneration, playbackRequestId);
      this.updateState(NGFVoicePlatformState.SPEAKING, '', '');
      return true;
    } catch (error) {
      decoded.fill(0);
      if (this.isRemotePlaybackGenerationCurrent(playbackGeneration, playbackRequestId)) {
        await this.stopRemotePlaybackResources();
        this.snapshot.ttsRequestId = '';
        this.updateState(NGFVoicePlatformState.ERROR, NGFVoiceFailureCategory.TTS_FAILED, String(error));
      }
      return false;
    }
  }

  async stopSpeaking(reason: string): Promise<void> {
    const hasSpeech: boolean = this.snapshot.ttsRequestId.length > 0 || this.remotePlayer !== null ||
      this.remoteRenderer !== null || this.snapshot.state === NGFVoicePlatformState.SPEAKING;
    if (!hasSpeech) {
      await this.deactivateAudioSession();
      return;
    }
    if (this.ttsEngine !== null) {
      try {
        this.ttsEngine.stop();
      } catch (error) {
        logger.warn(TAG, 'stop TTS failed: ' + String(error));
      }
    }
    await this.stopRemotePlaybackResources();
    this.snapshot.ttsRequestId = '';
    await this.deactivateAudioSession();
    this.updateState(reason.length > 0 ? NGFVoicePlatformState.INTERRUPTED : NGFVoicePlatformState.IDLE,
      reason.length > 0 ? NGFVoiceFailureCategory.INTERRUPTED : '', reason);
  }

  handleForeground(): void {
    this.foreground = true;
    if (!this.recording && this.snapshot.failureCategory === NGFVoiceFailureCategory.APP_BACKGROUND) {
      this.updateState(NGFVoicePlatformState.IDLE, NGFVoiceFailureCategory.NONE, '');
    }
  }

  async handleBackground(): Promise<void> {
    if (!this.foreground) {
      return;
    }
    this.foreground = false;
    await this.cancelRecording('app_background');
    await this.stopSpeaking('app_background');
  }

  async release(): Promise<void> {
    await this.cancelRecording('release');
    await this.stopSpeaking('release');
    if (this.recognitionEngine !== null) {
      this.recognitionEngine.shutdown();
      this.recognitionEngine = null;
    }
    if (this.ttsEngine !== null) {
      this.ttsEngine.shutdown();
      this.ttsEngine = null;
    }
    this.recognitionLanguage = '';
    this.ttsLanguage = '';
    this.expectedAudioSessionDeactivationEvents = 0;
    this.audioSessionInterruptionInFlight = false;
    this.releaseAudioSessionListener();
    this.listener = null;
  }

  handleRecognitionStarted(sessionId: string, eventMessage: string): void {
    logger.info(TAG, 'recognition started: ' + sessionId + ', ' + eventMessage);
  }

  handleRecognitionEvent(sessionId: string, eventCode: number, eventMessage: string): void {
    if (sessionId !== this.snapshot.sessionId) {
      return;
    }
    if (eventCode === 1) {
      this.snapshot.vadActive = true;
    } else if (eventCode === 3) {
      this.snapshot.vadActive = false;
    } else {
      return;
    }
    this.snapshot.message = eventMessage;
    this.publishSnapshot();
  }

  handleRecognitionResult(sessionId: string, text: string, isFinal: boolean, isLast: boolean): void {
    if (sessionId !== this.snapshot.sessionId) {
      return;
    }
    if (isFinal) {
      this.snapshot.finalTranscript = text;
      this.snapshot.partialTranscript = '';
    } else {
      this.snapshot.partialTranscript = text;
    }
    if (this.listener !== null) {
      this.listener.onTranscript(sessionId, text, isFinal, isLast);
    }
    this.publishSnapshot();
  }

  handleRecognitionCompleted(sessionId: string, eventMessage: string): void {
    if (sessionId === this.snapshot.sessionId) {
      this.snapshot.message = eventMessage;
      this.publishSnapshot();
    }
  }

  handleRecognitionError(sessionId: string, errorCode: number, errorMessage: string): void {
    if (sessionId === this.snapshot.sessionId) {
      this.updateState(NGFVoicePlatformState.ERROR, NGFVoiceFailureCategory.RECOGNITION_FAILED,
        String(errorCode) + ': ' + errorMessage);
    }
  }

  handleTtsStarted(requestId: string, sampleRate: number): void {
    if (requestId === this.snapshot.ttsRequestId) {
      this.updateState(NGFVoicePlatformState.SPEAKING, '', 'sampleRate=' + String(sampleRate));
    }
  }

  handleTtsCompleted(requestId: string, type: number, message: string): void {
    if (requestId === this.snapshot.ttsRequestId && type === 1) {
      this.snapshot.ttsRequestId = '';
      this.deactivateAudioSession().catch((error: Error): void => {
        logger.warn(TAG, 'deactivate TTS audio session failed: ' + String(error));
      });
      this.updateState(NGFVoicePlatformState.IDLE, '', message);
    }
  }

  handleTtsStopped(requestId: string, message: string): void {
    if (requestId === this.snapshot.ttsRequestId) {
      this.snapshot.ttsRequestId = '';
      this.updateState(NGFVoicePlatformState.IDLE, '', message);
    }
  }

  handleTtsError(requestId: string, errorCode: number, errorMessage: string): void {
    if (requestId === this.snapshot.ttsRequestId) {
      this.snapshot.ttsRequestId = '';
      this.updateState(NGFVoicePlatformState.ERROR, NGFVoiceFailureCategory.TTS_FAILED,
        String(errorCode) + ': ' + errorMessage);
    }
  }

  private async ensureRecognitionEngine(language: string): Promise<void> {
    if (this.recognitionEngine !== null && this.recognitionLanguage === language) {
      return;
    }
    if (this.recognitionEngine !== null) {
      this.recognitionEngine.shutdown();
      this.recognitionEngine = null;
    }
    try {
      const params: speechRecognizer.CreateEngineParams = { language: language, online: 0 };
      const engine = await speechRecognizer.createEngine(params);
      engine.setListener(new NGFSpeechRecognitionListener(this));
      this.recognitionEngine = engine;
      this.recognitionLanguage = language;
      this.snapshot.capabilities.speechRecognition = true;
      this.snapshot.capabilities.engineVad = true;
    } catch (error) {
      this.recognitionEngine = null;
      this.recognitionLanguage = '';
      this.snapshot.capabilities.speechRecognition = false;
      this.snapshot.capabilities.engineVad = false;
      this.snapshot.capabilities.failureCategory = NGFVoiceFailureCategory.CAPABILITY_UNAVAILABLE;
      this.snapshot.capabilities.message = String(error);
      logger.warn(TAG, 'speech recognition unavailable: ' + String(error));
    }
  }

  private async ensureTtsEngine(language: string): Promise<void> {
    if (this.ttsEngine !== null && this.ttsLanguage === language) {
      return;
    }
    if (this.ttsEngine !== null) {
      this.ttsEngine.shutdown();
      this.ttsEngine = null;
    }
    try {
      const params: textToSpeech.CreateEngineParams = { language: language, person: 0, online: 0 };
      const engine = await textToSpeech.createEngine(params);
      engine.setListener(new NGFTextToSpeechListener(this));
      this.ttsEngine = engine;
      this.ttsLanguage = language;
      this.snapshot.capabilities.textToSpeech = true;
    } catch (error) {
      this.ttsEngine = null;
      this.ttsLanguage = '';
      this.snapshot.capabilities.textToSpeech = false;
      this.snapshot.capabilities.failureCategory = NGFVoiceFailureCategory.CAPABILITY_UNAVAILABLE;
      this.snapshot.capabilities.message = String(error);
      logger.warn(TAG, 'text to speech unavailable: ' + String(error));
    }
  }

  private startRecognition(sessionId: string): void {
    if (this.recognitionEngine === null) {
      return;
    }
    const audioInfo: speechRecognizer.AudioInfo = {
      audioType: 'pcm',
      sampleRate: 16000,
      soundChannel: 1,
      sampleBit: 16
    };
    const params: speechRecognizer.StartParams = { sessionId: sessionId, audioInfo: audioInfo };
    try {
      this.recognitionEngine.startListening(params);
    } catch (error) {
      this.snapshot.capabilities.speechRecognition = false;
      this.snapshot.capabilities.engineVad = false;
      this.snapshot.capabilities.failureCategory = NGFVoiceFailureCategory.RECOGNITION_FAILED;
      this.snapshot.capabilities.message = String(error);
      logger.warn(TAG, 'start recognition failed: ' + String(error));
    }
  }

  private handleCapturedAudio(buffer: ArrayBuffer): void {
    if (!this.recording || !this.foreground || buffer.byteLength === 0) {
      return;
    }
    const incoming = new Uint8Array(buffer);
    const combined = new Uint8Array(this.pendingAudioBytes.length + incoming.length);
    combined.set(this.pendingAudioBytes, 0);
    combined.set(incoming, this.pendingAudioBytes.length);
    let offset = 0;
    while (offset + AUDIO_CHUNK_BYTES <= combined.length) {
      const chunk = new Uint8Array(AUDIO_CHUNK_BYTES);
      for (let index = 0; index < AUDIO_CHUNK_BYTES; index++) {
        chunk[index] = combined[offset + index];
      }
      this.dispatchAudioChunk(chunk);
      offset = offset + AUDIO_CHUNK_BYTES;
    }
    const remaining = combined.length - offset;
    this.pendingAudioBytes = new Uint8Array(remaining);
    for (let index = 0; index < remaining; index++) {
      this.pendingAudioBytes[index] = combined[offset + index];
    }
  }

  private dispatchAudioChunk(chunk: Uint8Array): void {
    this.audioChunkSequence = this.audioChunkSequence + 1;
    if (this.listener !== null && this.captureMode === 'remote_stt') {
      this.listener.onAudioChunk(this.snapshot.sessionId, this.audioChunkSequence, chunk);
    }
    if (this.captureMode === 'device_stt' && this.recognitionEngine !== null) {
      try {
        this.recognitionEngine.writeAudio(this.snapshot.sessionId, chunk);
      } catch (error) {
        logger.warn(TAG, 'write recognition audio failed: ' + String(error));
      }
    }
  }

  private handleRemotePlayerState(player: media.AVPlayer, playbackGeneration: number, state: media.AVPlayerState,
    reason: media.StateChangeReason): void {
    if (this.remotePlaybackGeneration !== playbackGeneration || this.remotePlayer !== player) {
      return;
    }
    if (state === 'completed') {
      this.finishRemotePlayback(player, playbackGeneration, '');
    } else if (state === 'error') {
      this.finishRemotePlayback(player, playbackGeneration, 'Remote audio playback failed: ' + String(reason));
    }
  }

  private finishRemotePlayback(player: media.AVPlayer, playbackGeneration: number, message: string): void {
    if (this.remotePlaybackGeneration !== playbackGeneration || this.remotePlayer !== player) {
      return;
    }
    this.releaseRemotePlaybackResources(playbackGeneration).then((): void => {
      if (this.remotePlaybackGeneration !== playbackGeneration || this.remotePlayer !== null) {
        return;
      }
      this.snapshot.ttsRequestId = '';
      if (message.length > 0) {
        this.updateState(NGFVoicePlatformState.ERROR, NGFVoiceFailureCategory.TTS_FAILED, message);
      } else {
        this.updateState(NGFVoicePlatformState.IDLE, '', '');
      }
    }).catch((error: Error): void => {
      logger.warn(TAG, 'release remote playback after state change failed: ' + String(error));
    });
  }

  private isRemotePlaybackGenerationCurrent(playbackGeneration: number, playbackRequestId: string): boolean {
    return this.remotePlaybackGeneration === playbackGeneration &&
      this.remotePlaybackRequestId === playbackRequestId && this.snapshot.ttsRequestId === playbackRequestId;
  }

  private ensureRemotePlaybackCurrent(player: media.AVPlayer, playbackGeneration: number,
    playbackRequestId: string): void {
    if (!this.isRemotePlaybackGenerationCurrent(playbackGeneration, playbackRequestId) || this.remotePlayer !== player) {
      throw new Error('Remote audio playback was superseded');
    }
  }

  private async stopRemotePlaybackResources(): Promise<void> {
    this.remotePlaybackGeneration = this.remotePlaybackGeneration + 1;
    const releaseGeneration: number = this.remotePlaybackGeneration;
    await this.releaseRemotePlaybackResources(releaseGeneration);
  }

  private async releaseRemotePlaybackResources(releaseGeneration: number): Promise<void> {
    const player: media.AVPlayer | null = this.remotePlayer;
    const renderer: audio.AudioRenderer | null = this.remoteRenderer;
    const stateCallback: ((state: media.AVPlayerState, reason: media.StateChangeReason) => void) | null =
      this.remotePlayerStateCallback;
    const errorCallback: ((error: BusinessError) => void) | null = this.remotePlayerErrorCallback;
    const initializationGate: NGFRemotePlayerInitializationGate | null = this.remotePlayerInitializationGate;
    this.remotePlayer = null;
    this.remoteRenderer = null;
    this.remotePlayerStateCallback = null;
    this.remotePlayerErrorCallback = null;
    this.remotePlayerInitializationGate = null;
    this.remotePlaybackRequestId = '';
    if (initializationGate !== null) {
      initializationGate.reject(new Error('Remote audio playback stopped'));
    }
    const bytes: Uint8Array = this.remoteAudioBytes;
    this.remoteAudioBytes = new Uint8Array(0);
    bytes.fill(0);
    if (player !== null) {
      try {
        if (stateCallback !== null) {
          player.off('stateChange', stateCallback);
        }
      } catch (error) {
        logger.debug(TAG, 'remote player state listener cleanup skipped: ' + String(error));
      }
      try {
        if (errorCallback !== null) {
          player.off('error', errorCallback);
        }
      } catch (error) {
        logger.debug(TAG, 'remote player error listener cleanup skipped: ' + String(error));
      }
      try {
        if (player.state === 'playing' || player.state === 'paused' || player.state === 'prepared') {
          await player.stop();
        }
      } catch (error) {
        logger.debug(TAG, 'remote player stop skipped: ' + String(error));
      }
      try {
        await player.release();
      } catch (error) {
        logger.warn(TAG, 'remote player release failed: ' + String(error));
      }
    }
    if (renderer !== null) {
      try {
        await renderer.stop();
      } catch (error) {
        logger.debug(TAG, 'remote renderer stop skipped: ' + String(error));
      }
      try {
        await renderer.release();
      } catch (error) {
        logger.warn(TAG, 'remote renderer release failed: ' + String(error));
      }
    }
    if (this.remotePlaybackGeneration === releaseGeneration) {
      await this.deactivateAudioSession();
    }
  }

  private async activateAudioSession(): Promise<void> {
    try {
      if (this.sessionManager === null) {
        this.sessionManager = audio.getAudioManager().getSessionManager();
        this.sessionManager.on('audioSessionDeactivated', this.audioSessionDeactivatedCallback);
        this.sessionManager.setAudioSessionScene(audio.AudioSessionScene.AUDIO_SESSION_SCENE_VOICE_COMMUNICATION);
      }
      if (!this.sessionManager.isAudioSessionActivated()) {
        const strategy: audio.AudioSessionStrategy = {
          concurrencyMode: audio.AudioConcurrencyMode.CONCURRENCY_PAUSE_OTHERS
        };
        await this.sessionManager.activateAudioSession(strategy);
      }
      this.snapshot.audioSessionState = NGFVoiceAudioSessionState.ACTIVE;
      this.publishSnapshot();
    } catch (error) {
      this.snapshot.audioSessionState = NGFVoiceAudioSessionState.INACTIVE;
      throw new Error('audio session activation failed: ' + String(error));
    }
  }

  private async deactivateAudioSession(): Promise<void> {
    if (this.sessionManager !== null && this.sessionManager.isAudioSessionActivated()) {
      this.expectedAudioSessionDeactivationEvents = this.expectedAudioSessionDeactivationEvents + 1;
      try {
        await this.sessionManager.deactivateAudioSession();
      } catch (error) {
        logger.warn(TAG, 'deactivate audio session failed: ' + String(error));
      } finally {
        if (this.expectedAudioSessionDeactivationEvents > 0) {
          this.expectedAudioSessionDeactivationEvents = this.expectedAudioSessionDeactivationEvents - 1;
        }
      }
    }
    this.snapshot.audioSessionState = NGFVoiceAudioSessionState.INACTIVE;
    this.publishSnapshot();
  }

  private releaseAudioSessionListener(): void {
    const manager = this.sessionManager;
    this.sessionManager = null;
    if (manager !== null) {
      try {
        manager.off('audioSessionDeactivated', this.audioSessionDeactivatedCallback);
      } catch (error) {
        logger.debug(TAG, 'audio session listener cleanup skipped: ' + String(error));
      }
    }
  }

  private handleAudioSessionInterrupted(): void {
    if (this.expectedAudioSessionDeactivationEvents > 0 || this.audioSessionInterruptionInFlight) {
      if (this.expectedAudioSessionDeactivationEvents > 0) {
        this.expectedAudioSessionDeactivationEvents = this.expectedAudioSessionDeactivationEvents - 1;
      }
      return;
    }
    const hasActiveAudio: boolean = this.recording || this.capturer !== null || this.snapshot.ttsRequestId.length > 0 ||
      this.remotePlayer !== null || this.remoteRenderer !== null || this.snapshot.state === NGFVoicePlatformState.SPEAKING;
    if (!hasActiveAudio) {
      return;
    }
    this.snapshot.audioSessionState = NGFVoiceAudioSessionState.INTERRUPTED;
    this.publishSnapshot();
    this.audioSessionInterruptionInFlight = true;
    this.cancelRecording('audio_session_deactivated').then((): Promise<void> => {
      return this.stopSpeaking('audio_session_deactivated');
    }).then((): void => {
      this.audioSessionInterruptionInFlight = false;
    }).catch((error: Error): void => {
      this.audioSessionInterruptionInFlight = false;
      logger.warn(TAG, 'audio session interruption cleanup failed: ' + String(error));
    });
  }

  private async releaseCaptureResources(): Promise<void> {
    const current = this.capturer;
    const readCallback = this.activeCaptureReadCallback;
    this.capturer = null;
    this.activeCaptureReadCallback = null;
    this.pendingAudioBytes = new Uint8Array(0);
    if (current !== null) {
      try {
        if (readCallback !== null) {
          current.off('readData', readCallback);
        }
      } catch (error) {
        logger.warn(TAG, 'unsubscribe capturer data failed: ' + String(error));
      }
      try {
        await current.stop();
      } catch (error) {
        logger.warn(TAG, 'stop capturer failed: ' + String(error));
      }
      try {
        await current.release();
      } catch (error) {
        logger.warn(TAG, 'release capturer failed: ' + String(error));
      }
    }
    await this.deactivateAudioSession();
  }

  private isSupportedRemoteAudioMimeType(value: string): boolean {
    return REMOTE_SUPPORTED_MIME_TYPES.includes(value);
  }

  private resolveRemoteAudioSampleFormat(sampleBits: number): audio.AudioSampleFormat {
    if (sampleBits === 8) {
      return audio.AudioSampleFormat.SAMPLE_FORMAT_U8;
    }
    if (sampleBits === 24) {
      return audio.AudioSampleFormat.SAMPLE_FORMAT_S24LE;
    }
    if (sampleBits === 32) {
      return audio.AudioSampleFormat.SAMPLE_FORMAT_S32LE;
    }
    return audio.AudioSampleFormat.SAMPLE_FORMAT_S16LE;
  }

  private handleCaptureFailure(message: string): void {
    if (!this.recording) {
      return;
    }
    this.recording = false;
    this.captureGeneration = this.captureGeneration + 1;
    this.releaseCaptureResources().catch((error: Error): void => {
      logger.warn(TAG, 'release failed capture resources: ' + String(error));
    });
    this.updateState(NGFVoicePlatformState.ERROR, NGFVoiceFailureCategory.CAPTURE_FAILED, message);
  }

  private updateState(state: string, failureCategory: string, message: string): void {
    this.snapshot.state = state;
    this.snapshot.failureCategory = failureCategory;
    this.snapshot.message = message;
    this.snapshot.updatedAt = Date.now();
    this.publishSnapshot();
  }

  private publishSnapshot(): void {
    if (this.listener !== null) {
      this.listener.onSnapshotChanged(this.copySnapshot(this.snapshot));
    }
  }

  private copySnapshot(source: NGFVoicePlatformSnapshot): NGFVoicePlatformSnapshot {
    const copy = new NGFVoicePlatformSnapshot();
    copy.state = source.state;
    copy.sessionId = source.sessionId;
    copy.partialTranscript = source.partialTranscript;
    copy.finalTranscript = source.finalTranscript;
    copy.vadActive = source.vadActive;
    copy.ttsRequestId = source.ttsRequestId;
    copy.audioSessionState = source.audioSessionState;
    copy.failureCategory = source.failureCategory;
    copy.message = source.message;
    copy.updatedAt = source.updatedAt;
    copy.capabilities = this.copyCapabilities(source.capabilities);
    return copy;
  }

  private copyCapabilities(source: NGFVoiceCapabilitySnapshot): NGFVoiceCapabilitySnapshot {
    const copy = new NGFVoiceCapabilitySnapshot();
    copy.audioCapture = source.audioCapture;
    copy.audioPlayback = source.audioPlayback;
    copy.speechRecognition = source.speechRecognition;
    copy.textToSpeech = source.textToSpeech;
    copy.engineVad = source.engineVad;
    copy.remoteSpeechToText = source.remoteSpeechToText;
    copy.remoteTextToSpeech = source.remoteTextToSpeech;
    copy.interruptionHandling = source.interruptionHandling;
    copy.microphonePermission = source.microphonePermission;
    copy.permissionRemediation = source.permissionRemediation;
    copy.failureCategory = source.failureCategory;
    copy.message = source.message;
    return copy;
  }

  private async ensureMicrophonePermission(): Promise<boolean> {
    let granted: boolean = ngfPermissionManagerFacade.checkPermission(MICROPHONE_PERMISSION);
    if (!granted) {
      granted = await ngfPermissionManagerFacade.requestPermissions([MICROPHONE_PERMISSION]);
    }
    if (granted || ngfPermissionManagerFacade.checkPermission(MICROPHONE_PERMISSION)) {
      this.snapshot.capabilities.microphonePermission = NGFVoicePermissionState.GRANTED;
      this.snapshot.capabilities.permissionRemediation = NGFVoicePermissionRemediation.NONE;
      this.snapshot.capabilities.failureCategory = NGFVoiceFailureCategory.NONE;
      this.snapshot.capabilities.message = '';
      this.publishSnapshot();
      return true;
    }
    this.snapshot.capabilities.microphonePermission = NGFVoicePermissionState.DENIED;
    this.snapshot.capabilities.permissionRemediation = NGFVoicePermissionRemediation.OPEN_APP_PERMISSION_SETTINGS;
    this.snapshot.capabilities.failureCategory = NGFVoiceFailureCategory.PERMISSION_DENIED;
    this.snapshot.capabilities.message = 'Microphone permission denied';
    this.publishSnapshot();
    return false;
  }
}

export const ngfVoicePlatformFacade: IVoicePlatform = new VoicePlatformFacade();
