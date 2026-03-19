// ═══════════════════════════════════════════════════════════════
// MINELLA JEWELS — Google Apps Script Backend
// Paste this entire file into your Apps Script editor
// File > New > Script  →  paste  →  Save  →  Deploy as Web App
// ═══════════════════════════════════════════════════════════════

// ── CONFIGURATION ──────────────────────────────────────────────
const CONFIG = {
  PAYU_KEY:          "82z65K",
  PAYU_SALT:         "ZZBEVz6pjGiSI2fOoGH6EdGJ2EbS24oR",
  PRODUCT_SHEET_ID:  "1XtAvGTcVo7sKxmpBKHgZTg77ubxijUY1zt4q6IKl0Dk",
  NOTIFY_EMAIL:      "minellajewels@gmail.com",
  STORE_URL:         "https://store.minella.in",
};

// ── ENTRY POINTS ───────────────────────────────────────────────

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    let result;

    if (data.action === "generateHash") {
      result = handleGenerateHash(data);
    } else if (data.action === "placeOrder") {
      result = handleCODOrder(data);
    } else if (data.action === "deductStock") {
      result = handleDeductStock(data);
    } else {
      result = { ok: false, error: "Unknown action" };
    }

    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// Allow GET for health check
function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, service: "Minella Jewels Backend" }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── HASH GENERATION (PayU) ─────────────────────────────────────

function handleGenerateHash(data) {
  const { txnid, amount, productinfo, firstname, email, orderData } = data;

  const hashString = [
    CONFIG.PAYU_KEY,
    txnid,
    amount,
    productinfo,
    firstname,
    email,
    "","","","","",  // udf1-5 empty
    "","","","",     // additional empties
    CONFIG.PAYU_SALT
  ].join("|");

  const hash = computeSHA512(hashString);

  // Log pending order
  logOrder({
    ...orderData,
    txnid,
    status: "PENDING_PAYMENT",
    timestamp: new Date().toISOString(),
  });

  return { ok: true, hash };
}

// ── COD ORDER HANDLING ─────────────────────────────────────────

function handleCODOrder(data) {
  // Log order (stock NOT deducted — manual confirm required)
  logOrder({
    ...data,
    txnid: "COD-" + Date.now(),
    status: "COD_PENDING_CONFIRM",
    timestamp: new Date().toISOString(),
  });

  // Send email notification
  sendOrderEmail(data);

  return { ok: true };
}

// ── DEDUCT STOCK (called from success page after PayU payment) ─

function handleDeductStock(data) {
  const { cartData, txnid } = data;
  if (!cartData) return { ok: false, error: "No cart data" };

  const items = typeof cartData === "string" ? JSON.parse(cartData) : cartData;
  const ss    = SpreadsheetApp.openById(CONFIG.PRODUCT_SHEET_ID);
  const sheet = ss.getSheets()[0];
  const rows  = sheet.getDataRange().getValues();
  const headers = rows[0].map(h => h.toString().toLowerCase().trim());
  const titleCol = headers.indexOf("title");
  const stockCol = headers.findIndex(h => h === "stocks" || h === "stock");

  if (stockCol === -1) return { ok: false, error: "No stock column found" };

  items.forEach(({ title, qty }) => {
    for (let r = 1; r < rows.length; r++) {
      if ((rows[r][titleCol] || "").trim() === title.trim()) {
        const cur = parseInt(rows[r][stockCol]) || 0;
        const newVal = Math.max(0, cur - qty);
        sheet.getRange(r + 1, stockCol + 1).setValue(newVal);
        break;
      }
    }
  });

  // Update order status
  updateOrderStatus(txnid, "PAID");
  // Send email notification for prepaid
  sendOrderEmailByTxn(txnid);

  return { ok: true };
}

// ── LOG ORDER TO SEPARATE SHEET ────────────────────────────────

function logOrder(data) {
  // Get or create Orders spreadsheet
  let ordersSheet;
  try {
    // Try to find by name in Drive
    const files = DriveApp.getFilesByName("Minella Jewels — Orders");
    if (files.hasNext()) {
      const file = files.next();
      ordersSheet = SpreadsheetApp.openById(file.getId());
    } else {
      ordersSheet = SpreadsheetApp.create("Minella Jewels — Orders");
      // Share with owner
      DriveApp.getFileById(ordersSheet.getId()).setSharing(
        DriveApp.Access.PRIVATE,
        DriveApp.Permission.NONE
      );
    }
  } catch(e) {
    ordersSheet = SpreadsheetApp.create("Minella Jewels — Orders");
  }

  let sheet = ordersSheet.getSheets()[0];

  // Add headers if empty
  if (sheet.getLastRow() === 0) {
    sheet.appendRow([
      "Timestamp","TxnID","Status","Name","Phone","Email",
      "Address","Items","Subtotal","Shipping","COD Charge","Grand Total","Payment Method"
    ]);
    sheet.getRange(1, 1, 1, 13).setFontWeight("bold").setBackground("#4a1942").setFontColor("white");
    sheet.setFrozenRows(1);
  }

  sheet.appendRow([
    data.timestamp || new Date().toISOString(),
    data.txnid || "",
    data.status || "",
    data.name || "",
    data.phone || "",
    data.email || "",
    data.address || "",
    data.items || "",
    data.subtotal || 0,
    data.shipping || 0,
    data.codCharge || 0,
    data.grandTotal || 0,
    data.paymentMethod || "",
  ]);
}

function updateOrderStatus(txnid, status) {
  try {
    const files = DriveApp.getFilesByName("Minella Jewels — Orders");
    if (!files.hasNext()) return;
    const ss    = SpreadsheetApp.openById(files.next().getId());
    const sheet = ss.getSheets()[0];
    const data  = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][1] === txnid) {
        sheet.getRange(i + 1, 3).setValue(status);
        break;
      }
    }
  } catch(e) {}
}

function sendOrderEmailByTxn(txnid) {
  try {
    const files = DriveApp.getFilesByName("Minella Jewels — Orders");
    if (!files.hasNext()) return;
    const ss    = SpreadsheetApp.openById(files.next().getId());
    const sheet = ss.getSheets()[0];
    const data  = sheet.getDataRange().getValues();
    const h     = data[0];
    for (let i = 1; i < data.length; i++) {
      if (data[i][1] === txnid) {
        const row = {};
        h.forEach((key, j) => row[key.toLowerCase()] = data[i][j]);
        sendOrderEmailRaw(row);
        break;
      }
    }
  } catch(e) {}
}

// ── EMAIL NOTIFICATION ─────────────────────────────────────────

function sendOrderEmail(data) {
  sendOrderEmailRaw(data);
}

function sendOrderEmailRaw(d) {
  const subject = `🛍️ New Order — ${d.paymentmethod || d.paymentMethod || "Unknown"} — ₹${d.grandtotal || d.grandTotal}`;
  const body = `
New order received on Minella Jewels!

━━━━━━━━━━━━━━━━━━━━━━
CUSTOMER DETAILS
━━━━━━━━━━━━━━━━━━━━━━
Name    : ${d.name}
Phone   : ${d.phone}
Email   : ${d.email}
Address : ${d.address}

━━━━━━━━━━━━━━━━━━━━━━
ORDER DETAILS
━━━━━━━━━━━━━━━━━━━━━━
${d.items}

Subtotal  : ₹${d.subtotal}
Shipping  : ₹${d.shipping}
COD Charge: ₹${d.codCharge || d.codcharge || 0}
Grand Total: ₹${d.grandTotal || d.grandtotal}

Payment: ${d.paymentMethod || d.paymentmethod}
Txn ID : ${d.txnid || "—"}
━━━━━━━━━━━━━━━━━━━━━━

${(d.paymentMethod || d.paymentmethod || "").toUpperCase() === "COD"
  ? "⚠️  COD ORDER — Please confirm and deduct stock manually after delivery."
  : "✅  PREPAID ORDER — Stock has been deducted automatically."
}

View all orders: https://docs.google.com/spreadsheets/
  `.trim();

  try {
    GmailApp.sendEmail(CONFIG.NOTIFY_EMAIL, subject, body);
  } catch(e) {
    MailApp.sendEmail(CONFIG.NOTIFY_EMAIL, subject, body);
  }
}

// ── SHA-512 HASH ───────────────────────────────────────────────

function computeSHA512(input) {
  const digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_512,
    input,
    Utilities.Charset.UTF_8
  );
  return digest.map(b => {
    const hex = (b < 0 ? b + 256 : b).toString(16);
    return hex.length === 1 ? "0" + hex : hex;
  }).join("");
}
