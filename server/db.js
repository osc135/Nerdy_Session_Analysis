import mysql from 'mysql2/promise';

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'nerdy',
  password: process.env.DB_PASS || 'nerdy123',
  database: process.env.DB_NAME || 'nerdy_sessions',
  waitForConnections: true,
  connectionLimit: 10,
});

export async function initDB() {
  const conn = await pool.getConnection();
  try {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        session_code VARCHAR(8) NOT NULL,
        tutor_id INT,
        student_id INT,
        tutor_metrics JSON,
        student_metrics JSON,
        merged BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        ended_at TIMESTAMP NULL,
        FOREIGN KEY (tutor_id) REFERENCES users(id),
        FOREIGN KEY (student_id) REFERENCES users(id)
      )
    `);

    console.log('Database tables initialized');
  } finally {
    conn.release();
  }
}

export default pool;
