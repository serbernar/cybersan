"""Contract tests for the state store — stdlib unittest, no extra dependencies."""

from __future__ import annotations

import unittest

from cybersan.state import StateStore


class StateStoreTest(unittest.TestCase):
    def setUp(self) -> None:
        self.store = StateStore()

    def test_writes_return_only_changed_values(self) -> None:
        first = self.store.update({"engine.rpm": 900}, source="mock")
        self.assertEqual(first, {"engine.rpm": 900})

        again = self.store.update({"engine.rpm": 900}, source="mock")
        self.assertEqual(again, {}, "an unchanged value must not produce a patch")

    def test_unknown_paths_are_refused(self) -> None:
        self.assertEqual(self.store.update({"engine.turbo": 1}), {})
        self.assertNotIn("turbo", self.store.snapshot["engine"])

    def test_nested_paths_reach_leaves(self) -> None:
        self.store.update({"body.doors.tailgate": True}, source="gpio")
        self.assertTrue(self.store.snapshot["body"]["doors"]["tailgate"])

    def test_meta_is_shipped_whole_and_only_once(self) -> None:
        self.store.update({"engine.rpm": 900}, source="mock")
        patch = self.store.pop_meta_patch()
        self.assertEqual(patch["meta"]["engine.rpm"]["src"], "mock")
        self.assertEqual(self.store.pop_meta_patch(), {}, "meta must not resend unchanged")

    def test_stale_marks_signals_without_zeroing_them(self) -> None:
        self.store.update({"engine.rpm": 900}, source="obd")
        self.store.pop_meta_patch()
        self.store.mark_stale(["engine.rpm"])

        self.assertEqual(self.store.get("engine.rpm"), 900, "a stale value keeps its last reading")
        self.assertFalse(self.store.pop_meta_patch()["meta"]["engine.rpm"]["ok"])

    def test_sources_and_warnings_are_deduplicated(self) -> None:
        self.assertTrue(self.store.set_source("obd", "offline", "no adapter"))
        self.assertEqual(self.store.set_source("obd", "offline", "no adapter"), {})
        self.assertEqual(self.store.set_warnings(["lowFuel", "lowFuel"]), {"warnings": ["lowFuel"]})
        self.assertEqual(self.store.set_warnings(["lowFuel"]), {})


if __name__ == "__main__":
    unittest.main()
