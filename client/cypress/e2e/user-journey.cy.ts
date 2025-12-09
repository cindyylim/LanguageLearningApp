describe("Complete User Journey", () => {
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
    cy.visit("/");
  });

  after(() => {
    // Clean up test data after all tests run
    cy.task("cleanupTestData").then((result) => {
      cy.log("Test data cleaned up successfully");
    });
  });
  it("should handle user session persistence", () => {
    // Login as test user
    cy.loginAsTestUser("test");
    cy.url().should("include", "/dashboard");

    // Navigate to vocabulary and verify user data
    cy.visit("/vocabulary");
    cy.get(".vocabulary-list").should("contain", "French Basics");

    // Refresh the page to test session persistence
    cy.reload();

    // Verify user is still logged in
    cy.url().should("include", "/vocabulary");
    cy.get(".vocabulary-list").should("contain", "French Basics");

    cy.visit("/analytics");
    cy.get(".learning-stats").should("be.visible");
  });
});
