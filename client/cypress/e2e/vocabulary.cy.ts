describe("Vocabulary Management", () => {
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

  it("should display seeded vocabulary lists", () => {
    cy.visit("/vocabulary");
    // Check for the seeded vocabulary list
    cy.get(".vocabulary-list").should("contain", "French Basics");
    cy.get(".vocabulary-list").should(
      "contain",
      "Basic French words for beginners"
    );
  });

  it("should create a new vocabulary list", () => {
    cy.visit("/vocabulary");
    cy.contains('button', "Add New List").click();
    cy.get('input[name="name"]').type("Test French List");
    cy.get('input[name="description"]').type(
      "Test French words for automated testing"
    );
    cy.get('button[type="submit"]').click();
    cy.get(".vocabulary-list").should("contain", "Test French List");
    cy.get(".vocabulary-list").should(
      "contain",
      "Test French words for automated testing"
    );
  });

  it("should add words to a vocabulary list", () => {
    cy.createTestVocabularyList("Word Test List");
    cy.contains('div', 'Word Test List').first().click();

    // Verify words were added
    cy.get(".word-item").should("contain", "test1");
    cy.get(".word-item").should("contain", "test2");
    cy.get(".word-item").should("contain", "test3");
  });

  it("should edit a vocabulary list", () => {
    cy.createTestVocabularyList("Edit Test List");
    cy.contains('div', 'Edit Test List').first().click();
    cy.contains('button', "Edit List").first().click();
    cy.get('input[name="name"]').clear().type("Edited Test List");
    cy.get('button[type="submit"]').click();
    cy.visit('/vocabulary');
    cy.get(".vocabulary-list").should("contain", "Edited Test List");
  });

  it("should delete a vocabulary list", () => {
    cy.createTestVocabularyList("Delete Test List");
    cy.contains('div', 'Delete Test List').first().click();
    cy.contains('button', "Delete List").first().click();
    cy.contains('button[class="btn-danger flex-1"]', "Delete").click();
    cy.get(".vocabulary-list").should("not.contain", "Delete Test List");
  });

  it("should view vocabulary list details", () => {
    cy.visit("/vocabulary");
    // Find the seeded French Basics list
    cy.contains('div', "French Basics").first().click();

    cy.url().should("include", "/vocabulary/");
    cy.get("h1").should("contain", "French Basics");
    // Check for seeded words
    cy.get(".word-item").should("contain", "bonjour");
    cy.get(".word-item").should("contain", "merci");
    cy.get(".word-item").should("contain", "au revoir");
    cy.get(".word-item").should("contain", "oui");
    cy.get(".word-item").should("contain", "non");
  });
});
