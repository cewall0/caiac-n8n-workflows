export const validCredentials = {
  email: process.env.TEST_USER_EMAIL ?? '',
  password: process.env.TEST_USER_PASSWORD ?? '',
  client_slug: 'henderson',
}

export const badCredentials = {
  email: 'notauser@caiac-test.com',
  password: 'wrongpassword',
  client_slug: 'henderson',
}
