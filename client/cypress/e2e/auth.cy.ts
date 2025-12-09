describe("Authentication", () => {
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

  it("should allow user to register", () => {
    // Use a unique email for registration test to avoid conflicts
    const timestamp = Date.now();
    const uniqueEmail = `test-${timestamp}@example.com`;

    cy.visit("/register");
    cy.get('input[name="name"]').type("Test User");
    cy.get('input[name="email"]').type(uniqueEmail);
    cy.get('input[name="password"]').type("password123#");
    cy.get('input[name="reenterPassword"]').type("password123#");
    cy.get('button[type="submit"]').click();
    cy.url().should("include", "/dashboard");
    cy.get("body").should("contain", "Test User");

    // Clean up the unique user created during this test
    cy.task("deleteUserByEmail", uniqueEmail).then((result) => {
      cy.log(`Cleaned up test user: ${uniqueEmail}`);
    });
  });

  it("should allow user to login with seeded test user", () => {
    cy.loginAsTestUser("test");
    cy.url().should("include", "/dashboard");
    cy.get("body").should("contain", "Test User");
  });

  it("should allow user to logout", () => {
    cy.loginAsTestUser("test");
    cy.url().should("include", "/dashboard");
    cy.get('button:has(span:contains("Logout"))').click();
    cy.url().should("include", "/login");
    cy.get('button[type="submit"]').should("be.visible");
  });
});
