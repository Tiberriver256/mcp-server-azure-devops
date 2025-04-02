import { searchWiki } from './feature';

// Mock the dependencies
jest.mock('azure-devops-node-api');
jest.mock('axios');

describe('searchWiki', () => {
  it('should be defined', () => {
    expect(searchWiki).toBeDefined();
  });
});