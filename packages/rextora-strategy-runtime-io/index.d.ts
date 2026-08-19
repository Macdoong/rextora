interface StrategyRuntimeIo {
  absolutePath(target: string): string;
  baseName(target: string): string;
  canonicalSafeFile(cwd: string, safeId: string): string;
  canonicalSafeSourceDir(cwd: string): string;
  ensureDirectory(root: string): void;
  fileSystemRoot(target: string): string;
  hasPath(target: string): boolean;
  isPathInside(child: string, parent: string): boolean;
  listNames(root: string): string[];
  productionStrategiesRoot(cwd: string): string;
  readText(target: string): string;
  removeFile(target: string): void;
  resolveIndexPath(root: string): string;
  resolveStrategyPath(root: string, id: string): string;
  writeText(target: string, contents: string): void;
}

declare const strategyRuntimeIo: Readonly<StrategyRuntimeIo>;

export = strategyRuntimeIo;
