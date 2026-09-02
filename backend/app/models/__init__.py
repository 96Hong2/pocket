"""ORM 모델. alembic autogenerate 가 보려면 여기서 전부 import 되어 있어야 한다."""

from app.db.base import Base
from app.models.asset import AssetGroup, AssetItem, AssetSnapshot, AssetSource
from app.models.budget import Budget, CategoryBudget
from app.models.category import Category, CategoryKind
from app.models.goal import (
    Goal,
    GoalContribution,
    GoalContributionSource,
    GoalStatus,
)
from app.models.import_batch import ImportBatch, ImportBatchStatus, ImportCandidate
from app.models.merchant_rule import MerchantRule
from app.models.preference import (
    HomeHero,
    NotificationFrequency,
    NotificationSetting,
    RecordMethod,
    UserPreference,
)
from app.models.transaction import Transaction, TransactionSource, TransactionType
from app.models.user import User

__all__ = [
    "AssetGroup",
    "AssetItem",
    "AssetSnapshot",
    "AssetSource",
    "Base",
    "Budget",
    "Category",
    "CategoryBudget",
    "CategoryKind",
    "Goal",
    "GoalContribution",
    "GoalContributionSource",
    "GoalStatus",
    "HomeHero",
    "ImportBatch",
    "ImportBatchStatus",
    "ImportCandidate",
    "MerchantRule",
    "NotificationFrequency",
    "NotificationSetting",
    "RecordMethod",
    "Transaction",
    "TransactionSource",
    "TransactionType",
    "User",
    "UserPreference",
]
