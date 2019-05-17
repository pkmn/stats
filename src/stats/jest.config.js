module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  coverageDirectory: 'coverage',
  coveragePathIgnorePatterns: ['<rootDir>/node_modules/', '<rootDir>/build/', '<rootDir>/src/test'],
  testPathIgnorePatterns: ['<rootDir>/node_modules/', '<rootDir>/build/'],
};
