import { CalculatorApp } from './calculator-app';

/**
 * E2E test for a calculator workflow
 * 
 * This test simulates a complete user flow using the calculator app,
 * similar to how a user might interact with it in a real application.
 * 
 * In a real application, E2E tests would typically use tools like Puppeteer
 * or Cypress to test the UI interaction, but for this example we're simulating
 * the workflow programmatically.
 */
describe('Calculator Workflow (E2E)', () => {
  let calculatorApp: CalculatorApp;
  let results: string[] = [];

  beforeEach(() => {
    // Arrange - simulate setting up the application
    calculatorApp = new CalculatorApp();
    results = [];
  });

  it('should complete a sequence of operations correctly', () => {
    // Act - simulate a user performing a series of calculations
    
    // Step 1: User adds two numbers
    results.push(calculatorApp.performCalculation('add', 10, 5));
    
    // Step 2: User multiplies the result (15) by 2
    results.push(calculatorApp.performCalculation('multiply', 15, 2));
    
    // Step 3: User divides the result (30) by 6
    results.push(calculatorApp.performCalculation('divide', 30, 6));
    
    // Step 4: User subtracts 2 from the result (5)
    results.push(calculatorApp.performCalculation('subtract', 5, 2));
    
    // Assert - verify the entire workflow produced the expected results
    expect(results).toEqual([
      '10 + 5 = 15',
      '15 × 2 = 30',
      '30 ÷ 6 = 5',
      '5 - 2 = 3'
    ]);
  });

  it('should handle errors gracefully within a workflow', () => {
    // Act - simulate a user workflow that includes an error
    
    // Step 1: User multiplies two numbers
    results.push(calculatorApp.performCalculation('multiply', 8, 4));
    
    // Step 2: User attempts to divide by zero (error)
    results.push(calculatorApp.performCalculation('divide', 32, 0));
    
    // Step 3: User continues with a valid operation after the error
    results.push(calculatorApp.performCalculation('add', 10, 10));
    
    // Assert - verify the workflow shows the error but continues
    expect(results).toEqual([
      '8 × 4 = 32',
      'Error: Division by zero is not allowed',
      '10 + 10 = 20'
    ]);
  });
}); 