from __future__ import annotations

import json
import uuid
from dataclasses import dataclass
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin
from urllib.request import Request, urlopen

from app.core.config import settings


MAX_SUMMARY_ITEMS = 40
MAX_TEXT_LENGTH = 900


@dataclass(frozen=True)
class AIAnalysisExplanation:
    run_id: uuid.UUID
    enabled: bool
    provider: str
    model: str | None
    technical_summary: str
    plain_language_explanation: str
    limitations: list[str]
    suggested_next_experiment: str


def explain_analysis_run(
    *,
    run_id: uuid.UUID,
    analysis_summary: dict[str, object],
) -> AIAnalysisExplanation:
    safe_summary = sanitize_analysis_summary(analysis_summary)
    if not settings.ai_analysis_enabled or not settings.ai_api_key.get_secret_value():
        return _fallback_explanation(run_id=run_id, analysis_summary=safe_summary)

    provider = settings.ai_provider.strip() or "openai_compatible"
    if provider != "openai_compatible":
        return _fallback_explanation(
            run_id=run_id,
            analysis_summary=safe_summary,
            fallback_reason=f"Unsupported AI provider: {provider}.",
        )

    model = settings.ai_model.strip()
    if not model:
        return _fallback_explanation(
            run_id=run_id,
            analysis_summary=safe_summary,
            fallback_reason="AI_MODEL is not configured.",
        )

    try:
        raw_response = _post_openai_compatible(
            model=model,
            analysis_summary=safe_summary,
        )
        return _parse_provider_response(
            run_id=run_id,
            model=model,
            provider=provider,
            raw_response=raw_response,
            analysis_summary=safe_summary,
        )
    except (HTTPError, TimeoutError, URLError, ValueError, OSError, json.JSONDecodeError) as exc:
        return _fallback_explanation(
            run_id=run_id,
            analysis_summary=safe_summary,
            fallback_reason=f"AI provider unavailable: {exc}.",
        )


def sanitize_analysis_summary(value: dict[str, object]) -> dict[str, object]:
    sanitized: dict[str, object] = {}
    for index, (key, raw_value) in enumerate(value.items()):
        if index >= MAX_SUMMARY_ITEMS:
            break
        if _looks_like_raw_payload_key(key):
            continue
        sanitized[key] = _sanitize_value(raw_value, depth=0)
    return sanitized


def _sanitize_value(value: object, *, depth: int) -> object:
    if depth >= 3:
        return "[truncated]"
    if isinstance(value, str):
        return value[:MAX_TEXT_LENGTH]
    if isinstance(value, (int, float, bool)) or value is None:
        return value
    if isinstance(value, dict):
        result: dict[str, object] = {}
        for index, (key, nested_value) in enumerate(value.items()):
            if index >= MAX_SUMMARY_ITEMS:
                result["truncated"] = True
                break
            if _looks_like_raw_payload_key(str(key)):
                continue
            result[str(key)] = _sanitize_value(nested_value, depth=depth + 1)
        return result
    if isinstance(value, (list, tuple)):
        return [_sanitize_value(item, depth=depth + 1) for item in list(value)[:12]]
    return str(value)[:MAX_TEXT_LENGTH]


def _looks_like_raw_payload_key(key: str) -> bool:
    normalized = key.lower()
    blocked_fragments = ("raw", "csv", "hdf5", "rows", "preview_rows", "payload", "password", "secret")
    return any(fragment in normalized for fragment in blocked_fragments)


def _post_openai_compatible(
    *,
    model: str,
    analysis_summary: dict[str, object],
) -> dict[str, Any]:
    base_url = settings.ai_base_url.strip() or "https://api.openai.com/v1"
    endpoint = urljoin(base_url.rstrip("/") + "/", "chat/completions")
    body = {
        "model": model,
        "temperature": 0.2,
        "response_format": {"type": "json_object"},
        "messages": [
            {
                "role": "system",
                "content": (
                    "You explain deterministic NILM analysis results for a university research demo. "
                    "Do not claim production accuracy. Do not invent raw data. Return strict JSON with "
                    "technical_summary, plain_language_explanation, limitations, suggested_next_experiment."
                ),
            },
            {
                "role": "user",
                "content": json.dumps(
                    {
                        "analysis_summary": analysis_summary,
                        "instructions": (
                            "Explain what the baseline did, what the metrics imply, likely issues, "
                            "and the next experiment. Keep it concise and research-oriented."
                        ),
                    },
                    ensure_ascii=False,
                ),
            },
        ],
    }
    request = Request(
        endpoint,
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {settings.ai_api_key.get_secret_value()}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    with urlopen(request, timeout=settings.ai_request_timeout_seconds) as response:
        response_body = response.read().decode("utf-8")
    parsed = json.loads(response_body)
    if not isinstance(parsed, dict):
        raise ValueError("AI provider returned a non-object response")
    return parsed


def _parse_provider_response(
    *,
    run_id: uuid.UUID,
    model: str,
    provider: str,
    raw_response: dict[str, Any],
    analysis_summary: dict[str, object],
) -> AIAnalysisExplanation:
    content = _extract_message_content(raw_response)
    if not content:
        raise ValueError("AI provider response did not include message content")
    parsed_content = json.loads(content)
    if not isinstance(parsed_content, dict):
        raise ValueError("AI provider explanation is not a JSON object")

    limitations = parsed_content.get("limitations")
    if not isinstance(limitations, list):
        limitations = []
    normalized_limitations = [str(item)[:MAX_TEXT_LENGTH] for item in limitations[:8]]
    normalized_limitations.append("AI-assisted explanation; deterministic metrics remain the source of truth.")
    normalized_limitations.append("Only compact analysis summaries were sent, not raw CSV/HDF5 data.")

    fallback = _fallback_explanation(run_id=run_id, analysis_summary=analysis_summary)
    return AIAnalysisExplanation(
        run_id=run_id,
        enabled=True,
        provider=provider,
        model=model,
        technical_summary=str(
            parsed_content.get("technical_summary") or fallback.technical_summary
        )[:MAX_TEXT_LENGTH],
        plain_language_explanation=str(
            parsed_content.get("plain_language_explanation")
            or fallback.plain_language_explanation
        )[:MAX_TEXT_LENGTH],
        limitations=normalized_limitations,
        suggested_next_experiment=str(
            parsed_content.get("suggested_next_experiment")
            or fallback.suggested_next_experiment
        )[:MAX_TEXT_LENGTH],
    )


def _extract_message_content(raw_response: dict[str, Any]) -> str | None:
    choices = raw_response.get("choices")
    if not isinstance(choices, list) or not choices:
        return None
    first_choice = choices[0]
    if not isinstance(first_choice, dict):
        return None
    message = first_choice.get("message")
    if not isinstance(message, dict):
        return None
    content = message.get("content")
    return content if isinstance(content, str) else None


def _fallback_explanation(
    *,
    run_id: uuid.UUID,
    analysis_summary: dict[str, object],
    fallback_reason: str | None = None,
) -> AIAnalysisExplanation:
    dataset = str(analysis_summary.get("dataset_label") or analysis_summary.get("dataset_id") or "dataset")
    appliance = str(analysis_summary.get("appliance_label") or analysis_summary.get("appliance") or "appliance")
    f1_score = analysis_summary.get("f1_score")
    mae_w = analysis_summary.get("mae_w")
    event_count = analysis_summary.get("event_count")
    limitations = [
        fallback_reason or "AI analysis is disabled or no API key is configured.",
        "No raw dataset rows were sent to an external model.",
        "Use deterministic metrics and event tables as the source of truth.",
    ]

    return AIAnalysisExplanation(
        run_id=run_id,
        enabled=False,
        provider="local_fallback",
        model=None,
        technical_summary=(
            f"{dataset} / {appliance}: baseline disaggregation run completed with "
            f"MAE={mae_w if mae_w is not None else 'n/a'} W, "
            f"F1={f1_score if f1_score is not None else 'n/a'}, "
            f"events={event_count if event_count is not None else 'n/a'}."
        ),
        plain_language_explanation=(
            "The deterministic baseline compared aggregate household power with the selected "
            "appliance ground truth and a threshold-step prediction. Treat the result as a "
            "pipeline and research-demo check, not as production NILM accuracy."
        ),
        limitations=limitations,
        suggested_next_experiment=(
            "Run the same appliance on a larger processed CSV window, then compare the baseline "
            "against another house or a trained model."
        ),
    )
