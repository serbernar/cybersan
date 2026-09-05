"""The single mutable copy of the vehicle state, plus dot-path bookkeeping.

The shape is loaded from packages/protocol/default-state.json so the daemon can
never drift from the TypeScript contract: there is one file, two readers.
"""

from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import Any, Iterable

HERE = Path(__file__).resolve().parent


def _candidate_paths() -> list[Path]:
    """Where default-state.json may live, in order of precedence.

    In the repo it is read straight out of packages/protocol; on the car the
    deploy step drops a copy beside the package, because the Pi holds no
    checkout. The env var exists for tests and one-off runs.
    """
    candidates = []
    override = os.environ.get("CYBERSAN_PROTOCOL_STATE")
    if override:
        candidates.append(Path(override))
    candidates.append(HERE / "default-state.json")
    candidates.append(HERE.parents[2] / "packages" / "protocol" / "default-state.json")
    candidates.append(HERE.parents[1] / "packages" / "protocol" / "default-state.json")
    return candidates


def load_default_state() -> dict[str, Any]:
    for path in _candidate_paths():
        if path.is_file():
            with path.open(encoding="utf-8") as handle:
                return json.load(handle)
    raise FileNotFoundError(
        "default-state.json not found; looked in: "
        + ", ".join(str(p) for p in _candidate_paths())
    )


class StateStore:
    """Holds the snapshot and turns writes into a minimal patch set.

    Sources write through `update()`; only values that actually changed are
    handed to the hub. A rounding-noise sensor therefore costs no bandwidth and
    no re-render on the HUD.
    """

    def __init__(self) -> None:
        self._state = load_default_state()
        self._state["ts"] = int(time.time() * 1000)
        # `meta` is keyed by dot path, so it cannot itself be addressed by one.
        # It is therefore shipped whole, and only when something in it changed.
        self._meta_dirty = False

    @property
    def snapshot(self) -> dict[str, Any]:
        return self._state

    def get(self, path: str) -> Any:
        node: Any = self._state
        for key in path.split("."):
            if not isinstance(node, dict) or key not in node:
                return None
            node = node[key]
        return node

    def update(self, values: dict[str, Any], *, source: str | None = None) -> dict[str, Any]:
        """Apply dot-path writes. Returns only the entries that changed."""
        changed: dict[str, Any] = {}
        now = time.time()
        for path, value in values.items():
            if self._set_path(path, value):
                changed[path] = value
                if source is not None:
                    self._touch_meta(path, source)
        if changed:
            self._state["ts"] = int(now * 1000)
        return changed

    def _touch_meta(self, path: str, source: str) -> None:
        entry = {"src": source, "ok": True, "age": 0.0}
        if self._state["meta"].get(path) != entry:
            self._state["meta"][path] = entry
            self._meta_dirty = True

    def pop_meta_patch(self) -> dict[str, Any]:
        """Return `{"meta": ...}` once, if provenance changed since last call."""
        if not self._meta_dirty:
            return {}
        self._meta_dirty = False
        return {"meta": self._state["meta"]}

    def set_source(self, source_id: str, status: str, detail: str | None = None) -> dict[str, Any]:
        info: dict[str, Any] = {"status": status, "age": 0.0}
        if detail:
            info["detail"] = detail
        if self._state["sources"].get(source_id) == info:
            return {}
        self._state["sources"][source_id] = info
        return {f"sources.{source_id}": info}

    def set_warnings(self, warnings: Iterable[str]) -> dict[str, Any]:
        ordered = sorted(set(warnings))
        if ordered == self._state["warnings"]:
            return {}
        self._state["warnings"] = ordered
        return {"warnings": ordered}

    def mark_stale(self, paths: Iterable[str]) -> None:
        """Flag signals whose source stopped answering, without zeroing them.

        A frozen number that still looks live is the one failure mode a driver
        cannot detect, so staleness is part of the wire format, not a log line.
        """
        for path in paths:
            meta = self._state["meta"].get(path)
            if meta and meta["ok"]:
                meta["ok"] = False
                self._meta_dirty = True

    def _set_path(self, path: str, value: Any) -> bool:
        keys = path.split(".")
        node: Any = self._state
        for key in keys[:-1]:
            if not isinstance(node, dict) or key not in node:
                # Unknown branch: the schema is the contract, so refuse to grow
                # a field the HUD has never heard of.
                return False
            node = node[key]
        leaf = keys[-1]
        if not isinstance(node, dict) or leaf not in node:
            return False
        if node[leaf] == value:
            return False
        node[leaf] = value
        return True
