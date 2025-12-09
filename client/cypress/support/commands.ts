// Custom Cypress commands for the language learning app

// Login command
Cypress.Commands.add('login', (email: string, password: string) => {
  cy.visit('/login');
  cy.get('input[name="email"]').type(email);
  cy.get('input[name="password"]').type(password);
  cy.get('button[type="submit"]').click();
  cy.url().should('not.include', '/login');
});

// Register command
Cypress.Commands.add('register', (name: string, email: string, password: string) => {
  cy.visit('/register');
  cy.get('input[name="name"]').type(name);
  cy.get('input[name="email"]').type(email);
  cy.get('input[name="password"]').type(password);
  cy.get('input[name="reenterPassword"]').type(password);
  cy.get('button[type="submit"]').click();
  cy.url().should('not.include', '/register');
});

// Create vocabulary list command
Cypress.Commands.add('createVocabularyList', (name: string, description?: string) => {
  cy.visit('/vocabulary');
  cy.get('button:contains("Add New List")').click();
  cy.get('input[name="name"]').type(name);
  if (description) {
    cy.get('input[name="description"]').type(description);
  }
  cy.get('button[type="submit"]').click();
  cy.get('.vocabulary-list').should('contain', name);
});

// Add word to list command
Cypress.Commands.add('addWordToList', (word: string, translation: string, partOfSpeech: string) => {
  cy.contains('button', '+ Add Word').click();
  cy.get('input[name="word"]').type(word);
  cy.get('input[name="translation"]').type(translation);
  cy.get('input[name="partOfSpeech"]').type(partOfSpeech);
  cy.get('button[type="submit"]').click();
  cy.get('.word-item').should('contain', word);
});

// Start quiz command
Cypress.Commands.add('startQuiz', (listId: string) => {
  cy.visit(`/quizzes/${listId}`);
  cy.get('div:contains("Questions")').click();
  cy.get('.quiz-question').should('be.visible');
});

// Answer quiz question command
Cypress.Commands.add('answerQuizQuestion', (answer: string) => {
  cy.get('input[name="answer"]').type(answer);
  cy.get('button:contains("Submit")').click();
});