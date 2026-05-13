import { InvalidArgumentError } from "commander";

export function createPositiveIntParser(name: string, max: number): (value: string) => number {
  return (value: string): number => {
    const parsed = parseInt(value, 10);
    if (Number.isNaN(parsed) || parsed <= 0) {
      throw new InvalidArgumentError(`${name} must be a positive integer.`);
    }
    if (parsed > max) {
      throw new InvalidArgumentError(`${name} must be at most ${max} (got ${parsed}).`);
    }
    return parsed;
  };
}

export function createNonNegativeIntParser(name: string, max: number): (value: string) => number {
  return (value: string): number => {
    const parsed = parseInt(value, 10);
    if (Number.isNaN(parsed) || parsed < 0) {
      throw new InvalidArgumentError(`${name} must be a non-negative integer.`);
    }
    if (parsed > max) {
      throw new InvalidArgumentError(`${name} must be at most ${max} (got ${parsed}).`);
    }
    return parsed;
  };
}
