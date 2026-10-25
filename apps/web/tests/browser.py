"""UI integration checks with intercepted API fixtures; never writes to a database.

Run with a local Next.js server using BROWSER_BASE_URL (default port 3187).
Requires the existing Python Playwright installation and Chromium.
"""
import base64
import json
import os
import time
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

BASE_URL = os.environ.get("BROWSER_BASE_URL", "http://127.0.0.1:3187")
ARTIFACTS = Path(os.environ.get("BROWSER_ARTIFACTS", "/tmp/hilal-ui-screenshots"))
ARTIFACTS.mkdir(parents=True, exist_ok=True)


def run():
    payload = base64.urlsafe_b64encode(json.dumps({"exp": int(time.time()) + 900}).encode()).decode().rstrip("=")
    token = f"e30.{payload}.synthetic-test-signature"
    branches = [{"id": f"fixture-{i}", "name": f"Yoxlama filialı {i}", "code": f"TEST-{i:02}", "phone": "+994 00 000 00 00", "address": "Yalnız test ünvanı", "isActive": True} for i in range(1, 10)]
    identity = {"userId": "test-user", "email": "ui@example.invalid", "fullName": "UI Yoxlaması", "role": "SUPER_ADMIN", "branches": branches}
    writes = []

    def api(route):
        request = route.request
        path = request.url.split("/api", 1)[1]
        if path == "/auth/login":
            assert request.post_data_json == {"email": "ui@example.invalid", "password": "synthetic-password"}
            route.fulfill(status=201, json={"access_token": token})
        elif path == "/auth/me":
            assert request.headers.get("authorization") == f"Bearer {token}"
            route.fulfill(json=identity)
        elif path == "/branches" and request.method == "GET":
            assert request.headers.get("authorization") == f"Bearer {token}"
            route.fulfill(json=[branch for branch in branches if branch["isActive"]])
        elif path == "/branches" and request.method == "POST":
            data = request.post_data_json
            assert set(data) == {"name", "code", "phone", "address", "isActive"}
            branch = {"id": "fixture-created", **data}
            branches.append(branch)
            writes.append(("POST", data))
            route.fulfill(status=201, json=branch)
        elif path.startswith("/branches/") and request.method == "PATCH":
            data = request.post_data_json
            branch = next(branch for branch in branches if branch["id"] == path.split("/")[-1])
            branch.update(data)
            writes.append(("PATCH", data))
            route.fulfill(json=branch)
        else:
            raise AssertionError(f"Unexpected API request: {request.method} {path}")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.route("**/api/**", api)
        page.goto(f"{BASE_URL}/login")
        page.wait_for_load_state("networkidle")
        expect(page.get_by_role("heading", name="Xoş gəlmisiniz.")).to_be_visible()
        page.get_by_role("button", name="Daxil ol", exact=True).click()
        expect(page.get_by_text("E-poçt ünvanınızı daxil edin.")).to_be_visible()
        page.get_by_label("E-poçt ünvanı", exact=True).fill("ui@example.invalid")
        page.get_by_label("Şifrə", exact=True).fill("synthetic-password")
        page.get_by_role("button", name="Şifrəni göstər").click()
        expect(page.locator("#password")).to_have_attribute("type", "text")
        page.get_by_role("button", name="Şifrəni gizlət").click()
        for width in [375, 768, 1280, 1728]:
            page.set_viewport_size({"width": width, "height": 960})
            assert page.evaluate("document.documentElement.scrollWidth <= innerWidth"), f"Login overflow at {width}"
            page.screenshot(path=str(ARTIFACTS / f"login-{width}.png"), full_page=True)
        page.get_by_role("button", name="Daxil ol", exact=True).click()
        page.wait_for_url("**/dashboard")
        expect(page.get_by_role("heading", name="Xoş gördük, UI.")).to_be_visible()
        expect(page.locator(".metric-value").first).to_have_text("09")
        assert page.evaluate("localStorage.length === 0 && sessionStorage.length === 0")
        for width in [375, 768, 1280, 1728]:
            page.set_viewport_size({"width": width, "height": 960})
            assert page.evaluate("document.documentElement.scrollWidth <= innerWidth"), f"Dashboard overflow at {width}"
            page.screenshot(path=str(ARTIFACTS / f"dashboard-{width}.png"), full_page=True)
            if width < 1000:
                page.get_by_role("button", name="Menyunu aç").click()
                expect(page.get_by_role("dialog")).to_be_visible()
                page.keyboard.press("Escape")
                expect(page.get_by_role("dialog")).not_to_be_visible()
        page.get_by_role("link", name="Filiallar", exact=True).click()
        expect(page.get_by_role("heading", name="Filiallar", exact=True)).to_be_visible()
        expect(page.get_by_role("button", name="Növbəti səhifə")).to_be_enabled()
        page.get_by_role("button", name="Növbəti səhifə").click()
        expect(page.get_by_text("9 filialdan 9–9 göstərilir")).to_be_visible()
        page.get_by_label("Filial axtar", exact=True).fill("no-such-branch")
        expect(page.get_by_role("heading", name="Uyğun filial tapılmadı")).to_be_visible()
        page.get_by_role("button", name="Filtrləri təmizlə").click()
        page.get_by_role("button", name="Yeni filial", exact=True).first.click()
        page.get_by_label("Filial adı").fill("Yeni yoxlama filialı")
        page.get_by_label("Filial kodu").fill("TEST-NEW")
        page.get_by_role("button", name="Yadda saxla").click()
        expect(page.get_by_role("status")).to_contain_text("Yeni filial yaradıldı.")
        assert writes[0][0] == "POST"
        page.get_by_label("Filial axtar", exact=True).fill("TEST-NEW")
        expect(page.get_by_text("Yeni yoxlama filialı", exact=True)).to_be_visible()
        page.get_by_role("button", name="Yeni yoxlama filialı filialını redaktə et").click()
        page.get_by_label("Filial aktivdir").uncheck()
        page.get_by_role("button", name="Yadda saxla").click()
        expect(page.get_by_role("heading", name="Filial deaktiv edilsin?")).to_be_visible()
        page.get_by_role("button", name="Geri qayıt").click()
        expect(page.get_by_role("heading", name="Filialı redaktə et")).to_be_visible()
        page.get_by_role("button", name="Yadda saxla").click()
        page.get_by_role("button", name="Deaktiv et", exact=True).click()
        expect(page.get_by_role("status")).to_contain_text("Filial məlumatları yeniləndi.")
        assert writes[-1][0] == "PATCH" and writes[-1][1]["isActive"] is False
        page.get_by_role("button", name="Filtrləri təmizlə").click()
        for width in [375, 768, 1280, 1728]:
            page.set_viewport_size({"width": width, "height": 960})
            assert page.evaluate("document.documentElement.scrollWidth <= innerWidth"), f"Branches overflow at {width}"
            page.screenshot(path=str(ARTIFACTS / f"branches-{width}.png"), full_page=True)
        page.get_by_role("link", name="İşçilər və satıcılar — Tezliklə", exact=True).click()
        expect(page.get_by_text("Tezliklə", exact=True)).to_be_visible()
        assert not errors, errors
        page.reload()
        page.wait_for_load_state("networkidle")
        expect(page.get_by_role("link", name="Hesaba daxil ol", exact=True).first).to_be_visible()
        browser.close()
    print("UI checks passed; API intercepted; no database writes. Screenshots:", ARTIFACTS)


if __name__ == "__main__":
    run()
