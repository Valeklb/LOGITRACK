import React, { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { User } from '../../types';
import { Button, Input } from './UI';
import { apiUrl } from '../../lib/api';

export const CreateOS = ({ user, onBack, onCreated }: { user: User, onBack: () => void, onCreated: () => void }) => {
  const [form, setForm] = useState({ os_number: '', plate: '', origin: '', destination: '' });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!form.os_number || !form.plate) return alert('Preencha os campos obrigatórios');
    setLoading(true);
    try {
      const res = await fetch(apiUrl('/api/os'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, driver_id: user.id, actor_id: user.id })
      });
      if (res.ok) onCreated();
      else alert('Erro ao criar OS. Verifique se o número já existe.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white">
      <header className="p-6 border-b border-zinc-100 flex items-center gap-4">
        <button onClick={onBack} className="p-2 hover:bg-zinc-100 rounded-full"><ArrowLeft size={24} /></button>
        <h2 className="text-xl font-bold">Nova Ordem de Serviço</h2>
      </header>
      <div className="p-6 space-y-6 flex-1 overflow-y-auto">
        <Input label="Número da Carga / OS" value={form.os_number} onChange={(v: string) => setForm({...form, os_number: v})} placeholder="Ex: 998877" />
        <Input label="Placa do Veículo" value={form.plate} onChange={(v: string) => setForm({...form, plate: v})} placeholder="ABC-1234" />
        <Input label="Origem" value={form.origin} onChange={(v: string) => setForm({...form, origin: v})} placeholder="Porto de Santos" />
        <Input label="Destino" value={form.destination} onChange={(v: string) => setForm({...form, destination: v})} placeholder="CD São Paulo" />
      </div>
      <div className="p-6 border-t border-zinc-100">
        <Button disabled={loading} onClick={handleSubmit} className="w-full py-4 text-lg font-black uppercase tracking-widest">
          {loading ? 'Criando...' : 'Abrir Ordem de Serviço'}
        </Button>
      </div>
    </div>
  );
};
