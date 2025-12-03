describe("Quiz Management", () => {
  before(() => {
    // Seed the test database before all tests run
    cy.task("seedTestDb").then((result) => {
      cy.log("Test database seeded successfully");
    });
  });

  beforeEach(() => {
    // Clear localStorage before each test
    cy.clearLocalStorage();

    // Clear cookies before each test
    cy.clearCookies();
    cy.loginAsTestUser("test");

    cy.url().should("include", "/dashboard");
  });

  after(() => {
    // Clean up test data after all tests run
    cy.task("cleanupTestData").then((result) => {
      cy.log("Test data cleaned up successfully");
    });
  });

  it("should start a quiz from seeded vocabulary list", () => {
    cy.visit("/quizzes");
    cy.intercept('POST', '**/api/quizzes/generate').as('generateQuiz'); 

    cy.contains('button', "Generate New Quiz").click(); 
    cy.get('select[class="input-field"]').first().select("French Basics");
    cy.get('button[type="submit"]').click();

    cy.wait('@generateQuiz', { timeout: 60000 });
    cy.contains('div', 'Quiz: French Basics').should("be.visible");
    cy.contains('div', 'Quiz: French Basics').click();

    cy.get(".quiz-question").should("be.visible");
    cy.contains('button', "Submit").click();

    cy.get(".quiz-results").should("be.visible");
    cy.get(".quiz-score").should("contain", "Score: 0%");
    // Navigate to analytics to view progress
    cy.visit("/analytics");
    // Verify learning statistics
    cy.get(".learning-stats").should("be.visible");
    cy.get(".words-learned").should("contain", "5");
  });
});
