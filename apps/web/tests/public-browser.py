"""Real public purchase against isolated local API and PostgreSQL fixtures.
Seed with apps/api/scripts/public-browser-fixture.mjs; never intercepts API data.
"""
import json
import os
import time
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
from pypdf import PdfReader

BASE = os.environ.get('BROWSER_BASE_URL', 'http://127.0.0.1:3187')
ARTIFACTS = Path('/tmp/hilal-sales')
fixture = json.loads((ARTIFACTS / 'browser-fixture.json').read_text())

def run():
    candidate_name = 'Brauzer Namizədi ' + str(time.time_ns())
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={'width': 1280, 'height': 960})
        page = context.new_page()
        errors = []
        console_errors = []
        page.on('console', lambda message: console_errors.append(message.text) if message.type == 'error' and 'net::ERR_FAILED' not in message.text else None)
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(BASE)
        page.wait_for_load_state('networkidle')
        expect(page.get_by_role('heading', name='İmtahanlar', exact=True)).to_be_visible()
        assert page.url.rstrip('/') == BASE
        assert page.evaluate('sessionStorage.getItem("hilal.session")') is None
        expect(page.get_by_role('link', name='İdarəetmə paneli')).to_have_attribute('href', '/login')
        card = page.locator('[data-slot="card"]').filter(has_text=fixture['examCode'])
        expect(card).to_contain_text('35.75 AZN')
        expect(card).not_to_contain_text('BROWSER-CLOSED')
        for width in [375, 768, 1280]:
            page.set_viewport_size({'width': width, 'height': 960})
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), width
            page.screenshot(path=str(ARTIFACTS / f'public-{width}.png'), full_page=True)
        card.get_by_role('button', name='Bilet al', exact=True).click()
        expect(page.get_by_role('heading', name='Bilet sifarişi')).to_be_focused()
        page.get_by_role('button', name='Bileti sifariş et').click()
        expect(page.locator('p[role=alert]')).to_contain_text('adını və soyadını')
        page.get_by_label('Namizədin adı və soyadı').fill(candidate_name)
        page.get_by_label('Valideynin mobil nömrəsi').fill('123')
        page.get_by_role('button', name='Bileti sifariş et').click()
        expect(page.locator('p[role=alert]')).to_contain_text('mobil nömrəsi')
        page.get_by_label('Valideynin mobil nömrəsi').fill('0507654321')
        page.get_by_label('Ödəniş ediləcək filial').select_option(fixture['branchId'])
        page.get_by_label('Sessiya', exact=True).select_option(fixture['sessionId'])
        # Simulate lost response AFTER the real backend commits the order.
        lost = []
        def lose_response(route):
            response = route.fetch()
            assert response.status == 201, response.text()
            lost.append(response.json())
            route.abort('failed')
        page.route('**/api/public/orders', lose_response, times=1)
        page.get_by_role('button', name='Bileti sifariş et').click()
        expect(page.locator('p[role=alert]')).to_contain_text('Məlumatlarınız saxlanılıb')
        expect(page.get_by_label('Namizədin adı və soyadı')).to_have_value(candidate_name)
        page.get_by_role('button', name='Bileti sifariş et').click()
        page.wait_for_url('**/orders/**')
        assert lost[0]['receiptToken'] in page.url
        expect(page.get_by_role('heading', name='Hilal Bilet')).to_be_visible()
        expect(page.get_by_text('Ödəniş gözlənilir', exact=True)).to_be_visible()
        expect(page.locator('.public-ticket').get_by_text('35.75 AZN', exact=True)).to_be_visible()
        receipt_url = page.url
        code = page.locator('dd').first.inner_text()
        qr = page.locator('.public-qr svg')
        expect(qr).to_be_visible()
        # Capture the rendered QR and verify its public destination separately.
        qr.screenshot(path=str(ARTIFACTS / 'qr.png'))
        verify_path = page.get_by_role('link', name='Biletin həqiqiliyini yoxla').get_attribute('href')
        verify = context.request.get(BASE + '/api/ticket/verify/' + verify_path.rsplit('/',1)[1])
        assert verify.status == 200
        public_json = verify.text()
        for private in [candidate_name, '0507654321', fixture['branchId'], lost[0]['receiptToken']]:
            assert private not in public_json
        page.reload()
        expect(page.get_by_text(code, exact=True)).to_be_visible()
        for width in [375, 768, 1280]:
            page.set_viewport_size({'width': width, 'height': 960})
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), width
            page.screenshot(path=str(ARTIFACTS / f'receipt-{width}.png'), full_page=True)
        page.emulate_media(media='print')
        page.pdf(path=str(ARTIFACTS / 'ticket-a4.pdf'), prefer_css_page_size=True, print_background=True)
        pdf = PdfReader(ARTIFACTS / 'ticket-a4.pdf')
        assert len(pdf.pages) == 1, len(pdf.pages)
        box = pdf.pages[0].mediabox
        assert abs(float(box.width)-595.3) < 2 and abs(float(box.height)-841.9) < 2, box
        assert code in pdf.pages[0].extract_text()
        page.emulate_media(media='screen')
        page.goto(BASE + verify_path)
        expect(page.get_by_text(code, exact=True)).to_be_visible()
        assert candidate_name not in page.locator('body').inner_text()
        page.goto(BASE + '/tickets/verify')
        page.get_by_label('QR yoxlama keçidi və ya token').fill(BASE + verify_path)
        page.get_by_role('button', name='Yoxla', exact=True).click()
        page.wait_for_url('**' + verify_path)
        page.goto(BASE)
        page.get_by_role('link', name='İdarəetmə paneli').click()
        page.wait_for_url('**/login')
        page.get_by_label('E-poçt ünvanı', exact=True).fill('browser@example.invalid')
        page.get_by_label('Şifrə', exact=True).fill('Local-browser-test-123!')
        page.get_by_role('button', name='Daxil ol', exact=True).click()
        page.wait_for_url('**/dashboard')
        page.goto(BASE + '/dashboard/tickets')
        expect(page.get_by_role('link', name=code, exact=True)).to_be_visible()
        card = page.locator('[data-slot="card"]').filter(has_text=code)
        page.once('dialog', lambda dialog: dialog.accept())
        card.get_by_role('button', name='Ödənişi təsdiqlə').click()
        expect(card).to_contain_text('Ödənilib')
        page.goto(BASE + '/dashboard/users')
        expect(page.get_by_text('browser@example.invalid', exact=True)).to_be_visible()
        page.goto(BASE + '/dashboard/reports')
        expect(page.get_by_role('heading', name='Satış hesabatı')).to_be_visible()
        expect(page.get_by_text('Ödənilib', exact=True).first).to_be_visible()
        page.goto(receipt_url)
        expect(page.get_by_text('Ödənilib', exact=True)).to_be_visible()
        assert not errors, errors
        assert not console_errors, console_errors
        (ARTIFACTS / 'browser-result.json').write_text(json.dumps({'passed': True, 'code': code, 'receipt': receipt_url, 'qr': BASE+verify_path, 'pageErrors': errors, 'consoleErrors': console_errors, 'pdfPages': 1}))
        browser.close()
    print('PASS: real anonymous purchase; lost-response recovery; QR privacy; A4 1-page PDF; reload; mobile/tablet/desktop; staff login; real payment confirmation; users; reports; no page errors.')

if __name__ == '__main__':
    run()
