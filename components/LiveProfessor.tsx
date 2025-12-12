import React, { useEffect, useRef, useState, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, Blob } from '@google/genai';
import { UploadedFile } from '../types';
import { Mic, MicOff, X, Volume2, Loader2 } from 'lucide-react';

interface LiveProfessorProps {
  files: UploadedFile[];
  onClose: () => void;
  contextSummary: string;
}

const LiveProfessor: React.FC<LiveProfessorProps> = ({ files, onClose, contextSummary }) => {
  const [isActive, setIsActive] = useState(false);
  const [status, setStatus] = useState<'connecting' | 'listening' | 'speaking' | 'error'>('connecting');
  const [errorMessage, setErrorMessage] = useState('');
  
  // Refs for cleanup
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const inputContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  // Helper functions for Audio
  const createBlob = (data: Float32Array): Blob => {
    const l = data.length;
    const int16 = new Int16Array(l);
    for (let i = 0; i < l; i++) {
      int16[i] = data[i] * 32768;
    }
    
    // Manual base64 encoding for the blob data
    let binary = '';
    const bytes = new Uint8Array(int16.buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64Data = btoa(binary);

    return {
      data: base64Data,
      mimeType: 'audio/pcm;rate=16000',
    };
  };

  const decodeAudioData = async (
    base64: string,
    ctx: AudioContext
  ): Promise<AudioBuffer> => {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    const dataInt16 = new Int16Array(bytes.buffer);
    const frameCount = dataInt16.length;
    const buffer = ctx.createBuffer(1, frameCount, 24000);
    const channelData = buffer.getChannelData(0);
    
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i] / 32768.0;
    }
    return buffer;
  };

  const startSession = useCallback(async () => {
    try {
      setErrorMessage('');
      setStatus('connecting');
      const apiKey = process.env.API_KEY || '';
      const ai = new GoogleGenAI({ apiKey });

      // Initialize Audio Contexts
      const outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      audioContextRef.current = outputCtx;
      
      const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      inputContextRef.current = inputCtx;

      // Get Mic Stream
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
          },
          systemInstruction: `You are a helpful and knowledgeable professor teaching a class. 
          The user has uploaded book pages on the topic: "${contextSummary}".
          Answer questions specifically based on the context of the book pages provided. 
          Be encouraging, academic but accessible. 
          If the user asks something unrelated, gently steer them back to the lecture topic.`,
        },
        callbacks: {
          onopen: () => {
            console.log('Live Session Opened');
            setStatus('listening');
            setIsActive(true);

            // Send initial images as context
            sessionPromiseRef.current?.then(session => {
              files.forEach(file => {
                 session.sendRealtimeInput({
                   media: {
                     mimeType: file.mimeType,
                     data: file.data
                   }
                 });
              });
              // Send a "hello" trigger to let the model know context is ready
              session.sendRealtimeInput({
                media: {
                  mimeType: "text/plain",
                  data: btoa("I have uploaded the book pages. I am ready to ask questions.")
                }
              });
            });

            // Setup Mic Stream Processing
            const source = inputCtx.createMediaStreamSource(stream);
            const processor = inputCtx.createScriptProcessor(4096, 1, 1);
            processorRef.current = processor;

            processor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              const pcmBlob = createBlob(inputData);
              sessionPromiseRef.current?.then((session) => {
                session.sendRealtimeInput({ media: pcmBlob });
              });
            };

            source.connect(processor);
            processor.connect(inputCtx.destination);
          },
          onmessage: async (msg: LiveServerMessage) => {
            // Handle Audio Output
            const base64Audio = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (base64Audio && audioContextRef.current) {
               setStatus('speaking');
               const ctx = audioContextRef.current;
               nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
               
               const buffer = await decodeAudioData(base64Audio, ctx);
               const source = ctx.createBufferSource();
               source.buffer = buffer;
               source.connect(ctx.destination);
               
               source.addEventListener('ended', () => {
                 sourcesRef.current.delete(source);
                 if (sourcesRef.current.size === 0) {
                    setStatus('listening');
                 }
               });
               
               source.start(nextStartTimeRef.current);
               nextStartTimeRef.current += buffer.duration;
               sourcesRef.current.add(source);
            }

            // Handle Interruption
            if (msg.serverContent?.interrupted) {
              sourcesRef.current.forEach(s => s.stop());
              sourcesRef.current.clear();
              nextStartTimeRef.current = 0;
              setStatus('listening');
            }
          },
          onclose: () => {
            console.log('Live Session Closed');
            cleanup();
          },
          onerror: (e) => {
            console.error('Live Session Error', e);
            setErrorMessage("Connection error. Please try again.");
            setStatus('error');
            cleanup();
          }
        }
      });
      
      sessionPromiseRef.current = sessionPromise;

    } catch (err) {
      console.error("Failed to start session", err);
      setErrorMessage("Could not access microphone or connect.");
      setStatus('error');
    }
  }, [files, contextSummary]);

  const cleanup = () => {
    setIsActive(false);
    
    // Stop mic processing
    if (processorRef.current && inputContextRef.current) {
        processorRef.current.disconnect();
        processorRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (inputContextRef.current) {
        inputContextRef.current.close();
        inputContextRef.current = null;
    }

    // Stop audio playback
    sourcesRef.current.forEach(s => s.stop());
    sourcesRef.current.clear();
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    sessionPromiseRef.current = null;
  };

  useEffect(() => {
    startSession();
    return cleanup;
  }, [startSession]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-stone-900 text-stone-100 p-8 rounded-3xl max-w-lg w-full flex flex-col items-center relative shadow-2xl border border-stone-700">
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 p-2 hover:bg-stone-800 rounded-full transition-colors"
        >
          <X className="w-6 h-6" />
        </button>

        <div className="w-24 h-24 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center mb-6 shadow-lg shadow-purple-500/20">
            {status === 'connecting' && <Loader2 className="w-10 h-10 animate-spin text-white" />}
            {status === 'listening' && <Mic className="w-10 h-10 text-white animate-pulse" />}
            {status === 'speaking' && <Volume2 className="w-10 h-10 text-white animate-bounce" />}
            {status === 'error' && <MicOff className="w-10 h-10 text-red-300" />}
        </div>

        <h2 className="text-2xl font-serif font-semibold mb-2">Professor AI</h2>
        
        <p className="text-stone-400 text-center mb-8 h-6">
          {status === 'connecting' && "Connecting to class..."}
          {status === 'listening' && "Listening... Ask your question."}
          {status === 'speaking' && "Professor is explaining..."}
          {status === 'error' && errorMessage}
        </p>

        <div className="flex gap-4">
             {status === 'error' ? (
                <button 
                onClick={() => { cleanup(); startSession(); }}
                className="px-6 py-3 bg-stone-700 hover:bg-stone-600 rounded-full font-medium transition-colors"
              >
                Retry Connection
              </button>
             ) : (
                <button 
                onClick={onClose}
                className="px-6 py-3 bg-red-500/20 text-red-200 hover:bg-red-500/30 rounded-full font-medium transition-colors border border-red-500/30"
              >
                End Session
              </button>
             )}
        </div>
      </div>
    </div>
  );
};

export default LiveProfessor;