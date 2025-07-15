# Language Learning Quiz Generator

An AI-powered language learning application that generates personalized quizzes using Google Gemini for adaptive learning experiences.
Deployed with Render. Link: https://languagelearningapp-z0ca.onrender.com/login
## Features

- 🤖 **AI-Powered Question Generation**: Uses Google Gemini to create contextual questions from vocabulary lists
- 📝 **Contextual Sentences**: Generates real-world usage examples for vocabulary
- 🧠 **Adaptive Difficulty**: AI algorithms adjust question difficulty based on user performance
- 🔄 **Spaced Repetition**: Optimizes learning intervals using AI-powered algorithms
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
cd client
npm start
```

The app will be available at:
- Frontend: http://localhost:3000
- Backend API: http://localhost:5000

## Usage

1. **Create Vocabulary Lists**: Add words and phrases you want to learn
2. **Generate Vocabulary Lists with AI**: Instantly create a new vocabulary list by providing a topic or keywords and letting AI generate relevant words for you
3. **Generate Quizzes**: Use AI to create contextual questions
4. **Practice**: Take quizzes with adaptive difficulty
5. **Track Progress**: Monitor your learning journey with detailed analytics
6. **Review**: Use spaced repetition to optimize retention

## API Endpoints

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login

### Vocabulary
- `GET /api/vocabulary` - Get user's vocabulary lists
- `POST /api/vocabulary` - Create new vocabulary list
- `PUT /api/vocabulary/:id` - Update vocabulary list
- `DELETE /api/vocabulary/:id` - Delete vocabulary list
- `POST /api/vocabulary/generate-ai-list` - Generate a new vocabulary list using AI (provide name, description, targetLanguage, nativeLanguage, prompt, and wordCount)

### Quizzes
- `POST /api/quizzes/generate` - Generate AI-powered quiz
- `GET /api/quizzes` - Get user's quizzes
- `POST /api/quizzes/:id/submit` - Submit quiz answers
- `GET /api/quizzes/:id/results` - Get quiz results

### Analytics
- `GET /api/analytics/progress` - Get learning progress
- `GET /api/analytics/recommendations` - Get AI recommendations

## Demo
Dashboard
<img width="1440" height="900" alt="Screenshot 2025-07-14 at 10 42 14 PM" src="https://github.com/user-attachments/assets/ce736fc7-5339-4342-84da-c424b63a37ab" />

Vocabulary 
<img width="1440" height="900" alt="Screenshot 2025-07-14 at 10 39 03 PM" src="https://github.com/user-attachments/assets/cc4d82e1-01eb-40bc-a015-1e6c6b783ba0" />
Quiz
<img width="1440" height="900" alt="Screenshot 2025-07-14 at 10 39 14 PM" src="https://github.com/user-attachments/assets/6deee814-1e3f-4ec7-a8de-829b1ca3d34b" />

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request
