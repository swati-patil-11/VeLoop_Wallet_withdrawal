process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
process.env.JWT_SECRET = 'test_jwt_secret_key_1234567890';
process.env.RATE_LIMIT_WITHDRAWAL_MAX = '5';
process.env.RATE_LIMIT_WITHDRAWAL_WINDOW_MS = '60000';

const { MongoMemoryReplSet } = require('mongodb-memory-server');
const mongoose = require('mongoose');

let replSet;

// Set default test timeout for replica set spin-up
jest.setTimeout(60000);

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger' }
  });

  const uri = replSet.getUri();
  await mongoose.connect(uri, { autoIndex: true });
});

afterAll(async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  if (replSet) {
    await replSet.stop();
  }
});

afterEach(async () => {
  // Clean collections between tests
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
});

module.exports = {
  getReplSet: () => replSet
};
