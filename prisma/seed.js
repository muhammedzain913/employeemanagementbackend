const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const roles = [
    { name: 'ADMIN', description: 'Administrator' },
    { name: 'MANAGER', description: 'Manager' },
    { name: 'EMPLOYEE', description: 'Employee' },
  ];

  for (const r of roles) {
    await prisma.role.upsert({
      where: { name: r.name },
      create: r,
      update: { description: r.description },
    });
  }
}

main()
  .then(() => {
    console.log('Seed finished: roles upserted.');
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
