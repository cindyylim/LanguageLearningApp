const { defineConfig } = require('cypress');
const axios = require('axios');

// Helper function for retrying requests with exponential backoff
async function retryRequest(fn, retries = 3, delay = 1000) {
  let lastError;
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (i < retries - 1) {
        // Wait with exponential backoff
        await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i)));
      }
    }
  }
  throw lastError;
}

module.exports = defineConfig({
  e2e: {
    baseUrl: 'http://localhost:3000',
    supportFile: 'cypress/support/e2e.ts',
    specPattern: 'cypress/e2e/**/*.cy.{js,jsx,ts,tsx}',
    video: true,
    screenshotOnRunFailure: true,
    viewportWidth: 1280,
    viewportHeight: 720,
    defaultCommandTimeout: 10000,
    requestTimeout: 10000,
    responseTimeout: 10000,
    env: {
      apiUrl: 'http://localhost:5000/api'
    },
    setupNodeEvents(on, config) {
      on('task', {
        async deleteUserByEmail(email) {
          return retryRequest(async () => {
            const response = await axios.post(`${config.env.apiUrl}/test-db/delete-user`, { email });
            if (response.status !== 200) {
              throw new Error(`Failed to delete user: ${response.data?.error || 'Unknown error'} (Status: ${response.status})`);
            }
            return response.data;
          });
        },
        
        async seedTestDb() {
          return retryRequest(async () => {
            const response = await axios.post(`${config.env.apiUrl}/test-db/seed`);
            if (response.status !== 200) {
              throw new Error(`Failed to seed test database: ${response.data?.error || 'Unknown error'} (Status: ${response.status})`);
            }
            return response.data;
          });
        },
        
        async cleanupTestData() {
          return retryRequest(async () => {
            const response = await axios.post(`${config.env.apiUrl}/test-db/cleanup`);
            if (response.status !== 200) {
              throw new Error(`Failed to cleanup test data: ${response.data?.error || 'Unknown error'} (Status: ${response.status})`);
            }
            return response.data;
          });
        }
      });
    }
  }
});