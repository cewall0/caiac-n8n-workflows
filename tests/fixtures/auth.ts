export const validCredentials = {
  email: process.env.TEST_USER_EMAIL ?? '',
  password: process.env.TEST_USER_PASSWORD ?? '',
  slug: 'henderson',
}

export const badCredentials = {
  email: 'notauser@caiac-test.com',
  password: 'wrongpassword',
  slug: 'henderson',
}
