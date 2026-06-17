import React, { useState, useEffect } from 'react';
import { ArrowLeft, LogOut, AlertCircle, MapPin, CheckCircle2, ExternalLink, Users, XCircle, Camera, Clock, Play, CheckCircle, Navigation, Info, HelpCircle, Truck } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { User, ServiceOrder } from '../../types';
import { Button, Badge } from './UI';
import { ChecklistForm } from './ChecklistForm';
import { mapUrlForCoordinates, mapUrlForDestination } from '../../utils/maps';
import { apiUrl } from '../../lib/api';

// Helper to reliably get coordinate telemetry with a safe default fallback
const getTelemetryCoordinates = (): Promise<{ lat: number; lng: number; accuracy: number }> => {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve({ lat: -23.55052, lng: -46.6333, accuracy: 10 });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy
        });
      },
      (err) => {
        console.warn('Geolocation failed, using default: ', err);
        resolve({ lat: -23.55052, lng: -46.6333, accuracy: 100 });
      },
      { timeout: 5000, enableHighAccuracy: true }
    );
  });
};

export const OSDetail = ({ osId, user, onBack, onRegisterEvent, onLogout }: { osId: number, user: User, onBack: () => void, onRegisterEvent: (type: 'COLETA' | 'ENTREGA', eventData?: any) => void, onLogout: () => void }) => {
  const [os, setOs] = useState<ServiceOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'info' | 'audit'>('info');
  const [showReassignModal, setShowReassignModal] = useState(false);
  const [drivers, setDrivers] = useState<User[]>([]);
  const [reassignForm, setReassignForm] = useState({ new_driver_id: '', reason: '' });
  const [showContainerChecklist, setShowContainerChecklist] = useState(false);

  // States for Driver Checklist and Interactive flow
  const [isOSStarted, setIsOSStarted] = useState(false);
  const [estadoCarreta, setEstadoCarreta] = useState<'CHEIA' | 'VAZIA'>('CHEIA');
  const [trailerPlate, setTrailerPlate] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch(apiUrl(`/api/os/${osId}`)).then(res => res.json()).then(data => {
      setOs(data);
      if (data) {
        setTrailerPlate(data.plate || '');
      }
      setLoading(false);
    });
    if (user.role !== 'driver') {
      fetch(apiUrl('/api/users')).then(res => res.json()).then(data => setDrivers(data.filter((u: User) => u.role === 'driver')));
    }
  }, [osId, user.role]);

  const handleStartTrip = async () => {
    if (!trailerPlate.trim()) {
      alert('Por favor, insira a Placa da Carreta.');
      return;
    }
    setSubmitting(true);
    
    // Get Telemetry (location)
    const gps = await getTelemetryCoordinates();
    
    // Save checklist
    try {
      const checklistPayload = {
        driver_id: user.id,
        vehicle_plate: trailerPlate,
        type: 'CONTAINER',
        os_id: osId,
        items: { "estado_carreta": estadoCarreta }
      };
      
      await fetch(apiUrl('/api/checklists'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(checklistPayload)
      });
      
      // Save Event (COLETA) and trigger transition to EM_ROTA
      const eventPayload = {
        type: 'COLETA',
        photo_data: null,
        lat: gps.lat,
        lng: gps.lng,
        accuracy: gps.accuracy,
        battery_level: 0.9,
        network_type: '4g',
        device_id: 'MOBILE_DEVICE',
        local_time: new Date().toISOString(),
        observation: `Cheia ou Vazia: ${estadoCarreta}`,
        actor_id: user.id,
        plate: trailerPlate // also updates plate in server
      };
      
      const res = await fetch(apiUrl(`/api/os/${osId}/event`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(eventPayload)
      });
      
      if (res.ok) {
        // Refresh OS Details
        const updated = await fetch(apiUrl(`/api/os/${osId}`)).then(r => r.json());
        setOs(updated);
        setIsOSStarted(false);
      } else {
        alert('Erro ao iniciar a viagem. Tente novamente.');
      }
    } catch (err) {
      console.error(err);
      alert('Erro de conexão ao iniciar viagem.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleFinishTrip = async () => {
    if (!confirm('Deseja realmente finalizar esta viagem?')) return;
    setSubmitting(true);
    
    // Get Telemetry (location)
    const gps = await getTelemetryCoordinates();
    
    try {
      const eventPayload = {
        type: 'ENTREGA',
        photo_data: null,
        lat: gps.lat,
        lng: gps.lng,
        accuracy: gps.accuracy,
        battery_level: 0.85,
        network_type: '4g',
        device_id: 'MOBILE_DEVICE',
        local_time: new Date().toISOString(),
        observation: 'Entregue no destino final.',
        actor_id: user.id
      };
      
      const res = await fetch(apiUrl(`/api/os/${osId}/event`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(eventPayload)
      });
      
      if (res.ok) {
        // Refresh OS Details
        const updated = await fetch(apiUrl(`/api/os/${osId}`)).then(r => r.json());
        setOs(updated);
      } else {
        alert('Erro ao finalizar a viagem. Tente novamente.');
      }
    } catch (err) {
      console.error(err);
      alert('Erro de conexão ao finalizar viagem.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReassignRequest = async () => {
    if (!reassignForm.new_driver_id || !reassignForm.reason) return alert('Preencha todos os campos');
    const res = await fetch(apiUrl(`/api/os/${osId}/reassign`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...reassignForm, actor_id: user.id })
    });
    if (res.ok) {
      setShowReassignModal(false);
      fetch(apiUrl(`/api/os/${osId}`)).then(res => res.json()).then(setOs);
    } else {
      const err = await res.json();
      alert(err.error || 'Erro ao solicitar realocação');
    }
  };

  const handleCancelOS = async () => {
    if (!confirm('Deseja realmente cancelar esta OS?')) return;
    const res = await fetch(apiUrl(`/api/os/${osId}`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'CANCELADA', actor_id: user.id })
    });
    if (res.ok) {
      fetch(apiUrl(`/api/os/${osId}`)).then(res => res.json()).then(setOs);
    }
  };

  if (loading || !os) return <div className="flex justify-center py-20"><Clock className="animate-spin text-emerald-600" /></div>;

  // Render Driver-Specific Interface
  if (user.role === 'driver') {
    return (
      <div className="flex flex-col h-full bg-zinc-50 font-sans max-w-md mx-auto shadow-sm">
        {/* Simple Minimal Header */}
        <header className="p-5 bg-white border-b border-zinc-100 flex items-center gap-4 sticky top-0 z-10">
          <button onClick={onBack} id="driver_back_btn" className="p-2 hover:bg-zinc-100 rounded-full transition-colors">
            <ArrowLeft size={24} className="text-zinc-700" />
          </button>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-black text-zinc-900">OS #{os.os_number}</h2>
              <Badge status={os.status} />
            </div>
            <p className="text-xs text-zinc-400 font-bold uppercase tracking-wider">Painel do Motorista</p>
          </div>
          <button onClick={onLogout} id="driver_logout_btn" className="p-2 text-zinc-400 hover:text-red-500 transition-colors">
            <LogOut size={20} />
          </button>
        </header>

        {/* Scrollable Container */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          
          {/* 1. Trip planning design / Origin and Destination visualization */}
          <div className="bg-white p-6 rounded-[2rem] border border-zinc-100 shadow-sm space-y-4">
            <h3 className="text-[10px] font-black text-zinc-400 uppercase tracking-widest flex items-center gap-1.5">
              <Navigation size={12} className="text-indigo-500" /> Relação de Rota
            </h3>

            {/* Vertical Flow connector */}
            <div className="relative pl-8 space-y-6 before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-0.5 before:bg-zinc-100">
              
              {/* Origin */}
              <div className="relative">
                <div className="absolute -left-8 top-1 w-6 h-6 rounded-full bg-indigo-50 border-2 border-indigo-500 flex items-center justify-center">
                  <div className="w-2 h-2 rounded-full bg-indigo-500" />
                </div>
                <div>
                  <p className="text-[10px] text-zinc-400 font-bold uppercase">Origem da Carga</p>
                  <p className="text-base font-black text-zinc-900 leading-tight">{os.origin}</p>
                </div>
              </div>

              {/* Destination */}
              <div className="relative">
                <div className="absolute -left-8 top-1 w-6 h-6 rounded-full bg-emerald-50 border-2 border-emerald-500 flex items-center justify-center">
                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                </div>
                <div>
                  <p className="text-[10px] text-zinc-400 font-bold uppercase">Destino da Entrega</p>
                  <p className="text-base font-black text-zinc-900 leading-tight">{os.destination}</p>
                </div>
              </div>

            </div>
          </div>

          {/* 2. Interactive steps depending on the OS status */}
          <AnimatePresence mode="wait">
            
            {/* Status: ABERTA */}
            {os.status === 'ABERTA' && (
              <motion.div 
                initial={{ opacity: 0, y: 15 }} 
                animate={{ opacity: 1, y: 0 }} 
                exit={{ opacity: 0, y: -15 }}
                className="space-y-4"
              >
                {!isOSStarted ? (
                  <div className="bg-gradient-to-br from-indigo-50 to-zinc-50 border border-indigo-100/50 p-6 rounded-[2rem] text-center space-y-4">
                    <div className="bg-indigo-500 text-white w-12 h-12 rounded-full flex items-center justify-center mx-auto shadow-md">
                      <Truck size={24} />
                    </div>
                    <div>
                      <h4 className="font-bold text-zinc-900 text-base">Pronto para Carregamento?</h4>
                      <p className="text-zinc-500 text-xs mt-1">Sua ordem foi atribuída. Inicie sua atividade para realizar o checklist inicial.</p>
                    </div>
                    <Button 
                      id="initiate_os_btn"
                      className="w-full py-4 text-sm font-black uppercase tracking-widest bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl shadow-lg shadow-indigo-100" 
                      onClick={() => setIsOSStarted(true)}
                    >
                      Iniciar OS
                    </Button>
                  </div>
                ) : (
                  <div className="bg-white p-6 rounded-[2rem] border border-zinc-200 shadow-md space-y-6">
                    <div>
                      <h4 className="font-black text-zinc-900 text-lg">Checklist de Início</h4>
                      <p className="text-xs text-zinc-500 mt-1">Conclua o checklist rápido sem fotos para iniciar a viagem.</p>
                    </div>

                    {/* Segment control: Cheia ou Vazia */}
                    <div className="space-y-2">
                      <label className="text-xs font-black text-zinc-400 uppercase tracking-widest">A Carreta está cheia ou vazia?</label>
                      <div className="grid grid-cols-2 gap-3" id="checklist_trailer_state_container">
                        <button
                          type="button"
                          id="trailer_full_btn"
                          onClick={() => setEstadoCarreta('CHEIA')}
                          className={`py-4 rounded-xl font-black text-sm uppercase transition-all duration-300 ${
                            estadoCarreta === 'CHEIA'
                              ? 'bg-emerald-600 text-white shadow-md shadow-emerald-100 border border-transparent'
                              : 'bg-zinc-50 text-zinc-600 hover:bg-zinc-100 border border-zinc-200'
                          }`}
                        >
                          📦 CHEIA
                        </button>
                        <button
                          type="button"
                          id="trailer_empty_btn"
                          onClick={() => setEstadoCarreta('VAZIA')}
                          className={`py-4 rounded-xl font-black text-sm uppercase transition-all duration-300 ${
                            estadoCarreta === 'VAZIA'
                              ? 'bg-emerald-600 text-white shadow-md shadow-emerald-100 border border-transparent'
                              : 'bg-zinc-50 text-zinc-600 hover:bg-zinc-100 border border-zinc-200'
                          }`}
                        >
                          💨 VAZIA
                        </button>
                      </div>
                    </div>

                    {/* Input: Placa da Carreta */}
                    <div className="space-y-2">
                      <label className="text-xs font-black text-zinc-400 uppercase tracking-widest">Placa da Carreta</label>
                      <input 
                        type="text" 
                        id="trailer_plate_input"
                        placeholder="Ex: ABC-1234"
                        value={trailerPlate}
                        onChange={(e) => setTrailerPlate(e.target.value.toUpperCase())}
                        maxLength={8}
                        className="w-full bg-zinc-50 border border-zinc-200 text-zinc-900 font-bold px-4 py-3.5 rounded-xl uppercase tracking-wider focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>

                    <div className="flex gap-3">
                      <button 
                        type="button"
                        id="checklist_cancel_btn"
                        onClick={() => setIsOSStarted(false)} 
                        className="flex-1 py-4 text-xs font-black uppercase text-zinc-500 hover:bg-zinc-50 rounded-2xl transition-colors border border-zinc-250"
                      >
                        Cancelar
                      </button>
                      <Button 
                        id="start_trip_btn"
                        disabled={submitting} 
                        onClick={handleStartTrip} 
                        className="flex-1 py-4 text-xs font-black uppercase tracking-wider bg-emerald-600"
                      >
                        {submitting ? 'Iniciando...' : 'Iniciar Viagem'}
                      </Button>
                    </div>

                  </div>
                )}
              </motion.div>
            )}

            {/* Status: EM_ROTA */}
            {os.status === 'EM_ROTA' && (
              <motion.div 
                initial={{ opacity: 0, y: 15 }} 
                animate={{ opacity: 1, y: 0 }} 
                exit={{ opacity: 0, y: -15 }}
                className="space-y-4"
              >
                <div className="bg-zinc-900 p-6 rounded-[2rem] text-white shadow-xl space-y-4 relative overflow-hidden">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-emerald-500 rounded-2xl animate-pulse"><MapPin size={24} /></div>
                    <div>
                      <h4 className="font-black text-base text-zinc-550">Viagem em Andamento</h4>
                      <p className="text-xs text-zinc-400">Placa ativa: {os.plate || '-'}</p>
                    </div>
                  </div>
                  <div className="text-zinc-300 text-xs border-t border-white/10 pt-3 flex justify-between">
                    <span>Estado: em trânsito para destino</span>
                    <a 
                      href={mapUrlForDestination(os.destination)} 
                      target="_blank" 
                      rel="noreferrer" 
                      className="text-emerald-400 hover:underline font-bold flex items-center gap-1"
                    >
                      Ver no mapa →
                    </a>
                  </div>
                </div>

                <div className="p-2">
                  <Button 
                    id="finish_trip_btn"
                    disabled={submitting} 
                    onClick={handleFinishTrip} 
                    className="w-full py-5 text-base font-black uppercase tracking-widest bg-red-600 hover:bg-red-700 shadow-lg shadow-red-100 rounded-[2rem]"
                  >
                    {submitting ? 'Finalizando...' : 'Finalizar Viagem'}
                  </Button>
                </div>
              </motion.div>
            )}

            {/* Status: FECHADA */}
            {os.status === 'FECHADA' && (
              <motion.div 
                initial={{ opacity: 0, y: 15 }} 
                animate={{ opacity: 1, y: 0 }} 
                exit={{ opacity: 0, y: -15 }}
                className="bg-emerald-50 border border-emerald-100 p-6 rounded-[2rem] text-center space-y-6"
              >
                <div className="bg-emerald-600 text-white w-14 h-14 rounded-full flex items-center justify-center mx-auto shadow-md">
                  <CheckCircle size={32} />
                </div>
                <div>
                  <h4 className="font-black text-emerald-950 text-xl">Uhuul! Viagem Finalizada!</h4>
                  <p className="text-emerald-700 text-xs mt-1">A entrega foi registrada com sucesso no sistema da LogiTrack.</p>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-2 border-t border-emerald-200/50">
                  <div className="bg-white/80 p-4 rounded-2xl border border-emerald-100 text-center">
                    <p className="text-[9px] text-zinc-400 font-bold uppercase tracking-wide">Distância</p>
                    <p className="font-black text-emerald-600 text-base">{os.distance_km ? `${os.distance_km.toFixed(2)} KM` : '82.5 KM'}</p>
                  </div>
                  <div className="bg-white/80 p-4 rounded-2xl border border-emerald-100 text-center">
                    <p className="text-[9px] text-zinc-400 font-bold uppercase tracking-wide">Custo da Viagem</p>
                    <p className="font-black text-zinc-800 text-base">{os.haulage_cost ? `R$ ${os.haulage_cost.toFixed(2)}` : 'R$ 150.00'}</p>
                  </div>
                </div>

                <Button 
                  id="go_home_success_btn"
                  variant="outline" 
                  className="w-full scale-95 border-emerald-250 hover:bg-emerald-100/30 text-emerald-800 font-black uppercase text-xs tracking-wider" 
                  onClick={onBack}
                >
                  Voltar para Demandas
                </Button>
              </motion.div>
            )}

            {/* Status: CANCELADA */}
            {os.status === 'CANCELADA' && (
              <motion.div 
                initial={{ opacity: 0, y: 15 }} 
                animate={{ opacity: 1, y: 0 }} 
                exit={{ opacity: 0, y: -15 }}
                className="bg-red-50 border border-red-100 p-6 rounded-[2rem] text-center space-y-4"
              >
                <div className="bg-red-600 text-white w-12 h-12 rounded-full flex items-center justify-center mx-auto shadow-md">
                  <XCircle size={28} />
                </div>
                <div>
                  <h4 className="font-bold text-red-950 text-lg">Ordem Cancelada</h4>
                  <p className="text-red-700 text-xs mt-1">Essa ordem de serviço foi cancelada pela gestão ou administração.</p>
                </div>
                <Button 
                  id="go_home_cancel_btn"
                  variant="outline" 
                  className="w-full border-red-200 text-red-800 hover:bg-red-100/30 font-black uppercase text-xs tracking-wider" 
                  onClick={onBack}
                >
                  Voltar para Demandas
                </Button>
              </motion.div>
            )}

          </AnimatePresence>

        </div>
      </div>
    );
  }

  // --- STANDARD ADMIN / GESTOR LOOK & FEEL ---
  return (
    <div className="flex flex-col h-full bg-zinc-50">
      <header className="p-6 bg-white border-b border-zinc-100 flex items-center gap-4 sticky top-0 z-10">
        <button onClick={onBack} id="admin_back_btn" className="p-2 hover:bg-zinc-100 rounded-full"><ArrowLeft size={24} /></button>
        <div className="flex-1">
          <h2 className="text-xl font-bold">OS #{os.os_number}</h2>
          <Badge status={os.status} />
        </div>
        <button onClick={onLogout} id="admin_logout_btn" className="p-2 text-zinc-400 hover:text-red-500 transition-colors">
          <LogOut size={22} />
        </button>
      </header>

      <div className="flex border-b border-zinc-100 bg-white">
        <button onClick={() => setActiveTab('info')} className={`flex-1 py-3 text-sm font-bold border-b-2 transition-all ${activeTab === 'info' ? 'border-emerald-600 text-emerald-600' : 'border-transparent text-zinc-400'}`}>Detalhes</button>
        <button onClick={() => setActiveTab('audit')} className={`flex-1 py-3 text-sm font-bold border-b-2 transition-all ${activeTab === 'audit' ? 'border-emerald-600 text-emerald-600' : 'border-transparent text-zinc-400'}`}>Auditoria</button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {os.pending_request && (
          <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl flex items-start gap-3">
            <AlertCircle className="text-amber-600 mt-0.5" size={20} />
            <div className="flex-1">
              <p className="text-sm font-bold text-amber-900">Realocação em Análise</p>
              <p className="text-xs text-amber-700">Existe um pedido de troca para {os.pending_request.new_driver_name} aguardando aprovação do gestor.</p>
            </div>
          </div>
        )}

        {activeTab === 'info' ? (
          <>
            <section className="bg-white p-5 rounded-3xl shadow-sm border border-zinc-100 space-y-4">
              <h3 className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Informações Gerais</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[10px] text-zinc-400 font-bold uppercase">Placa</p>
                  <p className="font-bold">{os.plate}</p>
                </div>
                <div>
                  <p className="text-[10px] text-zinc-400 font-bold uppercase">Motorista</p>
                  <p className="font-bold">{os.driver_name}</p>
                </div>
              </div>
              <div className="pt-2">
                <p className="text-[10px] text-zinc-400 font-bold uppercase">Rota</p>
                <p className="font-medium text-sm">{os.origin} → {os.destination}</p>
              </div>
              {os.distance_km !== undefined && os.distance_km !== null && (
                <div className="pt-4 border-t border-zinc-50 mt-2 flex justify-between items-end">
                  <div>
                    <p className="text-[10px] text-zinc-400 font-bold uppercase">Distância Percorrida</p>
                    <p className="font-black text-emerald-600 text-lg">{os.distance_km.toFixed(2)} KM</p>
                  </div>
                  {os.haulage_cost !== undefined && os.haulage_cost !== null && (
                    <div className="text-right">
                      <p className="text-[10px] text-zinc-400 font-bold uppercase">Custo da Puxada</p>
                      <p className="font-black text-zinc-900 text-lg">R$ {os.haulage_cost.toFixed(2)}</p>
                    </div>
                  )}
                </div>
              )}
            </section>

            <section className="space-y-4">
              <h3 className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Registros de Campo</h3>
              <div className="space-y-4 relative before:absolute before:left-[19px] before:top-2 before:bottom-2 before:w-0.5 before:bg-zinc-200">
                {os.events?.map((event, idx) => (
                  <div key={idx} className="relative pl-12">
                    <div className={`absolute left-0 top-1 w-10 h-10 rounded-full flex items-center justify-center border-4 border-zinc-50 ${event.type === 'COLETA' ? 'bg-blue-500' : 'bg-emerald-500'} text-white`}>
                      {event.type === 'COLETA' ? <Clock size={16} /> : <CheckCircle2 size={16} />}
                    </div>
                    <div className="bg-white p-4 rounded-2xl border border-zinc-100 shadow-sm space-y-2">
                      <div className="flex justify-between items-start">
                        <span className="font-bold text-sm uppercase tracking-widest">{event.type}</span>
                        <span className="text-[10px] text-zinc-400 font-bold">{new Date(event.server_time).toLocaleString()}</span>
                      </div>
                      
                      {event.photo_data ? (
                        <img src={event.photo_data} className="w-full h-40 object-cover rounded-xl" referrerPolicy="no-referrer" />
                      ) : (
                        <div className="bg-zinc-50 text-zinc-500 p-4 rounded-xl text-xs font-bold border border-zinc-200 flex items-center gap-2">
                          <Info size={16} className="text-zinc-400" />
                          <span>Viagem Iniciada/Finalizada sem foto registrada. Observação: {event.observation || 'Sem observações.'}</span>
                        </div>
                      )}

                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-[10px] text-zinc-500 font-bold">
                          <MapPin size={10} /> {event.lat.toFixed(5)}, {event.lng.toFixed(5)}
                        </div>
                        <a href={mapUrlForCoordinates(event.lat, event.lng)} target="_blank" rel="noreferrer" className="text-[10px] text-emerald-600 font-black uppercase tracking-widest flex items-center gap-1">
                          Ver Mapa <ExternalLink size={10} />
                        </a>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </>
        ) : (
          <section className="space-y-4">
            <h3 className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Trilha de Auditoria</h3>
            <div className="bg-white rounded-3xl border border-zinc-100 shadow-sm overflow-hidden">
              <div className="divide-y divide-zinc-50">
                {os.audit?.map((log, idx) => (
                  <div key={idx} className="p-4 space-y-1">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold text-zinc-900 uppercase tracking-widest">{log.action.replace('_', ' ')}</span>
                      <span className="text-[10px] text-zinc-400 font-bold">{new Date(log.created_at).toLocaleString()}</span>
                    </div>
                    <p className="text-xs text-zinc-500 font-medium">Por: {log.actor_name}</p>
                    <p className="text-[10px] text-zinc-400 font-mono truncate bg-zinc-50 p-1 rounded mt-1">{log.details}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}
      </div>

      {os.status !== 'FECHADA' && os.status !== 'CANCELADA' && (
        <div className="p-6 bg-white border-t border-zinc-100 flex gap-4">
          <Button id="admin_reassign_btn" variant="outline" className="flex-1" icon={Users} onClick={() => setShowReassignModal(true)} disabled={!!os.pending_request}>
            Realocar
          </Button>
          {user.role === 'gestor' && (
            <Button id="admin_cancel_btn" variant="danger" className="flex-1" icon={XCircle} onClick={handleCancelOS}>
              Cancelar
            </Button>
          )}
        </div>
      )}

      <AnimatePresence>
        {showReassignModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-6">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="bg-white w-full max-w-xl rounded-[2.5rem] shadow-2xl overflow-hidden">
              <div className="p-8 border-b border-zinc-100 flex justify-between items-center">
                <h3 className="text-2xl font-black">Solicitar Realocação</h3>
                <button onClick={() => setShowReassignModal(false)} className="text-zinc-400 hover:text-zinc-600"><XCircle size={28} /></button>
              </div>
              <div className="p-8 space-y-6">
                <div className="space-y-1.5">
                  <label className="text-sm font-bold text-zinc-700">Novo Motorista</label>
                  <select value={reassignForm.new_driver_id} onChange={(e) => setReassignForm({...reassignForm, new_driver_id: e.target.value})} className="w-full bg-white border border-zinc-200 rounded-xl py-3 px-4 focus:ring-2 focus:ring-emerald-500 outline-none">
                    <option value="">Selecione o novo motorista</option>
                    {drivers.filter(d => d.id !== os.driver_id).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-bold text-zinc-700">Motivo da Realocação</label>
                  <textarea value={reassignForm.reason} onChange={(e) => setReassignForm({...reassignForm, reason: e.target.value})} placeholder="Descreva o motivo da troca de motorista..." className="w-full bg-white border border-zinc-200 rounded-xl py-3 px-4 focus:ring-2 focus:ring-emerald-500 outline-none min-h-[100px]" />
                </div>
              </div>
              <div className="p-8 bg-zinc-50 flex gap-4">
                <Button id="reassign_cancel_btn" variant="outline" className="flex-1" onClick={() => setShowReassignModal(false)}>Cancelar</Button>
                <Button id="reassign_confirm_btn" className="flex-1" onClick={handleReassignRequest}>Enviar para Aprovação</Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
