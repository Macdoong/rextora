"""Tests for the sandbox todo application."""

from pathlib import Path

from todo_app.todo import TodoStore


def test_add_and_list_tasks(tmp_path: Path):
    store = TodoStore(tmp_path / "tasks.json")
    store.add_task("buy milk")
    tasks = store.list_tasks()
    assert len(tasks) == 1
    assert tasks[0]["title"] == "buy milk"
    assert tasks[0]["completed"] is False


def test_mark_task_completed(tmp_path: Path):
    store = TodoStore(tmp_path / "tasks.json")
    store.add_task("write report")
    store.mark_completed(1)
    tasks = store.list_tasks()
    assert tasks[0]["completed"] is True
