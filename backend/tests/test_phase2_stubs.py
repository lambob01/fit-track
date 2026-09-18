import pytest

PREFIXES = ["/api/measurements", "/api/photos", "/api/tags", "/api/shoes"]


@pytest.mark.parametrize("prefix", PREFIXES)
def test_phase2_endpoints_return_501(auth_client, prefix):
    get_response = auth_client.get(prefix)
    assert get_response.status_code == 501
    assert get_response.json() == {"detail": "Not implemented in MVP"}

    post_response = auth_client.post(prefix, json={})
    assert post_response.status_code == 501
    assert post_response.json() == {"detail": "Not implemented in MVP"}


@pytest.mark.parametrize("prefix", PREFIXES)
def test_phase2_requires_auth_before_501(client, prefix):
    assert client.get(prefix).status_code == 401
    assert client.post(prefix, json={}).status_code == 401
