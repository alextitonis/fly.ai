from typing import TypedDict


class TemplateExample(TypedDict, total=False):
    input: str
    output: str
    score: float
    label: str


class TemplateVariant(TypedDict, total=False):
    content: str
    version: int
    score: float
    source: str


class TemplateSuggestion(TypedDict):
    template: str
    score: float
    rationale: str
    examples: list[TemplateExample]
    metrics: dict[str, float]


class TemplateMetadata(TypedDict, total=False):
    version: int
    created_at: str
    updated_at: str
    usage_count: int
    avg_score: float
    category: str
    source: str


class TemplateEntry(TypedDict):
    content: str
    metadata: TemplateMetadata
    scores: list[dict[str, float]]
    variants: list[TemplateVariant]
