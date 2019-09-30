module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testPathIgnorePatterns: [
    '<rootDir>/node_modules/',
    '<rootDir>/build/',
    '<rootDir>/anon/',
    '<rootDir>/ps/',
    '<rootDir>/stats/',
  ],
};
