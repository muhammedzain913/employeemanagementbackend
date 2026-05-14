  require('dotenv').config();

  const { PrismaClient } = require('@prisma/client');
  const bcrypt = require('bcryptjs');

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

    // First admin cannot use POST /register (that route requires an admin token).
    // Set SEED_ADMIN_EMAIL + SEED_ADMIN_PASSWORD (optional SEED_ADMIN_NAME), then run: npx prisma db seed
    const adminEmail = process.env.SEED_ADMIN_EMAIL;
    const adminPassword = process.env.SEED_ADMIN_PASSWORD;
    if (adminEmail && adminPassword) {
      const adminRole = await prisma.role.findUnique({ where: { name: 'ADMIN' } });
      if (!adminRole) throw new Error('ADMIN role missing after seed');

      const existing = await prisma.user.findUnique({ where: { email: adminEmail } });
      if (existing) {
        console.log('Seed admin: user with that email already exists, skipped.');
      } else {
        const hashedPassword = await bcrypt.hash(adminPassword, 10);
        await prisma.user.create({
          data: {
            email: adminEmail,
            name: process.env.SEED_ADMIN_NAME || 'Administrator',
            password: hashedPassword,
            roleId: adminRole.id,
          },
        });
        console.log('Seed admin: created user with ADMIN role.');
      }
    }
  }

  main()
    .then(() => {
      console.log('Seed finished.');
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
