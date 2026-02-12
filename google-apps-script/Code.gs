/**
 * ==========================================================
 *  Rialto Restaurant - Google Apps Script
 *  Google Sheets Integration for Order Logging
 * ==========================================================
 *
 *  SETUP INSTRUCTIONS:
 *  1. Create a new Google Sheet
 *  2. Go to Extensions > Apps Script
 *  3. Paste this entire code into the editor
 *  4. Click Deploy > New Deployment
 *  5. Select "Web app" as the type
 *  6. Set "Execute as" to "Me"
 *  7. Set "Who has access" to "Anyone"
 *  8. Click Deploy and copy the Web App URL
 *  9. In the restaurant app, open browser console and run:
 *     localStorage.setItem("rialto_sheet_url", "YOUR_WEB_APP_URL_HERE")
 *
 *  The sheet will automatically create headers on first use.
 * ==========================================================
 */

// Sheet name for orders
var SHEET_NAME = "Orders";

/**
 * Handle GET requests - Return all orders as JSON
 */
function doGet(e) {
  try {
    var sheet = getOrCreateSheet();
    var data = sheet.getDataRange().getValues();

    if (data.length <= 1) {
      return ContentService.createTextOutput(JSON.stringify([]))
        .setMimeType(ContentService.MimeType.JSON);
    }

    var headers = data[0];
    var orders = [];

    for (var i = 1; i < data.length; i++) {
      var row = {};
      for (var j = 0; j < headers.length; j++) {
        row[headers[j]] = data[i][j];
      }
      // Only return non-completed orders for kitchen view
      if (row.status !== "Completed") {
        orders.push(row);
      }
    }

    return ContentService.createTextOutput(JSON.stringify(orders))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Handle POST requests - Log new order or update existing
 */
function doPost(e) {
  try {
    var sheet = getOrCreateSheet();
    var data = JSON.parse(e.postData.contents);

    // Check if this is an update (order already exists)
    if (data.status === "Completed" && data.orderId) {
      return updateOrderStatus(sheet, data);
    }

    // New order - append row
    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

    var row = headers.map(function(header) {
      if (header === "timestamp" && !data.timestamp) {
        return new Date().toISOString();
      }
      return data[header] !== undefined ? data[header] : "";
    });

    sheet.appendRow(row);

    // Auto-resize columns for readability
    try {
      sheet.autoResizeColumns(1, headers.length);
    } catch(e) {}

    return ContentService.createTextOutput(JSON.stringify({ success: true }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Update existing order status to Completed
 */
function updateOrderStatus(sheet, data) {
  var dataRange = sheet.getDataRange().getValues();
  var headers = dataRange[0];
  var orderIdCol = headers.indexOf("orderId");
  var statusCol = headers.indexOf("status");

  if (orderIdCol === -1) {
    return ContentService.createTextOutput(JSON.stringify({ error: "orderId column not found" }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  for (var i = 1; i < dataRange.length; i++) {
    if (dataRange[i][orderIdCol] === data.orderId) {
      // Update all provided fields
      for (var key in data) {
        var colIdx = headers.indexOf(key);
        if (colIdx !== -1) {
          sheet.getRange(i + 1, colIdx + 1).setValue(data[key]);
        }
      }

      return ContentService.createTextOutput(JSON.stringify({ success: true, updated: true }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  // If order not found, append as new completed record
  var row = headers.map(function(header) {
    return data[header] !== undefined ? data[header] : "";
  });
  sheet.appendRow(row);

  return ContentService.createTextOutput(JSON.stringify({ success: true, appended: true }))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Get or create the Orders sheet with proper headers
 */
function getOrCreateSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }

  // Check if headers exist
  var firstCell = sheet.getRange("A1").getValue();
  if (!firstCell) {
    var headers = [
      "orderId",
      "name",
      "items",
      "tableNumber",
      "people",
      "note",
      "paymentMethod",
      "subtotal",
      "discount",
      "cgst",
      "sgst",
      "grandTotal",
      "paymentMode",
      "status",
      "timestamp"
    ];

    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

    // Style headers
    var headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setFontWeight("bold");
    headerRange.setBackground("#C8553D");
    headerRange.setFontColor("#FFFFFF");
    headerRange.setHorizontalAlignment("center");

    // Freeze header row
    sheet.setFrozenRows(1);

    // Set column widths
    sheet.setColumnWidth(1, 120); // orderId
    sheet.setColumnWidth(2, 150); // name
    sheet.setColumnWidth(3, 300); // items
    sheet.setColumnWidth(14, 100); // status
    sheet.setColumnWidth(15, 180); // timestamp
  }

  return sheet;
}

/**
 * Utility: Get daily summary
 * Can be triggered via a timed trigger for daily reports
 */
function getDailySummary() {
  var sheet = getOrCreateSheet();
  var data = sheet.getDataRange().getValues();
  var headers = data[0];

  var today = new Date().toISOString().split("T")[0];
  var totalOrders = 0;
  var totalRevenue = 0;

  var timestampCol = headers.indexOf("timestamp");
  var grandTotalCol = headers.indexOf("grandTotal");
  var statusCol = headers.indexOf("status");

  for (var i = 1; i < data.length; i++) {
    var orderDate = String(data[i][timestampCol]).split("T")[0];
    if (orderDate === today && data[i][statusCol] === "Completed") {
      totalOrders++;
      totalRevenue += Number(data[i][grandTotalCol]) || 0;
    }
  }

  Logger.log("Daily Summary for " + today);
  Logger.log("Total Completed Orders: " + totalOrders);
  Logger.log("Total Revenue: Rs " + totalRevenue);

  return {
    date: today,
    orders: totalOrders,
    revenue: totalRevenue
  };
}
