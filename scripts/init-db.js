require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST, port: process.env.DB_PORT,
    user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    multipleStatements: true,
  });
  await conn.query(fs.readFileSync(path.join(__dirname, '../sql/schema.sql'), 'utf8'));
  console.log('Database and tables are ready.');
  await conn.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
