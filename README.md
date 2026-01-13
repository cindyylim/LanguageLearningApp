# Language Learning Quiz Generator

An AI-powered language learning application that generates personalized quizzes using Google Gemini for adaptive learning experiences.
Deployed with Render. Link: https://languagelearningapp-z0ca.onrender.com/login

## Demo
![Untitled design](https://github.com/user-attachments/assets/8bed62e6-23a9-42ea-86bf-b7406bce4ded)


## Features

- 🤖 **AI-Powered Question Generation**: Uses Google Gemini to create contextual questions from vocabulary lists
- 📝 **Contextual Sentences**: Generates real-world usage examples for vocabulary
- 📊 **Text Analysis**: Google Gemini integration for advanced text processing
- 🎯 **Multiple Question Types**: Multiple choice, fill-in-the-blank, sentence completion
- 📈 **Progress Tracking**: Detailed analytics and learning insights
- 🌍 **Multi-language Support**: Support for various target languages
- ✨ **AI-Powered Vocabulary List Generation**: Instantly generate themed vocabulary lists using Google Gemini based on your chosen topic or keywords

## Tech Stack

- **Frontend**: React, TypeScript, Tailwind CSS
- **Backend**: Node.js, Express, TypeScript
- **AI Services**: Google Gemini API
- **Authentication**: JWT tokens

## Setup

### Prerequisites

- Node.js 18+ 
- npm or yarn
- Google Gemini API key

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd client
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cd server 
npm install
cp .env.example .env
```

4. Configure your environment variables in `.env`:
```
GOOGLE_AI_API_KEY=your_google_gemini_api_key
JWT_SECRET=your_jwt_secret
MONGODB_URI=
```

5. Start the development servers:
```bash
npm run dev
```

The app will be available at:
- Frontend: http://localhost:3000
- Backend API: http://localhost:5000

## Usage

1. **Create Vocabulary Lists**: Add words and phrases you want to learn
2. **Generate Vocabulary Lists with AI**: Instantly create a new vocabulary list by providing a topic or keywords and letting AI generate relevant words for you
3. **Generate Quizzes**: Use AI to create contextual questions
4. **Practice**: Take quizzes with selected difficulty
5. **Track Progress**: Monitor your learning journey with detailed analytics
6. **Review**: Use spaced repetition to optimize retention


## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request
