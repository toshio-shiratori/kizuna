/**
 * Parses relative date strings (e.g., "7d", "1w", "1m") into ISO 8601 date strings.
 * Also passes through ISO 8601 date strings unchanged.
 */

const RELATIVE_PATTERN = /^(\d+)([dwm])$/;

/**
 * Parse a relative duration string and return a Date offset from `now`.
 *
 * Supported suffixes:
 * - `d` = days
 * - `w` = weeks
 * - `m` = months (calendar months)
 *
 * Examples: "7d" = 7 days ago, "1w" = 1 week ago, "1m" = 1 month ago
 */
export function parseRelativeDate(input: string, now: Date = new Date()): Date {
  const match = RELATIVE_PATTERN.exec(input);
  if (!match) {
    throw new Error(
      `Invalid relative date format: "${input}". Use <number><d|w|m> (e.g., 7d, 1w, 1m).`,
    );
  }

  const amount = parseInt(match[1]!, 10);
  const unit = match[2]! as "d" | "w" | "m";

  const result = new Date(now);

  switch (unit) {
    case "d":
      result.setDate(result.getDate() - amount);
      break;
    case "w":
      result.setDate(result.getDate() - amount * 7);
      break;
    case "m":
      result.setMonth(result.getMonth() - amount);
      break;
  }

  return result;
}

/**
 * Returns true if the input looks like a relative date (e.g., "7d", "1w", "1m").
 */
export function isRelativeDate(input: string): boolean {
  return RELATIVE_PATTERN.test(input);
}

/**
 * Resolves a date input (either ISO 8601 or relative) to an ISO 8601 string.
 * For relative dates, subtracts from `now`.
 */
export function resolveDateInput(input: string, now: Date = new Date()): string {
  if (isRelativeDate(input)) {
    return parseRelativeDate(input, now).toISOString();
  }

  // Validate ISO 8601 format (basic check)
  const date = new Date(input);
  if (isNaN(date.getTime())) {
    throw new Error(
      `Invalid date: "${input}". Use ISO 8601 format (e.g., 2025-01-15) or relative (e.g., 7d, 1w, 1m).`,
    );
  }

  return date.toISOString();
}
