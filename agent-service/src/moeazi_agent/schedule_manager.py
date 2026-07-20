from datetime import timedelta

from temporalio.client import (
    Client,
    Schedule,
    ScheduleActionStartWorkflow,
    ScheduleIntervalSpec,
    ScheduleSpec,
    ScheduleState,
    ScheduleUpdate,
)

from .config import Settings
from .runtime_controls import RuntimeControls
from .temporal_app import ScheduledAnalysisWorkflow


CADENCE_MINUTES = {"1m": 1, "2m": 2, "5m": 5, "15m": 15}
PREFIX = "agent-market-"


def schedule_id(profile_id: str, market: str) -> str:
    safe_market = "".join(char.lower() if char.isalnum() else "-" for char in market)
    return f"{PREFIX}{profile_id}-{safe_market}"[:240]


def schedule_for(
    profile: dict,
    market: str,
    controls: RuntimeControls,
    settings: Settings,
) -> Schedule:
    cadence = CADENCE_MINUTES[profile["cadence"]]
    if controls.lite_mode:
        cadence = max(15, cadence)
    identifier = schedule_id(profile["_id"], market)
    return Schedule(
        action=ScheduleActionStartWorkflow(
            ScheduledAnalysisWorkflow.run,
            {
                "profile_id": profile["_id"],
                "market": market,
                "schedule_revision": profile.get("scheduleRevision", 0),
                "task_queue": settings.temporal_task_queue,
            },
            id=identifier,
            task_queue=settings.temporal_task_queue,
        ),
        spec=ScheduleSpec(
            intervals=[ScheduleIntervalSpec(every=timedelta(minutes=cadence))],
        ),
        state=ScheduleState(
            paused=controls.manual_guard,
            note="Manual Guard is on" if controls.manual_guard else "Automatic cadence enabled",
        ),
    )


async def sync_profile_schedules(
    client: Client,
    profile_data: dict,
    controls: RuntimeControls,
    settings: Settings,
) -> dict:
    profile = profile_data["profile"]
    markets = profile_data.get("markets", [])
    wanted = set(markets[:1] if controls.lite_mode else markets)
    active = (
        profile.get("lifecycleStatus") == "active"
        and not profile.get("paused", True)
        and profile.get("cadence") in CADENCE_MINUTES
    )
    synced = 0
    for market in wanted:
        handle = client.get_schedule_handle(schedule_id(profile["_id"], market))
        if not active:
            try:
                await handle.delete()
            except Exception:
                pass
            continue
        schedule = schedule_for(profile, market, controls, settings)
        try:
            await handle.update(lambda _: ScheduleUpdate(schedule=schedule))
        except Exception:
            await client.create_schedule(schedule_id(profile["_id"], market), schedule)
        synced += 1
    return {"synced": synced, "paused": controls.manual_guard}


async def set_agent_schedules_paused(client: Client, paused: bool) -> int:
    changed = 0
    async for entry in client.list_schedules():
        if not entry.id.startswith(PREFIX):
            continue
        handle = client.get_schedule_handle(entry.id)
        if paused:
            await handle.pause(note="Manual Guard is on")
        else:
            await handle.unpause(note="Manual Guard is off")
        changed += 1
    return changed
