import { calculator } from './calculator';

/**
 * A simple calculator app that uses the calculator module.
 * This serves as an example of how components interact for integration testing.
 */
export class CalculatorApp {
  /**
   * Performs a calculation and returns the result as a formatted string
   */
  performCalculation(operation: 'add' | 'subtract' | 'multiply' | 'divide', a: number, b: number): string {
    try {
      let result: number;
      
      switch (operation) {
        case 'add':
          result = calculator.add(a, b);
          return `${a} + ${b} = ${result}`;
        case 'subtract':
          result = calculator.subtract(a, b);
          return `${a} - ${b} = ${result}`;
        case 'multiply':
          result = calculator.multiply(a, b);
          return `${a} × ${b} = ${result}`;
        case 'divide':
          result = calculator.divide(a, b);
          return `${a} ÷ ${b} = ${result}`;
        default:
          throw new Error('Unsupported operation');
      }
    } catch (error) {
      if (error instanceof Error) {
        return `Error: ${error.message}`;
      }
      return 'An unknown error occurred';
    }
  }
} 