module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  moduleDirectories: ['node_modules', '<rootDir>'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  testTimeout: 30000,
};
