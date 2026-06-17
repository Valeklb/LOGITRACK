import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { WebSocketServer, WebSocket } from "ws";

const dbPath = process.env.DATABASE_PATH || "logistic.db";
const db = new Database(dbPath);

// ... (rest of the database initialization remains same)

// Initialize Database
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE,
    password TEXT,
    name TEXT,
    cpf TEXT UNIQUE,
    role TEXT CHECK(role IN ('driver', 'admin', 'gestor')),
    is_active INTEGER DEFAULT 1,
    shift_status TEXT DEFAULT 'OFF_SHIFT'
  );

  CREATE TABLE IF NOT EXISTS routes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    start_lat REAL,
    start_lng REAL,
    assigned_driver_id INTEGER,
    status TEXT DEFAULT 'AVAILABLE',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(assigned_driver_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS service_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    os_number TEXT UNIQUE,
    driver_id INTEGER,
    motorista_original_id INTEGER,
    plate TEXT,
    origin TEXT,
    destination TEXT,
    status TEXT DEFAULT 'ABERTA',
    admin_note TEXT,
    last_reassigned_at DATETIME,
    reassignment_count INTEGER DEFAULT 0,
    has_pickup INTEGER DEFAULT 0,
    has_delivery INTEGER DEFAULT 0,
    distance_km REAL,
    haulage_cost REAL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(driver_id) REFERENCES users(id),
    FOREIGN KEY(motorista_original_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS os_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    os_id INTEGER,
    type TEXT CHECK(type IN ('COLETA', 'ENTREGA')),
    photo_data TEXT,
    lat REAL,
    lng REAL,
    accuracy REAL,
    battery_level REAL,
    network_type TEXT,
    device_id TEXT,
    local_time DATETIME,
    server_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    observation TEXT,
    FOREIGN KEY(os_id) REFERENCES service_orders(id)
  );

  CREATE TABLE IF NOT EXISTS checklists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    driver_id INTEGER,
    vehicle_plate TEXT,
    type TEXT CHECK(type IN ('VEHICLE', 'CONTAINER')),
    os_id INTEGER,
    items JSON,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(driver_id) REFERENCES users(id),
    FOREIGN KEY(os_id) REFERENCES service_orders(id)
  );

  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    os_id INTEGER,
    actor_id INTEGER,
    actor_role TEXT,
    action TEXT,
    details TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(os_id) REFERENCES service_orders(id),
    FOREIGN KEY(actor_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS reassignment_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    os_id INTEGER,
    requested_by_user_id INTEGER,
    requested_by_role TEXT,
    current_driver_id INTEGER,
    new_driver_id INTEGER,
    reason TEXT,
    status TEXT DEFAULT 'PENDENTE',
    manager_user_id INTEGER,
    decision_note TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    decided_at DATETIME,
    FOREIGN KEY(os_id) REFERENCES service_orders(id),
    FOREIGN KEY(requested_by_user_id) REFERENCES users(id),
    FOREIGN KEY(current_driver_id) REFERENCES users(id),
    FOREIGN KEY(new_driver_id) REFERENCES users(id),
    FOREIGN KEY(manager_user_id) REFERENCES users(id)
  );
`);

// Migration for existing tables
try { db.prepare("ALTER TABLE service_orders ADD COLUMN motorista_original_id INTEGER").run(); } catch(e) {}
try { db.prepare("ALTER TABLE service_orders ADD COLUMN last_reassigned_at DATETIME").run(); } catch(e) {}
try { db.prepare("ALTER TABLE service_orders ADD COLUMN reassignment_count INTEGER DEFAULT 0").run(); } catch(e) {}
try { db.prepare("ALTER TABLE service_orders ADD COLUMN has_pickup INTEGER DEFAULT 0").run(); } catch(e) {}
try { db.prepare("ALTER TABLE service_orders ADD COLUMN has_delivery INTEGER DEFAULT 0").run(); } catch(e) {}
try { db.prepare("ALTER TABLE service_orders ADD COLUMN distance_km REAL").run(); } catch(e) {}
try { db.prepare("ALTER TABLE service_orders ADD COLUMN haulage_cost REAL").run(); } catch(e) {}
try { db.prepare("ALTER TABLE audit_log ADD COLUMN actor_role TEXT").run(); } catch(e) {}
try { db.prepare("ALTER TABLE users ADD COLUMN cpf TEXT").run(); } catch(e) {}
try { db.prepare("ALTER TABLE users ADD COLUMN is_active INTEGER DEFAULT 1").run(); } catch(e) {}
try { db.prepare("ALTER TABLE users ADD COLUMN shift_status TEXT DEFAULT 'OFF_SHIFT'").run(); } catch(e) {}

// Checklists table migration (if not created by initial script)
db.exec(`
  CREATE TABLE IF NOT EXISTS checklists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    driver_id INTEGER,
    vehicle_plate TEXT,
    type TEXT CHECK(type IN ('VEHICLE', 'CONTAINER')),
    os_id INTEGER,
    items JSON,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(driver_id) REFERENCES users(id),
    FOREIGN KEY(os_id) REFERENCES service_orders(id)
  );
`);

// Contas iniciais (sem OS, rotas ou outros dados mockados)
const seedUsers = [
  { email: "admin@logitrack.com", password: "admin123", name: "Administrador", cpf: "000.000.000-00", role: "admin" },
  { email: "gestor@logitrack.com", password: "gestor123", name: "Gestor", cpf: "999.999.999-99", role: "gestor" },
  { email: "motorista@logitrack.com", password: "123456", name: "Motorista", cpf: "111.111.111-11", role: "driver" },
];

for (const user of seedUsers) {
  db.prepare("INSERT OR IGNORE INTO users (email, password, name, cpf, role) VALUES (?, ?, ?, ?, ?)").run(
    user.email, user.password, user.name, user.cpf, user.role
  );
}

async function startServer() {
  const app = express();

  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    }
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });

  app.use(express.json({ limit: '50mb' }));

  // Auth API
  app.post("/api/login", (req, res) => {
    const { email, password } = req.body;
    const user = db.prepare("SELECT id, email, name, role, is_active, shift_status FROM users WHERE email = ? AND password = ?").get(email, password) as any;
    if (user) {
      if (!user.is_active) return res.status(403).json({ error: "Usuário desativado" });
      
      // Get assigned route if any
      const assignedRoute = db.prepare("SELECT * FROM routes WHERE assigned_driver_id = ? AND status = 'ASSIGNED'").get(user.id);
      res.json({ ...user, assignedRoute });
    } else {
      res.status(401).json({ error: "Credenciais inválidas" });
    }
  });

  // Checklists API
  app.get("/api/checklists", (req, res) => {
    const { driverId, osId, type } = req.query;
    let query = "SELECT c.*, u.name as driver_name FROM checklists c JOIN users u ON c.driver_id = u.id";
    const params: any[] = [];
    
    if (driverId) {
      query += " WHERE c.driver_id = ?";
      params.push(driverId);
    } else if (osId) {
      query += " WHERE c.os_id = ?";
      params.push(osId);
    }
    
    if (type) {
      query += (params.length > 0 ? " AND" : " WHERE") + " c.type = ?";
      params.push(type);
    }

    query += " ORDER BY c.created_at DESC";
    const checklists = db.prepare(query).all(...params);
    res.json(checklists);
  });

  app.post("/api/checklists", (req, res) => {
    const { driver_id, vehicle_plate, type, os_id, items } = req.body;
    db.prepare("INSERT INTO checklists (driver_id, vehicle_plate, type, os_id, items) VALUES (?, ?, ?, ?, ?)").run(
      driver_id, vehicle_plate, type, os_id, JSON.stringify(items)
    );
    res.json({ success: true });
  });

  // OS API
  app.get("/api/os", (req, res) => {
    const { driverId, role, status } = req.query;
    let query = "SELECT so.*, u.name as driver_name FROM service_orders so LEFT JOIN users u ON so.driver_id = u.id";
    const params: any[] = [];

    if (role === 'driver') {
      query += " WHERE so.driver_id = ?";
      params.push(driverId);
    } else if (status) {
      query += " WHERE so.status = ?";
      params.push(status);
    }

    query += " ORDER BY so.created_at DESC";
    const orders = db.prepare(query).all(...params);
    res.json(orders);
  });

  app.get("/api/os/:id", (req, res) => {
    const os = db.prepare("SELECT so.*, u.name as driver_name FROM service_orders so LEFT JOIN users u ON so.driver_id = u.id WHERE so.id = ?").get(req.params.id) as any;
    if (!os) return res.status(404).json({ error: "OS não encontrada" });
    
    const events = db.prepare("SELECT * FROM os_events WHERE os_id = ?").all(req.params.id);
    const audit = db.prepare("SELECT al.*, u.name as actor_name FROM audit_log al JOIN users u ON al.actor_id = u.id WHERE al.os_id = ? ORDER BY al.created_at DESC").all(req.params.id);
    const pending_request = db.prepare(`
      SELECT rr.*, u.name as requested_by_name, nd.name as new_driver_name, cd.name as current_driver_name
      FROM reassignment_requests rr
      JOIN users u ON rr.requested_by_user_id = u.id
      JOIN users nd ON rr.new_driver_id = nd.id
      JOIN users cd ON rr.current_driver_id = cd.id
      WHERE rr.os_id = ? AND rr.status = 'PENDENTE'
    `).get(req.params.id);
    
    res.json({ ...os, events, audit, pending_request });
  });

  app.post("/api/os", (req, res) => {
    const { os_number, driver_id, plate, origin, destination, actor_id } = req.body;
    const actor = db.prepare("SELECT role FROM users WHERE id = ?").get(actor_id) as any;
    
    if (!actor) {
      return res.status(403).json({ error: "Usuário não encontrado" });
    }

    // Allow drivers to create their own OS, or admin/gestor to create any
    if (actor.role === 'driver' && actor.id !== parseInt(driver_id)) {
      return res.status(403).json({ error: "Motoristas só podem criar suas próprias OS" });
    }

    try {
      db.transaction(() => {
        const result = db.prepare("INSERT INTO service_orders (os_number, driver_id, motorista_original_id, plate, origin, destination) VALUES (?, ?, ?, ?, ?, ?)").run(
          os_number, driver_id, driver_id, plate, origin, destination
        );
        db.prepare("INSERT INTO audit_log (os_id, actor_id, actor_role, action, details) VALUES (?, ?, ?, ?, ?)").run(
          result.lastInsertRowid, actor_id, actor.role, "OS_CREATED", JSON.stringify({ os_number, driver_id, plate })
        );

        // Notify driver
        notifyDriver(parseInt(driver_id), {
          type: "NEW_OS",
          title: "Nova OS Atribuída",
          message: `Você recebeu uma nova OS: ${os_number}`,
          os_number
        });
      })();
      res.json({ success: true });
    } catch (e: any) {
      res.status(400).json({ error: "Número de OS já existe ou dados inválidos" });
    }
  });

  app.patch("/api/os/:id", (req, res) => {
    const { status, admin_note, actor_id } = req.body;
    const osId = req.params.id;
    const actor = db.prepare("SELECT role FROM users WHERE id = ?").get(actor_id) as any;

    if (!actor || (actor.role !== 'admin' && actor.role !== 'gestor')) {
      return res.status(403).json({ error: "Sem permissão para atualizar OS" });
    }

    if (status === 'CANCELADA' && actor.role !== 'gestor') {
      return res.status(403).json({ error: "Apenas Gestores podem cancelar OS" });
    }
    
    db.transaction(() => {
      if (status) db.prepare("UPDATE service_orders SET status = ? WHERE id = ?").run(status, osId);
      if (admin_note) db.prepare("UPDATE service_orders SET admin_note = ? WHERE id = ?").run(admin_note, osId);
      
      db.prepare("INSERT INTO audit_log (os_id, actor_id, actor_role, action, details) VALUES (?, ?, ?, ?, ?)").run(
        osId, actor_id, actor.role, "UPDATE_OS", JSON.stringify({ status, admin_note })
      );
    })();
    res.json({ success: true });
  });

  app.post("/api/os/:id/reassign", (req, res) => {
    const { new_driver_id, reason, actor_id } = req.body;
    const osId = req.params.id;
    const actor = db.prepare("SELECT role FROM users WHERE id = ?").get(actor_id) as any;
    const os = db.prepare("SELECT status, driver_id FROM service_orders WHERE id = ?").get(osId) as any;

    if (!actor || (actor.role !== 'admin' && actor.role !== 'gestor')) {
      return res.status(403).json({ error: "Sem permissão para solicitar realocação" });
    }

    if (os.status === 'FECHADA' || os.status === 'CANCELADA') {
      return res.status(400).json({ error: "Não é possível realocar OS finalizada ou cancelada" });
    }

    const pending = db.prepare("SELECT id FROM reassignment_requests WHERE os_id = ? AND status = 'PENDENTE'").get(osId);
    if (pending) {
      return res.status(400).json({ error: "Já existe uma solicitação pendente para esta OS" });
    }

    db.transaction(() => {
      db.prepare(`
        INSERT INTO reassignment_requests (os_id, requested_by_user_id, requested_by_role, current_driver_id, new_driver_id, reason)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(osId, actor_id, actor.role, os.driver_id, new_driver_id, reason);

      db.prepare("INSERT INTO audit_log (os_id, actor_id, actor_role, action, details) VALUES (?, ?, ?, ?, ?)").run(
        osId, actor_id, actor.role, "REALLOCATION_REQUESTED", JSON.stringify({ from: os.driver_id, to: new_driver_id, reason })
      );
    })();

    res.json({ success: true });
  });

  app.post("/api/reassign/:id/decide", (req, res) => {
    const { status, decision_note, actor_id } = req.body; // status: APROVADO or REPROVADO
    const requestId = req.params.id;
    const actor = db.prepare("SELECT role FROM users WHERE id = ?").get(actor_id) as any;
    const request = db.prepare("SELECT * FROM reassignment_requests WHERE id = ?").get(requestId) as any;

    if (!actor || actor.role !== 'gestor') {
      return res.status(403).json({ error: "Apenas Gestores podem decidir sobre realocações" });
    }

    if (request.status !== 'PENDENTE') {
      return res.status(400).json({ error: "Esta solicitação já foi processada" });
    }

    db.transaction(() => {
      db.prepare(`
        UPDATE reassignment_requests 
        SET status = ?, manager_user_id = ?, decision_note = ?, decided_at = CURRENT_TIMESTAMP 
        WHERE id = ?
      `).run(status, actor_id, decision_note, requestId);

      if (status === 'APROVADO') {
        db.prepare(`
          UPDATE service_orders 
          SET driver_id = ?, last_reassigned_at = CURRENT_TIMESTAMP, reassignment_count = reassignment_count + 1 
          WHERE id = ?
        `).run(request.new_driver_id, request.os_id);

        // Notify new driver
        const os = db.prepare("SELECT os_number FROM service_orders WHERE id = ?").get(request.os_id) as any;
        notifyDriver(request.new_driver_id, {
          type: "NEW_OS",
          title: "OS Realocada",
          message: `Uma nova OS foi realocada para você: ${os.os_number}`,
          os_number: os.os_number
        });
      }

      db.prepare("INSERT INTO audit_log (os_id, actor_id, actor_role, action, details) VALUES (?, ?, ?, ?, ?)").run(
        request.os_id, actor_id, actor.role, status === 'APROVADO' ? "REALLOCATION_APPROVED" : "REALLOCATION_REJECTED", 
        JSON.stringify({ request_id: requestId, note: decision_note })
      );
    })();

    res.json({ success: true });
  });

  app.get("/api/reassign/pending", (req, res) => {
    const requests = db.prepare(`
      SELECT rr.*, u.name as requested_by_name, nd.name as new_driver_name, cd.name as current_driver_name, so.os_number
      FROM reassignment_requests rr
      JOIN users u ON rr.requested_by_user_id = u.id
      JOIN users nd ON rr.new_driver_id = nd.id
      JOIN users cd ON rr.current_driver_id = cd.id
      JOIN service_orders so ON rr.os_id = so.id
      WHERE rr.status = 'PENDENTE'
      ORDER BY rr.created_at DESC
    `).all();
    res.json(requests);
  });

  app.post("/api/os/:id/event", (req, res) => {
    const { type, photo_data, lat, lng, accuracy, battery_level, network_type, device_id, local_time, observation, actor_id, plate } = req.body;
    const osId = req.params.id;
    const actor = db.prepare("SELECT role FROM users WHERE id = ?").get(actor_id) as any;

    db.transaction(() => {
      db.prepare(`
        INSERT INTO os_events (os_id, type, photo_data, lat, lng, accuracy, battery_level, network_type, device_id, local_time, observation)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(osId, type, photo_data, lat, lng, accuracy, battery_level, network_type, device_id, local_time, observation);

      const newStatus = type === 'COLETA' ? 'EM_ROTA' : 'FECHADA';
      const updateQuery = type === 'COLETA' 
        ? "UPDATE service_orders SET status = ?, has_pickup = 1 WHERE id = ?" 
        : "UPDATE service_orders SET status = ?, has_delivery = 1 WHERE id = ?";
      
      db.prepare(updateQuery).run(newStatus, osId);

      // If driver is presenting a new trailer plate during COLETA, update the OS plate
      if (type === 'COLETA' && plate) {
        db.prepare("UPDATE service_orders SET plate = ? WHERE id = ?").run(plate, osId);
      }

      // Calculate distance if it's a delivery
      if (type === 'ENTREGA') {
        const pickupEvent = db.prepare("SELECT lat, lng FROM os_events WHERE os_id = ? AND type = 'COLETA'").get(osId) as any;
        if (pickupEvent) {
          const distance = calculateDistance(pickupEvent.lat, pickupEvent.lng, lat, lng);
          const cost = calculateHaulageCost(distance);
          db.prepare("UPDATE service_orders SET distance_km = ?, haulage_cost = ? WHERE id = ?").run(distance, cost, osId);
        }
      }

      db.prepare("INSERT INTO audit_log (os_id, actor_id, actor_role, action, details) VALUES (?, ?, ?, ?, ?)").run(
        osId, actor_id || 0, actor?.role || 'driver', type === 'COLETA' ? "PICKUP_RECORDED" : "DELIVERY_RECORDED", 
        JSON.stringify({ lat, lng, accuracy })
      );
    })();

    res.json({ success: true });
  });

  function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  function calculateHaulageCost(distance: number): number {
    if (distance < 5) return 50.00;
    if (distance >= 10 && distance <= 15) return 120.00;
    if (distance > 30) return 350.00;
    
    // Default/Interpolated values for gaps
    if (distance >= 5 && distance < 10) return 80.00;
    if (distance > 15 && distance <= 30) return 200.00;
    
    return 0;
  }

  // Admin: User Management
  app.get("/api/users", (req, res) => {
    const users = db.prepare("SELECT id, name, email, cpf, role, is_active FROM users").all();
    res.json(users);
  });

  app.post("/api/users", (req, res) => {
    const { name, email, password, cpf, role } = req.body;
    try {
      db.prepare("INSERT INTO users (name, email, password, cpf, role) VALUES (?, ?, ?, ?, ?)").run(name, email, password, cpf, role);
      res.json({ success: true });
    } catch (e) {
      res.status(400).json({ error: "Email ou CPF já cadastrado" });
    }
  });

  app.patch("/api/users/:id", (req, res) => {
    const { is_active, shift_status } = req.body;
    if (is_active !== undefined) db.prepare("UPDATE users SET is_active = ? WHERE id = ?").run(is_active ? 1 : 0, req.params.id);
    if (shift_status !== undefined) db.prepare("UPDATE users SET shift_status = ? WHERE id = ?").run(shift_status, req.params.id);
    res.json({ success: true });
  });

  // Routes API
  app.get("/api/routes", (req, res) => {
    const routes = db.prepare("SELECT r.*, u.name as driver_name FROM routes r LEFT JOIN users u ON r.assigned_driver_id = u.id").all();
    res.json(routes);
  });

  app.post("/api/routes", (req, res) => {
    const { name, start_lat, start_lng } = req.body;
    db.prepare("INSERT INTO routes (name, start_lat, start_lng) VALUES (?, ?, ?)").run(name, start_lat, start_lng);
    res.json({ success: true });
  });

  app.post("/api/routes/assign-nearest", (req, res) => {
    const { driver_id, lat, lng } = req.body;
    
    // Check if driver already has a route
    const existing = db.prepare("SELECT id FROM routes WHERE assigned_driver_id = ? AND status = 'ASSIGNED'").get(driver_id);
    if (existing) {
      return res.status(400).json({ error: "Você já possui uma rota atribuída" });
    }

    // Find all available routes
    const availableRoutes = db.prepare("SELECT * FROM routes WHERE status = 'AVAILABLE'").all() as any[];
    
    if (availableRoutes.length === 0) {
      return res.status(404).json({ error: "Nenhuma rota disponível no momento" });
    }

    // Calculate nearest route using Haversine or simple Euclidean for small distances
    // For simplicity, we'll use Euclidean distance squared here
    let nearestRoute = availableRoutes[0];
    let minDistance = Math.pow(nearestRoute.start_lat - lat, 2) + Math.pow(nearestRoute.start_lng - lng, 2);

    for (let i = 1; i < availableRoutes.length; i++) {
      const dist = Math.pow(availableRoutes[i].start_lat - lat, 2) + Math.pow(availableRoutes[i].start_lng - lng, 2);
      if (dist < minDistance) {
        minDistance = dist;
        nearestRoute = availableRoutes[i];
      }
    }

    db.transaction(() => {
      db.prepare("UPDATE routes SET assigned_driver_id = ?, status = 'ASSIGNED' WHERE id = ?").run(driver_id, nearestRoute.id);
      db.prepare("UPDATE users SET shift_status = 'ON_SHIFT' WHERE id = ?").run(driver_id);
    })();

    res.json({ success: true, route: nearestRoute });
  });

  app.post("/api/routes/finish", (req, res) => {
    const { driver_id } = req.body;
    db.transaction(() => {
      db.prepare("UPDATE routes SET status = 'COMPLETED' WHERE assigned_driver_id = ? AND status = 'ASSIGNED'").run(driver_id);
      db.prepare("UPDATE users SET shift_status = 'OFF_SHIFT' WHERE id = ?").run(driver_id);
    })();
    res.json({ success: true });
  });

  // Dashboard Stats
  app.get("/api/stats", (req, res) => {
    const stats = db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'ABERTA' THEN 1 ELSE 0 END) as aberta,
        SUM(CASE WHEN status = 'EM_ROTA' THEN 1 ELSE 0 END) as em_rota,
        SUM(CASE WHEN status = 'FECHADA' THEN 1 ELSE 0 END) as fechada,
        SUM(CASE WHEN status = 'CANCELADA' THEN 1 ELSE 0 END) as cancelada,
        SUM(haulage_cost) as total_haulage_cost
      FROM service_orders
    `).get() as any;
    
    const pending = db.prepare("SELECT COUNT(*) as count FROM reassignment_requests WHERE status = 'PENDENTE'").get() as any;
    
    res.json({ ...stats, pending_approvals: pending.count });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
    app.get("*", (req, res) => res.sendFile(path.resolve("dist/index.html")));
  }

  const PORT = Number(process.env.PORT) || 3000;
  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  // WebSocket Setup
  const wss = new WebSocketServer({ server });
  const clients = new Map<number, WebSocket>();

  wss.on("connection", (ws, req) => {
    const url = new URL(req.url || "", `http://${req.headers.host}`);
    const userId = parseInt(url.searchParams.get("userId") || "0");

    if (userId) {
      clients.set(userId, ws);
      console.log(`User ${userId} connected via WebSocket`);
    }

    ws.on("close", () => {
      if (userId) {
        clients.delete(userId);
        console.log(`User ${userId} disconnected from WebSocket`);
      }
    });
  });

  // Helper to notify driver
  const notifyDriver = (driverId: number, data: any) => {
    const client = clients.get(driverId);
    if (client && client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  };
}

startServer();
