export interface User {
  id: number;
  email: string;
  name: string;
  cpf?: string;
  role: 'driver' | 'admin' | 'gestor';
  is_active?: boolean;
  shift_status?: 'OFF_SHIFT' | 'ON_SHIFT';
  assignedRoute?: Route;
}

export interface Route {
  id: number;
  name: string;
  start_lat: number;
  start_lng: number;
  assigned_driver_id?: number;
  driver_name?: string;
  status: 'AVAILABLE' | 'ASSIGNED' | 'COMPLETED';
  created_at: string;
}

export interface ServiceOrder {
  id: number;
  os_number: string;
  driver_id: number;
  driver_name?: string;
  motorista_original_id?: number;
  plate: string;
  origin: string;
  destination: string;
  status: 'ABERTA' | 'EM_COLETA' | 'EM_ROTA' | 'FECHADA' | 'CANCELADA';
  admin_note?: string;
  created_at: string;
  scheduled_date?: string;
  os_start_time?: string;
  os_end_time?: string;
  route_start_time?: string;
  route_end_time?: string;
  last_reassigned_at?: string;
  reassignment_count: number;
  has_pickup: boolean;
  has_delivery: boolean;
  distance_km?: number;
  haulage_cost?: number;
  events?: OSEvent[];
  audit?: AuditLog[];
  pending_request?: ReassignmentRequest;
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
  status: 'PENDENTE' | 'APROVADO' | 'REPROVADO' | 'CANCELADO';
  manager_user_id?: number;
  manager_name?: string;
  decision_note?: string;
  created_at: string;
  decided_at?: string;
}

export interface OSEvent {
  id: number;
  os_id: number;
  type: 'COLETA' | 'ENTREGA';
  photo_data: string;
  lat: number;
  lng: number;
  accuracy: number;
  battery_level: number;
  network_type: string;
  device_id: string;
  local_time: string;
  server_time: string;
  observation?: string;
}

export interface AuditLog {
  id: number;
  os_id?: number;
  actor_id: number;
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
  os_id?: number;
  items: Record<string, boolean | string>;
  created_at: string;
}

export interface DashboardStats {
  total: number;
  aberta: number;
  em_rota: number;
  fechada: number;
  cancelada: number;
  pending_approvals: number;
  total_haulage_cost?: number;
}
