import uuid
from datetime import UTC, datetime

import pytest
from sqlalchemy import select

from app.models import CardioActivity, CardioSplit, User

BASE_PAYLOAD = {
    "performed_at": "2026-09-15T06:00:00Z",
    "type": "run",
    "distance_m": 10500,
    "duration_s": 3000,
}


def _create(auth_client, **overrides):
    payload = {**BASE_PAYLOAD, **overrides}
    return auth_client.post("/api/cardio", json=payload)


def test_create_with_splits_persists_and_get_returns_stored(auth_client, db):
    created = _create(
        auth_client,
        splits=[
            {"distance_m": 1000, "duration_s": 300},
            {"distance_m": 400, "duration_s": 160},
        ],
    )
    assert created.status_code == 201
    activity_id = created.json()["id"]

    body = auth_client.get(f"/api/cardio/splits/{activity_id}").json()
    assert body["source"] == "stored"
    assert body["splits"] == [
        {"split_number": 1, "distance_m": 1000.0, "duration_s": 300},
        {"split_number": 2, "distance_m": 400.0, "duration_s": 160},
    ]

    rows = db.scalars(
        select(CardioSplit)
        .where(CardioSplit.cardio_activity_id == uuid.UUID(activity_id))
        .order_by(CardioSplit.split_number)
    ).all()
    assert [(row.split_number, row.distance_m, row.duration_s) for row in rows] == [
        (1, 1000.0, 300),
        (2, 400.0, 160),
    ]


def test_explicit_split_numbers_are_kept(auth_client):
    created = _create(
        auth_client,
        splits=[
            {"split_number": 2, "distance_m": 500, "duration_s": 150},
            {"split_number": 1, "distance_m": 1000, "duration_s": 290},
        ],
    )
    assert created.status_code == 201
    body = auth_client.get(f"/api/cardio/splits/{created.json()['id']}").json()
    assert body["source"] == "stored"
    assert [split["split_number"] for split in body["splits"]] == [1, 2]
    assert [split["distance_m"] for split in body["splits"]] == [1000.0, 500.0]


def test_create_without_splits_is_derived(auth_client, db):
    created = _create(auth_client)
    body = auth_client.get(f"/api/cardio/splits/{created.json()['id']}").json()
    assert body["source"] == "derived"
    assert db.scalars(select(CardioSplit)).all() == []


def test_patch_replaces_splits(auth_client, db):
    created = _create(auth_client, splits=[{"distance_m": 1000, "duration_s": 300}])
    activity_id = created.json()["id"]

    patched = auth_client.patch(
        f"/api/cardio/{activity_id}",
        json={"splits": [{"distance_m": 2000, "duration_s": 620}]},
    )
    assert patched.status_code == 200

    body = auth_client.get(f"/api/cardio/splits/{activity_id}").json()
    assert body["source"] == "stored"
    assert body["splits"] == [{"split_number": 1, "distance_m": 2000.0, "duration_s": 620}]
    assert db.scalars(select(CardioSplit)).all()[0].split_number == 1


def test_patch_with_empty_splits_clears_to_derived(auth_client):
    created = _create(auth_client, splits=[{"distance_m": 1000, "duration_s": 300}])
    activity_id = created.json()["id"]

    patched = auth_client.patch(f"/api/cardio/{activity_id}", json={"splits": []})
    assert patched.status_code == 200
    body = auth_client.get(f"/api/cardio/splits/{activity_id}").json()
    assert body["source"] == "derived"
    assert len(body["splits"]) == 11


def test_patch_without_splits_keeps_stored(auth_client):
    created = _create(auth_client, splits=[{"distance_m": 1000, "duration_s": 300}])
    activity_id = created.json()["id"]

    patched = auth_client.patch(f"/api/cardio/{activity_id}", json={"notes": "kept"})
    assert patched.status_code == 200
    body = auth_client.get(f"/api/cardio/splits/{activity_id}").json()
    assert body["source"] == "stored"
    assert len(body["splits"]) == 1


def test_derived_splits_last_remainder_proportional(auth_client):
    created = _create(auth_client)
    body = auth_client.get(f"/api/cardio/splits/{created.json()['id']}").json()

    assert body["source"] == "derived"
    splits = body["splits"]
    assert len(splits) == 11
    assert [split["split_number"] for split in splits] == list(range(1, 12))
    assert [split["distance_m"] for split in splits[:10]] == [1000.0] * 10
    assert splits[-1]["distance_m"] == pytest.approx(500.0)

    full_km_s = 3000 / 10.5
    for split in splits[:10]:
        assert split["duration_s"] == pytest.approx(full_km_s, abs=1.0)
    assert splits[-1]["duration_s"] == pytest.approx(full_km_s / 2, abs=1.0)
    assert sum(split["duration_s"] for split in splits) == 3000


def test_derived_splits_exact_kilometers(auth_client):
    created = _create(auth_client, distance_m=3000, duration_s=900)
    body = auth_client.get(f"/api/cardio/splits/{created.json()['id']}").json()
    assert body["source"] == "derived"
    assert body["splits"] == [
        {"split_number": 1, "distance_m": 1000.0, "duration_s": 300},
        {"split_number": 2, "distance_m": 1000.0, "duration_s": 300},
        {"split_number": 3, "distance_m": 1000.0, "duration_s": 300},
    ]


def test_derived_splits_empty_without_distance(auth_client):
    for distance in (None, 0):
        created = _create(auth_client, distance_m=distance)
        body = auth_client.get(f"/api/cardio/splits/{created.json()['id']}").json()
        assert body == {"source": "derived", "splits": []}


def test_derived_splits_are_never_persisted(auth_client, db):
    created = _create(auth_client)
    for _ in range(2):
        auth_client.get(f"/api/cardio/splits/{created.json()['id']}")
    assert db.scalars(select(CardioSplit)).all() == []


@pytest.mark.parametrize(
    "split",
    [
        {"distance_m": 0, "duration_s": 100},
        {"distance_m": -100, "duration_s": 100},
        {"distance_m": 100, "duration_s": 0},
        {"distance_m": 100, "duration_s": -5},
        {"split_number": 0, "distance_m": 100, "duration_s": 100},
    ],
)
def test_invalid_split_values_422(auth_client, split):
    assert _create(auth_client, splits=[split]).status_code == 422


@pytest.mark.parametrize(
    "splits",
    [
        [
            {"split_number": 1, "distance_m": 1000, "duration_s": 300},
            {"split_number": 1, "distance_m": 1000, "duration_s": 300},
        ],
        [
            {"split_number": 2, "distance_m": 1000, "duration_s": 300},
            {"distance_m": 1000, "duration_s": 300},
        ],
    ],
)
def test_duplicate_split_numbers_422(auth_client, splits):
    assert _create(auth_client, splits=splits).status_code == 422


def test_invalid_splits_on_patch_422_and_stored_unchanged(auth_client):
    created = _create(auth_client, splits=[{"distance_m": 1000, "duration_s": 300}])
    activity_id = created.json()["id"]

    assert (
        auth_client.patch(
            f"/api/cardio/{activity_id}",
            json={"splits": [{"distance_m": 0, "duration_s": 10}]},
        ).status_code
        == 422
    )
    body = auth_client.get(f"/api/cardio/splits/{activity_id}").json()
    assert body["source"] == "stored"
    assert len(body["splits"]) == 1


def test_splits_ownership_404(auth_client, db):
    other = User(id=uuid.uuid4(), username="other", password_hash="x")
    db.add(other)
    db.commit()
    foreign = CardioActivity(
        id=uuid.uuid4(),
        user_id=other.id,
        performed_at=datetime(2026, 9, 1, tzinfo=UTC),
        type="run",
        distance_m=5000,
        duration_s=1500,
    )
    db.add(foreign)
    db.commit()

    assert auth_client.get(f"/api/cardio/splits/{foreign.id}").status_code == 404
    assert (
        auth_client.patch(
            f"/api/cardio/{foreign.id}",
            json={"splits": [{"distance_m": 1000, "duration_s": 300}]},
        ).status_code
        == 404
    )
    assert auth_client.get(f"/api/cardio/splits/{uuid.uuid4()}").status_code == 404
