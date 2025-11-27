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


## Demo
Home Page
<img width="1440" height="900" alt="Screenshot 2025-07-15 at 10 16 58 PM" src="https://github.com/user-attachments/assets/35165eae-71ae-47bd-ae40-b9e337b898da" />

Dashboard
<img width="1440" height="900" alt="Screenshot 2025-07-14 at 10 42 14 PM" src="https://github.com/user-attachments/assets/ce736fc7-5339-4342-84da-c424b63a37ab" />

Vocabulary <img width="1440" height="900" alt="Screenshot 2025-07-14 at 11 36 35 PM" src="https://github.com/user-attachments/assets/39971d84-a361-4c06-9a39-b9f39cc96218" />
<img width="1440" height="900" alt="Screenshot 2025-07-15 at 10 01 44 PM" src="https://github.com/user-attachments/assets/9eb19ea9-36ae-42e9-9d6d-c4fbb2d71942" />

Quiz
<img width="1440" height="900" alt="Screenshot 2025-07-14 at 10 39 14 PM" src="https://github.com/user-attachments/assets/6deee814-1e3f-4ec7-a8de-829b1ca3d34b" />

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request
