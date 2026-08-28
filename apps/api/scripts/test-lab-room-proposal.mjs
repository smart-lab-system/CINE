import 'dotenv/config';
import { Client } from 'pg';

const suffix = Date.now();
const username = `prop_test_${suffix}`;
const password = 'correct-horse-battery';
const base = 'http://localhost:4000';

async function main() {
  await fetch(`${base}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username,
      password,
      displayName: 'Prop Test',
    }),
  });

  const pg = new Client({ connectionString: process.env.DATABASE_URL });
  await pg.connect();
  const userResult = await pg.query(
    `SELECT id FROM lab_management.users WHERE username = $1`,
    [username],
  );
  const roleResult = await pg.query(
    `SELECT id FROM lab_management.roles WHERE code = 'admin'`,
  );
  await pg.query(
    `INSERT INTO lab_management.user_roles (user_id, role_id) VALUES ($1, $2)`,
    [userResult.rows[0].id, roleResult.rows[0].id],
  );
  await pg.end();

  const loginRes = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const login = await loginRes.json();
  const token = login.accessToken;

  const tests = [
    [
      'valid',
      {
        roomCode: 'H1.1',
        roomName: 'Phòng test',
        building: 'H',
        floor: '1',
        devices: [
          { role: 'tutor', machineId: 'abc-123', hostname: 'PC1' },
        ],
      },
    ],
    [
      'empty hostname',
      {
        roomCode: 'H1.1',
        roomName: 'Test',
        devices: [{ role: 'tutor', machineId: 'abc', hostname: '' }],
      },
    ],
    [
      'room space',
      {
        roomCode: 'H 1.1',
        roomName: 'Test',
        devices: [{ role: 'tutor', machineId: 'abc', hostname: 'PC' }],
      },
    ],
    [
      'empty building',
      {
        roomCode: 'H1.1',
        roomName: 'Test',
        devices: [{ role: 'tutor', machineId: 'abc', hostname: 'PC' }],
      },
    ],
    [
      'missing hostname',
      {
        roomCode: 'H1.1',
        roomName: 'Test',
        devices: [{ role: 'tutor', machineId: 'abc' }],
      },
    ],
  ];

  for (const [name, body] of tests) {
    const res = await fetch(`${base}/lab-room-proposals`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    console.log(name, res.status, text.slice(0, 400));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
