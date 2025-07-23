import VoiceAssistant from '@/components/VoiceAssistant';

const Index = () => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <VoiceAssistant 
        websocketUrl="ws://localhost:8080" 
        onCallEnd={() => console.log('Llamada terminada')}
      />
    </div>
  );
};

export default Index;
