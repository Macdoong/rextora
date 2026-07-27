/**
 * Client-safe public entry point for the canonical pattern parameter catalog.
 * The implementation is pure data; this path keeps client components out of
 * the server-side strategySearch module boundary.
 */
export {
  PATTERN_PARAMETER_CATALOG,
  catalogDefaultsForPatternFamily,
  catalogForPatternFamily,
  catalogRangesForPatternFamily,
} from "./strategySearch/patternParameterCatalog";
export type {
  PatternParameterCatalogEntry,
  PatternParameterType,
  PatternParameterValue,
} from "./strategySearch/patternParameterCatalog";
