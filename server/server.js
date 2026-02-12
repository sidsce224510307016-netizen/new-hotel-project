const express = require("express");
const fetch = require("node-fetch");
const app = express();
app.use(express.json());
app.use(express.static("client"));

const GOOGLE_URL = "https://script.google.com/macros/s/AKfycbyJgUZ4wWnR4iBs8O_zcxYEABVcXkILU0MYiYyib7i3gTkf2K2qK5DGLrCJIvbUKHONhg/exec";
let orders = [];

// Helper for Google Sheets
async function sync(data) {
  try { await fetch(GOOGLE_URL, { method:'POST', body:JSON.stringify(data) }); } catch(e) { console.error(e); }
}

app.post("/order", async (req, res) => {
  const order = { ...req.body, status: "Preparing", time: new Date().toLocaleString() };
  orders.push(order);
  await sync(order);
  res.json({ success: true });
});

app.get("/orders", (req, res) => res.json(orders.filter(o => o.status === "Preparing")));
app.get("/manager-data", (req, res) => res.json({ orders: orders.filter(o => o.status !== "Completed") }));

app.post("/mark-prepared", (req, res) => {
  const order = orders.find(o => o.orderId === req.body.orderId);
  if (order) order.status = "Prepared";
  res.json({ success: true });
});

app.post("/finalize-bill", async (req, res) => {
  const order = orders.find(o => o.orderId === req.body.orderId);
  if (order) {
    order.status = "Completed";
    order.finalTotal = req.body.finalTotal;
    await sync(order);
  }
  res.json({ success: true });
});

app.listen(3000, () => console.log("Emerald Running on 3000"));