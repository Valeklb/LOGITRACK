export type UserRole = 'driver' | 'admin' | 'gestor';

export type OSStatus = 'ABERTA' | 'EM_COLETA' | 'EM_ROTA' | 'FECHADA' | 'CANCELADA';

export type ReassignmentStatus = 'PENDENTE' | 'APROVADO' | 'REPROVADO' | 'CANCELADO';

export interface User {
  id: number;
  email: string;
  name: string;
  cpf?: string | null;
  role: UserRole;
  is_active: boolean;
  shift_status: 'OFF_SHIFT' | 'ON_SHIFT';
  current_plate?: string | null;
  shift_started_at?: string | null;
  must_change_password: boolean;
}

export interface ServiceOrder {
  id: number;
  os_number: string;
  driver_id: number;
  driver_name?: string;
  motorista_original_id?: number | null;
  /** Placa da carreta (informada pelo motorista ao iniciar a OS ou pelo admin). */
  plate?: string | null;
  /** Placa do cavalo (placa do turno do motorista ao iniciar a OS). */
  truck_plate?: string | null;
  origin: string;
  destination: string;
  status: OSStatus;
  admin_note?: string | null;
  created_at: string;
  scheduled_date?: string | null;
  /** Previsto (definido pelo admin) — 'HH:MM'. */
  os_start_time?: string | null;
  os_end_time?: string | null;
  /** Realizado (gravado pelo motorista; o admin pode ajustar). */
  route_start_time?: string | null;
  route_end_time?: string | null;
  last_reassigned_at?: string | null;
  reassignment_count: number;
  has_pickup: boolean | number;
  has_delivery: boolean | number;
  distance_km: number | null;
  haulage_cost: number | null;
  events?: OSEvent[];
  audit?: AuditLog[];
  checklists?: Checklist[];
  pending_request?: ReassignmentRequest | null;
  last_decision?: ReassignmentRequest | null;
}

export interface ReassignmentRequest {
  id: number;
  os_id: number;
  os_number?: string;
  requested_by_user_id: number;
  requested_by_name?: string;
  requested_by_role: string;
  current_driver_id: number;
  current_driver_name?: string;
  new_driver_id: number;
  new_driver_name?: string;
  reason: string;
  status: ReassignmentStatus;
  manager_user_id?: number | null;
  manager_name?: string | null;
  decision_note?: string | null;
  created_at: string;
  decided_at?: string | null;
}

export interface OSEvent {
  id: number;
  os_id: number;
  type: 'COLETA' | 'ENTREGA';
  local_time?: string | null;
  server_time: string;
  observation?: string | null;
  plate?: string | null;
  trailer_state?: 'CHEIA' | 'VAZIA' | null;
  photo_data?: string | null;
  lat?: number | null;
  lng?: number | null;
  accuracy?: number | null;
  battery_level?: number | null;
  network_type?: string | null;
  device_id?: string | null;
}

export interface AuditLog {
  id: number;
  os_id?: number | null;
  actor_name?: string;
  actor_role?: string;
  action: string;
  details: string;
  created_at: string;
}

export interface Checklist {
  id: number;
  driver_id: number;
  driver_name?: string;
  vehicle_plate: string;
  type: 'VEHICLE' | 'CONTAINER';
  os_id?: number | null;
  os_number?: string | null;
  items: Record<string, boolean | string>;
  created_at: string;
}

export interface DashboardDay {
  /** 'YYYY-MM-DD' (Manaus) */
  date: string;
  /** Dia da semana curto, ex.: 'Seg' */
  label: string;
  os: number;
  cost: number;
}

export interface DashboardStats {
  total: number;
  aberta: number;
  em_rota: number;
  fechada: number;
  cancelada: number;
  total_haulage_cost: number;
  total_distance_km: number;
  pending_approvals: number;
  drivers_on_shift: number;
  completion_rate: number | null;
  by_day: DashboardDay[];
}

/** Mensagens recebidas pelo WebSocket. */
export interface WsMessage {
  type: 'NEW_OS' | 'DATA_CHANGED' | 'SESSION_REVOKED' | string;
  os_id?: number | null;
  title?: string;
  message?: string;
}

/** Corpo de um evento de OS enviado pelo motorista (também usado na fila offline). */
export type OSEventPayload =
  | { type: 'COLETA'; local_time: string; plate: string; trailer_state: 'CHEIA' | 'VAZIA' }
  | { type: 'ENTREGA'; local_time: string; observation?: string };
