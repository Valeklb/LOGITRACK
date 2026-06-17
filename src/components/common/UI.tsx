import React from 'react';
import { Truck } from 'lucide-react';

export const Button = ({ children, onClick, variant = 'primary', className = '', disabled = false, icon: Icon }: any) => {
  const variants = {
    primary: 'bg-emerald-600 text-white hover:bg-emerald-700',
    secondary: 'bg-zinc-100 text-zinc-900 hover:bg-zinc-200',
    outline: 'border border-zinc-300 text-zinc-700 hover:bg-zinc-50',
    danger: 'bg-red-500 text-white hover:bg-red-600',
  };

  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-medium transition-all active:scale-95 disabled:opacity-50 disabled:active:scale-100 ${variants[variant as keyof typeof variants]} ${className}`}
    >
      {Icon && <Icon size={20} />}
      {children}
    </button>
  );
};

export const Input = ({ label, type = 'text', value, onChange, placeholder, icon: Icon }: any) => (
  <div className="space-y-1.5">
    {label && <label className="text-sm font-medium text-zinc-700">{label}</label>}
    <div className="relative">
      {Icon && <div className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"><Icon size={18} /></div>}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full bg-white border border-zinc-200 rounded-xl py-3 ${Icon ? 'pl-10' : 'px-4'} pr-4 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all`}
      />
    </div>
  </div>
);

export const Badge = ({ status }: { status: string }) => {
  const styles = {
    'ABERTA': 'bg-blue-100 text-blue-700 border-blue-200',
    'EM_COLETA': 'bg-indigo-100 text-indigo-700 border-indigo-200',
    'EM_ROTA': 'bg-amber-100 text-amber-700 border-amber-200',
    'FECHADA': 'bg-emerald-100 text-emerald-700 border-emerald-200',
    'CANCELADA': 'bg-red-100 text-red-700 border-red-200',
    'PENDENTE': 'bg-amber-100 text-amber-700 border-amber-200',
    'APROVADO': 'bg-emerald-100 text-emerald-700 border-emerald-200',
    'REPROVADO': 'bg-red-100 text-red-700 border-red-200',
  };
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wider ${styles[status as keyof typeof styles] || 'bg-zinc-100'}`}>
      {status.replace('_', ' ')}
    </span>
  );
};

export const Logo = ({ size = 36, className = "" }: { size?: number, className?: string }) => (
  <div className={`flex items-center gap-3 text-emerald-600 ${className}`}>
    <Truck size={size} strokeWidth={2.5} />
    <h1 className="text-2xl font-black text-zinc-900 tracking-tighter">LOGITRACK</h1>
  </div>
);
