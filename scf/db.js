'use strict';

// PostgreSQL 连接池封装
// CloudBase PostgreSQL 需要 SSL：ssl.rejectUnauthorized = false
// 连接信息通过环境变量传入，生产不要把密码写进代码。

const pg = require('pg');

const pool = new pg.Pool({
  host: process.env.PGHOST || process.env.DB_HOST,
  port: Number(process.env.PGPORT || process.env.DB_PORT || 5432),
  database: process.env.PGDATABASE || process.env.DB_NAME,
  user: process.env.PGUSER || process.env.DB_USER,
  password: process.env.PGPASSWORD || process.env.DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
  max: Number(process.env.PGPOOL_MAX || 3),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

async function query(sql, params) {
  return pool.query(sql, params);
}

module.exports = { pool, query };
