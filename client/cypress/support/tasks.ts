// Cypress tasks for database management during testing

/**
 * Task to seed the test database with predefined users and vocabulary lists
 */
export const seedTestDb = {
  seedTestDb: () => {
    return cy.task('connect', {
      method: 'POST',
      url: `${Cypress.env('apiUrl')}/test-db/seed`,
      body: {}
    }).then((response: any) => {
      if (response.status !== 200) {
        throw new Error(`Failed to seed test database: ${response.body?.error || 'Unknown error'}`);
      }
      return response.body;
    });
  }
};

/**
 * Task to clean up test data from the database
 */
export const cleanupTestData = {
  cleanupTestData: () => {
    return cy.task('connect', {
      method: 'POST',
      url: `${Cypress.env('apiUrl')}/test-db/cleanup`,
      body: {}
    }).then((response: any) => {
      if (response.status !== 200) {
        throw new Error(`Failed to cleanup test data: ${response.body?.error || 'Unknown error'}`);
      }
      return response.body;
    });
  }
};

/**
 * Task to reset the test database (cleanup + seed)
 */
export const resetTestDb = {
  resetTestDb: () => {
    return cy.task('connect', {
      method: 'POST',
      url: `${Cypress.env('apiUrl')}/test-db/reset`,
      body: {}
    }).then((response: any) => {
      if (response.status !== 200) {
        throw new Error(`Failed to reset test database: ${response.body?.error || 'Unknown error'}`);
      }
      return response.body;
    });
  }
};

/**
 * Custom Cypress command to seed the database
 */
Cypress.Commands.add('seedTestDb', () => {
  cy.request({
    method: 'POST',
    url: `${Cypress.env('apiUrl')}/test-db/seed`,
    failOnStatusCode: false
  }).then((response) => {
    if (response.status !== 200) {
      throw new Error(`Failed to seed test database: ${response.body?.error || 'Unknown error'}`);
    }
    return response.body;
  });
});

/**
 * Custom Cypress command to clean up test data
 */
Cypress.Commands.add('cleanupTestData', () => {
  cy.request({
    method: 'POST',
    url: `${Cypress.env('apiUrl')}/test-db/cleanup`,
    failOnStatusCode: false
  }).then((response) => {
    if (response.status !== 200) {
      throw new Error(`Failed to cleanup test data: ${response.body?.error || 'Unknown error'}`);
    }
    return response.body;
  });
});

/**
 * Custom Cypress command to reset the test database
 */
Cypress.Commands.add('resetTestDb', () => {
  cy.request({
    method: 'POST',
    url: `${Cypress.env('apiUrl')}/test-db/reset`,
    failOnStatusCode: false
  }).then((response) => {
    if (response.status !== 200) {
      throw new Error(`Failed to reset test database: ${response.body?.error || 'Unknown error'}`);
    }
    return response.body;
  });
});

/**
 * Custom Cypress command to login as a test user
 * This uses the predefined test users from the seeded database
 */
Cypress.Commands.add('loginAsTestUser', (userType: 'test' | 'advanced' | 'spanish' = 'test') => {
  const testUsers = {
    test: {
      email: 'test@example.com',
      password: 'test123#',
      name: 'Test User'
    },
    advanced: {
      email: 'advanced@example.com',
      password: 'advanced123#',
      name: 'Advanced User'
    },
    spanish: {
      email: 'spanish@example.com',
      password: 'spanish123#',
      name: 'Spanish Learner'
    }
  };

  const user = testUsers[userType];
  
  cy.visit('/login');
  cy.get('input[name="email"]').type(user.email);
  cy.get('input[name="password"]').type(user.password);
  cy.get('button[type="submit"]').click();
  cy.url().should('not.include', '/login');
  
  // Store user info for later use
  cy.wrap(user).as('currentUser');
});

/**
 * Custom Cypress command to create a test vocabulary list
 * This creates a vocabulary list with predefined words for testing
 */
Cypress.Commands.add('createTestVocabularyList', (listName?: string) => {
  const defaultListName = listName || 'Test Vocabulary List';
  
  cy.visit('/vocabulary');
  cy.get('button:contains("Add New List")').click();
  cy.get('input[name="name"]').type(defaultListName);
  cy.get('input[name="description"]').type('Test vocabulary list for automated testing');
  cy.get('button[type="submit"]').click();
  cy.get('.vocabulary-list').should('contain', defaultListName);
  
  // Add some test words
  const testWords = [
    { word: 'test1', translation: 'translation1', partOfSpeech: 'noun'},
    { word: 'test2', translation: 'translation2', partOfSpeech: 'verb' },
    { word: 'test3', translation: 'translation3', partOfSpeech: 'adjective' }
  ];
  
  testWords.forEach(({ word, translation, partOfSpeech }) => {
    cy.contains('button', '+ Add Word').click();
    cy.get('input[name="word"]').type(word);
    cy.get('input[name="translation"]').type(translation);
    cy.get('input[name="partOfSpeech"]').type(partOfSpeech);
    cy.get('button[type="submit"]').click();
  });
});