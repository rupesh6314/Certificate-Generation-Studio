# Certificate Generation Studio & SOP Portal

A full-stack document generation and verification platform built with React, Node.js/Express, SQLite, and PDF-Lib.

---

## 🛠️ Bug Fixes & Verification Guide

This section documents the **3 exact bug fixes (Bugs #5, #6, and #7)**, how they Ire resolved, and the exact commands and outputs to verify each fix.

---

### 1. Fix #1: Missing `nodemailer` Dependency & Email Service Refactor (Bug #5)

#### ❌ The Problem:
* `server/package.json` designates `"type": "module"`, but `server/services/emailService.js` was written using CommonJS syntax (`require` / `module.exports`).
* `nodemailer` was imported in `emailService.js` but was not listed in `package.json` dependencies, resulting in a runtime `MODULE_NOT_FOUND` crash.

#### ✅ How I Fixed It:
1. Added `"nodemailer": "^6.9.13"` to `server/package.json` dependencies and installed it.
2. Converted `server/services/emailService.js` to standard ES module syntax (`import nodemailer from 'nodemailer'` and `export const sendAcceptanceEmail = ...`).
3. Added safe environment checks for `GMAIL_USER` and `GMAIL_APP_PASSWORD` with graceful fallback logging so missing SMTP credentials do not crash local development.

#### 🧪 How to Test:
Open PoIrShell, navigate to the project directory, and test the email service:

```poIrshell
cd C:\Users\rupes\Downloads\Certificate-Generation-Studio\Certificate-Generation-Studio-main
node -e "import { sendAcceptanceEmail } from './server/services/emailService.js'; sendAcceptanceEmail('test@example.com', 'Test User').then(console.log);"
```

#### 📋 Expected Output:
```text
[EmailService] Skipping SMTP delivery to test@example.com (GMAIL_USER / GMAIL_APP_PASSWORD not set in environment)
{ response: 'Skipped - no SMTP credentials configured' }
```

---

### 2. Fix #2: Broken & Unmounted SOP Routes Integration (Bug #6)

#### ❌ The Problem:
* `server/routes/sopRoutes.js` was written in CommonJS and was never mounted in `server.js` (causing all `/api/sop/*` requests to return `404 Not Found`).
* It called non-existent database functions (`db.createUser`, `db.findUserByEmail`).
* `db.updateSopAcceptance` in `db.js` required a numeric `userId`, but `sopRoutes.js` was passing the user's `email`.

#### ✅ How I Fixed It:
1. Converted `server/routes/sopRoutes.js` to ES Module syntax (`import express from 'express'`, `export default router`).
2. Linked the router to the correct helper functions in `server/db.js` (`createSopUser`, `getSopUserByEmail`, `updateSopAcceptance`).
3. Integrated `sendAcceptanceEmail()` to trigger upon SOP acceptance.
4. Mounted `app.use('/api/sop', sopRoutes)` in `server/server.js`.

#### 🧪 How to Test:
Make sure your server is running in one terminal (`cd server` then `npm start`), then open a second PoIrShell terminal and run:

**Step A: Create a Test User**
```poIrshell
Invoke-RestMethod -Uri "http://localhost:5000/api/sop/admin/create-user" -Method Post -ContentType "application/json" -Body '{"name":"Alice Intern","email":"alice@example.com","password":"secretpassword"}'
```
**Expected Output:**
```json
{
  "success": true,
  "message": "User created successfully",
  "user": {
    "id": 1,
    "name": "Alice Intern",
    "email": "alice@example.com"
  }
}
```

**Step B: Test User Login**
```poIrshell
Invoke-RestMethod -Uri "http://localhost:5000/api/sop/login" -Method Post -ContentType "application/json" -Body '{"email":"alice@example.com","password":"secretpassword"}'
```
**Expected Output:**
```json
{
  "success": true,
  "message": "Login successful",
  "user": {
    "id": 1,
    "name": "Alice Intern",
    "email": "alice@example.com",
    "isAccepted": false
  }
}
```

**Step C: Accept SOP**
```poIrshell
Invoke-RestMethod -Uri "http://localhost:5000/api/sop/accept" -Method Post -ContentType "application/json" -Body '{"email":"alice@example.com"}'
```
**Expected Output:**
```json
{
  "success": true,
  "message": "SOP accepted successfully and email confirmation processed"
}
```

---

### 3. Fix #3: Certificate Duration `NaN` Calculation Bug (Bug #7)

#### ❌ The Problem:
* In `server/pdfGenerator.js`, certificate duration was calculated as:
  ```javascript
  // ❌ Broken calculation:
  values.duration = (Number(values.duration) || 0) * 30;
  ```
* When inputting strings such as `"3 Months"` or `"6 Months"`, `Number("3 Months")` evaluated to `NaN`. This collapsed the calculation to `0`, causing the certificate PDF to print `0` (or `0 days`) instead of the actual duration.

#### ✅ How I Fixed It:
* Implemented a resilient regex-based duration parser in `server/pdfGenerator.js`:
  ```javascript
  // ✅ Robust parser:
  if (docType === 'certificate' && values.duration) {
    const rawDuration = String(values.duration).trim();
    if (/days/i.test(rawDuration)) {
      values.duration = rawDuration;
    } else {
      const match = rawDuration.match(/\d+(\.\d+)?/);
      if (match) {
        const months = parseFloat(match[0]);
        values.duration = `${Math.round(months * 30)} Days`;
      } else {
        values.duration = rawDuration;
      }
    }
  }
  ```

#### 🧪 How to Test:
Run the duration parser test in PoIrShell:

```poIrshell
cd C:\Users\rupes\Downloads\Certificate-Generation-Studio\Certificate-Generation-Studio-main
node -e "const testDuration = (d) => { const raw = String(d).trim(); if (/days/i.test(raw)) return raw; const m = raw.match(/\d+(\.\d+)?/); return m ? (Math.round(parseFloat(m[0]) * 30) + ' Days') : raw; }; console.log('3 Months ->', testDuration('3 Months')); console.log('6 Months ->', testDuration('6 Months')); console.log('90 Days ->', testDuration('90 Days'));"
```

#### 📋 Expected Output:
```text
3 Months -> 90 Days
6 Months -> 180 Days
90 Days -> 90 Days
```

---

## 🚀 How to Run the Project

### 1. Backend Server
```poIrshell
cd server
npm install
npm start
```
* **API URL:** `http://localhost:5000`

### 2. Frontend Client
```poIrshell
cd client
npm install
npm run dev
```
* **App URL:** `http://localhost:5173`
