import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, Truck } from 'lucide-react';
import { Button, ErrorBanner, Input, Textarea } from './UI';

export type VehicleItemKey = 'pneus' | 'luzes' | 'oleo' | 'freios' | 'limpeza';

/** `false` = problema (permitido; fica registrado para o administrador). */
export type VehicleChecklistItems = Record<VehicleItemKey, boolean> & { observacao?: string };

export interface ChecklistFormData {
  vehicle_plate: string;
  items: VehicleChecklistItems;
}

interface ChecklistFormProps {
  onSubmit: (data: ChecklistFormData) => void | Promise<void>;
  submitting?: boolean;
  submitLabel?: string;
  initialPlate?: string;
  /** Mostra o botão "Cancelar" ao lado do envio. */
  onCancel?: () => void;
  /** Erro vindo de quem enviou (ex.: sem conexão), mostrado junto ao botão. */
  error?: string | null;
}

const ITEMS: { key: VehicleItemKey; question: string; short: string }[] = [
  { key: 'pneus', question: 'Pneus em bom estado?', short: 'Pneus' },
  { key: 'luzes', question: 'Luzes e sinalização funcionando?', short: 'Luzes' },
  { key: 'oleo', question: 'Nível de óleo e água ok?', short: 'Óleo e água' },
  { key: 'freios', question: 'Freios funcionando?', short: 'Freios' },
  { key: 'limpeza', question: 'Cabine limpa?', short: 'Limpeza' },
];

const NOTE_MAX_LENGTH = 1000;

/** Placa só com letras e números, em maiúsculas ('abc-1d23' → 'ABC1D23'). */
export function normalizePlate(value: string | null | undefined): string {
  return (value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

type Answers = Record<VehicleItemKey, boolean | null>;

const EMPTY_ANSWERS: Answers = { pneus: null, luzes: null, oleo: null, freios: null, limpeza: null };

export const ChecklistForm = ({
  onSubmit,
  submitting = false,
  submitLabel = 'Confirmar',
  initialPlate = '',
  onCancel,
  error,
}: ChecklistFormProps) => {
  const [plate, setPlate] = useState(() => (initialPlate ?? '').toUpperCase());
  const [answers, setAnswers] = useState<Answers>(EMPTY_ANSWERS);
  const [note, setNote] = useState('');
  const [tried, setTried] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const plateValue = normalizePlate(plate);
  const missing = ITEMS.filter((item) => answers[item.key] === null);
  const answeredCount = ITEMS.length - missing.length;
  const hasProblem = ITEMS.some((item) => answers[item.key] === false);

  const answer = (key: VehicleItemKey, value: boolean) => {
    setAnswers((prev) => ({ ...prev, [key]: value }));
    setLocalError(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setTried(true);

    if (!plateValue) {
      setLocalError('Informe a placa do cavalo.');
      return;
    }
    if (missing.length > 0) {
      setLocalError(`Marque OK ou Problema em: ${missing.map((item) => item.short).join(', ')}.`);
      return;
    }
    setLocalError(null);

    const items: VehicleChecklistItems = {
      pneus: answers.pneus === true,
      luzes: answers.luzes === true,
      oleo: answers.oleo === true,
      freios: answers.freios === true,
      limpeza: answers.limpeza === true,
    };
    const observacao = note.trim();
    if (hasProblem && observacao) items.observacao = observacao;

    void onSubmit({ vehicle_plate: plateValue, items });
  };

  const shownError = localError ?? error ?? null;

  return (
    <form noValidate onSubmit={handleSubmit} className="flex-1 flex flex-col">
      <div className="flex-1 p-4 space-y-4">
        <div className="bg-white p-4 rounded-2xl border border-zinc-100 shadow-sm">
          <Input
            label="Placa do cavalo (veículo)"
            value={plate}
            onChange={(value) => {
              setPlate(value.toUpperCase());
              setLocalError(null);
            }}
            placeholder="Ex.: ABC1D23"
            icon={Truck}
            maxLength={8}
            autoCapitalize="characters"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
            required
            disabled={submitting}
            error={tried && !plateValue ? 'Informe a placa do cavalo.' : null}
          />
        </div>

        <div className="flex items-center justify-between px-1">
          <h3 className="text-xs font-black text-zinc-400 uppercase tracking-widest">Checklist do veículo</h3>
          <span className="text-xs font-semibold text-zinc-500">
            {answeredCount} de {ITEMS.length} respondidos
          </span>
        </div>

        {ITEMS.map((item) => {
          const value = answers[item.key];
          const unanswered = tried && value === null;
          return (
            <div
              key={item.key}
              className={`bg-white p-4 rounded-2xl border shadow-sm space-y-3 ${
                unanswered ? 'border-red-300' : 'border-zinc-100'
              }`}
            >
              <p className="font-semibold text-zinc-800">{item.question}</p>
              <div className="grid grid-cols-2 gap-3" role="group" aria-label={item.question}>
                <button
                  type="button"
                  aria-pressed={value === true}
                  disabled={submitting}
                  onClick={() => answer(item.key, true)}
                  className={`min-h-14 rounded-xl border font-bold flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-60 ${
                    value === true
                      ? 'bg-emerald-600 border-emerald-600 text-white shadow-md shadow-emerald-100'
                      : 'bg-zinc-50 border-zinc-200 text-zinc-700'
                  }`}
                >
                  <CheckCircle2 size={20} /> OK
                </button>
                <button
                  type="button"
                  aria-pressed={value === false}
                  disabled={submitting}
                  onClick={() => answer(item.key, false)}
                  className={`min-h-14 rounded-xl border font-bold flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-60 ${
                    value === false
                      ? 'bg-red-600 border-red-600 text-white shadow-md shadow-red-100'
                      : 'bg-zinc-50 border-zinc-200 text-zinc-700'
                  }`}
                >
                  <AlertTriangle size={20} /> Problema
                </button>
              </div>
              {unanswered && <p className="text-xs text-red-600">Escolha OK ou Problema.</p>}
            </div>
          );
        })}

        {hasProblem && (
          <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl space-y-3">
            <p className="text-sm text-amber-800 flex items-start gap-2">
              <AlertTriangle size={18} className="shrink-0 mt-0.5" />
              <span>Os itens com problema ficam registrados para o administrador. Você pode continuar mesmo assim.</span>
            </p>
            <Textarea
              label="Observação (opcional)"
              value={note}
              onChange={setNote}
              placeholder="Conte o que está com problema"
              maxLength={NOTE_MAX_LENGTH}
              disabled={submitting}
            />
          </div>
        )}
      </div>

      <div className="sticky bottom-0 z-10 bg-white border-t border-zinc-100 px-4 pt-3 pb-safe space-y-3">
        {shownError && <ErrorBanner message={shownError} />}
        <div className="flex gap-3">
          {onCancel && (
            <Button variant="outline" onClick={onCancel} disabled={submitting} className="min-h-14 px-5">
              Cancelar
            </Button>
          )}
          <Button type="submit" disabled={submitting} className="flex-1 min-h-14 text-base font-bold">
            {submitting ? (
              <>
                <Loader2 size={20} className="animate-spin" /> Enviando…
              </>
            ) : (
              submitLabel
            )}
          </Button>
        </div>
      </div>
    </form>
  );
};
