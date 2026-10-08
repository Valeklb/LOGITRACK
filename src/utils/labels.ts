/** Rótulos amigáveis (pt-BR). Sempre usar com fallback para o código original. */

export const AUDIT_LABELS: Record<string, string> = {
  OS_CREATED: 'OS criada',
  OS_UPDATED: 'OS editada',
  UPDATE_OS: 'OS editada',
  DRIVER_CHANGED: 'Motorista trocado',
  OS_CANCELLED: 'OS cancelada',
  REALLOCATION_REQUESTED: 'Realocação solicitada',
  REALLOCATION_APPROVED: 'Realocação aprovada',
  REALLOCATION_REJECTED: 'Realocação reprovada',
  REALLOCATION_CANCELLED: 'Realocação cancelada',
  PICKUP_RECORDED: 'Coleta registrada',
  DELIVERY_RECORDED: 'Entrega registrada',
};

export const CHECKLIST_LABELS: Record<string, string> = {
  pneus: 'Pneus',
  luzes: 'Luzes e sinalização',
  oleo: 'Óleo e água',
  freios: 'Freios',
  limpeza: 'Limpeza da cabine',
  observacao: 'Observação',
  estado_carreta: 'Carreta',
};

export const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrador',
  gestor: 'Gestor',
  driver: 'Motorista',
};

export function auditLabel(action?: string | null): string {
  if (!action) return '—';
  return AUDIT_LABELS[action] ?? action;
}

export function checklistLabel(key: string): string {
  return CHECKLIST_LABELS[key] ?? key;
}

export function roleLabel(role?: string | null): string {
  if (!role) return '—';
  return ROLE_LABELS[role] ?? role;
}
