# NILM Evaluation

VoltPulse evaluates NILM models against appliance-level ground truth from public
datasets.

## Regression Metrics

For power reconstruction:

- MAE in watts
- RMSE in watts

Implemented helper:

- `app.ml.evaluation.metrics.regression_metrics`

## On/Off Classification Metrics

For appliance state detection:

- precision
- recall
- F1-score
- true positive
- false positive
- true negative
- false negative

Implemented helper:

- `app.ml.evaluation.metrics.classification_metrics`

## Report Output

`app.ml.evaluation.reports.build_evaluation_report` creates a compact report
object that can be rendered as Markdown or returned by a future API endpoint.

Example:

```md
# NILM Evaluation: kettle

- Samples: 86400
- MAE: 34.2 W
- RMSE: 151.8 W
- Precision: 0.91
- Recall: 0.84
- F1-score: 0.87
```

## Dashboard Targets

The future `NILM Lab` dashboard view should show:

- dataset selector
- house selector
- appliance selector
- aggregate power
- real appliance power
- predicted appliance power
- MAE, precision, recall, and F1-score

## Evaluation Rules

- Never evaluate on the same time range used to tune thresholds.
- Report per-appliance metrics before reporting aggregate averages.
- Keep baseline metrics visible after adding ML models.
- Store model configuration with each report.
