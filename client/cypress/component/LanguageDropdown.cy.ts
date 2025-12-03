import LanguageDropdown from '../src/components/LanguageDropdown';

describe('LanguageDropdown Component', () => {
  it('should render language options', () => {
    const languages = [
      { code: 'en', name: 'English' },
      { code: 'es', name: 'Spanish' },
      { code: 'fr', name: 'French' }
    ];
    
    cy.mount(
      <LanguageDropdown
        languages={languages}
        selectedLanguage="en"
        onLanguageChange={cy.stub()}
      />
    );
    
    cy.get('[data-testid="language-dropdown"]').should('be.visible');
    cy.get('[data-testid="language-dropdown"]').should('contain', 'English');
    cy.get('[data-testid="language-dropdown"]').should('contain', 'Spanish');
    cy.get('[data-testid="language-dropdown"]').should('contain', 'French');
  });

  it('should call onLanguageChange when language is selected', () => {
    const onLanguageChange = cy.stub();
    
    cy.mount(
      <LanguageDropdown
        languages={[{ code: 'es', name: 'Spanish' }]}
        selectedLanguage="en"
        onLanguageChange={onLanguageChange}
      />
    );
    
    cy.get('[data-testid="language-dropdown"]').click();
    cy.get('[data-testid="language-option-Spanish"]').click();
    
    cy.wrap(onLanguageChange).should('have.been.calledWith', 'es');
  });

  it('should show selected language as active', () => {
    cy.mount(
      <LanguageDropdown
        languages={[{ code: 'fr', name: 'French' }]}
        selectedLanguage="fr"
        onLanguageChange={cy.stub()}
      />
    );
    
    cy.get('[data-testid="language-option-French"]').should('have.class', 'active');
  });
});