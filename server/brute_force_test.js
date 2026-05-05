/**
 * ================================================================
 * BRUTE FORCE SECURITY TEST SCRIPT
 * ================================================================
 * Purpose : Security testing of /api/auth/login endpoint
 * App     : Project Management - Local Dev Only
 * Endpoint: POST http://localhost:5000/api/auth/login
 * Fields  : { employeeId, password }
 * 
 * ⚠️  ONLY run this on your own local development server!
 * ================================================================
 */

const http = require('http');

// ---------------------------------------------------------------
// CONFIG — Edit these values before running
// ---------------------------------------------------------------
const TARGET_HOST = 'localhost';
const TARGET_PORT = 5000;
const TARGET_PATH = '/api/auth/login';

// Target employee ID to test against
const TARGET_EMPLOYEE_ID = 'EMP001'; // <-- Change to your actual Employee ID

// Delay between each attempt (ms) — set 0 for fastest, 200 for safer
const DELAY_MS = 100;

// ---------------------------------------------------------------
// PASSWORD LIST — Add as many as you want
// ---------------------------------------------------------------
const passwords = [
  // Common weak passwords
  '123456',
  'password',
  'password123',
  '12345678',
  'qwerty',
  'abc123',
  'letmein',
  'welcome',
  'admin',
  'admin123',

  // Company-style patterns
  'Enarxi@123',
  'Enarxi2024',
  'Enarxi2025',
  'Enarxi@2024',
  'Enarxi@2025',

  // Employee ID based guesses
  `${TARGET_EMPLOYEE_ID}`,
  `${TARGET_EMPLOYEE_ID}@123`,
  `${TARGET_EMPLOYEE_ID}2024`,

  // Date-based patterns
  'Jan@2024',
  'Jan@2025',
  'Test@1234',
  'Test@123',
  'Welcome@1',
  'Welcome@123',
  'P@ssword1',
  'P@ssword123',
  'India@123',
  'User@1234',

  // Add your own custom wordlist here
  // 'YourCustomPassword1',
  // 'AnotherGuess@99',
];

// ---------------------------------------------------------------
// HTTP POST Helper
// ---------------------------------------------------------------
function tryLogin(employeeId, password) {
  return new Promise((resolve) => {
    const body = JSON.stringify({ employeeId, password });

    const options = {
      hostname: TARGET_HOST,
      port: TARGET_PORT,
      path: TARGET_PATH,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        resolve({ status: res.statusCode, body: data });
      });
    });

    req.on('error', (err) => {
      resolve({ status: 0, body: err.message });
    });

    req.write(body);
    req.end();
  });
}

// ---------------------------------------------------------------
// Sleep helper
// ---------------------------------------------------------------
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------
// MAIN — Run the brute force test
// ---------------------------------------------------------------
async function runBruteForceTest() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║        BRUTE FORCE SECURITY TEST — LOCAL ONLY       ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log(`  Target   : ${TARGET_HOST}:${TARGET_PORT}${TARGET_PATH}`);
  console.log(`  Employee : ${TARGET_EMPLOYEE_ID}`);
  console.log(`  Passwords: ${passwords.length} attempts`);
  console.log(`  Delay    : ${DELAY_MS}ms per attempt`);
  console.log('──────────────────────────────────────────────────────');
  console.log('');

  let found = false;
  let attemptCount = 0;

  for (const password of passwords) {
    attemptCount++;

    const { status, body } = await tryLogin(TARGET_EMPLOYEE_ID, password);

    const icon = status === 200 ? '✅' : '❌';
    const label = status === 200 ? 'SUCCESS' : `FAILED (${status})`;

    console.log(`  [${String(attemptCount).padStart(3, '0')}] ${icon} ${label.padEnd(14)} → Password: "${password}"`);

    if (status === 200) {
      console.log('');
      console.log('══════════════════════════════════════════════════════');
      console.log(`  🔓 VULNERABILITY FOUND!`);
      console.log(`  Employee ID : ${TARGET_EMPLOYEE_ID}`);
      console.log(`  Password    : ${password}`);
      console.log('══════════════════════════════════════════════════════');
      console.log('');
      console.log('  ⚠️  ACTION REQUIRED: Implement rate limiting!');
      console.log('     npm install express-rate-limit');
      console.log('');
      found = true;
      break;
    }

    // Rate limit detection
    if (status === 429) {
      console.log('');
      console.log('  ✅ RATE LIMITING IS ACTIVE (HTTP 429 detected)');
      console.log('     Your app is already protected against brute force!');
      console.log('');
      break;
    }

    if (DELAY_MS > 0) {
      await sleep(DELAY_MS);
    }
  }

  console.log('──────────────────────────────────────────────────────');
  console.log('');

  if (!found) {
    console.log(`  📊 RESULT: ${attemptCount} passwords tested — None matched.`);
    console.log('');
    console.log('  SECURITY STATUS:');
    console.log('  ─────────────────────────────────────────────────');
    console.log('  ⚠️  No rate limiting detected on the endpoint.');
    console.log('     An attacker could try millions of passwords.');
    console.log('');
    console.log('  🛡️  RECOMMENDED FIXES:');
    console.log('     1. npm install express-rate-limit');
    console.log('     2. Add account lockout after 5 failed attempts');
    console.log('     3. Add login attempt logging');
    console.log('');
  }
}

runBruteForceTest().catch(console.error);
