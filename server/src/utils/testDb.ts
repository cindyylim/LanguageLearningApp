import { connectToTestDatabase } from './testMongo';
import bcrypt from 'bcryptjs';

// Test user data that will be used for seeding the database
export const testUsers = [
  {
    name: 'Test User',
    email: 'test@example.com',
    password: 'test123#',
    nativeLanguage: 'en',
    targetLanguage: 'fr',
    proficiencyLevel: 'beginner' as const
  }
];

// Test vocabulary lists
export const testVocabularyLists = [
  {
    name: 'French Basics',
    description: 'Basic French words for beginners',
    targetLanguage: 'fr',
    nativeLanguage: 'en',
    words: [
      { word: 'bonjour', translation: 'hello' },
      { word: 'merci', translation: 'thank you' },
      { word: 'au revoir', translation: 'goodbye' },
      { word: 'oui', translation: 'yes' },
      { word: 'non', translation: 'no' }
    ]
  },
  {
    name: 'Spanish Essentials',
    description: 'Essential Spanish phrases',
    targetLanguage: 'es',
    nativeLanguage: 'en',
    words: [
      { word: 'hola', translation: 'hello' },
      { word: 'gracias', translation: 'thank you' },
      { word: 'adiós', translation: 'goodbye' },
      { word: 'por favor', translation: 'please' },
      { word: 'lo siento', translation: 'sorry' }
    ]
  }
];

/**
 * Seed the database with test users and vocabulary lists
 * This function is designed to be idempotent - it will only create data
 * that doesn't already exist
 */
export async function seedTestDatabase() {
  const db = await connectToTestDatabase();
  
  try {
    // Seed test users
    for (const userData of testUsers) {
      const existingUser = await db.collection('User').findOne({ email: userData.email });
      
      if (!existingUser) {
        const hashedPassword = await bcrypt.hash(userData.password, 12);
        const userDoc = {
          ...userData,
          password: hashedPassword,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        
        await db.collection('User').insertOne(userDoc);
        console.log(`Created test user: ${userData.email}`);
      }
    }
    
    // Get the test user IDs for vocabulary creation
    const testUser = await db.collection('User').findOne({ email: 'test@example.com' });
    
    if (testUser) {
      // Seed vocabulary lists for test user
      for (const vocabData of testVocabularyLists) {
        const existingList = await db.collection('VocabularyList').findOne({
          name: vocabData.name,
          userId: testUser._id.toString()
        });
        
        if (!existingList) {
          const vocabDoc = {
            name: vocabData.name,
            description: vocabData.description,
            targetLanguage: vocabData.targetLanguage,
            nativeLanguage: vocabData.nativeLanguage,
            userId: testUser._id.toString(),
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          
          const result = await db.collection('VocabularyList').insertOne(vocabDoc);
          
          // Add words to the vocabulary list
          for (const wordData of vocabData.words) {
            await db.collection('Word').insertOne({
              ...wordData,
              vocabularyListId: result.insertedId,
              createdAt: new Date(),
              updatedAt: new Date(),
            });
          }
          
          console.log(`Created vocabulary list: ${vocabData.name}`);
        }
      }
    }
    
    console.log('Test database seeded successfully');
  } catch (error: any) {
    console.error('Error seeding test database:', error);
    throw new Error(`Failed to seed test database: ${error?.message || error}`);
  }
}

/**
 * Clean up test data from the database
 * This removes all users with test email addresses and their associated data
 */
export async function cleanupTestData() {
  const db = await connectToTestDatabase();
  
  try {
    // Get all test users
    const testEmails = testUsers.map(user => user.email);
    const testUsersCursor = await db.collection('User').find({ 
      email: { $in: testEmails } 
    });

    const testUserDocs = await testUsersCursor.toArray();
    const testUserIds = testUserDocs.map(user => user._id.toString());
    if (testUserIds.length === 0) {
      console.log('No test users found to clean up');
      return;
    }
    
    // Delete vocabulary lists and words for test users
    const vocabLists = await db.collection('VocabularyList').find({
      userId: { $in: testUserIds }
    }).toArray();
    
    const vocabListIds = vocabLists.map(list => list._id.toString());
    if (vocabListIds.length > 0) {
      // Delete words in these vocabulary lists
      await db.collection('Word').deleteMany({
        listId: { $in: vocabListIds }
      });
      
      // Delete the vocabulary lists
      await db.collection('VocabularyList').deleteMany({
        userId: { $in: testUserIds }
      });
    }
    
    // Delete quiz attempts and progress for test users
    await db.collection('QuizAttempt').deleteMany({
      userId: { $in: testUserIds }
    });
    
    await db.collection('WordProgress').deleteMany({
      userId: { $in: testUserIds }
    });
    
    // Delete the test users
    await db.collection('User').deleteMany({
      email: { $in: testEmails }
    });
    
    console.log(`Cleaned up ${testUserIds.length} test users and their associated data`);
  } catch (error: any) {
    console.error('Error cleaning up test data:', error);
    throw new Error(`Failed to cleanup test data: ${error?.message || error}`);
  }
}

/**
 * Reset the test database by cleaning up and re-seeding
 */
export async function resetTestDatabase() {
  await cleanupTestData();
  await seedTestDatabase();
}