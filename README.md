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
<img width="1440" height="900" alt="Screenshot 2025-07-15 at 10 16 58 PM" src="https://github.com/user-attachments/assets/73684da1-7aa0-4c1b-86b7-365122576247" />
Dashboard
<img width="1440" height="900" alt="Screenshot 2025-11-27 at 7 12 27 PM" src="https://github.com/user-attachments/assets/bb999f1e-b67d-4c68-9cfb-eda6507e2dbd" />


Vocabulary
<img width="1440" height="900" alt="Screenshot 2025-11-27 at 7 10 45 PM" src="https://github.com/user-attachments/assets/95281636-beeb-4d7c-ad1a-534649bd3a66" />
<img width="1440" height="900" alt="Screenshot 2025-11-27 at 7 10 51 PM" src="https://github.com/user-attachments/assets/3d1e4148-4e22-4031-9be6-b2fc1402d8a1" />
Quizzes
<img width="1440" height="900" alt="Screenshot 2025-11-27 at 7 11 09 PM" src="https://github.com/user-attachments/assets/5672db9a-4611-42f9-a9c0-46918d3d1a8d" />
Analytics
<img width="1440" height="900" alt="Screenshot 2025-11-27 at 7 12 34 PM" src="https://github.com/user-attachments/assets/6cd6959f-349d-4331-baaf-fb32c5ba5044" />


## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request
