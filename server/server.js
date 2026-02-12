const express = require("express");
const path = require("path");
const fs = require("fs");

const app = express();
app.use(express.json());

// Serve frontend static files
app.use(express.static(path.join(__dirname, "../client")));

// ================== DATA STORE ==================
let orders = [];
let completedOrders = [];

// Load menu from JSON
const menuData = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../client/menu.json"), "utf-8")
);

const tables = menuData.tables.map(t => ({
  number: t.number,
  capacity: t.capacity,
  occupied: false,
  current: null
}));

let tableQueue = [];
let orderCounter = 1;

// ================== HELPERS ==================

function generateOrderId() {
  const date = new Date();
  const prefix = "RLT";
  const num = String(orderCounter++).padStart(4, "0");
  return `${prefix}-${num}`;
}

function allocateTable(people, name, orderId) {
  const table = tables
    .filter(t => !t.occupied && t.capacity >= people)
    .sort((a, b) => a.capacity - b.capacity)[0];

  if (!table) return null;

  table.occupied = true;
  table.current = {
    name,
    people,
    since: Date.now(),
    orderId
  };
  return table;
}

function freeTableAndReassign(tableNumber) {
  const table = tables.find(t => t.number === tableNumber);
  if (!table || !table.current) return false;

  // Mark the linked order as completed
  const order = orders.find(o => o.id === table.current.orderId);
  if (order) {
    order.status = "Completed";
    order.completedAt = Date.now();
    completedOrders.push({ ...order });
    orders = orders.filter(o => o.id !== order.id);
  }

  table.occupied = false;
  table.current = null;

  // Check queue and assign table to next waiting customer
  const nextInQueue = tableQueue.find(q => q.people <= table.capacity);
  if (nextInQueue) {
    const idx = tableQueue.indexOf(nextInQueue);
    tableQueue.splice(idx, 1);

    table.occupied = true;
    table.current = {
      name: nextInQueue.name,
      people: nextInQueue.people,
      since: Date.now(),
      orderId: nextInQueue.orderId
    };

    const nextOrder = orders.find(o => o.id === nextInQueue.orderId);
    if (nextOrder) {
      nextOrder.tableNumber = table.number;
      nextOrder.status = "Preparing";
    }
  }

  return true;
}

// ================== API ROUTES ==================

// -- Serve menu data --
app.get("/api/menu", (req, res) => {
  res.json(menuData);
});

// -- Place a new order --
app.post("/api/order", (req, res) => {
  const { name, items, people, note, paymentMethod, discount, taxRate } = req.body;

  if (!name || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "Customer name and at least one item required." });
  }

  // Calculate totals
  const subtotal = items.reduce((sum, i) => sum + i.price * i.qty, 0);
  const discountAmt = Number(discount) || 0;
  const tax = Number(taxRate) || 5;
  const taxable = subtotal - discountAmt;
  const taxAmt = taxable * (tax / 100);
  const totalAmount = taxable + taxAmt;

  const orderId = generateOrderId();
  let table = null;
  let status = "Preparing";

  if (people && people > 0) {
    table = allocateTable(people, name, orderId);
    if (!table) {
      status = "Waiting for Table";
      tableQueue.push({
        orderId,
        name,
        items,
        people,
        note,
        totalAmount,
        createdAt: Date.now()
      });
    }
  }

  const order = {
    id: orderId,
    name,
    items,
    note: note || "",
    people: people || 0,
    paymentMethod: paymentMethod || "Cash",
    subtotal,
    discount: discountAmt,
    taxRate: tax,
    taxAmount: taxAmt,
    totalAmount: Math.round(totalAmount * 100) / 100,
    tableNumber: table ? table.number : null,
    status,
    createdAt: Date.now()
  };

  orders.push(order);

  res.json({
    success: true,
    orderId: order.id,
    tableNumber: order.tableNumber,
    status: order.status,
    totalAmount: order.totalAmount
  });
});

// -- Kitchen: Get active orders (Preparing) --
app.get("/api/orders", (req, res) => {
  const active = orders.filter(o => o.status === "Preparing");
  res.json(active);
});

// -- Kitchen: Mark order as ready for serving --
app.post("/api/order-ready", (req, res) => {
  const { orderId } = req.body;
  const order = orders.find(o => o.id === orderId);
  if (!order) return res.status(404).json({ error: "Order not found" });

  order.status = "Ready";
  res.json({ success: true });
});

// -- Manager: Get full dashboard data --
app.get("/api/manager-data", (req, res) => {
  const enrichedTables = tables.map(t => {
    if (t.occupied && t.current) {
      const currentOrder = orders.find(o => o.id === t.current.orderId);
      return {
        ...t,
        orderDetails: currentOrder || null
      };
    }
    return { ...t, orderDetails: null };
  });

  res.json({
    tables: enrichedTables,
    queue: tableQueue,
    activeOrders: orders.filter(o => o.status !== "Completed"),
    completedToday: completedOrders.length,
    totalRevenue: completedOrders.reduce((s, o) => s + o.totalAmount, 0)
  });
});

// -- Manager: Free table / checkout --
app.post("/api/free-table", (req, res) => {
  const { tableNumber } = req.body;
  const success = freeTableAndReassign(tableNumber);
  res.json({ success });
});

// -- Manager: Get bill details for printing --
app.get("/api/bill/:orderId", (req, res) => {
  const order = orders.find(o => o.id === req.params.orderId);
  if (!order) {
    const completed = completedOrders.find(o => o.id === req.params.orderId);
    if (completed) return res.json({ ...completed, restaurant: menuData.restaurant });
    return res.status(404).json({ error: "Order not found" });
  }
  res.json({ ...order, restaurant: menuData.restaurant });
});

// -- Manager: Update order (add discount, change payment) --
app.post("/api/update-order", (req, res) => {
  const { orderId, discount, paymentMethod } = req.body;
  const order = orders.find(o => o.id === orderId);
  if (!order) return res.status(404).json({ error: "Order not found" });

  if (discount !== undefined) {
    order.discount = Number(discount);
    const taxable = order.subtotal - order.discount;
    order.taxAmount = taxable * (order.taxRate / 100);
    order.totalAmount = Math.round((taxable + order.taxAmount) * 100) / 100;
  }
  if (paymentMethod) order.paymentMethod = paymentMethod;

  res.json({ success: true, order });
});

// -- Kitchen: Get all orders including ready --
app.get("/api/kitchen-data", (req, res) => {
  const kitchen = orders.filter(o => o.status === "Preparing" || o.status === "Ready");
  res.json(kitchen);
});

// -- Stats endpoint --
app.get("/api/stats", (req, res) => {
  res.json({
    activeOrders: orders.filter(o => o.status === "Preparing").length,
    readyOrders: orders.filter(o => o.status === "Ready").length,
    waitingForTable: tableQueue.length,
    completedToday: completedOrders.length,
    totalRevenue: Math.round(completedOrders.reduce((s, o) => s + o.totalAmount, 0) * 100) / 100,
    occupiedTables: tables.filter(t => t.occupied).length,
    totalTables: tables.length
  });
});

// -- Fallback: serve index.html --
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../client/index.html"));
});
app.get("/kitchen", (req, res) => {
  res.sendFile(path.join(__dirname, "../client/orders.html"));
});
app.get("/manager", (req, res) => {
  res.sendFile(path.join(__dirname, "../client/manager.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Rialto Server running on port ${PORT}`);
  console.log(`Customer UI: http://localhost:${PORT}`);
  console.log(`Kitchen UI:  http://localhost:${PORT}/kitchen`);
  console.log(`Manager UI:  http://localhost:${PORT}/manager`);
});
