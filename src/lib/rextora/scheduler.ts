type ScheduledTask = {
  id: string;
  intervalMs: number;
  fn: () => void | Promise<void>;
  timer?: ReturnType<typeof setInterval>;
};

const tasks = new Map<string, ScheduledTask>();

export function scheduleInterval(id: string, intervalMs: number, fn: () => void | Promise<void>): void {
  cancelScheduledTask(id);
  const task: ScheduledTask = { id, intervalMs, fn };
  task.timer = setInterval(() => {
    void fn();
  }, intervalMs);
  tasks.set(id, task);
}

export function cancelScheduledTask(id: string): void {
  const task = tasks.get(id);
  if (task?.timer) clearInterval(task.timer);
  tasks.delete(id);
}

export function cancelAllScheduledTasks(): void {
  for (const id of tasks.keys()) cancelScheduledTask(id);
}

export function listScheduledTasks(): string[] {
  return Array.from(tasks.keys());
}
