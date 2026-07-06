import { execFileSync } from "node:child_process";

export default async function globalTeardown() {
  if (process.platform !== "win32") return;

  let output = "";
  try {
    output = execFileSync("cmd", ["/c", "netstat -ano | findstr :3100"], { encoding: "utf8" }).trim();
  } catch {
    return;
  }

  const pids = new Set(output.split(/\r?\n/).map((line) => line.trim().split(/\s+/).at(-1)).filter(Boolean));

  for (const pid of pids) {
    try {
      execFileSync("powershell", ["-NoProfile", "-Command", `Stop-Process -Id ${pid} -Force`], { stdio: "ignore" });
    } catch {
      // The web server may already be stopped by Playwright.
    }
  }
}
