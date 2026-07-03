from __future__ import annotations

import argparse
from pathlib import Path
from typing import Sequence

from app.ml.datasets.uk_dale_loader import (
    DEFAULT_UK_DALE_HOUSE_1,
    UKDaleHouseConfig,
    convert_uk_dale_house_to_unified_csv,
)


def parse_channel_mapping(value: str) -> tuple[str, int]:
    appliance, separator, channel = value.partition("=")
    if not separator or not appliance.strip() or not channel.strip():
        raise argparse.ArgumentTypeError("channel mapping must use appliance=channel")
    try:
        return appliance.strip(), int(channel)
    except ValueError as exc:
        raise argparse.ArgumentTypeError("channel must be an integer") from exc


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Convert a UK-DALE low-frequency house directory to VoltPulse unified NILM CSV."
    )
    parser.add_argument("--raw-house-dir", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--house-id", type=int, default=DEFAULT_UK_DALE_HOUSE_1.house_id)
    parser.add_argument("--aggregate-channel", type=int, default=None)
    parser.add_argument(
        "--appliance-channel",
        action="append",
        default=[],
        type=parse_channel_mapping,
        metavar="APPLIANCE=CHANNEL",
    )
    return parser


def build_config(args: argparse.Namespace) -> UKDaleHouseConfig:
    appliance_channels = dict(args.appliance_channel) or dict(
        DEFAULT_UK_DALE_HOUSE_1.appliance_channels
    )
    return UKDaleHouseConfig(
        house_id=args.house_id,
        aggregate_channel=args.aggregate_channel,
        appliance_channels=appliance_channels,
        sample_period_seconds=DEFAULT_UK_DALE_HOUSE_1.sample_period_seconds,
    )


def main(argv: Sequence[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    dataset = convert_uk_dale_house_to_unified_csv(
        raw_house_dir=args.raw_house_dir,
        output_path=args.output,
        config=build_config(args),
    )
    print(
        f"Converted {dataset.sample_count} samples from UK-DALE house {dataset.house_id} "
        f"to {args.output}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
