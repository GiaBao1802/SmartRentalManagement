/**
 * Actual-browser checks for the documented Codex CUA Tab API.
 * Call these against localhost:3002, using enrollment-dev-harness.ts.
 * Runtime links/credentials must remain in memory; never serialize them.
 * Password creation/reset is a HUMAN handoff, not an automated browser action.
 * These functions throw on failure; returned records contain no user input.
 */
const check = (condition, message) => { if (!condition) throw Error(message); };
export async function linkState(tab, expected) {
  const states = {
    ready: 'Liên kết hợp lệ đến', missing: 'Liên kết thiếu mã xác minh',
    invalid: 'Liên kết không hợp lệ, đã dùng hoặc đã hết hạn',
    unavailable: 'Kênh kiểm tra tạm thời không khả dụng',
  };
  await tab.playwright.getByText(states[expected], { exact: false }).waitFor({ state: 'visible', timeoutMs: 15000 });
  check(!(await tab.url()).includes('#'), 'Credential fragment must be removed');
  const passwords = await tab.playwright.locator('input[autocomplete="new-password"]').count();
  check(passwords === (expected === 'ready' ? 2 : 0), 'Password fields must match the inspected link state');
  return { test: `link-${expected}`, status: 'PASS' };
}
export async function emptyPasswordValidation(tab, submitName) {
  // Empty submit checks local validation without entering/changing credentials.
  await tab.playwright.getByRole('button', { name: submitName, exact: true }).click();
  await tab.playwright.getByText('Mật khẩu cần từ 12 đến 1024 ký tự.', { exact: true }).waitFor({ state: 'visible' });
  check(await tab.playwright.locator('input[aria-invalid="true"]').count() === 1, 'Field error must be linked');
  return { test: 'empty-password-validation', status: 'PASS' };
}
export async function visibilityAndKeyboard(tab) {
  const input = tab.playwright.getByRole('textbox', { name: 'Mật khẩu mới', exact: true });
  await tab.playwright.getByRole('button', { name: 'Hiện mật khẩu mới', exact: true }).click();
  check(await input.getAttribute('type') === 'text', 'Show password');
  await tab.playwright.getByRole('button', { name: 'Ẩn mật khẩu mới', exact: true }).press('Enter');
  check(await input.getAttribute('type') === 'password', 'Hide password using keyboard');
  return { test: 'password-visibility-keyboard', status: 'PASS' };
}
export async function layout(tab, width) {
  const result = await tab.playwright.evaluate(() => ({
    width: window.innerWidth, content: document.documentElement.scrollWidth,
    fields: Array.from(document.querySelectorAll('input')).filter(e => e.offsetWidth > 0).map(e => ({
      size: getComputedStyle(e).fontSize, label: Boolean(e.labels?.length),
      autocomplete: e.getAttribute('autocomplete'),
    })),
  }));
  check(result.width === width, 'Viewport override did not apply');
  check(result.content <= width, 'Unexpected horizontal overflow');
  check(result.fields.every(f => parseFloat(f.size) >= 16 && f.label && f.autocomplete), 'Input typography/label/autocomplete');
  return { test: `layout-${width}`, status: 'PASS', ...result };
}
export async function completed(tab, purpose) {
  // Invoke only AFTER the human has submitted the new password.
  await tab.playwright.getByText(purpose === 'invitation' ? 'Tài khoản đã được thiết lập.' : 'Đã đặt lại mật khẩu và thu hồi các phiên cũ.', { exact: false }).waitFor({ state: 'visible', timeoutMs: 15000 });
  check(await tab.playwright.locator('input[autocomplete="new-password"]').count() === 0, 'Success must clear credential form');
  return { test: `${purpose}-browser-success`, status: 'PASS' };
}
export async function unknownForgot(tab) {
  await tab.playwright.getByRole('textbox', { name: 'Email hoặc số điện thoại', exact: true }).fill('does-not-exist@example.test');
  await tab.playwright.getByRole('button', { name: 'Gửi yêu cầu xác minh', exact: true }).click();
  await tab.playwright.getByRole('status').filter({ hasText: 'Thông báo này không xác nhận tài khoản có tồn tại hay tin đã gửi.' }).waitFor({ state: 'visible' });
  return { test: 'unknown-forgot-generic', status: 'PASS' };
}
