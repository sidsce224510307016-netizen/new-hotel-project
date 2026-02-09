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
    orderId: orderId // Link specific order to the table
  };
  return table;
}

// ================== ROUTES ==================

// PLACE ORDER
app.post("/order", (req, res) => {
  const { name, items, people, note, totalAmount } = req.body;

  if (!name || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "Invalid order" });
  }

  const orderId = Date.now();
  let table = null;
  let status = "Preparing";

  if (people && people > 0) {
    table = allocateTable(people, name, orderId);
    if (!table) {
      status = "Waiting for Table";
      tableQueue.push({ orderId, name, items, people, note, totalAmount, createdAt: Date.now() });
    }
  }

  const order = {
    id: orderId,
    name,
    items,
    note: note || "", 
    totalAmount: totalAmount || 0, 
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

// MANAGER VIEW - Optimized for the new Print Bill function
app.get("/manager-data", (req, res) => {
  const enrichedTables = tables.map(t => {
    if (t.occupied && t.current) {
      // Find the specific order linked to this table
      const currentOrder = orders.find(o => o.id === t.current.orderId);

      return { 
        ...t, 
        orderItems: currentOrder ? currentOrder.items : [],
        billTotal: currentOrder ? currentOrder.totalAmount : 0,
        customerNote: currentOrder ? currentOrder.note : ""
      };
    }
    return t;
  });

  res.json({ tables: enrichedTables, queue: tableQueue });
});

// FREE TABLE (Triggered by 'Checkout' on Manager Dashboard)
app.post("/free-table", (req, res) => {
  const { tableNumber } = req.body;
  const table = tables.find(t => t.number === tableNumber);
  
  if (table && table.current) {
    // Mark the specific order as completed
    const order = orders.find(o => o.id === table.current.orderId);
    if (order) order.status = "Completed";
    
    table.occupied = false;
    table.current = null;

    // Optional: Check queue and assign table to next person
    const nextInQueue = tableQueue.find(q => q.people <= table.capacity);
    if (nextInQueue) {
        const index = tableQueue.indexOf(nextInQueue);
        tableQueue.splice(index, 1);
        
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
  }
  res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => { console.log("Server running on port", PORT); });