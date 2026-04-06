const prisma = require('../lib/prisma');

async function connectDB() {
  if (process.env.USE_IN_MEMORY_STORE === 'true') {
    console.log('In-memory data store enabled (no external database connection)');
    return;
  }

  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not configured in backend/.env');
  }

  try {
    await prisma.$connect();
    console.log('PostgreSQL connected via Prisma');
  } catch (error) {
    console.error('PostgreSQL connection failed:', error.message);
    console.error('Hint: ensure DATABASE_URL is valid and PostgreSQL is reachable');
    throw error;
  }
}

module.exports = connectDB;
