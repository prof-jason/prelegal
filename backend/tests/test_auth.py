from __future__ import annotations


def test_signup_creates_user(client):
    response = client.post(
        "/api/auth/signup", json={"email": "New@Example.com", "password": "hunter22"}
    )
    assert response.status_code == 201
    body = response.json()
    assert body["email"] == "new@example.com"
    assert "id" in body and "created_at" in body
    assert "password" not in body and "password_hash" not in body


def test_signup_duplicate_email_conflicts(client):
    client.post(
        "/api/auth/signup", json={"email": "dup@example.com", "password": "hunter22"}
    )
    response = client.post(
        "/api/auth/signup", json={"email": "DUP@example.com", "password": "different1"}
    )
    assert response.status_code == 409


def test_signup_short_password_rejected(client):
    response = client.post(
        "/api/auth/signup", json={"email": "short@example.com", "password": "short"}
    )
    assert response.status_code == 422


def test_signup_invalid_email_rejected(client):
    response = client.post(
        "/api/auth/signup", json={"email": "not-an-email", "password": "hunter22"}
    )
    assert response.status_code == 422


def test_login_with_correct_credentials_returns_token(client):
    client.post(
        "/api/auth/signup", json={"email": "login@example.com", "password": "correcthorse"}
    )
    response = client.post(
        "/api/auth/login", json={"email": "login@example.com", "password": "correcthorse"}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["token_type"] == "bearer"
    assert body["access_token"]
    assert body["user"]["email"] == "login@example.com"


def test_login_wrong_password_rejected(client):
    client.post(
        "/api/auth/signup", json={"email": "wrongpw@example.com", "password": "correcthorse"}
    )
    response = client.post(
        "/api/auth/login", json={"email": "wrongpw@example.com", "password": "wrongwrong"}
    )
    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid email or password"


def test_login_unknown_email_rejected_with_same_message(client):
    response = client.post(
        "/api/auth/login", json={"email": "nosuchuser@example.com", "password": "whatever1"}
    )
    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid email or password"


def test_me_requires_token(client):
    response = client.get("/api/auth/me")
    assert response.status_code == 401


def test_me_rejects_garbage_token(client):
    response = client.get(
        "/api/auth/me", headers={"Authorization": "Bearer not-a-real-token"}
    )
    assert response.status_code == 401


def test_me_returns_current_user_with_valid_token(client):
    client.post(
        "/api/auth/signup", json={"email": "me@example.com", "password": "hunter22"}
    )
    login = client.post(
        "/api/auth/login", json={"email": "me@example.com", "password": "hunter22"}
    )
    token = login.json()["access_token"]

    response = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    assert response.json()["email"] == "me@example.com"
