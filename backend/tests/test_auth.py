import pytest

from tests.conftest import PASSWORD, login, make_user

SIGNUP = {"email": "Shop@Example.com", "full_name": "Small Shop", "password": "Str0ng!pass"}


def test_health(client):
    assert client.get("/api/v1/health").json() == {"status": "ok"}


def test_signup_creates_customer_and_session(client):
    res = client.post("/api/v1/auth/signup", json=SIGNUP)
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["role"] == "customer"
    assert body["email"] == "shop@example.com"
    assert body["customer_id"] is not None
    assert "bl_session" in res.cookies
    assert client.get("/api/v1/auth/me").json()["email"] == "shop@example.com"


def test_email_is_unique_case_insensitive(client):
    assert client.post("/api/v1/auth/signup", json=SIGNUP).status_code == 201
    dup = client.post("/api/v1/auth/signup", json={**SIGNUP, "email": "SHOP@example.com"})
    assert dup.status_code == 409
    assert dup.json()["error"]["code"] == "DUPLICATE"


@pytest.mark.parametrize(
    "password",
    [
        "Short!1a",  # exactly 8 chars: must be MORE than eight
        "alllower!case",  # no uppercase
        "ALLUPPER!CASE",  # no lowercase
        "NoSpecialChars1",  # no special character
    ],
)
def test_password_policy(client, password):
    res = client.post("/api/v1/auth/signup", json={**SIGNUP, "password": password})
    assert res.status_code == 422
    assert res.json()["error"]["code"] == "VALIDATION_ERROR"


def test_nine_char_password_without_digit_is_accepted(client):
    res = client.post("/api/v1/auth/signup", json={**SIGNUP, "password": "Abcdefg!h"})
    assert res.status_code == 201, res.text


def test_signup_cannot_choose_role(client):
    res = client.post("/api/v1/auth/signup", json={**SIGNUP, "role": "admin"})
    assert res.status_code == 422


def test_login_wrong_password_and_unknown_email_look_identical(client, db):
    make_user(db, "staff")
    a = client.post("/api/v1/auth/login", json={"email": "staff@example.com", "password": "x"})
    b = client.post("/api/v1/auth/login", json={"email": "nobody@example.com", "password": "x"})
    assert a.status_code == b.status_code == 401
    assert a.json() == b.json()


def test_logout_clears_session(client, db):
    login(client, make_user(db, "staff").email)
    assert client.post("/api/v1/auth/logout").status_code == 204
    assert client.get("/api/v1/auth/me").status_code == 401


def test_cross_site_post_is_blocked(client):
    res = client.post(
        "/api/v1/auth/signup", json=SIGNUP, headers={"Origin": "https://evil.example"}
    )
    assert res.status_code == 403


def test_only_admin_creates_staff(client, db):
    new_staff = {
        "email": "rep@brightloop.example.com",
        "full_name": "Sales Rep",
        "password": PASSWORD,
    }
    login(client, make_user(db, "staff").email)
    assert client.post("/api/v1/users/staff", json=new_staff).status_code == 403

    login(client, make_user(db, "admin").email)
    res = client.post("/api/v1/users/staff", json=new_staff)
    assert res.status_code == 201, res.text
    assert res.json()["role"] == "staff"


def test_customer_cannot_list_users(client, db):
    login(client, make_user(db, "customer").email)
    assert client.get("/api/v1/users").status_code == 403


def test_deactivation_revokes_sessions(client, db):
    staff = make_user(db, "staff")
    admin = make_user(db, "admin")
    login(client, admin.email)
    assert client.patch(f"/api/v1/users/{staff.id}", json={"is_active": False}).status_code == 200
    login_res = client.post("/api/v1/auth/login", json={"email": staff.email, "password": PASSWORD})
    assert login_res.status_code == 401
