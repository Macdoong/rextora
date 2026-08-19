/**
 * JSON-schema subset validation for tool inputs/outputs.
 */

import type { ToolJsonSchema } from "./toolTypes";

export interface ValidationIssue {
  path: string;
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
}

function typeOf(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function validateValue(
  schema: ToolJsonSchema,
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (value === null || value === undefined) {
    if (schema.nullable || schema.type === "null") return;
    if (schema.type === "object" && value === undefined) {
      issues.push({ path, message: "required value missing" });
    }
    return;
  }

  if (schema.enum && !schema.enum.includes(value as string | number | boolean)) {
    issues.push({
      path,
      message: `value must be one of: ${schema.enum.join(", ")}`,
    });
    return;
  }

  const actual = typeOf(value);
  if (schema.type === "object" && actual !== "object") {
    issues.push({ path, message: `expected object, got ${actual}` });
    return;
  }
  if (schema.type === "array" && actual !== "array") {
    issues.push({ path, message: `expected array, got ${actual}` });
    return;
  }
  if (schema.type === "string" && actual !== "string") {
    issues.push({ path, message: `expected string, got ${actual}` });
    return;
  }
  if (schema.type === "number" && actual !== "number") {
    issues.push({ path, message: `expected number, got ${actual}` });
    return;
  }
  if (schema.type === "boolean" && actual !== "boolean") {
    issues.push({ path, message: `expected boolean, got ${actual}` });
    return;
  }

  if (schema.type === "object" && value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    for (const key of schema.required ?? []) {
      if (obj[key] === undefined || obj[key] === null) {
        issues.push({ path: `${path}.${key}`, message: "required" });
      }
    }
    if (schema.properties) {
      for (const [key, child] of Object.entries(schema.properties)) {
        if (obj[key] !== undefined) {
          validateValue(child, obj[key], `${path}.${key}`, issues);
        }
      }
    }
    if (schema.additionalProperties === false && schema.properties) {
      for (const key of Object.keys(obj)) {
        if (!(key in schema.properties)) {
          issues.push({
            path: `${path}.${key}`,
            message: "additional property not allowed",
          });
        }
      }
    }
  }

  if (schema.type === "array" && Array.isArray(value) && schema.items) {
    value.forEach((item, i) => {
      validateValue(schema.items!, item, `${path}[${i}]`, issues);
    });
  }
}

export function validateAgainstSchema(
  schema: ToolJsonSchema,
  value: unknown,
): ValidationResult {
  const issues: ValidationIssue[] = [];
  if (value === undefined || value === null) {
    if (schema.type === "object") {
      validateValue(schema, {}, "$", issues);
    } else {
      issues.push({ path: "$", message: "value required" });
    }
  } else {
    validateValue(schema, value, "$", issues);
  }
  return { ok: issues.length === 0, issues };
}

export function formatValidationIssues(issues: ValidationIssue[]): string {
  return issues.map((i) => `${i.path}: ${i.message}`).join("; ");
}
