// Credentials for each role tier on Henderson.
// Fill matching vars in .env.test — use real Henderson users with those roles.
// test@caiacdigital.com is the safe-to-modify test user (role: client).

export const CLIENT_SLUG = 'henderson'

export const clientUser = {
  email: process.env.TEST_USER_EMAIL ?? 'test@caiacdigital.com',
  password: process.env.TEST_USER_PASSWORD ?? 'CaiacTest2026!',
  client_slug: CLIENT_SLUG,
  role: 'client',
}

export const staffUser = {
  email: process.env.TEST_USER_STAFF_EMAIL ?? '',
  password: process.env.TEST_USER_STAFF_PASSWORD ?? '',
  client_slug: CLIENT_SLUG,
  role: 'staff',
}

export const adminUser = {
  email: process.env.TEST_USER_ADMIN_EMAIL ?? '',
  password: process.env.TEST_USER_ADMIN_PASSWORD ?? '',
  client_slug: CLIENT_SLUG,
  role: 'admin',
}

export const ownerUser = {
  email: process.env.TEST_USER_OWNER_EMAIL ?? '',
  password: process.env.TEST_USER_OWNER_PASSWORD ?? '',
  client_slug: CLIENT_SLUG,
  role: 'owner',
}

// Mirrors caiac.role_hierarchy — source of truth is docs/roles-and-features.md
export const ROLE_HIERARCHY: Record<string, string[]> = {
  owner: ['public', 'staff', 'admin', 'owner'],
  admin: ['public', 'staff', 'admin'],
  staff: ['public', 'staff'],
  client: ['public'],
  guest: ['public'],
}
