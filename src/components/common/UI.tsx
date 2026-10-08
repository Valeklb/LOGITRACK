import React, { useEffect, useId } from 'react';
import { motion } from 'motion/react';
import { AlertCircle, ChevronDown, Info, Loader2, RefreshCw, Truck, X } from 'lucide-react';

type IconType = React.ElementType;

// --- Botão ---

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'danger';

interface ButtonProps {
  children?: React.ReactNode;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  variant?: ButtonVariant;
  className?: string;
  disabled?: boolean;
  icon?: IconType;
  /** Padrão 'button'. Use type="submit" dentro de <form>. */
  type?: 'button' | 'submit' | 'reset';
  id?: string;
  title?: string;
}

const buttonVariants: Record<ButtonVariant, string> = {
  primary: 'bg-emerald-600 text-white hover:bg-emerald-700',
  secondary: 'bg-zinc-100 text-zinc-900 hover:bg-zinc-200',
  outline: 'border border-zinc-300 text-zinc-700 hover:bg-zinc-50',
  danger: 'bg-red-500 text-white hover:bg-red-600',
};

export const Button = ({
  children,
  onClick,
  variant = 'primary',
  className = '',
  disabled = false,
  icon: Icon,
  type = 'button',
  id,
  title,
}: ButtonProps) => (
  <button
    type={type}
    id={id}
    title={title}
    disabled={disabled}
    onClick={onClick}
    className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-medium transition-all active:scale-95 disabled:opacity-50 disabled:active:scale-100 disabled:cursor-not-allowed ${buttonVariants[variant] ?? buttonVariants.primary} ${className}`}
  >
    {Icon && <Icon size={20} />}
    {children}
  </button>
);

// --- Campos ---

const fieldBase =
  'w-full bg-white border rounded-xl py-3 outline-none transition-all focus:ring-2 focus:ring-emerald-500 focus:border-transparent disabled:bg-zinc-100 disabled:text-zinc-500';

function fieldBorder(error?: string | null) {
  return error ? 'border-red-300' : 'border-zinc-200';
}

const FieldLabel = ({ htmlFor, label, required }: { htmlFor: string; label?: React.ReactNode; required?: boolean }) =>
  label ? (
    <label htmlFor={htmlFor} className="block text-sm font-medium text-zinc-700">
      {label}
      {required && <span className="text-red-500"> *</span>}
    </label>
  ) : null;

const FieldHelp = ({ hint, error }: { hint?: React.ReactNode; error?: string | null }) => {
  if (error) return <p className="text-xs text-red-600">{error}</p>;
  if (hint) return <p className="text-xs text-zinc-500">{hint}</p>;
  return null;
};

interface InputProps {
  label?: React.ReactNode;
  value: string | number;
  onChange: (value: string) => void;
  placeholder?: string;
  icon?: IconType;
  type?: React.HTMLInputTypeAttribute;
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
  autoComplete?: string;
  autoCapitalize?: string;
  autoCorrect?: string;
  spellCheck?: boolean;
  disabled?: boolean;
  maxLength?: number;
  name?: string;
  id?: string;
  required?: boolean;
  autoFocus?: boolean;
  /** Texto de ajuda abaixo do campo. */
  hint?: React.ReactNode;
  /** Mensagem de erro (substitui o hint e deixa a borda vermelha). */
  error?: string | null;
  className?: string;
}

export const Input = ({
  label,
  value,
  onChange,
  placeholder,
  icon: Icon,
  type = 'text',
  inputMode,
  autoComplete,
  autoCapitalize,
  autoCorrect,
  spellCheck,
  disabled,
  maxLength,
  name,
  id,
  required,
  autoFocus,
  hint,
  error,
  className = '',
}: InputProps) => {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <div className={`space-y-1.5 ${className}`}>
      <FieldLabel htmlFor={inputId} label={label} required={required} />
      <div className="relative">
        {Icon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none">
            <Icon size={18} />
          </div>
        )}
        <input
          id={inputId}
          name={name}
          type={type}
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          inputMode={inputMode}
          autoComplete={autoComplete}
          autoCapitalize={autoCapitalize}
          autoCorrect={autoCorrect}
          spellCheck={spellCheck}
          disabled={disabled}
          maxLength={maxLength}
          required={required}
          autoFocus={autoFocus}
          aria-invalid={error ? true : undefined}
          className={`${fieldBase} ${fieldBorder(error)} ${Icon ? 'pl-10' : 'pl-4'} pr-4`}
        />
      </div>
      <FieldHelp hint={hint} error={error} />
    </div>
  );
};

export interface SelectOption {
  value: string | number;
  label: string;
  disabled?: boolean;
}

interface SelectProps {
  label?: React.ReactNode;
  value: string | number;
  onChange: (value: string) => void;
  options: SelectOption[];
  /** Primeira opção vazia (ex.: "Selecione…"). */
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  name?: string;
  id?: string;
  hint?: React.ReactNode;
  error?: string | null;
  className?: string;
}

export const Select = ({
  label,
  value,
  onChange,
  options,
  placeholder,
  disabled,
  required,
  name,
  id,
  hint,
  error,
  className = '',
}: SelectProps) => {
  const autoId = useId();
  const selectId = id ?? autoId;
  return (
    <div className={`space-y-1.5 ${className}`}>
      <FieldLabel htmlFor={selectId} label={label} required={required} />
      <div className="relative">
        <select
          id={selectId}
          name={name}
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          required={required}
          aria-invalid={error ? true : undefined}
          className={`${fieldBase} ${fieldBorder(error)} appearance-none pl-4 pr-10`}
        >
          {placeholder !== undefined && <option value="">{placeholder}</option>}
          {options.map((opt) => (
            <option key={String(opt.value)} value={opt.value} disabled={opt.disabled}>
              {opt.label}
            </option>
          ))}
        </select>
        <ChevronDown
          size={18}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none"
        />
      </div>
      <FieldHelp hint={hint} error={error} />
    </div>
  );
};

interface TextareaProps {
  label?: React.ReactNode;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  maxLength?: number;
  disabled?: boolean;
  required?: boolean;
  name?: string;
  id?: string;
  hint?: React.ReactNode;
  error?: string | null;
  className?: string;
}

export const Textarea = ({
  label,
  value,
  onChange,
  placeholder,
  rows = 3,
  maxLength,
  disabled,
  required,
  name,
  id,
  hint,
  error,
  className = '',
}: TextareaProps) => {
  const autoId = useId();
  const textareaId = id ?? autoId;
  return (
    <div className={`space-y-1.5 ${className}`}>
      <FieldLabel htmlFor={textareaId} label={label} required={required} />
      <textarea
        id={textareaId}
        name={name}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        maxLength={maxLength}
        disabled={disabled}
        required={required}
        aria-invalid={error ? true : undefined}
        className={`${fieldBase} ${fieldBorder(error)} px-4 resize-y`}
      />
      <FieldHelp hint={hint} error={error} />
    </div>
  );
};

// --- Janela (modal) ---

interface ModalProps {
  title: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** Largura máxima do painel (padrão max-w-xl). */
  className?: string;
}

/** Para animar a saída, renderize dentro de <AnimatePresence>. */
export const Modal = ({ title, onClose, children, footer, className = 'max-w-xl' }: ModalProps) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className={`bg-white w-full ${className} rounded-3xl shadow-2xl overflow-hidden max-h-[90dvh] flex flex-col`}
      >
        <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-4 border-b border-zinc-100">
          <h2 className="text-lg font-bold text-zinc-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            title="Fechar"
            aria-label="Fechar"
            className="p-1.5 -m-1.5 rounded-full text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 transition-colors"
          >
            <X size={20} />
          </button>
        </div>
        <div className="px-6 py-5 overflow-y-auto flex-1">{children}</div>
        {footer && (
          <div className="px-6 py-4 border-t border-zinc-100 bg-zinc-50 flex flex-wrap justify-end gap-3">{footer}</div>
        )}
      </motion.div>
    </motion.div>
  );
};

// --- Estados de tela ---

export const Spinner = ({ size = 24, className = '', label }: { size?: number; className?: string; label?: string }) => (
  <div className={`flex items-center justify-center gap-2 text-zinc-400 ${className}`} role="status">
    <Loader2 size={size} className="animate-spin" />
    {label && <span className="text-sm">{label}</span>}
  </div>
);

interface EmptyStateProps {
  icon?: IconType;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

export const EmptyState = ({ icon: Icon, title, description, action, className = '' }: EmptyStateProps) => (
  <div className={`flex flex-col items-center justify-center text-center py-12 px-6 ${className}`}>
    {Icon && (
      <div className="p-4 bg-zinc-100 text-zinc-400 rounded-2xl mb-4">
        <Icon size={32} />
      </div>
    )}
    <p className="font-semibold text-zinc-700">{title}</p>
    {description && <p className="text-sm text-zinc-500 mt-1 max-w-sm">{description}</p>}
    {action && <div className="mt-5">{action}</div>}
  </div>
);

export const ErrorBanner = ({
  message,
  onRetry,
  className = '',
}: {
  message: React.ReactNode;
  onRetry?: () => void;
  className?: string;
}) => (
  <div
    role="alert"
    className={`bg-red-50 border border-red-100 text-red-700 p-3 rounded-xl text-sm flex items-start gap-3 ${className}`}
  >
    <AlertCircle size={18} className="shrink-0 mt-0.5" />
    <div className="flex-1">{message}</div>
    {onRetry && (
      <button
        type="button"
        onClick={onRetry}
        className="shrink-0 inline-flex items-center gap-1 font-semibold text-red-700 hover:text-red-800"
      >
        <RefreshCw size={14} /> Tentar de novo
      </button>
    )}
  </div>
);

export const InfoBanner = ({ message, className = '' }: { message: React.ReactNode; className?: string }) => (
  <div
    role="status"
    className={`bg-blue-50 border border-blue-100 text-blue-700 p-3 rounded-xl text-sm flex items-start gap-3 ${className}`}
  >
    <Info size={18} className="shrink-0 mt-0.5" />
    <div className="flex-1">{message}</div>
  </div>
);

// --- Status ---

export const STATUS_LABELS: Record<string, string> = {
  ABERTA: 'Aberta',
  EM_COLETA: 'Em coleta',
  EM_ROTA: 'Em rota',
  FECHADA: 'Finalizada',
  CANCELADA: 'Cancelada',
  PENDENTE: 'Pendente',
  APROVADO: 'Aprovado',
  REPROVADO: 'Reprovado',
  CANCELADO: 'Cancelado',
};

const statusStyles: Record<string, string> = {
  ABERTA: 'bg-blue-100 text-blue-700 border-blue-200',
  EM_COLETA: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  EM_ROTA: 'bg-amber-100 text-amber-700 border-amber-200',
  FECHADA: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  CANCELADA: 'bg-red-100 text-red-700 border-red-200',
  PENDENTE: 'bg-amber-100 text-amber-700 border-amber-200',
  APROVADO: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  REPROVADO: 'bg-red-100 text-red-700 border-red-200',
  CANCELADO: 'bg-zinc-100 text-zinc-600 border-zinc-200',
};

export function statusLabel(status?: string | null): string {
  if (!status) return '—';
  return STATUS_LABELS[status] ?? status.replace(/_/g, ' ');
}

export const Badge = ({ status, className = '' }: { status?: string | null; className?: string }) => (
  <span
    className={`inline-flex items-center whitespace-nowrap text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
      (status && statusStyles[status]) || 'bg-zinc-100 text-zinc-600 border-zinc-200'
    } ${className}`}
  >
    {statusLabel(status)}
  </span>
);

export const Logo = ({ size = 36, className = "" }: { size?: number, className?: string }) => (
  <div className={`flex items-center gap-3 text-emerald-600 ${className}`}>
    <Truck size={size} strokeWidth={2.5} />
    <h1 className="text-2xl font-black text-zinc-900 tracking-tighter">LOGITRACK</h1>
  </div>
);
