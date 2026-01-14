const axios = require('axios');

async function run() {
  try {
    const baseURL = 'http://localhost:3000';
    const instance = axios.create({ baseURL });

    const signupResponse = await instance.post('/auth/signup', {
      name: 'Test Admin',
      email: 'testadmin@example.com',
      phone: '1234567890',
      password: 'SecurePass123!',
    });
    console.log('Signup response:', signupResponse.data);

    const loginResponse = await instance.post('/auth/login', {
      email: 'testadmin@example.com',
      password: 'SecurePass123!',
    });
    console.log('Login response:', loginResponse.data);
  } catch (error) {
    if (error.response) {
      console.error('Error response:', error.response.status, error.response.data);
    } else {
      console.error('Error:', error.message);
    }
  }
}

run();
