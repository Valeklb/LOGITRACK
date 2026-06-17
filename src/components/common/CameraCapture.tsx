import React, { useState, useRef, useEffect } from 'react';
import { ArrowLeft, MapPin, AlertCircle, Camera } from 'lucide-react';
import { Button } from './UI';

export const CameraCapture = ({ type, onCapture, onCancel }: { type: string, onCapture: (data: any) => void, onCancel: () => void }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [gps, setGps] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    startCamera();
    getGPS();
    return () => stream?.getTracks().forEach(t => t.stop());
  }, []);

  const startCamera = async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      setStream(s);
      if (videoRef.current) videoRef.current.srcObject = s;
    } catch (err) {
      setError('Câmera não disponível. Verifique as permissões.');
    }
  };

  const getGPS = () => {
    navigator.geolocation.getCurrentPosition(
      (pos) => setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
      (err) => setError('GPS não disponível. Verifique as permissões.'),
      { enableHighAccuracy: true }
    );
  };

  const takePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const context = canvasRef.current.getContext('2d');
      canvasRef.current.width = videoRef.current.videoWidth;
      canvasRef.current.height = videoRef.current.videoHeight;
      context?.drawImage(videoRef.current, 0, 0);
      setPhoto(canvasRef.current.toDataURL('image/jpeg', 0.8));
    }
  };

  const handleConfirm = () => {
    if (!photo || !gps) return;
    setLoading(true);
    const data = {
      type,
      photo_data: photo,
      ...gps,
      battery_level: (navigator as any).battery?.level || 0.85,
      network_type: (navigator as any).connection?.effectiveType || '4g',
      device_id: 'WEB_BROWSER_ID',
      local_time: new Date().toISOString(),
      observation: ''
    };
    onCapture(data);
  };

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      <div className="p-4 flex justify-between items-center text-white">
        <button onClick={onCancel} className="p-2"><ArrowLeft /></button>
        <span className="font-bold uppercase tracking-widest text-xs">Registrar {type}</span>
        <div className="w-10" />
      </div>

      <div className="flex-1 relative bg-zinc-900 flex items-center justify-center overflow-hidden">
        {error && <div className="p-6 text-center text-white space-y-4"><AlertCircle size={48} className="mx-auto text-red-500" /> <p>{error}</p> <Button onClick={onCancel}>Voltar</Button></div>}
        
        {!photo ? (
          <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
        ) : (
          <img src={photo} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
        )}

        <div className="absolute bottom-6 left-6 right-6 space-y-4">
          {gps && (
            <div className="bg-black/50 backdrop-blur-md text-white p-3 rounded-2xl text-[10px] flex items-center gap-2">
              <MapPin size={12} className="text-emerald-400" />
              GPS Ativo: {gps.lat.toFixed(5)}, {gps.lng.toFixed(5)} (±{gps.accuracy.toFixed(1)}m)
            </div>
          )}
          
          {!photo ? (
            <button 
              onClick={takePhoto}
              className="w-20 h-20 bg-white rounded-full border-8 border-white/30 mx-auto block active:scale-90 transition-transform"
            />
          ) : (
            <div className="flex gap-4">
              <Button variant="secondary" className="flex-1" onClick={() => setPhoto(null)}>Tirar Outra</Button>
              <Button disabled={loading || !gps} className="flex-1" onClick={handleConfirm}>{loading ? 'Enviando...' : 'Confirmar Registro'}</Button>
            </div>
          )}
        </div>
      </div>
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};
