"""Canonical domain enums that must not be duplicated by API layers."""

import enum


class UserRole(str, enum.Enum):
    """Employee roles; customers are represented by Client, never User."""

    ADMIN = "admin"
    MANAGER = "manager"
    ESTIMATOR = "estimator"
    VIEWER = "viewer"
    OWNER = "owner"
    WORKER = "worker"


class WorkStageStatus(str, enum.Enum):
    """Stage states compatible with the existing desktop API."""

    PENDING = "not_started"
    ASSIGNED = "in_progress"
    REVIEW = "review"
    COMPLETED = "done"
    DELAYED = "delayed"
