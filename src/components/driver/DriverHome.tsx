import React, { useState, useEffect } from 'react';
import { 
  Truck, 
  MapPin, 
  Plus, 
  ChevronRight, 
  Clock, 
  LogOut, 
  Map as MapIcon 
} from 'lucide-react';
import { motion } from 'motion/react';
import { User, ServiceOrder } from '../../types';
import { Button, Badge } from '../common/UI';
import { mapUrlForRoute } from '../../utils/maps';
import { apiUrl } from '../../lib/api';

// --- Offline Sync Service ---
export const syncQueue = {
  get: () => JSON.parse(localStorage.getItem('logitrack_sync_queue') || '[]'),
  add: (item: any) => {
    const queue = syncQueue.get();
    queue.push({ ...item, id: Date.now() });
    localStorage.setItem('logitrack_sync_queue', JSON.stringify(queue));
  },
  remove: (id: number) => {
    const queue = syncQueue.get().filter((i: any) => i.id !== id);
    localStorage.setItem('logitrack_sync_queue', JSON.stringify(queue));
  },
  process: async () => {
    if (!navigator.onLine) return;
    const queue = syncQueue.get();
    for (const item of queue) {
      try {
        const endpoint = item.syncType === 'EVENT' ? apiUrl(`/api/os/${item.osId}/event`) : apiUrl('/api/checklists');
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item.data)
        });
        if (res.ok) syncQueue.remove(item.id);
      } catch (e) {
        console.error('Sync failed for item', item.id, e);
      }
    }
  }
};

export const DriverHome = ({ user, onSelectOS, onCreateOS, onLogout, onUpdateUser, onShowChecklist }: { user: User, onSelectOS: (id: number) => void, onCreateOS: () => void, onLogout: () => void, onUpdateUser: (u: User) => void, onShowChecklist: () => void }) => {
  const [orders, setOrders] = useState<ServiceOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncQueueSize, setSyncQueueSize] = useState(0);
  const [assigning, setAssigning] = useState(false);

  const fetchOrders = () => {
    fetch(apiUrl(`/api/os?driverId=${user.id}&role=driver`))
      .then(res => res.json())
      .then(data => {
        setOrders(data);
        setLoading(false);
      });
  };

  const checkChecklist = async () => {
    try {
      const res = await fetch(apiUrl(`/api/checklists?driverId=${user.id}&type=VEHICLE`));
      const data = await res.json();
      const today = new Date().toISOString().split('T')[0];
      const hasToday = data.some((c: any) => c.created_at.startsWith(today));
      if (!hasToday) onShowChecklist();
    } catch (e) {
      console.error('Failed to check checklist', e);
    }
  };

  useEffect(() => {
    fetchOrders();
    if (user.shift_status === 'ON_SHIFT') {
      checkChecklist();
    }
    
    const checkQueue = () => {
      const queue = syncQueue.get();
      setSyncQueueSize(queue.length);
      if (queue.length > 0 && navigator.onLine) syncQueue.process();
    };
    checkQueue();
    const interval = setInterval(checkQueue, 5000);
    return () => clearInterval(interval);
  }, [user.id, user.shift_status]);

  const handleStartRoute = () => {
    setAssigning(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const res = await fetch(apiUrl('/api/routes/assign-nearest'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              driver_id: user.id,
              lat: pos.coords.latitude,
              lng: pos.coords.longitude
            })
          });
          const data = await res.json();
          if (res.ok) {
            const updatedUser = { ...user, shift_status: 'ON_SHIFT' as const, assignedRoute: data.route };
            onUpdateUser(updatedUser);
            fetchOrders();
            onShowChecklist();
          } else {
            alert(data.error || 'Erro ao iniciar rota');
          }
        } catch (err) {
          alert('Erro de conexão ao iniciar rota');
        } finally {
          setAssigning(false);
        }
      },
      (err) => {
        alert('GPS necessário para iniciar rota');
        setAssigning(false);
      },
      { enableHighAccuracy: true }
    );
  };

  const handleOptimizeRoute = () => {
    if (orders.length === 0) return;
    navigator.geolocation.getCurrentPosition((pos) => {
      const { latitude, longitude } = pos.coords;
      const waypoints = orders
        .filter(os => os.status !== 'FECHADA' && os.status !== 'CANCELADA')
        .map(os => os.origin);
      window.open(mapUrlForRoute(latitude, longitude, waypoints), '_blank');
    });
  };

  const handleFinishRoute = async () => {
    if (!confirm('Deseja realmente encerrar sua rota atual?')) return;
    try {
      const res = await fetch(apiUrl('/api/routes/finish'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ driver_id: user.id })
      });
      if (res.ok) {
        onUpdateUser({ ...user, shift_status: 'OFF_SHIFT', assignedRoute: undefined });
      }
    } catch (err) {
      alert('Erro ao encerrar rota');
    }
  };

  return (
    <div className="flex flex-col h-full">
      <header className="p-6 bg-white border-b border-zinc-100 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button onClick={onLogout} className="p-2 text-zinc-400 hover:text-red-500 transition-colors">
            <LogOut size={20} />
          </button>
          <div>
            <h2 className="text-xl font-bold text-zinc-900">LogiTrack</h2>
            <p className="text-sm text-zinc-500">Olá, {user.name.split(' ')[0]}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {syncQueueSize > 0 && (
            <div className="flex items-center gap-1 bg-amber-100 text-amber-700 px-3 py-1 rounded-full text-[10px] font-bold animate-pulse">
              <Clock size={12} /> {syncQueueSize} pendentes
            </div>
          )}
          <Button variant="secondary" className="p-2 rounded-full" onClick={onCreateOS}>
            <Plus size={24} />
          </Button>
        </div>
      </header>

      <div className="p-4">
        {user.shift_status === 'OFF_SHIFT' ? (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-emerald-600 p-6 rounded-[2rem] text-white shadow-lg shadow-emerald-200 space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-white/20 rounded-2xl"><Truck size={24} /></div>
              <div>
                <h3 className="font-black text-lg">Pronto para trabalhar?</h3>
                <p className="text-emerald-100 text-xs">Inicie sua rota para receber demandas próximas.</p>
              </div>
            </div>
            <Button disabled={assigning} onClick={handleStartRoute} className="w-full bg-white text-emerald-600 hover:bg-emerald-50 py-4 font-black uppercase tracking-widest shadow-sm">
              {assigning ? 'Buscando Rota...' : 'Iniciar Rota'}
            </Button>
          </motion.div>
        ) : (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-zinc-900 p-6 rounded-[2rem] text-white shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-emerald-500 rounded-2xl animate-pulse"><MapPin size={24} /></div>
                <div>
                  <h3 className="font-black text-lg">Rota Ativa</h3>
                  <p className="text-zinc-400 text-xs">{user.assignedRoute?.name || 'Rota em andamento'}</p>
                </div>
              </div>
              <button onClick={handleFinishRoute} className="text-[10px] font-black uppercase tracking-widest text-zinc-500 hover:text-red-400 transition-colors">Encerrar</button>
            </div>
            <div className="flex gap-2">
              <div className="flex-1 bg-white/10 p-3 rounded-xl">
                <p className="text-[8px] font-bold text-zinc-500 uppercase">Status</p>
                <p className="text-xs font-bold text-emerald-400">EM OPERAÇÃO</p>
              </div>
              <div className="flex-1 bg-white/10 p-3 rounded-xl">
                <p className="text-[8px] font-bold text-zinc-500 uppercase">Demandas</p>
                <p className="text-xs font-bold">{orders.length} OS Ativas</p>
              </div>
            </div>
            <Button variant="outline" className="w-full bg-white/5 border-white/10 text-white hover:bg-white/10" icon={MapIcon} onClick={handleOptimizeRoute}>
              Ver Rota Otimizada (Maps)
            </Button>
          </motion.div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest px-2">Minhas Demandas</h3>
        {loading ? (
          <div className="flex justify-center py-10"><Clock className="animate-spin text-emerald-500" /></div>
        ) : orders.length === 0 ? (
          <div className="text-center py-20 space-y-4">
            <div className="bg-zinc-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto text-zinc-400">
              <Truck size={32} />
            </div>
            <p className="text-zinc-500">Nenhuma carga atribuída.</p>
            <Button variant="outline" onClick={onCreateOS}>Criar Nova OS</Button>
          </div>
        ) : (
          orders.map(os => (
            <motion.div key={os.id} whileTap={{ scale: 0.98 }} onClick={() => onSelectOS(os.id)} className="bg-white p-5 rounded-2xl border border-zinc-100 shadow-sm flex items-center justify-between cursor-pointer relative overflow-hidden">
              {os.reassignment_count > 0 && (
                <div className="absolute top-0 right-0 bg-amber-500 text-white text-[8px] font-black px-2 py-0.5 rounded-bl-lg uppercase tracking-tighter">
                  Reatribuída
                </div>
              )}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-zinc-900">OS #{os.os_number}</span>
                  <Badge status={os.status} />
                </div>
                <div className="text-sm text-zinc-500 flex items-center gap-1">
                  <MapPin size={14} /> {os.origin} → {os.destination}
                </div>
                <div className="text-xs text-zinc-400">Placa: {os.plate}</div>
              </div>
              <ChevronRight className="text-zinc-300" />
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
};
