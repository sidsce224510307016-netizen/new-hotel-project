const express = require("express");
const path = require("path");

const app = express();
app.use(express.json());

// Serve frontend
app.use(express.static(path.join(__dirname, "../client")));

// ================== DATA ==================
let orders = [];
let tables = [
  { number: 1, capacity: 2, occupied: false, current: null },
  { number: 2, capacity: 5, occupied: false, current: null },
  { number: 3, capacity: 10, occupied: false, current: null },
  { number: 4, capacity: 20, occupied: false, current: null }
];
let tableQueue = [];

// ================== HELPERS ==================
function allocateTable(people, name) {
  const table = tables
    .filter(t => !t.occupied && t.capacity >= people)
    .sort((a, b) => a.capacity - b.capacity)[0];

  if (!table) return null;

  table.occupied = true;
  table.current = { name, people, since: Date.now() };
  return table;
}

// ================== ROUTES ==================

// PLACE ORDER
app.post("/order", (req, res) => {
  // FIX: Added 'note' and 'totalAmount' to capture data from index.html
  const { name, items, people, note, totalAmount } = req.body;

  if (!name || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "Invalid order" });
  }

  let table = null;
  let status = "Preparing";

  if (people && people > 0) {
    table = allocateTable(people, name);
    if (!table) {
      status = "Waiting for Table";
      tableQueue.push({ name, items, people, note, totalAmount, createdAt: Date.now() });
    }
  }

  const order = {
    id: Date.now(),
    name,
    items,
    note: note || "", // FIX: Save the note so kitchen view can see it
    totalAmount: totalAmount || 0, // FIX: Save for billing
    people: people || 0,
    tableNumber: table ? table.number : null,
    status,
    createdAt: Date.now()
  };

  orders.push(order);
  res.json({ success: true, tableNumber: order.tableNumber, status: order.status });
});

// KITCHEN VIEW
app.get("/orders", (req, res) => {
  res.json(orders.filter(o => o.status === "Preparing"));
});

// MANAGER VIEW
app.get("/manager-data", (req, res) => {
  // FIX: Attach order details to tables for the Manager Dashboard
  const enrichedTables = tables.map(t => {
    if (t.occupied && t.current) {
      const currentOrder = orders.find(o => o.name === t.current.name && o.status !== "Completed");
      return { 
        ...t, 
        orderItems: currentOrder ? currentOrder.items : [],
        billTotal: currentOrder ? currentOrder.totalAmount : 0 
      };
    }
    return t;
  });

  res.json({ tables: enrichedTables, queue: tableQueue });
});

// FREE TABLE
app.post("/free-table", (req, res) => {
  const { tableNumber } = req.body;
  const table = tables.find(t => t.number === tableNumber);
  
  if (table && table.current) {
    // Mark the associated order as completed
    const order = orders.find(o => o.name === table.current.name && o.status !== "Completed");
    if (order) order.status = "Completed";
    
    table.occupied = false;
    table.current = null;
  }
  res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => { console.log("Server running on port", PORT); });