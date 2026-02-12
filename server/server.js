const express = require("express");
const fetch = require("node-fetch"); 
const app = express();
app.use(express.json());

// YOUR DEPLOYED GOOGLE APPS SCRIPT URL
const GOOGLE_APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyJgUZ4wWnR4iBs8O_zcxYEABVcXkILU0MYiYyib7i3gTkf2K2qK5DGLrCJIvbUKHONhg/exec";

let orders = [];

/**
 * Sends order data to Google Sheets.
 * If the Order ID exists, the Google Script will update the row.
 * If the Order ID is new, it will create a new row.
 */
async function syncToSheets(order) {
    try {
        // Format items array into a readable string for the spreadsheet cell
        const itemSummary = order.items.map(i => `${i.qty}x ${i.name}`).join(", ");

        const payload = {
            orderId: order.orderId,
            name: order.name,
            items: itemNames, // Sent as a string for Google Sheets
            orderType: order.orderType || "N/A",
            totalAmount: order.totalAmount, // Base price
            discount: order.discount || "0",
            tax: order.tax || "0",
            finalTotal: order.finalTotal || order.totalAmount,
            status: order.status,
            date: order.timestamp
        };

        const response = await fetch(GOOGLE_APPS_SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const result = await response.json();
        console.log(`✅ Google Sheets Sync: ${order.orderId} - ${result.result}`);
    } catch (error) {
        console.error("❌ Google Sheets Sync Error:", error.message);
    }
}

// 1. PLACE ORDER (Customer)
app.post("/order", async (req, res) => {
    const order = { 
        ...req.body, 
        status: "Preparing", 
        timestamp: new Date().toLocaleString() 
    };
    orders.push(order);
    
    // Log the initial "Preparing" order to Google Sheets
    await syncToSheets(order);
    
    res.json({ success: true, orderId: order.orderId });
});

// 2. KITCHEN VIEW (Fetch only active orders)
app.get("/orders", (req, res) => {
    res.json(orders.filter(o => o.status === "Preparing"));
});

// 3. MANAGER VIEW (Fetch all non-completed orders)
app.get("/manager-data", (req, res) => {
    res.json({ orders: orders.filter(o => o.status !== "Completed") });
});

// 4. MARK PREPARED (Kitchen updates status)
app.post("/mark-prepared", (req, res) => {
    const order = orders.find(o => o.orderId === req.body.orderId);
    if (order) {
        order.status = "Prepared";
        // Optional: syncToSheets(order); // Uncomment if you want status updates in Sheets immediately
    }
    res.json({ success: true });
});

// 5. FINALIZE BILL (Manager updates billing and status)
app.post("/finalize-bill", async (req, res) => {
    const order = orders.find(o => o.orderId === req.body.orderId);
    
    if (order) {
        order.status = "Completed";
        order.finalTotal = req.body.finalTotal;
        order.discount = req.body.discount || "0";
        order.tax = req.body.taxAmount || "0";
        
        // Push the finalized billing data to Google Sheets
        await syncToSheets(order);
        
        // Clean up: Optional - remove from local memory after sync if needed
        // orders = orders.filter(o => o.orderId !== req.body.orderId);
    }
    res.json({ success: true });
});

app.listen(3000, () => console.log("🚀 Emerald Server Running on Port 3000"));