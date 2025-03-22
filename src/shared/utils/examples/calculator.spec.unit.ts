import { Calculator } from './calculator';

describe('Calculator (Unit)', () => {
  let calculator: Calculator;

  beforeEach(() => {
    // Arrange
    calculator = new Calculator();
  });

  describe('add', () => {
    it('should add two positive numbers correctly', () => {
      // Act
      const result = calculator.add(2, 3);
      
      // Assert
      expect(result).toBe(5);
    });

    it('should handle negative numbers correctly', () => {
      // Act
      const result = calculator.add(-2, -3);
      
      // Assert
      expect(result).toBe(-5);
    });
  });

  describe('divide', () => {
    it('should divide two numbers correctly', () => {
      // Act
      const result = calculator.divide(10, 2);
      
      // Assert
      expect(result).toBe(5);
    });

    it('should throw an error when dividing by zero', () => {
      // Act & Assert
      expect(() => calculator.divide(10, 0)).toThrow('Division by zero is not allowed');
    });
  });
}); 