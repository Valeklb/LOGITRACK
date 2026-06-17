import React, { useState } from 'react';
import { Truck, AlertCircle, Clock, User as UserIcon } from 'lucide-react';
import { motion } from 'motion/react';
import { User } from '../../types';
import { Button, Input, Logo } from '../common/UI';
import { apiUrl } from '../../lib/api';

export const Login = ({ onLogin }: { onLogin: (user: User) => void }) => {
  const [email, setEmail] = useState('motorista@logitrack.com');
  const [password, setPassword] = useState('123456');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch(apiUrl('/api/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      if (res.ok) {
        onLogin(await res.json());
      } else {
        const data = await res.json();
        setError(data.error || 'Email ou senha incorretos');
      }
    } catch (err) {
      setError('Erro ao conectar ao servidor');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col items-center justify-center p-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md space-y-8">
        <div className="text-center space-y-2">
          <div className="inline-flex p-4 bg-emerald-100 rounded-3xl text-emerald-600 mb-4">
            <Truck size={48} strokeWidth={1.5} />
          </div>
          <h1 className="text-3xl font-bold text-zinc-900 tracking-tight">LogiTrack Pro</h1>
          <p className="text-zinc-500">Gestão Logística de Ponta a Ponta</p>
        </div>

        <form onSubmit={handleLogin} className="bg-white p-8 rounded-3xl shadow-sm border border-zinc-100 space-y-6">
          {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded-xl text-sm flex items-center gap-2">
              <AlertCircle size={18} /> {error}
            </div>
          )}
          <Input label="E-mail" value={email} onChange={setEmail} icon={UserIcon} placeholder="seu@email.com" />
          <Input label="Senha" type="password" value={password} onChange={setPassword} icon={Clock} placeholder="••••••" />
          <Button disabled={loading} className="w-full py-4 text-lg">
            {loading ? 'Autenticando...' : 'Entrar no Sistema'}
          </Button>
          
          <div className="pt-4 border-t border-zinc-100 space-y-4">
            <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest text-center">Acesso Rápido</p>
            <div className="grid grid-cols-3 gap-2">
              <button type="button" onClick={() => { setEmail('admin@logitrack.com'); setPassword('admin123'); }} className="text-[10px] font-bold py-2 px-3 bg-zinc-100 text-zinc-600 rounded-lg hover:bg-zinc-200 transition-colors">Admin</button>
              <button type="button" onClick={() => { setEmail('gestor@logitrack.com'); setPassword('gestor123'); }} className="text-[10px] font-bold py-2 px-3 bg-zinc-100 text-zinc-600 rounded-lg hover:bg-zinc-200 transition-colors">Gestor</button>
              <button type="button" onClick={() => { setEmail('motorista@logitrack.com'); setPassword('123456'); }} className="text-[10px] font-bold py-2 px-3 bg-zinc-100 text-zinc-600 rounded-lg hover:bg-zinc-200 transition-colors">Motorista</button>
            </div>
          </div>
        </form>
      </motion.div>
    </div>
  );
};
