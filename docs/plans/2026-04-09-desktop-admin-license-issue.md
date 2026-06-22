## Desktop Admin License Issue

### Goal
Добавить в desktop-версию SmetaAI кнопку ручной выдачи лицензии покупателю без изменения текущей логики активации и оплаты.

### Decisions
- Не создаём новую систему генерации ключей.
- Используем существующий `LicenseIssuer.issue_license(...)`.
- Добавляем отдельный admin-only backend endpoint.
- Защита endpoint через `LICENSE_ADMIN_SECRET`.
- В UI добавляем desktop-only блок `Выдать лицензию покупателю`.

### Scope
1. Backend:
   - `POST /api/license/admin/issue`
   - request body: `email`, `plan`
   - header: `X-Admin-Secret`
   - response: `license_key`, `expires_at`, `plan`, `max_pcs`
2. Frontend:
   - форма `email + тариф + admin secret`
   - кнопка генерации
   - вывод результата и копирование ключа
3. Tests:
   - success with valid secret
   - reject without/with invalid secret

### Non-Goals
- Не меняем `/activate`, `/validate`, `/deactivate`.
- Не добавляем новый алгоритм лицензий.
- Не встраиваем сюда автоматическую email-рассылку.

### Risks
- Нельзя раскрыть выдачу обычным пользователям.
- Нельзя ломать существующие backend-тесты активации.

### Verification
- `python -m pytest -q backend/tests/test_license_api.py`
- `npm run lint`
- `npm run build`
