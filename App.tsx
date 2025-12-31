
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { GoogleGenAI, Modality, Type, LiveServerMessage } from "@google/genai";
import { AppState, EditHistoryItem } from './types';
import Sidebar from './components/Sidebar';
import EditorArea from './components/EditorArea';
import { geminiService } from './services/geminiService';
import { fileToBase64, downloadImage } from './utils/imageUtils';

// Helper for audio encoding/decoding as per guidelines
const encode = (bytes: Uint8Array) => {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};

const decode = (base64: string) => {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
};

async function decodeAudioData(data: Uint8Array, ctx: AudioContext, sampleRate: number, numChannels: number): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

const App: React.FC = () => {
  const [state, setState] = useState<AppState>({
    originalImage: null,
    currentImage: null,
    history: [],
    isProcessing: false,
    prompt: '',
    error: null,
  });

  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [transcription, setTranscription] = useState('');
  
  const lastProcessedPrompt = useRef<string>('');
  const sessionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef(0);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  // Function to process image edits (shared by text and voice)
  const processEdit = useCallback(async (targetPrompt: string) => {
    // Avoid double processing the same prompt
    if (!state.currentImage || !targetPrompt || targetPrompt === lastProcessedPrompt.current) return;

    setState(prev => ({ ...prev, isProcessing: true, error: null }));
    lastProcessedPrompt.current = targetPrompt;

    try {
      const resultImage = await geminiService.editImage(state.currentImage, targetPrompt);
      
      const newHistoryItem: EditHistoryItem = {
        id: uuidv4(),
        imageUrl: resultImage,
        prompt: targetPrompt,
        timestamp: Date.now(),
      };

      setState(prev => ({
        ...prev,
        currentImage: resultImage,
        history: [newHistoryItem, ...prev.history],
        isProcessing: false,
        prompt: '',
      }));
      return "Edit applied successfully.";
    } catch (err) {
      console.error(err);
      setState(prev => ({ 
        ...prev, 
        isProcessing: false, 
        error: 'AI was unable to process this edit.' 
      }));
      return "Failed to apply edit.";
    }
  }, [state.currentImage]);

  const toggleVoiceMode = async (e?: React.MouseEvent) => {
    if (e) e.preventDefault(); // Prevent form submission if triggered inside form
    
    if (isVoiceActive) {
      if (sessionRef.current) {
        sessionRef.current.close();
      }
      setIsVoiceActive(false);
      setTranscription('');
      return;
    }

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      const inputCtx = new AudioContext({ sampleRate: 16000 });
      const outputCtx = new AudioContext({ sampleRate: 24000 });
      audioContextRef.current = outputCtx;

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: 'You are a professional photo editing assistant. When a user describes a change for their photo, call the "apply_image_edit" tool with a concise description of the edit. Be friendly and confirm you are starting the edit.',
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } },
          },
          tools: [{
            functionDeclarations: [{
              name: 'apply_image_edit',
              description: 'Trigger an image edit based on user instructions.',
              parameters: {
                type: Type.OBJECT,
                properties: {
                  instruction: { type: Type.STRING, description: 'The specific editing instruction (e.g., "make it brighter", "add a dog").' }
                },
                required: ['instruction']
              }
            }]
          }],
          inputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => {
            setIsVoiceActive(true);
            const source = inputCtx.createMediaStreamSource(stream);
            const scriptProcessor = inputCtx.createScriptProcessor(4096, 1, 1);
            scriptProcessor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              const int16 = new Int16Array(inputData.length);
              for (let i = 0; i < inputData.length; i++) int16[i] = inputData[i] * 32768;
              sessionPromise.then(s => s.sendRealtimeInput({ 
                media: { data: encode(new Uint8Array(int16.buffer)), mimeType: 'audio/pcm;rate=16000' } 
              }));
            };
            source.connect(scriptProcessor);
            scriptProcessor.connect(inputCtx.destination);
          },
          onmessage: async (msg: LiveServerMessage) => {
            if (msg.toolCall) {
              for (const fc of msg.toolCall.functionCalls) {
                if (fc.name === 'apply_image_edit') {
                  const result = await processEdit(fc.args.instruction);
                  sessionPromise.then(s => s.sendToolResponse({
                    functionResponses: { id: fc.id, name: fc.name, response: { result } }
                  }));
                }
              }
            }

            if (msg.serverContent?.inputTranscription) {
              setTranscription(prev => prev + ' ' + msg.serverContent?.inputTranscription?.text);
              if (msg.serverContent?.turnComplete) setTranscription('');
            }

            const audioData = msg.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (audioData) {
              const ctx = audioContextRef.current!;
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
              const buffer = await decodeAudioData(decode(audioData), ctx, 24000, 1);
              const source = ctx.createBufferSource();
              source.buffer = buffer;
              source.connect(ctx.destination);
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += buffer.duration;
              activeSourcesRef.current.add(source);
              source.onended = () => activeSourcesRef.current.delete(source);
            }

            if (msg.serverContent?.interrupted) {
              activeSourcesRef.current.forEach(s => s.stop());
              activeSourcesRef.current.clear();
            }
          },
          onclose: () => setIsVoiceActive(false),
          onerror: (e) => {
            console.error("Voice Session Error", e);
            setIsVoiceActive(false);
          }
        }
      });

      sessionRef.current = await sessionPromise;
    } catch (err) {
      console.error("Failed to start voice mode", err);
      setState(prev => ({ ...prev, error: "Microphone access denied or connection failed." }));
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const base64 = await fileToBase64(file);
        setState(prev => ({
          ...prev,
          originalImage: base64,
          currentImage: base64,
          error: null,
        }));
      } catch (err) {
        setState(prev => ({ ...prev, error: 'Failed to load image' }));
      }
    }
  };

  const handleSubmitPrompt = (e: React.FormEvent) => {
    e.preventDefault();
    processEdit(state.prompt);
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-slate-950">
      <Sidebar 
        history={state.history} 
        onSelectHistory={(item) => setState(prev => ({ ...prev, currentImage: item.imageUrl }))}
        onClearHistory={() => setState(prev => ({ ...prev, history: [] }))}
      />

      <main className="flex-1 flex flex-col h-full relative">
        <header className="h-16 border-b border-slate-700/50 flex items-center justify-between px-8 bg-slate-900/50 backdrop-blur-md z-10">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <i className="fas fa-magic text-white text-sm"></i>
            </div>
            <h1 className="text-lg font-bold tracking-tight">NanoEdit AI</h1>
          </div>

          <div className="flex items-center gap-4">
            {state.currentImage && (
              <>
                <button onClick={() => setState(prev => ({ ...prev, currentImage: prev.originalImage, prompt: '' }))} className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors">Reset</button>
                <button onClick={() => state.currentImage && downloadImage(state.currentImage, 'edited.png')} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm font-medium transition-all flex items-center gap-2">
                  <i className="fas fa-download"></i> Export
                </button>
              </>
            )}
          </div>
        </header>

        <EditorArea 
          currentImage={state.currentImage}
          isProcessing={state.isProcessing}
          onImageUpload={handleImageUpload}
          error={state.error}
        />

        {/* Bottom Bar Input Area */}
        <div className="p-6 pb-10 bg-gradient-to-t from-slate-950 to-transparent">
          <div className="max-w-4xl mx-auto relative">
            
            {/* Voice status floating above the input bar */}
            {isVoiceActive && (
              <div className="absolute -top-24 right-0 z-20 bg-slate-900/90 border border-blue-500/50 p-4 rounded-2xl shadow-2xl backdrop-blur-xl max-w-xs animate-in slide-in-from-bottom">
                <div className="flex items-center gap-3 mb-2">
                  <div className="flex gap-1 items-end h-4">
                    {[1, 2, 3, 4].map(i => (
                      <div key={i} className="w-1 bg-blue-500 rounded-full animate-bounce" style={{ height: `${Math.random() * 100}%`, animationDelay: `${i * 0.1}s` }}></div>
                    ))}
                  </div>
                  <span className="text-xs font-bold text-blue-400 uppercase tracking-widest">Listening...</span>
                </div>
                <p className="text-sm text-slate-300 italic line-clamp-2">
                  {transcription || "Say something like 'Make it a winter theme'..."}
                </p>
              </div>
            )}

            <form onSubmit={handleSubmitPrompt} className={`relative group transition-all ${state.currentImage ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
              <div className="absolute -inset-1 bg-gradient-to-r from-blue-600 to-cyan-500 rounded-2xl blur opacity-25 group-focus-within:opacity-75 transition-opacity"></div>
              <div className="relative flex items-center gap-3 bg-slate-900 border border-slate-700/50 rounded-2xl p-2 pl-3 shadow-2xl">
                
                {/* Voice Toggle Button inside the bar */}
                <button 
                  type="button"
                  onClick={toggleVoiceMode}
                  className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all active:scale-90 ${
                    isVoiceActive 
                      ? 'bg-red-500 text-white animate-pulse' 
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-blue-400'
                  }`}
                  title={isVoiceActive ? "Stop Voice Mode" : "Start Voice Control"}
                >
                  <i className={`fas ${isVoiceActive ? 'fa-microphone-slash' : 'fa-microphone'} text-xl`}></i>
                </button>

                <input 
                  type="text" 
                  value={state.prompt}
                  onChange={(e) => setState(prev => ({ ...prev, prompt: e.target.value }))}
                  placeholder={isVoiceActive ? "I'm listening..." : "Describe the changes..."}
                  className="flex-1 bg-transparent border-none focus:ring-0 text-white placeholder-slate-500 py-3 text-lg outline-none"
                  disabled={state.isProcessing}
                />
                
                <button 
                  type="submit" 
                  disabled={state.isProcessing || !state.prompt.trim()} 
                  className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold transition-all bg-blue-600 hover:bg-blue-500 text-white shadow-lg disabled:bg-slate-800 disabled:text-slate-500"
                >
                  {state.isProcessing ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-sparkles"></i>}
                  Apply
                </button>
              </div>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;
