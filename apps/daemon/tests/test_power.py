"""The debounce is the part that can strand you in a car park, so it is tested."""

from __future__ import annotations

import unittest

from cybersan.power import IgnitionDebouncer


class IgnitionDebouncerTest(unittest.TestCase):
    def test_ignition_on_never_fires(self) -> None:
        guard = IgnitionDebouncer(delay=20)
        for t in range(0, 120, 5):
            self.assertFalse(guard.update(True, t).shut_down_now)

    def test_fires_once_after_the_full_delay(self) -> None:
        guard = IgnitionDebouncer(delay=20)
        guard.update(True, 0)

        self.assertFalse(guard.update(False, 10).shut_down_now, "10s is not yet 20s")
        self.assertFalse(guard.update(False, 29.9).shut_down_now)

        self.assertTrue(guard.update(False, 30).shut_down_now, "20s after the key came out")
        self.assertFalse(guard.update(False, 31).shut_down_now, "must not fire twice")

    def test_cranking_dropout_does_not_shut_down(self) -> None:
        """The starter drops ACC for about a second on most cars."""
        guard = IgnitionDebouncer(delay=20)
        guard.update(True, 0)

        self.assertFalse(guard.update(False, 5.0).shut_down_now)
        self.assertFalse(guard.update(False, 5.5).shut_down_now)
        guard.update(True, 6.0)  # engine caught, ACC is back

        # The countdown must start from scratch, not resume near 20.
        verdict = guard.update(False, 6.5)
        self.assertAlmostEqual(verdict.off_for, 0.0)
        self.assertFalse(guard.update(False, 20.0).shut_down_now, "14s of the new count")
        self.assertTrue(guard.update(False, 26.5).shut_down_now)

    def test_countdown_is_reported_for_the_dashboard(self) -> None:
        guard = IgnitionDebouncer(delay=30)
        guard.update(True, 0)

        verdict = guard.update(False, 10)
        self.assertEqual(verdict.shutdown_in, 30.0)

        verdict = guard.update(False, 25)
        self.assertEqual(verdict.shutdown_in, 15.0)
        self.assertFalse(verdict.ignition)

    def test_bench_mode_never_powers_down(self) -> None:
        """Harness unplugged: the unit is on a desk, not in a car."""
        guard = IgnitionDebouncer(delay=20)
        for t in range(0, 300, 10):
            verdict = guard.update(False, t, in_car=False)
            self.assertFalse(verdict.shut_down_now)
            self.assertFalse(verdict.in_car)
            self.assertIsNone(verdict.shutdown_in)

    def test_countdown_does_not_carry_over_from_the_bench(self) -> None:
        """Plugging back into the car must not inherit a stale countdown."""
        guard = IgnitionDebouncer(delay=20)
        for t in range(0, 100, 10):
            guard.update(False, t, in_car=False)

        # Back in the car with the key out: a fresh 20 seconds, not an instant halt.
        self.assertFalse(guard.update(False, 100, in_car=True).shut_down_now)
        self.assertFalse(guard.update(False, 115, in_car=True).shut_down_now)
        self.assertTrue(guard.update(False, 120, in_car=True).shut_down_now)

    def test_key_back_on_after_countdown_started_cancels_it(self) -> None:
        guard = IgnitionDebouncer(delay=20)
        guard.update(False, 0)
        guard.update(False, 15)

        verdict = guard.update(True, 16)
        self.assertIsNone(verdict.shutdown_in)
        self.assertFalse(guard.update(False, 30).shut_down_now, "counting starts again")


if __name__ == "__main__":
    unittest.main()
