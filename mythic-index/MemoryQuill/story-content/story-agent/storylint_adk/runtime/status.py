from __future__ import annotations

from contextlib import contextmanager
from dataclasses import dataclass
from typing import Optional

try:  # optional
    from rich.console import Console
    from rich.live import Live
    from rich.panel import Panel
    from rich.progress import (
        Progress,
        SpinnerColumn,
        BarColumn,
        TextColumn,
        TimeElapsedColumn,
        MofNCompleteColumn,
    )
    from rich.table import Table
except ImportError:  # pragma: no cover
    Console = None
    Progress = None
    Live = None
    Panel = None
    Table = None


@dataclass
class TaskHandle:
    task_id: int


class StatusReporter:
    def __init__(self, max_errors: int = 6) -> None:
        self._console = Console() if Console else None
        self._progress = None
        self._live = None
        self._layout = None
        self._errors: list[tuple[str, str]] = []
        self._max_errors = max_errors
        self._error_count = 0

    @contextmanager
    def display(self):
        if Progress is None or Live is None or Panel is None or Table is None:
            yield self
            return

        self._progress = Progress(
            SpinnerColumn(),
            TextColumn("[bold]{task.description}"),
            BarColumn(),
            MofNCompleteColumn(),
            TimeElapsedColumn(),
            transient=False,
        )
        self._layout = self._build_layout()
        self._live = Live(self._layout, refresh_per_second=8, console=self._console)
        with self._live:
            yield self
        self._progress = None
        self._live = None
        self._layout = None

    def add_task(self, label: str, total: int) -> TaskHandle:
        if self._progress is None:
            return TaskHandle(task_id=-1)
        task_id = self._progress.add_task(label, total=total)
        self._refresh()
        return TaskHandle(task_id=task_id)

    def advance(self, handle: TaskHandle, advance: int = 1, description: Optional[str] = None) -> None:
        if self._progress is None or handle.task_id == -1:
            return
        self._progress.update(handle.task_id, advance=advance, description=description)
        self._refresh()

    def log(self, message: str) -> None:
        if self._console:
            self._console.print(message)
        else:
            print(message)

    def record_error(self, label: str, exc: Exception) -> None:
        self._error_count += 1
        summary = _summarize_error(exc)
        self._errors.append((label, summary))
        if len(self._errors) > self._max_errors:
            self._errors = self._errors[-self._max_errors :]
        self._refresh()

    @property
    def error_count(self) -> int:
        return self._error_count

    def recent_errors(self) -> list[str]:
        return [f"{label}: {message}" for label, message in self._errors]

    def _build_layout(self):
        from rich.layout import Layout

        layout = Layout()
        layout.split_column(
            Layout(name="progress", ratio=3),
            Layout(name="errors", ratio=1),
        )
        layout["progress"].update(Panel(self._progress, title="Progress", border_style="cyan"))
        layout["errors"].update(Panel(self._error_table(), title="Errors", border_style="red"))
        return layout

    def _error_table(self):
        table = Table(show_header=True, header_style="bold red")
        table.add_column("Task", width=24, overflow="ellipsis")
        table.add_column("Error", overflow="fold")
        if not self._errors:
            table.add_row("-", "None")
            return table
        for label, message in self._errors:
            table.add_row(label, message)
        return table

    def _refresh(self) -> None:
        if self._layout is None or self._live is None or self._progress is None:
            return
        self._layout["progress"].update(Panel(self._progress, title="Progress", border_style="cyan"))
        self._layout["errors"].update(Panel(self._error_table(), title="Errors", border_style="red"))
        self._live.refresh()


def _summarize_error(exc: Exception) -> str:
    message = str(exc).strip().splitlines()[0] if str(exc) else exc.__class__.__name__
    if len(message) > 120:
        message = message[:117] + "..."
    return f"{exc.__class__.__name__}: {message}"
