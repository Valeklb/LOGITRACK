import React, { useState } from 'react';
import { Camera, XCircle } from 'lucide-react';
import { Button } from './UI';
import { CameraCapture } from './CameraCapture';
import { syncQueue } from '../driver/DriverHome';
import { apiUrl } from '../../lib/api';

export const ChecklistForm = ({ type, osId, driverId, plate, onComplete, onCancel }: { type: 'VEHICLE' | 'CONTAINER', osId?: number, driverId: number, plate: string, onComplete: () => void, onCancel?: () => void }) => {
  const vehicleItems: { id: string, label: string, requiredPhoto?: boolean }[] = [
    { id: 'pneus', label: 'Pneus em bom estado?' },
    { id: 'luzes', label: 'Luzes e sinalização funcionando?' },
    { id: 'oleo', label: 'Nível de óleo e água ok?' },
    { id: 'freios', label: 'Freios testados e funcionando?' },
    { id: 'limpeza', label: 'Cabine limpa?' },
  ];

  const containerItems: { id: string, label: string, requiredPhoto?: boolean }[] = [
    { id: 'lacre', label: 'Lacre sem rompimento', requiredPhoto: true },
  ];

  const items = type === 'VEHICLE' ? vehicleItems : containerItems;
  const [values, setValues] = useState<Record<string, boolean>>(
    items.reduce((acc, item) => ({ ...acc, [item.id]: false }), {})
  );
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [showCamera, setShowCamera] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    const allChecked = Object.values(values).every(v => v);
    if (!allChecked) {
      alert('Todos os itens devem ser marcados como OK.');
      return;
    }

    for (const item of items) {
      if (item.requiredPhoto && !photos[item.id]) {
        alert(`A foto para o item "${item.label}" é obrigatória.`);
        return;
      }
    }

    setLoading(true);
    const data = {
      driver_id: driverId,
      vehicle_plate: plate,
      type,
      os_id: osId,
      items: values,
      photos: photos
    };

    if (navigator.onLine) {
      try {
        const res = await fetch(apiUrl('/api/checklists'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
        if (res.ok) onComplete();
        else alert('Erro ao salvar checklist');
      } catch (e) {
        syncQueue.add({ syncType: 'CHECKLIST', data });
        onComplete();
      }
    } else {
      syncQueue.add({ syncType: 'CHECKLIST', data });
      onComplete();
    }
    setLoading(false);
  };

  return (
    <div className="flex flex-col h-full bg-white">
      <header className="p-6 border-b border-zinc-100 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Checklist {type === 'VEHICLE' ? 'do Veículo' : 'do Container'}</h2>
          <p className="text-xs text-zinc-500 font-bold uppercase tracking-widest">Placa: {plate}</p>
        </div>
        {onCancel && <button onClick={onCancel} className="p-2 text-zinc-400"><XCircle /></button>}
      </header>
      <div className="p-6 flex-1 overflow-y-auto space-y-4">
        {items.map(item => (
          <div key={item.id} className="space-y-2">
            <label className="flex items-center gap-4 p-4 bg-zinc-50 rounded-2xl cursor-pointer active:bg-zinc-100 transition-colors">
              <input 
                type="checkbox" 
                checked={values[item.id]} 
                onChange={(e) => setValues({ ...values, [item.id]: e.target.checked })}
                className="w-6 h-6 rounded-lg border-zinc-300 text-emerald-600 focus:ring-emerald-500"
              />
              <span className="font-medium text-zinc-700">{item.label}</span>
            </label>
            
            {item.requiredPhoto && (
              <div className="px-4">
                {photos[item.id] ? (
                  <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-zinc-100 border border-zinc-200">
                    <img src={photos[item.id]} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    <button 
                      onClick={() => setShowCamera(item.id)}
                      className="absolute bottom-2 right-2 bg-white/90 backdrop-blur p-2 rounded-lg text-xs font-bold shadow-sm"
                    >
                      Trocar Foto
                    </button>
                  </div>
                ) : (
                  <button 
                    onClick={() => setShowCamera(item.id)}
                    className="w-full py-3 border-2 border-dashed border-zinc-200 rounded-xl flex items-center justify-center gap-2 text-zinc-500 hover:border-emerald-300 hover:text-emerald-600 transition-colors"
                  >
                    <Camera size={20} />
                    <span className="text-sm font-bold">Capturar Foto Obrigatória</span>
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {showCamera && (
        <CameraCapture 
          type={`CHECKLIST_${showCamera.toUpperCase()}`}
          onCapture={(data) => {
            setPhotos({ ...photos, [showCamera]: data.photo_data });
            setValues({ ...values, [showCamera]: true });
            setShowCamera(null);
          }}
          onCancel={() => setShowCamera(null)}
        />
      )}
      <div className="p-6 border-t border-zinc-100">
        <Button disabled={loading} onClick={handleSubmit} className="w-full py-4">
          {loading ? 'Salvando...' : 'Finalizar Checklist'}
        </Button>
      </div>
    </div>
  );
};
