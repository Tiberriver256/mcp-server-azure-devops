## Current Tasks In Progress

### Migrate from Testing Pyramid to Testing Trophy

#### Background
The current project relies heavily on unit tests and code coverage metrics, which have proven to be costly to maintain while not preventing bugs effectively. This initiative will transform our testing approach from the outdated Testing Pyramid to the more effective Testing Trophy approach.

#### Objective
Implement the Testing Trophy approach to deliver higher confidence in our software with less testing effort, focusing on tests that better represent how our software is actually used.

#### References
- [The Testing Trophy and Testing Classifications](https://kentcdodds.com/blog/the-testing-trophy-and-testing-classifications) by Kent C. Dodds
- [Testing of Microservices](https://engineering.atspotify.com/2018/01/testing-of-microservices/) (Testing Honeycomb approach) by Spotify Engineering

#### Key Principles
1. "The more your tests resemble the way your software is used, the more confidence they can give you." - Kent C. Dodds
2. Focus on testing behavior and interfaces rather than implementation details
3. Maximize return on investment where "return" is confidence and "investment" is time
4. Use arrange/act/assert pattern for all tests

#### Test File Naming Convention
- `*.spec.unit.ts` - For minimal unit tests (essential logic only)
- `*.spec.int.ts` - For integration tests (main focus)
- `*.spec.e2e.ts` - For end-to-end tests

#### Implementation Plan

##### Phase 1: Delete All Existing Tests (1 day)
- [x] Delete all existing test files (`*.test.ts`) in both `src` and `tests` directories
- [x] Remove coverage thresholds from Jest configuration

##### Phase 2: Configure Testing Infrastructure (2 days)
- [x] Create separate Jest configurations for each test type:
  - `jest.unit.config.js` - For unit tests
  - `jest.int.config.js` - For integration tests
  - `jest.e2e.config.js` - For end-to-end tests
- [x] Update package.json scripts for the new test types
- [x] Update CI/CD pipeline to use new test commands
- [x] Ensure TypeScript and ESLint are properly configured for static analysis
- [x] Document our new testing strategy in docs. Use `project-management/reference/awesome-docs-example.xml` as an example

##### Phase 3: Feature-by-Feature Implementation (2 weeks)
For each feature slice in our Feature Sliced Design architecture:
- [x] Co-locate tests with the features they test
- [ ] Identify critical interfaces and integration points
- [ ] Design and implement integration tests focusing on behavior
- [ ] Add minimal unit tests only for complex business logic
- [ ] Implement E2E tests for critical user journeys
- [x] Follow arrange/act/assert pattern in all tests

##### Phase 4: Optimization (1 week)
- [ ] Review test execution times and optimize slow tests
- [ ] Create reusable test fixtures and utilities
- [ ] Document the new testing approach in README.md
- [x] Create example tests for each type as reference

#### Expected Outcomes
- Significantly reduced test suite size
- Faster feedback cycles during development
- Higher confidence in software quality
- Better alignment with Feature Sliced Design architecture
- More bugs caught before reaching production

