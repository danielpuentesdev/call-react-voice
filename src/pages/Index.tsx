import VoiceAssistant from '@/components/VoiceAssistant';

const Index = () => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <VoiceAssistant 
        websocketUrl="wss://tu-servidor.com/ws" // Cambia por tu URL real
        onCallEnd={() => console.log('Llamada terminada')}
      />
    </div>
  );
};

export default Index;
