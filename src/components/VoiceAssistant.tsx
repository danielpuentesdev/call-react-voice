import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Mic, MicOff, Phone, PhoneOff } from 'lucide-react';

interface VoiceAssistantProps {
  websocketUrl?: string;
  onCallEnd?: () => void;
}

const VoiceAssistant: React.FC<VoiceAssistantProps> = ({ 
  websocketUrl = 'ws://localhost:8080', 
  onCallEnd 
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Función para interrumpir cualquier audio en reproducción
  const stopCurrentAudio = useCallback(() => {
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current.currentTime = 0;
      currentAudioRef.current = null;
      setIsPlaying(false);
    }
  }, []);

  // Función para reproducir audio recibido del backend
  const playAudio = useCallback(async (base64Audio: string) => {
    try {
      // Interrumpir cualquier audio previo
      stopCurrentAudio();

      // Decodificar base64 a blob
      const audioData = atob(base64Audio);
      const arrayBuffer = new ArrayBuffer(audioData.length);
      const view = new Uint8Array(arrayBuffer);
      for (let i = 0; i < audioData.length; i++) {
        view[i] = audioData.charCodeAt(i);
      }

      const blob = new Blob([arrayBuffer], { type: 'audio/wav' });
      const audioUrl = URL.createObjectURL(blob);
      
      const audio = new Audio(audioUrl);
      currentAudioRef.current = audio;
      setIsPlaying(true);

      audio.onended = () => {
        setIsPlaying(false);
        URL.revokeObjectURL(audioUrl);
        currentAudioRef.current = null;
      };

      audio.onerror = () => {
        setIsPlaying(false);
        URL.revokeObjectURL(audioUrl);
        currentAudioRef.current = null;
        console.error('Error reproduciendo audio');
      };

      await audio.play();
    } catch (error) {
      console.error('Error al reproducir audio:', error);
      setIsPlaying(false);
    }
  }, [stopCurrentAudio]);

  // Configurar WebSocket
  const setupWebSocket = useCallback(() => {
    // Solo intentar conectar si hay una URL válida
    if (!websocketUrl || websocketUrl === 'ws://localhost:8080') {
      console.log('WebSocket no configurado o usando URL por defecto - modo demo');
      setError('WebSocket no configurado (modo demo)');
      return;
    }

    try {
      console.log('Intentando conectar WebSocket:', websocketUrl);
      const ws = new WebSocket(websocketUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('WebSocket conectado exitosamente');
        setIsConnected(true);
        setError(null);
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          console.log('Mensaje recibido:', message);
          
          if (message.type === 'tts_chunk' && message.data) {
            playAudio(message.data);
          }
        } catch (error) {
          console.error('Error procesando mensaje WebSocket:', error);
        }
      };

      ws.onclose = (event) => {
        console.log('WebSocket desconectado. Código:', event.code, 'Razón:', event.reason);
        setIsConnected(false);
      };

      ws.onerror = (error) => {
        console.error('Error WebSocket:', error);
        setError('No se pudo conectar al WebSocket. Verifica que tu servidor esté corriendo.');
        setIsConnected(false);
      };

    } catch (error) {
      console.error('Error configurando WebSocket:', error);
      setError('Error configurando WebSocket: ' + error);
    }
  }, [websocketUrl, playAudio]);

  // Configurar grabación de audio
  const setupRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true
        } 
      });
      
      streamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });
      
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = async (event) => {
        if (event.data.size > 0 && wsRef.current?.readyState === WebSocket.OPEN) {
          // Interrumpir cualquier audio en reproducción cuando el usuario habla
          stopCurrentAudio();

          try {
            const arrayBuffer = await event.data.arrayBuffer();
            const base64Audio = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
            
            wsRef.current.send(JSON.stringify({
              type: 'audio_chunk',
              data: base64Audio
            }));
          } catch (error) {
            console.error('Error enviando audio:', error);
          }
        }
      };

      mediaRecorder.onstart = () => {
        setIsRecording(true);
        console.log('Grabación iniciada');
      };

      mediaRecorder.onstop = () => {
        setIsRecording(false);
        console.log('Grabación detenida');
      };

      // Enviar chunks cada 250ms para tiempo real
      mediaRecorder.start(250);

    } catch (error) {
      console.error('Error accediendo al micrófono:', error);
      setError('Error accediendo al micrófono. Verifica los permisos.');
    }
  }, [stopCurrentAudio]);

  // Iniciar la "llamada"
  const startCall = useCallback(async () => {
    setupWebSocket();
    await setupRecording();
  }, [setupWebSocket, setupRecording]);

  // Colgar la llamada
  const endCall = useCallback(() => {
    // Detener grabación
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
    }

    // Cerrar stream de audio
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    // Cerrar WebSocket
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    // Detener cualquier audio en reproducción
    stopCurrentAudio();

    // Limpiar contexto de audio
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    setIsRecording(false);
    setIsConnected(false);
    setIsPlaying(false);
    setError(null);

    // Callback opcional
    if (onCallEnd) {
      onCallEnd();
    }
  }, [isRecording, stopCurrentAudio, onCallEnd]);

  // Iniciar automáticamente al montar el componente
  useEffect(() => {
    console.log('Componente montado, iniciando llamada...');
    startCall();

    // Cleanup al desmontar
    return () => {
      console.log('Componente desmontado, terminando llamada...');
      endCall();
    };
  }, []); // Sin dependencias para evitar re-renders

  return (
    <div className="flex flex-col items-center space-y-4 p-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold mb-2">Asistente de Voz</h2>
        
        {/* Estados de conexión */}
        <div className="flex items-center justify-center space-x-4 mb-4">
          <div className={`flex items-center space-x-2 ${isConnected ? 'text-green-600' : 'text-red-600'}`}>
            <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
            <span className="text-sm">
              {isConnected ? 'Conectado' : 'Desconectado'}
            </span>
          </div>

          <div className={`flex items-center space-x-2 ${isRecording ? 'text-red-600' : 'text-gray-600'}`}>
            {isRecording ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
            <span className="text-sm">
              {isRecording ? 'Grabando' : 'No grabando'}
            </span>
          </div>

          {isPlaying && (
            <div className="flex items-center space-x-2 text-blue-600">
              <div className="w-3 h-3 rounded-full bg-blue-500 animate-pulse"></div>
              <span className="text-sm">Reproduciendo</span>
            </div>
          )}
        </div>

        {/* Error display */}
        {error && (
          <div className="text-red-600 text-sm mb-4 p-2 bg-red-50 rounded">
            {error}
          </div>
        )}

        {/* Botón para colgar */}
        <Button 
          onClick={endCall}
          variant="destructive"
          size="lg"
          className="flex items-center space-x-2"
        >
          <PhoneOff className="w-5 h-5" />
          <span>Colgar Llamada</span>
        </Button>

        <div className="text-xs text-gray-500 mt-4">
          <p>• La grabación se inicia automáticamente</p>
          <p>• Habla normalmente, el asistente te responderá</p>
          <p>• Si hablas mientras el asistente responde, lo interrumpirás</p>
        </div>
      </div>
    </div>
  );
};

export default VoiceAssistant;