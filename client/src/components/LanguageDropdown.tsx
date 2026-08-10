import React from 'react';

const languages = [
    { code: 'en', name: 'English' },
    { code: 'es', name: 'Spanish' },
    { code: 'fr', name: 'French' },
    { code: 'de', name: 'German' },
    { code: 'it', name: 'Italian' },
    { code: 'pt', name: 'Portuguese' },
    { code: 'ru', name: 'Russian' },
    { code: 'ja', name: 'Japanese' },
    { code: 'ko', name: 'Korean' },
    { code: 'zh', name: 'Chinese' },
    { code: 'ar', name: 'Arabic' },
    { code: 'hi', name: 'Hindi' },
    { code: 'nl', name: 'Dutch' },
    { code: 'sv', name: 'Swedish' },
    { code: 'no', name: 'Norwegian' },
    { code: 'da', name: 'Danish' },
    { code: 'fi', name: 'Finnish' },
    { code: 'pl', name: 'Polish' },
    { code: 'tr', name: 'Turkish' },
    { code: 'he', name: 'Hebrew' }
];

interface LanguageDropdownProps {
    name: string;
    onCodeSelect: (code: string) => void; 
    value?: string;
}

const LanguageDropdown: React.FC<LanguageDropdownProps> = ({ name, onCodeSelect, value }) => {
    const handleChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
        onCodeSelect(event.target.value)
    };

    return (
        <div>
            <select className="input-field"
                id={`language-select-${name}`}
                name={name}
                value={value ?? ''}
                onChange={handleChange} 
            >
                {/* Default option */}
                <option value="" disabled>
                    Select a language...
                </option>
                
                {languages.map((lang) => (
                    <option key={lang.code} value={lang.code}>
                        {lang.name}
                    </option>
                ))}
            </select>
        </div>
    );
};

export default LanguageDropdown;