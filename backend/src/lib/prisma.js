const { PrismaClient } = require('@prisma/client');
const inMemoryPrisma = require('./inMemoryPrisma');

const shouldUseInMemory =
  process.env.USE_IN_MEMORY_STORE === 'true' || !process.env.DATABASE_URL;

if (shouldUseInMemory) {
  module.exports = inMemoryPrisma;
  return;
}

const globalForPrisma = global;

const prisma = globalForPrisma.prisma || new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

module.exports = prisma;
