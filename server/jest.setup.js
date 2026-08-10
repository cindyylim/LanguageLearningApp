process.env.NODE_ENV = 'test';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-openai-api-key';
process.env.OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
process.env.OPENAI_MODERATION_MODEL =
  process.env.OPENAI_MODERATION_MODEL || 'omni-moderation-latest';
process.env.MODERATION_SCORE_THRESHOLD =
  process.env.MODERATION_SCORE_THRESHOLD || '0.1';
process.env.MONGODB_URI =
  process.env.MONGODB_URI || 'mongodb://localhost:27017/language-learning-test';
process.env.TESTDB_URI =
  process.env.TESTDB_URI || 'mongodb://localhost:27017/language-learning-test';
process.env.FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
