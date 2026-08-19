import path from "node:path";
import {
  productionStrategiesRootCanonical,
  runtimeIo,
  strategyStoreOverrideRoot,
} from "rextora-runtime-paths";

export function probe(id: string): string {
  const root = strategyStoreOverrideRoot() ?? productionStrategiesRootCanonical();
  const target = path.join(root, `${id}.json`);
  if (!runtimeIo.fileExists(target)) return runtimeIo.readDirectory(root).join(",");
  return runtimeIo.readFile(target, "utf8") as string;
}
