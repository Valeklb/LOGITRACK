import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  List, 
  History, 
  Map as MapIcon, 
  ShieldCheck, 
  Users, 
  User as UserIcon, 
  LogOut, 
  Plus, 
  Search, 
  ChevronRight, 
  XCircle, 
  UserPlus,
  TrendingUp,
  DollarSign,
  Activity,
  BarChart3,
  Truck,
  Pencil,
  Trash2
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  LineChart, 
  Line,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { User, ServiceOrder, DashboardStats } from '../../types';
import { Button, Input, Badge, Logo } from '../common/UI';
import { apiUrl } from '../../lib/api';
import { formatDateBR, formatTime } from '../../utils/coords';

const emptyOSForm = () => ({
  os_number: '',
  plate: '',
  origin: '',
  destination: '',
  driver_id: '',
  scheduled_date: new Date().toISOString().split('T')[0],
  os_start_time: '',
  os_end_time: '',
  route_start_time: '',
  route_end_time: '',
});

const OSFormFields = ({ form, setForm, drivers }: { form: ReturnType<typeof emptyOSForm>, setForm: (f: ReturnType<typeof emptyOSForm>) => void, drivers: User[] }) => (
  <>
    <div className="grid grid-cols-2 gap-6">
      <Input label="Número da OS" value={form.os_number} onChange={(v: string) => setForm({ ...form, os_number: v })} placeholder="Ex: 12345" />
      <Input label="Placa" value={form.plate} onChange={(v: string) => setForm({ ...form, plate: v })} placeholder="ABC-1234" />
    </div>
    <div className="space-y-1.5">
      <label className="text-sm font-bold text-zinc-700">Motorista Responsável</label>
      <select value={form.driver_id} onChange={(e) => setForm({ ...form, driver_id: e.target.value })} className="w-full bg-white border border-zinc-200 rounded-xl py-3 px-4 focus:ring-2 focus:ring-emerald-500 outline-none">
        <option value="">Selecione um motorista</option>
        {drivers.filter(d => d.role === 'driver').map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
      </select>
    </div>
    <div className="grid grid-cols-2 gap-6">
      <Input label="Origem" value={form.origin} onChange={(v: string) => setForm({ ...form, origin: v })} />
      <Input label="Destino" value={form.destination} onChange={(v: string) => setForm({ ...form, destination: v })} />
    </div>
    <div className="space-y-1.5">
      <label className="text-sm font-bold text-zinc-700">Data da OS</label>
      <input type="date" value={form.scheduled_date} onChange={(e) => setForm({ ...form, scheduled_date: e.target.value })} className="w-full bg-white border border-zinc-200 rounded-xl py-3 px-4 focus:ring-2 focus:ring-emerald-500 outline-none" />
    </div>
    <div className="grid grid-cols-2 gap-6">
      <div className="space-y-1.5">
        <label className="text-sm font-bold text-zinc-700">Início da OS</label>
        <input type="time" value={form.os_start_time} onChange={(e) => setForm({ ...form, os_start_time: e.target.value })} className="w-full bg-white border border-zinc-200 rounded-xl py-3 px-4 focus:ring-2 focus:ring-emerald-500 outline-none" />
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-bold text-zinc-700">Fim da OS</label>
        <input type="time" value={form.os_end_time} onChange={(e) => setForm({ ...form, os_end_time: e.target.value })} className="w-full bg-white border border-zinc-200 rounded-xl py-3 px-4 focus:ring-2 focus:ring-emerald-500 outline-none" />
      </div>
    </div>
    <div className="grid grid-cols-2 gap-6">
      <div className="space-y-1.5">
        <label className="text-sm font-bold text-zinc-700">Início da Rota</label>
        <input type="time" value={form.route_start_time} onChange={(e) => setForm({ ...form, route_start_time: e.target.value })} className="w-full bg-white border border-zinc-200 rounded-xl py-3 px-4 focus:ring-2 focus:ring-emerald-500 outline-none" />
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-bold text-zinc-700">Fim da Rota</label>
        <input type="time" value={form.route_end_time} onChange={(e) => setForm({ ...form, route_end_time: e.target.value })} className="w-full bg-white border border-zinc-200 rounded-xl py-3 px-4 focus:ring-2 focus:ring-emerald-500 outline-none" />
      </div>
    </div>
  </>
);

export const AdminDashboard = ({ user, onLogout }: { user: User, onLogout: () => void }) => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [orders, setOrders] = useState<ServiceOrder[]>([]);
  const [drivers, setDrivers] = useState<User[]>([]);
  const [routes, setRoutes] = useState<any[]>([]);
  const [checklists, setChecklists] = useState<any[]>([]);
  const [view, setView] = useState<'dashboard' | 'orders' | 'drivers' | 'approvals' | 'routes' | 'checklists' | 'history'>('dashboard');
  const [showCreateOS, setShowCreateOS] = useState(false);
  const [editingOSId, setEditingOSId] = useState<number | null>(null);
  const [osForm, setOsForm] = useState(emptyOSForm());
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showCreateDriver, setShowCreateDriver] = useState(false);
  const [newDriver, setNewDriver] = useState({ name: '', email: '', password: '', cpf: '' });
  const [showCreateRoute, setShowCreateRoute] = useState(false);
  const [newRoute, setNewRoute] = useState({ name: '', start_lat: '', start_lng: '' });
  const [loading, setLoading] = useState(true);

  const navigate = useNavigate();

  const fetchData = async () => {
    setLoading(true);
    try {
      const [statsRes, ordersRes, usersRes, routesRes, checklistsRes] = await Promise.all([
        fetch(apiUrl('/api/stats')),
        fetch(apiUrl('/api/os?role=admin')),
        fetch(apiUrl('/api/users')),
        fetch(apiUrl('/api/routes')),
        fetch(apiUrl('/api/checklists'))
      ]);
      setStats(await statsRes.json());
      setOrders(await ordersRes.json());
      const users = await usersRes.json();
      setDrivers(user.role === 'admin' ? users : users.filter((u: User) => u.role === 'driver'));
      setRoutes(await routesRes.json());
      setChecklists(await checklistsRes.json());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (view === 'approvals') {
      fetch(apiUrl('/api/reassign/pending')).then(res => res.json()).then(setPendingRequests);
    }
  }, [view]);

  const handleDecision = async (requestId: number, status: 'APROVADO' | 'REPROVADO', note: string) => {
    const res = await fetch(apiUrl(`/api/reassign/${requestId}/decide`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, decision_note: note, actor_id: user.id })
    });
    if (res.ok) {
      fetch(apiUrl('/api/reassign/pending')).then(res => res.json()).then(setPendingRequests);
      fetchData();
    }
  };

  const handleCreateOS = async () => {
    if (!osForm.os_number || !osForm.driver_id) return alert('Preencha os campos obrigatórios');
    const res = await fetch(apiUrl('/api/os'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...osForm, actor_id: user.id })
    });
    if (res.ok) {
      setShowCreateOS(false);
      setOsForm(emptyOSForm());
      fetchData();
    } else {
      const err = await res.json();
      alert(err.error || 'Erro ao criar OS');
    }
  };

  const openEditOS = (os: ServiceOrder) => {
    setOsForm({
      os_number: os.os_number,
      plate: os.plate,
      origin: os.origin,
      destination: os.destination,
      driver_id: String(os.driver_id),
      scheduled_date: os.scheduled_date || os.created_at.split('T')[0],
      os_start_time: os.os_start_time || '',
      os_end_time: os.os_end_time || '',
      route_start_time: os.route_start_time || '',
      route_end_time: os.route_end_time || '',
    });
    setEditingOSId(os.id);
  };

  const handleUpdateOS = async () => {
    if (!editingOSId || !osForm.os_number || !osForm.driver_id) return alert('Preencha os campos obrigatórios');
    const res = await fetch(apiUrl(`/api/os/${editingOSId}`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...osForm, actor_id: user.id })
    });
    if (res.ok) {
      setEditingOSId(null);
      setOsForm(emptyOSForm());
      fetchData();
    } else {
      const err = await res.json();
      alert(err.error || 'Erro ao atualizar OS');
    }
  };

  const handleDeleteOS = async (os: ServiceOrder) => {
    if (!confirm(`Excluir a OS #${os.os_number}? Esta ação não pode ser desfeita.`)) return;
    const res = await fetch(apiUrl(`/api/os/${os.id}`), {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actor_id: user.id })
    });
    if (res.ok) {
      fetchData();
    } else {
      const err = await res.json();
      alert(err.error || 'Erro ao excluir OS');
    }
  };

  const closeOSModal = () => {
    setShowCreateOS(false);
    setEditingOSId(null);
    setOsForm(emptyOSForm());
  };

  const handleCreateDriver = async () => {
    if (!newDriver.name || !newDriver.email || !newDriver.password) return alert('Preencha os campos obrigatórios');
    const res = await fetch(apiUrl('/api/users'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...newDriver, role: 'driver' })
    });
    if (res.ok) {
      setShowCreateDriver(false);
      fetchData();
    } else {
      const err = await res.json();
      alert(err.error || 'Erro ao criar motorista');
    }
  };

  const toggleUserStatus = async (userId: number, currentStatus: boolean) => {
    const res = await fetch(apiUrl(`/api/users/${userId}`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !currentStatus })
    });
    if (res.ok) {
      fetchData();
    }
  };

  const filteredOrders = orders.filter(os => 
    os.os_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
    os.plate.toLowerCase().includes(searchTerm.toLowerCase()) ||
    os.driver_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Mock data for charts - in a real app this would come from the API
  const chartData = [
    { name: 'Seg', os: 12, cost: 450 },
    { name: 'Ter', os: 19, cost: 800 },
    { name: 'Qua', os: 15, cost: 600 },
    { name: 'Qui', os: 22, cost: 950 },
    { name: 'Sex', os: 30, cost: 1200 },
    { name: 'Sáb', os: 10, cost: 300 },
    { name: 'Dom', os: 5, cost: 150 },
  ];

  const pieData = [
    { name: 'Finalizadas', value: stats?.fechada || 0, color: '#10b981' },
    { name: 'Em Rota', value: stats?.em_rota || 0, color: '#f59e0b' },
    { name: 'Abertas', value: stats?.aberta || 0, color: '#3b82f6' },
    { name: 'Canceladas', value: stats?.cancelada || 0, color: '#ef4444' },
  ];

  return (
    <div className="min-h-screen bg-[#F8F9FA] flex flex-col lg:flex-row font-sans">
      {/* Sidebar - Desktop */}
      <aside className="hidden lg:flex flex-col w-72 bg-white border-r border-zinc-200 p-8 space-y-10 shadow-sm z-30">
        <Logo />
        <nav className="flex-1 space-y-1">
          <p className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] mb-4 px-4">Menu Principal</p>
          {[
            { id: 'dashboard', icon: LayoutDashboard, label: 'Painel Geral' },
            { id: 'orders', icon: List, label: 'Ordens de Serviço' },
            { id: 'history', icon: History, label: 'Histórico de OS' },
            { id: 'routes', icon: MapIcon, label: 'Rotas Programadas' },
            { id: 'checklists', icon: ShieldCheck, label: 'Checklists' },
            { id: 'drivers', icon: Users, label: 'Equipe' },
          ].map(item => (
            <button 
              key={item.id}
              onClick={() => setView(item.id as any)} 
              className={`w-full flex items-center gap-3 p-3.5 rounded-xl transition-all duration-200 ${view === item.id ? 'bg-emerald-50 text-emerald-700 font-bold shadow-sm' : 'text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900'}`}
            >
              <item.icon size={20} strokeWidth={view === item.id ? 2.5 : 2} /> 
              <span className="text-sm">{item.label}</span>
            </button>
          ))}
          
          {user.role === 'gestor' && (
            <div className="pt-4">
              <p className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] mb-4 px-4">Gestão</p>
              <button 
                onClick={() => setView('approvals')} 
                className={`w-full flex items-center gap-3 p-3.5 rounded-xl transition-all duration-200 ${view === 'approvals' ? 'bg-emerald-50 text-emerald-700 font-bold shadow-sm' : 'text-zinc-50 text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900'}`}
              >
                <ShieldCheck size={20} /> 
                <span className="text-sm">Aprovações</span>
                {stats?.pending_approvals ? <span className="ml-auto bg-red-500 text-white text-[10px] px-2 py-0.5 rounded-full font-black">{stats.pending_approvals}</span> : null}
              </button>
            </div>
          )}
        </nav>
        
        <div className="pt-8 border-t border-zinc-100">
          <div className="flex items-center gap-4 mb-6 p-2">
            <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center text-emerald-700 font-black">{user.name.charAt(0)}</div>
            <div className="flex-1 overflow-hidden">
              <p className="text-sm font-bold truncate">{user.name}</p>
              <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">{user.role}</p>
            </div>
          </div>
          <button onClick={onLogout} className="w-full flex items-center gap-3 p-3.5 text-red-500 hover:bg-red-50 rounded-xl transition-all font-bold text-sm">
            <LogOut size={20} /> Sair do Sistema
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto pb-20 lg:pb-0">
        {/* Mobile Header */}
        <header className="bg-white border-b border-zinc-200 p-4 flex items-center justify-between lg:hidden sticky top-0 z-20">
          <Logo size={28} />
          <button onClick={onLogout} className="p-2 text-zinc-400"><LogOut size={24} /></button>
        </header>

        <div className="p-6 lg:p-10 space-y-8 max-w-7xl mx-auto">
          {view === 'dashboard' && (
            <>
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div className="space-y-1">
                  <h2 className="text-3xl font-black tracking-tight text-zinc-900">Dashboard Executivo</h2>
                  <p className="text-zinc-500 font-medium">Bem-vindo de volta, {user.name.split(' ')[0]}. Aqui está o resumo da operação.</p>
                </div>
                <div className="flex gap-3">
                  <Button variant="outline" icon={Activity} onClick={fetchData}>Atualizar Dados</Button>
                  <Button icon={Plus} onClick={() => { setOsForm(emptyOSForm()); setShowCreateOS(true); }}>Nova OS</Button>
                </div>
              </div>

              {/* Stats Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
                {[
                  { label: 'Custo Total Acumulado', value: stats?.total_haulage_cost ? `R$ ${stats.total_haulage_cost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : 'R$ 0,00', icon: DollarSign, color: 'emerald' },
                  { label: 'Eficiência de Entrega', value: '94.2%', icon: TrendingUp, color: 'blue' },
                  { label: 'OS em Operação', value: stats?.em_rota || 0, icon: Truck, color: 'amber' },
                  { label: 'Alertas Pendentes', value: stats?.pending_approvals || 0, icon: Activity, color: 'red' }
                ].map((stat, i) => (
                  <div key={i} className="bg-white p-6 rounded-3xl border border-zinc-200 shadow-sm flex items-start justify-between">
                    <div className="space-y-2">
                      <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">{stat.label}</p>
                      <p className="text-2xl font-black text-zinc-900 tracking-tight">{stat.value}</p>
                    </div>
                    <div className={`p-3 bg-${stat.color}-50 text-${stat.color}-600 rounded-2xl`}>
                      <stat.icon size={20} />
                    </div>
                  </div>
                ))}
              </div>

              {/* Charts Section */}
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                <div className="xl:col-span-2 bg-white p-8 rounded-[2rem] border border-zinc-200 shadow-sm space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-black flex items-center gap-2"><BarChart3 size={20} className="text-emerald-600" /> Volume de Puxadas (7 dias)</h3>
                    <select className="text-xs font-bold bg-zinc-50 border-none rounded-lg p-2 outline-none">
                      <option>Esta Semana</option>
                      <option>Semana Passada</option>
                    </select>
                  </div>
                  <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fontWeight: 600, fill: '#94a3b8' }} dy={10} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fontWeight: 600, fill: '#94a3b8' }} />
                        <Tooltip 
                          contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                          cursor={{ fill: '#f8fafc' }}
                        />
                        <Bar dataKey="os" fill="#10b981" radius={[6, 6, 0, 0]} barSize={32} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="bg-white p-8 rounded-[2rem] border border-zinc-200 shadow-sm space-y-6">
                  <h3 className="text-lg font-black flex items-center gap-2"><Activity size={20} className="text-blue-600" /> Status da Frota</h3>
                  <div className="h-[250px] w-full relative">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={pieData}
                          innerRadius={60}
                          outerRadius={80}
                          paddingAngle={5}
                          dataKey="value"
                        >
                          {pieData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                      <p className="text-2xl font-black text-zinc-900">{stats?.total || 0}</p>
                      <p className="text-[10px] font-bold text-zinc-400 uppercase">Total OS</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {pieData.map((item, i) => (
                      <div key={i} className="flex items-center justify-between text-xs font-bold">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                          <span className="text-zinc-500">{item.name}</span>
                        </div>
                        <span className="text-zinc-900">{item.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Recent Activity Table */}
              <div className="bg-white rounded-[2rem] border border-zinc-200 shadow-sm overflow-hidden">
                <div className="p-8 border-b border-zinc-100 flex items-center justify-between">
                  <h3 className="text-lg font-black">Monitoramento em Tempo Real</h3>
                  <button onClick={() => setView('orders')} className="text-xs text-emerald-600 font-bold hover:underline uppercase tracking-widest">Ver Todas as Ordens</button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-zinc-50/50 text-[10px] font-black text-zinc-400 uppercase tracking-[0.15em]">
                        <th className="px-8 py-4">Ordem</th>
                        <th className="px-8 py-4">Motorista</th>
                        <th className="px-8 py-4">Veículo</th>
                        <th className="px-8 py-4">Status</th>
                        <th className="px-8 py-4 text-right">Ação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {orders.slice(0, 5).map(os => (
                        <tr key={os.id} className="hover:bg-zinc-50/50 transition-colors group">
                          <td className="px-8 py-5 font-black text-zinc-900">#{os.os_number}</td>
                          <td className="px-8 py-5">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 bg-zinc-100 rounded-lg flex items-center justify-center text-[10px] font-black text-zinc-500">{os.driver_name?.charAt(0)}</div>
                              <span className="text-sm font-bold text-zinc-700">{os.driver_name}</span>
                            </div>
                          </td>
                          <td className="px-8 py-5 text-sm font-medium text-zinc-500">{os.plate}</td>
                          <td className="px-8 py-5"><Badge status={os.status} /></td>
                          <td className="px-8 py-5 text-right">
                            <button onClick={() => navigate(`/os/${os.id}`)} className="p-2 text-zinc-300 hover:text-emerald-600 transition-colors group-hover:translate-x-1 duration-200">
                              <ChevronRight size={20} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* Other views (Orders, History, etc.) would go here, following a similar clean desktop pattern */}
          {view === 'orders' && (
            <div className="space-y-8">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <h2 className="text-3xl font-black tracking-tight text-zinc-900">Gestão de Ordens</h2>
                <div className="flex gap-4">
                  <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
                    <input 
                      type="text" 
                      placeholder="Filtrar por OS, Placa ou Motorista..." 
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-11 pr-6 py-2.5 bg-white border border-zinc-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 transition-all text-sm w-72" 
                    />
                  </div>
                  <Button icon={Plus} onClick={() => { setOsForm(emptyOSForm()); setShowCreateOS(true); }}>Nova OS</Button>
                </div>
              </div>

              <div className="bg-white rounded-[2rem] border border-zinc-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-zinc-50/50 border-b border-zinc-100 text-[10px] font-black text-zinc-400 uppercase tracking-widest">
                        <th className="p-6">Número</th>
                        <th className="p-6">Motorista</th>
                        <th className="p-6">Rota</th>
                        <th className="p-6">Data</th>
                        <th className="p-6">OS (Início → Fim)</th>
                        <th className="p-6">Rota (Início → Fim)</th>
                        <th className="p-6">Status</th>
                        <th className="p-6 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {filteredOrders.map(os => (
                        <tr key={os.id} className="hover:bg-zinc-50/50 transition-colors">
                          <td className="p-6 font-black text-zinc-900">#{os.os_number}</td>
                          <td className="p-6 text-sm font-bold text-zinc-700">{os.driver_name}</td>
                          <td className="p-6 text-sm text-zinc-500 font-medium">{os.origin} → {os.destination}</td>
                          <td className="p-6 text-xs text-zinc-500 font-bold">{formatDateBR(os.scheduled_date || os.created_at)}</td>
                          <td className="p-6 text-xs text-zinc-600 font-bold">{formatTime(os.os_start_time)} → {formatTime(os.os_end_time)}</td>
                          <td className="p-6 text-xs text-zinc-600 font-bold">{formatTime(os.route_start_time)} → {formatTime(os.route_end_time)}</td>
                          <td className="p-6"><Badge status={os.status} /></td>
                          <td className="p-6 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button onClick={() => navigate(`/os/${os.id}`)} className="p-2 text-zinc-400 hover:text-emerald-600 transition-colors" title="Ver detalhes">
                                <ChevronRight size={18} />
                              </button>
                              <button onClick={() => openEditOS(os)} className="p-2 text-zinc-400 hover:text-blue-600 transition-colors" title="Editar">
                                <Pencil size={18} />
                              </button>
                              <button onClick={() => handleDeleteOS(os)} className="p-2 text-zinc-400 hover:text-red-600 transition-colors" title="Excluir">
                                <Trash2 size={18} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {view === 'history' && (
            <div className="space-y-8">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <h2 className="text-3xl font-black tracking-tight text-zinc-900">Histórico de Operações</h2>
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
                  <input 
                    type="text" 
                    placeholder="Buscar no histórico..." 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-11 pr-6 py-2.5 bg-white border border-zinc-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 transition-all text-sm w-72" 
                  />
                </div>
              </div>

              <div className="bg-white rounded-[2rem] border border-zinc-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-zinc-50/50 border-b border-zinc-100 text-[10px] font-black text-zinc-400 uppercase tracking-widest">
                        <th className="p-6">OS</th>
                        <th className="p-6">Motorista</th>
                        <th className="p-6">Placa</th>
                        <th className="p-6">KM Percorrido</th>
                        <th className="p-6">Custo da Puxada</th>
                        <th className="p-6">Status</th>
                        <th className="p-6">Data</th>
                        <th className="p-6">OS (Início → Fim)</th>
                        <th className="p-6">Rota (Início → Fim)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {filteredOrders.filter(os => os.status === 'FECHADA' || os.status === 'CANCELADA').map(os => (
                        <tr key={os.id} className="hover:bg-zinc-50/50 transition-colors">
                          <td className="p-6 font-black text-zinc-900">#{os.os_number}</td>
                          <td className="p-6 text-sm font-bold text-zinc-700">{os.driver_name}</td>
                          <td className="p-6 text-sm text-zinc-500 font-medium">{os.plate}</td>
                          <td className="p-6 text-sm font-black text-emerald-600">
                            {os.distance_km ? `${os.distance_km.toFixed(2)} KM` : '0.00 KM'}
                          </td>
                          <td className="p-6 text-sm font-black text-zinc-900">
                            {os.haulage_cost ? `R$ ${os.haulage_cost.toFixed(2)}` : 'R$ 0.00'}
                          </td>
                          <td className="p-6"><Badge status={os.status} /></td>
                          <td className="p-6 text-xs text-zinc-400 font-bold">{formatDateBR(os.scheduled_date || os.created_at)}</td>
                          <td className="p-6 text-xs text-zinc-600 font-bold">{formatTime(os.os_start_time)} → {formatTime(os.os_end_time)}</td>
                          <td className="p-6 text-xs text-zinc-600 font-bold">{formatTime(os.route_start_time)} → {formatTime(os.route_end_time)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Add other views as needed, following the same pattern */}
          {view === 'drivers' && (
             <div className="space-y-8">
              <div className="flex items-center justify-between">
                <h2 className="text-3xl font-black tracking-tight text-zinc-900">Gestão de Equipe</h2>
                <Button icon={UserPlus} onClick={() => setShowCreateDriver(true)}>Novo Usuário</Button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {drivers.map(driver => (
                  <div key={driver.id} className="bg-white p-6 rounded-3xl border border-zinc-200 shadow-sm space-y-6">
                    <div className="flex items-center gap-4">
                      <div className={`w-14 h-14 ${driver.role === 'driver' ? 'bg-emerald-100 text-emerald-600' : 'bg-indigo-100 text-indigo-600'} rounded-2xl flex items-center justify-center text-xl font-black`}>
                        {driver.name.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-black text-zinc-900 truncate">{driver.name}</p>
                          <span className={`text-[8px] font-black px-1.5 py-0.5 rounded-md uppercase tracking-tighter ${driver.role === 'driver' ? 'bg-emerald-100 text-emerald-600' : 'bg-indigo-100 text-indigo-600'}`}>
                            {driver.role}
                          </span>
                        </div>
                        <p className="text-xs text-zinc-500 font-medium truncate">{driver.email}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4 py-4 border-y border-zinc-50">
                      <div>
                        <p className="text-[8px] font-black text-zinc-400 uppercase tracking-widest">CPF</p>
                        <p className="text-xs font-bold text-zinc-700">{driver.cpf || '-'}</p>
                      </div>
                      <div>
                        <p className="text-[8px] font-black text-zinc-400 uppercase tracking-widest">Status</p>
                        <div className={`text-[8px] font-bold px-2 py-0.5 rounded-full inline-block ${driver.shift_status === 'ON_SHIFT' ? 'bg-emerald-100 text-emerald-700' : 'bg-zinc-100 text-zinc-500'}`}>
                          {driver.shift_status === 'ON_SHIFT' ? 'EM ROTA' : 'OFFLINE'}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${driver.is_active ? 'bg-emerald-500' : 'bg-red-500'}`} />
                        <span className="text-[10px] font-bold text-zinc-400 uppercase">{driver.is_active ? 'Ativo' : 'Inativo'}</span>
                      </div>
                      {user.role === 'admin' && driver.id !== user.id && (
                        <button 
                          onClick={() => toggleUserStatus(driver.id, !!driver.is_active)}
                          className={`text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg transition-colors ${driver.is_active ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'}`}
                        >
                          {driver.is_active ? 'Desativar' : 'Ativar'}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Modals - Reusing from original but with better styling */}
      <AnimatePresence>
        {showCreateDriver && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-6">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="bg-white w-full max-w-xl rounded-[2.5rem] shadow-2xl overflow-hidden">
              <div className="p-8 border-b border-zinc-100 flex justify-between items-center">
                <h3 className="text-2xl font-black">Novo Usuário</h3>
                <button onClick={() => setShowCreateDriver(false)} className="text-zinc-400 hover:text-zinc-600"><XCircle size={28} /></button>
              </div>
              <div className="p-8 space-y-6">
                <Input label="Nome Completo" value={newDriver.name} onChange={(v: string) => setNewDriver({...newDriver, name: v})} placeholder="João Silva" />
                <div className="grid grid-cols-2 gap-6">
                  <Input label="E-mail" value={newDriver.email} onChange={(v: string) => setNewDriver({...newDriver, email: v})} placeholder="joao@email.com" />
                  <Input label="Senha" type="password" value={newDriver.password} onChange={(v: string) => setNewDriver({...newDriver, password: v})} placeholder="******" />
                </div>
                <Input label="CPF" value={newDriver.cpf} onChange={(v: string) => setNewDriver({...newDriver, cpf: v})} placeholder="000.000.000-00" />
              </div>
              <div className="p-8 bg-zinc-50 flex gap-4">
                <Button variant="outline" className="flex-1" onClick={() => setShowCreateDriver(false)}>Cancelar</Button>
                <Button className="flex-1" onClick={handleCreateDriver}>Cadastrar Usuário</Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {(showCreateOS || editingOSId) && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-6">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="bg-white w-full max-w-xl rounded-[2.5rem] shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
              <div className="p-8 border-b border-zinc-100 flex justify-between items-center">
                <h3 className="text-2xl font-black">{editingOSId ? 'Editar Ordem de Serviço' : 'Nova Ordem de Serviço'}</h3>
                <button onClick={closeOSModal} className="text-zinc-400 hover:text-zinc-600"><XCircle size={28} /></button>
              </div>
              <div className="p-8 space-y-6 overflow-y-auto">
                <OSFormFields form={osForm} setForm={setOsForm} drivers={drivers} />
              </div>
              <div className="p-8 bg-zinc-50 flex gap-4">
                <Button variant="outline" className="flex-1" onClick={closeOSModal}>Cancelar</Button>
                <Button className="flex-1" onClick={editingOSId ? handleUpdateOS : handleCreateOS}>
                  {editingOSId ? 'Salvar Alterações' : 'Criar e Atribuir'}
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Mobile Nav */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-zinc-200 flex justify-around p-4 z-20 shadow-lg">
        {[
          { id: 'dashboard', icon: LayoutDashboard, label: 'Painel' },
          { id: 'orders', icon: List, label: 'Ordens' },
          { id: 'history', icon: History, label: 'Histórico' },
          { id: 'drivers', icon: Users, label: 'Equipe' }
        ].map(item => (
          <button key={item.id} onClick={() => setView(item.id as any)} className={`flex flex-col items-center gap-1 transition-all ${view === item.id ? 'text-emerald-600 scale-110' : 'text-zinc-400'}`}>
            <item.icon size={24} strokeWidth={view === item.id ? 2.5 : 2} />
            <span className="text-[10px] font-black uppercase tracking-widest">{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
};
