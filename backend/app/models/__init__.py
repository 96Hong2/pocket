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
from app.models.merchant_rule import MerchantRule, MerchantRuleSource
from app.models.parse_usage import ParseUsage
from app.models.preference import (
    HomeHero,
    NotificationFrequency,
    NotificationSetting,
    RecordMethod,
    UserPreference,
)
from app.models.recurring import RecurringExpense
from app.models.tag import Tag, TagColor, TagKind
from app.models.transaction import (
    PaymentMethod,
    Transaction,
    TransactionSource,
    TransactionType,
)
from app.models.user import AgeBand, Gender, LoginCode, User, UserDevice

__all__ = [
    "AgeBand",
    "AssetGroup",
    "AssetItem",
    "AssetSnapshot",
    "AssetSource",
    "Base",
    "Budget",
    "Category",
    "CategoryBudget",
    "CategoryKind",
    "Gender",
    "Goal",
    "GoalContribution",
    "GoalContributionSource",
    "GoalStatus",
    "HomeHero",
    "ImportBatch",
    "ImportBatchStatus",
    "ImportCandidate",
    "LoginCode",
    "MerchantRule",
    "MerchantRuleSource",
    "NotificationFrequency",
    "NotificationSetting",
    "ParseUsage",
    "PaymentMethod",
    "RecordMethod",
    "RecurringExpense",
    "Tag",
    "TagColor",
    "TagKind",
    "Transaction",
    "TransactionSource",
    "TransactionType",
    "User",
    "UserDevice",
    "UserPreference",
]
