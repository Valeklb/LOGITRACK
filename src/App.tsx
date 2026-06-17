import React, { useState, useEffect, useRef } from 'react';
import { Routes, Route, useNavigate, useParams, useLocation, Navigate } from 'react-router-dom';
import { User } from './types';
import { motion, AnimatePresence } from 'motion/react';
import { Bell, X } from 'lucide-react';

// Components
import { Login } from './components/common/Login';
import { AdminDashboard } from './components/admin/AdminDashboard';
import { DriverHome, syncQueue } from './components/driver/DriverHome';
import { OSDetail } from './components/common/OSDetail';
import { CreateOS } from './components/common/CreateOS';
import { CameraCapture } from './components/common/CameraCapture';
import { ChecklistForm } from './components/common/ChecklistForm';
import { apiUrl, wsUrl } from './lib/api';

// --- Routing Wrappers ---

const ProtectedRoute = ({ user, children }: { user: User | null, children: React.ReactNode }) => {
  const location = useLocation();
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  return <>{children}</>;
};

const OSDetailWrapper = ({ user, onLogout }: { user: User, onLogout: () => void }) => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  if (!id) return <Navigate to="/" />;
  
  return (
    <div className={`h-screen bg-zinc-50 ${user.role === 'driver' ? 'max-w-md mx-auto shadow-2xl' : ''}`}>
      <OSDetail 
        osId={parseInt(id)} 
        user={user} 
        onBack={() => navigate(-1)} 
        onRegisterEvent={(type) => navigate(`/os/${id}/capture/${type}`)} 
        onLogout={onLogout}
      />
    </div>
  );
};

const CaptureWrapper = ({ user }: { user: User }) => {
  const { id, type } = useParams<{ id: string, type: string }>();
  const navigate = useNavigate();
  
  const handleCapture = async (data: any) => {
    const payload = { ...data, actor_id: user.id };
    
    if (!navigator.onLine) {
      syncQueue.add({ syncType: 'EVENT', osId: parseInt(id!), data: payload });
      alert('Registro salvo offline. Sincronização automática em breve.');
      navigate(`/os/${id}`);
      return;
    }

    try {
      const res = await fetch(apiUrl(`/api/os/${id}/event`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) navigate(`/os/${id}`);
    } catch (err) {
      syncQueue.add({ syncType: 'EVENT', osId: parseInt(id!), data: payload });
      navigate(`/os/${id}`);
    }
  };

  if (!id || !type) return <Navigate to="/" />;

  return (
    <CameraCapture 
      type={type} 
      onCancel={() => navigate(`/os/${id}`)} 
      onCapture={handleCapture} 
    />
  );
};

const CreateOSWrapper = ({ user }: { user: User }) => {
  const navigate = useNavigate();
  return (
    <div className="max-w-md mx-auto h-screen bg-white shadow-2xl">
      <CreateOS user={user} onBack={() => navigate('/')} onCreated={() => navigate('/')} />
    </div>
  );
};

const DriverView = ({ user, onLogout, onUpdateUser }: { user: User, onLogout: () => void, onUpdateUser: (u: User) => void }) => {
  const navigate = useNavigate();
  const [showChecklist, setShowChecklist] = useState(false);

  if (showChecklist) {
    return (
      <div className="max-w-md mx-auto h-screen bg-white shadow-2xl">
        <ChecklistForm 
          type="VEHICLE" 
          driverId={user.id} 
          plate="FROTA-LOGI" 
          onComplete={() => setShowChecklist(false)} 
        />
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto h-screen bg-zinc-50 shadow-2xl relative overflow-hidden flex flex-col">
      <DriverHome 
        user={user} 
        onSelectOS={(id) => navigate(`/os/${id}`)} 
        onCreateOS={() => navigate('/create')} 
        onLogout={onLogout}
        onUpdateUser={onUpdateUser}
        onShowChecklist={() => setShowChecklist(true)}
      />
    </div>
  );
};

// --- Main App Controller ---

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [notification, setNotification] = useState<{ title: string, message: string } | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem('logitrack_user');
    if (saved) setUser(JSON.parse(saved));
  }, []);

  // WebSocket Connection for Notifications
  useEffect(() => {
    if (user && user.role === 'driver') {
      const wsUrlAddress = wsUrl(user.id);
      
      const connect = () => {
        const ws = new WebSocket(wsUrlAddress);
        wsRef.current = ws;

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'NEW_OS') {
              setNotification({ title: data.title, message: data.message });
              // Auto hide after 5 seconds
              setTimeout(() => setNotification(null), 5000);
            }
          } catch (e) {
            console.error('Error parsing WS message', e);
          }
        };

        ws.onclose = () => {
          console.log('WS connection closed, retrying in 3s...');
          setTimeout(connect, 3000);
        };
      };

      connect();

      return () => {
        if (wsRef.current) {
          wsRef.current.close();
        }
      };
    }
  }, [user]);

  const handleLogin = (u: User) => {
    setUser(u);
    localStorage.setItem('logitrack_user', JSON.stringify(u));
    const from = (location.state as any)?.from?.pathname || "/";
    navigate(from, { replace: true });
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('logitrack_user');
    navigate('/login');
  };

  useEffect(() => {
    const interval = setInterval(() => syncQueue.process(), 15000);
    window.addEventListener('online', () => syncQueue.process());
    return () => {
      clearInterval(interval);
      window.removeEventListener('online', () => syncQueue.process());
    };
  }, []);

  return (
    <div className="relative min-h-screen bg-zinc-100">
      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ opacity: 0, y: -50, x: '-50%' }}
            animate={{ opacity: 1, y: 20, x: '-50%' }}
            exit={{ opacity: 0, y: -50, x: '-50%' }}
            className="fixed top-0 left-1/2 z-[9999] w-full max-w-sm px-4"
          >
            <div className="bg-white border-l-4 border-indigo-600 shadow-2xl rounded-lg p-4 flex items-start gap-4">
              <div className="p-2 bg-indigo-50 rounded-full">
                <Bell className="w-5 h-5 text-indigo-600" />
              </div>
              <div className="flex-1">
                <h4 className="font-bold text-zinc-900">{notification.title}</h4>
                <p className="text-sm text-zinc-600">{notification.message}</p>
              </div>
              <button 
                onClick={() => setNotification(null)}
                className="p-1 hover:bg-zinc-100 rounded-full transition-colors"
              >
                <X className="w-4 h-4 text-zinc-400" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <Routes>
        <Route path="/login" element={<Login onLogin={handleLogin} />} />
        <Route path="/" element={
          <ProtectedRoute user={user}>
            {user?.role === 'admin' || user?.role === 'gestor' ? 
              <AdminDashboard user={user!} onLogout={handleLogout} /> : 
              <DriverView user={user!} onLogout={handleLogout} onUpdateUser={handleLogin} />
            }
          </ProtectedRoute>
        } />
        <Route path="/os/:id" element={
          <ProtectedRoute user={user}>
            <OSDetailWrapper user={user!} onLogout={handleLogout} />
          </ProtectedRoute>
        } />
        <Route path="/os/:id/capture/:type" element={
          <ProtectedRoute user={user}>
            <CaptureWrapper user={user!} />
          </ProtectedRoute>
        } />
        <Route path="/create" element={
          <ProtectedRoute user={user}>
            <CreateOSWrapper user={user!} />
          </ProtectedRoute>
        } />
      </Routes>
    </div>
  );
}
