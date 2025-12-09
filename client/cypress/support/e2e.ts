import "./commands";
import "./tasks";

// Add global error handling
Cypress.on("uncaught:exception", (err: any, runnable: any) => {
  // Prevent Cypress from failing on uncaught exceptions
  // that are not critical to test
  if (err.message.includes("ResizeObserver loop limit exceeded")) {
    return false;
  }
  return true;
});
