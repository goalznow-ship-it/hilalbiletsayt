import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import * as argon2 from 'argon2'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL || 'postgresql://hilal:hilal@localhost:5432/hilal' })
const prisma = new PrismaClient({ adapter })

async function createTestUser() {
  const hashedPassword = await argon2.hash('testpassword123')
  const role = await prisma.role.upsert({
    where: { name: 'SUPER_ADMIN' },
    create: {
      name: 'SUPER_ADMIN',
      description: 'Super admin role'
    },
    update: {}
  })

  const branch = await prisma.branch.upsert({
    where: { code: 'TEST' },
    create: {
      code: 'TEST',
      name: 'Test Branch',
      address: 'Test Address',
      phone: '1234567890',
      isActive: true
    },
    update: {}
  })

  const user = await prisma.user.create({
    data: {
      email: 'admin@example.com',
      fullName: 'Test Admin',
      passwordHash: hashedPassword,
      isActive: true,
      userBranchRoles: {
        create: {
          roleId: role.id,
          branchId: branch.id
        }
      }
    }
  })

  console.log('Test user created:', user)
  return user
}

createTestUser()
  .then(() => prisma.$disconnect())
  .catch((err) => {
    console.error('Error creating test user:', err)
    prisma.$disconnect()
  })
