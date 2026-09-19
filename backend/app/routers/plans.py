from collections import defaultdict
from datetime import UTC, date, datetime, time, timedelta
from uuid import UUID, uuid4
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import User, WeeklyPlan, WeeklyPlanSlot, Workout, WorkoutTemplate
from app.schemas.plan import (
    CalendarAdherenceOut,
    CalendarDayOut,
    CalendarOut,
    CalendarPlanOut,
    PlanIn,
    PlanOut,
    PlanPatch,
    PlanSlotIn,
    PlanSlotOut,
)
from app.schemas.workout import stored_utc
from app.services.analytics import bucket_start

router = APIRouter(
    prefix="/api",
    tags=["plans"],
    dependencies=[Depends(get_current_user)],
)

DUPLICATE_DETAIL = "Plan already exists"


def _find_by_name(db: Session, user: User, name_lower: str) -> WeeklyPlan | None:
    return db.scalar(
        select(WeeklyPlan).where(
            WeeklyPlan.user_id == user.id, WeeklyPlan.name_lower == name_lower
        )
    )


def _get_owned(db: Session, user: User, plan_id: UUID) -> WeeklyPlan:
    plan = db.get(WeeklyPlan, plan_id)
    if plan is None or plan.user_id != user.id:
        raise HTTPException(status_code=404, detail="Plan not found")
    return plan


def _validate_templates(db: Session, user: User, slots: list[PlanSlotIn]) -> None:
    for slot in slots:
        if slot.template_id is None:
            continue
        template = db.get(WorkoutTemplate, slot.template_id)
        if template is None or template.user_id != user.id:
            raise HTTPException(status_code=404, detail="Template not found")


def _replace_slots(db: Session, plan: WeeklyPlan, slots: list[PlanSlotIn]) -> None:
    for existing in list(
        db.scalars(select(WeeklyPlanSlot).where(WeeklyPlanSlot.plan_id == plan.id))
    ):
        db.delete(existing)
    db.flush()
    for slot in slots:
        db.add(
            WeeklyPlanSlot(
                plan_id=plan.id,
                day_of_week=slot.day_of_week,
                template_id=slot.template_id,
            )
        )
    db.flush()


def _deactivate_others(db: Session, user: User, plan_id: UUID) -> None:
    db.execute(
        update(WeeklyPlan)
        .where(
            WeeklyPlan.user_id == user.id,
            WeeklyPlan.is_active.is_(True),
            WeeklyPlan.id != plan_id,
        )
        .values(is_active=False)
    )


def _slots_map(db: Session, plan_ids: list[UUID]) -> dict[UUID, list[WeeklyPlanSlot]]:
    grouped: dict[UUID, list[WeeklyPlanSlot]] = defaultdict(list)
    if not plan_ids:
        return grouped
    for slot in db.scalars(
        select(WeeklyPlanSlot)
        .where(WeeklyPlanSlot.plan_id.in_(plan_ids))
        .order_by(WeeklyPlanSlot.day_of_week)
    ):
        grouped[slot.plan_id].append(slot)
    return grouped


def _template_names(db: Session, user: User, template_ids: set[UUID]) -> dict[UUID, str]:
    if not template_ids:
        return {}
    return {
        template.id: template.name
        for template in db.scalars(
            select(WorkoutTemplate).where(
                WorkoutTemplate.user_id == user.id, WorkoutTemplate.id.in_(template_ids)
            )
        )
    }


def _plan_out(
    plan: WeeklyPlan, slots: list[WeeklyPlanSlot], names: dict[UUID, str]
) -> PlanOut:
    out_slots = []
    for slot in slots:
        template_id = slot.template_id if slot.template_id in names else None
        out_slots.append(
            PlanSlotOut(
                id=slot.id,
                day_of_week=slot.day_of_week,
                template_id=template_id,
                template_name=names.get(template_id) if template_id is not None else None,
            )
        )
    return PlanOut(id=plan.id, name=plan.name, is_active=plan.is_active, slots=out_slots)


def _plans_out(db: Session, user: User, plans: list[WeeklyPlan]) -> list[PlanOut]:
    grouped = _slots_map(db, [plan.id for plan in plans])
    template_ids = {
        slot.template_id
        for slots in grouped.values()
        for slot in slots
        if slot.template_id is not None
    }
    names = _template_names(db, user, template_ids)
    return [_plan_out(plan, grouped.get(plan.id, []), names) for plan in plans]


def _plan_body(db: Session, user: User, plan: WeeklyPlan) -> PlanOut:
    return _plans_out(db, user, [plan])[0]


@router.get("/plans", response_model=list[PlanOut])
def list_plans(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[PlanOut]:
    plans = list(
        db.scalars(
            select(WeeklyPlan)
            .where(WeeklyPlan.user_id == user.id)
            .order_by(WeeklyPlan.name_lower)
        )
    )
    return _plans_out(db, user, plans)


@router.post("/plans", response_model=PlanOut, status_code=201)
def create_plan(
    payload: PlanIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> PlanOut:
    name_lower = payload.name.lower()
    if _find_by_name(db, user, name_lower) is not None:
        raise HTTPException(status_code=409, detail=DUPLICATE_DETAIL)
    _validate_templates(db, user, payload.slots)
    plan = WeeklyPlan(
        id=uuid4(),
        user_id=user.id,
        name=payload.name,
        name_lower=name_lower,
        is_active=payload.is_active,
    )
    try:
        if payload.is_active:
            _deactivate_others(db, user, plan.id)
        db.add(plan)
        db.flush()
        _replace_slots(db, plan, payload.slots)
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail=DUPLICATE_DETAIL) from exc
    return _plan_body(db, user, plan)


@router.get("/plans/{plan_id}", response_model=PlanOut)
def get_plan(
    plan_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> PlanOut:
    return _plan_body(db, user, _get_owned(db, user, plan_id))


@router.patch("/plans/{plan_id}", response_model=PlanOut)
def patch_plan(
    plan_id: UUID,
    payload: PlanPatch,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> PlanOut:
    plan = _get_owned(db, user, plan_id)
    try:
        if "name" in payload.model_fields_set:
            name_lower = payload.name.lower()
            existing = _find_by_name(db, user, name_lower)
            if existing is not None and existing.id != plan.id:
                raise HTTPException(status_code=409, detail=DUPLICATE_DETAIL)
            plan.name = payload.name
            plan.name_lower = name_lower
        if "slots" in payload.model_fields_set:
            _validate_templates(db, user, payload.slots)
            _replace_slots(db, plan, payload.slots)
        db.commit()
    except HTTPException:
        db.rollback()
        raise
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail=DUPLICATE_DETAIL) from exc
    return _plan_body(db, user, plan)


@router.delete("/plans/{plan_id}", status_code=204)
def delete_plan(
    plan_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    plan = _get_owned(db, user, plan_id)
    for slot in list(
        db.scalars(select(WeeklyPlanSlot).where(WeeklyPlanSlot.plan_id == plan.id))
    ):
        db.delete(slot)
    db.delete(plan)
    db.commit()
    return Response(status_code=204)


@router.post("/plans/{plan_id}/activate", response_model=PlanOut)
def activate_plan(
    plan_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> PlanOut:
    plan = _get_owned(db, user, plan_id)
    try:
        _deactivate_others(db, user, plan.id)
        plan.is_active = True
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail=DUPLICATE_DETAIL) from exc
    return _plan_body(db, user, plan)


def _resolve_week_start(user: User, week_start: date | None) -> date:
    if week_start is None:
        monday = bucket_start(datetime.now(UTC), user.timezone, "week")
        return monday.astimezone(ZoneInfo(user.timezone)).date()
    if week_start.weekday() != 0:
        raise HTTPException(status_code=422, detail="week_start must be a Monday")
    return week_start


@router.get("/calendar", response_model=CalendarOut)
def get_calendar(
    week_start: date | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> CalendarOut:
    tzinfo = ZoneInfo(user.timezone)
    monday = _resolve_week_start(user, week_start)
    local_start = datetime.combine(monday, time.min, tzinfo=tzinfo)
    start = local_start.astimezone(UTC)
    end = (local_start + timedelta(days=7)).astimezone(UTC)

    plan = db.scalar(
        select(WeeklyPlan).where(
            WeeklyPlan.user_id == user.id, WeeklyPlan.is_active.is_(True)
        )
    )
    slots_by_day: dict[int, WeeklyPlanSlot] = {}
    names: dict[UUID, str] = {}
    if plan is not None:
        for slot in db.scalars(
            select(WeeklyPlanSlot).where(WeeklyPlanSlot.plan_id == plan.id)
        ):
            slots_by_day[slot.day_of_week] = slot
        names = _template_names(
            db,
            user,
            {slot.template_id for slot in slots_by_day.values() if slot.template_id},
        )

    workout_ids_by_date: dict[date, list[UUID]] = defaultdict(list)
    for workout in db.scalars(
        select(Workout)
        .where(
            Workout.user_id == user.id,
            Workout.performed_at >= start,
            Workout.performed_at < end,
        )
        .order_by(Workout.performed_at, Workout.id)
    ):
        local_date = bucket_start(
            stored_utc(workout.performed_at), user.timezone, "day"
        ).astimezone(tzinfo).date()
        workout_ids_by_date[local_date].append(workout.id)

    days: list[CalendarDayOut] = []
    planned_days = 0
    completed_days = 0
    for offset in range(7):
        local_date = monday + timedelta(days=offset)
        slot = slots_by_day.get(offset)
        template_id = slot.template_id if slot is not None else None
        if template_id is not None and template_id not in names:
            template_id = None
        workout_ids = workout_ids_by_date.get(local_date, [])
        completed = bool(workout_ids)
        if template_id is not None:
            planned_days += 1
            if completed:
                completed_days += 1
        days.append(
            CalendarDayOut(
                date=local_date,
                day_of_week=offset,
                template_id=template_id,
                template_name=names.get(template_id) if template_id is not None else None,
                completed=completed,
                workout_ids=workout_ids,
            )
        )

    return CalendarOut(
        week_start=start,
        week_end=end,
        plan=CalendarPlanOut(id=plan.id, name=plan.name) if plan is not None else None,
        days=days,
        adherence=CalendarAdherenceOut(
            planned_days=planned_days, completed_days=completed_days
        ),
    )
