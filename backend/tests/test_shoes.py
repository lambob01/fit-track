import uuid

import pytest
from sqlalchemy import select

from app.models import CardioActivity, Shoe, User


def _create_shoe(client, **overrides):
    payload = {"name": "Pegasus 41"}
    payload.update(overrides)
    return client.post("/api/shoes", json=payload)


def _create_run(client, **overrides):
    payload = {
        "performed_at": "2026-09-15T06:00:00Z",
        "type": "run",
        "distance_m": 5000,
        "duration_s": 1500,
    }
    payload.update(overrides)
    return client.post("/api/cardio", json=payload)


def _foreign_shoe(db):
    other = User(id=uuid.uuid4(), username=f"other-{uuid.uuid4()}", password_hash="x")
    db.add(other)
    db.flush()
    shoe = Shoe(id=uuid.uuid4(), user_id=other.id, name="Foreign shoe", initial_distance_m=100)
    db.add(shoe)
    db.commit()
    return shoe


def test_create_and_list_mileage_sums_initial_and_activities(auth_client):
    created = _create_shoe(auth_client, initial_distance_m=12000)
    assert created.status_code == 201
    shoe = created.json()
    assert shoe["name"] == "Pegasus 41"
    assert shoe["initial_distance_m"] == 12000
    assert shoe["mileage_m"] == 12000
    assert shoe["purchased_at"] is None
    assert shoe["retired_at"] is None
    assert shoe["notes"] is None

    assert _create_run(auth_client, shoe_id=shoe["id"], distance_m=3000).status_code == 201
    assert _create_run(auth_client, shoe_id=shoe["id"], distance_m=None).status_code == 201
    assert _create_run(auth_client, distance_m=99999).status_code == 201

    listed = auth_client.get("/api/shoes")
    assert listed.status_code == 200
    body = listed.json()
    assert len(body) == 1
    assert body[0]["id"] == shoe["id"]
    assert body[0]["mileage_m"] == 15000

    fetched = auth_client.get(f"/api/shoes/{shoe['id']}")
    assert fetched.status_code == 200
    assert fetched.json()["mileage_m"] == 15000


def test_defaults_and_validation(auth_client):
    created = _create_shoe(auth_client)
    assert created.status_code == 201
    assert created.json()["initial_distance_m"] == 0
    assert created.json()["mileage_m"] == 0

    assert _create_shoe(auth_client, name="").status_code == 422
    assert _create_shoe(auth_client, name="   ").status_code == 422
    assert _create_shoe(auth_client, initial_distance_m=-1).status_code == 422
    assert _create_shoe(auth_client, unknown_field=1).status_code == 422


def test_patch_updates_and_clears_fields(auth_client):
    shoe = _create_shoe(
        auth_client, purchased_at="2026-01-05", notes="old", retired_at="2026-06-01"
    ).json()

    patched = auth_client.patch(
        f"/api/shoes/{shoe['id']}",
        json={"name": "  Pegasus 42  ", "initial_distance_m": 42.5, "retired_at": None},
    )
    assert patched.status_code == 200
    body = patched.json()
    assert body["name"] == "Pegasus 42"
    assert body["initial_distance_m"] == 42.5
    assert body["retired_at"] is None
    assert body["purchased_at"] == "2026-01-05"
    assert body["notes"] == "old"

    cleared = auth_client.patch(
        f"/api/shoes/{shoe['id']}", json={"purchased_at": None, "notes": None}
    )
    assert cleared.status_code == 200
    assert cleared.json()["purchased_at"] is None
    assert cleared.json()["notes"] is None

    assert auth_client.patch(f"/api/shoes/{shoe['id']}", json={"name": None}).status_code == 422
    assert (
        auth_client.patch(f"/api/shoes/{shoe['id']}", json={"initial_distance_m": -0.5}).status_code
        == 422
    )


def test_patch_mileage_reflects_activities(auth_client):
    shoe = _create_shoe(auth_client, initial_distance_m=1000).json()
    _create_run(auth_client, shoe_id=shoe["id"], distance_m=2500)
    patched = auth_client.patch(f"/api/shoes/{shoe['id']}", json={"name": "Renamed"})
    assert patched.status_code == 200
    assert patched.json()["mileage_m"] == 3500


def test_delete_nulls_shoe_on_runs(auth_client, db):
    shoe = _create_shoe(auth_client).json()
    run = _create_run(auth_client, shoe_id=shoe["id"]).json()
    assert run["shoe_id"] == shoe["id"]

    assert auth_client.delete(f"/api/shoes/{shoe['id']}").status_code == 204
    assert auth_client.get(f"/api/shoes/{shoe['id']}").status_code == 404

    fetched = auth_client.get(f"/api/cardio/{run['id']}")
    assert fetched.status_code == 200
    assert fetched.json()["shoe_id"] is None
    stored = db.execute(
        select(CardioActivity.shoe_id).where(CardioActivity.id == uuid.UUID(run["id"]))
    ).scalar_one()
    assert stored is None


def test_cardio_rejects_foreign_or_unknown_shoe(auth_client, db):
    foreign = _foreign_shoe(db)
    before = len(auth_client.get("/api/cardio").json())

    assert _create_run(auth_client, shoe_id=str(foreign.id)).status_code == 404
    assert _create_run(auth_client, shoe_id=str(uuid.uuid4())).status_code == 404
    assert len(auth_client.get("/api/cardio").json()) == before

    run = _create_run(auth_client).json()
    assert (
        auth_client.patch(
            f"/api/cardio/{run['id']}", json={"shoe_id": str(foreign.id)}
        ).status_code
        == 404
    )
    assert (
        auth_client.patch(
            f"/api/cardio/{run['id']}", json={"shoe_id": str(uuid.uuid4())}
        ).status_code
        == 404
    )

    own = _create_shoe(auth_client).json()
    attached = auth_client.patch(f"/api/cardio/{run['id']}", json={"shoe_id": own["id"]})
    assert attached.status_code == 200
    assert attached.json()["shoe_id"] == own["id"]
    cleared = auth_client.patch(f"/api/cardio/{run['id']}", json={"shoe_id": None})
    assert cleared.status_code == 200
    assert cleared.json()["shoe_id"] is None


def test_shoes_are_scoped_to_the_owner(auth_client, db):
    foreign = _foreign_shoe(db)

    assert auth_client.get("/api/shoes").json() == []
    assert auth_client.get(f"/api/shoes/{foreign.id}").status_code == 404
    assert auth_client.patch(f"/api/shoes/{foreign.id}", json={"name": "Mine"}).status_code == 404
    assert auth_client.delete(f"/api/shoes/{foreign.id}").status_code == 404
    assert db.get(Shoe, foreign.id) is not None


def test_shoes_require_auth(client):
    assert client.get("/api/shoes").status_code == 401
    assert client.post("/api/shoes", json={"name": "Pegasus"}).status_code == 401


@pytest.mark.parametrize("bad_id", ["not-a-uuid"])
def test_malformed_shoe_id_is_422(auth_client, bad_id):
    assert auth_client.get(f"/api/shoes/{bad_id}").status_code == 422
    assert _create_run(auth_client, shoe_id=bad_id).status_code == 422
