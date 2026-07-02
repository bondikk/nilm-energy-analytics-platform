import argparse
import asyncio
from datetime import UTC, datetime, timedelta

from app.infrastructure.database.session import AsyncSessionLocal
from app.services.demo_data import DEMO_EMAIL, DEMO_PASSWORD, DemoSeedResult, seed_demo_data


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Seed VoltPulse demo data.")
    parser.add_argument("--email", default=DEMO_EMAIL)
    parser.add_argument("--password", default=DEMO_PASSWORD)
    parser.add_argument("--sample-count", type=int, default=96)
    parser.add_argument("--interval-minutes", type=int, default=15)
    parser.add_argument("--start-at", default=None, help="ISO datetime, defaults to 24h ago.")
    return parser.parse_args()


def parse_start_at(value: str | None) -> datetime:
    if value is None:
        return datetime.now(UTC) - timedelta(hours=24)

    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=UTC)

    return parsed.astimezone(UTC)


async def run(args: argparse.Namespace) -> DemoSeedResult:
    async with AsyncSessionLocal() as session:
        return await seed_demo_data(
            session=session,
            email=args.email,
            password=args.password,
            sample_count=args.sample_count,
            interval_minutes=args.interval_minutes,
            start_at=parse_start_at(args.start_at),
        )


def main() -> None:
    result = asyncio.run(run(parse_args()))
    print("Demo data seeded")
    print(f"email={result.email}")
    print(f"password={result.password}")
    print(f"user_id={result.user_id}")
    print(f"home_id={result.home_id}")
    print(f"device_id={result.device_id}")
    print(f"metric_count={result.metric_count}")
    print(f"anomaly_count={result.anomaly_count}")


if __name__ == "__main__":
    main()
