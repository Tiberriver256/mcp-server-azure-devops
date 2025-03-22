import { CalculatorApp } from './calculator-app';

/**
 * Integration test for CalculatorApp class
 * 
 * This test focuses on testing the behavior of the CalculatorApp 
 * rather than implementation details. It verifies that the app
 * correctly integrates with the Calculator module and produces 
 * the expected outputs.
 */
describe('CalculatorApp (Integration)', () => {
  let calculatorApp: CalculatorApp;

  beforeEach(() => {
    // Arrange
    calculatorApp = new CalculatorApp();
  });

  describe('performCalculation', () => {
    it('should correctly format addition operations', () => {
      // Act
      const result = calculatorApp.performCalculation('add', 5, 3);
      
      // Assert
      expect(result).toBe('5 + 3 = 8');
    });

    it('should correctly format subtraction operations', () => {
      // Act
      const result = calculatorApp.performCalculation('subtract', 10, 4);
      
      // Assert
      expect(result).toBe('10 - 4 = 6');
    });

    it('should correctly format multiplication operations', () => {
      // Act
      const result = calculatorApp.performCalculation('multiply', 6, 7);
      
      // Assert
      expect(result).toBe('6 × 7 = 42');
    });

    it('should correctly format division operations', () => {
      // Act
      const result = calculatorApp.performCalculation('divide', 20, 5);
      
      // Assert
      expect(result).toBe('20 ÷ 5 = 4');
    });

    it('should handle division by zero errors', () => {
      // Act
      const result = calculatorApp.performCalculation('divide', 10, 0);
      
      // Assert
      expect(result).toBe('Error: Division by zero is not allowed');
    });
  });
}); 