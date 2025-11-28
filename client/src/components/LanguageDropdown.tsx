import React from 'react';

// 1. Define the language data array outside the component
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

// Define the type for the component's props
interface LanguageDropdownProps {
    // onCodeSelect is a function that takes a string (the code) and returns void (nothing)
    onCodeSelect: (code: string) => void; 
}

const LanguageDropdown: React.FC<LanguageDropdownProps> = ({ onCodeSelect }) => {
    const handleChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
        onCodeSelect(event.target.value)
    };

    return (
        <div>
            <select className="input-field"
                id="language-select"
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