import React, { useMemo, useState } from 'react';
import type { ServiceOrder, User } from '../../types';
import { api, errorMessage } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { Button, ErrorBanner, InfoBanner, Input, Modal, Select, Textarea, type SelectOption } from '../common/UI';
import {
  formatCurrencyBR,
  formatNumberBR,
  formatTimeManaus,
  parseDecimalBR,
  todayInManaus,
} from '../../utils/datetime';
import type { AdminOS } from './shared';

interface OSFormValues {
  os_number: string;
  driver_id: string;
  plate: string;
  origin: string;
  destination: string;
  scheduled_date: string;
  os_start_time: string;
  os_end_time: string;
  admin_note: string;
  distance_km: string;
  haulage_cost: string;
  route_start_time: string;
  route_end_time: string;
}

interface OSPayload {
  os_number: string | null;
  driver_id: number | null;
  plate: string | null;
  origin: string | null;
  destination: string | null;
  scheduled_date: string | null;
  os_start_time: string | null;
  os_end_time: string | null;
  admin_note: string | null;
  distance_km: number | null;
  haulage_cost: number | null;
  route_start_time: string | null;
  route_end_time: string | null;
}

const CREATE_OPTIONAL_KEYS = ['plate', 'os_start_time', 'os_end_time', 'admin_note', 'distance_km', 'haulage_cost'] as const;

const EDIT_KEYS: (keyof OSPayload)[] = [
  'os_number',
  'driver_id',
  'plate',
  'origin',
  'destination',
  'scheduled_date',
  'os_start_time',
  'os_end_time',
  'admin_note',
  'distance_km',
  'haulage_cost',
  'route_start_time',
  'route_end_time',
];

/** Horário guardado ('08:30', '08:30:00' ou data/hora antiga) → valor de <input type="time">. */
function toTimeInput(value?: string | null): string {
  if (!value) return '';
  const v = value.trim();
  const m = v.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (m) return `${m[1].padStart(2, '0')}:${m[2]}`;
  const t = formatTimeManaus(v);
  return /^\d{2}:\d{2}$/.test(t) ? t : '';
}

/** Número guardado → texto no padrão brasileiro para edição ('1200,5'). */
function toDecimalInput(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '';
  return String(value).replace('.', ',');
}

function valuesFromOS(os: AdminOS | null): OSFormValues {
  return {
    os_number: os?.os_number ?? '',
    driver_id: os?.driver_id ? String(os.driver_id) : '',
    plate: os?.plate ?? '',
    origin: os?.origin ?? '',
    destination: os?.destination ?? '',
    scheduled_date: os ? (os.scheduled_date ?? '') : todayInManaus(),
    os_start_time: toTimeInput(os?.os_start_time),
    os_end_time: toTimeInput(os?.os_end_time),
    admin_note: os?.admin_note ?? '',
    distance_km: toDecimalInput(os?.distance_km),
    haulage_cost: toDecimalInput(os?.haulage_cost),
    route_start_time: toTimeInput(os?.route_start_time),
    route_end_time: toTimeInput(os?.route_end_time),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Valores do formulário já limpos, no formato que a API espera. */
function toPayload(v: OSFormValues): OSPayload {
  const text = (s: string) => s.trim() || null;
  const amount = (s: string) => {
    const n = parseDecimalBR(s);
    return typeof n === 'number' ? round2(n) : null;
  };
  const plate = v.plate.trim().toUpperCase().replace(/\s+/g, '');
  return {
    os_number: text(v.os_number),
    driver_id: v.driver_id ? Number(v.driver_id) : null,
    plate: plate || null,
    origin: text(v.origin),
    destination: text(v.destination),
    scheduled_date: v.scheduled_date || null,
    os_start_time: v.os_start_time || null,
    os_end_time: v.os_end_time || null,
    admin_note: text(v.admin_note),
    distance_km: amount(v.distance_km),
    haulage_cost: amount(v.haulage_cost),
    route_start_time: v.route_start_time || null,
    route_end_time: v.route_end_time || null,
  };
}

interface OSFormModalProps {
  /** OS a editar; `null` para criar uma nova. */
  os: AdminOS | null;
  /** Usuários (a lista pode ter todos os papéis; só motoristas ativos aparecem). */
  drivers: User[];
  onClose: () => void;
  /** Chamado depois de salvar (a OS devolvida pela API, ou null se nada mudou). */
  onSaved: (os: ServiceOrder | null) => void;
}

/** Formulário de OS (criar e editar). Renderize dentro de <AnimatePresence>. */
export const OSFormModal = ({ os, drivers, onClose, onSaved }: OSFormModalProps) => {
  const { user } = useAuth();
  const isEdit = Boolean(os);
  const [initial] = useState(() => valuesFromOS(os));
  const [form, setForm] = useState<OSFormValues>(initial);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (key: keyof OSFormValues) => (value: string) => setForm((f) => ({ ...f, [key]: value }));

  // --- Motoristas ---
  const activeDrivers = useMemo(
    () => drivers.filter((d) => d.role === 'driver' && d.is_active).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
    [drivers],
  );
  const driverOptions: SelectOption[] = activeDrivers.map((d) => ({
    value: String(d.id),
    label: d.shift_status === 'ON_SHIFT' ? `${d.name} · em turno` : d.name,
  }));
  if (os?.driver_id && !activeDrivers.some((d) => d.id === Number(os.driver_id))) {
    const known = drivers.find((d) => d.id === Number(os.driver_id));
    driverOptions.unshift({ value: String(os.driver_id), label: `${known?.name ?? os.driver_name ?? 'Motorista'} (inativo)` });
  }

  const isClosed = os?.status === 'FECHADA' || os?.status === 'CANCELADA';
  const adminMustReassign = Boolean(os && user?.role === 'admin' && os.status !== 'ABERTA');
  const driverLocked = isClosed || adminMustReassign;
  const driverHint = isClosed
    ? 'Não dá para trocar o motorista de uma OS finalizada ou cancelada.'
    : adminMustReassign
      ? 'A viagem já começou. Para trocar o motorista, use "Realocar" no detalhe da OS.'
      : undefined;

  // --- Validação ---
  const payload = toPayload(form);
  const kmParsed = parseDecimalBR(form.distance_km);
  const costParsed = parseDecimalBR(form.haulage_cost);
  const errors = {
    os_number: !payload.os_number ? 'Informe o número da OS.' : null,
    driver_id: !payload.driver_id ? 'Escolha o motorista.' : null,
    origin: !payload.origin ? 'Informe a origem.' : null,
    destination: !payload.destination ? 'Informe o destino.' : null,
    scheduled_date: isEdit && !payload.scheduled_date ? 'Informe a data da OS.' : null,
  };
  const kmError = kmParsed === undefined ? 'Use números, ex.: 150,5' : null;
  const costError = costParsed === undefined ? 'Use números, ex.: 1200,50' : null;
  const hasErrors = Object.values(errors).some(Boolean) || Boolean(kmError || costError);
  const show = (message: string | null) => (submitted ? message : null);

  const handleSubmit = async () => {
    if (saving) return;
    setSubmitted(true);
    if (hasErrors) return;
    setError(null);

    try {
      if (!os) {
        const body: Record<string, unknown> = {
          os_number: payload.os_number,
          driver_id: payload.driver_id,
          origin: payload.origin,
          destination: payload.destination,
          scheduled_date: payload.scheduled_date ?? todayInManaus(),
        };
        for (const key of CREATE_OPTIONAL_KEYS) {
          if (payload[key] !== null) body[key] = payload[key];
        }
        setSaving(true);
        const res = await api<{ os?: ServiceOrder }>('/api/os', { method: 'POST', body });
        onSaved(res?.os ?? null);
        return;
      }

      // Edição: envia só o que mudou.
      const before = toPayload(initial);
      const changes: Record<string, unknown> = {};
      for (const key of EDIT_KEYS) {
        if (key === 'driver_id' && driverLocked) continue;
        if (payload[key] !== before[key]) changes[key] = payload[key];
      }
      if (Object.keys(changes).length === 0) {
        onSaved(null);
        return;
      }
      setSaving(true);
      const res = await api<{ os?: ServiceOrder }>(`/api/os/${os.id}`, { method: 'PATCH', body: changes });
      onSaved(res?.os ?? null);
    } catch (err) {
      setError(errorMessage(err, 'Não foi possível salvar a OS. Tente de novo.'));
      setSaving(false);
    }
  };

  return (
    <Modal
      title={isEdit ? `Editar OS #${os?.os_number}` : 'Nova ordem de serviço'}
      onClose={onClose}
      className="max-w-2xl"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? 'Salvando…' : isEdit ? 'Salvar alterações' : 'Criar OS'}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {error && <ErrorBanner message={error} />}
        {!isEdit && activeDrivers.length === 0 && (
          <InfoBanner message="Nenhum motorista ativo. Cadastre um motorista em Equipe antes de criar a OS." />
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Número da OS"
            required
            value={form.os_number}
            onChange={set('os_number')}
            placeholder="Ex.: 12345"
            autoComplete="off"
            error={show(errors.os_number)}
          />
          <Select
            label="Motorista"
            required
            value={form.driver_id}
            onChange={set('driver_id')}
            options={driverOptions}
            placeholder="Selecione o motorista"
            disabled={driverLocked}
            hint={driverHint}
            error={show(errors.driver_id)}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Origem"
            required
            value={form.origin}
            onChange={set('origin')}
            placeholder="Ex.: Porto Chibatão"
            error={show(errors.origin)}
          />
          <Input
            label="Destino"
            required
            value={form.destination}
            onChange={set('destination')}
            placeholder="Ex.: Distrito Industrial"
            error={show(errors.destination)}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Placa da carreta"
            value={form.plate}
            onChange={set('plate')}
            placeholder="Opcional — o motorista informa ao iniciar"
            autoCapitalize="characters"
            autoComplete="off"
            maxLength={20}
          />
          <Input
            label="Data"
            type="date"
            required={isEdit}
            value={form.scheduled_date}
            onChange={set('scheduled_date')}
            hint={!isEdit ? 'Se ficar vazio, vale a data de hoje.' : undefined}
            error={show(errors.scheduled_date)}
          />
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-bold text-zinc-700">Previsto</legend>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Início" type="time" value={form.os_start_time} onChange={set('os_start_time')} />
            <Input label="Fim" type="time" value={form.os_end_time} onChange={set('os_end_time')} />
          </div>
        </fieldset>

        {isEdit && (
          <fieldset className="space-y-2">
            <legend className="text-sm font-bold text-zinc-700">Realizado (ajuste manual)</legend>
            <div className="grid grid-cols-2 gap-4">
              <Input label="Início" type="time" value={form.route_start_time} onChange={set('route_start_time')} />
              <Input label="Fim" type="time" value={form.route_end_time} onChange={set('route_end_time')} />
            </div>
            <p className="text-xs text-zinc-500">Normalmente preenchido pelo motorista ao iniciar e finalizar a viagem.</p>
          </fieldset>
        )}

        <Textarea
          label="Observação para o motorista"
          value={form.admin_note}
          onChange={set('admin_note')}
          placeholder="Ex.: Pegar a nota fiscal na portaria."
          maxLength={2000}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="KM percorrido"
            value={form.distance_km}
            onChange={set('distance_km')}
            inputMode="decimal"
            autoComplete="off"
            placeholder="Ex.: 150,5"
            error={kmError}
            hint={typeof kmParsed === 'number' ? `= ${formatNumberBR(kmParsed)} km` : 'Pode lançar depois da viagem.'}
          />
          <Input
            label="Custo da puxada (R$)"
            value={form.haulage_cost}
            onChange={set('haulage_cost')}
            inputMode="decimal"
            autoComplete="off"
            placeholder="Ex.: 1200,50"
            error={costError}
            hint={typeof costParsed === 'number' ? `= ${formatCurrencyBR(costParsed)}` : 'Pode lançar depois da viagem.'}
          />
        </div>
      </div>
    </Modal>
  );
};
