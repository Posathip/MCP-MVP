// One-off bootstrap: create or promote an account directly in the DB, bypassing the API.
// Needed because self-registration always creates role 'user' and POST /api/admins
// requires an existing admin token - so the very first admin has no API bootstrap path.
//
// Usage: node scripts/create-admin.js <username> <password> [role]
//   role defaults to "admin". Re-running with an existing username updates its
//   password/role instead of failing on the unique constraint.
const bcrypt = require('bcryptjs');
const prisma = require('../lib/prisma');

const SALT_ROUNDS = 10;

async function main() {
  const [username, password, role = 'admin'] = process.argv.slice(2);

  if (!username || !password) {
    console.error('Usage: node scripts/create-admin.js <username> <password> [role]');
    process.exitCode = 1;
    return;
  }
  if (password.length < 8) {
    console.error('password must be at least 8 characters');
    process.exitCode = 1;
    return;
  }
  if (!['admin', 'user'].includes(role)) {
    console.error('role must be "admin" or "user"');
    process.exitCode = 1;
    return;
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const account = await prisma.admin.upsert({
    where: { username },
    create: { username, passwordHash, role },
    update: { passwordHash, role },
    select: { id: true, uuid: true, username: true, role: true },
  });

  console.log('Account ready:', account);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
