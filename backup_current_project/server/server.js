const express = require("express");
const path = require("path");

const app = express();
app.use(express.json());

// Serve frontend
app.use(express.static(path.join(__dirname, "../client")));

// ================== DATA ==================

// All orders
let orders = [];

// Table configuration (dummy data)
let tables = [
  { number: 1, capacity: 2, occupied: false, current: null },
  { number: 2, capacity: 5, occupied: false, current: null },
  { number: 3, capacity: 10, occupied: false, current: null },
  { number: 4, capacity: 20, occupied: false, current: null }
];

// Waiting queue
let tableQueue = [];

// ================== HELPERS ==================

// Allocate smallest possible table
function allocateTable(people, name) {
  const table = tables
    .filter(t => !t.occupied && t.capacity >= people)
    .sort((a, b) => a.capacity - b.capacity)[0];

  if (!table) return null;

  table.occupied = true;
  table.current = {
    name,
    people,
    since: Date.now()
  };

  return table;
}

// ================== ROUTES ==================

// PLACE ORDER
app.post("/order", (req, res) => {
  const { name, items, people } = req.body;

  // Safety checks
  if (!name || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "Invalid order" });
  }

  // Prevent duplicate active order for same customer
  const existingOrder = orders.find(
    o => o.name === name && o.status !== "Completed"
  );

  if (existingOrder) {
    return res.json({
      success: true,
      tableNumber: existingOrder.tableNumber,
      status: existingOrder.status
    });
  }

  let table = null;
  let status = "Preparing";

  // Dine-in logic
  if (people && people > 0) {
    table = allocateTable(people, name);

    // No table available → waiting queue
    if (!table) {
      status = "Waiting for Table";
      tableQueue.push({
        name,
        items,
        people,
        createdAt: Date.now()
      });
    }
  }

  const order = {
    id: Date.now(),
    name,
    items,
    people: people || 0,
    tableNumber: table ? table.number : null,
    status,
    createdAt: Date.now()
  };

  orders.push(order);

  res.json({
    success: true,
    tableNumber: order.tableNumber,
    status: order.status
  });
});

// KITCHEN VIEW (only orders that should be cooked)
app.get("/orders", (req, res) => {
  const kitchenOrders = orders.filter(o => o.status === "Preparing");
  res.json(kitchenOrders);
});

// MANAGER VIEW
app.get("/manager-data", (req, res) => {
  res.json({
    tables,
    queue: tableQueue
  });
});

// FREE TABLE (manager action)
app.post("/free-table", (req, res) => {
  const { tableNumber } = req.body;

  const table = tables.find(t => t.number === tableNumber);
  if (!table) {
    return res.status(404).json({ error: "Table not found" });
  }

  // Free current table
  table.occupied = false;
  table.current = null;

  // Assign next from queue
  const next = tableQueue.shift();
  if (next && table.capacity >= next.people) {
    table.occupied = true;
    table.current = {
      name: next.name,
      people: next.people,
      since: Date.now()
    };

    // Update existing waiting order
    const order = orders.find(
      o => o.name === next.name && o.status === "Waiting for Table"
    );

    if (order) {
      order.status = "Preparing";
      order.tableNumber = table.number;
    }
  }

  res.json({ success: true });
});

// ================== START SERVER ==================

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log("Server running on port", PORT);
});

