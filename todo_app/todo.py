"""Simple todo store with JSON persistence."""

from __future__ import annotations

import json
from pathlib import Path


class TodoStore:
    """Persist tasks in a JSON file."""

    def __init__(self, data_file: Path):
        self.data_file = Path(data_file)

    def _load(self) -> list[dict]:
        if not self.data_file.exists():
            return []
        return json.loads(self.data_file.read_text(encoding="utf-8"))

    def _save(self, tasks: list[dict]) -> None:
        self.data_file.parent.mkdir(parents=True, exist_ok=True)
        self.data_file.write_text(
            json.dumps(tasks, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    def add_task(self, title: str) -> dict:
        tasks = self._load()
        task = {"id": len(tasks) + 1, "title": title.strip(), "completed": False}
        tasks.append(task)
        self._save(tasks)
        return task

    def list_tasks(self) -> list[dict]:
        return self._load()

    def mark_completed(self, task_id: int) -> list[dict]:
        tasks = self._load()
        for task in tasks:
            if task["id"] == task_id:
                task["completed"] = True
        self._save(tasks)
        return tasks
