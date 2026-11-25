/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      { tsconfig: '<rootDir>/tsconfig.jest.json', diagnostics: { ignoreCodes: [151002] } },
    ],
  },
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.spec.{unit,prop,diff}.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  collectCoverage: true,
  coverageDirectory: '<rootDir>/coverage',
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.spec.*.ts',
    '!src/**/__test__/**',
    '!src/shared/test/**',
    '!src/shared/types/**',
    '!src/**/types.ts',
  ],
  coverageReporters: ['text', 'lcov'],
  coverageThreshold: {
    global: {
      statements: 70,
      branches: 50,
      functions: 60,
      lines: 70,
    },
  },
  verbose: true,
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
};
