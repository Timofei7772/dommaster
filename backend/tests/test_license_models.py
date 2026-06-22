from datetime import datetime, timedelta, timezone


def test_license_defaults_include_expected_status_and_limits():
    from app.models.license import License

    license_obj = License(
        license_key="ZARU-ABCD-EFGH-JKLM-NPQR",
        license_type="standard",
        max_pcs=1,
        issued_date=datetime.now(timezone.utc),
        expires_at=datetime.now(timezone.utc) + timedelta(days=365),
    )

    assert license_obj.status == "active"
    assert license_obj.max_pcs == 1


def test_activation_model_supports_slot_and_hardware_fingerprint():
    from app.models.license import LicenseActivation

    activation = LicenseActivation(
        device_slot_id=1,
        hardware_fingerprint="abc123",
        status="active",
    )

    assert activation.device_slot_id == 1
    assert activation.hardware_fingerprint == "abc123"
