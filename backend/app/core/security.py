"""Security helpers: audit logging and consent enforcement.

This is intentionally lightweight for the reference build. In production, identity comes from
OIDC/JWT (Keycloak) and consent from the ABDM Consent Manager. The *interfaces* here match that
model so the enforcement points already exist.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session


def _fit_audit_value(
    value: str | None,
    limit: int,
    metadata: dict[str, Any],
    key: str,
) -> str | None:
    if value is None or len(value) <= limit:
        return value
    metadata[f"original_{key}"] = value
    return value[:limit]


def audit(
    db: Session,
    *,
    actor_id: str | None,
    actor_role: str,
    action: str,
    entity_type: str,
    entity_id: str | None = None,
    consent_id: str | None = None,
    metadata: dict[str, Any] | None = None,
    ip_address: str | None = None,
) -> None:
    """Write an immutable audit record."""
    from app.models import AuditLog

    audit_metadata = dict(metadata or {})
    db.add(
        AuditLog(
            actor_id=_fit_audit_value(actor_id, 36, audit_metadata, "actor_id"),
            actor_role=_fit_audit_value(actor_role, 40, audit_metadata, "actor_role") or actor_role[:40],
            action=_fit_audit_value(action, 60, audit_metadata, "action") or action[:60],
            entity_type=_fit_audit_value(entity_type, 40, audit_metadata, "entity_type") or entity_type[:40],
            entity_id=_fit_audit_value(entity_id, 36, audit_metadata, "entity_id"),
            consent_id=_fit_audit_value(consent_id, 36, audit_metadata, "consent_id"),
            ip_address=_fit_audit_value(ip_address, 64, audit_metadata, "ip_address"),
            audit_metadata=audit_metadata,
        )
    )
    db.flush()


def require_active_consent(db: Session, patient_id: str, purpose: str = "CARE_MGMT") -> str:
    """Ensure a valid, non-expired, granted consent artifact exists before any PHI read.

    Returns the consent_id to be threaded into the audit trail. Raises 403 otherwise.
    """
    from app.models import ConsentArtifact

    now = datetime.now(timezone.utc)
    stmt = (
        select(ConsentArtifact)
        .where(ConsentArtifact.patient_id == patient_id)
        .where(ConsentArtifact.status == "GRANTED")
        .order_by(ConsentArtifact.granted_at.desc())
    )
    for consent in db.scalars(stmt):
        valid_to = consent.valid_to
        if valid_to is not None and valid_to.tzinfo is None:
            valid_to = valid_to.replace(tzinfo=timezone.utc)
        if valid_to is None or valid_to >= now:
            return consent.consent_id
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="No active consent artifact for this patient. Capture consent before accessing PHI.",
    )
