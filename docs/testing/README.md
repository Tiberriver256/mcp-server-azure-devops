# Testing Trophy Approach

## Overview

This project follows the Testing Trophy approach advocated by Kent C. Dodds instead of the traditional Testing Pyramid. The Testing Trophy emphasizes tests that provide higher confidence with less maintenance cost, focusing on how users actually interact with our software.

![Testing Trophy Diagram](https://res.cloudinary.com/kentcdodds-com/image/upload/f_auto,q_auto,w_1600/v1625032020/kentcdodds.com/blog/the-testing-trophy-and-testing-classifications/trophy_wx9aen.png)

## Key Principles

1. **"The more your tests resemble the way your software is used, the more confidence they can give you."** - Kent C. Dodds
2. Focus on testing behavior and interfaces rather than implementation details
3. Maximize return on investment where "return" is confidence and "investment" is time
4. Use arrange/act/assert pattern for all tests
5. Co-locate tests with the code they test following Feature Sliced Design

## Test Types

### Static Analysis (The Base)

- TypeScript for type checking
- ESLint for code quality and consistency
- Runtime type checking with Zod
- Formatter (Prettier)

These tools catch many issues before tests are even run and provide immediate feedback during development.

### Unit Tests (Small Layer)

- Located in `*.spec.unit.ts` files
- Co-located with the code they test
- Focus on testing complex business logic in isolation
- Minimal mocking where necessary
- Run with `npm run test:unit`

Unit tests should be used sparingly for complex logic that requires isolated testing. We don't aim for 100% coverage with unit tests.

### Integration Tests (Main Focus)

- Located in `*.spec.int.ts` files
- Co-located with the features they test
- Test how modules work together
- Focus on testing behavior, not implementation
- Run with `npm run test:int`

These provide the bulk of our test coverage and confidence. They verify that different parts of the system work together correctly.

### End-to-End Tests (Small Cap)

- Located in `*.spec.e2e.ts` files
- **Only exists at the server level** (e.g., `server.spec.e2e.ts`) where they use the MCP client
- Test complete user flows across the entire application
- Provide the highest confidence but are slower and more costly to maintain
- Run with `npm run test:e2e`

End-to-end tests should only be created for critical user journeys that span the entire application. They should use the MCP client from `@modelcontextprotocol/sdk` to test the server as a black box, similar to how real users would interact with it.

For testing interactions with external APIs like Azure DevOps, use integration tests (`*.spec.int.ts`) instead, which are co-located with the feature implementations.

## Test File Naming Convention

- `*.spec.unit.ts` - For minimal unit tests (essential logic only)
- `*.spec.int.ts` - For integration tests (main focus)
- `*.spec.e2e.ts` - For end-to-end tests

## Test Location

We co-locate unit and integration tests with the code they're testing following Feature Sliced Design principles:

```
src/
  features/
    feature-name/
      feature.ts
      feature.spec.unit.ts   # Unit tests
      feature.spec.int.ts    # Integration tests
```

E2E tests are only located at the server level since they test the full application:

```
src/
  server.ts
  server.spec.e2e.ts   # E2E tests using the MCP client
```

This way, tests stay close to the code they're testing, making it easier to:
- Find tests when working on a feature
- Understand the relationship between tests and code
- Refactor code and tests together
- Maintain consistency between implementations and tests

## The Arrange/Act/Assert Pattern

All tests should follow the Arrange/Act/Assert pattern:

```typescript
test('should do something', () => {
  // Arrange - set up the test
  const input = 'something';
  
  // Act - perform the action being tested
  const result = doSomething(input);
  
  // Assert - check that the action had the expected result
  expect(result).toBe('expected output');
});
```

## Running Tests

- Run all tests: `npm test`
- Run unit tests: `npm run test:unit`
- Run integration tests: `npm run test:int`
- Run E2E tests: `npm run test:e2e`

## CI/CD Integration

Our CI/CD pipeline runs all test levels to ensure code quality:

1. Static analysis with TypeScript and ESLint
2. Unit tests
3. Integration tests
4. End-to-end tests

## Best Practices

1. Focus on integration tests for the bulk of your test coverage
2. Write unit tests only for complex business logic
3. Avoid testing implementation details
4. Use real dependencies when possible rather than mocks
5. Keep E2E tests focused on critical user flows
6. Use the arrange/act/assert pattern consistently
7. Co-locate tests with the code they're testing

## References

- [The Testing Trophy and Testing Classifications](https://kentcdodds.com/blog/the-testing-trophy-and-testing-classifications) by Kent C. Dodds
- [Testing of Microservices](https://engineering.atspotify.com/2018/01/testing-of-microservices/) (Testing Honeycomb approach) by Spotify Engineering
- [Feature Sliced Design](https://feature-sliced.design/) for co-location of tests with feature implementations 