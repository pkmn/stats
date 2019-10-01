module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testPathIgnorePatterns: ['<rootDir>/node_modules/', '<rootDir>/build/'],
   globals: {
    'ts-jest': {
      isolatedModules: true
    }
  }
};
