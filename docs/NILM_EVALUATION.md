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

Initial API endpoint:

```text
GET /nilm/lab/catalog
GET /nilm/lab/demo?dataset=uk-dale&house_id=house-1&appliance=kettle
GET /nilm/lab/report?dataset=uk-dale&house_id=house-1&appliance=kettle
```

The catalog endpoint returns dataset, house, appliance, threshold, and baseline
model metadata. The demo endpoint returns aggregate, real appliance, predicted
appliance, and baseline evaluation metrics for the dashboard overlay. The report
endpoint returns a Markdown experiment report suitable for thesis notes,
reproducibility logs, and future commercial model audit trails.

## How To Read NILM Lab

- `Aggregate` is the whole-home active power signal.
- `Real appliance` is the appliance-level ground truth from the dataset.
- `Predicted` is the model output for the selected appliance.
- `MAE` is the average watt-level reconstruction error.
- `F1-score`, `precision`, and `recall` evaluate appliance on/off detection
  using the appliance threshold shown in the model card.

## Report Workflow

Every NILM Lab report should make the experiment reproducible:

- dataset and house
- source sample file
- appliance and on/off threshold
- model name and task
- input and output signals
- regression and classification metrics
- interpretation and known limitations

## Evaluation Rules

- Never evaluate on the same time range used to tune thresholds.
- Report per-appliance metrics before reporting aggregate averages.
- Keep baseline metrics visible after adding ML models.
- Store model configuration with each report.
