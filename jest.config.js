module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  coverageDirectory: 'coverage',
  coveragePathIgnorePatterns: ['/node_modules/', '/build/', '/src/test'],
};
