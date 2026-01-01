
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI, Modality, LiveServerMessage } from '@google/genai';
import { VoiceName, PERSONAS, TranscriptionEntry } from './types';
import { decode, decodeAudioData, createPcmBlob } from './utils/audioHelpers';
import { Mic, MicOff, Settings, Volume2, MessageSquare, Waves, History } from 'lucide-react';

const App: React.FC = () => {
  const [isActive, setIsActive] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState<VoiceName>(VoiceName.ZEPHYR);
  const [history, setHistory] = useState<TranscriptionEntry[]>([]);
  const [currentInput, setCurrentInput] = useState('');
  const [currentOutput, setCurrentOutput] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle');

  const sessionRef = useRef<any>(null);
  const audioContextRef = useRef<{ input: AudioContext; output: AudioContext } | null>(null);
  const nextStartTimeRef = useRef(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const streamRef = useRef<MediaStream | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Audio Processing Setup
  const setupAudio = async () => {
    const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
    const outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    audioContextRef.current = { input: inputCtx, output: outputCtx };
    
    streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
    return { inputCtx, outputCtx, stream: streamRef.current };
  };

  const stopAudio = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    if (audioContextRef.current) {
      audioContextRef.current.input.close();
      audioContextRef.current.output.close();
    }
    sourcesRef.current.forEach(source => source.stop());
    sourcesRef.current.clear();
    nextStartTimeRef.current = 0;
  };

  const handleStartSession = async () => {
    if (isActive) {
      setIsActive(false);
      setConnectionStatus('idle');
      sessionRef.current?.close();
      stopAudio();
      return;
    }

    try {
      setConnectionStatus('connecting');
      const { inputCtx, outputCtx, stream } = await setupAudio();
      const ai = new GoogleGenAI({ apiKey: (process.env as any).API_KEY });
      
      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: selectedVoice } },
          },
          systemInstruction: `You are a voice transformation assistant. Act as the persona: ${selectedVoice}. Keep your responses concise and engaging.`,
          outputAudioTranscription: {},
          inputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => {
            setConnectionStatus('connected');
            setIsActive(true);
            
            const source = inputCtx.createMediaStreamSource(stream);
            const scriptProcessor = inputCtx.createScriptProcessor(4096, 1, 1);
            
            scriptProcessor.onaudioprocess = (e) => {
              if (isMuted) return;
              const inputData = e.inputBuffer.getChannelData(0);
              const pcmBlob = createPcmBlob(inputData);
              sessionPromise.then(session => {
                session.sendRealtimeInput({ media: pcmBlob });
              });
            };
            
            source.connect(scriptProcessor);
            scriptProcessor.connect(inputCtx.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            // Handle Audio
            const audioData = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (audioData) {
              const outCtx = audioContextRef.current?.output;
              if (outCtx) {
                nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outCtx.currentTime);
                const buffer = await decodeAudioData(decode(audioData), outCtx, 24000, 1);
                const source = outCtx.createBufferSource();
                source.buffer = buffer;
                source.connect(outCtx.destination);
                source.addEventListener('ended', () => sourcesRef.current.delete(source));
                source.start(nextStartTimeRef.current);
                nextStartTimeRef.current += buffer.duration;
                sourcesRef.current.add(source);
              }
            }

            // Handle Transcriptions
            if (message.serverContent?.inputTranscription) {
              setCurrentInput(prev => prev + message.serverContent!.inputTranscription!.text);
            }
            if (message.serverContent?.outputTranscription) {
              setCurrentOutput(prev => prev + message.serverContent!.outputTranscription!.text);
            }

            if (message.serverContent?.turnComplete) {
              setHistory(prev => [
                ...prev,
                { id: Math.random().toString(), type: 'user', text: currentInput, timestamp: Date.now() },
                { id: Math.random().toString(), type: 'model', text: currentOutput, timestamp: Date.now() }
              ]);
              setCurrentInput('');
              setCurrentOutput('');
            }

            if (message.serverContent?.interrupted) {
              sourcesRef.current.forEach(s => s.stop());
              sourcesRef.current.clear();
              nextStartTimeRef.current = 0;
            }
          },
          onerror: (e) => {
            console.error('Session Error:', e);
            setConnectionStatus('error');
            setIsActive(false);
          },
          onclose: () => {
            setConnectionStatus('idle');
            setIsActive(false);
          }
        }
      });

      sessionRef.current = await sessionPromise;
    } catch (err) {
      console.error('Failed to start session:', err);
      setConnectionStatus('error');
    }
  };

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [history, currentInput, currentOutput]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 md:p-8">
      {/* Background decoration */}
      <div className="fixed inset-0 overflow-hidden -z-10">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-blue-900/20 blur-[120px]"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-purple-900/20 blur-[120px]"></div>
      </div>

      <main className="w-full max-w-4xl grid grid-cols-1 lg:grid-cols-12 gap-6 h-full max-h-[90vh]">
        {/* Sidebar / Settings */}
        <aside className="lg:col-span-4 flex flex-col gap-6 order-2 lg:order-1">
          <div className="glass rounded-3xl p-6 flex flex-col gap-6">
            <div className="flex items-center gap-2 mb-2">
              <Settings className="text-blue-400 w-5 h-5" />
              <h2 className="text-xl font-outfit font-bold">Voice Persona</h2>
            </div>
            
            <div className="grid grid-cols-1 gap-3">
              {PERSONAS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => !isActive && setSelectedVoice(p.id)}
                  disabled={isActive}
                  className={`relative p-4 rounded-2xl transition-all duration-300 text-left overflow-hidden group
                    ${selectedVoice === p.id ? 'ring-2 ring-blue-500 bg-white/5' : 'bg-white/0 hover:bg-white/5 opacity-60 hover:opacity-100'}
                    ${isActive ? 'cursor-not-allowed grayscale-[0.5]' : 'cursor-pointer'}
                  `}
                >
                  <div className={`absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b ${p.color}`}></div>
                  <p className="font-bold text-lg mb-1">{p.label}</p>
                  <p className="text-xs text-gray-400">{p.description}</p>
                </button>
              ))}
            </div>

            <div className="mt-auto pt-6 border-t border-white/10">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${isActive ? 'bg-green-500 animate-pulse' : 'bg-gray-500'}`}></div>
                  <span className="text-sm text-gray-400 capitalize">{connectionStatus}</span>
                </div>
                <button 
                  onClick={() => setIsMuted(!isMuted)}
                  className={`p-2 rounded-full transition-colors ${isMuted ? 'bg-red-500/20 text-red-400' : 'hover:bg-white/5 text-gray-400'}`}
                >
                  <Volume2 className={`w-5 h-5 ${isMuted ? 'opacity-50' : ''}`} />
                </button>
              </div>
            </div>
          </div>
        </aside>

        {/* Main Content / Chat */}
        <div className="lg:col-span-8 flex flex-col order-1 lg:order-2">
          {/* Header */}
          <header className="mb-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-gradient-to-br from-blue-500 to-purple-600 p-2.5 rounded-2xl shadow-lg shadow-blue-500/20">
                <Waves className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-outfit font-extrabold tracking-tight">VoxShift AI</h1>
                <p className="text-xs text-gray-400 font-medium">REAL-TIME VOICE TRANSFORMATION</p>
              </div>
            </div>
          </header>

          {/* Chat Window */}
          <div className="glass rounded-3xl flex-1 flex flex-col min-h-0 relative overflow-hidden">
            <div 
              ref={scrollRef}
              className="flex-1 overflow-y-auto p-6 space-y-4 scroll-smooth"
            >
              {history.length === 0 && !currentInput && !currentOutput && (
                <div className="h-full flex flex-col items-center justify-center text-center opacity-40 px-10">
                  <MessageSquare className="w-12 h-12 mb-4" />
                  <p className="text-lg font-medium">Ready for conversation</p>
                  <p className="text-sm max-w-[240px]">Select a persona and start the engine to begin your AI voice experience.</p>
                </div>
              )}

              {history.map((entry) => (
                <div key={entry.id} className={`flex ${entry.type === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                    entry.type === 'user' 
                      ? 'bg-blue-600/20 text-blue-100 rounded-tr-none' 
                      : 'bg-white/5 text-gray-200 rounded-tl-none'
                  }`}>
                    {entry.text}
                  </div>
                </div>
              ))}

              {/* Streaming Content */}
              {currentInput && (
                <div className="flex justify-end">
                  <div className="max-w-[85%] px-4 py-3 rounded-2xl text-sm bg-blue-600/20 text-blue-100 rounded-tr-none animate-pulse">
                    {currentInput}
                  </div>
                </div>
              )}
              {currentOutput && (
                <div className="flex justify-start">
                  <div className="max-w-[85%] px-4 py-3 rounded-2xl text-sm bg-white/5 text-gray-200 rounded-tl-none">
                    {currentOutput}
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-400 ml-1 animate-pulse"></span>
                  </div>
                </div>
              )}
            </div>

            {/* Transcription Floating Button */}
            <div className="absolute top-4 right-4 flex gap-2">
              <button className="glass p-2 rounded-xl text-xs flex items-center gap-2 hover:bg-white/10 transition-colors">
                <History className="w-4 h-4" />
                <span>History</span>
              </button>
            </div>

            {/* Footer Control Area */}
            <div className="p-6 bg-gradient-to-t from-black/20 to-transparent">
              <div className="flex items-center justify-center">
                <button
                  onClick={handleStartSession}
                  className={`
                    group relative p-8 rounded-full transition-all duration-500 transform active:scale-95
                    ${isActive 
                      ? 'bg-red-500/20 ring-4 ring-red-500/20 shadow-[0_0_50px_rgba(239,68,68,0.3)]' 
                      : 'bg-blue-600 hover:bg-blue-500 shadow-[0_0_30px_rgba(37,99,235,0.4)]'}
                  `}
                >
                  <div className={`absolute inset-0 rounded-full border-2 transition-transform duration-1000 ${isActive ? 'animate-ping border-red-500/40' : 'border-transparent'}`}></div>
                  
                  {isActive ? (
                    <MicOff className="w-10 h-10 text-red-500" />
                  ) : (
                    <Mic className="w-10 h-10 text-white" />
                  )}
                  
                  <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 whitespace-nowrap text-xs font-bold tracking-widest uppercase opacity-60">
                    {isActive ? 'Stop Stream' : 'Start VoxShift'}
                  </div>
                </button>
              </div>

              {isActive && (
                <div className="mt-12 flex justify-center gap-1.5">
                  {[...Array(24)].map((_, i) => (
                    <div 
                      key={i} 
                      className={`w-1 bg-gradient-to-t from-blue-500 to-purple-500 rounded-full animate-bounce h-4`}
                      style={{ 
                        animationDelay: `${i * 0.05}s`,
                        animationDuration: `${0.8 + Math.random()}s`,
                        opacity: 0.3 + (i / 24) * 0.7
                      }}
                    ></div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;
