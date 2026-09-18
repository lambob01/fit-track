import pytest


@pytest.mark.parametrize("prefix", ["/api/measurements", "/api/photos", "/api/tags", "/api/shoes"])
def test_phase2_endpoints_return_501(auth_client, prefix):
    assert auth_client.get(prefix).status_code == 501
    assert auth_client.post(prefix, json={}).status_code == 501
