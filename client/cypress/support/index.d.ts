/// <reference types="cypress" />

declare namespace Cypress {
  interface Chainable {
      /**
       * Custom command to login with credentials
       * @example cy.login('test@example.com', 'password123')
       */
      login(email: string, password: string): void;
      
      /**
       * Custom command to register a new user
       * @example cy.register('John Doe', 'john@example.com', 'password123')
       */
      register(name: string, email: string, password: string): void;
      
      /**
       * Custom command to create a vocabulary list
       * @example cy.createVocabularyList('French Basics', 'Basic French words')
       */
      createVocabularyList(name: string, description?: string): void;
      
      /**
       * Custom command to add a word to a vocabulary list
       * @example cy.addWordToList('bonjour', 'hello', 'noun')
       */
      addWordToList(word: string, translation: string, partOfSpeech: string): void;
      
      /**
       * Custom command to start a quiz
       * @example cy.startQuiz('french-basics')
       */
      startQuiz(listId: string): void;
      
      /**
       * Custom command to answer a quiz question
       * @example cy.answerQuizQuestion('bonjour', 'hello')
       */
      answerQuizQuestion(answer: string): void;
      
      /**
       * Custom command to seed the test database
       * @example cy.seedTestDb()
       */
      seedTestDb(): void;
      
      /**
       * Custom command to clean up test data
       * @example cy.cleanupTestData()
       */
      cleanupTestData(): void;
      
      /**
       * Custom command to reset the test database
       * @example cy.resetTestDb()
       */
      resetTestDb(): void;
      
      /**
       * Custom command to login as a test user
       * @example cy.loginAsTestUser('test')
       */
      loginAsTestUser(userType?: 'test' | 'advanced' | 'spanish'): void;
      
      /**
       * Custom command to create a test vocabulary list
       * @example cy.createTestVocabularyList('Test List')
       */
      createTestVocabularyList(listName?: string): Chainable<Element>;
  }
}