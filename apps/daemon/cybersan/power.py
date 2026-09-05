"""Ignition guard — decides when the head unit is allowed to switch itself off.

Split of responsibilities, and the reason for it:

* **Holding power on** is the kernel's job, via `dtoverlay=gpio-poweroff`. That
  overlay drives the keep-alive GPIO through the whole session and releases it
  only at the very end of halt, after the filesystems are gone. Holding the pin
  from Python instead would cut the relay the moment this process exited — or
  crashed — which is exactly the failure we are trying to avoid.
* **Deciding to shut down** is this service's job, because it needs a timer and
  a debounce that no device tree overlay can express.

The debounce matters more than it looks: on most cars the ACC line drops out for
about a second while the starter cranks. Without it the head unit would power
down every single time the engine is started.

There is also a bench mode. With `--presence-pin`, one contact of the harness is
strapped to ground in the car; when the harness is unplugged that pin floats and
the guard knows it is on a desk rather than in a car, and leaves the power alone.
Without it, carrying the unit indoors would mean it shuts itself down twenty
seconds after every boot, which is a miserable way to debug anything.

Run:  python3 -m cybersan.power --pin 4 --delay 20
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path

log = logging.getLogger("cybersan.power")

DEFAULT_STATE_FILE = Path("/run/cybersan/ignition")


@dataclass
class Verdict:
    """What the guard thinks right now."""

    ignition: bool
    #: Seconds the ignition has been continuously off, 0 while it is on.
    off_for: float
    #: Seconds left before shutdown, None while the ignition is on.
    shutdown_in: float | None
    #: True exactly once, on the poll where the delay elapsed.
    shut_down_now: bool
    #: False when the car harness is unplugged, i.e. this is a bench session.
    in_car: bool = True


class IgnitionDebouncer:
    """Pure decision logic, so it can be tested without a car or a GPIO pin.

    A brief return of the ignition — cranking, a loose contact — resets the
    countdown completely. Only a continuous absence counts.
    """

    def __init__(self, delay: float) -> None:
        self.delay = delay
        self._off_since: float | None = None
        self._fired = False

    def update(self, ignition_on: bool, now: float, in_car: bool = True) -> Verdict:
        if not in_car:
            # On the bench nothing may switch the power off, and the countdown
            # must not carry over into the next drive.
            self._off_since = None
            self._fired = False
            return Verdict(ignition_on, 0.0, None, False, in_car=False)

        if ignition_on:
            self._off_since = None
            self._fired = False
            return Verdict(True, 0.0, None, False)


        if self._off_since is None:
            self._off_since = now

        off_for = now - self._off_since
        remaining = max(0.0, self.delay - off_for)

        fire = off_for >= self.delay and not self._fired
        if fire:
            self._fired = True

        return Verdict(False, off_for, remaining, fire)


def write_state(path: Path, verdict: Verdict) -> None:
    """Publish the verdict for the HUD. Written atomically; failure is not fatal.

    The dashboard showing a stale ignition state is a cosmetic problem; the
    guard failing to shut the car down is not, so this never raises.
    """
    payload = {
        "ignition": "on" if verdict.ignition else "off",
        "offFor": round(verdict.off_for, 1),
        "shutdownIn": None if verdict.shutdown_in is None else round(verdict.shutdown_in, 1),
        "inCar": verdict.in_car,
        "ts": int(time.time() * 1000),
    }
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(".tmp")
        tmp.write_text(json.dumps(payload), encoding="utf-8")
        tmp.replace(path)
    except OSError as error:
        log.warning("cannot publish ignition state: %s", error)


def power_off(command: list[str], dry_run: bool) -> None:
    log.warning("ignition off for the full delay — shutting down")
    if dry_run:
        log.warning("dry run: would have executed %s", " ".join(command))
        return
    subprocess.run(command, check=False)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="cybersan.power", description=__doc__)
    parser.add_argument(
        "--pin",
        type=int,
        default=int(os.environ.get("CYBERSAN_IGNITION_PIN", 4)),
        help="BCM number of the ignition sense input (default: 4)",
    )
    parser.add_argument(
        "--active-high",
        action="store_true",
        help="the pin reads HIGH when the ignition is on; the default assumes an "
        "optocoupler that pulls the pin LOW when ACC is live",
    )
    parser.add_argument(
        "--delay",
        type=float,
        default=float(os.environ.get("CYBERSAN_OFF_DELAY", 20)),
        help="seconds the ignition must stay off before shutting down (default: 20)",
    )
    parser.add_argument(
        "--presence-pin",
        type=int,
        default=int(os.environ.get("CYBERSAN_PRESENCE_PIN", 0)) or None,
        help="BCM number of a pin strapped to ground by the car harness. When the "
        "harness is unplugged the guard goes passive instead of powering the "
        "machine down on a desk. Omit to always assume the unit is in the car.",
    )
    parser.add_argument("--poll", type=float, default=0.5, help="seconds between reads")
    parser.add_argument("--state-file", type=Path, default=DEFAULT_STATE_FILE)
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="log the shutdown instead of performing it — use this on the bench",
    )
    parser.add_argument("--verbose", action="store_true")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)-7s %(name)s: %(message)s",
    )

    # Imported here so `--help` and the unit tests work on a laptop.
    from gpiozero import DigitalInputDevice  # type: ignore[import-not-found]

    # gpiozero reports a *logical* value, not the raw pin level: with pull_up=True
    # it treats "pulled down to ground" as active and returns 1 for it. So both
    # wirings read the same way here, and only the pull direction differs.
    #
    #   default      optocoupler sinks the pin to ground while ACC is live
    #                -> internal pull-up, value == 1 means ignition on
    #   --active-high  the sense circuit drives the pin high while ACC is live
    #                -> internal pull-down, value == 1 means ignition on
    #
    # Inverting this by hand reads "ignition on" when the key is out, and the
    # car would then shut itself down while driving instead of after parking.
    sense = DigitalInputDevice(args.pin, pull_up=not args.active_high)

    def ignition_on() -> bool:
        return bool(sense.value)

    presence = None
    if args.presence_pin:
        # Pulled up internally; the harness ties it to ground, so LOW means the
        # loom is connected. gpiozero's pull_up makes that read as 1.
        presence = DigitalInputDevice(args.presence_pin, pull_up=True)

    def in_car() -> bool:
        return True if presence is None else bool(presence.value)

    debouncer = IgnitionDebouncer(args.delay)
    command = ["systemctl", "poweroff"]

    log.info(
        "ignition guard watching BCM%d (active %s), delay %.0fs, presence %s",
        args.pin,
        "high" if args.active_high else "low",
        args.delay,
        f"BCM{args.presence_pin}" if args.presence_pin else "not used",
    )

    previous: bool | None = None
    previous_in_car: bool | None = None
    while True:
        verdict = debouncer.update(ignition_on(), time.monotonic(), in_car())

        if verdict.in_car != previous_in_car:
            log.info(
                "harness %s — %s",
                "connected" if verdict.in_car else "unplugged",
                "guarding" if verdict.in_car else "bench mode, power untouched",
            )
            previous_in_car = verdict.in_car

        if verdict.ignition != previous:
            log.info("ignition %s", "on" if verdict.ignition else "off")
            previous = verdict.ignition

        write_state(args.state_file, verdict)

        if verdict.shut_down_now:
            power_off(command, args.dry_run)
            if args.dry_run:
                # Keep running so a bench test can watch the key go back on.
                debouncer = IgnitionDebouncer(args.delay)

        time.sleep(args.poll)


if __name__ == "__main__":
    sys.exit(main())
