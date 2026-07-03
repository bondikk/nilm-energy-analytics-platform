# NILM Method Layer

VoltPulse follows a staged NILM roadmap:

```text
dataset -> preprocessing -> baseline -> prediction -> evaluation -> dashboard
```

## Sequence-to-Point Framing

The core supervised task is sequence-to-point NILM:

```text
Input:  aggregate_power[t - radius : t + radius]
Output: appliance_power[t]
```

For a 599-sample window:

```text
radius = 299
window_size = 599
```

Implemented helper:

- `app.ml.preprocessing.windowing.build_seq2point_windows`

## Baseline Before Deep Learning

The first model is deliberately simple. It detects aggregate power step changes
and maps step magnitudes into appliance ranges:

- fridge: small cyclic compressor load
- washing machine: medium flexible load
- dishwasher: medium/high cycle load
- microwave: high short load
- kettle: large resistive load

Implemented helper:

- `app.ml.models.baseline_threshold.predict_appliance_power_threshold`

This baseline is not the final NILM model. Its job is to establish the complete
pipeline and create a meaningful comparison point for ML and deep learning.

## ML Baseline Features

The planned ML classifiers can use window-level features already exposed by
`extract_window_features`:

- `mean_power`
- `max_power`
- `min_power`
- `std_power`
- `delta_power`

Next feature additions:

- rolling mean
- hour of day
- day of week
- recent event count
- previous aggregate power state

## Seq2Point CNN

After the baseline is validated, the next model should be a small Seq2Point CNN:

```text
Input: 599 aggregate samples
Output: one appliance power value at the center point
```

Initial placeholder:

- `app.ml.models.seq2point.Seq2PointModelSpec`

Expected future training flow:

1. Convert UK-DALE house files to unified CSV.
2. Normalize aggregate windows.
3. Train one model per appliance.
4. Evaluate on held-out days or houses.
5. Expose prediction files through the API/dashboard.
